-- NOVA v10: identifiant membre court, parrainage 500/500 et statistiques admin.
-- À appliquer dans Supabase SQL Editor avant de déployer cette version.

alter table public.profiles add column if not exists member_code text;
create unique index if not exists profiles_member_code_unique on public.profiles(member_code) where member_code is not null;

-- Attribuer un code numérique de 6 chiffres aux comptes existants qui n'en ont pas.
do $$
declare p record; v_code text;
begin
  for p in select id from public.profiles where member_code is null or member_code !~ '^[0-9]{6}$' loop
    loop
      v_code := (floor(100000 + random() * 900000))::bigint::text;
      exit when not exists(select 1 from public.profiles where member_code=v_code);
    end loop;
    update public.profiles set member_code=v_code where id=p.id;
  end loop;
end $$;

create or replace function public.nova_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_referrer_id uuid;
  v_referral_id uuid;
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

  insert into public.wallet_balances (user_id, balance)
  values (new.id, 0) on conflict (user_id) do nothing;

  -- Le code peut être le code membre à 6 chiffres ou un ancien UUID de lien.
  if v_ref_code is not null then
    select id into v_referrer_id
      from public.profiles
     where (member_code = v_ref_code or id::text = v_ref_code)
       and id <> new.id
     limit 1;

    if v_referrer_id is not null then
      insert into public.referrals(referrer_id,referred_user_id,bonus_amount,status)
      values(v_referrer_id,new.id,v_bonus,'paid')
      on conflict (referred_user_id) do nothing
      returning id into v_referral_id;

      -- La ligne unique referrals garantit que les deux bonus ne sont crédités qu'une fois.
      if v_referral_id is not null then
        insert into public.wallet_balances(user_id,balance) values(v_referrer_id,0) on conflict(user_id) do nothing;
        update public.wallet_balances set balance=balance+v_bonus,updated_at=now() where user_id=v_referrer_id;
        update public.wallet_balances set balance=balance+v_bonus,updated_at=now() where user_id=new.id;

        insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_user_id,posted_at)
        values
          (v_referrer_id,'referral_bonus',v_bonus,'posted','REF-'||v_referral_id::text,'Bonus de parrainage pour une nouvelle inscription',new.id,now()),
          (new.id,'referral_bonus',v_bonus,'posted','REF-'||v_referral_id::text,'Bonus de bienvenue par parrainage',v_referrer_id,now());
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- RPC de statistiques globales : accès réservé au rôle serveur service_role.
create or replace function public.nova_admin_dashboard_stats()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'members_total',(select count(*) from public.profiles),
    'members_today',(select count(*) from public.profiles where created_at >= date_trunc('day',now())),
    'deposits_total',(select count(*) from public.payment_transactions),
    'deposits_confirmed',(select count(*) from public.payment_transactions where status='completed'),
    'deposits_pending',(select count(*) from public.payment_transactions where status='pending'),
    'deposits_amount',(select coalesce(sum(amount),0) from public.payment_transactions where status='completed'),
    'withdrawals_total',(select count(*) from public.withdrawal_requests),
    'withdrawals_pending',(select count(*) from public.withdrawal_requests where status='pending'),
    'withdrawals_pending_amount',(select coalesce(sum(amount),0) from public.withdrawal_requests where status='pending'),
    'withdrawals_paid_amount',(select coalesce(sum(amount),0) from public.withdrawal_requests where status='paid'),
    'investments_total',(select count(*) from public.investments),
    'investments_active',(select count(*) from public.investments where status='active'),
    'investments_amount',(select coalesce(sum(principal_amount),0) from public.investments where status in ('active','completed')),
    'projects_published',(select count(*) from public.projects where status='published'),
    'referrals_total',(select count(*) from public.referrals),
    'referral_bonuses_paid',(select coalesce(sum(bonus_amount),0) from public.referrals where status='paid')
  );
$$;
revoke all on function public.nova_admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.nova_admin_dashboard_stats() to service_role;
