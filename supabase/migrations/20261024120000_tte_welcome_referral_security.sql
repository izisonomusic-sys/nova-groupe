-- TTE Energy: secure welcome and referral credits.
-- Existing accounts/balances are not deleted or reset by this migration.
-- Welcome credit: 800 FCFA in bonus_balance once per new auth user.
-- Referral credit: 400 FCFA to each party in main balance after one confirmed
-- deposit ledger entry by the referred user with amount >= 3000 FCFA.

create or replace function private.nova_credit_bonus(
  p_user_id uuid,
  p_amount bigint,
  p_entry_type text,
  p_reference text,
  p_description text,
  p_related_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_id uuid;
begin
  if p_user_id is null or p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'Invalid bonus credit';
  end if;

  -- Insert the unique ledger reference FIRST. A duplicate reference must never
  -- increase the wallet balance a second time.
  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description,
    related_user_id, posted_at
  )
  values (
    p_user_id, p_entry_type, p_amount, 'posted', p_reference, p_description,
    p_related_user_id, pg_catalog.now()
  )
  on conflict (reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return;
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values (p_user_id, 0, p_amount, 0)
  on conflict (user_id) do update
    set bonus_balance = public.wallet_balances.bonus_balance + excluded.bonus_balance,
        updated_at = pg_catalog.now();
end;
$$;

create or replace function private.nova_credit_main(
  p_user_id uuid,
  p_amount bigint,
  p_entry_type text,
  p_reference text,
  p_description text,
  p_related_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_id uuid;
begin
  if p_user_id is null or p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'Invalid main-wallet credit';
  end if;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description,
    related_user_id, posted_at
  )
  values (
    p_user_id, p_entry_type, p_amount, 'posted', p_reference, p_description,
    p_related_user_id, pg_catalog.now()
  )
  on conflict (reference) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return;
  end if;

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values (p_user_id, p_amount, 0, 0)
  on conflict (user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        updated_at = pg_catalog.now();
end;
$$;

revoke all on function private.nova_credit_main(uuid,bigint,text,text,text,uuid) from public, anon, authenticated;
revoke all on function private.nova_credit_bonus(uuid,bigint,text,text,text,uuid) from public, anon, authenticated;

create or replace function private.nova_qualify_referrals_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.referrals%rowtype;
  v_count bigint := 0;
  v_qualifying_deposit boolean;
  v_ref_old_paid boolean;
  v_child_old_paid boolean;
begin
  if p_user_id is null then return 0; end if;

  for r in
    select *
    from public.referrals
    where (referrer_id = p_user_id or referred_user_id = p_user_id)
      and status in ('pending','eligible')
    for update
  loop
    -- Require one actual posted deposit of at least 3,000 FCFA by the referred
    -- member; registration alone and smaller deposits do not qualify.
    select exists (
      select 1
      from public.wallet_ledger l
      where l.user_id = r.referred_user_id
        and l.entry_type = 'deposit'
        and l.status = 'posted'
        and l.amount >= 3000
    ) into v_qualifying_deposit;

    if not v_qualifying_deposit then
      update public.referrals set status = 'pending'
      where id = r.id and status <> 'credited';
      continue;
    end if;

    -- Protect historical referrals that were already paid under legacy reference
    -- formats from receiving the same reward again.
    select exists (
      select 1 from public.wallet_ledger
      where status = 'posted'
        and reference in (
          'REF-' || r.id::text || '-PARRAIN',
          'REF-BONUS-' || r.id::text || '-PARRAIN',
          'REFERRAL-400-' || r.id::text || '-PARRAIN'
        )
    ) into v_ref_old_paid;

    select exists (
      select 1 from public.wallet_ledger
      where status = 'posted'
        and reference in (
          'REF-' || r.id::text || '-FILLEUL',
          'REF-BONUS-' || r.id::text || '-FILLEUL',
          'REFERRAL-400-' || r.id::text || '-FILLEUL'
        )
    ) into v_child_old_paid;

    if not v_ref_old_paid then
      perform private.nova_credit_main(
        r.referrer_id, 400, 'referral_commission',
        'REFERRAL-400-' || r.id::text || '-PARRAIN',
        'Commission de parrainage TTE Energy après dépôt confirmé >= 3000 FCFA',
        r.referred_user_id
      );
    end if;

    if not v_child_old_paid then
      perform private.nova_credit_main(
        r.referred_user_id, 400, 'referral_reward',
        'REFERRAL-400-' || r.id::text || '-FILLEUL',
        'Récompense filleul TTE Energy après dépôt confirmé >= 3000 FCFA',
        r.referrer_id
      );
    end if;

    update public.referrals
    set status = 'credited',
        bonus_amount = 400,
        referrer_qualified_at = coalesce(referrer_qualified_at, pg_catalog.now()),
        referred_qualified_at = coalesce(referred_qualified_at, pg_catalog.now())
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.nova_reconcile_referral_bonus(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'User ID required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to reconcile another user';
  end if;
  return jsonb_build_object(
    'ok', true,
    'qualified', private.nova_qualify_referrals_for_user(p_user_id)
  );
end;
$$;

revoke all on function public.nova_reconcile_referral_bonus(uuid) from public, anon;
grant execute on function public.nova_reconcile_referral_bonus(uuid) to authenticated, service_role;

create or replace function public.nova_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referrer_id uuid;
  v_ref_code text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')), '');
  v_referral_bonus bigint := 400;
begin
  loop
    v_code := (floor(100000 + random() * 900000))::bigint::text;
    exit when not exists(select 1 from public.profiles where member_code = v_code);
  end loop;

  insert into public.profiles (id, display_name, phone, country_code, member_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'country_code', '+228'),
    v_code
  )
  on conflict (id) do update set
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    member_code = coalesce(public.profiles.member_code, excluded.member_code),
    updated_at = pg_catalog.now();

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(new.id, 0, 0, 0)
  on conflict(user_id) do nothing;

  if v_ref_code is not null then
    select id into v_referrer_id
    from public.profiles
    where (member_code = v_ref_code or id::text = v_ref_code)
      and id <> new.id
    limit 1;

    if v_referrer_id is not null then
      insert into public.referrals(referrer_id, referred_user_id, bonus_amount, status)
      values(v_referrer_id, new.id, v_referral_bonus, 'pending')
      on conflict(referred_user_id) do nothing;
    end if;
  end if;

  -- This trigger fires for newly created auth users only. The deterministic
  -- reference makes the 800 FCFA welcome credit idempotent.
  perform private.nova_credit_bonus(
    new.id, 800, 'welcome_bonus',
    'WELCOME-800-' || new.id::text,
    'Bonus de bienvenue TTE Energy',
    null
  );

  return new;
end;
$$;

-- No existing wallet is reset; no existing user is deleted or suspended here.
