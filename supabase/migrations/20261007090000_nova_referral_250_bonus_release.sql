-- NOVA referral v2
-- Signup: +250 FCFA bonus for both users.
-- Referred user's confirmed deposit: move exactly 250 FCFA for both users
-- from bonus_balance to main balance.
-- Referrer deposit is not required.
-- Existing already-credited referrals are untouched.

update public.referrals
set bonus_amount=250
where status in ('pending','eligible')
  and coalesce(bonus_amount,0)<>250;

create or replace function private.nova_credit_bonus(p_user_id uuid,p_amount bigint,p_entry_type text,p_reference text,p_description text,p_related_user_id uuid default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_user_id is null or p_amount<=0 or nullif(trim(p_reference),'') is null then
    raise exception 'Invalid bonus credit';
  end if;

  -- The ledger reference is the idempotency key. Check it BEFORE touching the balance.
  if exists (
    select 1 from public.wallet_ledger
    where reference=p_reference and status='posted'
  ) then
    return;
  end if;

  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked)
  values(p_user_id,0,0,0)
  on conflict(user_id) do update
    set bonus_balance=public.wallet_balances.bonus_balance+excluded.bonus_balance,updated_at=now();

  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_user_id,posted_at)
  values(p_user_id,p_entry_type,p_amount,'posted',p_reference,p_description,p_related_user_id,now())
  on conflict(reference) do nothing;
end $;

create or replace function private.nova_transfer_referral_bonus(p_user_id uuid,p_referral_id uuid,p_amount bigint,p_role text,p_related_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_release_ref text:='REF-BONUS-RELEASE-'||p_referral_id::text||'-'||p_role;
  v_bonus_ref text:='REF-BONUS-'||p_referral_id::text||'-'||p_role;
  v_wallet public.wallet_balances%rowtype;
begin
  if p_user_id is null or p_referral_id is null or p_amount<=0 then return false; end if;
  if exists(select 1 from public.wallet_ledger where reference=v_release_ref and status='posted') then return false; end if;

  if not exists(select 1 from public.wallet_ledger where reference=v_bonus_ref and status='posted') then
    perform private.nova_credit_bonus(p_user_id,p_amount,'referral_bonus',v_bonus_ref,
      case when p_role='PARRAIN' then 'Bonus de parrainage — 250 FCFA'
           else 'Bonus de bienvenue par parrainage — 250 FCFA' end,p_related_user_id);
  end if;

  select * into v_wallet from public.wallet_balances where user_id=p_user_id for update;
  if not found or v_wallet.bonus_balance<p_amount then raise exception 'Referral bonus balance is insufficient'; end if;

  update public.wallet_balances
  set bonus_balance=bonus_balance-p_amount,balance=balance+p_amount,updated_at=now()
  where user_id=p_user_id;

  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_user_id,posted_at)
  values(p_user_id,'referral_bonus_release',p_amount,'posted',v_release_ref,
    'Transfert du bonus de parrainage vers le solde principal',p_related_user_id,now())
  on conflict(reference) do nothing;
  return true;
end $$;

create or replace function public.nova_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_code text; v_referrer_id uuid; v_referral_id uuid;
  v_ref_code text:=nullif(trim(coalesce(new.raw_user_meta_data->>'referral_code','')),'');
  v_bonus bigint:=250;
begin
  loop
    v_code:=(floor(100000+random()*900000))::bigint::text;
    exit when not exists(select 1 from public.profiles where member_code=v_code);
  end loop;

  insert into public.profiles(id,display_name,phone,country_code,member_code)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),nullif(new.phone,''),
    coalesce(new.raw_user_meta_data->>'country_code','+228'),v_code)
  on conflict(id) do update set
    display_name=coalesce(nullif(excluded.display_name,''),public.profiles.display_name),
    phone=coalesce(excluded.phone,public.profiles.phone),
    country_code=coalesce(excluded.country_code,public.profiles.country_code),
    member_code=coalesce(public.profiles.member_code,excluded.member_code),updated_at=now();

  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked)
  values(new.id,0,0,0) on conflict(user_id) do nothing;

  if v_ref_code is not null then
    select id into v_referrer_id from public.profiles
    where (member_code=v_ref_code or id::text=v_ref_code) and id<>new.id limit 1;

    if v_referrer_id is not null then
      insert into public.referrals(referrer_id,referred_user_id,bonus_amount,status)
      values(v_referrer_id,new.id,v_bonus,'pending')
      on conflict(referred_user_id) do nothing returning id into v_referral_id;

      if v_referral_id is not null then
        perform private.nova_credit_bonus(v_referrer_id,v_bonus,'referral_bonus',
          'REF-BONUS-'||v_referral_id::text||'-PARRAIN','Bonus de parrainage — 250 FCFA',new.id);
        perform private.nova_credit_bonus(new.id,v_bonus,'referral_bonus',
          'REF-BONUS-'||v_referral_id::text||'-FILLEUL','Bonus de bienvenue par parrainage — 250 FCFA',v_referrer_id);
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.nova_qualify_referrals_for_user(p_user_id uuid)
returns bigint language plpgsql security definer set search_path=''
as $$
declare
  r public.referrals%rowtype; v_count bigint:=0; child_dep boolean;
  v_referrer_released boolean; v_child_released boolean;
begin
  if p_user_id is null then return 0; end if;
  for r in
    select * from public.referrals
    where referred_user_id=p_user_id and status in ('pending','eligible')
    for update
  loop
    select exists(select 1 from public.wallet_ledger l
      where l.user_id=r.referred_user_id and l.entry_type='deposit'
        and l.status='posted' and l.amount>0) into child_dep;

    if child_dep then
      v_referrer_released:=private.nova_transfer_referral_bonus(r.referrer_id,r.id,250,'PARRAIN',r.referred_user_id);
      v_child_released:=private.nova_transfer_referral_bonus(r.referred_user_id,r.id,250,'FILLEUL',r.referrer_id);

      update public.referrals set status='credited',bonus_amount=250,
        referrer_qualified_at=coalesce(referrer_qualified_at,now()),
        referred_qualified_at=coalesce(referred_qualified_at,now())
      where id=r.id;

      if v_referrer_released or v_child_released then v_count:=v_count+1; end if;
    else
      update public.referrals set status='pending',bonus_amount=250 where id=r.id;
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.nova_reconcile_referral_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  return jsonb_build_object('ok',true,'qualified',private.nova_qualify_referrals_for_user(p_user_id));
end $$;

grant execute on function public.nova_reconcile_referral_bonus(uuid) to service_role,authenticated;
