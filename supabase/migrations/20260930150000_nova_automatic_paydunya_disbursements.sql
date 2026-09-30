-- NOVA: automatic PayDunya disbursements for withdrawals.
alter table public.withdrawal_requests
  add column if not exists provider text,
  add column if not exists provider_token text,
  add column if not exists provider_disburse_id text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payload jsonb,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists withdrawal_requests_provider_token_uidx
  on public.withdrawal_requests(provider_token)
  where provider_token is not null;

create index if not exists withdrawal_requests_provider_status_idx
  on public.withdrawal_requests(status, provider_status, created_at desc);

create or replace function public.nova_set_withdrawal_processing(
  p_withdrawal_id uuid,
  p_provider_token text,
  p_provider_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wr public.withdrawal_requests%rowtype;
begin
  if nullif(trim(p_provider_token), '') is null then
    raise exception 'Provider disbursement token is required';
  end if;

  select * into wr from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status in ('paid','rejected','cancelled') then return; end if;
  if wr.provider_token is not null and wr.provider_token <> p_provider_token then
    raise exception 'Provider disbursement token mismatch';
  end if;

  update public.withdrawal_requests
     set status = 'processing',
         provider = 'paydunya',
         provider_token = p_provider_token,
         provider_status = coalesce(lower(trim(p_provider_payload->>'status')), provider_status, 'created'),
         provider_payload = p_provider_payload,
         updated_at = now()
   where id = p_withdrawal_id;
end;
$$;

create or replace function public.nova_finalize_withdrawal_success(
  p_withdrawal_id uuid,
  p_provider_token text,
  p_provider_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wr public.withdrawal_requests%rowtype;
begin
  select * into wr from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status = 'paid' then return; end if;
  if wr.status in ('rejected','cancelled') then return; end if;
  if wr.provider_token is not null and wr.provider_token <> p_provider_token then
    raise exception 'Provider disbursement token mismatch';
  end if;

  update public.withdrawal_requests
     set status = 'paid',
         provider = 'paydunya',
         provider_token = p_provider_token,
         provider_status = 'success',
         provider_transaction_id = coalesce(p_provider_payload->>'transaction_id', p_provider_payload->>'disburse_tx_id', provider_transaction_id),
         provider_disburse_id = coalesce(p_provider_payload->>'disburse_id', provider_disburse_id),
         provider_payload = p_provider_payload,
         failure_reason = null,
         processed_at = coalesce(processed_at, now()),
         updated_at = now()
   where id = p_withdrawal_id;
end;
$$;

create or replace function public.nova_finalize_withdrawal_failure(
  p_withdrawal_id uuid,
  p_provider_token text,
  p_provider_payload jsonb,
  p_failure_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wr public.withdrawal_requests%rowtype;
  refund_reference text;
begin
  select * into wr from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status = 'paid' then return; end if;
  if wr.status in ('rejected','cancelled') then return; end if;
  if wr.provider_token is not null
     and nullif(trim(p_provider_token), '') is not null
     and wr.provider_token <> p_provider_token then
    raise exception 'Provider disbursement token mismatch';
  end if;

  insert into public.wallet_balances(user_id, balance)
  values (wr.user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallet_balances
     set balance = balance + wr.amount,
         updated_at = now()
   where user_id = wr.user_id;

  refund_reference := 'WD-REFUND-' || wr.id::text;
  insert into public.wallet_ledger(user_id, entry_type, amount, status, reference, description, posted_at)
  values (wr.user_id, 'adjustment', wr.amount, 'posted', refund_reference,
          'Remboursement automatique : retrait PayDunya échoué', now())
  on conflict (reference) do nothing;

  update public.withdrawal_requests
     set status = 'rejected',
         provider = 'paydunya',
         provider_token = coalesce(nullif(trim(p_provider_token), ''), provider_token),
         provider_status = 'failed',
         provider_transaction_id = coalesce(p_provider_payload->>'transaction_id', p_provider_payload->>'disburse_tx_id', provider_transaction_id),
         provider_disburse_id = coalesce(p_provider_payload->>'disburse_id', provider_disburse_id),
         provider_payload = p_provider_payload,
         failure_reason = nullif(trim(p_failure_reason), ''),
         admin_note = nullif(trim(p_failure_reason), ''),
         processed_at = coalesce(processed_at, now()),
         updated_at = now()
   where id = p_withdrawal_id;
end;
$$;

revoke all on function public.nova_set_withdrawal_processing(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.nova_finalize_withdrawal_success(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.nova_finalize_withdrawal_failure(uuid,text,jsonb,text) from public, anon, authenticated;

grant execute on function public.nova_set_withdrawal_processing(uuid,text,jsonb) to service_role;
grant execute on function public.nova_finalize_withdrawal_success(uuid,text,jsonb) to service_role;
grant execute on function public.nova_finalize_withdrawal_failure(uuid,text,jsonb,text) to service_role;
