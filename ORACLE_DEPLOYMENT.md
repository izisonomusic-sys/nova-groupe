# Préparation Oracle Cloud — frontend statique TTE Energy

## Architecture retenue

- Oracle Cloud/Nginx sert les pages HTML, CSS, JavaScript, images et le service worker.
- Supabase reste responsable de l'authentification et conserve les comptes/sessions.
- Render reste l'API métier : paiements, retraits, opérations financières, données du tableau de bord et administration.
- Ne pas démarrer `server/index.js` sur Oracle. Ne pas copier les secrets Render ni un fichier `.env` sur le serveur web.

## Routage à préserver

Le script `assets/js/auth.js` garde la logique actuelle :
- visiteur non connecté à la racine ou à `index.html` : redirection vers `register.html` ;
- session Supabase active : redirection vers `app.html` ;
- `register.html` et `login.html` restent accessibles et redirigent un membre déjà connecté vers `app.html`.

Ne pas remplacer cette logique et ne pas déplacer Supabase Auth vers Render ou Oracle.

## Contenu à publier sur Oracle

Copier les pages HTML du frontend, le dossier `assets/`, `manifest.webmanifest` et `service-worker.js` dans `/var/www/tte-energy/`.

Ne pas publier les éléments serveur tels que `server/`, `node_modules/`, les fichiers de secrets, ou les fichiers d'environnement.

## Nginx

Le fichier `oracle/nginx.conf.example` est un exemple à adapter :
1. remplacer `VOTRE_DOMAINE` par le domaine réellement utilisé ;
2. vérifier que `root` correspond au répertoire de publication ;
3. valider la configuration avec `nginx -t` ;
4. activer HTTPS avant d'ouvrir le site au public (Supabase Auth nécessite un contexte sécurisé en production).

La configuration ne fait aucun proxy vers Render et ne réécrit pas les URL vers une API locale. Les appels métier continuent d'utiliser l'URL Render définie dans `assets/js/config.js`.

## Vérifications avant bascule DNS

- Ouvrir la racine en navigation privée : elle doit aboutir à `register.html`.
- Se connecter avec un compte de test autorisé : la racine doit aboutir à `app.html`.
- Vérifier que l'inscription et la connexion utilisent toujours Supabase.
- Vérifier les appels API Render depuis le nouveau domaine (CORS et URL d'authentification autorisée dans Supabase).
- Vérifier le service worker et les pages hors ligne.
- Vérifier les parcours tableau de bord, recharge et retrait avec des comptes/environnements de test, sans effectuer de transaction réelle.

## État de cette préparation

Ces fichiers sont des éléments de préparation seulement. Aucun serveur Oracle, DNS, certificat TLS, paramètre Supabase, service Render ou donnée de production n'a été modifié. Ne basculer le domaine qu'après validation explicite et tests sur le domaine de préproduction.
