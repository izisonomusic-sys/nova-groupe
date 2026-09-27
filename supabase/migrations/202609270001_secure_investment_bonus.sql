-- Prevent self-service role escalation through profile updates.
drop policy if exists "profile self update" on public.profiles;
alter table public.projects add column if not exists badge text not null default '';

-- NOVA money operations: atomic investment debit and 24h attendance bonus.
-- API calls are made only by the trusted server using service_role.
create schema if not exists private;

create or replace function private.nova_create_investment(p_user_id uuid, p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare p public.projects%rowtype; w public.wallet_balances%rowtype; inv public.investments%rowtype; ref text := 'INVEST-' || gen_random_uuid()::text; new_balance bigint;
begin
  if p_user_id is null or p_project_id is null then raise exception 'Invalid investment request'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if p.status <> 'published' then raise exception 'Project is not available'; end if;
  if p.minimum_amount <= 0 then raise exception 'Invalid project amount'; end if;
  select * into w from public.wallet_balances where user_id=p_user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  if w.balance < p.minimum_amount then raise exception 'Solde insuffisant'; end if;
  insert into public.investments(user_id,project_id,principal_amount,status,started_at,ends_at)
  values(p_user_id,p.id,p.minimum_amount,'active',now(),now()+make_interval(days=>p.duration_days))
  returning * into inv;
  update public.wallet_balances set balance=balance-p.minimum_amount,updated_at=now()
  where user_id=p_user_id returning balance into new_balance;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,related_investment_id,posted_at)
  values(p_user_id,'investment_debit',-p.minimum_amount,'posted',ref,'Débit pour investissement : '||p.title,inv.id,now());
  return jsonb_build_object('ok',true,'investment_id',inv.id,'amount',p.minimum_amount,'new_balance',new_balance,'ends_at',inv.ends_at);
end; $$;

-- Keep compatibility with deployments whose status check used "credited" instead of "posted".
alter table public.daily_bonus_claims drop constraint if exists daily_bonus_claims_status_check;
alter table public.daily_bonus_claims add constraint daily_bonus_claims_status_check
  check (status = any (array['pending','posted','credited','cancelled']));

create or replace function private.nova_claim_daily_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare w public.wallet_balances%rowtype; last_claim timestamptz; new_balance bigint; bonus bigint := 50; ref text := 'BONUS-' || gen_random_uuid()::text;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select max(claimed_at) into last_claim from public.daily_bonus_claims where user_id=p_user_id and status in ('posted','credited');
  if last_claim is not null and last_claim > now()-interval '24 hours' then raise exception 'Bonus déjà réclamé. Revenez après 24 heures.'; end if;
  select * into w from public.wallet_balances where user_id=p_user_id for update;
  if not found then insert into public.wallet_balances(user_id,balance) values(p_user_id,0) returning * into w; end if;
  insert into public.daily_bonus_claims(user_id,amount,claimed_at,eligible_again_at,status)
  values(p_user_id,bonus,now(),now()+interval '24 hours','posted');
  update public.wallet_balances set balance=balance+bonus,updated_at=now() where user_id=p_user_id returning balance into new_balance;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at)
  values(p_user_id,'daily_bonus',bonus,'posted',ref,'Bonus de présence quotidien',now());
  return jsonb_build_object('ok',true,'amount',bonus,'new_balance',new_balance,'eligible_again_at',now()+interval '24 hours');
end; $$;

grant usage on schema private to service_role;
grant execute on function private.nova_create_investment(uuid,uuid) to service_role;
grant execute on function private.nova_claim_daily_bonus(uuid) to service_role;

create or replace function public.nova_create_investment(p_user_id uuid, p_project_id uuid)
returns jsonb language sql security invoker set search_path = public, private
as $$ select private.nova_create_investment(p_user_id,p_project_id); $$;

create or replace function public.nova_claim_daily_bonus(p_user_id uuid)
returns jsonb language sql security invoker set search_path = public, private
as $$ select private.nova_claim_daily_bonus(p_user_id); $$;

revoke all on function private.nova_create_investment(uuid,uuid) from public, anon, authenticated;
revoke all on function private.nova_claim_daily_bonus(uuid) from public, anon, authenticated;
revoke all on function public.nova_create_investment(uuid,uuid) from public, anon, authenticated;
revoke all on function public.nova_claim_daily_bonus(uuid) from public, anon, authenticated;
grant execute on function public.nova_create_investment(uuid,uuid) to service_role;
grant execute on function public.nova_claim_daily_bonus(uuid) to service_role;
