# TannerOS V2 — Auditoría legacy → V2

Fecha de corte: **2026-08-19**  
Supabase: `pacnegivzgxpanphrnwp`  
Repo: `tannerycity/TannerOs`

## Criterio de precedencia

1. **Decisión aprobada V2**.
2. Regla legacy compatible.
3. Seguridad/plataforma cuando evita corrupción, cruces de tenant o bypass de reglas.

Si legacy contradice una decisión V2 aprobada, **gana V2**. Legacy permanece como evidencia y compatibilidad durante cutover, no como autoridad.

## Estado ejecutivo

- Reglas catalogadas en `app.business_rule_catalog`: **73**.
- Activas + probadas: **71**.
- Reemplazadas explícitamente por V2: **1** (`SEC-LEGACY-001`).
- Pendientes por decisión real de negocio: **1** (`CUT-PAY-001`).
- Toda regla activa del catálogo tiene `test_status = tested` al cierre de esta auditoría.
- QA destructivo/operativo se ejecutó con subtransacciones y rollback; las suites reportaron **0 filas QA residuales**.

## Regla legacy → resultado V2

### Seguridad y permisos

| Regla | Resultado | V2 |
|---|---|---|
| `WRITE_ROLES` estático por entidad | **REEMPLAZADA** | `SEC-002`: matriz SaaS explícita por organización/rol/módulo. |
| Escritura directa de pedidos/productos desde cliente | **ENDURECIDA** | `authenticated` conserva SELECT, pero no INSERT/UPDATE/DELETE en `app.orders`, `app.order_items`, `app.products`. Escritura solo por comandos. |
| Actor libre en asistencia/scouting | **ENDURECIDA** | Actor/responsable proviene de `auth.uid()`. |
| Relaciones entre organizaciones | **ENDURECIDA** | FKs/commands tenant-safe. |

### Teléfono público

| Regla | Resultado | V2 |
|---|---|---|
| México | **ACTIVA** | +52 por defecto, exactamente 10 dígitos nacionales. |
| EUA/NANP | **ACTIVA** | +1 + 10 dígitos. |
| Argentina | **ACTIVA** | +54 fijo o móvil E.164. |
| Resto del mundo | **ACTIVA** | envolvente E.164 válida. |
| Persistencia | **ACTIVA** | valor canónico E.164 en backend. |
| Teléfonos históricos ambiguos | **PRESERVADOS** | no se adivina país; se conserva raw legacy cuando no puede normalizarse de forma determinística. |

### Jugadores / categorías

- Dorsal único por categoría activa: **ACTIVO**.
- Conversión Prospecto → Tanner con protección de duplicado: **ACTIVO**.
- Código Tanner secuencial sin reescribir códigos históricos: **ACTIVO**.
- Reutilización de tutor por teléfono canónico: **ACTIVO**.
- Categoría canónica mediante `player_enrollments`: **ACTIVO**.
- Un solo enrollment de club activo por Tanner: **ACTIVO**.
- Cambio de categoría conserva historia, cierra enrollment anterior y crea uno nuevo: **ACTIVO + QA rollback**.

### Cobranza

Las reglas `BILL-001..007` permanecen como decisiones V2 aprobadas y tienen precedencia sobre comportamiento financiero legacy cuando existe conflicto.

### Asistencia

- Estados canónicos `present|absent|late|excused`: **ACTIVO**.
- Sesión no puede terminar antes de iniciar: **ACTIVO**.
- Responsable/recorder autenticado: **ACTIVO**.
- Historial legacy válido: **331/331** registros migrados en **24** sesiones.
- **6** filas legacy sin `player_id`/`session_id`: excluidas del dominio operativo y registradas como conflictos de migración.

### Prospectos / Scouting

- Prospectos legacy: **55/55** migrados.
- Conversiones legacy: **18/18** ligadas al Tanner correcto.
- Scouting legacy: **29/29** migrados (**3 open**, **26 históricos/closed**).
- Scouting puede existir sin Prospecto: **ACTIVO**.
- Scores Técnico/Físico/Táctico/Mental: **0–10**.
- Escritura de Scouting directa a tabla: **BLOQUEADA**; solo comandos autorizados.
- Rol Scouting no obtiene acceso a Captación ni a conversión de jugadores: **ACTIVO + QA**.
- Consola standalone: `/v2/scouting/`.

### Academias

- Academia legacy: **1/1** migrada.
- Inscripciones: **6/6** migradas; **5 activas + 1 histórica**.
- Duplicado activo jugador+academia: **BLOQUEADO**.
- Fee por jugador puede usar default de academia o override individual: **ACTIVO**.
- Baja de academia conserva enrollment, fecha y motivo; no borra historia: **ACTIVO + QA rollback**.

> Pendiente de diseño financiero separado: generación automática de `academy_fee` dentro del mismo ledger y tratamiento de recargos. La regla de prorrateo existe conceptualmente, pero no se activó en producción para no alterar cartera sin definir su interacción financiera.

### Programas / cursos

- Programas legacy: **30/30** migrados.
- Inscripciones: **17/19** migradas canónicamente.
- **2** inscripciones apuntan a cursos legacy inexistentes y no tienen match determinístico: preservadas como conflictos, sin inventar relación.
- Rango de edad público: **ACTIVO + QA**.

### Tienda / pedidos

Decisión V2 de catálogo: **8 productos limpios activos**. Los **89/89 productos legacy** se preservan como histórico, pero no se reviven como catálogo operativo.

Pedidos:
- **45/45** headers migrados.
- **68/68** líneas migradas.
- Precio/costo histórico usa snapshots congelados cuando existen.
- Cuando no existe snapshot de precio, solo se reconstruye si el catálogo legacy concilia exactamente con subtotal guardado.
- Si no puede reconstruirse, se registra conflicto; nunca se inventa rentabilidad.

Reglas V2:
- `pending → partial/paid → production` tiene precedencia.
- Legacy permitía corte con 50%; V2 exige **100% de pago registrado** antes de producción.
- `partial_payment` y `paid` derivan del dinero ligado al pedido; no son estados manuales.
- Sobrepago normal bloqueado.
- Antes de producción: piezas + talla + personalización requerida + pago completo.
- Descuento/margen se calcula con costo congelado; si se configura margen mínimo, quedar debajo exige Presidencia/Admin.
- Si `margin_min_percent` está vacío, la regla de margen está deshabilitada.
- `/v2/pedidos/` ya consume pagos, saldo y readiness del backend.

### Cortes / producción

Legacy `cortes` fue normalizado como `production_batches`.

- Pedido sin pago completo: **BLOQUEADO**.
- Pedido incompleto: **BLOQUEADO**.
- Costo congelado faltante: **BLOQUEADO**.
- Corte congela `sale_snapshot` y `cost_snapshot`.
- Un pedido original solo puede pertenecer a un corte normal.
- Crear corte mueve pedido pagado/listo a `in_production` por state machine.
- Recibir corte mueve pedido a `ready`.
- QA: **11/11** suite Cortes/Garantías, con rollback y 0 residuo.

### Garantías

- Solo se abre contra pedido `delivered`.
- Debe referenciar al menos una pieza real del pedido.
- Congela descripción, atributos, cantidad y costo de la pieza original.
- Reposición usa lote separado `warranty_replacement` con venta **$0** y costo congelado.
- Recepción: garantía → `ready`.
- Entrega: acción explícita → `delivered` + timestamp.

### Porteros

- Paquetes, consumo, expiración y no-cobro por sesión de paquete ya estaban implementados en backend; las reglas inicialmente catalogadas como pendientes fueron corregidas a activas/tested tras inspección de código y QA.
- Duración de sesión positiva y limitada.
- Capacidad de paquete positiva y expiración no anterior a compra.

### Utilería

- Inventario legacy: **16/16** migrado.
- Reorder solo cuando `min_stock > 0` y cantidad cae al umbral: **ACTIVO + QA**.
- `min_stock = 0` no crea falso reorder.

### Sponsors / eventos / deporte / auditoría

- Sponsors: **12/12** + acuerdos preservados.
- Partidos: **2/2**.
- Estadísticas: **19/19**.
- Evaluaciones: **13/13**; **7** ligadas a jugador, **6** sin referencia confiable preservadas sin inventar vínculo.
- Nota de jugador: **1/1**.
- Evento: **1/1**.
- Paquetes/kit legacy: **8/8**, **3 vigentes**.
- Activos publicitarios históricos: **20/20**.
- Auditoría legacy: **1,262/1,262** eventos preservados.

## Conflictos de migración preservados

`app.legacy_migration_conflicts` registra datos que no pueden convertirse con certeza:

| Dominio | Tipo | Filas |
|---|---|---:|
| Asistencia | falta jugador o sesión | 6 |
| Comercio | snapshot histórico de precio no reconstruible | 4 |
| Comercio | pedido sin detalle de líneas suficiente | 11 |
| Comercio | referencia a producto legacy inexistente | 4 |
| Jugadores | evaluación sin referencia confiable a jugador | 6 |
| Programas | referencia a curso legacy inexistente | 2 |

Ninguno de estos conflictos se resolvió mediante adivinación por nombre/precio.

## QA realizado

- Teléfono: white-box + RPC público real; MX inválido rechazado, EUA canonizado, rollback 0 residuo.
- Pedidos: **14/14** casos, incluidos pagos, state machine, readiness, margen, permisos y rollback.
- Reglas ACA/EQUIP/PROG/PROS: **6/6** incluyendo rollback.
- Categoría + baja academia: **7/7**.
- Cortes/Garantías: **11/11**.
- Scouting con rol real temporal y rollback: **7/7**.

## Decisiones V2 que reemplazan legacy

1. **Autorización:** `SEC-002` role/module matrix reemplaza `WRITE_ROLES` estático (`SEC-LEGACY-001`).
2. **Producción:** ORDER-002 exige pago completo; el 50% legacy queda como evidencia histórica, no criterio operativo.
3. **Catálogo:** 8 productos V2 activos; los otros productos legacy son históricos.
4. **Persistencia:** tablas `app.*` son el modelo canónico; `public.*` legacy continúa durante cutover, pero no debe dictar nuevas reglas.

## Única regla catalogada pendiente al cierre

### `CUT-PAY-001` — pago a proveedor

Legacy guarda `cortes.pago_proveedor`. En V2 la operación cruza Tienda y Contabilidad, y todavía no existe una decisión de autoridad:

- ¿Puede registrarlo Taquilla?
- ¿Debe registrarlo Contabilidad?
- ¿Solo Presidencia?
- ¿O Tienda registra el corte y Contabilidad publica el egreso contra ese corte?

Hasta resolverlo, V2 conserva costo del lote pero **no inventa actor ni publica automáticamente un egreso**.

## Principio de cutover

No borrar `public.*` ni romper `/` hasta completar reconciliación, UI V2 y validación. Cada dominio se considera listo para corte cuando:

1. datos reconciliados;
2. regla catalogada;
3. enforcement backend;
4. permisos cerrados;
5. caja blanca + caja negra;
6. rollback limpio;
7. UI V2 consume exclusivamente el contrato canónico para escrituras.