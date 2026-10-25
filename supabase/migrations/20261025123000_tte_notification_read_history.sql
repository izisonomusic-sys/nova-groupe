create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references public.wallet_ledger(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, ledger_id)
);

create index if not exists notification_reads_user_read_at_idx
  on public.notification_reads (user_id, read_at desc);

alter table public.notification_reads enable row level security;
revoke all on table public.notification_reads from anon, authenticated;
grant all on table public.notification_reads to service_role;
