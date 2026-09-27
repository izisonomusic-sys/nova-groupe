# NOVA — état de cette livraison (26 septembre 2026)

## Modifications incluses
- La page de recharge appelle désormais `POST /api/payments/paydunya/create` avec le jeton Supabase de la session; elle redirige vers la page de paiement retournée par le serveur.
- Ajout d'une route authentifiée `GET /api/payments/paydunya/:reference` pour consulter uniquement ses propres transactions.
- La fonction SQL `nova_confirm_paydunya_payment` ajoute une écriture `deposit` au journal `wallet_ledger` au moment où le paiement est confirmé et crédite le portefeuille de façon idempotente via le verrouillage de la transaction.
- Le SDK Supabase est chargé sur la page app pour initialiser le client de session.

## Configuration requise côté serveur
Copier `.env.example` vers `.env`, renseigner les clés Supabase serveur et les clés PayDunya dans le serveur (jamais dans `assets/js/config.js`). Utiliser `PAYDUNYA_MODE=test` pour les essais. L'URL callback doit être publiquement accessible; `localhost` ne peut pas recevoir les callbacks du prestataire.

## Migrations SQL
Exécuter les fichiers de `supabase/migrations/` dans l'ordre chronologique dans l'éditeur SQL Supabase. Vérifier que les tables `wallet_ledger`, `profiles`, `wallet_balances` et `payment_transactions` existent avant d'activer les paiements.

## Limites restantes — migration globale non terminée
- `assets/js/store.js` et plusieurs vues de `assets/js/app.js`/`admin.js` utilisent encore des données locales historiques. Les opérations d'investissement, de retrait, bonus et administration ne sont pas encore toutes reliées à des RPC sécurisées.
- La création de compte via téléphone dépend de la configuration Supabase Auth; le mode sans OTP doit être vérifié dans le projet.
- Les paiements PayDunya n'ont pas été testés avec un compte marchand réel/sandbox ni un callback public. Ne pas activer le mode live avant tests de bout en bout et revue de sécurité.
- Aucune clé secrète ne doit être ajoutée au navigateur ou à l'archive.
