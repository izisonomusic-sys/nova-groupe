-- NOVA: harden PayDunya confirmation RPC.
-- This migration keeps the existing payment flow intact while making the
-- server-side credit function explicit and idempotent.
create or replace function public.nova_confirm_paydunya_payment(
  p_payment_id uuid,
  p_provider_token text,
  p_paid_amount bigint,
  p_provider_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx public.payment_transactions%rowtype;
begin
  select *
    into tx
    from public.payment_transactions
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if tx.provider <> 'paydunya' then
    raise exception 'Invalid provider';
  end if;

  if tx.provider_token is not null and tx.provider_token <> p_provider_token then
    raise exception 'Payment token mismatch';
  end if;

  if tx.amount <> p_paid_amount then
    raise exception 'Payment amount mismatch';
  end if;

  if tx.status = 'completed' then
    return;
  end if;

  if tx.status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;

  insert into public.wallet_balances(user_id, balance)
  values (tx.user_id, p_paid_amount)
  on conflict (user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        updated_at = pg_catalog.now();

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, posted_at
  )
  values (
    tx.user_id, 'deposit', p_paid_amount, 'posted', tx.reference,
    'Recharge confirmée par PayDunya', pg_catalog.now()
  );

  update public.payment_transactions
     set status = 'completed',
         provider_token = p_provider_token,
         provider_payload = p_provider_payload,
         completed_at = pg_catalog.now()
   where id = p_payment_id;
end;
$$;

revoke all on function public.nova_confirm_paydunya_payment(uuid,text,bigint,jsonb)
  from public, anon, authenticated;

grant execute on function public.nova_confirm_paydunya_payment(uuid,text,bigint,jsonb)
  to service_role;
