create or replace function private.nova_qualify_referrals_for_user(p_user_id uuid)
returns bigint language plpgsql security definer set search_path=''
as $$
declare r public.referrals%rowtype; v_count bigint:=0; ref_dep boolean; child_dep boolean; ref_bonus_ref text; child_bonus_ref text; legacy_ref_bonus_ref text; legacy_child_bonus_ref text;
begin
  if p_user_id is null then return 0; end if;
  for r in select * from public.referrals where (referrer_id=p_user_id or referred_user_id=p_user_id) and status in ('pending','eligible','credited') for update loop
    select exists(select 1 from public.wallet_ledger l where l.user_id=r.referrer_id and l.entry_type='deposit' and l.status='posted' and l.amount>0) into ref_dep;
    select exists(select 1 from public.wallet_ledger l where l.user_id=r.referred_user_id and l.entry_type='deposit' and l.status='posted' and l.amount>0) into child_dep;
    legacy_ref_bonus_ref:='REF-'||r.id::text||'-PARRAIN'; legacy_child_bonus_ref:='REF-'||r.id::text||'-FILLEUL';
    ref_bonus_ref:='REF-BONUS-'||r.id::text||'-PARRAIN'; child_bonus_ref:='REF-BONUS-'||r.id::text||'-FILLEUL';
    if ref_dep and child_dep then
      if not exists(select 1 from public.wallet_ledger where reference in (legacy_ref_bonus_ref,ref_bonus_ref) and status='posted') then perform private.nova_credit_bonus(r.referrer_id,r.bonus_amount,'referral_bonus',ref_bonus_ref,'Bonus de parrainage — conditions de dépôt remplies',r.referred_user_id); end if;
      if not exists(select 1 from public.wallet_ledger where reference in (legacy_child_bonus_ref,child_bonus_ref) and status='posted') then perform private.nova_credit_bonus(r.referred_user_id,r.bonus_amount,'referral_bonus',child_bonus_ref,'Bonus de bienvenue — conditions de dépôt remplies',r.referrer_id); end if;
      update public.referrals set status='credited',referrer_qualified_at=coalesce(referrer_qualified_at,now()),referred_qualified_at=coalesce(referred_qualified_at,now()) where id=r.id;
      v_count:=v_count+1;
    elsif ref_dep or child_dep then
      update public.referrals set status='eligible',referrer_qualified_at=case when ref_dep then coalesce(referrer_qualified_at,now()) else referrer_qualified_at end,referred_qualified_at=case when child_dep then coalesce(referred_qualified_at,now()) else referred_qualified_at end where id=r.id;
    end if;
  end loop;
  return v_count;
end $$;