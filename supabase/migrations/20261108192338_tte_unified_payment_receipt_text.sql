create or replace function public.nova_confirm_lomopay_payment(
  p_payment_id uuid,
  p_provider_token text,
  p_paid_amount bigint,
  p_currency text,
  p_provider_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  tx public.payment_transactions%rowtype;
begin
  if nullif(trim(p_provider_token),'') is null then
    raise exception 'Payment provider transaction id is required';
  end if;
  select * into tx from public.payment_transactions where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if tx.provider <> 'lomopay' then raise exception 'Invalid payment provider'; end if;
  if tx.provider_token is not null and tx.provider_token <> p_provider_token then
    raise exception 'Payment provider id mismatch';
  end if;
  if tx.amount <> p_paid_amount then raise exception 'Payment amount mismatch'; end if;
  if tx.currency <> upper(trim(p_currency)) then raise exception 'Payment currency mismatch'; end if;
  if tx.status='completed' then return; end if;
  if tx.status <> 'pending' then raise exception 'Payment is not pending'; end if;

  insert into public.wallet_ledger(
    user_id,entry_type,amount,status,reference,description,posted_at
  ) values (
    tx.user_id,'deposit',p_paid_amount,'posted',tx.reference,
    'Recharge portefeuille TTE Energy confirmée',now()
  );

  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked)
  values(tx.user_id,p_paid_amount,0,0)
  on conflict(user_id) do update
    set balance=public.wallet_balances.balance+excluded.balance,
        updated_at=now();

  update public.payment_transactions
     set status='completed', provider_token=p_provider_token,
         provider_payload=p_provider_payload, completed_at=now()
   where id=p_payment_id;

  perform private.nova_qualify_referrals_for_user(tx.user_id);
end;
$function$;

create or replace function public.nova_confirm_paydunya_payment(
  p_payment_id uuid,
  p_provider_token text,
  p_paid_amount bigint,
  p_provider_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  tx public.payment_transactions%rowtype;
begin
  if nullif(trim(p_provider_token), '') is null then raise exception 'Payment provider token is required'; end if;
  select * into tx from public.payment_transactions where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if tx.provider <> 'paydunya' then raise exception 'Invalid provider'; end if;
  if tx.provider_token is not null and tx.provider_token <> p_provider_token then raise exception 'Payment token mismatch'; end if;
  if tx.amount <> p_paid_amount then raise exception 'Payment amount mismatch'; end if;
  if tx.status = 'completed' then return; end if;
  if tx.status <> 'pending' then raise exception 'Payment is not pending'; end if;

  insert into public.wallet_ledger(
    user_id, entry_type, amount, status, reference, description, posted_at
  )
  values(
    tx.user_id, 'deposit', p_paid_amount, 'posted', tx.reference,
    'Recharge portefeuille TTE Energy confirmée', now()
  );

  insert into public.wallet_balances(user_id, balance, bonus_balance, bonus_locked)
  values(tx.user_id,p_paid_amount,0,0)
  on conflict(user_id) do update
    set balance = public.wallet_balances.balance + excluded.balance,
        updated_at=now();

  update public.payment_transactions
  set status='completed',
      provider_token=p_provider_token,
      provider_payload=p_provider_payload,
      completed_at=now()
  where id=p_payment_id;

  perform private.nova_qualify_referrals_for_user(tx.user_id);
end;
$function$;
