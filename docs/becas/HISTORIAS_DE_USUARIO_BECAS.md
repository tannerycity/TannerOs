# Becas · Historias de usuario y auditoría UX (09/11/2026)

**Para:** Presidencia (Mich) · **Módulo:** `/v2/becas/` · **Estado:** propuesta para aprobar

## 0. Resumen

| | |
|---|---|
| **Bug que te bloqueaba** | "No pudimos abrir las solicitudes públicas". Arreglado en prod (h82). Hoy hay **2 solicitudes nuevas** (BC-2026-0001 y 0002, Apoyo de Ingreso). |
| **Causa** | Los 2 envoltorios de las solicitudes de Centro Tanner no corrían con permisos del club. Se agregó una barrera en CI para que no vuelva a pasar. |
| **Becas vigentes** | 15 becas activas (6 totales, 8 parciales, 1 patrocinio) + 6 descuentos de hermanos. **Las 21 son heredadas**: ninguna tiene modalidad, fecha de revisión ni solicitud que la respalde. |
| **Veredicto UX** | Funciona, pero **no es estilo Apple todavía**: 4 lugares distintos para "solicitudes", títulos repetidos, la acción más grande de la ficha es la destructiva y no existe "Renegociar". |

## 1. Auditoría UX contra principios Apple (HIG)

| # | Principio Apple | Lo que hay hoy | Severidad | Propuesta |
|---|---|---|---|---|
| U1 | **Claridad**: un concepto, un nombre, un lugar | Las solicitudes viven en 4 lados: pestaña "Solicitudes de beca", pestaña "Pedidas desde Centro Tanner", tarjeta "Peticiones directas" dentro de Becados y el contador "Solicitudes" | Alta | **Una sola bandeja "Solicitudes"** con etiqueta de origen (Centro Tanner · Portal · Nominada) |
| U2 | **Deferencia**: el contenido manda, no el cromo | Pestaña "Pedidas desde Centro Tanner" + hero gigante con el mismo texto + subtítulo "desde Centro Tanner, sin sesión" | Media | Quitar el hero repetido. El título lo da la pestaña |
| U3 | **Segmented control** de 2-3 opciones en una línea | Tres botones que se parten en dos renglones a 390px, debajo de otras tres pestañas (Jugadores/Asistencia/Becas) | Media | 2 segmentos: **Becados · Solicitudes (n)** |
| U4 | **Acción destructiva secundaria y con confirmación clara** | "Suspender / cancelar beca" es el botón rojo más grande de la ficha; usa `confirm()` del navegador | Alta | Una acción principal: **"Revisar beca"** (Mantener / Renegociar / Retirar). Retirar va al final, con hoja de confirmación propia |
| U5 | **Estados de error con salida** | Caja roja "No pudimos abrir…" sin reintentar ni explicar | Media | Mensaje humano + botón **Reintentar** |
| U6 | **No sacar al usuario de contexto** | "Ver expediente y editar beca" manda a otro módulo para cambiar el % | Media | Renegociar dentro de la misma hoja |
| U7 | **Progressive disclosure** | La ficha muestra 7 datos + advertencias + 3 botones a la vez | Baja | Arriba: asistencia, % y vence. Abajo, plegado: detalle y advertencias |
| U9 | **Lenguaje humano** | El push y algunas etiquetas muestran códigos (`ingreso`, `apoyo_familiar`) | Baja | Siempre el nombre: "Apoyo de Ingreso" |
| U8 | **Feedback inmediato** | Al marcar "contactada" no hay confirmación visible | Baja | Toast "Marcada como contactada" + la fila cambia de estado |

## 2. Tus historias (pulidas)

Formato: *Como … quiero … para …* + criterios de aceptación (Given/When/Then).

### Épica A · "¿Quién me pidió una beca?"

**HU-01 · Ver todas las solicitudes en un solo lugar**
Como Presidencia, quiero ver en una sola bandeja todas las solicitudes de beca (Centro Tanner, Portal y nominaciones), para no perder ninguna.
- **Given** hay solicitudes de 3 orígenes **When** abro Becas → Solicitudes **Then** las veo juntas, la más nueva arriba, con etiqueta de origen.
- **Then** cada fila dice: nombre del niño, quién la pidió, modalidad, folio, hace cuánto y estado.
- **Then** el contador de la pestaña muestra sólo las **Nuevas**.

**HU-02 · Saber de inmediato que llegó una**
Como Presidencia, quiero un aviso cuando una familia pide beca, para responder el mismo día.
> Hallazgo: el push ya existe, pero hoy dice "{tutor} pide {modalidad} para {niño}" (nombre del menor y la modalidad en código, ej. `ingreso`). Rompe la regla de push sin nombres de menores. Se corrige en el Sprint 1.
- **When** se crea una solicitud **Then** me llega push "Nueva solicitud de beca · Apoyo de Ingreso" **sin el nombre del niño**.
- **Then** el push abre la solicitud.

**HU-03 · Responder a la familia**
Como Presidencia, quiero escribirle por WhatsApp desde la solicitud y marcarla como contactada, para llevar control.
- **When** toco "Escribir por WhatsApp" **Then** se abre con un mensaje base firmado por el club.
- **When** marco "Contactada" **Then** queda quién y cuándo, y pasa al filtro Contactadas.

**HU-04 · Convertirla en beca o rechazarla**
Como Presidencia, quiero decidir cada solicitud (vincular a un jugador y abrir el proceso formal, o rechazar con motivo), para cerrar el ciclo.
- **Given** el niño ya está inscrito **When** lo busco y vinculo **Then** queda ligada a su ficha y puedo abrir el proceso formal (entrevista, cuota de evaluación, dictamen).
- **Given** no se inscribe aún **Then** puedo dejarla "Contactada" hasta que se inscriba.
- **When** rechazo **Then** el motivo es obligatorio (interno) y queda registro.

### Épica B · "Las becas actuales se renegocian o se quitan"

**HU-05 · Ver qué becas hay que revisar**
Como Presidencia, quiero una lista "Por revisar" con las 21 becas heredadas, para revisarlas una por una.
- **Then** cada una muestra: tipo y %, asistencia vs meta 90%, adeudo, advertencias, desde cuándo la tiene y por qué (si hay motivo).
- **Then** se ve el avance: "Revisadas 0 de 21".

**HU-06 · Decidir: Mantener, Renegociar o Retirar**
Como Presidencia, quiero tomar una de 3 decisiones por beca, para dejar todas bajo las reglas del programa.

| Decisión | Qué pide | Qué pasa |
|---|---|---|
| **Mantener** | Modalidad + próxima revisión | Queda igual, con modalidad y fecha de revisión |
| **Renegociar** | Nuevo % o monto + fecha efectiva + modalidad | El cobro usa el nuevo % **desde la fecha efectiva**, no en retroactivo |
| **Retirar** | Causa + motivo + fecha efectiva | La beca termina en esa fecha y la mensualidad completa aplica desde ahí |

- **Then** toda decisión deja historial (antes → después, quién, cuándo) y no se puede borrar.

**HU-07 · Avisar a la familia con tiempo**
Como Presidencia, quiero que la familia reciba el cambio con anticipación, para evitar sorpresas y conflicto.
- **When** renegocio o retiro **Then** la fecha efectiva mínima es el **1º del mes siguiente** (preaviso).
- **Then** puedo mandar el mensaje por WhatsApp con texto respetuoso, y la familia lo ve en su Portal ("Tu beca cambia a partir de…").

**HU-08 · Programar la siguiente revisión**
Como Presidencia, quiero que cada beca tenga fecha de revisión y me avise 30 días antes, para que no se renueven solas.

## 3. Historias que agrego (calidad, basadas en ISTQB)

| ID | Característica ISO 25010 | Historia | Criterio clave |
|---|---|---|---|
| HU-Q1 | Seguridad (control de acceso) | Sólo Presidencia (y quien tenga Becas) ve y decide becas | Un Formador o un tutor recibe "No autorizado"; probado en servidor, no sólo ocultando botones |
| HU-Q2 | Seguridad / privacidad | Los datos de la familia (motivo económico, teléfono) no salen en push, CSV ni chats | El push no lleva nombre ni motivo; el CSV no lleva el motivo |
| HU-Q3 | Fiabilidad (recuperación) | Si algo falla, la pantalla explica y deja reintentar | Mensaje humano + "Reintentar"; nunca un error técnico |
| HU-Q4 | Integridad (concurrencia) | Si dos personas deciden la misma beca a la vez, la segunda ve que ya se decidió | Ninguna decisión pisa a otra sin aviso |
| HU-Q5 | Trazabilidad / auditoría | Toda decisión deja evento (DomainEvent) con antes/después | Se puede reconstruir el historial de cada beca |
| HU-Q6 | Exactitud funcional (cobro) | Renegociar no cambia cargos ya emitidos | Cargos anteriores a la fecha efectiva quedan iguales |
| HU-Q7 | Usabilidad / accesibilidad | Todo se puede tocar con el dedo y leer con VoiceOver | Objetivos ≥ 44 px, contraste AA, nada se sale a 390 px |
| HU-Q8 | Robustez (entrada pública) | El formulario sin sesión aguanta abuso | Límite por hora, validación de teléfono y largo del motivo |
| HU-Q9 | Mantenibilidad (regresión) | Cada historia tiene prueba automática en CI | Humo de navegador + prueba de base por historia |

## 4. Diseño de pruebas (técnicas ISTQB)

**4.1 Particiones de equivalencia y valores límite (formulario público)**

| Campo | Válido | Inválido | Límites a probar |
|---|---|---|---|
| Motivo | 20 – 2000 caracteres | < 20, > 2000, sólo espacios | 19, 20, 2000, 2001 |
| WhatsApp | 8 – 15 dígitos, `+` opcional | letras, 7 dígitos, 16 dígitos | 7, 8, 15, 16 |
| Nombre tutor | 3 – 120 | 2, 121 | 2, 3, 120, 121 |
| Envíos | ≤ 60 por hora | 61 | 60, 61 |

**4.2 Tabla de decisión: revisión de beca vigente**

| Regla | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Asistencia ≥ 90% | Sí | Sí | No | No |
| Adeudo vencido | No | Sí | No | Sí |
| **Sugerencia del sistema** | Mantener | Renegociar | Advertencia y luego Renegociar | Retirar |

La sugerencia nunca decide sola: **Presidencia decide**, el sistema sólo propone.

**4.3 Transición de estados (solicitud pública)**

```
nueva ──contactar──▶ contactada ──vincular──▶ vinculada ──▶ (proceso formal)
  │                      │
  └──────rechazar────────┴──────▶ rechazada (final)
```
Probar también las transiciones **inválidas**: rechazada → contactada, vinculada → nueva.

**4.4 Casos negativos obligatorios**
- Tutor con sesión intenta leer solicitudes ajenas → No autorizado.
- Formador abre `/v2/becas/` → pantalla de "sin acceso".
- Renegociar con fecha efectiva pasada → rechazado.
- Retirar sin motivo (< 10 caracteres) → rechazado.

## 5. Orden de construcción recomendado

1. **Ya:** bug arreglado + barrera (este PR).
2. **Sprint 1 (Épica A):** bandeja única, quitar el hero repetido, Reintentar, push de nueva solicitud.
3. **Sprint 2 (Épica B):** "Por revisar" + Mantener / Renegociar / Retirar con preaviso e historial.
4. **Sprint 3:** aviso en el Portal a la familia y recordatorio de revisión a 30 días.

## 6. Decisiones que necesito de Presidencia

1. **Preaviso:** ¿el cambio aplica desde el 1º del mes siguiente, o quieres 30 días naturales?
2. **Aviso a la familia:** ¿sólo WhatsApp que tú mandas, o también aviso en su Portal?
3. **Becas heredadas:** al renegociar, ¿la familia tiene que llenar la solicitud formal (con cuota de evaluación) o basta tu decisión?
