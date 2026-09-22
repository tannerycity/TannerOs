# 04 · Rendimiento

## Frontend

Sin framework ni bundler: lo que está en el repositorio es lo que baja el
navegador. Eso evita el peso de React o de un runtime, pero deja los problemas
en la mano.

| Hallazgo | Evidencia | Severidad |
|---|---|---|
| `no-store` en todo `/v2/` | `vercel.json`: `source: "/v2/(.*)"` → `no-cache, no-store, must-revalidate` | **P1** |
| Módulos grandes sin dividir | `jugadores/app.js` 84 kB, `patrocinadores/app.js` 80 kB, `jugadores/styles.css` 56 kB | P2 |
| Cliente de Supabase sin versión fija | `esm.sh/@supabase/supabase-js@2` en cada módulo | **P1** |
| `v2_players` completo sin paginar | 56 kB, 161 registros, se recarga tras cada guardado | P2 |
| HTML suelto de 1.4 MB | `tcfc-panel-academia-v1.html` | P3 |

### `no-store` en `/v2/`

El navegador vuelve a descargar todo el JavaScript y el CSS en cada visita a
cada pantalla. Abrir Jugadores son ~200 kB entre `app.js`, `styles.css`,
`shell.js`, `styles.css` global, `icons.css` y `polish.css`, **cada vez**.

Esto es egress de **Vercel**, no de Supabase, y por eso no aparece en la factura
que disparó la alarma. Pero tiene un efecto indirecto real: como el código se
recarga, cada navegación vuelve a ejecutar `v2_my_context` y `v2_my_navigation`
(4.3 kB), más las RPC propias de la pantalla.

El motivo de ponerlo es entendible —sin build no hay hash en los nombres, y una
caché larga serviría código viejo—. La solución correcta es versionar los
assets, no apagar la caché. Ya existe el patrón en el repositorio:
`styles.css?v=20260909a`.

### Cliente de Supabase sin fijar

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

`@2` es un rango, no una versión. **Una versión menor nueva entra sola a
producción** sin que nadie la pruebe. Para un SaaS es un riesgo de
disponibilidad: un cambio de comportamiento del cliente rompe la app sin que
haya habido un despliegue.

**Solución:** fijar la versión exacta y subirla a propósito.

## Base de datos

| | |
|---|---:|
| Peso | 36 MB |
| Índices | 606 |
| **Índices nunca usados** | **292 (48%)** |
| Tablas en Realtime | 0 |

### 292 índices sin un solo uso

`pg_stat_user_indexes.idx_scan = 0`. Cada uno se mantiene en cada `INSERT` y
`UPDATE` de su tabla, ocupa espacio y alarga los backups.

**Cuidado antes de borrar:** `idx_scan = 0` puede significar que el índice
respalda una restricción única (y entonces se necesita aunque no se escanee), o
que la consulta que lo usaría todavía no se ejecuta. **No se deben borrar en
bloque.** El criterio propuesto: excluir los que respaldan PK o UNIQUE, revisar
el resto uno por uno contra la consulta que lo motivó, y borrar sólo con
evidencia.

### Lo que no se pudo medir

- **`EXPLAIN` de las consultas críticas**: no se ejecutó. Con 36 MB y 161
  jugadores, cualquier plan es rápido; los problemas aparecerán a escala y hay
  que medirlos entonces, con datos representativos.
- **Consultas lentas**: `query_logs` devolvió error de backend en los intentos.
- **Pooling y locks**: no se inspeccionaron.

## Pruebas de carga — diseñadas, no ejecutadas

No se corrieron: la restricción de no aumentar el egress lo impide, y una
prueba de carga contra producción sería además imprudente. Quedan listas para
cuando la cuota se restablezca y exista un entorno de pruebas.

| Escenario | Carga objetivo | Qué mide |
|---|---|---|
| Inicio de sesión | 20 concurrentes | Latencia de Auth, p95 |
| Abrir Jugadores | 10 concurrentes | `v2_players` 56 kB × 10, firma de miniaturas |
| Pasar lista | 5 profes a la vez | Escritura de asistencia, conflictos |
| Cobro en Taquilla | 3 concurrentes | Integridad de `payment_allocations` |
| Portal de familias | 50 concurrentes | El caso realista: todas abren el día 5 |
| Subir foto | 5 concurrentes | Compresión en cliente, egress por subida |

Umbrales propuestos: p95 < 800 ms en lectura, p95 < 1.5 s en escritura, errores
< 0.5%, y **egress por sesión de portal < 500 kB**.

La métrica que más importa para el negocio no es la latencia: es **kB por sesión**.
Es la que se descontroló y la que hay que vigilar.
