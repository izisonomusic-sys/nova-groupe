# Étape 3 — Identifiant membre, parrainage et tableau de bord admin

## Changements de cette version
- Ajout d’un identifiant membre numérique de 6 chiffres (`profiles.member_code`) ; l’UUID Supabase reste la clé interne.
- Les liens de parrainage utilisent le code membre. Le formulaire d’inscription récupère automatiquement `?ref=...`.
- À la création d’un compte avec un code valide, une seule ligne de parrainage est créée et 500 FCFA sont crédités au parrain et au filleul, chacun avec une ligne dans `wallet_ledger`. L’opération se déroule dans la transaction du trigger.
- L’espace Équipe affiche le nombre de filleuls, le total d’investissements de l’équipe et les bonus de parrainage, ainsi que les membres directs.
- L’admin dispose de cartes de statistiques : membres, dépôts, retraits, investissements, projets et parrainages. Les statistiques sont calculées côté base via une RPC accessible au seul `service_role`, derrière la vérification admin côté serveur.
- Ajout d’une confirmation de paiement au retour PayDunya : si PayDunya renvoie le token de facture dans l’URL de retour, le serveur re-vérifie le statut auprès de PayDunya puis appelle la RPC idempotente de crédit. Le webhook demeure actif.

## Mise en service
1. Sauvegarder la base Supabase.
2. Exécuter `supabase/migrations/202609290001_member_referral_admin.sql` dans le SQL Editor Supabase.
3. Vérifier la création de `profiles.member_code` et les autorisations de `nova_admin_dashboard_stats`.
4. Déployer le code Node et configurer `PAYDUNYA_RETURN_URL` vers l’URL publique de l’application. Le retour navigateur ne remplace pas le webhook.
5. Tester avec un compte parrain et un compte filleul de test : le bonus ne doit apparaître qu’une seule fois pour chacun. Tester également un paiement PayDunya réel de faible montant avant d’annoncer que le crédit est instantané.

## Limites de vérification
Le dépôt ne contient pas de données réelles de production et les appels PayDunya/Supabase de bout en bout ne sont pas exécutés par les tests locaux. Les comptes historiques ne reçoivent pas automatiquement un bonus rétroactif pour des inscriptions passées.
