-- TTE Energy: permit the explicit ledger types used by welcome and referral credits.
-- No balances or historical ledger entries are changed by this migration.
alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_entry_type_check;

alter table public.wallet_ledger
  add constraint wallet_ledger_entry_type_check
  check (entry_type = any (array[
    'deposit',
    'withdrawal',
    'investment_debit',
    'principal_return',
    'investment_income',
    'referral_bonus',
    'daily_bonus',
    'adjustment',
    'welcome_bonus',
    'referral_commission',
    'referral_reward'
  ]::text[]));
