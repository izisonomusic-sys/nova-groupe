# État de migration Supabase — 26 septembre 2026

## Ajouts dans cette version
- `supabase/migrations/202609260002_core_nova.sql`: schéma cœur (profils, projets, investissements, ledger, parrainage, bonus, retraits, soldes) avec RLS activée.
- `assets/js/supabase-data.js`: accès en lecture à profil, projets publiés, portefeuille, historique et investissements via Supabase.
- Les écritures financières côté client ne sont volontairement pas autorisées par les policies SQL. Elles nécessitent des RPC transactionnelles ou des endpoints de confiance.

## État actuel
La version actuelle a supprimé le stockage métier local. Les profils, soldes, projets, investissements, bonus, retraits et écritures du portefeuille sont reliés à Supabase. Les écritures financières passent par des endpoints serveur et des fonctions SQL transactionnelles.

## Vérifications restantes avant production
1. Appliquer et vérifier toutes les migrations SQL sur le projet Supabase cible.
2. Tester l'inscription/connexion téléphone sans OTP avec un navigateur propre.
3. Configurer les clés PayDunya correspondantes au mode `test` ou `live`.
4. Configurer `PAYDUNYA_CALLBACK_URL` avec une URL HTTPS publique en production.
5. Réaliser un test de paiement de bout en bout et confirmer une seule écriture `deposit` dans `wallet_ledger`.
6. Effectuer une revue réglementaire et financière avant toute utilisation avec de vrais clients.
