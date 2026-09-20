# Pruebas de base de datos

Las ocho pruebas de `docs/auditoria/06-qa-por-modulos.md`, en el orden que ese
documento pide: primero aislamiento entre familias, después dinero.

## Cómo se corren

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_....sql
# o todas:
for f in supabase/tests/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1; done
```

Una prueba que pasa **no imprime error y termina en 0**. Una que falla levanta
una excepción `PRUEBA FALLÓ: …` y termina en 1.

## La regla que las hace seguras

**Todas las pruebas de esta carpeta son de sólo lectura.** No insertan, no
actualizan y no borran. Se pueden correr contra producción sin pensarlo dos
veces, y se corren con el rol de servicio porque necesitan suplantar usuarios
para probar los permisos.

Eso es una decisión deliberada, no una limitación que no supimos rodear. Una
prueba que escribe —aunque revierta— toca secuencias, dispara triggers y deja
huella en tablas de auditoría de un club que está operando. No vale la pena.

## Las dos familias de pruebas, y qué prueba cada una

| Familia | Qué hace | Qué demuestra | Qué **no** demuestra |
|---|---|---|---|
| **Permisos** (01, 05) | Suplanta a un usuario real y llama la RPC con datos ajenos | Que el candado del servidor cierra | Nada sobre lo que la pantalla enseña |
| **Invariantes** (02, 03, 04, 06) | Recorre los libros reales buscando una contradicción | Que **hoy** los datos cuadran | Que el código no pueda volver a descuadrarlos mañana |

Un invariante sobre los datos de hoy no es lo mismo que una prueba de regresión
sintética. Es **más fuerte en un sentido** —revisa el libro completo, no un caso
de laboratorio— y **más débil en otro**: si la tabla está vacía, no prueba nada.
Por eso cada invariante dice cuántas filas revisó, y falla si no revisó ninguna.

## Las que faltan, y por qué

| # | Prueba | Estado |
|---|---|---|
| 07 | Ninguna lista descarga un original | En `scripts/qa-static.mjs` (barrera) y `scripts/qa-photo-cache.mjs` (ejecución). No es SQL |
| 08 | El formulario público resiste basura | **Falta.** Necesita escribir: un registro público crea filas. Requiere un ambiente de pruebas |

Las pruebas de doble envío y de reasignación de pagos **en su forma sintética**
—mandar el cobro dos veces de verdad, revertir un pago de verdad— también
necesitan escribir. Aquí están en su forma de invariante, que es lo que se puede
hacer sin tocar un club que está operando. La forma sintética espera a que haya
un ambiente aparte.
