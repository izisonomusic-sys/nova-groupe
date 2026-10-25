-- TTE Energy withdrawal rules: min 2,000 FCFA, 15% fee, four requests/day, 07:00-18:00 Africa/Lome.
alter table public.withdrawal_requests
  add column if not exists fee_amount bigint not null default 0,
  add column if not exists payout_amount bigint not null default 0;

update public.withdrawal_requests
set payout_amount = case when payout_amount = 0 then greatest(0, amount - coalesce(fee_amount,0)) else payout_amount end;

create or replace function public.nova_request_withdrawal(
  p_user_id uuid, p_amount bigint, p_country_code text, p_operator text,
  p_phone text, p_account_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  w public.wallet_balances%rowtype;
  v_id uuid;
  v_bonus bigint := 0;
  v_real bigint;
  v_real_available bigint;
  local_now timestamp;
  local_dow int;
  local_hour time;
  local_date date;
  today_count int;
  fee bigint;
  payout bigint;
  cc text := case upper(trim(p_country_code))
    when '+228' then 'TG' when '+226' then 'BF' when '+229' then 'BJ'
    when '+225' then 'CI' when '+221' then 'SN' when '+237' then 'CM'
    when '+223' then 'ML' else upper(trim(p_country_code)) end;
  op text := regexp_replace(lower(trim(p_operator)), '[[:space:]]+', ' ', 'g');
  has_investment boolean;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to request withdrawal for another user';
  end if;
  op := case op
    when 'togocom' then 't-money-togo' when 't-money' then 't-money-togo'
    when 'moov togo' then 'moov-togo'
    when 'orange burkina' then 'orange-money-burkina' when 'moov burkina' then 'moov-burkina-faso'
    when 'mtn bénin' then 'mtn-benin' when 'mtn benin' then 'mtn-benin'
    when 'moov bénin' then 'moov-benin' when 'moov benin' then 'moov-benin'
    when 'celtiis cash' then 'celtiis-cash'
    when 'orange ci' then 'orange-money-ci' when 'mtn ci' then 'mtn-ci'
    when 'moov ci' then 'moov-ci' when 'wave ci' then 'wave-ci' when 'djamo ci' then 'djamo-ci'
    when 'orange sn' then 'orange-money-senegal' when 'free sn' then 'free-money-senegal'
    when 'expresso' then 'expresso-senegal' when 'wave sn' then 'wave-senegal' when 'djamo sn' then 'djamo-sn'
    when 'mtn cm' then 'mtn-cameroun' when 'orange ml' then 'orange-money-mali'
    else op end;
  if p_amount < 2000 or p_amount > 5000000 then raise exception 'Le montant doit être compris entre 2 000 et 5 000 000 FCFA'; end if;
  if coalesce(trim(p_phone),'')='' or coalesce(trim(p_account_name),'')='' then raise exception 'Missing withdrawal details'; end if;
  if not (
    (cc='TG' and op in ('t-money-togo','moov-togo')) or
    (cc='BJ' and op in ('mtn-benin','moov-benin','celtiis-cash')) or
    (cc='CI' and op in ('mtn-ci','orange-money-ci','moov-ci','wave-ci','djamo-ci')) or
    (cc='BF' and op in ('orange-money-burkina','moov-burkina-faso')) or
    (cc='ML' and op='orange-money-mali') or
    (cc='SN' and op in ('orange-money-senegal','free-money-senegal','expresso-senegal','wave-senegal','djamo-sn')) or
    (cc='CM' and op='mtn-cameroun')
  ) then raise exception 'Unsupported country/operator combination'; end if;
  local_now := now() at time zone 'Africa/Lome';
  local_dow := extract(isodow from local_now)::int;
  local_hour := local_now::time;
  local_date := local_now::date;
  if local_hour < time '07:00' or local_hour >= time '18:00' then raise exception 'Les retraits sont disponibles tous les jours de 07 h à 18 h (heure du Togo)'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select count(*) into today_count from public.withdrawal_requests
  where user_id=p_user_id and (created_at at time zone 'Africa/Lome')::date=local_date;
  if today_count >= 4 then raise exception 'Limite atteinte : 4 retraits maximum par jour'; end if;
  select exists(select 1 from public.investments where user_id=p_user_id) into has_investment;
  if not has_investment then raise exception 'Vous devez investir dans au moins un projet avant de demander un retrait'; end if;
  insert into public.wallet_balances(user_id,balance,bonus_balance,bonus_locked) values(p_user_id,0,0,0) on conflict(user_id) do nothing;
  select * into w from public.wallet_balances where user_id=p_user_id for update;
  v_real_available := greatest(0,w.balance-coalesce(w.bonus_locked,0));
  if p_amount<=v_real_available then v_real:=p_amount;
  else
    if coalesce(w.bonus_locked,0)<=0 then raise exception 'Insufficient balance'; end if;
    if local_dow not in (1,3,5) then raise exception 'Les retraits du bonus sont disponibles lundi, mercredi et vendredi'; end if;
    if p_amount-v_real_available<>w.bonus_locked then raise exception 'Pour retirer le bonus, la demande doit inclure la totalité du bonus disponible'; end if;
    v_bonus:=w.bonus_locked; v_real:=p_amount-v_bonus;
  end if;
  fee := ceil(p_amount * 0.15)::bigint;
  payout := p_amount-fee;
  if payout<=0 then raise exception 'Montant net invalide après frais'; end if;
  update public.wallet_balances set balance=balance-p_amount,bonus_locked=bonus_locked-v_bonus,updated_at=now() where user_id=p_user_id;
  insert into public.withdrawal_requests(user_id,amount,country_code,operator,phone,account_name,status,bonus_amount,real_amount,fee_amount,payout_amount)
  values(p_user_id,p_amount,cc,op,trim(p_phone),trim(p_account_name),'pending',v_bonus,v_real,fee,payout) returning id into v_id;
  insert into public.wallet_ledger(user_id,entry_type,amount,status,reference,description,posted_at)
  values(p_user_id,'withdrawal',-p_amount,'posted',v_id::text,'Retrait réservé : montant '||p_amount||' FCFA, frais 15 % ('||fee||' FCFA), net à payer '||payout||' FCFA',now());
  return v_id;
end
$function$;

grant execute on function public.nova_request_withdrawal(uuid,bigint,text,text,text,text) to service_role;
