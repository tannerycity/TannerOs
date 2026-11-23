# 04 · Despliegue seguro, aprobaciones y checklist

**Nada de esto se ha aplicado ni desplegado.** Cada paso marcado con 🔒 necesita la
aprobación explícita de Presidencia.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 · Auditoría y catálogo | Diagnóstico, matriz, catálogo v1, permisos y reglas | Hecho (este PR) |
| 2 · Gestión SaaS | Catálogo editable y versionado, estado técnico, entitlements, cupo con gracia, portal comercial | Código y pruebas listos; **migración sin aplicar** |
| 3 · Contratación y Mercado Pago | Checkout, preapproval, webhooks, idempotencia, conciliación | Código y pruebas sin red listos; falta el sandbox real |
| 3b · Autoservicio | "Mi plan" (`/admin/suscripcion/`): elegir plan, complementos, total con IVA del servidor, pagar, cancelar, datos fiscales, facturas y exportar | **Hecho** para academias con sesión. Falta el registro público (crear academia desde `/precios`) |
| 4 · Facturación | Datos fiscales y solicitud de CFDI listos; timbrado pendiente del PAC | Pendiente: elegir PAC y validar el régimen con el contador |
| 5 · QA y lanzamiento | Piloto, observabilidad y checklist | Pendiente |

## Pasos para desplegar

1. **Revisar este PR** (código, migración y documentos).
2. 🔒 **Probar la migración en una rama de Supabase** (ambiente aislado, con su costo
   por hora). Aplicar `supabase/pendientes/saas_comercial_v1.sql` en la rama y
   correr las pruebas de solo lectura vigentes (`supabase/tests/correr-todas.sh`).
3. 🔒 **Aplicar en producción.** Mover el archivo a
   `supabase/migrations/<timestamp>_saas_comercial_v1.sql`, aplicarlo y
   actualizar el manifiesto. Es solo aditivo: no borra ni reescribe datos.
   Verificar enseguida:
   - `select count(*) from public.saas_catalog_versions` → 1 (borrador).
   - Prueba 09 (ninguna pantalla pide un permiso que no tiene) y prueba 99.
   - Advisors de seguridad de Supabase sin alertas nuevas.
4. **Revisar "Mi plan"** (`/admin/suscripcion/`) con una academia demo: pantalla, datos fiscales y descarga de datos.
5. **Revisar en el portal** (`/admin/clubes/` → Mi Club FC · Comercial) el catálogo
   v1, los complementos y el estado técnico.
6. 🔒 **Aprobar la v1** en el portal. Congela los importes; **no publica ni cobra**.
7. 🔒 **Validar el IVA con el contador** y registrarlo en el portal (queda en la bitácora).
8. **Sandbox de Mercado Pago:** crear la aplicación de **Mi Club FC** (no la de
   Tannery), cargar los secretos `MC_MP_*` con token de prueba y desplegar la
   función `saas-suscripcion`. Registrar el webhook
   `…/functions/v1/saas-suscripcion?aviso=mp` con los temas
   `subscription_preapproval`, `subscription_authorized_payment` y `payment`.
   Asignar una academia piloto con un plan manual y probar el ciclo completo con
   tarjetas de prueba.
9. 🔒 **Agendar el ciclo diario** (después del piloto):
   `select cron.schedule('mi-club-saas-diario', '17 15 * * *', 'select private.saas_daily();');`
10. 🔒 **Publicar precios** en el portal (escribiendo `PUBLICAR PRECIOS V1`). A partir
   de ahí `/precios` muestra el catálogo. Quitar el `noindex` de `precios/index.html`.
11. 🔒 **Producción de Mercado Pago:** cargar `MC_MP_ACCESS_TOKEN_PRODUCTION`,
    `MC_MP_ENV=production` y `MC_MP_PRODUCTION_AUTHORIZED=si`.

## Reversa

- **Antes de tener datos comerciales:** borrar las tablas `saas_*`, las funciones
  `private.saas_*` y `public.v2_saas_*` y los planes `mc_*`, y restaurar
  `private.module_enabled` con la definición de
  `supabase/tests/saas/00_base_local.sql` (idéntica a la actual de producción).
  Escribir esa reversa como migración aparte en el momento.
- **Con suscripciones reales:** no se borra nada. Se pausa la venta
  (complementos en `paused` y retirar la publicación con una versión nueva) y se
  desactiva el webhook.

## Checklist de producción

- [ ] Rama de Supabase: migración aplicada y suites existentes en verde
- [ ] Advisors de seguridad sin alertas nuevas
- [ ] Catálogo v1 aprobado e IVA validado por el contador
- [ ] Cuenta de Mercado Pago **del SaaS**, separada de la de Tannery y de cada club
- [ ] Secretos `MC_MP_*` cargados (sandbox primero)
- [ ] Webhook registrado y firma verificada con un aviso real de prueba
- [ ] Piloto: alta, cobro aprobado, rechazado, reintento, cancelación y vencimiento
- [ ] Confirmado dónde viene el `preapproval_id` en un pago de suscripción (tema `payment`)
- [ ] Ciclo diario agendado
- [ ] Aviso de privacidad y términos del SaaS (cobro recurrente, cancelación, datos de menores)
- [ ] `.vercelignore` revisado (H8: `docs/` y `supabase/` no deberían servirse)
- [ ] Monitoreo: eventos con error, montos que no coinciden y pagos fallidos en el tablero
- [ ] PAC elegido antes de prometer facturas timbradas
- [ ] Publicar precios y quitar el `noindex`

## Riesgos pendientes

| # | Riesgo | Severidad | Acción |
|---|---|---|---|
| R1 | Un solo proyecto Supabase | Alta | Rama de Supabase para cada migración comercial |
| R2 | Comportamiento real de Mercado Pago (temas, `start_date`, reintentos) sin validar | Alta | Piloto en sandbox (paso 7) |
| R3 | Las visorías se abren con Fichajes (núcleo) | Media | Separar un módulo `visorias` antes de venderlas dentro de SCOUTING |
| R4 | Sin prorrateo: un upgrade inmediato no es posible | Media | v1: el cambio aplica al terminar el periodo. Revisar tras el piloto |
| R5 | Timbrado CFDI sin proveedor | Media | Elegir PAC y régimen del emisor con el contador |
| R6 | `docs/` y `supabase/` posiblemente públicos (H8) | Media | `.vercelignore`, con autorización |
| R7 | Exportación completa de datos por academia | Resuelto en la migración pendiente | `v2_saas_export_my_data` + botón en "Mi plan" |
| R8 | Los planes viejos conviven con el catálogo nuevo | Baja | Decidir migración o retiro (D6) |
