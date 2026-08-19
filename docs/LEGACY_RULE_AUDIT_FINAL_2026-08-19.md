# TannerOS V2 — Auditoría legacy → V2 · corte final 2026-08-19

Supabase: `pacnegivzgxpanphrnwp`  
Repo: `tannerycity/TannerOs`  
Producción: `https://app.tannerycity.com`

## Regla de autoridad

1. Decisión aprobada V2.
2. Regla legacy compatible.
3. Restricción de seguridad/plataforma que evita corrupción, bypass o cruces de tenant.

Si legacy contradice una decisión V2, **gana V2**. `/` y `public.*` continúan durante cutover como compatibilidad, no como autoridad para nuevas escrituras.

## Estado ejecutivo

- Reglas catalogadas: **106**.
- Activas + probadas: **99**.
- Reemplazadas/superseded: **3**.
- Pendientes por decisión real de negocio: **4**.
- Reglas activas sin probar: **0**.
- Conflictos de migración preservados: **33**.
- Auditoría legacy preservada: **1,262** eventos.
- DML directo desde roles de navegador (`authenticated`, `anon`, `PUBLIC`) sobre `app.*`: **0**.
- RLS cross-tenant: probado con segundo tenant temporal + rollback.

## Datos legacy reconciliados

- Prospectos: **55/55**; conversiones: **18/18**.
- Scouting: **29/29**.
- Academia: **1/1**; inscripciones: **6/6**.
- Asistencia válida: **331/331** en **24** sesiones; 6 conflictos preservados.
- Programas: **30/30**; inscripciones: **17/19**; 2 conflictos.
- Productos legacy preservados: **89/89**; catálogo operativo V2: **8** productos activos.
- Pedidos: **45/45**; líneas: **68/68**.
- Partidos: **2/2**; estadísticas: **19/19**.
- Evaluaciones: **13/13**; 7 vinculadas, 6 preservadas sin inventar jugador.
- Nota de jugador: **1/1**.
- Sponsors: **12/12** + convenios.
- Utilería: **16/16**.
- Bundles/kit legacy: **8/8**; 3 marcados activos en legacy.
- Activos publicitarios: **20/20**.
- Evento legacy: **1/1**.

## Seguridad y persistencia

- V2 usa Supabase como persistencia canónica.
- `WRITE_ROLES` estático legacy fue reemplazado por organización + membership + rol + módulo habilitado.
- Escrituras canónicas son command/RPC; la UI no es frontera de seguridad.
- QA detectó una regresión posterior de grants DML y la volvió a cerrar. El chequeo permanente ahora inspecciona `authenticated`, `anon` y `PUBLIC`.
- Legacy Sync queda **superseded** por Supabase, RLS, commands, domain events y QA de integridad.

## Teléfono y formularios públicos

- Selector internacional con búsqueda por país/lada.
- México default `+52`, exactamente 10 dígitos nacionales.
- EUA/NANP, Argentina y resto del mundo soportados.
- Frontend + backend validan.
- Persistencia E.164.
- Teléfonos históricos ambiguos se preservan raw; no se adivina país.

## Jugadores / expediente

- Dorsal único por categoría activa.
- Conversión Prospecto → Tanner evita duplicado activo y doble conversión.
- Código `TannerNNN` secuencial sin reescribir legacy.
- Un tutor primario máximo por Tanner.
- Tutor se reutiliza por teléfono canónico cuando es posible.
- Expediente V2 incluye: identidad, nacimiento, posición, pierna, dorsal, escuela, sangre, alergias, domicilio, emergencia, tutor y notas.
- Valores legacy `Derecha/Izquierda/Ambas` se normalizan al editar a `right/left/both`.
- Teléfonos de tutor/emergencia se normalizan E.164.
- Cambio de categoría se guarda atómicamente con el perfil y conserva historial de enrollment.
- `/v2/jugadores/` es la consola canónica de expedientes.

### Documentación

- Legacy tenía `doc_acta`, `doc_curp`, `doc_studies`.
- En los **67 Tanners vigentes**, los tres flags legacy estaban en falso.
- V2 sembró **201** estados documentales (3 por Tanner): Acta, CURP, estudios.
- El checklist guarda recibido/faltante, fecha, actor y nota.
- **No bloquea** participación, cobranza ni activación porque legacy no dejó evidencia para tratar faltantes como regla de elegibilidad.

## Cobranza / beneficios / ajustes

- Reglas V2 de billing mantienen precedencia: obligación día 1, vencimiento día 5, recargo futuro desde día 6, prorrateo de primer mes, pagos parciales, oldest-debt-first, saldo a favor y exenciones/beneficios definidos.
- Beca completa ya está reflejada como fee $0/exento.
- Hermanos Tanner ya está absorbido en cuota resultante; no se descuenta dos veces.
- Becas parciales migradas ya tienen cuota resultante; no se recalculan.
- `player_benefits` se muestra read-only en estado de cuenta.
- Ajustes/waivers históricos se muestran read-only con monto, fecha y motivo.
- No se creó un botón nuevo para perdonar deuda sin autoridad aprobada.

## Asistencia

- Un registro por Tanner/sesión; repetir actualiza.
- Estados canónicos: `present|absent|late|excused`.
- Inicio/fin cronológicamente válidos.
- Actor/recorder autenticado.

## Scouting / captación

- Funnel Prospectos y Scouting están separados por permisos.
- Scouting standalone no requiere Captación.
- Scores Técnico/Físico/Táctico/Mental: 0–10.
- Rol Scouting no puede convertir jugadores.
- Consolas: `/v2/prospectos/`, `/v2/scouting/`.

## Academias / porteros

- Duplicado activo Tanner+academia bloqueado.
- Fee por enrollment puede heredar default o usar override.
- Baja conserva enrollment, fecha, motivo, pagos y asistencia.
- Porteros: paquete consume capacidad y evita doble cobro; sesión suelta usa rate; duración/expiración validadas.
- Consolas: `/v2/academias/`, `/v2/porteros/`.

## Programas

- Edad validada server-side.
- Cupo manda a waitlist.
- No se puede forzar confirmación si está lleno.
- Draft apaga registro público.
- Consola: `/v2/programas/`; público: `/programas/`.

## Tienda / pedidos / kits

- Precio siempre se resuelve en backend.
- Pago real deriva `pending_payment|partial_payment|paid`.
- V2 exige **100% pagado** antes de producción; reemplaza 50% legacy.
- Talla/personalización requerida se valida antes de producción.
- Se añadió command para corregir talla/nombre/número/observación **solo antes de producción**; `in_production+` queda bloqueado.
- Snapshots de precio/costo protegen rentabilidad histórica.
- Público `/pedido/` ahora soporta productos + kits.

### Bundles/kit

- Legacy elegía Niño/Adulto y backend tomaba `priceKid/priceAdult`; V2 conserva esa regla.
- Bundle se expande a piezas reales del pedido con costo congelado.
- `Kit Game` es compatible con catálogo V2 y pasó QA: Niño **$1,299**, 4 piezas, costo congelado total **$870**.
- `Kit Training` y `Kit Tanner - Completo` permanecen bloqueados porque dependen de prendas archivadas en V2; no se reactivan productos a escondidas.

## Producción / garantías

- `cortes` → `production_batches`.
- Pedido debe estar pagado, completo y con costo congelado.
- Corte congela venta/costo y mueve a producción.
- Recepción mueve a listo.
- Garantía solo contra pedido entregado y piezas reales.
- Reposición: venta $0 + costo congelado.
- Consola: `/v2/produccion/`.

## Rendimiento deportivo

- Partido/estadística/evaluación/nota ya tienen commands V2.
- Una fila estadística máxima por Tanner+partido; repetir captura hace upsert.
- Estadísticas no pueden ser negativas.
- Tanner marcado como no asistió no puede tener minutos/goles/tarjetas/atajadas/titularidad.
- Evaluaciones canónicas 0–10; actor autenticado.
- Perfil deportivo deriva minutos, goles, asistencias, tarjetas, atajadas, partidos recientes, evaluaciones y notas.
- Consola: `/v2/deportivo/`.

## Convocatoria

- Legacy dejó módulo + permisos de escritura para Presidencia, Operaciones y Formadores, pero no dejó entidad RSVP/confirmaciones familiares.
- V2 implementa únicamente la conducta demostrable: roster por partido, seleccionado/no seleccionado + nota.
- Roster filtra Tanners activos por categoría del partido.
- Solo partidos `scheduled` aceptan cambios.
- No se inventaron estados de respuesta familiar.
- Consola: `/v2/convocatoria/`.

## Calendario

- Es una proyección unificada de `sessions + matches + programs + club_events`; no duplica datos.
- Eventos manuales usan command validado.
- Consola: `/v2/calendario/`.

## Patrocinadores / utilería / contabilidad / usuarios

- Patrocinadores: pipeline y convenios command-only, fechas/valores validados. `/v2/patrocinadores/`.
- Utilería: alta, asignación, devolución y reorder command-only. `/v2/utileria/`.
- Contabilidad: egresos idempotentes y anulación sin borrar. `/v2/contabilidad/`.
- Usuarios: invitaciones, revocaciones y memberships command-only; owner protegido. `/v2/usuarios/`.
- Administración: hub de gobierno V2. `/v2/admin/`.

## QA / integridad

`/v2/qa/` muestra:
- catálogo de reglas;
- reglas activas no probadas;
- conflictos de migración;
- auditoría legacy preservada;
- salud de grants DML canónicos.

Conflictos preservados:

| Dominio | Tipo | Filas |
|---|---|---:|
| Asistencia | falta jugador o sesión | 6 |
| Comercio | precio histórico no reconstruible | 4 |
| Comercio | pedido sin detalle suficiente | 11 |
| Comercio | referencia a producto inexistente | 4 |
| Jugadores | evaluación sin jugador confiable | 6 |
| Programas | referencia a programa inexistente | 2 |
| **Total** | | **33** |

## Cuatro decisiones reales pendientes

### `CUT-PAY-001` — pago a proveedor de un corte

V2 congela el costo del lote, pero no genera egreso automático hasta definir autoridad/flujo.

Opciones:
- Taquilla;
- Contabilidad;
- solo Presidencia;
- **recomendado:** Tienda/Producción crea lote → Contabilidad publica egreso ligado al lote.

### `ACA-BILL-001` — mensualidad de Academia

Definir:
- cargo separado vs reemplazo de cuota en ciertos casos;
- prorrateo;
- recargo;
- interacción con paquetes/sesiones de portero.

### `BENEFIT-SPONSOR-001` — Curtibrother

La regla aprobada dice “sponsor-funded, no scholarship”, pero los datos migrados no permiten reconstruir el receivable exacto:
- 5 Tanners sponsor-funded;
- cuotas legacy/V2 mezclan $0, $400 y $500;
- pagos migrados no identifican sponsor vs familia.

Definir:
- cuánto debe sponsor;
- si familia paga remanente;
- cómo cuenta en KPI de cobranza;
- tratamiento especial del caso $0/exento.

### `BILL-WAIVER-001` — autoridad para perdonar deuda

Hay 5 waivers históricos con monto/motivo, pero:
- fuente = `migration_opening_balance`;
- `created_by_user_id` histórico = null;
- auditoría legacy no recupera rol/actor de esas decisiones.

Definir:
- quién puede crear un waiver nuevo;
- si requiere motivo obligatorio;
- si hay límite/umbral de aprobación;
- si Contabilidad puede hacerlo o solo Presidencia.

## Criterio de cutover

Un dominio se considera listo cuando: datos reconciliados → regla catalogada → enforcement backend → permisos cerrados → caja blanca + caja negra → rollback limpio → UI V2 consume contrato canónico para escrituras.

Con este corte, **todo lo determinístico identificado quedó implementado o explícitamente superseded**. Las únicas reglas pendientes requieren una decisión financiera de Tannery City.