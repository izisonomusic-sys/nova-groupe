-- TTE Energy: immutable investment terms, reliable daily income scheduler,
-- and referral status reconciliation without issuing duplicate credits.

-- Snapshot the terms accepted at purchase so later project edits cannot
-- change an existing member's daily return or duration.
alter table public.investments
  add column if not exists daily_return_amount bigint,
  add column if not exists duration_days integer;

update public.investments i
set daily_return_amount = p.daily_return_amount,
    duration_days = p.duration_days
from public.projects p
where p.id = i.project_id
  and (i.daily_return_amount is null or i.duration_days is null);

alter table public.investments
  alter column daily_return_amount set not null,
  alter column duration_days set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investments'::regclass
      and conname = 'investments_daily_return_amount_positive'
  ) then
    alter table public.investments
      add constraint investments_daily_return_amount_positive
      check (daily_return_amount > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investments'::regclass
      and conname = 'investments_duration_days_positive'
  ) then
    alter table public.investments
      add constraint investments_duration_days_positive
      check (duration_days > 0);
  end if;
end $$;

create index if not exists investments_status_started_at_idx
  on public.investments(status, started_at)
  where status in ('active', 'completed');

-- Purchase remains one atomic transaction: investment row, wallet debit,
-- and ledger entry are committed together.
create or replace function private.nova_create_investment(
  p_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  p public.projects%rowtype;
  w public.wallet_balances%rowtype;
  inv public.investments%rowtype;
  ref text := 'INVEST-' || gen_random_uuid()::text;
  new_balance bigint;
  investable_balance bigint;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'Invalid investment request';
  end if;

  select * into p
  from public.projects
  where id = p_project_id
  for update;

  if not found then raise exception 'Project not found'; end if;
  if p.status <> 'published' then raise exception 'Project is not available'; end if;
  if p.minimum_amount <= 0 or p.daily_return_amount <= 0 or p.duration_days <= 0 then
    raise exception 'Invalid project terms';
  end if;

  select * into w
  from public.wallet_balances
  where user_id = p_user_id
  for update;

  if not found then raise exception 'Wallet not found'; end if;

  investable_balance := w.balance - coalesce(w.bonus_locked, 0);
  if investable_balance < p.minimum_amount then
    raise exception 'Solde insuffisant';
  end if;

  insert into public.investments(
    user_id, project_id, principal_amount, status, started_at, ends_at,
    daily_return_amount, duration_days
  )
  values(
    p_user_id, p.id, p.minimum_amount, 'active', now(),
    now() + make_interval(days => p.duration_days),
    p.daily_return_amount, p.duration_days
  )
  returning * into inv;

  update public.wallet_balances
  set balance = balance - p.minimum_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into new_balance;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description,
    related_investment_id, posted_at
  )
  values(
    p_user_id, 'investment_debit', -p.minimum_amount, 'posted', ref,
    'Débit pour investissement: ' || p.title, inv.id, now()
  );

  return jsonb_build_object(
    'ok', true,
    'investment_id', inv.id,
    'amount', p.minimum_amount,
    'new_balance', new_balance,
    'ends_at', inv.ends_at
  );
end;
$function$;

-- Database-side daily income runner. It does not depend on a logged-in
-- member or a continuously awake Render web process. Unique ledger references
-- and row locks make concurrent runs safe.
create or replace function private.nova_process_due_investment_income()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inv record;
  due_days integer;
  day_no integer;
  effective_end timestamptz;
  posted_at_value timestamptz;
  ledger_id uuid;
  ledger_reference text;
  credited_count bigint := 0;
  credited_amount bigint := 0;
  completed_count bigint := 0;
begin
  for inv in
    select
      i.id,
      i.user_id,
      i.status,
      i.started_at,
      i.ends_at,
      i.daily_return_amount,
      i.duration_days,
      p.title
    from public.investments i
    join public.projects p on p.id = i.project_id
    where i.status in ('active', 'completed')
      and i.started_at is not null
      and i.daily_return_amount > 0
      and i.duration_days > 0
    order by i.started_at
    for update of i skip locked
  loop
    effective_end := coalesce(
      inv.ends_at,
      inv.started_at + make_interval(days => inv.duration_days)
    );

    due_days := least(
      inv.duration_days,
      greatest(
        0,
        floor(
          extract(epoch from (least(now(), effective_end) - inv.started_at)) / 86400
        )::integer
      )
    );

    if due_days > 0 then
      insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
      values(inv.user_id, 0, 0, 0)
      on conflict(user_id) do nothing;

      for day_no in 1..due_days loop
        posted_at_value := inv.started_at + make_interval(days => day_no);
        if posted_at_value > now() or posted_at_value > effective_end then
          continue;
        end if;

        ledger_reference := 'INV-INCOME-' || inv.id::text || '-DAY-' || day_no;
        ledger_id := null;

        insert into public.wallet_ledger(
          user_id, entry_type, amount, status, reference, description,
          related_investment_id, posted_at
        )
        values(
          inv.user_id,
          'investment_income',
          inv.daily_return_amount,
          'posted',
          ledger_reference,
          'Gain quotidien investissement — ' || coalesce(inv.title, 'Projet TTE Energy') || ' — jour ' || day_no,
          inv.id,
          posted_at_value
        )
        on conflict(reference) do nothing
        returning id into ledger_id;

        if ledger_id is not null then
          update public.wallet_balances
          set balance = balance + inv.daily_return_amount,
              updated_at = now()
          where user_id = inv.user_id;

          credited_count := credited_count + 1;
          credited_amount := credited_amount + inv.daily_return_amount;
        end if;
      end loop;
    end if;

    if effective_end <= now() and inv.status = 'active' then
      update public.investments
      set status = 'completed'
      where id = inv.id and status = 'active';
      if found then completed_count := completed_count + 1; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'credited_days', credited_count,
    'credited_amount', credited_amount,
    'investments_completed', completed_count
  );
end;
$function$;

revoke all on function private.nova_process_due_investment_income() from public, anon, authenticated;
grant execute on function private.nova_process_due_investment_income() to postgres, service_role;

-- Keep already-paid legacy referral pairs marked as credited even when the
-- current qualification threshold has changed. No wallet entries are added
-- for a pair whose two unique payment references already exist.
create or replace function private.nova_qualify_referrals_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
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
      and status in ('pending', 'eligible')
    for update
  loop
    select exists(
      select 1
      from public.wallet_ledger
      where user_id = r.referrer_id
        and status = 'posted'
        and reference in (
          'REF-' || r.id::text || '-PARRAIN',
          'REF-BONUS-' || r.id::text || '-PARRAIN',
          'REFERRAL-400-' || r.id::text || '-PARRAIN'
        )
    ) into v_ref_old_paid;

    select exists(
      select 1
      from public.wallet_ledger
      where user_id = r.referred_user_id
        and status = 'posted'
        and reference in (
          'REF-' || r.id::text || '-FILLEUL',
          'REF-BONUS-' || r.id::text || '-FILLEUL',
          'REFERRAL-400-' || r.id::text || '-FILLEUL'
        )
    ) into v_child_old_paid;

    if v_ref_old_paid and v_child_old_paid then
      update public.referrals
      set status = 'credited',
          referrer_qualified_at = coalesce(referrer_qualified_at, now()),
          referred_qualified_at = coalesce(referred_qualified_at, now())
      where id = r.id;
      v_count := v_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.wallet_ledger l
      where l.user_id = r.referred_user_id
        and l.entry_type = 'deposit'
        and l.status = 'posted'
        and l.amount >= 3000
    ) into v_qualifying_deposit;

    if not v_qualifying_deposit then
      update public.referrals
      set status = 'pending'
      where id = r.id and status in ('pending', 'eligible');
      continue;
    end if;

    if not v_ref_old_paid then
      perform private.nova_credit_main(
        r.referrer_id,
        400,
        'referral_commission',
        'REFERRAL-400-' || r.id::text || '-PARRAIN',
        'Commission de parrainage TTE Energy après dépôt confirmé >= 3000 FCFA',
        r.referred_user_id
      );
    end if;

    if not v_child_old_paid then
      perform private.nova_credit_main(
        r.referred_user_id,
        400,
        'referral_reward',
        'REFERRAL-400-' || r.id::text || '-FILLEUL',
        'Récompense filleul TTE Energy après dépôt confirmé >= 3000 FCFA',
        r.referrer_id
      );
    end if;

    update public.referrals
    set status = 'credited',
        bonus_amount = 400,
        referrer_qualified_at = coalesce(referrer_qualified_at, now()),
        referred_qualified_at = coalesce(referred_qualified_at, now())
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- Repair only the display/status metadata for legacy referral pairs whose
-- two credits are already present. This does not credit any wallet.
update public.referrals r
set status = 'credited',
    referrer_qualified_at = coalesce(r.referrer_qualified_at, now()),
    referred_qualified_at = coalesce(r.referred_qualified_at, now())
where r.status in ('pending', 'eligible')
  and exists (
    select 1 from public.wallet_ledger l
    where l.user_id = r.referrer_id and l.status = 'posted'
      and l.reference in (
        'REF-' || r.id::text || '-PARRAIN',
        'REF-BONUS-' || r.id::text || '-PARRAIN',
        'REFERRAL-400-' || r.id::text || '-PARRAIN'
      )
  )
  and exists (
    select 1 from public.wallet_ledger l
    where l.user_id = r.referred_user_id and l.status = 'posted'
      and l.reference in (
        'REF-' || r.id::text || '-FILLEUL',
        'REF-BONUS-' || r.id::text || '-FILLEUL',
        'REFERRAL-400-' || r.id::text || '-FILLEUL'
      )
  );

-- Enable Supabase's managed PostgreSQL scheduler and run the financial
-- reconciliations independently of Render's sleep/restart lifecycle.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'tte-investment-income-every-five-minutes',
  '*/5 * * * *',
  'select private.nova_process_due_investment_income();'
);

-- Togo is UTC+0. Release the bonus wallet at 00:05 on Monday, Wednesday,
-- and Friday, preserving the existing Africa/Lome eligibility rule.
select cron.schedule(
  'tte-bonus-wallet-release-mon-wed-fri',
  '5 0 * * 1,3,5',
  'select private.nova_release_bonus_wallets();'
);
