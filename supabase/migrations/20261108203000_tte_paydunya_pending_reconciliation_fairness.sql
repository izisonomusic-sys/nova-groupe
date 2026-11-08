-- Keep PayDunya pending reconciliation fair across the complete queue.
-- Older pending invoices must not be excluded by an arbitrary seven-day cutoff.
alter table public.payment_transactions
  add column if not exists last_reconciled_at timestamptz;

create index if not exists payment_transactions_paydunya_pending_reconcile_idx
  on public.payment_transactions(last_reconciled_at asc nulls first, created_at asc)
  where provider = 'paydunya'
    and status = 'pending'
    and provider_token is not null;
