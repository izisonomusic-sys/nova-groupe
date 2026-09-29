# NOVA — audit PayDunya / Supabase

## Constat sur l'archive
- `server/index.js` expose bien `POST /payments/webhooks/paydunya`.
- `supabase/migrations/202609260001_payments.sql` crée `payment_transactions`, `wallet_balances` et `nova_confirm_paydunya_payment(uuid,text,bigint,jsonb)`.
- La RPC est `security definer` et son exécution est accordée à `service_role`. Elle crédite `wallet_balances`, écrit un `deposit` dans `wallet_ledger`, puis passe la transaction à `completed` de façon idempotente.
- Le schéma `wallet_ledger` accepte bien `entry_type='deposit'` et `status='posted'` dans `202609260002_core_nova.sql`.
- Aucun conflit de définition de `nova_confirm_paydunya_payment` n'a été trouvé dans les autres migrations.

## Point de blocage probable à vérifier en production
Le code original ne journalisait pas les succès du webhook. Une absence de logs ne permettait donc pas de distinguer : callback jamais reçu, signature invalide, confirmation PayDunya non terminée, métadonnées manquantes ou erreur RPC.

Le callback dépendait aussi de `custom_data.payment_id`. La version corrigée conserve ce mécanisme mais ajoute un fallback : si PayDunya n'echoe pas `custom_data`, la transaction est recherchée par `provider_token`, qui est déjà enregistré lors de la création de la facture.

## Vérification Supabase à faire sur le projet LIVE
```sql
select p.oid::regprocedure as signature,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'nova_confirm_paydunya_payment';

select id, reference, amount, status, provider, provider_token, created_at, completed_at
from public.payment_transactions
order by created_at desc
limit 10;

select has_function_privilege(
  'service_role',
  'public.nova_confirm_paydunya_payment(uuid,text,bigint,jsonb)',
  'execute'
);
```
Ne partagez jamais les clés `service_role` ou PayDunya.
