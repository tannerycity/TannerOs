# Medición, tracking y SEO · Tannery City (30/10/2026)

Índice de entregables y auditoría inicial. Rama `medicion-integral` (TannerOS)
y PR #13 de `tcp-app`.

| # | Entregable | Archivo |
|---|---|---|
| 1 | Auditoría inicial | este archivo |
| 2 | Código por repo | rama `medicion-integral`, tcp-app PR #13 |
| 3 | Pruebas | sección "Pruebas" abajo |
| 4 | Fallas y riesgos | sección "Fallas y riesgos" abajo |
| 5 | Matriz de eventos | [EVENTOS.md](EVENTOS.md) |
| 6 | Arquitectura | [ARQUITECTURA.md](ARQUITECTURA.md) |
| 7 | Privacidad | [PRIVACIDAD.md](PRIVACIDAD.md) |
| 8 | PRs | sección "PRs" abajo |
| 9 | Fuentes faltantes | [INSTALACION-WWW-GTM.md](INSTALACION-WWW-GTM.md), [VERIFICACION.md](VERIFICACION.md), [FUENTES-WINDSOR.md](FUENTES-WINDSOR.md) |
| 10 | Tablero ejecutivo | [TABLERO-EJECUTIVO.md](TABLERO-EJECUTIVO.md) |

## 1. Auditoría inicial

### Sitios

| Sitio | Dónde vive | Estado al 29/10/2026 |
|---|---|---|
| www.tannerycity.com | GoDaddy Website Builder (A 76.223.105.230 / 13.248.243.5, NS domaincontrol.com). No está en ningún repo. | Sin acceso desde aquí. Se instala por panel (GTM). |
| app.tannerycity.com | Vercel, repo TannerOs | robots.txt y sitemap.xml en vivo; CSP ya permite googletagmanager, connect.facebook.net y google-analytics. Medición sólo en la tienda (PR #357), sin uso del staff. |
| tcp.tannerycity.com | Vercel (otro equipo), repo tcp-app | Sin medición en `main`. PR #12 (sitemap/robots) y PR #13 (consentimiento + analítica). |

### PRs existentes revisados

| PR | Qué hace | Defectos encontrados | Qué se hizo |
|---|---|---|---|
| TannerOs #357 | Meta Pixel + GA4 en la tienda con consentimiento | Bloquea toda URL con query o hash, y la tienda navega por hash: casi nada se medía. Tampoco medía links con utm. Reportaba "pedido creado" como `purchase` aunque el pago no estuviera confirmado. Al revocar no borraba cookies. | Corregido en `medicion-integral` (`v2/medicion.js`). |
| TannerOs #358 | Analítica de uso del staff | Mapa de rutas por URL sin verificar y con huecos. Excluía páginas con query o hash. No tenía eventos de navegación ni de función. | Reemplazado por `v2/analitica-uso.js`, con catálogo cerrado tomado de `navItems`. |
| tcp-app #12 | sitemap con `/` y robots | Ninguno. Las ligas cortas son redirects noindex y el aviso es noindex mientras está pendiente. | Sin cambios. Listo para revisión. |
| tcp-app #13 | Consentimiento + GA4/Meta en TCP | El CSP `script-src 'self'` bloqueaba GA/Meta. Los nombres de evento no seguían la especificación. Los utm no se medían. | Corregido en el mismo PR (commit eec57b6). |

Recomendación: cerrar #357 y #358 **después** de aprobar `medicion-integral`, que los integra. No se cerraron aquí.

### Bloqueos de acceso (documentados, no rodeados)

- Sin red desde este contenedor hacia los dominios de tannerycity (el proxy los rechaza). Lo de app se leyó vía Vercel.
- Sin acceso a GoDaddy, GTM, GA4, Meta Events Manager, Search Console ni Windsor. Por eso no se pudo verificar DebugView, Test Events ni el envío de sitemaps; quedan como pasos en [VERIFICACION.md](VERIFICACION.md).
- Google Ads: sólo existe el Customer ID 743-685-4864. No hay ID de conversión AW- ni etiqueta, así que **no se instaló nada de Ads**; no se inventaron IDs.

## 3. Pruebas

| Repo | Prueba | Resultado |
|---|---|---|
| TannerOs | `scripts/qa-analitica-uso.mjs` | 17/17 |
| TannerOs | `scripts/qa-medicion.mjs` | 15/15 |
| TannerOs | `scripts/qa-seo-tanneros.mjs` | 10/10 (mutaciones detectadas) |
| TannerOs | `scripts/qa-humo-medicion.mjs` (navegador) | 22/22 (mutaciones detectadas) |
| TannerOs | `supabase/tests/13_el_uso_se_cuenta_sin_personas.sql` (Postgres 16 local) | 8/8 (mutaciones de rol Tanner y permiso admin detectadas) |
| TannerOs | Todas las suites unitarias y de navegador del repo | 0 fallas |
| tcp-app | `tests/unit/analitica-publica.test.mjs` | 7/7. `test:unit` completo: 110 |
| tcp-app | E2E `demo.spec.mjs` (incluye "sin aviso no hay petición a Google/Meta") | 54/55. La que falla ("portada corta… toBeInViewport") también falla en `main` sin red (Google Fonts bloqueado); es ambiental. |

Lo que **no** está probado: eventos reales llegando a GA4/Meta (falta acceso a DebugView/Test Events) La prueba 13 sí corrió contra producción el 30/10/2026 (escribe y se revierte): OK.

## 4. Fallas y riesgos

| # | Riesgo | Impacto | Mitigación / estado |
|---|---|---|---|
| R1 | El aviso de TannerOS (v2) cubre la tienda pero no la analítica del personal ni el conteo h55 | Legal: no activar la analítica del staff sin actualizarlo | Bloqueante para el staff. Sección 12 propuesta en [PRIVACIDAD.md](PRIVACIDAD.md), requiere abogado. |
| R2 | `purchase` aún no se envía | No hay ingresos en GA4/Meta | Intencional: sólo con pago confirmado. Falta envío desde servidor (webhook MP → GA4 Measurement Protocol / Meta CAPI) con secretos en servidor. |
| R3 | www en GoDaddy sin control de versiones | Cambios sin revisión ni pruebas | Instalar sólo por GTM con versión publicada y descrita. |
| R4 | Riesgo de doble conteo si alguien mete GTM en app o tcp | Métricas infladas | Regla: un solo método por sitio ([ARQUITECTURA.md](ARQUITECTURA.md)). |
| R5 | GA4 sólo cuenta a quien acepta | Subconteo de uso del staff | h55 cuenta a todo el staff, agregado y seudónimo (aplicada el 30/10/2026). |
| R6 | Cambio futuro de menú sin actualizar el catálogo | Módulo nuevo sin medir | `qa-analitica-uso` falla si `navItems` y el catálogo (JS y h55) no coinciden. |
| R7 | `MAX_EXCLUIDAS` sube a 64 en tres ramas (#359, #360, esta) | Conflicto al fusionar | Resolver al fusionar: el valor final es 63 + nuevas suites de navegador. |
| R8 | Conservación de h55 | Crecimiento indefinido | Purga a 13 meses propuesta en `supabase/propuestas/uso_purga.sql`; sin aplicar. |

## 8. PRs

| Repo | PR | Estado |
|---|---|---|
| TannerOs | `medicion-integral` (borrador) | Integra y corrige #357/#358. No fusionar sin aprobación ni sin R1 resuelto. |
| tcp-app | #13 | Actualizado (eec57b6). Requiere revisión `[ABOGADO]` del aviso. Sólo Skyrock fusiona. |
| tcp-app | #12 | Revisado, sin cambios. |

## Autorizaciones pendientes

1. ~~Aplicar h55~~ Hecho el 30/10/2026 (`supabase/migrations/20261030013405_h55_uso_de_tanneros.sql`).
2. Revisión legal de los avisos de privacidad (TannerOS y TCP).
3. Fusión de `medicion-integral`, tcp-app #12 y #13.
4. Instalar GTM en www (panel GoDaddy) siguiendo [INSTALACION-WWW-GTM.md](INSTALACION-WWW-GTM.md).
5. Crear el secreto de API de GA4 (Measurement Protocol) para `purchase` desde servidor.
