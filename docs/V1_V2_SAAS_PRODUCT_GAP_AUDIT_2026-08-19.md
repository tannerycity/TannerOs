# TannerOS — Auditoría de producto V1 → V2 → SaaS

Fecha: 2026-08-19

## Objetivo

TannerOS V2 no debe ser una colección de módulos que replique pantallas de V1. Debe conservar las capacidades operativas que sí aportaban valor, reemplazar comportamientos inseguros por contratos canónicos y convertirse en una plataforma multi-club configurable.

Fuentes revisadas para este corte:
- auditoría legacy/reglas existente del repositorio;
- pantallas V1 de Inicio, Club, Dirección, Finanzas, Taquilla, Scouting, Captación, Academias, Utilería y evaluaciones compartidas por operación;
- estado actual de rutas/RPCs V2;
- esquema SaaS de organizaciones, planes, suscripciones, módulos y permisos;
- datos canónicos Supabase existentes.

## Principios de arquitectura

1. **V1 es catálogo de capacidades, no autoridad técnica.**
2. **Supabase canónico es la fuente futura de verdad.** No se replica un segundo ledger o una segunda ficha de jugador solo por paridad visual.
3. **La experiencia debe sentirse como una sola app.** Los módulos pueden seguir desacoplados internamente, pero no deben exponer esa separación al usuario.
4. **Rol + permiso individual + plan de organización** determinan acceso efectivo.
5. **Historial antes que borrado.** Finanzas, bajas, cambios de categoría, convenios, pedidos y correcciones conservan trazabilidad.
6. **White-label por organización.** Marca, colores, PWA e identidad no se hardcodean a Tannery City.
7. **Nada de cutover mientras existan escrituras nuevas solo en V1.**

---

# P0 — Confianza operativa y corte V1

## P0.1 Delta final V1 → V2

**Estado: BLOQUEANTE.**

Hallazgo del 19 de agosto:
- la pantalla V1 de Taquilla muestra movimientos nuevos del 19/08 y movimientos fechados posteriormente;
- el ledger canónico V2 consultado para 19/08 todavía reporta 0 entradas / 0 salidas para ese día;
- por lo tanto, V1 continúa recibiendo escrituras después de la migración inicial.

### Regla de corte
No poner V1 en solo lectura hasta:
1. identificar el origen Spreadsheet/Apps Script activo;
2. extraer el delta posterior al último import;
3. deduplicar por legacy id / referencia estable / hash de fila, nunca por similitud de nombre o monto;
4. importar a staging/migration;
5. reconciliar conteos y sumas por fecha/método/categoría;
6. ejecutar rollback QA;
7. fijar una fecha/hora de freeze;
8. importar el último delta;
9. validar saldos;
10. cambiar V1 a consulta únicamente.

## P0.2 Taquilla 2.0

**Estado: EN IMPLEMENTACIÓN.**

V1 aportaba una experiencia de caja valiosa que V2 había diluido dentro de Finanzas/Pedidos.

Capacidades obligatorias:
- COBRAR;
- PAGAR según autoridad;
- ingresos del día;
- egresos del día;
- neto/caja del día;
- efectivo físico esperado;
- desglose por método;
- últimos movimientos;
- corte imprimible/PDF;
- fecha de operación seleccionable.

### Cambio V2 deliberado
- Taquilla sin permiso de Contabilidad **no** publica egresos.
- No existe Eliminar financiero. Las correcciones se realizan mediante void/reembolso/ajuste según el contrato correspondiente.
- Pedidos se cobran desde Pedidos para conservar saldo y state machine, no como ingreso genérico duplicado.

Backend nuevo de este bloque:
- `v2_cashier_snapshot`;
- `v2_post_general_income`.

## P0.3 Reconciliación diaria

Agregar una rutina de salud operativa con al menos:
- entradas vs salidas por día;
- efectivo esperado;
- movimientos sin responsable/referencia cuando aplique;
- cargos con cuota por configurar;
- pagos con crédito sin asignar;
- pedidos pagados sin trazabilidad de pago;
- diferencias V1/V2 durante cutover.

---

# P1 — Paridad de producto sin deuda legacy

## Inicio y Dirección

**V2: parcial/avanzado.**

Conservar de V1:
- Bienvenido al vestidor;
- pulso de cobranza;
- agenda;
- cumpleaños;
- jugadores en riesgo;
- goleadores/asistencias;
- salud de categorías;
- motor del club / origen de ingresos;
- cartera histórica y tendencia.

Mejora SaaS:
- widgets dependen de permisos;
- cada KPI debe tener definición y drill-down;
- ninguna cifra debe hardcodearse desde V1.

## Club / Jugadores

**V2: avanzado.**

Mantener como capacidades de producto:
- ficha única Tanner;
- tutores/contacto;
- documentación;
- categoría con historial;
- posición/dominancia/dorsal;
- beneficios/becas;
- cuenta/cobranza;
- evaluación deportiva y formativa;
- notas y trazabilidad.

Siguiente madurez:
- timeline único de jugador;
- alertas de documentos/seguimientos;
- comparativas longitudinales de evaluación;
- cohortes por categoría/temporada.

## Captación + Scouting

**V2: avanzado.**

V1 aportaba buena operación visual: urgencia, visoría, cualidad estrella, scores y veredicto.

Siguiente madurez:
- pipeline unificado Captado → Contactado → Prueba/Visoría → Oferta/Alta → No continúa;
- atribución UTM/campaña real;
- SLA de seguimiento;
- motivos de pérdida;
- conversión por canal/campaña/scout;
- deep links desde Omnibox.

## Academias y Programas

**V2: avanzado, con reglas canónicas.**

Siguiente madurez:
- dashboard por academia/programa;
- cupo/ocupación;
- ingreso, costo y margen cuando existan costos reales;
- asistencia propia;
- profesor/responsable;
- calendario;
- conversiones a club.

## Utilería

**V2: funcional.**

Conservar experiencia V1:
- inventario total/disponible/dañado/prestado;
- vista por categoría;
- fotos;
- responsable/profesor;
- repartir/devolver;
- alertas de mínimo/daño.

Siguiente madurez SaaS:
- ubicaciones/bodegas;
- historial de custodia;
- costo de reposición;
- QR opcional;
- auditoría de inventario.

## Patrocinadores

**V2: funcional/avanzado.**

Siguiente madurez:
- pipeline;
- acuerdos;
- activos/derechos;
- calendario de entregables;
- renovación;
- valuación entregada vs comprometida;
- sponsor funding ligado a Tanners con vigencia.

---

# P2 — SaaS foundation

## Ya existe

- organizaciones multi-tenant;
- `timezone`, `locale`, `currency`, `settings`, `branding` por organización;
- planes;
- suscripciones;
- módulos por plan;
- overrides por organización;
- roles;
- permisos por módulo;
- overrides por usuario;
- aislamiento canónico y comandos;
- Brand Studio / PWA white-label.

## Falta cerrar como producto

### Onboarding de club
Wizard con:
1. identidad y escudo;
2. país/timezone/moneda;
3. estructura deportiva inicial;
4. usuarios/roles;
5. módulos;
6. importación de jugadores;
7. configuración de cobranza;
8. checklist de salida a producción.

### Configuración de organización
UI administrativa para nombre legal, locale, timezone, currency y settings soportados.

### Suscripción comercial
La estructura de plan existe, pero falta cerrar:
- catálogo comercial real;
- límites por plan;
- trial;
- upgrade/downgrade;
- provider de pago;
- estado past_due/cancelled y comportamiento de acceso;
- facturación del SaaS.

### Import / Export
- importación CSV/Excel guiada;
- validación previa;
- reporte de errores;
- idempotencia;
- export por dominio y organización;
- backup/restauración operativa.

### Auditoría visible
- visor de eventos por actor/fecha/entidad;
- export;
- trazabilidad de acciones sensibles.

---

# P3 — Operating System deportivo

Estas capacidades elevan TannerOS de academia administrativa a sistema de club.

## Estructura deportiva first-class
No asumir que categoría equivale para siempre a equipo.

Necesitamos modelar, cuando se implemente:
- temporada/ciclo;
- equipos/squads;
- categoría competitiva;
- staff por equipo;
- roster con vigencia;
- sede/cancha/ubicación;
- competición/torneo.

## Entrenamiento
- plan de sesión;
- objetivos;
- asistencia;
- carga/RPE si el club lo usa;
- notas de entrenador;
- evaluación y evolución.

## Partido
- convocatoria;
- alineación;
- minutos;
- eventos/estadísticas;
- reporte post-partido;
- historial por competición/temporada.

## Comunicación
- notificaciones in-app;
- plantillas;
- avisos segmentados por equipo/categoría;
- integraciones externas solo con consentimiento/configuración del club.

---

# P4 — Nivel profesional

No implementar estos dominios como campos improvisados.

- contratos/registro/eligibilidad;
- transferencias;
- medical/injury/wellness con permisos reforzados y privacidad específica;
- cargas y performance longitudinal;
- scouting de mercado y ofertas;
- análisis de video/integraciones;
- documentos federativos;
- centros/sedes múltiples.

---

# P5 — Moat de producto

## Omnibox / TannerOS Assistant
Evolucionar de búsqueda a capa operativa:
- buscar entidades;
- ejecutar acciones autorizadas;
- responder “qué requiere mi atención hoy”;
- explicar el origen de un KPI;
- encontrar deuda, partido, pedido, sponsor o documento;
- proponer next-best-action sin ejecutar cambios destructivos automáticamente.

## Alertas inteligentes
Ejemplos:
- prospecto sin contacto;
- mensualidad vencida;
- baja asistencia;
- sponsor por renovar;
- inventario bajo;
- pedido listo pero no entregado;
- documento faltante;
- evaluación vencida.

## Dashboards por rol
El Home no es un dashboard genérico. Debe resolver el trabajo del rol:
- Presidencia: salud y decisiones;
- Operaciones: pendientes del día;
- Formador: equipo/entrenamiento;
- Taquilla: caja/cobros;
- Contabilidad: conciliación/cartera;
- Scouting: funnel/seguimientos;
- Patrocinios: pipeline/entregables.

---

# Definición de “V2 reemplaza V1”

TannerOS V1 puede quedar en solo lectura únicamente cuando todos los dominios operativos cumplan:

- datos reconciliados;
- no existe delta pendiente;
- rutas V2 accesibles por rol correcto;
- escritura por contrato canónico;
- historial preservado;
- QA funcional + seguridad;
- operación diaria validada por usuarios reales;
- dashboard/corte financiero conciliado;
- plan de rollback definido.

Hasta entonces V1 es una fuente legacy activa y debe tratarse como tal, no como respaldo pasivo.

## Orden de ejecución autónoma recomendado

1. P0 Delta cutover + Taquilla 2.0.
2. Cerrar navegación/paridad UX de módulos más usados.
3. Onboarding + settings de organización + import/export.
4. Estructura deportiva first-class (temporadas/equipos/staff/sedes).
5. Dashboards/alertas/assistant por rol.
6. Integraciones y dominios profesionales después de contratos y privacidad específicos.
