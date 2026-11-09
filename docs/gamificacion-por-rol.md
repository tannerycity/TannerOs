# Gamificación por rol: "Mi semana"

Pedido de Presidencia (08/11/2026): que cada perfil vea una barrita de lo que le falta, con recordatorios en el centro de notificaciones, y que Presidencia vea un tablero de todos.

## Resumen

Cada persona abre TannerOS y ve una tarjeta **"Mi semana"** con:
- su barra de avance de 0 a 100%;
- la lista corta de lo que le falta, y cada pendiente abre la pantalla donde se resuelve;
- su racha de semanas al 100%.

Los pendientes que vencen pasan al centro de notificaciones (la campana). Presidencia ve las mismas barras de todos en un solo tablero.

**En mi opinión**, la clave es que **cada pendiente salga de un dato que ya existe**: asistencia tomada, planeación lista, partido cerrado. Nada se marca a mano como "hecho". Así la barra no se puede maquillar y no le agrega trabajo a nadie.

## Qué datos ya tenemos

| Rol | Qué se mide | De dónde sale (ya existe) |
|---|---|---|
| Profe | Tomó lista en cada sesión | `sessions` + `attendance_records`, cierre en `sessions.closure` |
| Profe | Planeación de la semana lista | `session_plans.status/ready_at`, corte semanal en `planning_cutoffs` |
| Profe | Tiene categoría asignada | `category_staff_assignments` |
| Profe / Dir. deportivo | Partido registrado (resultado, goles, convocados) | `matches.status/goals_for`, `match_callups`, `match_player_stats` |
| Director deportivo | Revisó la planeación de cada profe | `planning_cutoffs.resolved_status/resolved_by` |
| Marketing | Ideas de la semana, patrocinadores, seguimiento | `ideas` (área, responsable, fecha), `sponsors`, `sponsor_quotes`, `sponsor_agreements` |
| Taquilla / Operaciones | Cobros conciliados, cortes del día | conciliación (`reconciliation_status`) |
| Papás | Mensualidad a tiempo, documentos, encuestas | `charges`, premios por puntualidad (h64), `player_document_status` |

**Lo que falta crear:**
- la **meta del mes de Marketing** (3 patrocinadores) como dato configurable;
- una tabla de **"recordatorio enviado"**, para no repetir el mismo aviso.

## Historias de usuario

### Profe
1. **Como profe** quiero ver "Te faltan 2 listas esta semana" con un botón a cada sesión, **para** no dejar asistencias sin tomar.
   - *Aceptación:* una sesión que ya terminó sin `attendance_records` cuenta como pendiente. Al tomar lista, la barra sube sin recargar.
2. **Como profe** quiero un aviso el **jueves** si mi planeación de la semana siguiente no está lista, **para** llegar al corte a tiempo.
   - *Aceptación:* el aviso sale en la campana y se quita solo cuando `session_plans` queda en "lista".
3. **Como profe sin categoría asignada** quiero ver "Pide a Dirección Deportiva que te asigne categoría", **para** no tener una pantalla vacía sin saber por qué.
4. **Como profe** quiero que, después de un partido, me salga "Registra el resultado y los goles", **para** que la estadística de mis Tanners esté completa.
   - *Aceptación:* un partido de hace 24 horas o más sin resultado es pendiente.

### Director deportivo
5. **Como director deportivo** quiero ver la barra de cada profe (listas, planeación, partidos), **para** saber a quién apoyar antes del lunes.
6. **Como director deportivo** quiero un pendiente por cada planeación que no he revisado, **para** cerrar el corte semanal (`planning_cutoffs`).
7. **Como director deportivo** quiero ver qué categorías no tienen profe asignado.

### Marketing
8. **Como Marketing** quiero la meta "3 ideas esta semana" con su barra, alimentada por el banco de ideas (`ideas`, área marketing).
9. **Como Marketing** quiero la meta "3 patrocinadores nuevos este mes", **para** medir el avance comercial.
10. **Como Marketing** quiero ver qué patrocinadores llevan **más de 7 días sin seguimiento**, **para** no perder una cotización.

### Taquilla / Operaciones (Zul)
11. **Como Operaciones** quiero ver "3 cobros por aclarar" y "Corte de hoy pendiente", **para** cerrar el día limpio.

### Papás (fase 2)
12. **Como papá** quiero ver "7 de 11 meses a tiempo, vas por 50% en diciembre" en el Portal de Familias, **para** motivarme a pagar a tiempo.
    - Es la misma regla de puntualidad (h64), pero a la vista de la familia.
13. **Como papá** quiero ver qué documentos me faltan y la encuesta pendiente.

### Presidencia
14. **Como Presidencia** quiero un tablero con la barra de cada persona del staff, ordenada de menor a mayor avance, con un toque para mandarle WhatsApp, **para** saber quién va atrasado sin preguntar.
15. **Como Presidencia** quiero el resumen del lunes en la campana: "La semana pasada: 92% de listas, 8 de 10 planeaciones, 2 partidos sin registrar".

## Reglas de diseño (estilo Apple)

- **Una barra por persona y por semana**, no muchos medidores. El porcentaje es lo hecho entre lo que tocaba.
- **Máximo 3 pendientes a la vista**; el resto queda en "Ver todo".
- **Racha:** "4 semanas al 100%". Sin puntos ni monedas: en un club con staff adulto, la racha y el reconocimiento funcionan mejor que un juego infantil.
- **Avisos en la campana con horario:**
  - jueves 6 pm: planeación;
  - 9 pm del día de la sesión: lista;
  - 24 h después del partido: resultado.
  - Un aviso por pendiente, nunca repetido el mismo día.
- **Nada de exhibir en público:** cada quien ve lo suyo, y sólo Presidencia y el director deportivo ven a los demás.

## Recomendación por fases

| Fase | Qué | Por qué primero |
|---|---|---|
| **1. Profe y Director deportivo** | Tarjeta "Mi semana" (listas, planeación, partidos) y avisos en la campana | Los datos ya están completos y es donde más se pierde información hoy |
| **2. Tablero de Presidencia** | Barras de todo el staff y resumen del lunes | Usa lo mismo de la fase 1 |
| **3. Marketing** | Ideas por semana, 3 patrocinadores al mes, seguimiento | Hay que crear la meta configurable |
| **4. Papás** | Puntualidad, documentos y encuestas en el Portal de Familias | Debe pasar por la revisión de datos de menores y de lo que ve la familia |

### Por qué te recomiendo esto
- **Sale de datos reales:** nadie captura "ya lo hice", así que la barra dice la verdad.
- **Empieza donde duele:** listas y planeaciones son lo que alimenta la evaluación de los Tanners y el reporte a papás.
- **Una sola pieza:** "pendientes por rol" sirve para la tarjeta, la campana y el tablero. Se construye una vez.
- **Sin ruido:** con máximo 3 pendientes y un aviso por cosa, el staff no se cansa.

*Quick win:* la fase 1 se puede tener en una semana, porque `planning_cutoffs` ya calcula el cumplimiento.

## Decisiones de Presidencia (08/11/2026)

1. **Marketing:** 3 ideas por semana y 3 patrocinadores por mes. **Sólo el contacto vale**: con registrar al patrocinador ya cuenta.
2. **Director deportivo:** tiene **las dos barras**, la suya (semanas publicadas, categorías con profe) y la de sus profes en el tablero.
3. **Reconocimiento dentro de la app:** "Semana completa", racha de semanas al 100% y "Destacados de la semana pasada" en el tablero. Nada se publica fuera de la app.

## Lo que ya está hecho (fase 1)

- **h65 en producción:** `v2_my_week` (mi semana con racha) y `v2_team_week` (el tablero para Presidencia y el Director deportivo).
- **Inicio:** tarjeta "Mi semana" y, para quien le toca, "El equipo esta semana".
- **Mensajes > Avisos:** "Mi semana" fija arriba, con lo primero que falta.
- **Recordatorios automáticos (h69):** push al celular, una vez por cosa:
  - lista sin tomar el día de la sesión, desde las 21:00;
  - partido sin resultado al día siguiente, desde las 18:00;
  - Marketing: ideas el jueves desde las 18:00 y patrocinadores el día 25;
  - Presidencia: resumen de la semana pasada el lunes desde las 9:00.
  La planeación la avisa el ciclo de formación desde el 30/11.
- **Pendiente:** los profes reales necesitan cuenta en TannerOS con categoría asignada. Hoy sólo hay cuentas de prueba con categoría.
