# NOVA — Immobilier & Énergies renouvelables

Site web complet (maquette de démonstration) inspiré de l'architecture d'un
plateforme de type « investissement local » : page d'accueil marketing,
inscription/connexion, tableau de bord avec solde, projets d'investissement,
centre de parrainage, assistance WhatsApp/Télégramme, portefeuille mobile money,
retraits, pointage de présence, publications et historique — le tout adapté au
domaine **immobilier + énergies renouvelables**.

> ⚠️ **Mode démonstration** : aucun backend, aucun paiement réel.
> Les données (comptes, soldes, transactions) sont stockées dans le
> `localStorage` du navigateur. Les rendements affichés sont des
> **estimations indicatives** : aucun rendement n'est garanti.

---

## 🚀 Lancer le site

Aucune installation nécessaire.

**Option 1 (simple)** : ouvrir `index.html` dans un navigateur (double-clic).

**Option 2 (recommandée, serveur local)** :

```bash
cd nova-site
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

### 🔑 Compte de démonstration

| Identifiant | Mot de passe | Pays    |
|-------------|--------------|---------|
| `demo`      | `demo2026`   | Togo (+228) |

Le compte démo contient un solde, un investissement en cours et 2 filleuls
pour illustrer la page Équipe. Vous pouvez aussi **créer votre propre compte**
via `register.html` (les données restent dans votre navigateur).

### 🛠️ Espace administrateur (`admin.html`)

Connexion : téléphone + mot de passe via Supabase. L’accès admin est contrôlé côté serveur par `profiles.role` (`admin`, `SUPER_ADMIN` ou `super_admin`).

L'administrateur peut :
- **Publier un projet** : type (Projet / Plan Spécial), badge, titre,
  description, **montant à investir**, **gain par jour (estimé)**, **durée**
  (le gain total est calculé automatiquement), image.
- **Activer / masquer** ou **supprimer** un projet publié.

Chaque projet publié s'affiche automatiquement sur la **page d'accueil**
(section « Nos projets ») et dans le **tableau de bord** des membres, avec
les 4 informations : montant à investir, gain/jour, durée, gain total.
Les projets sont **tris du plus petit au plus grand montant**.
(Les projets définis dans `config.js` sont intégrés au code et non supprimables
depuis l'interface.)

---

## 📁 Structure du projet

```
nova-site/
├── index.html               # Page d'accueil (landing marketing)
├── register.html            # Inscription
├── login.html               # Connexion
├── app.html                 # Application membre (toutes les vues)
└── assets/
    ├── css/style.css        # Styles globaux (mobile first)
    ├── img/                 # Logo SVG + images des projets
    └── js/
        ├── config.js        # ⚙️ MARQUE, PROJETS, OPÉRATEURS, CONTACTS
        ├── icons.js         # Sprite d'icônes SVG (aucune dépendance)
        ├── store.js         # Stockage local + compte démo
        ├── main.js          # Logique de la page d'accueil
        ├── auth.js          # Inscription / connexion
        ├── app.js           # Tableau de bord (routeur + actions)
        └── admin.js         # Espace administrateur (publication de projets)
```

## 🧭 Pages / vues

| Page  | Contenu |
|-------|---------|
| `index.html` | **Page d'accueil simple** (style tableau de bord) : bannière hero « dès 3 000 FCFA » avec **photos panneaux solaires + immeubles**, cartes SOLDE / REVENUS / RECHARGE, 4 actions rapides (Recharger · Retrait · Présence · Assistance), onglets **Projets / Plans Spéciaux** (triés du plus petit au plus grand), **navigation basse à 5 icônes** (Accueil · Équipe · Investissements · Assistance · Mon Compte) |
| `admin.html` | **Espace administrateur** : publication / activation / suppression des projets (connectez-vous avec `admin` / `admin2026`) |
| `register.html` | Formulaire d'inscription (pays, téléphone, mot de passe, code parrainage) |
| `login.html` | Connexion par identifiant/téléphone + mot de passe |
| `app.html` | Tableau de bord : solde/revenus/recharge, actions rapides, onglets **Projets** et **Plans Spéciaux**, cartes d'investissement |
| `#/recharger` | Recharge mobile money (pays → opérateur, numéro, nom du titulaire) |
| `#/retrait` | Demande de retrait sur portefeuille mobile money |
| `#/presence` | Pointage de présence quotidien (série de jours) |
| `#/assistance` | WhatsApp, service client Télégramme, groupe de discussion |
| `#/equipe` | Lien de parrainage, aperçu de l'équipe, règles de commission |
| `#/investissements` | **Mes Investissements** : total investi, nombre en cours, gains cumulés, liste détaillée (progression x/j jours, statut En cours / Terminé) |
| `#/publications` | Actualités des projets (accessible depuis Mon Compte → Paramètres) |
| `#/historique` | Transactions (recharges, investissements, gains, retraits) |
| `#/compte` | Profil, paramètres (sécurité, portefeuille, historique), déconnexion |

---

## ⚙️ Personnalisation (tout est dans `assets/js/config.js`)

```js
window.NOVA = {
  brand: "NOVA",                 // nom de la marque
  whatsapp: "",                  // remplir avec le vrai numéro international sans +
  telegramService: "",           // vrai lien Telegram du service client
  telegramGroup: "",             // vrai lien du groupe Telegram
  email: "...",
  referralRate: 0.03,            // commission parrainage (3 %, 1 niveau)
  countries: [ ... ],            // pays & opérateurs mobile money
  plans: [ ... ],                // projets (prix, gain/jour estimé, durée)
  specials: [ ... ],             // plans spéciaux
  news: [ ... ],                 // publications
  stats: { ... },                // chiffres de présentation
  disclaimer: "..."              // mention légale du footer
};
```

Changer la marque, les couleurs : voir les variables CSS en haut de
`assets/css/style.css` (`--brand`, `--header-grad`, etc.) et `assets/img/logo.svg`.

## 🔌 Connexion à Supabase (version actuelle)

Les données métier de NOVA (profil, solde, projets, investissements, bonus, retraits et journal) ne sont plus stockées par l'application dans `localStorage`. Elles sont lues et écrites via Supabase et les endpoints serveur. `assets/js/store.js` ne contient plus que des utilitaires d'affichage (formatage, dates, initiales et toast).

Le SDK Supabase peut conserver la session d'authentification dans le navigateur (`persistSession: true`) afin de maintenir la connexion. Cela ne constitue pas le stockage local des soldes ou des données financières de NOVA.

1. **Créer un projet** sur [supabase.com](https://supabase.com), copier
   `URL` et `anon key` → `config.js` (`supabase.url`, `supabase.anonKey`).
2. **Ajouter le client** (avant `store.js`) dans chaque page :
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```
3. **Tables SQL suggérées** :
   ```sql
   create table profiles (
     id text primary key,
     username text, phone text, country text,
     password_hash text, wallet jsonb,
     created_at timestamptz default now()
   );
   create table projects (
     id text primary key,
     badge text, title text, description text, img text,
     price int, daily int, days int,
     special boolean default false, active boolean default true,
     created_at timestamptz default now()
   );
   create table investments (
     id text primary key,
     user_id text references profiles(id),
     project_id text references projects(id),
     price int, daily int, days int,
     started_at timestamptz default now(), earned int default 0
   );
   create table transactions (
     id text primary key,
     user_id text references profiles(id),
     label text, amount int,
     created_at timestamptz default now()
   );
   ```
4. **Remplacer les fonctions de `store.js`** par des appels Supabase :
   - `getUsers/saveUsers` → `profiles` (+ `supabase.auth` pour la connexion,
     remplacer les mots de passe en clair par `supabase.auth.signUp/signIn`)
   - `allProjects/getAdminProjects/saveAdminProjects` → `projects`
     (la page admin publie alors dans la table)
   - historique / investissements → `transactions` / `investments`
   - Le « tick » de gains dans `app.js` devient un scheduled function Supabase
     (cron) qui crédite les gains quotidiens.

## 🔒 Notes importantes

- **Frontend uniquement** : pour un vrai service, il faudra un serveur,
  une base de données, une intégration mobile money (API opérateur),
  une authentification réelle et un cadre juridique (autorisations,
  prospectus, protection de l'épargne).
- **Rendements** : les montants de gain affichés sont des estimations
  indicatives (≈ 10 %/an) présentées à titre d'illustration.
- **Parrainage** : simple, à un seul niveau (3 % du 1er versement),
  sans structure multi-niveaux.

---

## PayDunya — API serveur

Le dossier `server/` contient un backend Node/Express pour créer une facture PayDunya et recevoir le callback. Les clés privées PayDunya et la clé `service_role` Supabase doivent rester exclusivement dans `.env` côté serveur. Ne les mettez jamais dans `assets/js/` ni dans le navigateur.

### Configuration

1. Installer Node.js 20 ou plus récent.
2. Copier `.env.example` vers `.env` et renseigner les clés obtenues dans Supabase et PayDunya. Pour la production, configurer `PAYDUNYA_MODE=live` et utiliser exclusivement les clés LIVE de la même application PayDunya.
3. Exécuter les migrations SQL du dossier `supabase/migrations/` dans l'ordre chronologique sur le projet Supabase cible.
4. Installer les dépendances avec `npm install`, puis démarrer avec `npm start` (ou `npm run dev`).
5. Vérifier `http://localhost:3000/api/health`.

### Endpoints prévus

- `POST /api/payments/paydunya/create` — nécessite `Authorization: Bearer <access_token Supabase>` et un JSON `{ "amount": 1000 }`. Répond avec `checkout_url`.
- `POST /api/payments/paydunya/callback` — ancienne route compatible.
- `POST /payments/webhooks/paydunya` — callback public recommandé pour PayDunya ; vérifie le hash SHA-512, confirme la facture via l'API PayDunya et crédite le portefeuille une seule fois via Supabase.

La création de facture envoie maintenant `custom_data` et `actions` au bon niveau racine attendu par l'API HTTP/JSON PayDunya. Les réponses du prestataire sont également remontées dans l'interface pour faciliter le diagnostic.

Pour un paiement réel, `PAYDUNYA_CALLBACK_URL` doit être une URL HTTPS publique, par exemple `https://votre-domaine.com/payments/webhooks/paydunya`. `localhost` ne peut pas recevoir les notifications envoyées depuis PayDunya.


## Nettoyage des projets de démonstration

Les projets de démonstration ont été retirés de la configuration. Les projets affichés dans l'espace membre proviennent de Supabase et seuls les projets publiés sont visibles.

**Important pour les clés API :** le fichier `.env` est lu uniquement par le serveur Node. La clé publishable/anon peut être utilisée côté navigateur avec RLS correctement configuré ; la clé `service_role` et les clés secrètes PayDunya restent exclusivement côté serveur.


## Mise à jour PWA et sécurité de recharge
- Le manifeste PWA et le service worker sont ajoutés (cache de fichiers de base et fallback de navigation). L'installation nécessite HTTPS ou localhost.
- Les requêtes `/api/` ne sont jamais mises en cache.
- La recharge locale ne crédite plus le solde : elle affiche un message tant que le paiement n'a pas été confirmé côté serveur.
- La clé Supabase publique est préremplie dans `assets/js/config.js`; elle ne remplace pas une intégration complète de l'authentification, du portefeuille et des opérations financières. Ne jamais exposer une clé `service_role` dans le navigateur.


## Mise à jour de la connexion Supabase, admin et opérations

Cette version relie les données visibles à Supabase et retire le stockage métier local de `NovaStore`. Le SDK Supabase peut conserver la session d'authentification dans le navigateur, mais les profils, soldes, projets, investissements et écritures de portefeuille sont lus depuis la base.

### Mise en place
1. Installer Node.js 20 ou plus récent, puis `npm install`.
2. Copier `.env.example` vers `.env` et remplir les secrets uniquement côté serveur. Ne jamais publier `SUPABASE_SERVICE_ROLE_KEY` ni les clés privées PayDunya.
3. Appliquer la migration `supabase/migrations/202609270001_secure_investment_bonus.sql` si elle n'est pas déjà appliquée.
4. Démarrer avec `npm start`.
5. Configurer un callback PayDunya HTTPS public avant d'activer le mode LIVE.

### Flux reliés
- Admin : authentification Supabase par téléphone/mot de passe, rôle `profiles.role = 'admin'` vérifié côté API; création, masquage, clôture/suppression des projets dans Supabase.
- Investissement : `POST /api/investments`; le serveur utilise le token vérifié et appelle `nova_create_investment`, qui vérifie le projet et le solde, crée l'investissement et débite le portefeuille de façon transactionnelle.
- Présence : `POST /api/bonus/claim`; une prime de 50 FCFA peut être créditée une fois par période de 24 h avec journal de portefeuille.
- Paiement : la recharge reste en attente jusqu'à la confirmation PayDunya côté serveur. Le callback HTTPS et les identifiants marchands LIVE doivent être configurés pour des transactions réelles.

### Limites à valider avant la production
- Les rendements journaliers automatiques, la restitution du capital à échéance, les règles complètes de parrainage et le paiement automatique des retraits ne sont pas activés par ces changements.
- Effectuer d'abord des essais sandbox et vérifier les statuts/écritures Supabase avant toute opération réelle.
