-- Bonus/referral guard: referral bonuses are created as pending and only credited after
-- the server-side deposit qualification rule confirms both users have a posted deposit.
create or replace function public.nova_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    updated_at = now();

  insert into public.wallet_balances (user_id, balance, bonus_balance, bonus_locked)
  values (new.id, 0, 0, 0)
  on conflict (user_id) do nothing;

  if v_ref_code is not null then
    select id into v_referrer_id
      from public.profiles
     where (member_code = v_ref_code or id::text = v_ref_code)
       and id <> new.id
     limit 1;

    if v_referrer_id is not null then
      insert into public.referrals(referrer_id,referred_user_id,bonus_amount,status)
      values(v_referrer_id,new.id,v_bonus,'pending')
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;
