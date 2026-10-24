-- TTE Energy financial reliability: qualify referrals at the moment a real deposit is posted,
-- and make daily investment-income credits atomic and idempotent.
-- Existing wallet balances and historical ledger entries are deliberately untouched.

create or replace function private.nova_on_qualifying_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type = 'deposit'
     and new.status = 'posted'
     and new.amount >= 3000
     and new.user_id is not null then
    perform private.nova_qualify_referrals_for_user(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists nova_qualify_referrals_after_deposit on public.wallet_ledger;
create trigger nova_qualify_referrals_after_deposit
after insert or update of entry_type, status, amount on public.wallet_ledger
for each row
when (new.entry_type = 'deposit' and new.status = 'posted' and new.amount >= 3000)
execute function private.nova_on_qualifying_deposit();

revoke all on function private.nova_on_qualifying_deposit() from public, anon, authenticated;

create or replace function public.nova_credit_investment_income(
  p_user_id uuid,
  p_investment_id uuid,
  p_amount bigint,
  p_reference text,
  p_description text,
  p_posted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_investment public.investments%rowtype;
  v_ledger_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_user_id is null or p_investment_id is null or p_amount <= 0
     or nullif(trim(p_reference), '') is null then
    raise exception 'Invalid investment income credit';
  end if;

  select * into v_investment
  from public.investments
  where id = p_investment_id and user_id = p_user_id
    and status in ('active', 'completed')
  for update;

  if not found then
    raise exception 'Investment not found or not eligible';
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values (p_user_id, 0, 0, 0)
  on conflict (user_id) do nothing;

  -- Unique ledger reference is the idempotency key; wallet and ledger commit together.
  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description,
    related_investment_id, posted_at
  )
  values (
    p_user_id, 'investment_income', p_amount, 'posted', p_reference,
    coalesce(p_description, 'Gain quotidien TTE Energy'),
    p_investment_id, coalesce(p_posted_at, pg_catalog.now())
  )
  on conflict (reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('ok', true, 'credited', false, 'reason', 'already_credited');
  end if;

  update public.wallet_balances
  set balance = balance + p_amount,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'credited', true, 'amount', p_amount);
end;
$$;

revoke all on function public.nova_credit_investment_income(uuid,uuid,bigint,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.nova_credit_investment_income(uuid,uuid,bigint,text,text,timestamptz) to service_role;
