# MISIÓN PARA CLAUDE CODE — TANNERY CITY FC | VISORÍAS

**Documento maestro de implementación · versión 1.0 · 29 de octubre de 2026**

## 0. Rol y objetivo

Actúa como un equipo de **arquitectura de software, desarrollo full-stack, seguridad, QA Senior, diseño de producto y cumplimiento jurídico mexicano**. Tu tarea es auditar el flujo existente de registro a visorías de Tannery City FC y convertirlo en un **sistema de consentimiento informado, firma/autenticación electrónica y expediente auditable**, con especial cuidado al tratarse de niñas, niños y adolescentes.

La meta es proteger a participantes y organizadores **con medidas reales, declaraciones claras y pruebas conservadas**, no fingir que una cláusula elimina cualquier responsabilidad legal.

**Restricción jurídica fundamental:** NO redactes «el club no se hace responsable de absolutamente nada», «renuncio a demandar por cualquier causa», «libero incluso por negligencia o dolo» ni equivalentes. Una aceptación de riesgos deportivos ordinarios **no exime** al club de responsabilidad imputable ni de sus obligaciones legales. El borrador debe revisarlo un abogado de Guanajuato antes de activarlo como documento definitivo.

**Materiales adjuntos (leer completos antes de comenzar):**
- `01_CONSENTIMIENTO_VISORIAS_MACHOTE.md`: texto integral del consentimiento.
- `02_AVISO_PRIVACIDAD_VISORIAS_MACHOTE.md`: aviso de privacidad adaptable.
- `03_OPERACION_Y_QA_VISORIAS.md`: operación, seguridad, casos de prueba y criterios de salida.

## 1. Instrucción inicial: reconocer el repositorio

1. Inspecciona el repositorio y describe brevemente las rutas, componentes, flujos de firma y servicios actuales relacionados con visorías, registros, jugadores, tutores, usuarios, fotografías, archivos y auditoría. **No inventes rutas, tablas ni dependencias existentes.**
2. Ubica la pantalla de la que partimos: sección de términos de visoría, interruptor de fotos y video, zona de firma táctil y nombre de quien firma.
3. Reutiliza el diseño del producto (estilo limpio tipo Apple, accesible, mobile-first; iconografía monocromática, sin emojis en la UI). No remodeles otros módulos ni rompas compatibilidad con la aplicación actual.
4. Identifica la arquitectura real y restricciones de autenticación. Si existe Supabase, utiliza la configuración vigente, políticas RLS y buckets privados; **no asumas Supabase si no está**.
5. Antes de migraciones o refactor, inspecciona y prepara cambios compatibles, reversibles y no destructivos. No borres consentimientos firmados ni datos históricos.
6. **No publiques automáticamente en producción**. Prepara implementación, pruebas y lista de requisitos pendientes de aprobación legal y operativa.

## 2. Alcance funcional obligatorio

### A. Información clara antes de firmar

- Mostrar título «Consentimiento informado para visorías» y nombre del evento, organizador legal, fecha, sede, horario, club evaluador si existe, versión del documento.
- Mostrar aviso conspicuo, antes de las casillas: **«IMPORTANTE: ESTA VISORÍA NO INCLUYE SEGURO MÉDICO NI DE ACCIDENTES PROPORCIONADO POR TANNERY CITY FC»**, SOLO si el administrador ha verificado que efectivamente no se ofrece ese seguro para ese evento.
- Si alguna visoría **sí** tiene póliza, mostrar datos confirmados de la cobertura y generar una versión de consentimiento distinta aprobada; nunca afirmar «sin seguro» cuando haya cobertura ni viceversa. La participación sin seguro no modifica obligaciones legales del club.
- Dar acceso al consentimiento **íntegro, legible y descargable** y al aviso de privacidad íntegro **antes de solicitar la firma**; almacenar qué versión se presentó. Resumen de riesgos: contacto físico, caídas, golpes, lesiones, deshidratación, emergencias médicas, posibilidad excepcional de lesión grave.
- El contenido debe explicar que no hay garantía de selección, contratación, beca ni vínculo deportivo profesional.

### B. Datos necesarios del menor, responsable y emergencia

Campos mínimos:
- `event_id`, `participant_id` (o nuevo participante si el flujo lo admite), nombre y fecha de nacimiento del menor.
- Nombre completo del firmante; parentesco (`madre`, `padre`, `tutor legal`, `otro` → revisión manual); teléfono y correo, con datos suficientes de verificación; evidencia de autoridad en casos especiales sin recolectar documentos de identidad masivamente por defecto.
- Contacto de emergencia alternativo, nombre y teléfono; persona(s) autorizadas para recogida cuando proceda.
- Cuestionario de salud breve y proporcional: ¿lesión/condición actual relevante para realizar deporte?, ¿alergias relevantes para emergencias?, ¿restricción médica?, ¿requiere atención/medicamento específico? Permitir «ninguna conocida» y «prefiero informar al coordinador de forma privada». No pedir diagnósticos extensos no necesarios. Si hay respuesta de riesgo → revisión privada por personal habilitado y posible bloqueo preventivo. No afirmar que una declaración sustituye un certificado médico.
- Registrar que los datos de salud son **sensibles**, no visibles para scouts, marketing, administración general ni otros padres. El consentimiento expreso para tratamiento de salud se prueba separadamente.

### C. Consentimientos independientes (NO preseleccionados)

Requerir una acción positiva específica por cada declaración; no usar una única casilla genérica:
1. `accept_participation`: autorización voluntaria de participación del menor y reconocimiento de riesgos ordinarios, sin exención de responsabilidades legalmente imputables.
2. `ack_no_insurance`: conocimiento explícito de que el evento no ofrece cobertura médica/de accidentes del organizador (si aplica, con contenido acorde a la configuración real).
3. `ack_health_and_emergency`: confirmación de exactitud de información médica + autorización para activar servicios de emergencia y primeros auxilios dentro de la capacidad del personal; aclarar que ello no sustituye consentimiento médico exigido para procedimientos.
4. `consent_sensitive_data`: consentimiento **expreso, por escrito/electrónico atribuible** para tratar los datos de salud estrictamente necesarios, enlazado con el aviso de privacidad.
5. `transfer_to_evaluator`: opción granular de consentimiento sobre **transferencia de datos deportivos** a un tercero identificable, mostrando su nombre, finalidad y categoría de datos. Se debe informar si la transferencia es indispensable para una modalidad específica de evaluación externa y qué alternativa existe; la negativa no implica aceptar otra finalidad. No transferir datos de salud al evaluador salvo supuesto legal excepcional y documentado.
6. `media_publication`: autorización **opcional**, apagada inicialmente y separada para usar imagen/video del menor con fines de difusión institucional en medios oficiales. La negativa **nunca impide la participación**. Registrar también negativa explícita y facilitar revocación futura.
7. Distinguir **grabación para evaluación deportiva** de **publicación promocional**; si se realiza evaluación audiovisual, explicarla y tratarla bajo su finalidad/consentimiento correspondiente; no usar esas imágenes en publicidad sin permiso adicional.

Si el firmante no tiene facultades verificables o hay discrepancias de tutela, pasar a **revisión manual**. Para adolescentes, ofrecer información comprensible y valorar su opinión sin sustituir la autorización de quien legalmente corresponda.

### D. Firma y autenticación

- Área de firma con dedo o mouse: canvas responsivo con botón «Borrar», manejo correcto de alta densidad (DPR) y protección contra firma vacía, trazo accidental o canvas en blanco.
- Captura de nombre explícito del firmante y declaración «soy padre, madre o tutor facultado».
- Verificación de identidad **apropiada al nivel de riesgo** (ej.: OTP SMS/email al contacto del firmante; confirmación vinculada a cuenta previamente verificada); si OTP no existe, proponer e implementar la integración solo tras revisar qué proveedor y credenciales están disponibles. Nunca afirmar que trazo digital solo autentica identidad.
- Estado final `signed` únicamente después de validar en servidor: evento activo, versión legal vigente, identidad/autorización aceptable, todas las declaraciones obligatorias, firma no vacía, verificación requerida y reglas médicas/operativas.
- Backend **nunca** debe confiar en el estado disabled de un botón; validar todo server-side.
- Firma asociada a un documento específico; **nunca** pegar una firma reutilizable de otro evento o versión.

### E. Evidencia de aceptación y expediente

Al finalizar, crear una **instantánea inmutable** (sin sobrescritura) con:
- `consent_id`, `event_id`, `participant_id`, `guardian_id`, datos mínimos del firmante y parentesco declarado.
- Nombre del responsable legal del evento, lugar, fecha, hora y zona horaria `America/Mexico_City` (almacenar internamente UTC ISO 8601).
- Texto íntegro del consentimiento y aviso de privacidad exactos (o snapshot verificado por hash), identificador y versión de cada documento; versión de interfaz y estado de configuración del seguro.
- Valores exactos de cada consentimiento, tanto aceptación como negativa, y texto asociado por versión.
- Resultado de autenticación del firmante, método y referencia de verificación. No guardar OTP, contraseñas ni tokens en claro.
- Referencia a la firma manuscrita (PNG o vector seguro), hash criptográfico SHA-256 del documento congelado y, si aplica, de la evidencia.
- Metadatos técnicos proporcionados lícitamente y solo para evidencia proporcional (user-agent, identificador de sesión autenticada, IP si está justificada y prevista en privacidad); nunca tratarlos como prueba única de identidad.
- PDF final legible e inmutable, con resumen de elecciones, leyenda de **«firmado electrónicamente»** sin afirmar e.firma avanzada ni certificación NOM-151 si no existe efectivamente; timestamp verificable del servidor.
- Registro append-only de cambios relevantes, accesos, revocaciones y descargas (sin exponer datos médicos en logs).
- Confirmación al firmante con opción de descargar su copia. No añadir datos sensibles de salud al PDF compartible por defecto.

**Integridad:** crear el registro definitivo y la evidencia coherentemente (transacción/flujo idempotente + estado `pending_artifact` hasta persistir PDF). Si falla PDF/almacenamiento, no indicar «completado» falsamente. No permitir modificar un documento firmado: crear nueva versión y nuevo consentimiento ante cambios materiales.

### F. Seguridad y privacidad

- Archivos y bucket **privados**, URLs temporales autorizadas, controles RBAC/RLS y principio de mínimo privilegio.
- Funciones de administrador: ver resumen `Firmado / Pendiente / Requiere revisión / Inválido`, mostrar la versión y descarga autorizada; los datos de salud requieren rol específico. Marketing solo ve los participantes con autorización vigente para imagen, jamás ficha médica.
- No enviar datos médicos a herramientas de analytics, pixels de Meta/Google, tracking de errores, IA externa ni consola.
- Proteger endpoints: validación de campos, CSRF donde proceda, rate limiting, sanitización, idempotency keys, control de tamaño y tipo MIME, prevención de IDOR y de acceso horizontal entre familias.
- Políticas de conservación, bloqueo y eliminación diferenciadas, sujetas a finalidad, prescripciones y revisión legal; **no inventar un plazo legal universal**. Las revocaciones no alterarán evidencia histórica válida, pero sí detendrán tratamientos futuros cuando proceda.
- Aviso de privacidad real, con responsable, domicilio, contacto para ARCO, finalidades, datos sensibles, transferencias, medidas de contacto y mecanismo de cambios. No publicar con placeholders sin resolver.

### G. Gestión por evento y clubes externos

Panel admin para definir de manera verificable:
- Organizador legal, sede, fechas/horarios, coordinador, tipo de ejercicios, cupo, club externo y responsables, estado del seguro y cobertura verificada, versión documental aprobada.
- Configuración de compartir datos con cada evaluador (campos y finalidad, destino, aceptación, fecha de transferencia).
- Bloquear la apertura de inscripciones si faltan identidad legal del organizador, sede, hora, estado real del seguro, documentos aprobados, aviso de privacidad, coordinador de emergencias y protocolo de seguridad operativo.
- Crear nuevo documento/autorización cuando cambien de forma material los riesgos, sede, organizador, club evaluador, cobertura o finalidad del tratamiento; jamás modificar silenciosamente el ya aceptado.
- Generar hoja de control de acceso a cancha: `AUTORIZADO`, `REVISIÓN MÉDICA`, `SIN CONSENTIMIENTO`, `NO APTO POR ALERTA OPERATIVA`. No abrir puerta a participar por un mero registro de nombre.
- Si no hay conectividad, **no simular firma exitosa**; usar protocolo papel preaprobado con posterior captura y trazabilidad.

### H. Protocolo de incidentes

Crear flujo interno (sin acceso de padres a detalles de otros niños) para registrar hechos, fecha, lugar, actividad, personas presentes, primeros auxilios, llamada a emergencia, contacto a tutor, ambulancia/traslado, evidencia, seguimiento y cierre con responsabilidades por determinar; no alterar hechos ni forzar conclusiones de culpa.

El sistema debe recordar que un documento firmado **no sustituye** inspección del campo, hidratación, supervisión competente, botiquín, contacto de emergencias, manejo de calor, protocolos de protección infantil ni seguros. Reusar el WhatsApp oficial de Tannery City para reportes internos si así está configurado; no enviar datos médicos a grupos abiertos.

## 3. Diseño UX

Diseña una interfaz en 4 pantallas o secciones progresivas:
1. Datos del menor, tutor y emergencia.
2. Salud con privacidad y revisión cuando corresponda.
3. Riesgos, advertencia de seguro, acceso a términos, consentimientos granulares, club evaluador e imagen opcional.
4. Firma/verificación y confirmación + copia de documento.

- Mobile-first, textos legibles, bloques blancos y grises, botones y casillas accesibles, jerarquía clara, navegación sin pérdida de datos, porcentaje de avance opcional.
- Aviso «sin seguro» **muy visible**, sin lenguaje que oculte obligaciones legales ni casillas engañosas.
- Documentos completos visibles en modal/página de lectura con opción descargar. No habilitar envío si faltan requisitos.
- Emplear texto exacto del machote legal **tras revisión y aprobación**; no parafrasearlo en cláusulas sustantivas sin control de versiones.

## 4. Modelo lógico de datos orientativo (adaptar al repositorio)

No migres ciegamente. Propuesta semántica:

- `tryout_events`: id, organizer_entity_id, venue, start_at, end_at, evaluator_id, insurance_status, insurance_disclosure_version, legal_approved_at, safety_approved_at, registration_status.
- `legal_documents`: id, kind (`consent`, `privacy`, `media`, `evaluator_transfer`), version, language, content_hash, content_snapshot, approved_by, approved_at, effective_at, retired_at.
- `guardian_verifications`: guardian_id, verification_method, verified_at, verification_reference, no raw OTP.
- `tryout_consents`: id, event_id, participant_id, guardian_id, terms_document_id, privacy_document_id, snapshots/hashes, signature_reference, consent_choices_json, signed_at_utc, status, event_snapshot, verification_method, artifact_hash, artifact_storage_key, idempotency_key.
- `tryout_health_private`: participant_id, event_id, relevant minimal disclosures, medical_review_status, role-restricted; separate storage/access from ordinary registration.
- `tryout_audit_events`: id, consent_id, actor_id, timestamp, action, result, correlation_id, reason; append-only.
- `media_permission_history`: participant_id, event_id, granted/denied/revoked, recorded_at, source, version; no overwrites.
- `tryout_incidents`: restricted record, details, event timeline, attachments, access logs.

Add constraints: uniqueness/idempotency per signing request; foreign keys; server timestamps; audit; no accidental cascades. Retention/access policies must be configurable and reviewed legally.

## 5. API/servicios orientativos

Adaptar a framework. Proponer:
- `GET /events/:id/consent-context` retorna solo info pública, documentos vigentes, seguros verificados, campos y condiciones.
- `POST /events/:id/guardian-verification` inicia desafío verificado (rate limit).
- `POST /events/:id/consents` valida **en servidor** y firma el documento exacto (idempotente).
- `GET /consents/:id/copy` descarga copia autorizada.
- `POST /consents/:id/media-revocations` revocación de usos futuros y flujo de retiro razonable conforme a privacidad.
- `GET /admin/events/:id/consents` resumen rol autorizado.
- `POST /admin/events/:id/incidents` registro restringido.

No prometer API finales hasta reconocer arquitectura real.

## 6. Seguridad y aceptación QA

Implementar pruebas unitarias, integración, E2E (si existe framework), permisos y auditoría de datos. Casos mínimos:

- Rechazar participación sin cada aceptación obligatoria (verificar también manipulando request directamente).
- Rechazar firma vacía; impedir firma de otro usuario/evento; rechazo de versión desactualizada.
- Fotografía en `NO` no puede activar marketing y **no bloquea** participación.
- Revocar permiso de fotos detiene nuevas publicaciones/uso futuro según políticas y registra historia.
- Consentimiento de datos médicos realmente independiente y explícito; sin él no almacenar ficha médica sensible salvo fundamento legal específico.
- Club evaluador distinto no recibe información sin base legal/consentimiento válido.
- No transferir diagnósticos a evaluador ni enviar datos médicos a analytics/error trackers.
- Acceso entre tutores (`IDOR`), rol marketing/scout/admin, URLs temporales de PDF y firma, límite de descarga.
- Mismo submission duplicado no produce dos consentimientos; fallos de PDF no generan falso completado.
- Cambio de versión/sede/seguro requiere nueva aceptación cuando sea material.
- Evento suspendido o sin checklist de seguridad aprobado no acepta nuevas inscripciones.
- Accidente registrado no muestra datos de otros menores y mantiene trazabilidad.
- Accesibilidad teclado, pantalla pequeña, contraste y errores claramente explicados.
- Pérdida de red no registra consentimientos incompletos como válidos.

Usa los escenarios Gherkin del archivo de QA.

## 7. Condiciones antes de liberar a producción (release gates)

**LEGAL_REVIEW_PENDING**: abogado en Guanajuato valida contrato, límites de responsabilidad, identidad real del responsable, capacidad del firmante, usos de imagen, privacidad, transferencias, y si el convenio con club evaluador reparte responsabilidades correctamente.

**OPERATIONAL_REVIEW_PENDING**: persona responsable verifica ausencia/presencia de seguro para cada evento; inspección de cancha; botiquín; personal capacitado; contactos; emergencias; medidas para menores; flujo de entrega/recogida.

**SECURITY_REVIEW_PENDING**: prueba de roles, cifrado de datos, seguridad de archivos, trazabilidad, conservación y copias.

La app puede quedar implementada en desarrollo/staging, pero no habilites una aceptación con textos que no hayan sido aprobados, y no anuncies «protección legal garantizada».

## 8. Entregables exigidos a Claude Code

1. Auditoría inicial breve del código actual y plan de archivos/rutas/tablas a modificar.
2. Implementación real de pantalla, validaciones, flujo backend, firma, autenticación, PDF, auditoría, permisos.
3. Migraciones documentadas y reversibles si corresponden.
4. Plantillas exactas y versiones de documentos, con campos de configuración reales.
5. Tests automatizados y resultados reales de ejecución; nunca afirmar que se probaron si no se ejecutaron.
6. Evidencia de que el PDF conserva el documento y las selecciones exactas.
7. Lista de configuraciones pendientes (responsable legal, domicilio, ARCO, evaluadores, seguro, OTP, políticas de retención y seguridad física).
8. Riesgos residuales y checklist «apto para publicar / bloqueado».
9. Resumen de cambios y rutas funcionales para revisión de QA.

## 9. Fuentes jurídicas para validación profesional (consultadas 29/oct/2026)

- Congreso Guanajuato, Código Civil vigente: https://www.congresogto.gob.mx/codigos/codigo-civil-para-el-estado-de-guanajuato
- Congreso Guanajuato, Ley de Cultura Física y Deporte: https://portal.congresogto.gob.mx/leyes/ley-de-cultura-fisica-y-deporte-del-estado-de-guanajuato
- Cámara de Diputados, LFPDPPP (últ. reforma 14/11/2025): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf (arts. 7, 8, 14, 15, 35 y 36)
- Cámara de Diputados, Ley General Derechos NNA (últ. reforma 15/01/2026): https://www.diputados.gob.mx/LeyesBiblio/pdf/LGDNNA.pdf (arts. 76 a 80)
- Cámara de Diputados, Código de Comercio: https://www.diputados.gob.mx/LeyesBiblio/pdf/CCom.pdf (comercio electrónico, sujeto a aplicabilidad)
- DOF, NOM-151-SCFI-2016: https://dof.gob.mx/normasOficiales.php?codp=6499&view=si (no declarar certificación que no se haya contratado o implementado)
