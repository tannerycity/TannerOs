# TannerOS · UI/UX System Draft

Fecha: 2026-08-19
Estado: borrador operativo para validación de uso

## Propósito

TannerOS debe sentirse como un solo sistema operativo deportivo, no como una colección de aplicaciones. La capa UI puede evolucionar sin duplicar reglas de negocio: el dato canónico y las autorizaciones siguen viviendo en Supabase/RPC; la interfaz organiza, resume y permite actuar sobre ese dato.

## Principios

1. **Mobile first real.** Lo que se puede operar de pie en cancha con un teléfono define el componente base. Tablet y desktop amplían contexto, no crean una experiencia distinta.
2. **Una app, múltiples contextos.** Sidebar/shell global + navegación contextual por dominio. El usuario no necesita recordar en qué “app” vive cada tarea.
3. **Una ficha por entidad.** Tanner, prospecto, pedido, sponsor, equipo y demás entidades deben concentrar contexto, métricas, historial y acciones relevantes.
4. **Métrica accionable.** Un KPI debe ayudar a decidir o abrir el detalle que explica el número. No se muestran scores, márgenes o estados inventados cuando falta información.
5. **Permisos visibles.** La UI no muestra acciones que el rol no puede ejecutar. Los permisos continúan siendo validados por backend.
6. **Trazabilidad antes que borrado.** Finanzas, pedidos, evaluaciones y seguimiento preservan historia; la UI debe reflejar estados y correcciones sin ocultar lo ocurrido.
7. **Progressive disclosure.** Resumen primero; detalle y edición en drawers/bottom sheets. Formularios largos se agrupan por intención.
8. **Touch first.** Controles principales >= 44 px; inputs 16 px en teléfono; safe areas; scroll horizontal deliberado para pestañas y tablas cuando corresponde.
9. **Accesibilidad base.** Focus visible, reduced-motion, labels, aria en navegación crítica y contraste suficiente.
10. **Sin fork móvil.** No existe un frontend móvil independiente. Los mismos componentes responden a ancho y contexto.

## Breakpoints del borrador

- **Phone:** <= 640 px. Una columna, KPIs de dos en dos cuando tiene sentido, bottom sheets, dock móvil y acciones de una mano.
- **Tablet:** 641–1024 px. Formularios de dos columnas, KPIs de tres, drawers más anchos y contexto doble cuando aporta.
- **Desktop:** >= 1025 px. Sidebar persistente, mayor densidad y contenido hasta ~1560 px sin estirar formularios innecesariamente.

## Arquitectura de información

### Inicio

Función: centro de mando por rol.

- KPIs principales según permisos.
- Action Center central: pendientes reales del backend.
- Caja rápida cuando aplica.
- Accesos rápidos.
- Agenda.
- Foco del rol.

### Club deportivo

Navegación contextual: **Plantilla → Rendimiento → Asistencia → Convocatoria → Calendario**.

La Ficha Tanner es el punto de entrada del jugador e integra identidad, familia, documentación, privacidad y snapshot deportivo. La evaluación completa continúa en Rendimiento, preservando el Tanner seleccionado en la navegación.

### Talento

Navegación contextual: **Captación → Scouting → Academias → Porteros**.

Captación administra leads/campañas. Scouting toma decisiones deportivas. La UI debe evitar duplicar un prospecto solo para poder evaluarlo.

Pipeline Scouting del borrador:
- En radar: visoría abierta.
- Prioritario: visoría abierta con interés alto.
- Seguimiento vencido: `next_action_at` ya pasó.
- Se enfría: visoría abierta, sin próxima acción y 10+ días desde la observación; este criterio recupera la lectura de V1 sin afirmar que conocemos acciones que el esquema no registra.
- Fichado: reporte ligado a `player_id`.

### Tienda

Navegación contextual: **Pedidos → Producción y garantías**.

Pedidos funciona también como cockpit comercial:
- venta vigente;
- cobrado;
- por cobrar;
- costo congelado conocido;
- utilidad esperada solo cuando el costo está completo;
- margen conocido solo sobre venta con costo completo.

No se infiere costo ni utilidad para pedidos incompletos. Para escalar SaaS, estos agregados deben migrar posteriormente a un RPC de resumen para evitar fan-out de detalles desde navegador.

### Finanzas

Navegación contextual: **Resumen → Taquilla → Contabilidad**.

Taquilla es la operación diaria; Contabilidad conserva autoridad sobre egresos y ajustes; Finanzas resume cobranza y posición. En teléfono, cobros/egresos se operan como bottom sheets.

### Dirección y Administración

Dirección consume indicadores transversales; Administración configura tenant, usuarios, módulos, branding, onboarding, auditoría y cutover. No debe contener operación cotidiana que corresponda a otro dominio.

## Componentes base

- `tos-sidebar` / `tos-topbar`: shell único.
- `tos-module-context`: navegación local entre funciones del mismo dominio.
- `tos-mobile-dock`: acceso móvil global.
- `panel` / `tos-panel`: contenedor estándar.
- KPI card: número + contexto; color solo cuando comunica estado.
- Drawer: desktop/tablet lateral; phone bottom sheet/full-width.
- Form grid: 1 col phone, 2 col tablet/desktop salvo casos de alta densidad.
- Horizontal rail: filtros, tabs y navegación contextual en móvil.
- Table wrap: overflow táctil cuando una tabla no puede convertirse honestamente en cards.
- Empty state: explica qué falta o qué acción inicia el flujo.
- Action Center card: prioridad + conteo + explicación + deep link.

## Módulos priorizados en este borrador

### Jugadores / Evaluaciones

- Snapshot deportivo dentro de la Ficha Tanner.
- Radar Técnica / Juego / Cuerpo como visualización de dimensiones existentes, no como score nuevo.
- Barras separadas para Técnica, Inteligencia, Intensidad, Mentalidad y Valores.
- Métricas de partido: partidos, minutos, goles y asistencias.
- Bloque Portero solo si existen dimensiones de portero.
- Objetivos de la evaluación más reciente.
- Acciones: abrir rendimiento / nueva evaluación conservando `player_id`.

### Scouting

- Pipeline y atención antes de la lista.
- Filtros por pipeline/estado/texto.
- Priorización visual de vencidos y enfriándose.
- Drawer de nueva visoría / detalle / seguimiento.
- Cuatro pilares sin clasificación automática adicional.

### Tienda / Pedidos

- Cockpit de negocio arriba de pedidos.
- Búsqueda por folio/cliente/contacto.
- Filtros de estado.
- Drawer de pedido con costo congelado, utilidad, pagos, readiness, piezas y estado.
- Producción/Garantías mantiene workflows y adopta modales mobile-first.

### Taquilla

- COBRAR/PAGAR como acciones principales.
- Caja diaria, método, efectivo esperado, corte y movimientos.
- Bottom sheets y formularios de una mano en phone.

## Métricas y decisiones

La UI debe responder al menos tres preguntas:

1. **¿Qué requiere mi atención hoy?** → Action Center.
2. **¿Cómo va este dominio?** → KPIs/funnel/cockpit del módulo.
3. **¿Por qué ese número?** → deep link al listado/ficha que lo compone.

Los nuevos indicadores deben especificar fuente, población y regla. No se agregan scores compuestos sin una decisión de producto explícita.

## Deuda deliberadamente separada del borrador UI

- Agregados de rentabilidad de Tienda deben moverse a RPC de resumen para escala.
- Scouting no tiene un `last_action_at` canónico; por eso “se enfría” usa el criterio verificable descrito arriba.
- Las dimensiones avanzadas de equipo/temporada/competición están en fundación backend, pero no deben aparecer como datos configurados mientras no exista mapeo real.
- Medical, cargas, contratos y transferencias son fases posteriores; no se simulan en este borrador.
- Cutover V1 sigue siendo requisito antes de retirar completamente el origen legacy.

## Definition of Done para una pantalla TannerOS

Una pantalla no se considera integrada si solo “se ve bonita”. Debe:

- usar shell y branding del tenant;
- respetar permisos;
- operar en 360–430 px sin scroll horizontal accidental;
- operar en tablet y desktop;
- conservar estados loading/empty/error/success;
- tener touch targets correctos;
- no duplicar reglas de negocio en frontend;
- permitir volver al contexto anterior o navegar dentro del dominio;
- explicar métricas incompletas en vez de rellenarlas;
- pasar validación de sintaxis y preview antes de merge.
