-- Reconcile stored wallet aggregates with the already-posted wallet ledger.
-- Safe/idempotent: only mismatched aggregate balances are corrected.
with ledger_totals as (
  select user_id,
         coalesce(sum(amount) filter (where status='posted'), 0)::bigint as ledger_net
  from public.wallet_ledger
  group by user_id
)
update public.wallet_balances wb
set balance = lt.ledger_net,
    updated_at = now()
from ledger_totals lt
where lt.user_id = wb.user_id
  and wb.balance <> lt.ledger_net;
