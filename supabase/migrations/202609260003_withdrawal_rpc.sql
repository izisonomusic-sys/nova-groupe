-- Demande de retrait atomique : vérifie le solde, réserve le montant et crée la demande.
-- À appliquer dans Supabase SQL Editor avant d'activer la route API.
create or replace function public.nova_request_withdrawal(
  p_user_id uuid,
  p_amount bigint,
  p_country_code text,
  p_operator text,
  p_phone text,
  p_account_name text
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_balance bigint; v_id uuid;
begin
  if p_amount < 1000 or p_amount > 5000000 then raise exception 'Invalid withdrawal amount'; end if;
  if coalesce(trim(p_country_code),'') = '' or coalesce(trim(p_operator),'') = '' or coalesce(trim(p_phone),'') = '' or coalesce(trim(p_account_name),'') = '' then
    raise exception 'Missing withdrawal details';
  end if;
  insert into public.wallet_balances(user_id,balance) values (p_user_id,0) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallet_balances where user_id=p_user_id for update;
  if v_balance < p_amount then raise exception 'Insufficient balance'; end if;
  update public.wallet_balances set balance=balance-p_amount, updated_at=now() where user_id=p_user_id;
  insert into public.withdrawal_requests(user_id,amount,country_code,operator,phone,account_name,status)
  values (p_user_id,p_amount,trim(p_country_code),trim(p_operator),trim(p_phone),trim(p_account_name),'pending') returning id into v_id;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at)
  values (p_user_id,'withdrawal',-p_amount,'posted',v_id::text,'Montant réservé pour une demande de retrait',now());
  return v_id;
end;
$$;
revoke all on function public.nova_request_withdrawal(uuid,bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.nova_request_withdrawal(uuid,bigint,text,text,text,text) to service_role;
