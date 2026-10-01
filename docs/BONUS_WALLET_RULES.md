# NOVA — Règles du portefeuille Bonus

## 1. Séparation des fonds
- Le **Solde** reste le portefeuille principal.
- Le **Bonus** est séparé du solde investissable.
- Un bonus ne peut jamais servir à créer un investissement.
- Les gains `investment_income` restent des fonds réels et ne sont pas convertis en bonus.

## 2. Bonus de parrainage
- À l'inscription, le parrainage est enregistré mais aucun bonus n'est immédiatement crédité.
- Le bonus de 500 FCFA du parrain et le bonus de 500 FCFA du filleul sont qualifiés lorsque **le parrain et le filleul ont chacun effectué au moins un dépôt PayDunya confirmé**.
- La qualification est idempotente : un même parrainage ne peut pas créditer deux fois les mêmes bonus.

## 3. Bonus de présence
- Le bonus quotidien de présence de 50 FCFA est crédité dans le portefeuille Bonus.
- Il ne devient jamais directement investissable.

## 4. Libération automatique
- Les bonus accumulés sont transférés automatiquement du portefeuille Bonus vers le Solde.
- La libération a lieu **lundi, mercredi et vendredi**.
- Après transfert, la somme reste marquée comme **non investissable** dans le Solde.
- Le portefeuille Bonus diminue du montant transféré.

## 5. Investissement
- Lors d'un investissement, le serveur calcule : **Solde investissable = Solde - Bonus non investissable**.
- Seule cette partie peut financer un projet.
- Un utilisateur ne peut donc pas contourner la règle en transférant un bonus dans son solde.

## 6. Retraits
### Fonds réels
- Les retraits sont ouverts **du lundi au samedi**.
- La règle existante de maximum **2 retraits sur une fenêtre glissante de 24 h** est conservée.

### Fonds provenant du bonus
- Un retrait qui contient du bonus n'est autorisé que **lundi, mercredi ou vendredi**.
- Lorsqu'un bonus non investissable est disponible, la demande doit inclure **la totalité du bonus disponible** : le bonus est donc consommé en une seule opération de retrait.
- Le reste éventuel de la demande est prélevé sur le solde réel.
- Si PayDunya échoue ou si l'administrateur refuse la demande, le montant réel et la part bonus sont restaurés automatiquement.

## 7. Protection technique
- Les règles sont contrôlées côté PostgreSQL, pas seulement dans l'interface.
- Les références de ledger rendent les crédits et libérations idempotents.
- Les anciennes fonctionnalités de paiement, investissement et retrait restent sur leurs mécanismes existants, avec uniquement les contrôles nécessaires au portefeuille Bonus.

## 8. Automatisation
- Le serveur NOVA vérifie périodiquement la qualification des parrainages.
- Le serveur vérifie périodiquement la libération des bonus.
- Le dashboard affiche désormais le portefeuille Bonus dans la rangée Solde / Revenus / Recharge.