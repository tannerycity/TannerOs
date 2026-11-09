# Fútbol Curtido en Tanner OS · PROP-FC-002 · Inventario y plan

Rama: `fc-002-planeacion` · 09/11/2026 · **Sin merge, sin despliegue, sin migraciones en producción.**

## 0. Decisiones de Presidencia del 09/11/2026 (tarde) y estado

| Tema | Decisión | Estado |
|---|---|---|
| Familias de recursos | **10** (Cuerpo transversal, como el Mapa 04) | **Aplicado en producción** (h76, md5 `d10a3974…`) |
| Microciclo P-D-A-R | No aparece en la pantalla: se quedan **Calentar / Tarea / Jugar** | Sin cambio (decisión) |
| Checklist de la observación de Dirección | 5 puntos: aprendizaje, participación, seguridad, adaptación, convivencia (Sí / A veces / Todavía no) + nota | **Aplicado en producción** (h77, md5 `9727333f…`) |
| Anticipar, comunicar y ejecutar | Se quedan en la Metodología, sin familia | Así quedó en h76 |
| Migraciones FC1/FC2 | Autorizadas | h76 y h77 aplicadas; prueba en prod como Presidencia (se deshace sola): catálogo con 10 familias, aprobar etiqueta, checklist inválido rechazado, lectura |
| Parches | **Campeones** e **Iniciación** | Propuesta FC3 escrita y probada en local (10 grupos). **Falta autorizar** su aplicación |

Pantallas nuevas en la rama (aún sin publicar):
- Carta del Álbum → **Recursos**: Dirección aprueba o descarta las sugeridas y agrega recursos (primero las familias que el mapa liga al Reto). El Formador solo ve los aprobados.
- Hoja de sesión que ya pasó → **Observar** (solo Dirección): 5 puntos + nota. El Formador la lee en su sesión.

## 1. Fuentes revisadas

Entrega de Presidencia `KIT_DOS_PROMPTS_CLAUDE_TANNERY_2026_11_08.zip` (carpeta `FUENTES_OFICIALES`), más Drive.

| Fuente | Uso aquí |
|---|---|
| `01_ALTA_CENTRO_TANNER.pdf` | Seis decisiones aprobadas, más una séptima (Catálogo de Recursos) y lo que no se modifica. |
| `04_MAPA_RECURSOS_36_TAREAS.pdf` | Catálogo inicial de recursos (PROPUESTO) y mapa de las 36. Las etiquetas vienen "sugeridas, no definitivas", con revisión ficha por ficha de Dirección Deportiva. |
| `03_CHECKLIST_CIERRE_Y_DOCUMENTOS.pdf` | Mínimo viable de aceptación. Indica actualizar **Centro Tanner primero** y luego Tanner OS. |
| Bancos 36 / 24 (.docx) | Ya están cargados en la base desde `supabase/semillas/formacion/*.json` (extraídos del .docx sin reescribir). Verificado: los nombres coinciden 1:1 con la lista oficial. |
| `02_PROMPT_CENTRO_TANNER.md` | **No ejecutado.** El LEEME lo destina a otra conversación (Centro Tanner). |

PROP-EA-001 Estudiante–Atleta sigue en revisión: no se integra.

## 2. Inventario: EXISTE / EXTENDER / NUEVO / NO NECESARIO

| # | Función | Estado | Dónde vive |
|---|---|---|---|
| Catálogo | 9 Retos, niveles, mundos Baby, etapas | EXISTE | `app.formation_concepts` (b4, c4) |
| Catálogo | Banco 36 + Baby 24, versionados, una oficial por código | EXISTE | `app.training_tasks` (b4, c4) |
| **Decisión 7** | Catálogo de Recursos del Futbolista (10 familias, 51 recursos) | **NUEVO: propuesta FC1, probada localmente, NO aplicada** | `supabase/propuestas/FC1_recursos_del_futbolista.sql`, generada desde `supabase/semillas/formacion/recursos-v0.1.json` |
| Recursos | Etiqueta tarea ↔ recurso PRINCIPAL/COMPLEMENTARIA; el Formador sugiere, solo Dirección aprueba | **NUEVO: en FC1** | `app.task_resource_tags` + `v2_set_task_resource` |
| Horarios | Versionados por vigencia + excepciones | EXISTE | e4. Un cambio desde 2027 no toca 2026. |
| Semana Tanner | Reto, secundario, "qué queremos ver", publicar con historial | EXISTE | f4, h5g |
| Planeación única | Sesiones = horario + excepciones; plan por sesión | EXISTE | f4 |
| **Decisión 1** | Tarjetas y Calendario sobre la misma planeación | **NUEVO (hecho)** | `v2/formacion/app.js`, `motor.js` `semanaEnDias` y `fechaLocal` |
| **Decisión 2** | 3 tareas deterministas + Ver más + sustituir | EXISTE + **NUEVO (hecho)**: por qué, aviso si faltan, Ver más ordenado por el objetivo, recurso aprobado sube la tarea | `motor.js` `recomiendaConPorque`, `verMas` y `etiquetaDe` |
| **Decisión 3** | MÁS FÁCIL / BASE / MÁS DIFÍCIL por tarea, ajuste del grupo | EXISTE + **texto actualizado (hecho)** | Antes decía Fácil/Normal/Difícil (13/10). PROP-FC-002 (08/11), más reciente y aprobada, manda. El valor guardado no cambia. |
| **Decisión 4** | PREPARAR → DESAFIAR → APLICAR → REVISAR | **NO INICIADO, decisión pendiente** | Ver D3 |
| **Decisión 5** | Parches por experiencias aprobadas | **NO INICIADO, decisión pendiente** | El mapa 04 dice que el parche de Iniciación ya existe (físico). Requiere definición de Presidencia (D4). |
| **Decisión 6** | Cierre Sí / A veces / Todavía no + nota | EXISTE | i4, Modo Cancha |
| **Decisión 6** | Observación independiente de Dirección Deportiva | **NUEVO: propuesta FC2, probada localmente, NO aplicada** | `supabase/propuestas/FC2_observacion_direccion_deportiva.sql` |
| Corte dominical | Configurable, foto de cumplimiento, revisión que no borra la original | EXISTE | `planning_cutoffs`, `formation_settings` |
| LISTA | Fecha, categoría, hora, Reto/objetivo y tarea principal | EXISTE | `command_save_session_plan` (i4) |
| Modo cancha | Buscamos / Juega / Dile / Observa / Más fácil / Más difícil | EXISTE | `modoCancha` |
| Asistencia | Separada del cierre (no se duplica) | EXISTE | `/asistencia/` |
| Bono Tanner OS | Cumplimiento mensual; pago manual | EXISTE (dato) | `v2_planning_compliance`. No se automatizan pagos ni sanciones. |
| Familia | "Cada semana aprendemos un Reto, practicamos herramientas y las aplicamos jugando" | NO INICIADO | Ver D5 |
| Cultura y convivencia | Aceptación versionada, incidentes restringidos | NO INICIADO aquí | Frente propio |
| Estudiante–Atleta | PROP-EA-001 en revisión | NO NECESARIO por ahora | |
| Puntos, XP, ranking, Tanner Score | — | NO NECESARIO (prohibido) | Revisado: no existe nada de esto en Formación |

## 3. Qué se hizo en esta rama

1. **Calendario (decisión 1).** Cambio de vista "Tarjetas / Calendario" con las mismas sesiones y el mismo estado. Cada sesión aparece en el día local del club. La vista elegida se recuerda por persona.
2. **Por qué y Ver más (decisión 2).**
   - Cada tarea dice si es del Reto de la semana, del secundario o relacionada, qué nivel toca y si ya se usó esa semana.
   - Si hay menos de 3 tareas válidas, muestra las que hay y explica la causa, sin inventar.
   - "Ver más" ordena: primero el Reto de la semana, luego el secundario y las relacionadas, al final "Otros".
3. **Recurso en el recomendador (decisión 7).**
   - Si la sesión pide un recurso, sus tareas con etiqueta **aprobada** suben: principal +2, complementaria +1. El "por qué" dice "Recurso principal: Conducción".
   - Una etiqueta **sugerida** no cuenta.
   - El Reto sigue mandando: un recurso nunca trae tareas de otro Reto.
4. **Más fácil / Base / Más difícil (decisión 3).** Cambia solo el texto en la planeación, la práctica, el Álbum y la cancha.
5. **FC1: Recursos del Futbolista (propuesta).**
   - Reutiliza `formation_concepts`: agrega el tipo `familia_recurso` y carga las 10 familias con sus recursos tal como vienen en el mapa 04.
   - Los recursos de la Metodología v1.1 conservan nombre, versión y texto; solo ganan su familia.
   - Tabla `task_resource_tags`, muchos a muchos. El Formador sugiere; Dirección aprueba o descarta. Cada cambio deja un evento con el antes y el después.
   - Las tareas Baby no se etiquetan: conservan sus 4 mundos.
   - Solo carga como **sugeridas** las 4 etiquetas que el mapa propone tarea por tarea (caso JUGAR JUNTOS + CONDUCCIÓN).
6. **FC2: Observación de Dirección (propuesta).** Solo se agregan observaciones. Para corregir, se anula con motivo auditado. No toca el cierre del Formador. Familias no la ven.

## 4. Evidencias

| Prueba | Comando | Resultado |
|---|---|---|
| Motor (corre en `static-qa`) | `node scripts/qa-formacion-motor.mjs` | OK · 51 revisiones (+27: por qué, aviso, jugadores, Baby, Ver más, calendario, hora local, 2026→2027, recurso aprobado vs. sugerido, caso JUGAR JUNTOS + CONDUCCIÓN) |
| Formación en Chromium, 390px (corre en `navegador-qa`) | `CHROME_PATH=/opt/pw-browsers/chromium node scripts/qa-humo-formacion.mjs` | OK · 93 revisiones (+13 `[fc-002]`; dificultad con nombres oficiales) |
| FC1 contra los bancos REALES (b4 + c4) en PostgreSQL 16 local | `psql -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc1.sql` | OK · 7 grupos: no toca Retos/fichas/conceptos; 10 familias; idempotente; sugeridas invisibles al Formador; el Formador no aprueba ni reabre; Baby rechazado; aprobar, doble toque y descartar con rastro; anon sin EXECUTE |
| FC2 en PostgreSQL 16 local | `psql -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc2.sql` | OK · 7 grupos + permisos |

## 5. Decisiones humanas pendientes

| # | Decisión | Fuente del conflicto o hueco |
|---|---|---|
| D1 | **Familias de recursos: 9 o 10.** 01 dice "Cancha y apoyos" y pone las capacidades corporales dentro de Especialidades. 04 dice "Ubicación y apoyo" y separa "Cuerpo". FC1 carga la versión 04. | 01 vs 04, ambos de PROP-FC-002 |
| D2 | **Revisión ficha por ficha (Brandon).** Aprobar o cambiar las 4 sugeridas y etiquetar las otras 32. El mapa 04 sugiere recursos por Reto (no por tarea), y esas sugerencias se mostrarán como pista, no como etiqueta. | 04 §4, §11 |
| D3 | **Microciclo PREPARAR → DESAFIAR → APLICAR → REVISAR.** 04 lo define como "lógica interna flexible de planificación". Propongo usarlo como etiqueta de las partes que ya existen en cada sesión (Calentar = Preparar, Tarea = Desafiar, Jugar = Aplicar, Cierre = Revisar), sin días ni cargas. | 04 §6 no dice si es de sesión o de semana |
| D4 | **Parches.** Lista oficial (Iniciación ya existe), quién los otorga, físico o digital, revocación. | 04 §7: "requiere definición/aprobación expresa de Presidencia" |
| D5 | **Qué ve la familia** de la Semana Tanner. | Comunicación |
| D6 | **Checklist de la observación de Dirección.** 01 dice "aprendizaje, participación, seguridad y adaptación"; 04 dice "aprendizaje, adaptación, convivencia y calidad de la sesión". FC2 queda en texto libre hasta definirlo. | 01 vs 04 |
| D7 | **Aplicar FC1 y FC2 en producción.** El checklist 03 pide primero publicar en Centro Tanner y luego implementar contra esa versión. | Encargo + 03 |
| D8 | **Recursos de Metodología v1.1 sin familia:** anticipar, comunicar y ejecutar. ¿Se ubican en una familia o se retiran? | No aparecen en 04 |

## 6. Riesgos

- La hora local depende de `Intl` del navegador; está probada con una sesión a las 19:00, que en UTC cae al día siguiente.
- "Ver más" muestra unas 33 tareas en una lista larga. Si estorba en cancha, se agrega un buscador.
- FC1 cambia el check de `formation_concepts.kind`: es aditivo (solo agrega un valor) y está probado contra los datos reales en local.
- FC1 redefine `private.formation_catalog`: es la misma salida de b4 más la llave `resources`, y la pantalla actual la ignora sin error.

## 7. Próximos pasos

1. Presidencia y Dirección deciden D1–D8. Centro Tanner se actualiza primero (prompt 02, en su propia conversación).
2. Con D7: aplicar FC1 y FC2 y construir las pantallas.
   - Dirección "Revisar recursos" en cada carta del Álbum: pistas por Reto, y aprobar o descartar.
   - Dirección "Observaciones" de sesiones cerradas.
   - Formador: "Hoy quiero que aparezca…" con un recurso opcional.
3. Piloto de 30 días (03 §D) y ajustes sin rehacer la metodología.
