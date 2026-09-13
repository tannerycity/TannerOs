# Limpieza inicial de evaluaciones TC 1.0

La migración `202609130001_delete_legacy_player_evaluations.sql` elimina de
forma definitiva todas las evaluaciones de prueba anteriores a TC 1.0. Producto
confirmó que esos registros no representan historial deportivo válido.

Se conservan exclusivamente las evaluaciones cuya nota comienza con
`[TC_1.0] `. La operación corre dentro de una transacción y se revierte si la
tabla esperada no existe o si queda cualquier registro legacy.

## Verificación previa

```sql
select count(*) as evaluaciones_legacy_a_eliminar
from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';
```

## Verificación posterior

```sql
select count(*) as evaluaciones_tc_1_0
from app.player_evaluations
where notes like '[TC_1.0] %';

select count(*) as evaluaciones_legacy_restantes
from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';
```

`evaluaciones_legacy_restantes` debe ser cero. Este repositorio no ejecuta SQL
automáticamente en Supabase: la migración debe aplicarse con el pipeline de base
de datos o el SQL Editor autorizado.
