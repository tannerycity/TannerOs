# 02 · Arquitectura comercial y reglas de negocio

Implementación: `supabase/pendientes/saas_comercial_v1.sql` (sin aplicar),
`v2/saas/precios.js`, `supabase/functions/saas-suscripcion/`,
`v2/admin/clubes/comercial.js` y `precios/`.

## Modelo de datos

```text
saas_catalog_versions ──< saas_plan_tiers ──> plans (mc_*) ──< plan_modules ──> modules
        │                                                                          ▲
        └──< saas_addons ──< saas_addon_modules ───────────────────────────────────┘
                   ▲                                       saas_module_readiness (estado técnico)
organizations ──< saas_subscriptions ──< saas_subscription_items
        │               │  (foto: catálogo, importes, cotización)
        │               └──< saas_payments ──< saas_invoices (CFDI)
        ├── saas_fiscal_profiles          saas_payment_events (avisos del proveedor)
        ├──< saas_social_grants           saas_coupons ──< saas_coupon_redemptions
        └── saas_billing_audit_log (solo agrega)
```

| Tabla | Para qué | Restricciones clave |
|---|---|---|
| `saas_catalog_versions` | Versión de precios: IVA (bp), descuento anual (bp), gracia y vigencia | Solo una publicada; aprobada = congelada (trigger); publicar exige IVA validado |
| `saas_plan_tiers` | Niveles por capacidad y su plan técnico | PK `(versión, código)`; `quote_only` o precio; rangos contiguos al aprobar |
| `saas_addons` / `saas_addon_modules` | Complementos, paquetes (`components`) y los módulos que abren | Congelados al aprobar, excepto el estado comercial |
| `saas_module_readiness` | Estado técnico del módulo | `ready / review / partial / not_built / internal` |
| `saas_subscriptions` | Suscripción con la foto de lo contratado | Una viva y una pendiente por academia; contrato inmutable; `total = base + IVA`; motivo obligatorio si es manual |
| `saas_subscription_items` | Complementos contratados | Inmutables; FK compuesta `(subscription_id, organization_id)` |
| `saas_payments` | Pagos y comprobante interno (`receipt_folio`) | Únicos por `(proveedor, ambiente, id)`; no cambian de academia ni de monto; no se borran |
| `saas_payment_events` | Cada aviso, una sola vez | Único por `(proveedor, ambiente, event_key)` |
| `saas_fiscal_profiles` / `saas_invoices` | Datos fiscales y CFDI | "Timbrada" exige folio fiscal + PAC + XML + fecha (CHECK) |
| `saas_social_grants` | Becas de software, descuentos y días de gracia extra | Motivo de 10 caracteres o más, periodo obligatorio y quién la otorgó |
| `saas_billing_audit_log` | Bitácora de todo cambio comercial | Solo agrega (trigger) |

**Credenciales:** ninguna se guarda en la base. Los tokens de Mercado Pago viven en
los secretos de la Edge Function, separados de los de la tienda del club.

## Única fuente de qué abre cada academia

`private.module_enabled(org, módulo)` resuelve, en este orden:

1. Override del club (como hoy).
2. Plan viejo (como hoy).
3. Nivel del catálogo nuevo (suscripción `free`, `active`, `past_due` o `grace_period`).
4. Complementos de esa suscripción (incluidos los componentes de un paquete).
5. **Piso:** una academia con historial en el catálogo nunca pierde el núcleo de Semilla.

El frontend solo pinta lo que le devuelve el servidor. Cambiar la interfaz o
mandar otra solicitud HTTP no abre nada (TC-016).

## Estados de la suscripción

| Estado | Significa | ¿Abre módulos? | Cómo entra |
|---|---|---|---|
| `free` | Semilla sin costo | Núcleo | Contratar Semilla sin complementos |
| `pending` | Esperando el primer pago aprobado | No (TC-013) | `start_checkout` con total > 0 |
| `active` | Periodo pagado vigente | Sí | Pago **aprobado y con monto exacto** consultado en la API |
| `past_due` | Terminó el periodo sin pago nuevo; Mercado Pago reintenta (4 veces en ~10 días) | Sí | Ciclo diario o preapproval `paused` |
| `grace_period` | Se agotaron los reintentos; corre la gracia del catálogo | Sí | Ciclo diario |
| `cancelled` | Reemplazada o cancelada antes de activarse | No (solo núcleo) | Nueva suscripción o preapproval cancelado estando pendiente |
| `expired` | Venció (renovación cancelada o gracia agotada) | No (solo núcleo) | Ciclo diario |

Equivalencias con Mercado Pago:

| Recurso | Estado en Mercado Pago | Efecto aquí |
|---|---|---|
| Preapproval | `pending` / `authorized` | Se registra; **no activa** |
| Preapproval | `paused` | `past_due` |
| Preapproval | `cancelled` | Si estaba pendiente, `cancelled`; si no, no renueva |
| Pago | `approved` + monto correcto | Activa y extiende el periodo una sola vez |
| Pago | `rejected` | No activa; si el periodo venció, `past_due` |
| Pago | `refunded` / `charged_back` | Se registra y se audita para revisarlo a mano; no se cancela solo |

## Reglas comerciales implementadas

| Regla | Dónde | Prueba |
|---|---|---|
| Plan por jugadores activos **únicos** (una fila por persona; dos categorías = uno) | `saas_active_players`, `cuentaJugadoresActivos` | TC-019 (JS y SQL) |
| Posibles duplicados (mismo nombre y fecha de nacimiento) a la vista, sin bloquear | `saas_possible_duplicates`, `posiblesDuplicados` | Suite JS |
| Exceder la capacidad: aviso y 15 días de gracia configurables, **sin bloqueo** | `saas_daily`, `saas_capacity`, `evaluaCapacidad` | TC-003, "B con 55" |
| Semilla gratis sin tarjeta y sin caducidad | `start_checkout` → `free`; nunca crea un preapproval de $0 | TC-001, MP "no se crea preapproval de $0" |
| Complementos en cualquier plan, Semilla incluido | `saas_quote_core` | TC-010 |
| Paquete: no se cobra suelto lo que ya cubre | Línea `cubiertoPor` en $0 | Suite JS y paridad |
| Nada de descuentos automáticos: el paquete se **sugiere**, no se aplica | `sugerencias` (solo en pantalla) | Suite JS |
| Anual = 12 × mensual − 10 %, por línea, con un solo redondeo | `anualDesdeMensual`, `saas_line` | TC-011 |
| IVA configurable (bp), redondeo mitad hacia arriba sobre la base total | `ivaDe`, `saas_quote_core` | TC-012 |
| Orden de descuentos: anual → cupón → beca | Igual en JS y SQL | Paridad (976 casos) |
| Los importes contratados no cambian con el catálogo | Foto en `saas_subscriptions` y trigger | TC-018 |
| Upgrade o downgrade = suscripción nueva; si hay una de pago vigente, la nueva **arranca al terminar el periodo pagado** | `start_checkout` (`starts_at`), preapproval `start_date` | — (ver P2) |
| Sin prorrateo en v1 | Decisión D3 | — |
| Cancelar renovación: acceso hasta el fin del periodo | `saas_cancel_renewal` + `saas_daily` | TC-017 |
| Becas o descuentos sociales: motivo, periodo y quién los otorgó | `saas_social_grants` (CHECK) | "beca sin motivo: no" |
| El precio no se manipula desde el navegador | El cliente manda códigos; el servidor cotiza y guarda | TC-016 y "monto del servidor" |

## Mercado Pago (cuenta del SaaS, separada de la de cada club)

1. La academia (Presidencia) elige su plan.
2. La Edge Function, **con la sesión del usuario**, llama a `v2_saas_start_checkout`.
   La base revisa los permisos, cotiza y crea la suscripción pendiente.
3. La Edge Function crea el `preapproval` (`status: pending`,
   `external_reference` = id de la suscripción, monto del servidor e
   `X-Idempotency-Key`) y regresa el `init_point`.
4. La academia autoriza el pago **en el sitio de Mercado Pago**. Nunca se
   guardan tarjetas ni CVV.
5. Llega el webhook. Se valida la firma y su vigencia (10 minutos) y el aviso
   se registra una sola vez. Luego se **consulta** el recurso en la API y se
   aplica de forma idempotente (por id de pago, `last_modified` contra avisos
   desordenados y monto exacto).
6. La redirección de regreso (`back_url`) solo muestra "revisando": no activa nada.

**Sandbox por omisión.** Producción exige `MC_MP_ENV=production` **y**
`MC_MP_PRODUCTION_AUTHORIZED=si` (prueba: "production sin autorización se queda
en sandbox").

**Por validar en sandbox** antes de producción: en qué campo trae el pago de una
suscripción el `preapproval_id` (tema `payment`), el comportamiento real de
`start_date` para cambios programados y los tiempos de reintento.

## Facturación fiscal (México)

| Concepto | Qué es | Dónde |
|---|---|---|
| Comprobante interno del SaaS | Folio interno del pago (`receipt_folio`). **No es fiscal** | `saas_payments` |
| CFDI de Mi Club FC a la academia | Factura fiscal timbrada por un PAC | `saas_invoices`: hoy solo `pending_integration` |
| Comprobantes de la academia a sus familias | Recibos y estados de cuenta del club | `app.payments` y portal de familias. **Otro sistema y otra cuenta** |

Se capturan RFC (con validación de formato), razón social, régimen, código
postal, uso de CFDI y correo. Al pedir una factura se guarda la foto de esos
datos. Ningún camino del código marca una factura como timbrada; la base lo
impide sin folio fiscal, PAC, XML y fecha. Las cancelaciones usan los motivos
SAT 01 a 04 y la sustitución queda enlazada.

## Seguridad multi-tenant (resumen ASVS)

| Control | Cómo |
|---|---|
| V4 · Control de acceso | Todo pasa por funciones `SECURITY DEFINER` que revisan la membresía activa, el módulo y el rol, o `is_platform_admin`. RLS sin políticas en `saas_*` |
| V4 · Integridad entre academias | FK compuestas `(id, organization_id)` y triggers de inmutabilidad |
| V5 · Validación | RFC, CP, régimen, ciclo, códigos y porcentajes validados en el servidor |
| V7 · Logs sin secretos | La Edge Function solo registra ruta y código. Del pago se guardan id, estado y monto, nunca del pagador ni de la tarjeta (probado) |
| V8 · Datos de menores | El tablero de la plataforma solo devuelve conteos (probado: sin nombres ni fechas). El superadministrador no tiene una función que lea jugadores |
| V9/V13 · Webhooks | HMAC-SHA256 en tiempo constante, ventana anti-repetición y llave de idempotencia |
| V11 · Lógica de negocio | Monto exacto, sin activar por redirección y sin doble extensión del periodo |

## Decisiones técnicas

| # | Decisión | Por qué |
|---|---|---|
| D1 | Borrador en `supabase/pendientes/` y no en `migrations/` | Convención del repo para lo no aplicado. La prueba 99 compara el repo contra la base |
| D2 | Precios por **versión de catálogo** y no por renglón | Una versión aprobada es un contrato completo y trazable: la suscripción apunta a ella |
| D3 | Sin prorrateo en v1; los cambios arrancan al terminar el periodo pagado | Mercado Pago no prorratea preapprovals por sí solo; evita cobros dobles y cargos sorpresa |
| D4 | Piso de núcleo para academias vencidas | "Nunca exigir contratar para acceder a sus datos". Además permite volver a contratar |
| D5 | Un preapproval por suscripción (plan + complementos) | Un solo cargo recurrente y simple para la academia. Cambiar complementos = suscripción nueva |
| D6 | Los planes viejos conviven | Retirarlos es una decisión comercial, no técnica |
| D7 | Motor duplicado JS/SQL con prueba de paridad | La pantalla calcula al instante; el servidor manda. La paridad evita que digan cosas distintas |
