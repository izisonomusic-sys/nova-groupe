# Diagnostic PayDunya → Supabase

Le webhook PayDunya est reçu en `application/x-www-form-urlencoded`, le champ `data` est décodé,
puis l'invoice est confirmée auprès de PayDunya.

Le statut métier est lu dans `confirmed.invoice.status` (et non `confirmed.status`).

Avant l'appel RPC, le serveur journalise `paymentId` et le montant. Après l'appel RPC,
il journalise `ok`, `message`, `code`, `details` et `hint` sans exposer les clés secrètes.

Après déploiement, pour un paiement réellement `completed`, les logs attendus sont :

```text
[PAYDUNYA] webhook received
[PAYDUNYA] token received ...
[PAYDUNYA] confirm response ... status: 'completed'
[PAYDUNYA] about to call credit RPC ...
[PAYDUNYA] credit RPC result { ok: true, error: null }
[PAYDUNYA] payment credited successfully ...
```

Si `ok: false`, la propriété `error.message/code/details/hint` indique le blocage exact
du RPC Supabase.

La migration `202609290002_harden_paydunya_confirmation.sql` réaligne la fonction RPC
de production avec le schéma actuel sans changer le parcours utilisateur.
