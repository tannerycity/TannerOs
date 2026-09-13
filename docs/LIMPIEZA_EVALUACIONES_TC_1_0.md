# Limpieza inicial de evaluaciones TC 1.0

La migración `202609130001_archive_legacy_player_evaluations.sql` retira todas
las evaluaciones anteriores a la metodología TC 1.0 de la tabla activa.

Para evitar una pérdida irreversible accidental, primero copia esas filas a
`app.player_evaluations_legacy_archive_20260913` y después las elimina de
`app.player_evaluations`. Las evaluaciones cuya nota comienza con
`[TC_1.0] ` se conservan.

La operación corre en una transacción y falla sin modificar datos si la tabla
esperada no existe o si alguna fila anterior permanece después del `delete`.

## Verificación posterior al despliegue

```sql
select count(*) as evaluaciones_activas
from app.player_evaluations;

select count(*) as pruebas_archivadas
from app.player_evaluations_legacy_archive_20260913;

select count(*) as evaluaciones_anteriores_restantes
from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';
```

El último conteo debe ser cero. Este repositorio no despliega automáticamente
migraciones a Supabase: la migración debe ejecutarse mediante el pipeline de
base de datos o el SQL Editor autorizado y verificarse antes de borrar el
archivo de respaldo.
