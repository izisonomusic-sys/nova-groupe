create or replace function public.nova_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_code text;
  v_referrer_id uuid;
  v_ref_code text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')), '');
  v_bonus bigint := 500;
begin
  loop
    v_code := (floor(100000 + random() * 900000))::bigint::text;
    exit when not exists(select 1 from public.profiles where member_code=v_code);
  end loop;
  insert into public.profiles(id,display_name,phone,country_code,member_code)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),nullif(new.phone,''),coalesce(new.raw_user_meta_data->>'country_code','+228'),v_code)
  on conflict(id) do update set
    display_name=coalesce(nullif(excluded.display_name,''),public.profiles.display_name),
    phone=coalesce(excluded.phone,public.profiles.phone),
    country_code=coalesce(excluded.country_code,public.profiles.country_code),
    member_code=coalesce(public.profiles.member_code,excluded.member_code),
    updated_at=now();
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked)
  values(new.id,0,0,0) on conflict(user_id) do nothing;
  if v_ref_code is not null then
    select id into v_referrer_id from public.profiles
     where (member_code=v_ref_code or id::text=v_ref_code) and id<>new.id limit 1;
    if v_referrer_id is not null then
      insert into public.referrals(referrer_id,referred_user_id,bonus_amount,status)
      values(v_referrer_id,new.id,v_bonus,'pending')
      on conflict(referred_user_id) do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function private.nova_claim_daily_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  last_claim timestamptz;
  bonus bigint := 50;
  ref text := 'BONUS-' || gen_random_uuid()::text;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select max(claimed_at) into last_claim from public.daily_bonus_claims where user_id=p_user_id and status='credited';
  if last_claim is not null and last_claim > now()-interval '24 hours' then
    raise exception 'Bonus déjà réclamé. Revenez après 24 heures.';
  end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked)
  values(p_user_id,0,bonus,0)
  on conflict(user_id) do update
    set bonus_balance=public.wallet_balances.bonus_balance+bonus,updated_at=now();
  insert into public.daily_bonus_claims(user_id,amount,claimed_at,eligible_again_at,status)
  values(p_user_id,bonus,now(),now()+interval '24 hours','credited');
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at)
  values(p_user_id,'daily_bonus',bonus,'posted',ref,'Bonus de présence quotidien — portefeuille bonus',now());
  return jsonb_build_object('ok',true,'amount',bonus,
    'bonus_balance',(select bonus_balance from public.wallet_balances where user_id=p_user_id),
    'eligible_again_at',now()+interval '24 hours');
end $$;

grant execute on function public.nova_handle_new_auth_user() to service_role;
grant execute on function private.nova_claim_daily_bonus(uuid) to service_role,authenticated;
