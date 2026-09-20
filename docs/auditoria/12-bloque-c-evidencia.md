# 12 · Bloque C · rendimiento

Rama `claude/auditoria-saas-egress`. **No desplegado. No se modificó la base de
datos: todas las consultas de este documento son de sólo lectura.**

## Resumen

De los tres pasos del Bloque C, **uno se hizo y dos NO deben hacerse todavía**.
La medición lo dijo, no la intuición.

| Paso | Plan | Veredicto | Por qué |
|---|---|---|---|
| C1 · fijar el cliente de Supabase | Hacer | **Hecho** | `@2` es flotante y hay una 3.0 en camino |
| C2 · paginar `v2_players` | Hacer | **Todavía no** | 55.8 kB con 75 jugadores; es trabajo de SaaS, no de hoy |
| C3 · podar índices sin uso | Hacer con evidencia | **No hacer** | 3.19 MB en una base de 36 MB; la tabla más escrita del sistema lleva 2,524 escrituras **en toda su vida** |

Y apareció **un hallazgo nuevo**, más grande que los tres: una sola consulta
—que no es de la aplicación— se lleva más tiempo de base de datos que todas las
RPC del club juntas.

## C1 · el cliente de Supabase ya no cambia solo

### El problema

Los **30 archivos** que hablan con Supabase importaban cada uno por su cuenta:

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

Ese `@2` **no es una versión, es un rango.** Resuelve a la última 2.x que exista
**en el momento en que un navegador la pide**. El club podía amanecer con un
cliente que nadie eligió ni probó, sin que se hubiera desplegado nada.

Y no es teórico: en el registro de npm, hoy, junto a la `latest` 2.116.0 hay ya
una **`next: 3.0.0`**. Cuando esa rama se mueva, este rango es una bomba de
tiempo.

### El cambio

`v2/supabase-client.js` es ahora el **único archivo del sistema** que nombra al
CDN y a la versión:

```js
export { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
```

Los 30 archivos importan de ahí. Eso hace dos cosas: congela lo que corre hoy, y
deja **un solo renglón** que cambiar el día que haya que subir de versión o
salirse de esm.sh.

**2.116.0 es exactamente lo que `@2` resuelve hoy** (`latest` de npm para la
rama 2.x, consultado el 20 de septiembre de 2026). Fijarla **no cambia nada
ahora**: sólo evita que cambie sola mañana. Es el pin más conservador posible.

### Las barreras

`qa-static.mjs` gana dos, las dos verificadas con una regresión deliberada:

```
- Disponibilidad: v2/calendario/app.js importa el cliente del CDN por su cuenta
- Disponibilidad: v2/supabase-client.js no fija una versión exacta del cliente
```

### Lo que NO se pudo verificar aquí

**Este entorno no alcanza esm.sh** —lo bloquea la política de red— así que no
pude cargar la URL fijada y confirmar que responde. La verifiqué contra el
registro de npm, que sí alcanzo.

**Antes de desplegar, alguien tiene que abrir una pantalla con red de verdad y
confirmar que entra.** Es un cambio de un renglón si falla, pero si falla,
falla todo a la vez.

### Humo de las 47 pantallas

Como el cambio toca 30 archivos, se cargaron **todas** las pantallas del
repositorio en Chromium. Ninguna con errores:

```
Humo de navegador OK · 47 pantallas sin errores
```

Ese arnés queda en `scripts/qa-humo-navegador.mjs`. Existe porque `node --check`
valida sintaxis y nada más: no ve una referencia a algo que no existe ni una
constante declarada dos veces, y las dos cosas ya tumbaron pantallas enteras en
producción.

## C2 · paginar `v2_players` · todavía no

### Lo medido

Ejecutando la RPC de verdad, suplantando a un usuario real:

```
jugadores = 75 · json_total = 55.8 kB · 762 bytes por jugador · 26 campos
campo más pesado: photo_path (6.2 kB en total, 83 bytes por jugador)
```

*(El documento `02` decía 161 registros; son **75**. El peso sí coincide.)*

### Por qué no ahora

**No hay grasa que quitar.** Los 26 campos son chicos y se usan; el más pesado
es la ruta de la foto, que no se puede acortar. 762 bytes por jugador es JSON
denso y honesto.

Paginar significa una RPC nueva, una migración, y migrar **nueve pantallas**
(`v2/app.js`, `hub.js`, `jugadores`, `calendario`, `deportivo`,
`estacionamiento`, `porteros`, `qa`, `admin/fotos`), con una ventana en la que
conviven las dos versiones. Todo eso para ahorrar unos kB que además viajan
comprimidos.

**Cuándo sí:** con 2,000 jugadores esto es 1.5 MB por llamada y deja de ser
opcional. Es exactamente lo que decía `02` —«moderado hoy, grave en SaaS»— así
que su lugar es el **Bloque E**, como requisito de multi-tenant, no el C.

## C3 · podar índices · no hacer

El plan pedía podar **con evidencia, uno por uno**. La evidencia dice que no.

### Lo medido

```
índices totales (app + public)      606
sin uso y no únicos                 207
peso de esos 207                  3,192 kB
peso de TODOS los índices        10,184 kB
peso de la base de datos             36 MB
```

Las estadísticas **nunca se han reiniciado** (`stats_reset` es nulo), así que
ese «sin uso» cubre toda la vida de la base. El dato es bueno.

### Por qué no

**Tres megabytes.** En una base de 36 MB, con 500 MB de límite en el plan
gratuito. Eso solo ya no justifica tocar producción.

El otro costo de un índice sin uso es que encarece cada escritura. Así que se
midió cuánto se escribe de verdad:

| Tabla | Escrituras **en toda su vida** | Índices muertos | Peso muerto |
|---|---:|---:|---:|
| `public.audit_log` | 2,524 | 1 | 40 kB |
| `app.audit_events` | 1,280 | 1 | 160 kB |
| `app.payments` | 989 | 2 | 32 kB |
| `app.attendance_records` | 760 | 1 | 16 kB |
| `app.charges` | 726 | 2 | 24 kB |

La tabla más escrita de todo el sistema lleva **2,524 escrituras en su vida
entera**. No por segundo: en total. El sobrecosto de uno o dos índices ahí no se
puede ni medir.

### Y hay una trampa

Cuatro de los índices «sin uso» más pesados son de búsqueda de Centro Tanner:

```
idx_policies_search              96 kB  (gin)
idx_policies_title_trgm          88 kB  (gin)
idx_consent_documents_body_trgm  72 kB  (gin)
idx_faqs_search / _question_trgm 48 kB  (gin)
```

Ahí `idx_scan = 0` **no significa que el índice sobre**. Significa que **todavía
nadie ha buscado**. Borrarlos es romper la búsqueda justo el día que alguien la
use.

**Recomendación: no tocar ningún índice.** Volver a mirar cuando alguna tabla
pase de, digamos, un millón de escrituras.

## Hallazgo nuevo · lo que de verdad consume la base de datos

Mirando `pg_stat_statements` apareció algo que no estaba en el plan:

| Consulta | Llamadas | ms promedio | **Tiempo total** |
|---|---:|---:|---:|
| `SELECT name FROM pg_timezone_names` | 756 | **548.2** | **414,473 ms** |
| RPC más costosa de la app (`v2_my_navigation`) | 1,410 | 43.9 | 61,964 ms |
| `private.run_billing_automation()` | 770 | 62.0 | 47,761 ms |
| Caché de esquema de PostgREST | 743 | 45.1 | 33,524 ms |

`pg_timezone_names` se lleva **6.7 veces más tiempo de base de datos que la RPC
más costosa del club**, y más que todas las tareas programadas juntas.

**No la llama la aplicación** —no aparece en ninguna línea del repositorio—.
La llama el rol `authenticator`, o sea **PostgREST**, cada vez que reconstruye
su caché de esquema. Las 743 llamadas a la consulta del caché lo confirman: son
~750 recargas.

Cada DDL dispara una recarga. Esta auditoría misma aplicó ~25 migraciones.

**Tamaño real del problema, sin exagerarlo:** 414 segundos repartidos en unos 32
días son ~13 segundos de CPU al día. **No es una emergencia y nadie lo está
sintiendo.** Es, eso sí, el consumidor número uno, y la forma de bajarlo es de
proceso, no de código: **agrupar las migraciones** en vez de aplicarlas de una
en una.

## Lo que la medición dice del rendimiento de la app

Las RPC que la gente toca todos los días, con 20 llamadas o más:

| RPC | Llamadas | ms promedio | ms peor |
|---|---:|---:|---:|
| `v2_executive_insights` | 305 | 100.2 | 356 |
| `v2_action_center` | 311 | 91.6 | 289 |
| `v2_post_payment` | 53 | 73.9 | 402 |
| `v2_calendar` | 325 | 63.3 | 346 |
| `v2_my_navigation` | 1,410 | 43.9 | 209 |
| `v2_cashier_snapshot` | 224 | 32.0 | 178 |

**Nada está lento.** La peor se va en 100 ms de promedio. El cuello de botella
de TannerOS no es la base de datos: son las imágenes, que es lo que arreglaron
los Bloques A y B.

## Lo que propongo y falta autorizar

`v2_my_navigation` corre **1,410 veces** y es el mayor consumidor de la app:
44 ms en **cada carga de pantalla**, porque cada pantalla es una carga completa.
El documento `04` ya lo había señalado.

**Propuesta:** guardar el contexto y la navegación por sesión del navegador, con
vida corta, en vez de pedirlos en cada pantalla.

**Lo que hay que sopesar, y por eso no lo hice solo:** la navegación depende del
rol y de los permisos de módulo. Con caché, un cambio de permisos tarda en
verse. **No es un hueco de seguridad** —cada RPC valida del lado del servidor,
así que un enlace viejo lleva a una negativa, no a datos ajenos— pero sí es un
flujo crítico y merece un sí explícito.

## Reversión

| Paso | Cómo |
|---|---|
| C1 | `git revert`. No toca datos ni base de datos |
| C2, C3 | No se hizo nada que revertir |

## Lo que este bloque NO hizo

- **No se tocó la base de datos.** Ni un índice, ni una migración, ni una RPC.
- **No se desplegó.**
- **No se pudo probar la URL fijada del cliente** — esm.sh está bloqueado aquí.
