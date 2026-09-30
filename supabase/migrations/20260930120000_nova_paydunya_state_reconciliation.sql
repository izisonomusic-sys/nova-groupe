-- NOVA: reconcile non-completed PayDunya states without crediting the wallet.
-- Completed payments continue through nova_confirm_paydunya_payment.

create or replace function public.nova_reconcile_paydunya_state(
  p_payment_id uuid,
  p_provider_token text,
  p_provider_status text,
  p_provider_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx public.payment_transactions%rowtype;
  normalized_status text := lower(trim(p_provider_status));
begin
  if nullif(trim(p_provider_token), '') is null then
    raise exception 'Payment provider token is required';
  end if;

  if normalized_status not in ('pending','failed','cancelled') then
    raise exception 'Unsupported PayDunya state';
  end if;

  select * into tx
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if not found then raise exception 'Payment not found'; end if;
  if tx.provider <> 'paydunya' then raise exception 'Invalid provider'; end if;

  if tx.provider_token is not null and tx.provider_token <> p_provider_token then
    raise exception 'Payment token mismatch';
  end if;

  if tx.status = 'completed' then
    return;
  end if;

  update public.payment_transactions
     set status = normalized_status,
         provider_token = p_provider_token,
         provider_payload = p_provider_payload,
         completed_at = case when normalized_status = 'pending' then completed_at else null end
   where id = p_payment_id;
end;
$$;

revoke all on function public.nova_reconcile_paydunya_state(uuid,text,text,jsonb)
from public, anon, authenticated;

grant execute on function public.nova_reconcile_paydunya_state(uuid,text,text,jsonb)
to service_role;
