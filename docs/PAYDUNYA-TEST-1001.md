# PayDunya TEST — erreur 1001

Le serveur utilise le sandbox PayDunya lorsque `PAYDUNYA_MODE=test` :
`https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create`.

PayDunya exige que les clés de test appartiennent à la même application que celle utilisée pour l'intégration. Les clés doivent être récupérées dans PayDunya Business > Integration API > Details de l'application concernée. La documentation PayDunya indique de choisir le mode test pour les essais et de remplacer les clés de test par les clés de production lors du passage en LIVE.

Dans NOVA, la configuration est séparée pour éviter un mélange accidentel :

- `PAYDUNYA_MASTER_KEY`
- `PAYDUNYA_TEST_PRIVATE_KEY`
- `PAYDUNYA_TEST_TOKEN`

Le serveur accepte encore `PAYDUNYA_PRIVATE_KEY` et `PAYDUNYA_TOKEN` comme fallback pour compatibilité.

## Diagnostic local

Après redémarrage de Node :

```powershell
Invoke-RestMethod http://localhost:3000/api/health | ConvertTo-Json -Depth 5
```

La réponse affiche seulement la présence, la longueur et le préfixe des clés. Elle n'affiche jamais leur valeur.

Pour un mode TEST, les valeurs doivent provenir du même bouton `Details` de la même application PayDunya. Si PayDunya répond encore `1001 TEST Private Key and Token combination is invalid`, les clés chargées par le serveur ne forment pas une paire TEST valide pour cette application.
