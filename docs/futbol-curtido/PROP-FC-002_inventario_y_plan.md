# Fútbol Curtido en Tanner OS · PROP-FC-002 · Inventario y plan

Rama: `fc-002-planeacion` · 09/11/2026 · **Sin merge, sin despliegue, sin migraciones en producción.**

## 1. Fuentes revisadas

| Fuente | Dónde | Estado |
|---|---|---|
| Metodología v1.1 FINAL + Anexo Semana Clara | Drive `01_Metodologia`, `00_NUEVO_SEMANA_TANNER_CLARA` | Encontradas |
| Banco Tanner 36 v1.0 (.docx/.pdf) | Drive | Encontrado. Ya cargado en la base desde `supabase/semillas/formacion/banco-tanner-v1.0.json` |
| Banco Baby 24 v1.0 (.docx/.pdf) | Drive | Encontrado. Ya cargado (`banco-baby-v1.0.json`) |
| Guía y Presentación Semana Tanner 4 Días | Drive | Encontradas |
| Alta Centro Tanner de Cultura y Convivencia v1.0 | Drive `Alta_Centro_Tanner_y_TannerOS.md` | Encontrada |
| **PROP-FC-002: `01_ALTA_CENTRO_TANNER.pdf`, `04_MAPA_RECURSOS_36_TAREAS.pdf`** | — | **NO encontradas** ni en Drive ni en el repo. PROP-FC-002 tampoco está registrada en Centro Tanner (`app.policies`). Las seis decisiones se toman del encargo de Presidencia (09/11/2026). |

Verificado en la base: 36 tareas Tanner + 24 Baby oficiales, con los nombres exactos del encargo (BALÓN: Balón Vivo… REACCIONAR: Partido sin Pausa). 9 Retos, 4 niveles, 4 mundos Baby y 6 etapas, sin décimo Reto ni sexta dimensión.

## 2. Inventario: EXISTE / EXTENDER / NUEVO / NO NECESARIO

| # | Función | Estado | Dónde vive |
|---|---|---|---|
| Catálogo | 9 Retos, niveles, mundos Baby, etapas | EXISTE | `app.formation_concepts` (b4), `c4_formacion_carga_bancos_tannery` |
| Catálogo | Banco 36 + Banco Baby 24, versionados, una oficial por código | EXISTE | `app.training_tasks` (b4/c4), `scripts/formacion/extraer_bancos.py` (sin reescribir texto) |
| Catálogo | Recursos: hoy son los 8 de la Metodología v1.1 (mirar, perfilarse, engañar…) | EXTENDER, **bloqueado** | Las familias operativas del encargo (dominio/control, pase/recepción…) y su etiqueta principal/complementario requieren `04_MAPA_RECURSOS_36_TAREAS`. No se inventan etiquetas. |
| Horarios | Versionados por fecha de vigencia + excepciones puntuales | EXISTE | `app.category_schedules`, `category_schedule_slots`, `schedule_exceptions` (e4). Un cambio desde 2027 no toca 2026. |
| Semana Tanner (Dirección) | Reto principal, secundario opcional, "qué queremos ver", publicar/editar/quitar con historial | EXISTE | `app.training_weeks` (f4, h5g) |
| Planeación única | Sesiones derivadas de horario + excepciones; plan por sesión | EXISTE | `app.sessions` + `app.session_plans` + `session_plan_items` (f4) |
| **Decisión 1** | Tarjetas **y** Calendario sobre la misma planeación | **NUEVO (hecho en la rama)** | `v2/formacion/app.js` (`vistaSemana`), `motor.js` `semanaEnDias` y `fechaLocal` |
| **Decisión 2** | 3 tareas deterministas + Ver más + sustituir | EXISTE | `motor.js` `recomienda` |
| **Decisión 2** | El "por qué" de cada una; aviso si no hay 3 válidas; Ver más ordenado por el objetivo de Dirección | **NUEVO (hecho en la rama)** | `motor.js` `recomiendaConPorque`, `verMas` |
| **Decisión 3** | Variantes por tarea (fácil / base / difícil), ajuste del grupo, nunca etiqueta del niño | EXISTE | `session_plan_items.difficulty` (f4). La UI dice "Fácil / Normal / Difícil" (ver decisión pendiente D2) |
| **Decisión 4** | Progresión PREPARAR → DESAFIAR → APLICAR → REVISAR | **NO INICIADO, decisión pendiente** | Hoy existe la escalera del banco (Sin rival → En juego) repartida entre las sesiones de la semana, sin días fijos. Ver D3. |
| **Decisión 5** | Parches por experiencias oficialmente aprobadas | **NO INICIADO, decisión pendiente** | No hay tabla ni pantalla. Requiere la lista oficial de parches (D4). |
| **Decisión 6** | Cierre rápido Sí / A veces / Todavía no + nota | EXISTE | `sessions.closure` (i4), Modo Cancha |
| **Decisión 6** | Observación de Dirección Deportiva | **NUEVO: propuesta escrita y probada localmente, NO aplicada** | `supabase/propuestas/FC2_observacion_direccion_deportiva.sql` |
| Corte dominical | Configurable (hoy domingo 22:00, America/Mexico_City), foto de cumplimiento, revisión posterior que no borra la original | EXISTE | `planning_cutoffs` (f4), `formation_settings` |
| LISTA | Exige fecha, categoría, hora, Reto/objetivo y tarea principal; un registro vacío no cuenta | EXISTE | `command_save_session_plan` (i4) |
| Modo cancha | BUSCAMOS / JUEGA / DILE / OBSERVA y cierre en un toque | EXISTE | `modoCancha` en `v2/formacion/app.js` |
| Asistencia | Pase de lista aparte, sin captura duplicada | EXISTE | `/asistencia/`, enlazado desde Modo Cancha |
| Bonos Formador | Cumplimiento mensual Tanner OS | EXISTE (dato); pago manual | `v2_planning_compliance`. No se automatizan pagos ni sanciones. |
| Cultura y convivencia | Aceptación versionada, incidentes restringidos, Consejo sin expedientes | NO INICIADO aquí | Alta encontrada en Drive; es un frente propio (fuera de esta rama) |
| Familia | Resumen de Reto/recursos de la semana en lenguaje claro | NO INICIADO | Depende de D5 (qué se publica a familias) |
| Estudiante–Atleta | v0.1 en revisión | NO NECESARIO por ahora | No está aprobada en Centro Tanner; no se integra |
| Puntos, XP, ranking, Tanner Score | — | NO NECESARIO (prohibido) | Revisado: no existe nada de esto en Formación |

## 3. Qué se hizo en esta rama

1. **Calendario (decisión 1).** Botón "Tarjetas / Calendario" en Próxima semana. Ambas vistas salen de `dataMia.sessions`, así que no puede haber desincronización. Cada sesión cae en su **día local del club**: una sesión a las 19:00 en León es otro día en UTC. La vista se recuerda por persona (localStorage, solo preferencia). En móvil se muestra en lista por día y oculta los días sin sesión.
2. **Por qué (decisión 2).** Cada recomendación dice si es del Reto de la semana, del secundario o relacionada; el nivel que toca en esa sesión; y si ya se usó en la semana.
   - Si no hay 3 válidas, muestra las que hay y explica la causa. Nunca inventa ejercicios.
   - Jugadores y duración filtran solo si la ficha trae ese dato. Las fichas v1.0 no lo traen, así que no se supone.
3. **Ver más (decisión 2).** Ordenado por el objetivo de Dirección:
   - primero las tareas "Del Reto X";
   - luego el secundario y las relacionadas;
   - al final "Otros".

   No repite las 3 ya mostradas, y el Formador puede sustituir con cualquiera. Además corrige que antes "Ver más" escondía las tareas sin etapa marcada.
4. **Observación de Dirección (decisión 6), solo propuesta.**
   - Es una tabla nueva, solo de agregar: no toca `app.sessions` ni el cierre del Formador, y no se confunde con la asistencia.
   - Para corregir, se anula con motivo auditado (quién y cuándo) y se escribe otra; un doble toque no duplica.
   - Escribe solo Dirección. Leen Dirección y el Formador de esa sesión. Familias no la ven.

## 4. Evidencias

| Prueba | Comando | Resultado |
|---|---|---|
| Motor (unitarias, corre en `static-qa`) | `node scripts/qa-formacion-motor.mjs` | OK · 46 revisiones (+22 nuevas: porqué, aviso sin 3, jugadores, Baby sin niveles, Ver más, calendario, hora local, cambio de año 2026→2027) |
| Formación en Chromium, 390px (corre en `navegador-qa`) | `CHROME_PATH=/opt/pw-browsers/chromium node scripts/qa-humo-formacion.mjs` | OK · 93 revisiones (+13 nuevas `[fc-002]`; las 80 anteriores siguen en verde) |
| Propuesta FC2 en PostgreSQL 16 **local y desechable** | `psql -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc2.sql` | OK · 7 grupos (rol sin permiso, vacía/larga, cancelada, cierre intacto, otro Formador no lee, anulación auditada + doble toque, eventos) + anon sin EXECUTE |

Capturas (390px): `fm-calendario.png` (semana por día con Lista/Pendiente) y `fm-porque.png` (3 tareas con sus chips de por qué).

## 5. Decisiones humanas pendientes

| # | Decisión | Por qué no la resolví |
|---|---|---|
| D1 | Subir PROP-FC-002 (Alta y Mapa de recursos) a Centro Tanner / Drive | Son la fuente para las etiquetas principal/complementario de recursos. Sin ellas no etiqueto. |
| D2 | Botones de dificultad: hoy dicen **Fácil / Normal / Difícil** (decisión de Presidencia del 13/10/2026, "como videojuego"); PROP-FC-002 dice **MÁS FÁCIL / BASE / MÁS DIFÍCIL** | Hay contradicción entre dos decisiones de Presidencia. El valor guardado ya es `facil/base/dificil`, así que cambiar las etiquetas es solo texto. |
| D3 | PREPARAR → DESAFIAR → APLICAR → REVISAR: ¿son fases dentro de cada sesión (Calentar = Preparar, Tarea = Desafiar, Jugar = Aplicar, Cierre = Revisar) o de la semana? | El documento de PROP-FC-002 no está disponible. Propongo la primera opción: solo etiqueta los bloques que ya existen, sin días fijos ni cargas. |
| D4 | Lista oficial de parches (iniciación, Skills, ceremonias), quién los otorga, físico/digital | Sin la lista no hay qué otorgar. El diseño propuesto: catálogo aprobado + otorgamiento manual + revocación con motivo; sin compra ni automático por tareas. |
| D5 | Qué ve la familia de la Semana Tanner (Reto + recursos en lenguaje niño/papá) | Política de comunicación. |
| D6 | Aplicar `FC2_observacion_direccion_deportiva.sql` en producción | El encargo prohíbe migrar sin autorización. Una vez aplicada, falta la pantalla de Dirección (lista de sesiones cerradas + "Agregar observación"). |

## 6. Riesgos

- La regla de hora local depende del navegador (`Intl` con zona `America/Mexico_City`). Está probada con un horario de 19:00 que en UTC cae al día siguiente.
- "Ver más" muestra las ~33 tareas restantes en una lista larga. En cancha el profe usa las 3 recomendadas; si molesta, se agrega un buscador.
- El barrido de seguridad por rol se hizo sobre la propuesta FC2 en local. Las funciones existentes (f4/i4) no se modificaron.

## 7. Próximos pasos

1. Presidencia decide D1–D6.
2. Con D6, aplicar FC2 y construir la pantalla de Dirección (con su prueba en Chromium).
3. Con D1, cargar el mapa de recursos como metadato versionado por tarea, de forma idempotente y con fuente.
4. Con D3 y D4, construir las fases y los parches.
