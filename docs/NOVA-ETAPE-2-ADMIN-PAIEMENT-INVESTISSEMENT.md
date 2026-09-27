# NOVA — Étape 2 : Supabase, admin, investissement, bonus et PWA

## Changements apportés
- `NovaStore` ne gère plus de données utilisateur/projet dans le navigateur; il conserve seulement des utilitaires de formatage et de toast.
- La page d'accueil et l'espace membre lisent les projets, le portefeuille, les investissements et le journal dans Supabase.
- La connexion admin utilise Supabase Auth par téléphone et mot de passe, puis vérifie `profiles.role = admin`.
- Les opérations d'administration de projets passent par des routes serveur qui vérifient le rôle admin.
- Le serveur expose `POST /api/investments` et `POST /api/bonus/claim`; l'identité vient du token Supabase vérifié, pas du corps de requête.
- La migration ajoute des fonctions financières transactionnelles : débit du portefeuille pour investissement et bonus de présence de 50 FCFA limité à une fois par 24 h.
- Manifeste PWA, icônes PNG 192/512 et cache versionné mis à jour.
- Ajustements CSS petits écrans.

## Mise en service
1. `npm install`
2. Compléter `.env` à partir de `.env.example` avec les secrets du serveur.
3. Appliquer `supabase/migrations/202609270001_secure_investment_bonus.sql` si les changements correspondants ne sont pas déjà présents.
4. `npm start`, puis ouvrir `http://localhost:3000`.
5. Admin : ouvrir `/admin.html` et se connecter avec le téléphone du compte Supabase qui possède le rôle `admin`.
6. Tester d'abord avec un compte de test et PayDunya sandbox. Les paiements LIVE nécessitent des clés marchands LIVE et un callback public HTTPS.

## Limites restantes
- Aucun paiement LIVE n'a été effectué ni vérifié dans cette archive.
- Le traitement automatique des rendements journaliers, la restitution du principal à maturité, le parrainage et l'exécution des retraits ne sont pas inclus dans cette étape.
- La vérification mobile a été faite par revue statique du CSS et des points de rupture; un test visuel sur téléphone/navigateur reste nécessaire.
