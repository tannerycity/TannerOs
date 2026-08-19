# TannerOS V2 — Auditoría legacy → V2

Fecha de corte: **2026-08-19**  
Supabase: `pacnegivzgxpanphrnwp`  
Repo: `tannerycity/TannerOs`

## Autoridad
1. Decisión aprobada V2.
2. Regla legacy compatible.
3. Restricción de seguridad/plataforma que evita corrupción o bypass.

Si legacy contradice una decisión V2, **gana V2**. `/` y `public.*` permanecen durante cutover por compatibilidad, no como autoridad para nuevas escrituras.

## Estado ejecutivo
- Reglas catalogadas: **86**.
- Activas + probadas: **83**.
- Reemplazadas: **1** (`SEC-LEGACY-001`).
- Pendientes por decisión real de negocio: **2** (`ACA-BILL-001`, `CUT-PAY-001`).
- Reglas activas sin probar: **0**.
- Tablas canónicas `app.*` con INSERT/UPDATE/DELETE directo para `authenticated`: **0**.
- RLS cross-tenant: probado con segundo tenant temporal + rollback.
- QA destructivo: transaccional, con rollback y **0 residuos QA** en las suites cerradas.

## Migración de datos legacy
- Prospectos: **55/55**; conversiones ligadas: **18/18**.
- Scouting: **29/29**.
- Academia: **1/1**; inscripciones **6/6**.
- Asistencia válida: **331/331** en **24** sesiones; 6 filas irresolubles preservadas como conflictos.
- Programas: **30/30**; inscripciones **17/19**; 2 conflictos por programa inexistente.
- Productos legacy preservados: **89/89**; catálogo operativo V2: **8**.
- Pedidos: **45/45**; líneas: **68/68**.
- Sponsors: **12/12** + convenios.
- Utilería: **16/16**.
- Partidos: **2/2**; estadísticas: **19/19**.
- Evaluaciones: **13/13**; 7 ligadas y 6 preservadas sin inventar jugador.
- Nota de jugador: **1/1**; evento: **1/1**.
- Paquetes/kit: **8/8**, 3 vigentes.
- Activos publicitarios históricos: **20/20**.
- Auditoría legacy: **1,262/1,262** eventos.

## Reglas por dominio

### Seguridad
- `SEC-002`: matriz SaaS organización + rol + módulo reemplaza `WRITE_ROLES` legacy.
- `SEC-003`: todas las mutaciones canónicas relevantes se ejecutan mediante commands/RPC.
- `SEC-004`: RLS aísla lecturas por tenant; validado con tenant QA real dentro de rollback.
- El navegador conserva lectura únicamente cuando corresponde; no posee DML libre sobre `app.*`.

### Teléfono público
- Selector internacional con búsqueda país/lada.
- México default `+52`; exactamente 10 dígitos nacionales.
- EUA/NANP y Argentina soportados; resto del mundo validado como E.164.
- Frontend y backend validan; backend guarda canónico E.164.
- Datos históricos ambiguos no se adivinan.

### Jugadores / categorías
- Dorsal único dentro de categoría activa.
- Prospecto → Tanner evita duplicado activo y no convierte dos veces.
- Código `TannerNNN` secuencial sin reescribir códigos históricos.
- Tutor reutilizado por teléfono canónico cuando corresponde.
- Categoría canónica mediante `player_enrollments`.
- Cambio de categoría conserva enrollment anterior y abre el nuevo.
- Baja/reactivación conserva historia financiera y deportiva.

### Cobranza
Las reglas `BILL-001..007` V2 tienen precedencia: obligación día 1, vencimiento día 5, recargo futuro desde día 6, prorrateo de primer mes, pagos parciales, oldest-debt-first, saldo a favor y beneficios/exenciones según decisión V2.

### Asistencia
- Estados `present|absent|late|excused`.
- Un registro por Tanner/sesión; repetir actualiza.
- Inicio/fin cronológicamente válidos.
- Responsable y recorder provienen de identidad autenticada.

### Prospectos / Scouting
- Funnel y statuses canónicos V2.
- Scouting standalone no requiere acceso a Captación.
- Scores Técnico/Físico/Táctico/Mental: 0–10.
- Rol Scouting no puede convertir jugadores.
- Consola: `/v2/scouting/`.

### Academias
- Duplicado activo Tanner+academia bloqueado.
- Fee individual puede heredar default o usar override.
- Baja de academia conserva enrollment, fecha, motivo, pagos y asistencia.
- **Pendiente `ACA-BILL-001`**: decidir cómo `academy_fee` entra al ledger de cobranza y cómo interactúa con prorrateo/recargos.

### Programas
- Rango de edad validado server-side.
- Cupo manda a waitlist; no se puede forzar confirmación si está lleno.
- Draft apaga registro público.
- Escrituras command-only.
- Consola: `/v2/programas/`; formulario público: `/programas/`.

### Pedidos / tienda
- Precio se resuelve en backend; cantidades > 0.
- Estados canónicos: `draft → pending_payment → partial_payment/paid → in_production → ready → delivered` más cancelled/refunded.
- V2 exige **100% de pago real** antes de producción; reemplaza el 50% legacy.
- `partial_payment`/`paid` derivan del dinero, no de selección manual.
- Sobrepago normal bloqueado.
- Talla/personalización obligatoria antes de producción cuando aplica.
- Snapshots de precio/costo preservan rentabilidad histórica; si no se puede reconstruir, se registra conflicto.
- Consola: `/v2/pedidos/`.

### Cortes / producción / garantías
- `cortes` se normaliza como `production_batches`.
- Corte requiere pedido pagado, completo y con costo congelado.
- Corte congela venta/costo y mueve a producción; recepción mueve a listo.
- Garantía solo contra pedido entregado y piezas reales.
- Reposición: lote `warranty_replacement`, venta $0, costo congelado.
- Entrega de garantía es explícita y fechada.
- Consola: `/v2/produccion/`.
- **Pendiente `CUT-PAY-001`**: autoridad sobre pago a proveedor de un corte.

### Porteros
- Sesión con paquete consume capacidad y no crea segundo cobro.
- Sesión suelta genera su cobro según rate.
- Duración positiva; paquete positivo; expiración válida; historial trazable.
- Consola: `/v2/porteros/`.

### Utilería
- Reorder solo si `min_stock > 0` y disponible llega al umbral.
- `min_stock=0` no crea falso reorder.
- Alta, asignación y devolución por commands.
- Consola: `/v2/utileria/`.

### Patrocinadores
- Pipeline y convenios son command-only.
- Teléfono se normaliza; valor potencial no puede ser negativo.
- Fin de convenio no puede preceder inicio; valor monetario no puede ser negativo.
- Beneficios/derechos y entregables permanecen trazables.
- Edición de sponsor/convenio consume API admin canónica.
- Consola: `/v2/patrocinadores/`.

### Contabilidad
- Egresos se publican mediante command idempotente.
- Anular no borra: cambia estado y conserva motivo/timestamp.
- Taquilla no puede publicar egresos contables si no tiene permiso Accounting.
- Consola: `/v2/contabilidad/`.
- Pago a proveedor de corte no se publica automáticamente hasta resolver `CUT-PAY-001`.

### Usuarios
- Invitaciones duran 7 días y se aceptan al crear cuenta con el mismo correo.
- Invitaciones, revocaciones y cambios de membership pasan por commands.
- Owner está protegido contra degradación/desactivación desde administración estándar.
- Roles se traducen a la matriz operativa V2.
- Consola: `/v2/usuarios/`.

### Calendario
- No existe una copia paralela del calendario.
- `/v2/calendario/` proyecta `sessions + matches + programs + club_events`.
- Eventos manuales se crean mediante command con título/fecha/tipo/status válidos.
- Lectura directa de tabla continúa bloqueada al navegador.

### Administración
- `/v2/admin/` es hub de gobierno; no inventa settings sensibles.
- Centraliza Usuarios, Módulos/SaaS, QA, Contabilidad, Calendario y consolas operativas según permisos.
- `/v2/modulos/` ya tiene destino real para todos los módulos habilitados actuales.

## Conflictos de migración preservados
| Dominio | Tipo | Filas |
|---|---|---:|
| Asistencia | falta jugador o sesión | 6 |
| Comercio | snapshot histórico de precio no reconstruible | 4 |
| Comercio | pedido sin líneas suficientes | 11 |
| Comercio | producto legacy inexistente | 4 |
| Jugadores | evaluación sin jugador confiable | 6 |
| Programas | programa legacy inexistente | 2 |

No se resolvió ningún conflicto adivinando por nombre, precio o país.

## QA cerrado
- Teléfono público: RPC real + white-box; rollback.
- Pedidos: **14/14**.
- ACA/EQUIP/PROG/PROS base: **6/6**.
- Categoría + baja academia: **7/7**.
- Cortes/Garantías: **11/11**.
- Scouting: **7/7** con rol temporal + rollback.
- Programas admin: **8/8**.
- Sponsors admin: alta/consulta/convenio/fechas + rollback.
- Security lockdown: 0 DML directo + smoke commands.
- RLS tenant isolation: tenant QA + rollback.
- Usuarios: crear/consultar/revocar invitación + owner protegido + rollback.
- Calendario: crear/consultar evento, validación y 0 residuo.

## Decisiones que faltan

### `CUT-PAY-001` — pago a proveedor
Elegir autoridad y flujo:
- Taquilla;
- Contabilidad;
- solo Presidencia;
- o **Tienda crea corte → Contabilidad publica egreso ligado al corte**.

Hasta decidir, el lote conserva costo pero no genera egreso automático.

### `ACA-BILL-001` — mensualidad de academia
Definir si la mensualidad de academia:
- se suma como cargo separado al ledger del Tanner;
- reemplaza una cuota de club en ciertos casos;
- aplica recargo desde día 6 igual que mensualidad;
- y cómo se comporta cuando el Tanner tiene paquete/sesión suelta.

Hasta decidir, la academia conserva fee/enrollment, pero no altera automáticamente la cartera canónica.

## Criterio de cutover
Un dominio está listo cuando: datos reconciliados → regla catalogada → enforcement backend → permisos cerrados → caja blanca + caja negra → rollback limpio → UI V2 usa exclusivamente el contrato canónico para escrituras.