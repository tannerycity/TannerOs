# Propuestas de migración · NO APLICADAS

Lo que hay aquí **no está en la base de datos** y **no se ha probado contra
ella**. Son propuestas, escritas para que alguien las lea, las discuta y decida.

Viven fuera de `supabase/migrations/` a propósito: ahí sólo van las migraciones
**ya aplicadas**, y `qa-static.mjs` falla si aparece una que no lo esté.

## Cómo se aprueba una

1. Se lee y se discute.
2. Se aplica en una **rama de Supabase**, no en producción.
3. Se prueba ahí: que hace lo que dice, y que su reverso la deshace.
4. Se aplica a producción.
5. Se exporta a `supabase/migrations/` y se corre
   `node scripts/manifiesto-migraciones.mjs --escribir`.
6. Se borra de esta carpeta.

Ninguna migración de aquí debe aplicarse directo a producción.
