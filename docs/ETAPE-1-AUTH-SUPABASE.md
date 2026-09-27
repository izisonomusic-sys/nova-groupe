# NOVA — Étape 1 : Authentification Supabase

Cette étape relie l'ouverture de l'espace membre à la session Supabase au lieu de dépendre de la session locale de démonstration. Elle crée le profil et le portefeuille vide par un trigger SQL lors de la création du compte.

## Fichiers modifiés
- `assets/js/auth.js` : la création de compte s'appuie sur le profil créé côté base.
- `assets/js/app.js` : vérifie la session Supabase, charge le profil et déconnecte via Supabase. Le solde est initialisé à zéro dans cette étape ; la lecture réelle du portefeuille sera traitée à l'étape suivante.
- `supabase/migrations/202609260003_auth_profile_trigger.sql` : trigger pour créer le profil et le solde initial.

## À appliquer dans Supabase
Dans Supabase Dashboard > SQL Editor, exécuter le contenu de `supabase/migrations/202609260003_auth_profile_trigger.sql`.

## Configuration requise
- Vérifier que l'URL Supabase et la clé publique dans `assets/js/config.js` sont celles du projet NOVA.
- Pour une inscription téléphone/mot de passe sans OTP, la confirmation du téléphone doit être désactivée dans les paramètres Auth de Supabase.
- Ne jamais mettre la clé service_role dans les fichiers du navigateur.

## Tests de l'étape 1
1. Créer un compte avec un numéro de téléphone valide et un mot de passe d'au moins 8 caractères.
2. Vérifier dans `auth.users` et `public.profiles` que le compte et le profil sont créés.
3. Vérifier qu'une ligne à 0 FCFA est créée dans `public.wallet_balances`.
4. Actualiser `app.html` : la session doit rester active.
5. Cliquer sur Déconnexion puis se reconnecter.

Cette étape n'active pas encore les dépôts, investissements, retraits, bonus ni parrainage. Ces opérations restent désactivées/non certifiées jusqu'à la mise en place des opérations serveur sécurisées.
