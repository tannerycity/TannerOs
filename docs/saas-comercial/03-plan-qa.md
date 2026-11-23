# 03 · Plan de QA y evidencias

Cómo correr todo:

```bash
node scripts/qa-saas-precios.mjs          # motor de precios (CI lo corre solo)
node scripts/qa-saas-mercadopago.mjs      # firma, montos, ambiente (CI lo corre solo)
./supabase/tests/saas/correr-local.sh     # Postgres LOCAL desechable: migración x2 + 81 casos + paridad JS=SQL
```

Resultados del 23/11/2026, en este contenedor:

| Suite | Resultado |
|---|---|
| `qa-saas-precios.mjs` | **73/73 OK** |
| `qa-saas-mercadopago.mjs` | **35/35 OK** |
| `qa-saas-mi-plan.mjs` (pantalla de la academia) | **27/27 OK** |
| `supabase/tests/saas/10_pruebas_local.sql` | **88/88 OK** (incluye la exportación) |
| Paridad JS = SQL | **976/976 casos idénticos** |
| Mutaciones (romper a propósito) | Motor JS: 8 fallos detectados. Redondeo SQL: 22 diferencias detectadas |
| Stub contra producción | Hash de `module_enabled`, `has_module_access`, `is_active_member`, `is_platform_admin` y `legacy_module_code` **idéntico** a producción |
| Página `/precios` en Chromium (390 px y 1280 px) | Sin catálogo: ningún precio visible. Publicado: montos correctos, sin desborde horizontal y sin errores de página |
| Portal comercial en Chromium | Renderiza con datos reales de la base local, sin errores |
| "Mi plan" en Chromium (390 px y 1280 px) | Plan correcto preseleccionado; planes chicos bloqueados con su motivo; total del servidor (Semilla + Tienda $172.84; Ascenso + Tienda $867.68); al contratar va a Mercado Pago; sin desborde ni errores |

## Casos funcionales mínimos

| TC | Caso | Dónde | Estado |
|---|---|---|---|
| TC-001 | 1 jugador → Semilla | JS + SQL ("Semilla sin complementos: gratis") | OK |
| TC-002 | 20 jugadores → conserva Semilla | JS (frontera) | OK |
| TC-003 | 21 → aviso de cambio de plan | JS (excedido, gracia hasta) + SQL (B con 25, B con 55) | OK |
| TC-004 | 50 → Formativo | JS | OK |
| TC-005 | 51 → Ascenso | JS | OK |
| TC-006 | 100 → Ascenso | JS | OK |
| TC-007 | 101 → Primera | JS | OK |
| TC-008 | 250 → Primera | JS | OK |
| TC-009 | 251 → Élite o configuración especial | JS + SQL (COTIZACION) | OK |
| TC-010 | Semilla compra un complemento sin plan de pago | JS + SQL (Semilla + Tienda, pendiente y luego activa) | OK |
| TC-011 | Descuento anual exactamente 10 % | JS (4 importes) + SQL (3,229.20) | OK |
| TC-012 | IVA calculado y mostrado | JS (346.84, redondeo anual) + SQL (516.67) + página | OK |
| TC-013 | Un pago rechazado no activa servicios | SQL (pendiente y rechazado no abren la Tienda) | OK |
| TC-014 | Un webhook duplicado no duplica transacciones | SQL (mismo pago dos veces = 1 registro y periodo sin doble extensión; evento repetido no se procesa) | OK |
| TC-015 | Academia A no accede a academia B | SQL (suscripción, contratación y datos fiscales) | OK |
| TC-016 | No se habilita un premium desde el frontend | SQL (override, insertar renglón, set_addon_status: denegados) | OK |
| TC-017 | Cancelar la renovación según el contrato | SQL (acceso hasta el fin del periodo y luego vence) | OK |
| TC-018 | El historial conserva los importes aunque cambie el catálogo | JS + SQL (B conserva 299 con la v2 a 349; versión congelada) | OK |
| TC-019 | Un jugador en dos categorías cuenta una vez | JS + SQL (12 únicos con doble inscripción) | OK |
| TC-020 | El portal familiar no muestra jugadores ajenos | Prueba vigente `supabase/tests/01_un_tutor_no_ve_al_hijo_de_otro.sql` (no se tocó) | Cubierto por la suite existente |

## Pruebas adicionales incluidas

| Tema | Casos |
|---|---|
| Recibo y CFDI diferenciados | Folio interno ≠ folio fiscal; CFDI en `pending_integration`; "timbrada" imposible sin PAC |
| Permisos | Formador sin facturación; usuario desactivado sin acceso; academia sin tablero ni funciones privadas ni puerta del webhook; anon solo ve el catálogo publicado |
| Mercado Pago | Monto o `external_reference` ajenos rechazados; autorizar la tarjeta no activa; aviso viejo no pisa el nuevo; firma inválida o vencida; sandbox por omisión; sin datos del pagador |
| Exportación | Presidencia de A se lleva solo lo suyo; ni A exporta B, ni un formador, ni anon; tablas faltantes se omiten; queda en la bitácora |
| Integridad | Pagos y suscripciones no se borran ni se reasignan; bitácora solo agrega; versión aprobada congelada |
| Compatibilidad TannerOS | 144 combinaciones idénticas; el plan interno no se toca; el plan viejo se traspasa |
| Migración | Se aplica dos veces sin error (idempotente) |

## Pendiente de probar (requiere ambiente o integración real)

| Prueba | Por qué no se hizo | Cuándo |
|---|---|---|
| Flujo E2E con el sandbox de Mercado Pago (preapproval real, webhook real) | Faltan la cuenta y el token de prueba del SaaS | Fase 3, con `MC_MP_ACCESS_TOKEN_SANDBOX` |
| Concurrencia (dos checkouts simultáneos) | El índice `saas_sub_one_pending` lo impide en teoría; falta una carga real | En la rama de Supabase |
| Migración contra el esquema real completo | Solo hay un proyecto (producción) | En la rama de Supabase (04, paso 2) |
| Backups y restauración | Política de Supabase; no se cambió | Checklist de producción |
| Accesibilidad completa del flujo de compra | "Mi plan" ya existe para la academia con sesión; falta el registro público autoservicio | Fase 3b |
| `deno check` de la Edge Function | Deno no está instalado en el contenedor | Antes de desplegarla |
