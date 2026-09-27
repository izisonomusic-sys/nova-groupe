# NOVA — Audit stockage, PayDunya et mobile

Date : 27 septembre 2026

## Stockage navigateur

Aucune écriture `localStorage`, `sessionStorage` ou IndexedDB n'est utilisée par le code métier de NOVA. `assets/js/store.js` ne fait que formater les données et afficher les messages.

Le SDK Supabase est configuré avec `persistSession: true` dans `assets/js/auth.js` afin de maintenir la session de connexion. Cette persistance concerne la session d'authentification du SDK, pas les soldes, investissements, bonus ou transactions.

## PayDunya

La création de facture utilise :

`https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create` en test

ou

`https://app.paydunya.com/api/v1/checkout-invoice/create` en production.

Le JSON respecte la structure HTTP/JSON PayDunya : `invoice.total_amount`, `invoice.description`, `invoice.customer`, `store`, `custom_data` et `actions` au niveau racine.

Callback recommandé :

`/payments/webhooks/paydunya`

Le callback PayDunya arrive en `application/x-www-form-urlencoded` sous la clé `data`. Le serveur vérifie le SHA-512 du MasterKey puis appelle l'endpoint de confirmation PayDunya avant de créditer Supabase.

## Mobile

L'icône « Mon Compte » de la navigation basse utilise désormais un SVG inline au lieu d'un symbole chargé dynamiquement. Cela évite le défaut de premier rendu observé sur mobile avec le sprite SVG et garantit que l'icône reste visible dès l'ouverture de `app.html#home`.

## Vérifications techniques

- Syntaxe Node.js du serveur vérifiée avec `node --check`.
- Recherche du stockage navigateur effectuée sur `assets/js`, les pages HTML et `server`.
- Présence des deux routes PayDunya vérifiée.
- Présence du callback public dans `.env.example` vérifiée.
