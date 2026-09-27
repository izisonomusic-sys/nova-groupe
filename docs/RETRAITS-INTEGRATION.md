# NOVA — Demandes de retrait (intégration initiale)

## Fichiers modifiés
- `server/index.js` : `POST /api/withdrawals`, authentification Bearer Supabase, validation du montant et des coordonnées, appel de la RPC transactionnelle.
- `assets/js/app.js` : le bouton Confirmer le retrait envoie les champs du formulaire à l’API.
- `supabase/migrations/202609260003_withdrawal_rpc.sql` : RPC de réservation atomique du montant, création de la demande et écriture du journal.

## Mise en service requise
1. Exécuter les migrations `202609260001_payments.sql`, `202609260002_core_nova.sql`, puis `202609260003_withdrawal_rpc.sql` dans Supabase.
2. Déployer le serveur API avec `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur.
3. Tester d’abord avec un compte et un solde de test. La RPC réserve immédiatement le montant en le déduisant du solde; la demande reste `pending`.
4. Le paiement sortant au bénéficiaire n’est pas automatisé par cette route. Le traitement de rejet/remboursement et l’administration des demandes doivent être ajoutés avant une mise en production financière.

## Tests effectués dans ce paquet
Vérification syntaxique Node.js des fichiers `server/index.js`, `assets/js/app.js`, `assets/js/store.js`, `assets/js/main.js`, `assets/js/auth.js` et `assets/js/admin.js`. Cela ne remplace pas un test connecté à Supabase ou PayDunya.
