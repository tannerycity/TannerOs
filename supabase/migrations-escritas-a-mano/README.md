# Migraciones escritas a mano

Estos once archivos se escribieron a mano **antes** de que el historial real se
exportara a `supabase/migrations/` (20 de septiembre de 2026).

**No los apliques.** Su contenido ya está en producción, y el historial
exportado —378 archivos, verificado byte por byte contra
`supabase_migrations.schema_migrations`— es la fuente de verdad.

Se conservan por dos razones: nada se borra, y `scripts/qa-static.mjs` los lee
como contrato para verificar que ciertas reglas siguen escritas.

Seis de los once tienen su gemelo exacto en el export. Los otros cinco se
aplicaron con otro nombre o partidos en varias migraciones:

| Escrito a mano | En el historial real |
|---|---|
| `centro_tanner_functions` | `centro_tanner_functions_public` + `_admin` |
| `centro_tanner_policies_bulk` | `centro_tanner_policies_batch_1` … `_4` |
| `archive_legacy_player_evaluations` | no aparece con ese nombre |
| `delete_legacy_player_evaluations` | no aparece con ese nombre |
| `delete_parking_pass_rpc` | `delete_parking_pass_rpc` (otra marca de tiempo) |

De aquí en adelante, **toda migración nueva se escribe en
`supabase/migrations/` con la marca de tiempo de Supabase**, y `qa-static.mjs`
falla si el historial y el repositorio se separan otra vez.
