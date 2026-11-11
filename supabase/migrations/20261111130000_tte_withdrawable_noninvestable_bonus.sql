-- TTE Energy: bonuses are withdrawable immediately but never investable.
-- New bonus credits are posted to the main wallet and mirrored in bonus_locked.
-- Historical aggregate balances are intentionally not reclassified: their remaining
-- source cannot be reconstructed safely after prior investments and withdrawals.

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
  values(p_user_id, p_amount, 0, p_amount)
  on conflict(user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        bonus_locked = public.wallet_balances.bonus_locked + excluded.bonus_locked,
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
    'Bonus de présence quotidien — retirable, non réinvestissable', now()
  )
  on conflict(reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    raise exception 'Bonus déjà enregistré';
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(p_user_id, bonus, 0, bonus)
  on conflict(user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        bonus_locked = public.wallet_balances.bonus_locked + excluded.bonus_locked,
        updated_at = now();

  insert into public.daily_bonus_claims(user_id, amount, claimed_at, eligible_again_at, status)
  values(p_user_id, bonus, now(), now() + interval '24 hours', 'credited');

  return jsonb_build_object(
    'ok', true,
    'amount', bonus,
    'balance', (select balance from public.wallet_balances where user_id = p_user_id),
    'bonus_locked', (select bonus_locked from public.wallet_balances where user_id = p_user_id),
    'eligible_again_at', now() + interval '24 hours'
  );
end;
$function$;

create or replace function private.nova_release_bonus_wallets()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  w record;
  moved bigint := 0;
  ref text;
begin
  -- Legacy bonus_balance amounts are transferred every scheduler pass, not only
  -- on Monday/Wednesday/Friday. They remain locked against reinvestment.
  for w in
    select user_id, bonus_balance
    from public.wallet_balances
    where bonus_balance > 0
    for update
  loop
    ref := 'BONUS-RELEASE-' || w.user_id::text || '-' || gen_random_uuid()::text;

    insert into public.wallet_ledger(
      user_id, entry_type, amount, status, reference, description, posted_at
    )
    values(
      w.user_id, 'adjustment', w.bonus_balance, 'posted', ref,
      'Transfert du portefeuille bonus vers le solde retirable — non réinvestissable',
      now()
    )
    on conflict(reference) do nothing;

    if found then
      update public.wallet_balances
      set balance = balance + w.bonus_balance,
          bonus_locked = bonus_locked + w.bonus_balance,
          bonus_balance = 0,
          updated_at = now()
      where user_id = w.user_id;
      moved := moved + w.bonus_balance;
    end if;
  end loop;

  return moved;
end;
$function$;

create or replace function public.nova_request_withdrawal(
  p_user_id uuid,
  p_amount bigint,
  p_country_code text,
  p_operator text,
  p_phone text,
  p_account_name text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  w public.wallet_balances%rowtype;
  v_id uuid;
  v_bonus bigint := 0;
  v_real bigint;
  v_real_available bigint;
  local_now timestamp;
  local_dow int;
  local_hour time;
  local_date date;
  today_count int;
  fee bigint;
  payout bigint;
  cc text := case upper(trim(p_country_code))
    when '+228' then 'TG' when '+226' then 'BF' when '+229' then 'BJ'
    when '+225' then 'CI' when '+221' then 'SN' when '+237' then 'CM'
    when '+223' then 'ML' else upper(trim(p_country_code)) end;
  op text := regexp_replace(lower(trim(p_operator)), '[[:space:]]+', ' ', 'g');
  has_investment boolean;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to request withdrawal for another user';
  end if;

  op := case op
    when 'togocom' then 't-money-togo' when 't-money' then 't-money-togo'
    when 'moov togo' then 'moov-togo'
    when 'orange burkina' then 'orange-money-burkina' when 'moov burkina' then 'moov-burkina-faso'
    when 'mtn bénin' then 'mtn-benin' when 'mtn benin' then 'mtn-benin'
    when 'moov bénin' then 'moov-benin' when 'moov benin' then 'moov-benin'
    when 'celtiis cash' then 'celtiis-cash'
    when 'orange ci' then 'orange-money-ci' when 'mtn ci' then 'mtn-ci'
    when 'moov ci' then 'moov-ci' when 'wave ci' then 'wave-ci' when 'djamo ci' then 'djamo-ci'
    when 'orange sn' then 'orange-money-senegal' when 'free sn' then 'free-money-senegal'
    when 'expresso' then 'expresso-senegal' when 'wave sn' then 'wave-senegal' when 'djamo sn' then 'djamo-sn'
    when 'mtn cm' then 'mtn-cameroun' when 'orange ml' then 'orange-money-mali'
    else op end;

  if p_amount < 2000 or p_amount > 5000000 then
    raise exception 'Le montant doit être compris entre 2 000 et 5 000 000 FCFA';
  end if;
  if coalesce(trim(p_phone), '') = '' or coalesce(trim(p_account_name), '') = '' then
    raise exception 'Missing withdrawal details';
  end if;
  if not (
    (cc = 'TG' and op in ('t-money-togo','moov-togo')) or
    (cc = 'BJ' and op in ('mtn-benin','moov-benin','celtiis-cash')) or
    (cc = 'CI' and op in ('mtn-ci','orange-money-ci','moov-ci','wave-ci','djamo-ci')) or
    (cc = 'BF' and op in ('orange-money-burkina','moov-burkina-faso')) or
    (cc = 'ML' and op = 'orange-money-mali') or
    (cc = 'SN' and op in ('orange-money-senegal','free-money-senegal','expresso-senegal','wave-senegal','djamo-sn')) or
    (cc = 'CM' and op = 'mtn-cameroun')
  ) then
    raise exception 'Unsupported country/operator combination';
  end if;

  local_now := now() at time zone 'Africa/Lome';
  local_dow := extract(isodow from local_now)::int;
  local_hour := local_now::time;
  local_date := local_now::date;
  if local_hour < time '07:00' or local_hour >= time '18:00' then
    raise exception 'Les retraits sont disponibles tous les jours de 07 h à 18 h (heure du Togo)';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select count(*) into today_count
  from public.withdrawal_requests
  where user_id = p_user_id
    and (created_at at time zone 'Africa/Lome')::date = local_date;
  if today_count >= 4 then raise exception 'Limite atteinte : 4 retraits maximum par jour'; end if;

  select exists(select 1 from public.investments where user_id = p_user_id) into has_investment;
  if not has_investment then
    raise exception 'Vous devez investir dans au moins un projet avant de demander un retrait';
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(p_user_id, 0, 0, 0)
  on conflict(user_id) do nothing;

  select * into w
  from public.wallet_balances
  where user_id = p_user_id
  for update;
  if not found then raise exception 'Wallet not found'; end if;

  -- Bonuses are consumed first by a withdrawal, but are excluded from
  -- investment purchasing by nova_create_investment's balance - bonus_locked rule.
  if p_amount > w.balance then raise exception 'Insufficient balance'; end if;
  v_real_available := greatest(0, w.balance - coalesce(w.bonus_locked, 0));
  v_bonus := least(p_amount, greatest(0, least(coalesce(w.bonus_locked, 0), w.balance)));
  v_real := p_amount - v_bonus;
  if v_real > v_real_available then raise exception 'Insufficient balance'; end if;

  fee := ceil(p_amount * 0.15)::bigint;
  payout := p_amount - fee;
  if payout <= 0 then raise exception 'Montant net invalide après frais'; end if;

  update public.wallet_balances
  set balance = balance - p_amount,
      bonus_locked = greatest(0, bonus_locked - v_bonus),
      updated_at = now()
  where user_id = p_user_id;

  insert into public.withdrawal_requests(
    user_id, amount, country_code, operator, phone, account_name, status,
    bonus_amount, real_amount, fee_amount, payout_amount
  )
  values(
    p_user_id, p_amount, cc, op, trim(p_phone), trim(p_account_name), 'pending',
    v_bonus, v_real, fee, payout
  )
  returning id into v_id;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, posted_at
  )
  values(
    p_user_id, 'withdrawal', -p_amount, 'posted', v_id::text,
    'Retrait réservé : montant ' || p_amount || ' FCFA, bonus ' || v_bonus ||
    ' FCFA, frais 15 % (' || fee || ' FCFA), net à payer ' || payout || ' FCFA',
    now()
  );

  return v_id;
end;
$function$;

grant execute on function public.nova_request_withdrawal(uuid,bigint,text,text,text,text) to service_role;


-- Atomically claim exactly one payout provider attempt. This prevents concurrent
-- admin approvals/retries from creating two payouts. A confirmed LomoPay failure
-- may transition to PayDunya; an ambiguous state may never transition.
create or replace function public.nova_claim_withdrawal_provider_attempt(
  p_withdrawal_id uuid,
  p_provider text,
  p_expected_provider text,
  p_expected_status text,
  p_provider_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  wr public.withdrawal_requests%rowtype;
begin
  if p_provider not in ('lomopay', 'paydunya') then
    raise exception 'Unsupported withdrawal provider';
  end if;

  select * into wr
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status in ('paid', 'rejected', 'cancelled') then return false; end if;
  if wr.admin_approved_at is null then raise exception 'Admin approval required'; end if;

  if wr.provider is distinct from p_expected_provider
     or wr.provider_status is distinct from p_expected_status then
    return false;
  end if;

  -- A token from LomoPay is allowed to be replaced only after the provider has
  -- explicitly confirmed failure. Preserve the old attempt in provider_payload.
  if wr.provider_token is not null
     and not (p_expected_provider = 'lomopay' and p_expected_status = 'failed_confirmed') then
    return false;
  end if;

  update public.withdrawal_requests
  set provider = p_provider,
      provider_status = 'initiating',
      provider_token = null,
      provider_disburse_id = null,
      provider_transaction_id = null,
      provider_payload = coalesce(p_provider_payload, '{}'::jsonb),
      updated_at = now()
  where id = p_withdrawal_id;

  return true;
end;
$function$;

revoke all on function public.nova_claim_withdrawal_provider_attempt(uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.nova_claim_withdrawal_provider_attempt(uuid,text,text,text,jsonb)
  to service_role;


-- Referral qualification used to move referral bonuses from bonus_balance into
-- the main wallet. New credits are already posted directly to balance and locked,
-- so this function now supports both new credits and any legacy bonus_balance.
create or replace function private.nova_transfer_referral_bonus(
  p_user_id uuid,
  p_referral_id uuid,
  p_amount bigint,
  p_role text,
  p_related_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_release_ref text := 'REF-BONUS-RELEASE-' || p_referral_id::text || '-' || p_role;
  v_bonus_ref text := 'REF-BONUS-' || p_referral_id::text || '-' || p_role;
  v_wallet public.wallet_balances%rowtype;
  v_legacy_to_release bigint := 0;
begin
  if p_user_id is null or p_referral_id is null or p_amount <= 0 then
    return false;
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where reference = v_release_ref and status = 'posted'
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.wallet_ledger
    where reference = v_bonus_ref and status = 'posted'
  ) then
    perform private.nova_credit_bonus(
      p_user_id, p_amount, 'referral_bonus', v_bonus_ref,
      case when p_role = 'PARRAIN' then 'Bonus de parrainage — 250 FCFA'
           else 'Bonus de bienvenue par parrainage — 250 FCFA' end,
      p_related_user_id
    );
  end if;

  select * into v_wallet
  from public.wallet_balances
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Referral bonus wallet not found';
  end if;

  -- Legacy balances are released immediately and remain non-investable.
  -- New bonus credits already have bonus_balance=0 and bonus_locked=p_amount.
  v_legacy_to_release := least(coalesce(v_wallet.bonus_balance, 0), p_amount);
  if v_legacy_to_release > 0 then
    update public.wallet_balances
    set balance = balance + v_legacy_to_release,
        bonus_balance = bonus_balance - v_legacy_to_release,
        bonus_locked = bonus_locked + v_legacy_to_release,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, related_user_id, posted_at
  )
  values(
    p_user_id, 'referral_bonus_release', p_amount, 'posted', v_release_ref,
    'Bonus de parrainage libéré immédiatement — retirable, non réinvestissable',
    p_related_user_id, now()
  )
  on conflict(reference) do nothing;

  return found;
end;
$function$;
