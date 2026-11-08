-- Prevent duplicate investment debits when a browser retries after a timeout
-- or when the same confirmation is submitted from multiple tabs.
alter table public.investments
  add column if not exists request_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investments'::regclass
      and conname = 'investments_request_key_uuid_check'
  ) then
    alter table public.investments
      add constraint investments_request_key_uuid_check
      check (
        request_key is null
        or request_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      );
  end if;
end $$;

create unique index if not exists investments_user_request_key_uidx
  on public.investments(user_id, request_key)
  where request_key is not null;

create or replace function private.nova_create_investment(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  p public.projects%rowtype;
  w public.wallet_balances%rowtype;
  inv public.investments%rowtype;
  ref text;
  new_balance bigint;
  investable_balance bigint;
begin
  if p_user_id is null or p_project_id is null
     or nullif(trim(p_request_key), '') is null
     or length(p_request_key) > 64
     or p_request_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid investment request';
  end if;

  -- Serialize retries for the same member/request before checking the key.
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_request_key, 0)
  );

  select * into inv
  from public.investments
  where user_id = p_user_id and request_key = p_request_key;

  if found then
    if inv.project_id <> p_project_id then
      raise exception 'Idempotency key already used for another project';
    end if;
    select balance into new_balance
    from public.wallet_balances
    where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'investment_id', inv.id,
      'amount', inv.principal_amount,
      'new_balance', coalesce(new_balance, 0),
      'ends_at', inv.ends_at
    );
  end if;

  select * into p
  from public.projects
  where id = p_project_id
  for update;

  if not found then raise exception 'Project not found'; end if;
  if p.status <> 'published' then raise exception 'Project is not available'; end if;
  if p.minimum_amount <= 0 or p.daily_return_amount <= 0 or p.duration_days <= 0 then
    raise exception 'Invalid project terms';
  end if;

  select * into w
  from public.wallet_balances
  where user_id = p_user_id
  for update;

  if not found then raise exception 'Wallet not found'; end if;

  investable_balance := w.balance - coalesce(w.bonus_locked, 0);
  if investable_balance < p.minimum_amount then
    raise exception 'Solde insuffisant';
  end if;

  insert into public.investments(
    user_id, project_id, principal_amount, status, started_at, ends_at,
    daily_return_amount, duration_days, request_key
  )
  values(
    p_user_id, p.id, p.minimum_amount, 'active', now(),
    now() + make_interval(days => p.duration_days),
    p.daily_return_amount, p.duration_days, p_request_key
  )
  returning * into inv;

  update public.wallet_balances
  set balance = balance - p.minimum_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into new_balance;

  ref := 'INVEST-' || inv.id::text;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description,
    related_investment_id, posted_at
  )
  values(
    p_user_id, 'investment_debit', -p.minimum_amount, 'posted', ref,
    'Débit pour investissement: ' || p.title, inv.id, now()
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'investment_id', inv.id,
    'amount', p.minimum_amount,
    'new_balance', new_balance,
    'ends_at', inv.ends_at
  );
end;
$function$;

revoke all on function private.nova_create_investment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.nova_create_investment(uuid, uuid, text) to service_role;

create or replace function public.nova_create_investment(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text
)
returns jsonb
language sql
set search_path to 'public', 'private'
as $function$
  select private.nova_create_investment(p_user_id, p_project_id, p_request_key);
$function$;

revoke all on function public.nova_create_investment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.nova_create_investment(uuid, uuid, text) to service_role;
