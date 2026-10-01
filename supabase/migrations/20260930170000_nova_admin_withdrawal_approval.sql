-- NOVA: administrator approval gate for withdrawals.
-- The existing wallet reservation remains unchanged. A withdrawal stays in status
-- "pending" until an admin approves it; only the approved server route may call PayDunya.

alter table public.withdrawal_requests
  add column if not exists admin_approved_at timestamptz,
  add column if not exists admin_approved_by uuid,
  add column if not exists admin_rejected_at timestamptz,
  add column if not exists admin_rejected_by uuid;

create index if not exists withdrawal_requests_admin_pending_idx
  on public.withdrawal_requests(created_at desc)
  where status = 'pending' and admin_approved_at is null;

create or replace function public.nova_admin_approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id uuid
) returns public.withdrawal_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  wr public.withdrawal_requests%rowtype;
  admin_role text;
begin
  select role into admin_role from public.profiles where id = p_admin_id;
  if admin_role is null or admin_role not in ('admin','SUPER_ADMIN','super_admin') then
    raise exception 'Admin authorization required';
  end if;

  select * into wr from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status <> 'pending' then raise exception 'Withdrawal is not awaiting admin approval'; end if;
  if wr.admin_rejected_at is not null then raise exception 'Withdrawal was already rejected'; end if;

  update public.withdrawal_requests
     set admin_approved_at = coalesce(admin_approved_at, now()),
         admin_approved_by = coalesce(admin_approved_by, p_admin_id),
         updated_at = now()
   where id = wr.id
   returning * into wr;
  return wr;
end;
$$;

create or replace function public.nova_admin_reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
) returns public.withdrawal_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  wr public.withdrawal_requests%rowtype;
  admin_role text;
  refund_reference text;
begin
  select role into admin_role from public.profiles where id = p_admin_id;
  if admin_role is null or admin_role not in ('admin','SUPER_ADMIN','super_admin') then
    raise exception 'Admin authorization required';
  end if;

  select * into wr from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if wr.status <> 'pending' or wr.provider_token is not null then
    raise exception 'Withdrawal cannot be rejected at this stage';
  end if;
  if wr.admin_approved_at is not null then raise exception 'Withdrawal was already approved'; end if;

  insert into public.wallet_balances(user_id, balance)
  values (wr.user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallet_balances set balance = balance + wr.amount, updated_at = now()
   where user_id = wr.user_id;

  refund_reference := 'WD-ADMIN-REFUND-' || wr.id::text;
  insert into public.wallet_ledger(user_id, entry_type, amount, status, reference, description, posted_at)
  values (wr.user_id, 'adjustment', wr.amount, 'posted', refund_reference,
          'Remboursement : retrait refusé par l’administrateur', now())
  on conflict (reference) do nothing;

  update public.withdrawal_requests
     set status = 'rejected',
         admin_rejected_at = now(),
         admin_rejected_by = p_admin_id,
         failure_reason = coalesce(nullif(trim(p_admin_note), ''), 'Retrait refusé par l’administrateur.'),
         admin_note = coalesce(nullif(trim(p_admin_note), ''), 'Retrait refusé par l’administrateur.'),
         processed_at = coalesce(processed_at, now()),
         updated_at = now()
   where id = wr.id
   returning * into wr;
  return wr;
end;
$$;

revoke all on function public.nova_admin_approve_withdrawal(uuid,uuid) from public, anon, authenticated;
revoke all on function public.nova_admin_reject_withdrawal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.nova_admin_approve_withdrawal(uuid,uuid) to service_role;
grant execute on function public.nova_admin_reject_withdrawal(uuid,uuid,text) to service_role;
