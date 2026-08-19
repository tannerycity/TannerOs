# TannerOS V2 — Auditoría legacy → V2 · cierre 2026-08-19

Supabase: `pacnegivzgxpanphrnwp`  
Repo: `tannerycity/TannerOs`  
Target productivo: `https://app.tannerycity.com`

## Regla de autoridad

1. Decisión aprobada V2.
2. Regla legacy compatible.
3. Restricción de seguridad/plataforma que evita corrupción, bypass o cruces de tenant.

Si legacy contradice una decisión V2, **gana V2**. `/` y `public.*` continúan durante cutover como compatibilidad, no como autoridad para nuevas escrituras.

## Estado ejecutivo final

- Reglas catalogadas: **100**.
- Activas + probadas: **99**.
- Superseded: **1**.
- Pendientes por decisión de negocio: **0**.
- Reglas activas sin probar: **0**.
- Conflictos de migración preservados: **33**.
- Auditoría legacy preservada: **1,262** eventos.
- DML directo desde roles de navegador sobre `app.*`: **0**.
- Los RPC financieros nuevos tienen EXECUTE para `authenticated` y **0** EXECUTE para `anon/PUBLIC`.
- QA destructivo de decisiones financieras: transaccional + rollback + **0 residuos**.

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
- El chequeo permanente inspecciona grants de `authenticated`, `anon` y `PUBLIC`.
- Legacy Sync queda **superseded** por Supabase, RLS, commands, domain events y QA de integridad.

## Jugadores / expediente

- Dorsal único por categoría activa.
- Prospecto → Tanner evita duplicado activo y doble conversión.
- Código `TannerNNN` secuencial sin reescribir legacy.
- Un tutor primario máximo por Tanner.
- Tutor se reutiliza por teléfono canónico cuando es posible.
- Expediente V2 incluye identidad, nacimiento, posición, pierna, dorsal, escuela, sangre, alergias, domicilio, emergencia, tutor y notas.
- Cambio de categoría se guarda atómicamente y conserva historial de enrollment.
- `/v2/jugadores/` es la consola canónica.

### Documentación

- Legacy tenía `doc_acta`, `doc_curp`, `doc_studies`.
- En los **67 Tanners vigentes**, los tres flags legacy estaban en falso.
- V2 sembró **201** estados documentales: Acta, CURP y estudios por Tanner.
- Checklist guarda recibido/faltante, fecha, actor y nota.
- No bloquea participación, cobranza ni activación.

## Cobranza canónica

- Obligación mensual según billing policy.
- Vencimiento día 5.
- Recargo desde día 6 cuando aplica.
- Primer mes prorrateable según `weekly_quarters`.
- Pagos parciales.
- Allocación oldest-debt-first dentro del responsable correcto.
- Saldo a favor controlado.
- Beca completa permanece fee $0/exento.
- Hermanos Tanner y becas parciales migradas no se vuelven a descontar.

### `BENEFIT-SPONSOR-001` — sponsor / Curtibrother — CERRADA

Decisión aprobada 2026-08-19:

- Sponsor-funded es configurable por Tanner.
- Se define **total mensual**.
- La cobertura del sponsor puede ser:
  - monto fijo; o
  - porcentaje.
- El remanente queda como cuenta por cobrar de familia.
- El sistema genera cargos separados:
  - `monthly_fee` → familia;
  - `monthly_fee_sponsor` → sponsor.
- Pagos sponsor solo liquidan deuda sponsor; pagos familiares no liquidan deuda sponsor.
- Para pagos sponsor se exige nombre del patrocinador.
- Los registros legacy informativos no se transformaron automáticamente; requieren configuración explícita.

QA rollback:
- $800 total + $300 sponsor → $500 familia + $300 Curtibrother.
- Pago sponsor $300 liquidó solo sponsor.
- Modo 25% sobre $800 → $200 sponsor + $600 familia.
- 101% fue rechazado.

UI: `/v2/contabilidad/` → Sponsor / Curtibrother.

### `ACA-BILL-001` — mensualidad de Academia — CERRADA

Decisión aprobada 2026-08-19:

- Academia genera **cargo separado** en el ledger del Tanner.
- `agreed_fee` tiene precedencia; si está vacío hereda la cuota de Academia.
- Primer mes usa el mismo prorrateo de billing.
- Vencimiento usa el día canónico del club.
- Primer mes respeta `first_month_late_fee_enabled`.
- Meses posteriores vencidos generan el recargo estándar.
- La automatización mensual genera cuota de club + cuota de Academia.

QA rollback:
- Academia $400 iniciando día 15 → cargo septiembre $200.
- Octubre → $400.
- Recargo posterior de Academia generado una sola vez.
- Repetir generación no duplicó cargos.

UI: `/v2/academias/` explica que Academia se cobra por separado y el primer mes puede prorratearse.

### `BILL-WAIVER-001` — autoridad de ajustes de deuda — CERRADA

Decisión aprobada 2026-08-19:

- **Solo Presidencia autoriza** un waiver, descuento o corrección descendente.
- Contabilidad puede aplicar una autorización aprobada.
- Nunca se elimina el cargo original.
- Se conserva:
  - cargo original;
  - tipo de ajuste;
  - monto;
  - motivo;
  - quién autorizó;
  - fecha/hora de autorización;
  - quién aplicó;
  - fecha/hora de aplicación.
- Presidencia puede revocar una autorización mientras siga pendiente.
- El ajuste no puede superar el saldo actual.

QA rollback:
- Cargo $100 → Presidencia autorizó $40 → Contabilidad aplicó → saldo $60.
- Con rol Contabilidad, autorización nueva fue rechazada.

UI: `/v2/contabilidad/` → Ajustes de deuda + cola de autorizaciones.

## Tienda / pedidos / kits

- Precio se resuelve en backend.
- Estados de pago derivan de dinero real.
- V2 exige **100% pagado** antes de producción.
- Talla/personalización requerida se valida antes de producción.
- Talla/nombre/número/observación pueden corregirse solo antes de producción.
- Snapshots de precio/costo protegen rentabilidad histórica.
- Pedidos ahora conservan **quién pagó** (`guardian|sponsor|player|organization|other`) y nombre del pagador.
- `/v2/pedidos/` muestra:
  - venta;
  - costo congelado;
  - utilidad bruta esperada;
  - cobrado;
  - saldo;
  - historial con pagador.

### Bundles / kit

- Niño/Adulto conserva el comportamiento legacy de `priceKid/priceAdult`.
- Bundle se expande a piezas reales con costo congelado.
- `Kit Game`: Niño **$1,299**, 4 piezas, costo congelado **$870** en QA.
- Kits que dependen de prendas archivadas permanecen bloqueados.

## `CUT-PAY-001` — cortes / pago a proveedor — CERRADA

Decisión aprobada 2026-08-19:

1. Tienda/Producción crea el corte.
2. El corte congela venta y costo por pedido.
3. Contabilidad registra pagos al proveedor **ligados al corte**.
4. Puede haber pagos parciales.
5. No puede pagarse por encima del costo congelado pendiente.
6. El egreso conserva proveedor, método, referencia, actor, fecha y vínculo al corte.

Se separan dos métricas:

- **Utilidad bruta esperada = venta congelada − costo congelado.**
- **Caja neta actual = cobrado a clientes − pagado al proveedor.**

QA rollback controlado:
- venta: $100;
- cobrado: $100;
- costo: $60;
- pagado proveedor: $60;
- pendiente proveedor: $0;
- utilidad esperada: $40;
- caja neta: $40;
- pago adicional de $1 fue rechazado.

UI: `/v2/produccion/` → Finanzas por corte. Contabilidad puede abrir el control financiero aunque no tenga permiso operativo de Tienda.

## Producción / garantías

- `cortes` → `production_batches`.
- Pedido debe estar pagado, completo y con costo congelado.
- Corte congela venta/costo y mueve a producción.
- Recepción mueve a listo.
- Garantía solo contra pedido entregado y piezas reales.
- Reposición: venta $0 + costo congelado.
- Consola: `/v2/produccion/`.

## Rendimiento deportivo

- Partido/estadística/evaluación/nota tienen commands V2.
- Una estadística máxima por Tanner+partido; repetir hace upsert.
- Valores deportivos negativos bloqueados.
- Evaluaciones 0–10.
- Perfil deportivo deriva minutos, goles, asistencias, tarjetas, atajadas, partidos, evaluaciones y notas.
- Consola: `/v2/deportivo/`.

## Convocatoria

- Legacy dejó módulo + permisos pero no entidad RSVP familiar.
- V2 implementa solo lo demostrable: roster por partido, seleccionado/no seleccionado + nota.
- Solo partidos `scheduled` aceptan cambios.
- Consola: `/v2/convocatoria/`.

## Otros dominios cerrados

- Asistencia: `/v2/asistencia/`.
- Prospectos: `/v2/prospectos/`.
- Scouting: `/v2/scouting/`.
- Programas: `/v2/programas/`.
- Porteros: `/v2/porteros/`.
- Utilería: `/v2/utileria/`.
- Patrocinadores: `/v2/patrocinadores/`.
- Calendario: `/v2/calendario/`.
- Usuarios: `/v2/usuarios/`.
- Administración: `/v2/admin/`.
- QA: `/v2/qa/`.

## Conflictos de migración preservados

| Dominio | Tipo | Filas |
|---|---|---:|
| Asistencia | falta jugador o sesión | 6 |
| Comercio | precio histórico no reconstruible | 4 |
| Comercio | pedido sin detalle suficiente | 11 |
| Comercio | referencia a producto inexistente | 4 |
| Jugadores | evaluación sin jugador confiable | 6 |
| Programas | referencia a programa inexistente | 2 |
| **Total** | | **33** |

No se resolvió ningún conflicto inventando jugador, producto, precio, país o programa.

## QA de cierre

`public.v2_qa_integrity` al cierre reporta:

- total de reglas: **100**;
- pendientes: **0**;
- superseded: **1**;
- activas/probadas: **99**;
- activas sin probar: **0**;
- conflictos de migración: **33**;
- eventos legacy: **1,262**;
- `canonicalDmlLocked = true`;
- DML directo `authenticated` sobre canónico: **0**.

Chequeo ampliado de grants:

- DML directo para `authenticated|anon|PUBLIC`: **0**.
- RPC financieros nuevos con EXECUTE `anon|PUBLIC`: **0**.
- Fixtures/residuos de QA financiero: **0**.

## Criterio de cutover

Un dominio está listo cuando: datos reconciliados → regla catalogada → enforcement backend → permisos cerrados → caja blanca + caja negra → rollback limpio → UI V2 consume contrato canónico para escrituras.

**Con las decisiones financieras del 19 de agosto de 2026, el catálogo queda en 0 reglas pendientes de decisión.**