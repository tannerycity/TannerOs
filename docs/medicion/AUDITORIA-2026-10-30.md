# Auditoría de medición y BI · 30/10/2026 (Fase 1)

Hechos comprobados en esta sesión. Lo que no se pudo comprobar dice por qué.

## Hallazgos

| Prio | Hallazgo | Evidencia | Acción |
|---|---|---|---|
| P0 | **TCP no publica a producción desde #16.** Vercel bloquea cada deploy de `main` porque el autor del commit, `technologiesskyrock-lgtm`, no tiene acceso al proyecto `tcp-app` en el equipo TanneryCity. | Estado de GitHub en `c273efb`, `743e194` y `132744e`: *"Git author technologiesskyrock-lgtm must have access to the project on Vercel to create deployments."* Bloqueado: `dpl_8DDZPZbFsSR7jt3u3oc7Xor7FLw6`. | Humana (ver OPERACION.md §1). La sesión no tiene acceso a `tcp-app` en Vercel (403 / 404). |
| P0 | **GA4 sin datos en ambas propiedades.** | Windsor: 0 filas, 30 días, propiedades 561403621 y 561548928. | TannerOS: la tienda mide sólo desde #361 (30/10 02:00 UTC) y sólo con «Aceptar». Marketing: no hay etiqueta publicada en www (no se pudo ver) ni en TCP (bloqueado y #13 sin fusionar). Esperado: 0. Verificar en DebugView tras el primer «Aceptar». |
| P0 | **GA4 del staff activo sin aviso que lo cubra.** La misión prohíbe habilitar etiquetas con avisos pendientes. | Aviso v2 (12/10/2026) sólo cubre la tienda (sección 11). | Corregido en la rama `medicion-p0`: `GA4_STAFF_HABILITADO = false`. El conteo propio (h55) sigue. |
| P1 | Search Console sin sitemaps enviados. | Windsor `searchconsole` Sitemaps: `submitted 0`, sin ruta. 28 días: 3 clics, 11 impresiones, posición 3.36, todo en `tannerycity.com`. | Enviar `https://app.tannerycity.com/sitemap.xml` (ya publicado). El de TCP, cuando #12 se publique. |
| P1 | www.tannerycity.com no auditable desde aquí. | DNS en GoDaddy (A 76.223.105.230 / 13.248.243.5). La red de la sesión bloquea los dominios de Tannery City y googletagmanager.com. | Abrir la red de la sesión o revisar el panel de GoDaddy (OPERACION.md §2). |
| P1 | El fragmento de GTM `GTM-5H8QT73B` no está en ningún repositorio. | `grep` en TannerOs y tcp-app: sólo aparece en la documentación. | Si está instalado, está en GoDaddy. Contrastar contra el snippet oficial (INVENTARIO_ETIQUETAS.md). |
| P1 | Windsor está en plan TRIAL. | `force_refresh` rechazado: *"not available for TRIAL subscription plan"*. | Al vencer, el tablero pierde marketing. Decidir plan antes de depender de él. |
| P1 | Sin acceso a la base de TCP. | Supabase MCP sólo ve `pacnegivzgxpanphrnwp` (TannerOS). | Necesario para ocupación, reservas e ingresos de TCP. |
| P2 | Nombres de eventos del staff distintos a la especificación. | `tanner_screen_load` y `tanner_error` frente a `tanner_page_performance` y `tanner_error_observed`. | Alineados en `medicion-p0` (catálogo `v2` con `severity` y `catalog_version`). Sin costo: no había datos. |
| P2 | La barrera «sin emojis» falla localmente con Node 22 (★ ✎ en taquilla y jersey). En CI pasa. | `node scripts/qa-static.mjs` con Node 22.22. | Diferencia de datos Unicode entre versiones de Node. No toca esta misión; anotado. |

## Estado de PRs

| Repo | PR | Estado real | Nota |
|---|---|---|---|
| TannerOs | #357, #358 | Cerrados | Integrados y corregidos en #361 (`1f0c85b`, en producción). |
| TannerOs | #361 | Fusionado y desplegado | `/club/` responde `X-Robots-Tag: noindex, nofollow`; `v2/analitica-uso.js` publicado. |
| tcp-app | #12 | Borrador, `clean` | Sitemap y robots. No sirve fusionarlo mientras `main` siga bloqueado en Vercel. |
| tcp-app | #13 | Borrador, `clean` | Consentimiento + GA4/Meta. Sin banner ni etiquetas mientras el aviso tenga `[ABOGADO]` (probado en E2E). |

## Datos reales disponibles hoy (Windsor y base de TannerOS)

| Fuente | Dato (periodo) | Club | TCP |
|---|---|---|---|
| Instagram | Seguidores (hoy) | 990 | 358 |
| Instagram | Alcance diario | 37 a 1,537 | 2 a 379 |
| Facebook | Seguidores de página | 457 | 426 |
| Facebook | Impresiones de página (28 d) | 8,661 | 49,675 |
| Facebook | Interacciones (28 d) | 566 | 1,696 |
| Meta Ads (cuenta compartida) | 30 d: 1 campaña a WhatsApp | gasto $599.93, 39,206 impresiones, 19,421 alcance, 1,249 clics, 9 leads, 46 conversaciones | — |
| Google Business Profile (28 d) | Llamadas / clics al sitio | 4 / 6 | 3 / 0 |
| Search Console (28 d) | Clics / impresiones | 3 / 11 (sin separar www/app/tcp) | — |
| GA4 | Todo | 0 filas | 0 filas |
| TannerOS (base) | Prospectos | 19 en 30 d · 96 en total · 37 convertidos · 39 nuevos | — |
| TannerOS (base) | Canal (90 d) | Recomendación 19, Redes 16, Otro 6, Cancha 4… | — |

La campaña de Meta no separa Club y TCP: es una sola cuenta publicitaria. Para costo por lead
por negocio hace falta nombrar campañas con prefijo `CLUB-` / `TCP-`.
