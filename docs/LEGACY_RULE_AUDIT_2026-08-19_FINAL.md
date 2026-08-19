# TannerOS V2 — Auditoría legacy → V2 · Estado actualizado

Fecha de corte: **2026-08-19**  
Supabase: `pacnegivzgxpanphrnwp`  
Repo: `tannerycity/TannerOs`  
Producción: `https://app.tannerycity.com`

## Regla de precedencia

1. **Decisión aprobada V2**.
2. Regla legacy compatible.
3. Regla de seguridad/plataforma cuando evita corrupción, bypass de negocio o cruce entre organizaciones.

Cuando legacy contradice una decisión V2 aprobada, **gana V2**. Legacy se conserva como evidencia y compatibilidad hasta completar cutover, no como autoridad para nuevas escrituras.

## Estado ejecutivo

- Reglas catalogadas en `app.business_rule_catalog`: **80**.
- Activas + probadas: **77**.
- Reemplazadas explícitamente por V2: **1** (`SEC-LEGACY-001`).
- Pendientes por decisión real de negocio: **2** (`CUT-PAY-001`, `ACA-BILL-001`).
- Reglas activas sin QA pendiente: **0**.
- Tablas canónicas `app.*` con `INSERT/UPDATE/DELETE` directo para `authenticated`: **0**.
- RLS canónico: auditado + prueba black-box con segundo tenant dentro de rollback.
- QA operativo se ejecutó con subtransacciones/rollback y no dejó filas QA residuales.

## Matriz legacy → V2

### 1. Seguridad, roles y tenancy

| Regla | Resultado | Implementación V2 |
|---|---|---|
| `WRITE_ROLES` estático legacy | **REEMPLAZADA** | `SEC-002`: matriz organización/rol/módulo sembrada por SaaS Foundation. |
| Escritura directa desde navegador a tablas canónicas | **ENDURECIDA** | `SEC-003`: DML directo revocado de todas las tablas `app.*`; mutaciones por RPC/commands. |
| Lectura cross-tenant | **BLOQUEADA** | `SEC-004`: RLS + membership/module access. Prueba con segunda organización dio 0 filas visibles del tenant ajeno. |
| Actor libre en operaciones sensibles | **ENDURECIDA** | Operaciones canónicas derivan actor de `auth.uid()`. |

Prueba representativa después del lockdown:
- `v2_post_expense` sigue escribiendo por `SECURITY DEFINER`.
- `v2_upsert_equipment_item` sigue escribiendo por command.
- Taquilla no puede publicar egresos contables.
- 0 residuos después de rollback.

### 2. Teléfono público

- Selector internacional con búsqueda país/código.
- México default `+52`.
- México: exactamente 10 dígitos nacionales.
- EUA/NANP: `+1` + 10 dígitos.
- Argentina: fijo/móvil E.164.
- Resto del mundo: envolvente E.164 válida.
- Persistencia canónica E.164 en backend.
- Teléfonos históricos ambiguos se preservan raw; no se inventa país.

QA: white-box + RPC público real; MX inválido rechazado, EUA canonizado; 0 residuo.

### 3. Jugadores / categorías / tutores

- Dorsal único dentro de categoría activa.
- Conversión Prospecto → Tanner con protección de duplicado.
- Código Tanner secuencial sin reescribir códigos legacy.
- Reutilización de tutor por teléfono canónico.
- Categoría canónica mediante `player_enrollments`.
- Máximo un enrollment de club activo por Tanner.
- Cambio de categoría cierra historial anterior y crea enrollment nuevo.
- `players.category` continúa sincronizado solo como compatibilidad durante cutover.

QA de cambio de categoría: **7/7** junto con baja de academia, usando filas reales + rollback.

### 4. Cobranza general

`BILL-001..007` siguen siendo decisiones V2 aprobadas y prevalecen sobre comportamiento financiero legacy incompatible.

Los estados y cargos canónicos no se editan mediante DML libre desde navegador.

### 5. Asistencia

- Estados: `present | absent | late | excused`.
- Fin de sesión no puede preceder inicio.
- Responsable/recorder autenticado.
- Legacy válido migrado: **331/331** registros en **24** sesiones.
- **6** filas legacy sin jugador/sesión quedaron en `app.legacy_migration_conflicts`; no contaminan operación.

### 6. Prospectos / captación

- Prospectos legacy: **55/55**.
- Conversiones a Tanner: **18/18** ligadas al jugador correcto.
- Foto pública privada en Storage, ruta controlada y ventana de carga limitada.
- Dedupe exacto de reintento público activo.
- Funnel canónico restringido por backend.
- Teléfonos legacy dudosos preservados sin falsearlos.

### 7. Scouting

- Legacy: **29/29** visorías migradas.
- Scouting puede existir sin Prospecto.
- Scores Técnico/Físico/Táctico/Mental: 0–10.
- Escritura directa a `app.scouting_reports`: bloqueada.
- Ciclo `open | closed` + interés + próxima acción + veredicto + notas.
- Rol `Scouting` no recibe Captación ni conversión de Prospecto.

QA con rol Scouting real temporal dentro de rollback: **7/7**.

Consola V2: **`/v2/scouting/`**.

### 8. Academias

- Academia legacy: **1/1**.
- Inscripciones: **6/6**; 5 activas + 1 histórica.
- Duplicado activo jugador+academia: bloqueado.
- Fee individual puede usar fee default o override.
- Baja conserva enrollment, fecha y motivo; no borra pagos/asistencia/historia.

#### Pendiente `ACA-BILL-001`

El modelo ya soporta `academy_fee`, pero **no se activó generación automática** porque faltan decisiones reales:

1. ¿Las academias generan automáticamente cargo mensual en el mismo ledger canónico?
2. ¿El primer mes se prorratea por días calendario activos?
3. ¿El saldo de academia genera el mismo recargo que `monthly_fee` del club?

Hasta decidirlo, no se generan cargos automáticos de Academia.

### 9. Programas / cursos / eventos

- Programas legacy: **30/30**.
- Inscripciones canónicas: **17/19**.
- **2** inscripciones apuntan a cursos legacy inexistentes y quedaron como conflicto; sin match inventado.
- Edad pública validada por backend.
- Cupo lleno envía nuevas altas a waitlist.
- Admin tampoco puede promover una persona a confirmado si el cupo sigue lleno.
- Draft/cancelled/completed/archived no puede dejar registro público habilitado.
- Escritura directa a programas/inscripciones bloqueada.

QA admin: **8/8** + rollback.

Consola V2: **`/v2/programas/`**.

### 10. Utilería

- Legacy: **16/16** artículos migrados.
- Reorder solo cuando `min_stock > 0` y cantidad cae al umbral.
- `min_stock=0` no crea falso reorder.
- Mutaciones existentes continúan vía commands después del lockdown global.

### 11. Patrocinadores

- Sponsors: **12/12**.
- Acuerdos: **12/12**.
- Activos publicitarios históricos: **20/20**.
- Datos canónicos conservan etapa, valor potencial, próxima acción, beneficios y entregables.

### 12. Tienda / catálogo / pedidos

#### Catálogo

- Decisión V2: **8 productos limpios activos**.
- Legacy: **89/89 productos** preservados como histórico/inactivo.
- No se reviven productos viejos solo porque existían en V1.

#### Pedidos

- Headers: **45/45**.
- Líneas: **68/68**.
- Precio/costo histórico usa snapshots congelados cuando existen.
- Sin snapshot, precio solo se reconstruye si el catálogo legacy concilia exactamente con subtotal guardado.
- Si no se puede reconstruir, queda conflicto; nunca se inventa margen.

#### Reglas V2

- State machine aprobado tiene precedencia.
- `partial_payment` / `paid` derivan del dinero realmente ligado al pedido.
- Sobrepago normal bloqueado.
- `paid` manual sin dinero: bloqueado.
- Producción exige piezas, talla, personalización necesaria, costo congelado y **100% pagado**.
- Legacy de corte con 50% queda superseded por ORDER-002.
- Margen usa costo congelado; si hay mínimo configurado y queda debajo, exige Presidencia/Admin.
- Si `margin_min_percent` está vacío, la regla de margen está deshabilitada.
- DML directo a orders/order_items/products bloqueado.

QA pedidos: **14/14**, 0 residuo.

Consola: **`/v2/pedidos/`**.

### 13. Cortes / producción

Legacy `cortes` se normalizó como `production_batches`.

- Pedido sin pago total: bloqueado.
- Pedido sin readiness: bloqueado.
- Costo congelado faltante: bloqueado.
- Corte congela venta/costo por pedido.
- Un pedido original solo entra a un corte normal.
- Crear corte mueve pedido a `in_production` usando state machine.
- Recibir corte mueve pedido a `ready`.
- Folios `COR-YYYY-####` con bloqueo transaccional.

Consola: **`/v2/produccion/`**.

### 14. Garantías

- Solo nacen de pedido `delivered`.
- Deben referenciar una pieza real del pedido.
- Congelan descripción, atributos, cantidad y costo.
- Reposición usa lote separado `warranty_replacement` con venta **$0** y costo congelado.
- Folios `GAR-YYYY-####` / lotes `REP-YYYY-####`.
- Recepción → garantía `ready`.
- Entrega → `delivered` + timestamp explícito.

QA Cortes/Garantías: **11/11**, 0 residuo.

### 15. Porteros

- Consumo de paquete, expiración y no-cobro por sesión de paquete ya estaban implementados en backend.
- Reglas inicialmente catalogadas como pendientes fueron verificadas, corregidas a `active/tested` y probadas.
- Duración positiva y limitada.
- Capacidad positiva y expiración no anterior a compra.

### 16. Contabilidad / egresos

Nuevo backend canónico:

- `v2_expenses`
- `v2_post_expense`
- `v2_void_expense`

Reglas:
- permiso write de `accounting`.
- monto positivo.
- categoría y concepto obligatorios.
- idempotencia.
- corrección mediante `void`, no delete.
- Taquilla no puede publicar un egreso contable si no tiene permiso Accounting.

QA: post + retry idempotente + void + Taquilla bloqueada + rollback.

#### Pendiente `CUT-PAY-001`

Legacy guardaba `cortes.pago_proveedor`. En V2 esto cruza **Tienda → Contabilidad** y no se asignó autoridad sin decisión de negocio.

Opciones a decidir:
- Taquilla registra pago a proveedor.
- Contabilidad registra pago a proveedor.
- Solo Presidencia.
- Tienda registra/recibe el corte y Contabilidad publica el egreso ligado al corte.

Hasta decidirlo, el lote conserva costo pero **no genera ni marca automáticamente pago a proveedor**.

### 17. Deporte / evaluaciones / auditoría

- Partidos: **2/2**.
- Estadísticas: **19/19**.
- Evaluaciones: **13/13**; 7 ligadas, 6 sin referencia confiable preservadas sin inventar jugador.
- Nota: **1/1**.
- Evento: **1/1**.
- Paquetes/kit: **8/8**, 3 vigentes.
- Auditoría legacy: **1,262/1,262**.

## Conflictos de migración preservados

| Dominio | Tipo | Filas |
|---|---|---:|
| Asistencia | falta jugador o sesión | 6 |
| Comercio | precio histórico no reconstruible | 4 |
| Comercio | pedido sin detalle suficiente de líneas | 11 |
| Comercio | referencia a producto legacy inexistente | 4 |
| Jugadores | evaluación sin referencia confiable | 6 |
| Programas | referencia a curso legacy inexistente | 2 |

No se resolvió ningún conflicto mediante adivinación por nombre, precio o parecido.

## Suites de QA realizadas

| Suite | Resultado |
|---|---:|
| Teléfono internacional | PASS + rollback |
| Pedidos / pagos / readiness / margen | **14/14** |
| Academia / Utilería / Programas / Prospectos | **6/6** |
| Categoría + baja academia | **7/7** |
| Cortes + Garantías | **11/11** |
| Scouting rol real temporal | **7/7** |
| Programas admin/cupo | **8/8** |
| Lockdown DML + Contabilidad | PASS |
| RLS cross-tenant con segunda org | PASS |

## Consolas V2 disponibles

- `/v2/asistencia/`
- `/v2/prospectos/`
- `/v2/academias/`
- `/v2/pedidos/`
- `/v2/modulos/`
- `/v2/scouting/`
- `/v2/programas/`
- `/v2/produccion/`

Rutas públicas existentes:
- `/registro/`
- `/registro/jugadores/`
- `/registro/porteros/`
- `/pedido/`
- `/programas/`

## Cutover rule

No borrar `public.*`, no romper `/` y no retirar compatibilidad legacy hasta que cada dominio tenga:

1. datos reconciliados;
2. regla catalogada;
3. enforcement backend;
4. permisos cerrados;
5. white-box + black-box;
6. rollback limpio;
7. UI V2 usando el contrato canónico para escrituras.

## Decisiones que sí requieren negocio

Al cierre de este documento quedan **dos**:

1. **`CUT-PAY-001` — pago a proveedor:** autoridad y flujo Tienda ↔ Contabilidad.
2. **`ACA-BILL-001` — facturación Academia:** generación automática, prorrateo inicial y recargo.

Todo lo demás catalogado como activo está implementado y probado.