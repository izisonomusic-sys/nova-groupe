# NOVA — Trace des règles de rendement et bonus

> Cette trace historique décrit le prototype local d'origine. La version actuelle a migré les soldes, investissements, bonus et opérations financières vers Supabase et le serveur sécurisé.

## Rendements des investissements
- Chaque investissement conserve `price`, `daily`, `days`, `start` et `earned`.
- À l'ouverture de `app.html`, le calcul local détermine `elapsed = min(floor((now-start)/24h), days)`.
- Le montant acquis théorique est `daily × elapsed`.
- Seule la différence positive entre ce montant et `earned` est ajoutée au portefeuille et à l'historique, afin d'éviter le double comptage lors des rafraîchissements dans ce navigateur.
- La valeur `daily` doit venir du projet publié. Aucune règle universelle (par exemple 500 FCFA/jour pour tous les tickets) n'est supposée. Toute promesse de rendement doit être validée juridiquement et financièrement.

## Parrainage
- À l'inscription avec un code de parrain valide, un bonus nominal de 500 FCFA est inscrit chez le parrain et chez le filleul dans `referralBonus`.
- Le bonus reste affiché dans le solde total, mais il n'est retirable que si le compte concerné a effectué au moins un dépôt (`charged > 0`) et détient au moins un investissement, et si l'autre partie (parrain/filleul) remplit aussi ces conditions.
- La validation d'éligibilité actuelle est une approximation prototype : pour un parrain ayant plusieurs filleuls, un filleul éligible peut déverrouiller le total. Il faut remplacer cette règle par un registre de bonus par filleul côté serveur avant toute utilisation réelle.

## Présence
- Chaque compte peut réclamer 50 FCFA après chaque période de 24 heures depuis `presence.claimedAt`.
- Le montant est crédité via la fonction serveur transactionnelle `nova_claim_daily_bonus` et journalisé dans `wallet_ledger`.
- Le contrôle d'éligibilité est désormais effectué côté serveur avec verrou transactionnel et délai de 24 heures.

## Traces de test manuelles
1. Inscrire un compte A sans parrain : bonus de parrainage = 0.
2. Inscrire B avec l'ID de A : bonus nominal de 500 FCFA pour A et B; les deux bonus sont bloqués.
3. Réclamer la présence : 50 FCFA ajoutés; recliquer avant 24 h ne doit rien ajouter.
4. Créer un investissement local et avancer l'horloge de test (ou utiliser un profil de test) : à chaque chargement, seul le delta de rendement est ajouté.
5. Vérifier qu'un retrait qui inclut un bonus de parrainage est refusé tant que les deux comptes n'ont pas chacun déposé et investi.

## Limites et prochaines étapes
- Migrer vers Supabase Auth, tables ledger/transactions, RLS et RPC transactionnelles.
- Calculer les rendements et bonus côté serveur, avec idempotency keys et journaux immuables.
- Connecter PayDunya en mode test et créditer le portefeuille uniquement après validation serveur de la notification.
- Ne pas créditer de rendement garanti ou bonus réel avant validation réglementaire, modèle économique et conditions contractuelles.
