# Diagnóstico previo · Asistencia, Conciliación de pagos y Montos de cobro

Fecha: 2026-09-23 · Medido contra producción (`pacnegivzgxpanphrnwp`), solo lectura.

Todos los números de este documento salen de consultas a la base real, no de
suposiciones. Cada uno se puede volver a correr.

---

## Resumen en una página

Las tres áreas tienen **la arquitectura ya hecha**. Lo que falta es distinto en
cada una:

| Área | Qué existe | Qué falta de verdad |
|---|---|---|
| Asistencia | Captura completa, 4 estados soportados extremo a extremo | **Cero consultas de estadística.** No hay un solo RPC que agregue |
| Conciliación | Registro de pagos con trazabilidad de quién cobró | **La máquina de estados completa.** Hoy un pago nace válido |
| Montos de cobro | Padrón de becas, cuota por Tanner, saldos | **El "monto ordinario" no existe en ninguna tabla** |

Y hay **tres hallazgos que cambian el diseño**. No son detalles: si los ignoro,
te entrego pantallas que mienten.

---

## Hallazgo 1 · El 39.6% de las asistencias esperadas no está marcado

Crucé las sesiones no canceladas con los Tanners inscritos en esa categoría en
esa fecha:

```
pares esperados (sesión × Tanner inscrito)   328
con registro de asistencia                   198
SIN MARCAR                                   130   (39.6%)
```

Esto obliga a una decisión de diseño, porque las dos salidas obvias están mal:

- Si cuento **falta = registro con estado `absent`**, el reporte dice 166
  faltas cuando en realidad hay 130 casos más donde nadie sabe qué pasó. El
  porcentaje de asistencia sale inflado.
- Si cuento **falta = programadas − presentes**, le cuelgo 130 faltas a Tanners
  que quizá sí fueron y el profe no alcanzó a marcar. Eso es injusto y además
  te va a llegar como queja de un papá.

**Lo que propongo:** tres cubetas visibles — `presente`, `falta`, `sin marcar` —
y el porcentaje calculado **solo sobre lo marcado**, con el número de "sin
marcar" a un lado como medida de qué tan confiable es ese porcentaje. Así
Presidencia ve el dato y también ve cuánto puede creerle.

Esto además te da gratis un indicador que hoy no tienes: **qué profe no está
cerrando sus listas**.

---

## Hallazgo 2 · Justificadas y retardos existen en el código, pero nadie los usa

La cadena completa ya los soporta:

- La pantalla ofrece los cuatro botones: Presente, Tarde, Justificado, Ausente
  (`v2/asistencia/app.js`).
- El comando los valida: `if v_status not in ('present','absent','late','excused')`.
- La tabla los permite: `CHECK (status = ANY (ARRAY['present','absent','late','excused']))`.

Pero lo capturado es:

```
present   381
absent    166
late        0
excused     0
```

Y en `punctuality`: `Puntual` 235, `Tarde` 1, sin dato 311.

**No es un bug: es uso.** Los profes solo aprietan Presente y Ausente.

Consecuencia directa: si te entrego hoy el reporte de "faltas justificadas" y
"retardos", te va a salir **cero en todo**, y va a parecer que la función no
sirve. Lo voy a construir igual (la pediste y la tubería ya está), pero la
pantalla tiene que decir *"aún no se registran justificadas"* en vez de un `0`
pelón, y vale la pena empujar a los profes a usar los otros dos botones.

---

## Hallazgo 3 · La "mensualidad ordinaria" no existe en ninguna tabla

Este es el que bloquea la fórmula que pediste:

> `Monto ordinario − beneficio autorizado = monto final a cobrar`

Lo que hay hoy:

- `app.categories` → columnas: `id, organization_id, code, name, min_age, max_age, status, sort_order`.
  **No hay columna de precio.** Ninguna categoría tiene tarifa configurada.
- `app.billing_profiles.base_monthly_fee` → la cuota **por Tanner**. Esta es la
  única cifra que el sistema usa para cobrar.
- `app.player_benefits` → 30 beneficios activos.

El problema es cómo se relacionan. Medido en el cargo de septiembre 2026:

| Tanner | Beneficio registrado | Cuota en su perfil | Cargo generado | Descuento aplicado |
|---|---|---|---|---|
| Santiago Crespo | beca parcial | 400 | 400 | 0 |
| Iker Flores | hermanos $50 | 750 | 750 | 0 |
| Agustín Zamora | hermanos $50 | 750 | 750 | 0 |
| Leonardo Preciado | beca parcial $400 | 500 | 500 | 0 |
| Emilio Ibarra | hermanos $400 | 400 | 400 | 0 |

Y en el agregado del mes:

```
septiembre 2026   55 cargos   base 30,750   descuentos 200   neto 30,550
cargos ligados a un beneficio (player_benefit_id):  0   ← en los tres meses
```

**Traducción:** el descuento ya viene metido a mano dentro de
`base_monthly_fee`. El renglón del beneficio es **una etiqueta**, no un
cálculo. De hecho **18 de los 30 beneficios activos tienen
`calculation_type = 'informational'`**, que literalmente significa "no afecta
el monto".

Por eso no puedo mostrar `ordinario − beneficio = final`: el sistema **nunca
guardó el ordinario**. Si lo invento, creo el segundo monto que tú mismo
pediste no crear.

Hay un detalle más que sí puedo resolver de una vez: en septiembre hay **43
recargos de $100** (`charge_type='late_fee'`). Hoy Taquilla no los ve juntos
con la mensualidad, y es parte de "cuánto le cobro".

---

## Qué se va a tocar

### Tablas existentes (solo lectura, salvo donde se indique)

| Tabla | Uso |
|---|---|
| `app.sessions` | sesiones; ya admite `cancelled`, falta el comando para cancelar |
| `app.attendance_records` | `status`, `punctuality`, `recorded_by_user_id` |
| `app.player_enrollments` | quién estaba inscrito en la categoría en esa fecha |
| `app.categories` | nombre de la categoría |
| `app.payments` | **se le agregan** columnas de conciliación |
| `app.billing_profiles` | `base_monthly_fee`, `is_exempt` |
| `app.player_benefits` | tipo, cálculo, monto, vigencia |
| `app.charge_balances` | `net_amount`, `balance_due`, recargos |

### Tablas nuevas

| Tabla | Para qué |
|---|---|
| `app.payment_reconciliations` | historial de cambios de estado: quién, cuándo, de qué a qué, motivo |

### RPC nuevos

| RPC | Área |
|---|---|
| `v2_attendance_stats` | resumen por categoría y periodo |
| `v2_attendance_player` | historial individual con tendencia |
| `v2_portal_attendance` | lo que ve la familia de su propio hijo |
| `v2_cancel_attendance_session` | cancelar sin que cuente como falta |
| `v2_payments_to_reconcile` | bandeja de Presidencia |
| `v2_reconcile_payment` | aprobar / rechazar / pedir aclaración |
| `v2_collection_amounts` | montos de cobro con su condición vigente |

### RPC que se reutilizan sin tocarse

`v2_attendance_sessions`, `v2_attendance_roster`, `v2_attendance_categories`,
`v2_save_attendance`, `v2_billing_players`, `v2_scholarships`,
`v2_open_receivables`, `v2_collection_snapshot`, `v2_my_modules`.

### Archivos del front

| Archivo | Cambio |
|---|---|
| `v2/asistencia/index.html` + `app.js` + `styles.css` | pestaña de estadísticas dentro del módulo actual |
| `v2/familias/app.js` | tarjeta de asistencia del hijo |
| `v2/taquilla/index.html` + `app.js` | bandeja de conciliación + Montos de cobro |
| `v2/jugadores/app.js` | ya consume `v2_scholarships`; se enlaza, no se duplica |

**No se crea ningún módulo nuevo.** Becas y beneficios ya viven en Jugadores;
Montos de cobro entra como pestaña en Taquilla, junto a lo que ya carga
`v2_billing_players` y `v2_open_receivables` (líneas 235 y 243 de
`v2/taquilla/app.js`).

---

## Flujo propuesto de conciliación

```
        Taquilla / Administración registra
                     │
                     ▼
        ┌────────────────────────┐
        │ Pendiente de conciliar │ ◄──────────┐
        └────────────────────────┘            │
                     │                        │
         Presidencia revisa                   │ corrige y reenvía
                     │                        │
        ┌────────────┼────────────┐           │
        ▼            ▼            ▼           │
   ┌─────────┐ ┌──────────┐ ┌───────────┐     │
   │Aprobado │ │Rechazado │ │Aclaración │ ────┘
   └─────────┘ └──────────┘ └───────────┘
        │            │            │
    liquida      NO liquida   NO liquida
     deuda        la deuda     la deuda
```

**La decisión fina, y es importante:** hoy `v2_post_payment` llama a
`app.allocate_payment_oldest_first`, que **aplica el pago a los adeudos en el
acto**. Si la aprobación ahora es la que libera la deuda, hay que mover ese
paso. Son dos caminos:

- **A · El pago aplica al registrarse** (como hoy) y la conciliación es un
  sello de auditoría encima. Cero riesgo para lo que ya corre. Pero un pago
  rechazado deja deuda ya marcada como pagada y hay que revertirla.
- **B · El pago solo aplica al aprobarse.** Es lo que dice tu spec
  ("un pago rechazado no debe marcar la deuda como liquidada"). Es lo correcto,
  y es el cambio de mayor riesgo de todo este trabajo: toca el motor de
  cobranza que ya está en producción con 238 pagos aplicados.

Mi recomendación va abajo.

---

## Riesgos

| # | Riesgo | Gravedad | Cómo lo contengo |
|---|---|---|---|
| 1 | Cambiar cuándo se aplica el pago a la deuda toca el motor de cobranza vivo | **Alta** | Migración aparte, al final, con los 238 pagos existentes entrando como `aprobado` para que nada cambie de estado |
| 2 | Los 318 pagos históricos no tienen estado de conciliación | Media | `default 'approved'` + columna `reconciled_at` nula = "es de antes". No se reescribe historia |
| 3 | Agregar parámetros a RPC vivos crea funciones duplicadas | **Alta** | Ya nos pasó y tumbó Taquilla. Toda migración crea *y* borra en la misma transacción, y verifica que quede una sola |
| 4 | El 39.6% sin marcar hace que cualquier % sea discutible | Media | Se muestra la cubeta "sin marcar" siempre; el % nunca se presenta solo |
| 5 | `QA Becado` aparece 7 veces en el padrón de becas de producción | Baja | Es data de prueba en producción. Lo reporto; no lo borro sin tu OK |
| 6 | Métodos de pago sin normalizar (`efectivo`/`cash`, `transferencia`/`transfer`) | Baja | Las consultas ya normalizan al leer; no toco lo guardado |
| 7 | El rol "Administración" de tu spec no existe | Media | Los roles reales son: Presidencia, Formadores, Contabilidad, Academia, Scouting, Marketing, Operaciones, Taquilla |

---

## Plan por pasos

Cada paso es un commit que deja el sistema funcionando. Ninguno depende del
siguiente para no romper nada.

| Paso | Qué | Riesgo |
|---|---|---|
| 1 | `v2_attendance_stats` + `v2_attendance_player` (solo lectura, no tocan nada) | Nulo |
| 2 | Pestaña de estadísticas en Asistencia + cancelar sesión | Bajo |
| 3 | Asistencia del hijo en el portal de Familias | Bajo |
| 4 | `v2_collection_amounts` + pestaña Montos de cobro en Taquilla | Bajo |
| 5 | PDF del reporte de montos | Nulo |
| 6 | Columnas y tabla de conciliación + bandeja de Presidencia | Medio |
| 7 | Mover el momento en que el pago libera la deuda (solo si eliges B) | **Alto** |
| 8 | Pruebas: permisos, cálculos, estados, pagos duplicados | — |

---

## Decisiones tomadas (Presidencia, 2026-09-23)

1. **Mensualidad ordinaria → tarifa por categoría.** Se agrega la cuota mensual
   a `app.categories` y Presidencia la captura una vez por categoría. El
   ordinario sale de ahí; el beneficio es la diferencia contra la cuota real del
   Tanner. Así la resta cuadra sola y hay una sola fuente de precio.
2. **Camino A · sello de auditoría.** El pago sigue aplicando al registrarse.
   La conciliación queda encima: bandeja, aprobar, rechazar, pedir aclaración e
   historial completo. No se toca `allocate_payment_oldest_first`. Un rechazo
   revierte la aplicación con el reverso que ya existe.
3. **PDF: Presidencia y Contabilidad.** Nadie más exporta.
