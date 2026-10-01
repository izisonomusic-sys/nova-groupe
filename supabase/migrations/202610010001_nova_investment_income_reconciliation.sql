-- Restore automatic daily investment income credits.
-- Idempotent per investment/day and safe for repeated scheduler runs.

create unique index if not exists wallet_ledger_investment_income_reference_uq
  on public.wallet_ledger(reference)
  where entry_type = 'investment_income'
    and status = 'posted'
    and reference is not null;

create or replace function private.nova_reconcile_investment_income(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  v_due_days integer;
  v_day integer;
  v_started timestamptz;
  v_end timestamptz;
  v_daily bigint;
  v_ref text;
  v_ledger_id uuid;
  v_credited integer := 0;
  v_amount bigint := 0;
begin
  for inv in
    select
      i.id,
      i.user_id,
      i.started_at,
      i.ends_at,
      i.created_at,
      p.daily_return_amount,
      p.duration_days,
      p.title
    from public.investments i
    join public.projects p on p.id = i.project_id
    where i.status in ('active','completed')
      and (p_user_id is null or i.user_id = p_user_id)
    order by i.created_at asc
  loop
    perform pg_advisory_xact_lock(hashtextextended(inv.user_id::text, 91027));

    v_started := coalesce(inv.started_at, inv.created_at);
    v_end := least(now(), coalesce(inv.ends_at, v_started + make_interval(days => inv.duration_days)));
    v_daily := inv.daily_return_amount;

    if v_started is null or v_daily is null or v_daily <= 0 or inv.duration_days is null or inv.duration_days <= 0 then
      continue;
    end if;

    v_due_days := least(
      inv.duration_days,
      greatest(0, floor(extract(epoch from (v_end - v_started)) / 86400)::integer)
    );

    if v_due_days <= 0 then
      continue;
    end if;

    insert into public.wallet_balances(user_id, balance)
    values (inv.user_id, 0)
    on conflict (user_id) do nothing;

    for v_day in 1..v_due_days loop
      v_ref := 'INV-INCOME-' || inv.id::text || '-DAY-' || v_day;

      insert into public.wallet_ledger(
        user_id, entry_type, amount, status, reference, description,
        related_investment_id, posted_at
      )
      values (
        inv.user_id,
        'investment_income',
        v_daily,
        'posted',
        v_ref,
        'Gain quotidien investissement — ' || coalesce(inv.title, 'Projet NOVA') || ' — jour ' || v_day,
        inv.id,
        v_started + make_interval(days => v_day)
      )
      on conflict (reference) where entry_type = 'investment_income' and status = 'posted'
      do nothing
      returning id into v_ledger_id;

      if v_ledger_id is not null then
        update public.wallet_balances
        set balance = balance + v_daily,
            updated_at = now()
        where user_id = inv.user_id;

        v_credited := v_credited + 1;
        v_amount := v_amount + v_daily;
      end if;

      v_ledger_id := null;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'credited', v_credited,
    'amount_credited', v_amount
  );
end;
$$;

revoke all on function private.nova_reconcile_investment_income(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.nova_reconcile_investment_income(uuid) to service_role;

do $job$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'nova-investment-income-reconciliation') then
      perform cron.unschedule('nova-investment-income-reconciliation');
    end if;

    perform cron.schedule(
      'nova-investment-income-reconciliation',
      '*/5 * * * *',
      'select private.nova_reconcile_investment_income(null);'
    );
  end if;
end
$job$;
