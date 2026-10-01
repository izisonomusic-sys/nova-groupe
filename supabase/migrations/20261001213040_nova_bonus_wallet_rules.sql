alter table public.wallet_balances
  add column if not exists bonus_balance bigint not null default 0,
  add column if not exists bonus_locked bigint not null default 0;

alter table public.withdrawal_requests
  add column if not exists bonus_amount bigint not null default 0,
  add column if not exists real_amount bigint not null default 0;

create index if not exists idx_wallet_balances_bonus_balance on public.wallet_balances(bonus_balance) where bonus_balance > 0;

create or replace function private.nova_credit_bonus(p_user_id uuid,p_amount bigint,p_entry_type text,p_reference text,p_description text,p_related_user_id uuid default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_user_id is null or p_amount <= 0 then raise exception 'Invalid bonus credit'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(p_user_id,0,p_amount,0)
  on conflict(user_id) do update set bonus_balance=public.wallet_balances.bonus_balance+excluded.bonus_balance,updated_at=now();
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_user_id,posted_at)
  values(p_user_id,p_entry_type,p_amount,'posted',p_reference,p_description,p_related_user_id,now()) on conflict(reference) do nothing;
end $$;

create or replace function private.nova_qualify_referrals_for_user(p_user_id uuid)
returns bigint language plpgsql security definer set search_path=''
as $$
declare r public.referrals%rowtype; v_count bigint:=0; ref_dep boolean; child_dep boolean; ref_bonus_ref text; child_bonus_ref text;
begin
  if p_user_id is null then return 0; end if;
  for r in select * from public.referrals where (referrer_id=p_user_id or referred_user_id=p_user_id) and status in ('pending','eligible','credited') for update loop
    select exists(select 1 from public.wallet_ledger l where l.user_id=r.referrer_id and l.entry_type='deposit' and l.status='posted' and l.amount>0) into ref_dep;
    select exists(select 1 from public.wallet_ledger l where l.user_id=r.referred_user_id and l.entry_type='deposit' and l.status='posted' and l.amount>0) into child_dep;
    if ref_dep and child_dep then
      ref_bonus_ref:='REF-BONUS-'||r.id::text||'-PARRAIN'; child_bonus_ref:='REF-BONUS-'||r.id::text||'-FILLEUL';
      if not exists(select 1 from public.wallet_ledger where reference=ref_bonus_ref and status='posted') then
        perform private.nova_credit_bonus(r.referrer_id,r.bonus_amount,'referral_bonus',ref_bonus_ref,'Bonus de parrainage — conditions de dépôt remplies',r.referred_user_id);
      end if;
      if not exists(select 1 from public.wallet_ledger where reference=child_bonus_ref and status='posted') then
        perform private.nova_credit_bonus(r.referred_user_id,r.bonus_amount,'referral_bonus',child_bonus_ref,'Bonus de bienvenue — conditions de dépôt remplies',r.referrer_id);
      end if;
      update public.referrals set status='credited',referrer_qualified_at=coalesce(referrer_qualified_at,now()),referred_qualified_at=coalesce(referred_qualified_at,now()) where id=r.id;
      v_count:=v_count+1;
    elsif ref_dep or child_dep then
      update public.referrals set status='eligible',
        referrer_qualified_at=case when ref_dep then coalesce(referrer_qualified_at,now()) else referrer_qualified_at end,
        referred_qualified_at=case when child_dep then coalesce(referred_qualified_at,now()) else referred_qualified_at end where id=r.id;
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.nova_reconcile_referral_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin return jsonb_build_object('ok',true,'qualified',private.nova_qualify_referrals_for_user(p_user_id)); end $$;
grant execute on function public.nova_reconcile_referral_bonus(uuid) to service_role,authenticated;

create or replace function public.nova_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_code text; v_referrer_id uuid; v_ref_code text:=nullif(trim(coalesce(new.raw_user_meta_data->>'referral_code','')),''); v_bonus bigint:=500;
begin
  loop v_code:=(floor(100000+random()*900000))::bigint::text; exit when not exists(select 1 from public.profiles where member_code=v_code); end loop;
  insert into public.profiles(id,display_name,phone,country_code,member_code)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),nullif(new.phone,''),coalesce(new.raw_user_meta_data->>'country_code','+228'),v_code)
  on conflict(id) do update set display_name=coalesce(nullif(excluded.display_name,''),public.profiles.display_name),phone=coalesce(excluded.phone,public.profiles.phone),country_code=coalesce(excluded.country_code,public.profiles.country_code),member_code=coalesce(public.profiles.member_code,excluded.member_code),updated_at=now();
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(new.id,0,0,0) on conflict(user_id) do nothing;
  if v_ref_code is not null then
    select id into v_referrer_id from public.profiles where (member_code=v_ref_code or id::text=v_ref_code) and id<>new.id limit 1;
    if v_referrer_id is not null then
      insert into public.referrals(referrer_id,referred_user_id,bonus_amount,status) values(v_referrer_id,new.id,v_bonus,'pending') on conflict(referred_user_id) do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function private.nova_claim_daily_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare last_claim timestamptz; bonus bigint:=50; ref text:='BONUS-'||gen_random_uuid()::text;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select max(claimed_at) into last_claim from public.daily_bonus_claims where user_id=p_user_id and status='credited';
  if last_claim is not null and last_claim>now()-interval '24 hours' then raise exception 'Bonus déjà réclamé. Revenez après 24 heures.'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(p_user_id,0,bonus,0)
  on conflict(user_id) do update set bonus_balance=public.wallet_balances.bonus_balance+bonus,updated_at=now();
  insert into public.daily_bonus_claims(user_id,amount,claimed_at,eligible_again_at,status) values(p_user_id,bonus,now(),now()+interval '24 hours','credited');
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at) values(p_user_id,'daily_bonus',bonus,'posted',ref,'Bonus de présence quotidien — portefeuille bonus',now());
  return jsonb_build_object('ok',true,'amount',bonus,'bonus_balance',(select bonus_balance from public.wallet_balances where user_id=p_user_id),'eligible_again_at',now()+interval '24 hours');
end $$;

create or replace function public.nova_confirm_paydunya_payment(p_payment_id uuid,p_provider_token text,p_paid_amount bigint,p_provider_payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare tx public.payment_transactions%rowtype;
begin
  if nullif(trim(p_provider_token),'') is null then raise exception 'Payment provider token is required'; end if;
  select * into tx from public.payment_transactions where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if tx.provider<>'paydunya' then raise exception 'Invalid provider'; end if;
  if tx.provider_token is not null and tx.provider_token<>p_provider_token then raise exception 'Payment token mismatch'; end if;
  if tx.amount<>p_paid_amount then raise exception 'Payment amount mismatch'; end if;
  if tx.status='completed' then return; end if;
  if tx.status<>'pending' then raise exception 'Payment is not pending'; end if;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at) values(tx.user_id,'deposit',p_paid_amount,'posted',tx.reference,'Recharge confirmée par PayDunya',now());
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(tx.user_id,p_paid_amount,0,0)
  on conflict(user_id) do update set balance=public.wallet_balances.balance+excluded.balance,updated_at=now();
  update public.payment_transactions set status='completed',provider_token=p_provider_token,provider_payload=p_provider_payload,completed_at=now() where id=p_payment_id;
  perform private.nova_qualify_referrals_for_user(tx.user_id);
end $$;

create or replace function private.nova_create_investment(p_user_id uuid,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private'
as $$
declare p public.projects%rowtype; w public.wallet_balances%rowtype; inv public.investments%rowtype; ref text:='INVEST-'||gen_random_uuid()::text; new_balance bigint; investable_balance bigint;
begin
  if p_user_id is null or p_project_id is null then raise exception 'Invalid investment request'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if p.status<>'published' then raise exception 'Project is not available'; end if;
  if p.minimum_amount<=0 then raise exception 'Invalid project amount'; end if;
  select * into w from public.wallet_balances where user_id=p_user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  investable_balance:=w.balance-coalesce(w.bonus_locked,0);
  if investable_balance<p.minimum_amount then raise exception 'Solde insuffisant'; end if;
  insert into public.investments(user_id,project_id,principal_amount,status,started_at,ends_at) values(p_user_id,p.id,p.minimum_amount,'active',now(),now()+make_interval(days=>p.duration_days)) returning * into inv;
  update public.wallet_balances set balance=balance-p.minimum_amount,updated_at=now() where user_id=p_user_id returning balance into new_balance;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_investment_id,posted_at) values(p_user_id,'investment_debit',-p.minimum_amount,'posted',ref,'Débit pour investissement: '||p.title,inv.id,now());
  return jsonb_build_object('ok',true,'investment_id',inv.id,'amount',p.minimum_amount,'new_balance',new_balance,'ends_at',inv.ends_at);
end $$;

create or replace function private.nova_release_bonus_wallets()
returns bigint language plpgsql security definer set search_path=''
as $$
declare w record; moved bigint:=0; ref text;
begin
  if extract(isodow from (now() at time zone 'Africa/Lome')) not in (1,3,5) then return 0; end if;
  for w in select user_id,bonus_balance from public.wallet_balances where bonus_balance>0 for update loop
    ref:='BONUS-RELEASE-'||w.user_id::text||'-'||to_char((now() at time zone 'Africa/Lome')::date,'YYYYMMDD');
    insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at)
    values(w.user_id,'bonus_release',w.bonus_balance,'posted',ref,'Transfert automatique du portefeuille bonus vers le solde disponible — non investissable',now())
    on conflict(reference) do nothing;
    if found then
      update public.wallet_balances set balance=balance+w.bonus_balance,bonus_locked=bonus_locked+w.bonus_balance,bonus_balance=0,updated_at=now() where user_id=w.user_id;
      moved:=moved+w.bonus_balance;
    end if;
  end loop;
  return moved;
end $$;
grant execute on function private.nova_release_bonus_wallets() to service_role;

create or replace function public.nova_request_withdrawal(p_user_id uuid,p_amount bigint,p_country_code text,p_operator text,p_phone text,p_account_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare w public.wallet_balances%rowtype; v_id uuid; v_bonus bigint:=0; v_real bigint; local_dow int;
begin
  if p_amount<1000 or p_amount>5000000 then raise exception 'Invalid withdrawal amount'; end if;
  if coalesce(trim(p_country_code),'')='' or coalesce(trim(p_operator),'')='' or coalesce(trim(p_phone),'')='' or coalesce(trim(p_account_name),'')='' then raise exception 'Missing withdrawal details'; end if;
  local_dow:=extract(isodow from (now() at time zone 'Africa/Lome'))::int;
  if local_dow=7 then raise exception 'Withdrawals are closed on Sunday'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(p_user_id,0,0,0) on conflict(user_id) do nothing;
  select * into w from public.wallet_balances where user_id=p_user_id for update;
  if w.balance<p_amount then raise exception 'Insufficient balance'; end if;
  if w.bonus_locked>0 then
    if local_dow not in (1,3,5) then raise exception 'Bonus withdrawals are available Monday, Wednesday and Friday'; end if;
    if p_amount<w.bonus_locked then raise exception 'Pour retirer le bonus, la demande doit inclure la totalité du bonus disponible'; end if;
    v_bonus:=w.bonus_locked;
  end if;
  v_real:=p_amount-v_bonus;
  update public.wallet_balances set balance=balance-p_amount,bonus_locked=bonus_locked-v_bonus,updated_at=now() where user_id=p_user_id;
  insert into public.withdrawal_requests(user_id,amount,country_code,operator,phone,account_name,status,bonus_amount,real_amount) values(p_user_id,p_amount,trim(p_country_code),trim(p_operator),trim(p_phone),trim(p_account_name),'pending',v_bonus,v_real) returning id into v_id;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at) values(p_user_id,'withdrawal',-p_amount,'posted',v_id::text,case when v_bonus>0 then 'Retrait réservé — bonus + solde réel' else 'Montant réservé pour une demande de retrait' end,now());
  return v_id;
end $$;

create or replace function public.nova_finalize_withdrawal_failure(p_withdrawal_id uuid,p_provider_token text,p_provider_payload jsonb,p_failure_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare wr public.withdrawal_requests%rowtype; refund_reference text;
begin
  select * into wr from public.withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status in ('paid','rejected','cancelled') then return; end if;
  if wr.provider_token is not null and nullif(trim(p_provider_token),'') is not null and wr.provider_token<>p_provider_token then raise exception 'Provider disbursement token mismatch'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(wr.user_id,0,0,0) on conflict(user_id) do nothing;
  update public.wallet_balances set balance=balance+wr.amount,bonus_locked=bonus_locked+coalesce(wr.bonus_amount,0),updated_at=now() where user_id=wr.user_id;
  refund_reference:='WD-REFUND-'||wr.id::text;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at) values(wr.user_id,'adjustment',wr.amount,'posted',refund_reference,'Remboursement automatique : retrait PayDunya échoué',now()) on conflict(reference) do nothing;
  update public.withdrawal_requests set status='rejected',provider='paydunya',provider_token=coalesce(nullif(trim(p_provider_token),''),provider_token),provider_status='failed',provider_transaction_id=coalesce(p_provider_payload->>'transaction_id',p_provider_payload->>'disburse_tx_id',provider_transaction_id),provider_disburse_id=coalesce(p_provider_payload->>'disburse_id',provider_disburse_id),provider_payload=p_provider_payload,failure_reason=nullif(trim(p_failure_reason),''),admin_note=nullif(trim(p_failure_reason),''),processed_at=coalesce(processed_at,now()),updated_at=now() where id=p_withdrawal_id;
end $$;

create or replace function public.nova_admin_reject_withdrawal(p_withdrawal_id uuid,p_admin_id uuid,p_admin_note text default null)
returns public.withdrawal_requests language plpgsql security definer set search_path=''
as $$
declare wr public.withdrawal_requests%rowtype; admin_role text; refund_reference text;
begin
  select role into admin_role from public.profiles where id=p_admin_id;
  if admin_role is null or admin_role not in ('admin','SUPER_ADMIN','super_admin') then raise exception 'Admin authorization required'; end if;
  select * into wr from public.withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status<>'pending' or wr.provider_token is not null then raise exception 'Withdrawal cannot be rejected at this stage'; end if;
  if wr.admin_approved_at is not null then raise exception 'Withdrawal was already approved'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(wr.user_id,0,0,0) on conflict(user_id) do nothing;
  update public.wallet_balances set balance=balance+wr.amount,bonus_locked=bonus_locked+coalesce(wr.bonus_amount,0),updated_at=now() where user_id=wr.user_id;
  refund_reference:='WD-ADMIN-REFUND-'||wr.id::text;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at) values(wr.user_id,'adjustment',wr.amount,'posted',refund_reference,'Remboursement : retrait refusé par l’administrateur',now()) on conflict(reference) do nothing;
  update public.withdrawal_requests set status='rejected',admin_rejected_at=now(),admin_rejected_by=p_admin_id,failure_reason=coalesce(nullif(trim(p_admin_note),''),'Retrait refusé par l’administrateur.'),admin_note=coalesce(nullif(trim(p_admin_note),''),'Retrait refusé par l’administrateur.'),processed_at=coalesce(processed_at,now()),updated_at=now() where id=wr.id returning * into wr;
  return wr;
end $$;