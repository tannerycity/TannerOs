# 01 · Matriz funcional de Mi Club FC

Revisada contra el repositorio el 23/11/2026: rutas de `v2/shell.js`, códigos
de módulo de `public.modules` en producción y las RPC que autoriza cada uno.
**Estado técnico** = lo que existe y funciona. **Plan / Complemento** = cómo se
vende. Ambos estados se guardan por separado (`saas_module_readiness` y
`saas_addons.commercial_status`).

Nada de TannerOS se elimina: Tannery City conserva su plan interno con todo.

## A. Núcleo gratuito · Semilla 20 (y todos los planes)

| Módulo | Funciones reales | Estado | Plan | Complemento | Dependencias | Costos externos | Riesgos de seguridad |
|---|---|---|---|---|---|---|---|
| `club`, `admin` | Datos del club, identidad visual (branding), configuración, onboarding | Listo | Semilla+ | — | Storage `tanneros-branding` | — | Logo público por diseño |
| `jugadores`, `jugadores_estado`, `jugadores_familia` | Expedientes, ficha, credencial, estado, datos de la familia | Listo | Semilla+ | — | Storage de fotos (miniaturas) | Egreso de Storage | Datos de menores: RLS + permisos por rol |
| Categorías (dentro de `jugadores`/`club`) | Catálogo de categorías, categoría por edad, staff por categoría | Listo | Semilla+ | — | — | — | — |
| `usuarios`, `staff` | Usuarios, roles, permisos por persona, organigrama, invitaciones | Listo | Semilla+ | — | Edge `staff-access` | Correo de Auth | Un usuario desactivado pierde el acceso (probado) |
| `prospectos` | Inscripciones y fichajes; **hoy también abre Visorías** | Listo | Semilla+ | — | Formularios públicos | — | Ver R3 |
| `asistencia` | Lista, fotos y estadísticas | Listo | Semilla+ | — | — | — | — |
| `direccion` (+ Becas) | Tablero de dirección y padrón de becas | Listo | Semilla+ | — | — | — | Becas: datos socioeconómicos |
| `cobranza`, `finanzas`, `taquilla` | Cobranza básica, estados de cuenta, ingresos y egresos, taquilla y corte | Listo | Semilla+ | — | Cron de cobranza del club | — | Dinero de familias: **cuenta del club**, nunca la del SaaS |
| `utileria` | Inventario, kits e incidencias | Listo | Semilla+ | — | — | — | — |
| `calendario`, `callups`/`convocatoria` | Calendario, partidos y convocatorias | Listo | Semilla+ | — | — | — | — |
| Portal de familias | Estado de cuenta, pedidos y avisos del hijo | Listo | Semilla+ | — | `family-access` | — | Tutor sin membresía (probado en `01_*.sql`) |
| Mensajes | Mensajería interna por área (`always`) | Listo | Semilla+ | — | Push web | — | — |
| `correcciones` | Bitácora de correcciones (historial de movimientos) | Listo | Semilla+ | — | — | — | — |
| Exportación básica | Exportes CSV por pantalla | Parcial | Semilla+ | — | — | — | Falta una exportación completa por academia (pendiente P4) |

## B. Administración avanzada

| Módulo | Funciones reales | Estado | Plan propuesto | Complemento | Dependencias | Costos externos | Riesgos |
|---|---|---|---|---|---|---|---|
| `contabilidad` | Conciliación, bandeja de conciliación, reportes | Listo | Formativo+ | — | — | — | Datos financieros |
| `pago_proveedor` | Pagos a proveedores | Listo | Formativo+ | — | — | — | — |
| `encuestas` | Encuestas a familias y visitantes | Listo | Formativo+ | — | — | — | — |
| Cobranza automatizada y morosidad | Recordatorios, recargos y candados (motor de cobranza del club) | Listo, dentro de `cobranza` | Semilla+ (ya vive en el núcleo) | — | `pg_cron` | WhatsApp: enlaces, sin API | — |
| Roles adicionales | Permisos por persona (`membership_module_overrides`) | Listo | Semilla+ | — | — | — | — |
| `academias` | Academias, porteros e inscripciones | Listo | Ascenso+ | — | — | — | — |
| Múltiples sedes | No existe como entidad | No existe | Élite (a la medida) | — | — | — | No se vende hasta que exista |

## C. Comercialización

| Módulo | Funciones reales | Estado | Plan | Complemento | Dependencias | Costos externos | Riesgos |
|---|---|---|---|---|---|---|---|
| `tienda`, `catalogo`, `commerce_finance` | Catálogo, kits y uniformes, precios por fecha, pedidos por etapas, cobros, rentabilidad, liga pública | Listo | — | **STORE $149** (vendible) | Storage de fotos de producto | Pasarela de la tienda (h50, cuenta del club) | Liga pública con límite de intentos (h88) |
| `patrocinadores` | Pipeline, acuerdos, activos comerciales, evidencias, cotizaciones | Listo | — | **SPONSORS $149** (vendible) | — | — | — |

## D. Crecimiento deportivo

| Módulo | Funciones reales | Estado | Plan | Complemento | Dependencias | Costos externos | Riesgos |
|---|---|---|---|---|---|---|---|
| `scouting` | Fichas de scouting y miniaturas | Listo | — | **SCOUTING $199** (vendible) | Storage | — | Datos de menores |
| Visorías | Consentimiento, lista de espera, expediente y conservación (h53–h99) | Listo, pero autorizado con `prospectos` | Núcleo (de facto) | Debería ir en SCOUTING (R3) | Edge `visoria-expediente` | — | Consentimiento obligatorio (prueba 12) |
| `cursosVerano` | Programas, cursos y eventos con inscripción | Listo | — | **EVENTS $99** (vendible) | — | — | — |
| `formacion`, `formacion_direccion`, `centro_tanner` | Metodología Tannery, Semana Tanner y reglamento | Interno | No comercial v1 | — | Contenido de Tannery | — | Propiedad intelectual de Tannery |
| Métricas deportivas | Estadísticas de partidos y asistencia | Listo, dentro de partidos/asistencia | Semilla+ | — | — | — | — |

## E. Marketing y expansión

| Módulo | Funciones reales | Estado | Plan | Complemento | Dependencias | Costos externos | Riesgos |
|---|---|---|---|---|---|---|---|
| Ideas | Banco de ideas (pestaña de Patrocinadores, `always`) | Listo, sin compuerta | — | MARKETING $149: **no vendible** (sin módulo propio) | — | — | — |
| Campañas y seguimiento | No hay módulo de campañas | No existe | — | MARKETING | — | — | — |
| `metricas` | Redes, Google y web; tablero ejecutivo (h58) | En revisión | — | **ANALYTICS $149: no vendible** | Windsor, Meta, Google Business Profile | **Sí** (Windsor por cuenta) | Credenciales por academia sin validar |
| Pack Crecimiento | SPONSORS + MARKETING + ANALYTICS | — | — | **$349: no vendible** hasta que MARKETING y ANALYTICS estén listos | — | — | — |

## F. Instalaciones

| Módulo | Funciones reales | Estado | Plan | Complemento | Dependencias | Costos externos | Riesgos |
|---|---|---|---|---|---|---|---|
| `estacionamiento` | Gafetes, costos y responsabilidad | En revisión (reglas de Tannery) | — | **PARKING $99: no vendible** | — | — | — |
| Mensajería avanzada | No existe (solo enlaces de WhatsApp) | No existe | — | **MESSAGING $99: no vendible** | — | **Sí** (WhatsApp/SMS se cobran aparte) | — |
| Control de servicios / instalaciones | No existe como módulo | No existe | — | — | — | — | — |

## Complementos al día de hoy

| Código | Precio | ¿Se puede vender? | Por qué |
|---|---:|---|---|
| STORE | $149 | Sí | Sus 3 módulos están listos |
| SPONSORS | $149 | Sí | Listo |
| SCOUTING | $199 | Sí | `scouting` está listo. Las visorías siguen en el núcleo (R3) |
| EVENTS | $99 | Sí | Listo |
| ANALYTICS | $149 | No | Conectores y costo de Windsor por academia sin validar |
| PARKING | $99 | No | Reglas propias de Tannery |
| MARKETING | $149 | No | No hay módulo que encender o apagar |
| MESSAGING | $99 | No | No existe |
| PACK_CRECIMIENTO | $349 | No | Incluye MARKETING y ANALYTICS |

"Se puede vender" no significa "a la venta". Todo nace en borrador, y es
Presidencia quien lo pone a la venta desde el portal. El servidor se niega si
algún módulo no está listo (hay prueba de eso).
