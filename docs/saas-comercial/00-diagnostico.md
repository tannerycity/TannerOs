# 00 · Diagnóstico para el sistema comercial de Mi Club FC

Auditoría del 23/11/2026 sobre el repositorio `TannerOs` y la base de producción.
En producción solo se hicieron consultas de lectura.

## Resumen

TannerOS ya es multiacademia de verdad: cada tabla operativa tiene
`organization_id`, el RLS está encendido en todas las tablas de `public` y `app`,
y los permisos se resuelven en el servidor con `private.has_module_access`.
También existían, sin documentar en `SAAS_ARCHITECTURE.md`, un portal de
plataforma (alta asistida de clubes), tres planes de venta (Cantera, Primera y
Selección) y un cobro mensual a clubes por transferencia.

**No hay que reconstruir nada.** El sistema comercial se monta encima de lo que
ya existe, con tres cuidados:

1. No despertar el cobro viejo.
2. No cambiar lo que hoy abre cada club.
3. No tocar el plan interno de Tannery City.

## Stack verificado

| Capa | Lo que hay (verificado, no supuesto) |
|---|---|
| Frontend | HTML + JavaScript ES modules sin framework ni build (`v2/`, páginas públicas en la raíz) |
| Hosting | Vercel estático (`vercel.json`: rewrites, CSP, headers) |
| Backend | Supabase: PostgreSQL 17, PostgREST, Auth, Storage, Edge Functions (Deno) y `pg_cron` |
| Proyecto Supabase | **Uno solo** (`TannerOs`), que es producción. No hay ambiente de pruebas |
| Esquemas | `public` (tablas de plataforma y envolturas `v2_*`), `app` (operación del club), `private` (reglas `SECURITY DEFINER`), `migration` |
| Autorización | `is_active_member`, `module_enabled`, `has_module_access`, `is_platform_admin`, todas en `private` |
| Pagos previos | `club_invoices` con cron `tanneros-cobro-clubes` (cobro a clubes por transferencia). `pago-en-linea` (Mercado Pago de la tienda de cada club) es un **borrador no aplicado** |
| QA | 100+ suites `scripts/qa-*.mjs` descubiertas solas por CI, barreras estáticas, pruebas SQL de solo lectura en `supabase/tests/` |
| Servicios externos | Mercado Pago (borrador), Windsor/Meta/Google (métricas, `bi-recolector`), push web |

## Lo que ya existía y se reutiliza

| Pieza existente | Cómo se usa ahora |
|---|---|
| `public.organizations` + `organization_id` en todo | La academia es la organización. Sin cambios |
| `modules`, `plans`, `plan_modules`, `subscriptions` | Los niveles nuevos son planes técnicos `mc_*` con sus módulos. Se reutiliza el mismo mecanismo |
| `private.module_enabled` | Sigue siendo **la única fuente** de qué abre cada academia. Se amplía; no se duplica |
| `platform_admins` + `is_platform_admin()` | Es el superadministrador. Todas las funciones comerciales lo exigen |
| Portal `/admin/clubes/` | Se le agrega la sección "Mi Club FC · Comercial" |
| Patrón de envolturas `v2_*` (definer) → `private.*` | Lo siguen todas las funciones nuevas |
| Firma de Mercado Pago de h50 | Se reutiliza el método (HMAC en tiempo constante y volver a consultar la API) en un módulo aparte, con cuenta y secretos separados |

## Hallazgos que cambian el diseño

| # | Hallazgo | Impacto | Qué se hizo |
|---|---|---|---|
| H1 | El cobro viejo (`run_club_billing`) emite cada día una mensualidad a todo club con un plan `forSale=true`, suma $100 de recargo y deja el club en **solo lectura** el día 15 | Contradice las reglas nuevas (gracia y nada de bloqueos) y cobraría de más si los planes nuevos se marcaran a la venta | Los planes `mc_*` nacen con `forSale=false` (hay prueba). Cuando una academia pasa al catálogo nuevo, su suscripción vieja se cancela (`saas_legacy_handoff`) y el cobro viejo ya no la ve |
| H2 | Los planes viejos (Cantera $990, Primera $1,990, Selección $3,490) están en producción y los usan las demos | Coexisten con el catálogo v1 | No se tocan. Retirarlos es una decisión comercial pendiente (D6) |
| H3 | Las **Visorías** se autorizan con el módulo `prospectos` (Fichajes), que va en el núcleo | Vender "Scouting" con visorías obligaría a separar ~22 revisiones de permisos | El complemento SCOUTING abre `scouting`; las visorías siguen como hoy. La separación queda como trabajo planeado (R3) |
| H4 | "Ideas" (marketing) es `always:true` y la mensajería avanzada no existe | MARKETING y MESSAGING no se pueden encender ni apagar por academia | Se catalogan **sin módulo**, así que no son vendibles. El Pack Crecimiento tampoco se vende mientras eso siga así |
| H5 | Métricas depende de conectores (Windsor, Meta y Google) configurados para Tannery | El costo y las credenciales por academia no están validados | Estado técnico "en revisión": no se vende |
| H6 | Estacionamiento trae reglas propias de Tannery (gafete de $500) | Falta validarlo con un segundo club | Estado técnico "en revisión": no se vende |
| H7 | Un solo proyecto Supabase, que es producción | No hay dónde probar una migración con datos reales | Se probó en un Postgres local con un stub cuyas funciones de permisos son **idénticas a producción** (hash verificado). Se recomienda una rama de Supabase antes de aplicar (ver 04) |
| H8 | No existe `.vercelignore`: `docs/`, `supabase/` y `scripts/` se suben con el sitio | Documentos internos (incluidos estos precios) podrían ser legibles en la web. No se pudo verificar desde aquí (el proxy no deja llegar al dominio) | **Por confirmar.** Agregar un `.vercelignore` cambia el despliegue productivo, así que se propone y no se hace sin autorización |
| H9 | 40 funciones `SECURITY DEFINER` de `public` son ejecutables por `anon` | La mayoría son formularios públicos deliberados | Fuera de alcance. Las nuevas solo abren `v2_saas_public_catalog` a `anon` |

## Separación entre clubes: cómo está resuelta

- **Base de datos:** RLS en todas las tablas; las tablas nuevas `saas_*` no tienen
  ninguna política ni permiso para `anon` o `authenticated`, y solo se llega a
  ellas por funciones que revisan quién pregunta.
- **API:** cada `v2_*` recibe la organización y la valida con
  `has_module_access(org, módulo)`. Pasar el id de otra academia da `Not authorized`
  (probado: TC-015).
- **Portal de familias:** los tutores no tienen `organization_membership` (regla
  de `staff-access`), así que no pueden llamar a las RPC internas. Las pruebas
  vigentes `01_un_tutor_no_ve_al_hijo_de_otro.sql` y `05_un_formador_no_ve_el_dinero.sql`
  cubren TC-020 y el caso del entrenador.
- **Webhooks:** solo `service_role` (puertas `v2_saas_svc_*`); cada pago se
  cruza por `preapproval_id` + `external_reference` + monto.
- **Transacciones:** llaves foráneas compuestas `(id, organization_id)` y
  triggers que impiden mover un pago o una suscripción a otra academia.

## Riesgos de compatibilidad con TannerOS

| Riesgo | Mitigación | Evidencia |
|---|---|---|
| Cambiar `module_enabled` altera lo que ve un club hoy | Solo se **agregan** condiciones `OR` que exigen filas `saas_*`, que hoy no existen | Prueba COMPAT: 144 combinaciones club × módulo idénticas antes y después |
| Mover el plan interno de Tannery | `saas_is_internal_org` bloquea contratar, asignar y hacer el traspaso | Prueba "el plan interno (Tannery) no se toca" |
| Que el cobro viejo cobre los planes nuevos | `forSale=false` y traspaso que cancela la suscripción vieja | Prueba COMPAT + "el plan viejo Cantera de A se cancelo" |
| Migración no idempotente | Todo es `if not exists` / `on conflict do nothing` | El runner la aplica dos veces seguidas |
