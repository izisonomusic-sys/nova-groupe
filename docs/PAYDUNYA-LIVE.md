# PayDunya — mode LIVE

Le modèle `.env.example` est maintenant réglé sur `PAYDUNYA_MODE=live`. Le serveur choisit alors l’API de production PayDunya (`https://app.paydunya.com/api/v1`).

## Variables serveur nécessaires

Renseigner uniquement dans le fichier `.env` du serveur (jamais dans le JavaScript du navigateur) :

- `PAYDUNYA_MODE=live`
- `PAYDUNYA_MASTER_KEY` : clé LIVE du marchand
- `PAYDUNYA_PRIVATE_KEY` : clé LIVE du marchand
- `PAYDUNYA_TOKEN` : token LIVE du marchand
- `PAYDUNYA_CALLBACK_URL` : URL HTTPS publique vers `/payments/webhooks/paydunya` (route compatible également avec `/api/payments/paydunya/callback`)
- `PAYDUNYA_RETURN_URL` et `PAYDUNYA_CANCEL_URL` : URLs publiques du site
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` : secrets serveur uniquement

**Attention :** le mode LIVE peut débiter de vrais clients. Avant toute utilisation, effectuer un contrôle marchand, vérifier les clés LIVE et le callback, appliquer les migrations SQL et réaliser un paiement contrôlé de faible montant. `localhost` n’est pas accessible par le callback PayDunya. Ne pas publier ni partager le fichier `.env`.

## Retour au mode test

Définir `PAYDUNYA_MODE=test` puis redémarrer le serveur.

## Limite importante

Le mode LIVE configure l’endpoint de production, mais ne prouve pas que le compte marchand, les clés, le callback, les migrations ou le crédit du portefeuille ont été validés en production. Les données métier de NOVA ne sont plus stockées par l’application dans le stockage navigateur. Le SDK Supabase peut toutefois conserver la session d’authentification pour maintenir la connexion.

## Erreur PayDunya 1001

Si PayDunya répond `1001` avec `TEST Private Key and Token combination is invalid`, le problème vient des identifiants PayDunya : `PAYDUNYA_PRIVATE_KEY` et `PAYDUNYA_TOKEN` ne correspondent pas à la même application ou au même mode. Recopiez ensemble les clés TEST de la même application dans `.env`, redémarrez Node, puis vérifiez `/api/health`.


## Test local en mode LIVE
La création de facture LIVE peut être testée depuis `http://localhost:3000`. Les URLs `return_url`, `cancel_url` et `callback_url` sont optionnelles à la création ; pour recevoir les notifications IPN en production, configurez ensuite un endpoint public HTTPS.
