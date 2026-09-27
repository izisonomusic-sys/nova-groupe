-- NOVA: tables de transactions pour le parcours de recharge PayDunya.
-- Exécuter dans Supabase SQL Editor après vérification des politiques et du modèle de compte.
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reference text not null unique,
  provider text not null check (provider = 'paydunya'),
  provider_token text unique,
  amount bigint not null check (amount >= 1000),
  currency text not null default 'XOF' check (currency = 'XOF'),
  status text not null default 'pending' check (status in ('pending','completed','failed','cancelled')),
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payment_transactions_user_created_idx on public.payment_transactions(user_id, created_at desc);
alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from anon, authenticated;
grant select on public.payment_transactions to authenticated;
create policy "Members can read their own payment transactions" on public.payment_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Solde tenu dans une table wallet_balances. Cette fonction crédite une seule fois
-- et seulement après confirmation serveur du paiement PayDunya.
create table if not exists public.wallet_balances (
  user_id uuid primary key references auth.users(id) on delete restrict,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
alter table public.wallet_balances enable row level security;
revoke all on public.wallet_balances from anon, authenticated;
grant select on public.wallet_balances to authenticated;
create policy "Members can read their own wallet balance" on public.wallet_balances
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.nova_confirm_paydunya_payment(
  p_payment_id uuid,
  p_provider_token text,
  p_paid_amount bigint,
  p_provider_payload jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare tx public.payment_transactions%rowtype;
begin
  select * into tx from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if tx.provider <> 'paydunya' or tx.provider_token is not null and tx.provider_token <> p_provider_token then
    raise exception 'Payment provider/token mismatch';
  end if;
  if tx.amount <> p_paid_amount then raise exception 'Payment amount mismatch'; end if;
  if tx.status = 'completed' then return; end if;
  if tx.status <> 'pending' then raise exception 'Payment is not pending'; end if;

  insert into public.wallet_balances(user_id, balance) values (tx.user_id, p_paid_amount)
  on conflict (user_id) do update set balance = public.wallet_balances.balance + excluded.balance, updated_at = now();

  -- Journal financier immuable : une ligne n'est ajoutée qu'au premier passage en completed.
  insert into public.wallet_ledger(user_id, entry_type, amount, status, reference, description, posted_at)
  values (tx.user_id, 'deposit', p_paid_amount, 'posted', tx.reference,
          'Recharge confirmée par PayDunya', now());

  update public.payment_transactions set status = 'completed', provider_token = p_provider_token,
    provider_payload = p_provider_payload, completed_at = now() where id = p_payment_id;
end;
$$;
revoke all on function public.nova_confirm_paydunya_payment(uuid,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.nova_confirm_paydunya_payment(uuid,text,bigint,jsonb) to service_role;
