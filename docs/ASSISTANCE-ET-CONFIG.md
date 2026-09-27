# Assistance et configuration locale NOVA

## Coordonnées de support
Dans `assets/js/config.js`, personnaliser les valeurs `supportPhone`, `whatsapp`, `telegramService`, `telegramChannel` et `telegramGroup`. Les coordonnées actuellement présentes sont des valeurs provisoires d'exemple et doivent être remplacées par les coordonnées officielles avant publication.

## Fichier .env
Le fichier `.env` est prévu pour le serveur Node/PayDunya. Il est ignoré par Git. Les clés privées PayDunya et la clé Supabase `service_role` ne doivent jamais être placées dans les fichiers HTML/JS publics. `.env.example` est le modèle sans secrets.

## Connexion Supabase
Le client public Supabase est initialisé par `assets/js/supabase-client.js` et utilise la clé publishable. Cela prépare l'accès au service; cela ne signifie pas que toutes les actions du tableau de bord ont déjà été migrées. Le stockage local historique du prototype et plusieurs actions de démonstration doivent encore être remplacés par des opérations serveur/Supabase sécurisées avant un usage réel.
