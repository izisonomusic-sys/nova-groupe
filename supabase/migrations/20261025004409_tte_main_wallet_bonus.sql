create or replace function private.nova_credit_bonus(
  p_user_id uuid,
  p_amount bigint,
  p_entry_type text,
  p_reference text,
  p_description text,
  p_related_user_id uuid default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ledger_id uuid;
begin
  if p_user_id is null or p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'Invalid bonus credit';
  end if;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, related_user_id, posted_at
  )
  values (
    p_user_id, p_entry_type, p_amount, 'posted', p_reference, p_description,
    p_related_user_id, pg_catalog.now()
  )
  on conflict(reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return;
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(p_user_id, p_amount, 0, 0)
  on conflict(user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        updated_at = pg_catalog.now();
end;
$function$;

create or replace function private.nova_claim_daily_bonus(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  last_claim timestamptz;
  bonus bigint := 50;
  ref text := 'BONUS-' || gen_random_uuid()::text;
  v_ledger_id uuid;
begin
  if p_user_id is null then
    raise exception 'Invalid user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select max(claimed_at) into last_claim
  from public.daily_bonus_claims
  where user_id = p_user_id and status = 'credited';

  if last_claim is not null and last_claim > now() - interval '24 hours' then
    raise exception 'Bonus déjà réclamé. Revenez après 24 heures.';
  end if;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, posted_at
  )
  values(
    p_user_id, 'daily_bonus', bonus, 'posted', ref,
    'Bonus de présence quotidien crédité sur le solde principal', now()
  )
  on conflict(reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    raise exception 'Bonus déjà enregistré';
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(p_user_id, bonus, 0, 0)
  on conflict(user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        updated_at = now();

  insert into public.daily_bonus_claims(user_id, amount, claimed_at, eligible_again_at, status)
  values(p_user_id, bonus, now(), now() + interval '24 hours', 'credited');

  return jsonb_build_object(
    'ok', true,
    'amount', bonus,
    'balance', (select balance from public.wallet_balances where user_id = p_user_id),
    'eligible_again_at', now() + interval '24 hours'
  );
end
$function$;

with candidates as (
  select user_id, bonus_balance
  from public.wallet_balances
  where bonus_balance > 0
),
logged as (
  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, posted_at
  )
  select
    user_id,
    'adjustment',
    bonus_balance,
    'posted',
    'BONUS-MAIN-MIGRATION-20261025-' || user_id::text,
    'Transfert unique du portefeuille bonus vers le solde principal',
    now()
  from candidates
  on conflict(reference) do nothing
  returning user_id, amount
)
update public.wallet_balances as w
set balance = w.balance + logged.amount,
    bonus_balance = greatest(0, w.bonus_balance - logged.amount),
    updated_at = now()
from logged
where w.user_id = logged.user_id;
