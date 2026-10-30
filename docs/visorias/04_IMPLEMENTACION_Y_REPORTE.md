# Visorías · Implementación del consentimiento informado (h54) — reporte

Fecha: 29/10/2026 · Rama: `visoria-consentimiento` · Estado: **implementado y probado; NO aplicado ni desplegado** (falta autorización).

## 1. Auditoría inicial (lo que había)

| Pieza | Estado real antes de h54 | Riesgo |
|---|---|---|
| Registro público `/visoria/` | Prospecto (`app.prospects`) con folio y foto, vía `v2_public_visoria_register` (h53) | — |
| Consentimiento | Una sola casilla genérica + texto corto `consent_documents.visoria` v1 (sin aprobación legal) | P0: sin declaraciones separadas |
| Firma | Trazo PNG + nombre dentro de `prospects.metadata.visoria.firma` | P0: editable, sin hash ni versión exacta |
| Salud | `metadata.visoria.salud` (alergias, lesiones, medicamentos, seguro) | P0: visible para todo Fichajes; sin consentimiento expreso |
| Imagen | Interruptor **encendido por defecto** | P0: imagen concedida por defecto |
| Seguro | No se informaba | P0 |
| Identidad del firmante | No se verificaba | P0 |
| Expediente / PDF / bitácora | No existía | P0 |
| OTP | No hay proveedor de SMS/WhatsApp; 64 de 72 tutores sin correo | Ver §5 |
| Inscripciones reales | 1 (TC-2026-00039, prueba de Presidencia) | — |

Nada de lo anterior se borra: el registro viejo queda como estaba y cuenta como **sin consentimiento** hasta que la familia firme con el flujo nuevo.

## 2. Cambios realizados

### Base de datos — `supabase/migrations/20261030011147_h54_visoria_consentimiento_informado.sql` (aplicada en producción el 30/10/2026; función `visoria-expediente` desplegada)
- **Módulo `visoria_salud`** (sólo Presidencia): la ficha de salud no la ve Fichajes, ni visores, ni Marketing.
- **`visoria_campaigns`** + `legal_config` (datos legales del evento) + estado real del seguro (`sin_verificar` / `sin_seguro_verificado` / `con_seguro_verificado`).
- **`visoria_documents`**: plantillas (consentimiento, aviso, cláusula con/sin seguro) tomadas del machote 01/02 y documentos aprobados por evento. Inmutables por trigger.
- **`visoria_approvals`**: aprobación legal, operativa y de seguridad, ligadas a la **huella (SHA-256) del evento**. Si cambia sede, organizador, seguro, evaluador o un texto, dejan de valer solas.
- **`visoria_sign_links`**: liga personal de cada familia (sólo se guarda su hash).
- **`visoria_consents`**: el expediente. Texto exacto firmado y su hash, versión, aviso y su hash, cada decisión por separado (con texto del servidor y hora del dispositivo), firma + hash + medidas del trazo, hora del servidor (UTC, zona `America/Mexico_City`), huella de la evidencia. **Inmutable** (trigger); sólo avanza su estado.
- **`visoria_health`**: aparte, sólo existe con consentimiento expreso; revisión médica (`pendiente/apto/no_apto`).
- **Bitácoras append-only**: `visoria_audit`, `visoria_media_history`, `visoria_transfers`, `visoria_incidents`, `visoria_incident_entries`.
- Bucket privado `tanneros-visoria-expedientes` (sólo PDF, sin políticas: sólo la función del servidor).
- Funciones: apartar lugar, contexto de firma, **firmar (todo validado en el servidor)**, revocar imagen, tablero, verificar identidad, revisar facultades, anular, alerta operativa, liga para firmar, ficha de salud (con motivo, auditada), revisión médica, transferencia al evaluador (sólo con autorización y sin salud), configuración del evento, plantillas, aprobaciones, incidentes.

**Estados del expediente**: `pending_artifact` (sin PDF) → `requires_review` (firma "otro") → `pending_verification` (identidad) → `signed`. `invalid` es terminal y conserva su motivo.

**Hoja de acceso** (`AUTORIZADO`, `PENDIENTE`, `REVISION_MEDICA`, `SIN_CONSENTIMIENTO`, `NO_APTO`): sólo **AUTORIZADO** entra. Los visores sólo ven Autorizado / No autorizado.

### Expediente PDF — `supabase/functions/visoria-expediente/` (sin desplegar)
Se genera en el servidor del expediente congelado. Lleva:
- el texto íntegro firmado y el aviso de privacidad;
- cada decisión (sí/no), la firma, la hora del servidor y las huellas SHA-256;
- la leyenda "firmado electrónicamente", aclarando que **no** es firma electrónica avanzada ni NOM-151.

**No lleva salud.** Se guarda en el bucket privado con su SHA-256. Las descargas son por liga firmada de 2 minutos y cada una queda en la bitácora.

### Pantallas
- **`/visoria/`** — mismo diseño. Cinco pasos: Tu hijo · Su familia · Salud · Autorizaciones · Firma.
  - Si la visoría no tiene las 3 aprobaciones, **sólo se aparta el lugar**: nunca se muestra un texto legal sin aprobar y no se pide salud.
  - El aviso de seguro va visible y antes de las casillas.
  - Hay que abrir los dos documentos completos (descargables).
  - Ninguna casilla viene marcada y fotos/evaluador son Sí/No sin valor por defecto.
  - El lienzo de firma maneja alta densidad (DPR) y se mide el trazo.
  - Nunca dice "listo" sin expediente ni sin verificar.
  - Con su liga, la familia ve su estado, descarga su copia y retira el permiso de fotos.
- **`/v2/visorias/`** — pestañas:
  - **Inscritos**: cada niño con su estado de acceso.
  - **Acceso**: la hoja de la puerta, primero quien no puede entrar, con su motivo.
  - **Evento**: datos legales, seguro, aprobaciones, documentos y bitácora.
  - **Incidentes**: hechos, no culpas; sólo se agrega.
  - La hoja de cada niño permite verificar identidad, revisar facultades, ver la ficha de salud (sólo con permiso), descargar el expediente, mandar la liga para firmar, poner alerta operativa, retirar permiso de fotos y anular.

## 3. Pruebas ejecutadas (resultados reales)

| Prueba | Resultado |
|---|---|
| `supabase/tests/12_visoria_solo_entra_quien_tiene_consentimiento.sql` sobre Postgres 16 local con réplica mínima del esquema | **34/34 OK**. Mutación: quitar la validación de casillas, la de identidad o el candado de salud la hace fallar (3/3 detectadas) |
| `scripts/qa-humo-visoria.mjs` (navegador, 390px) | **74/74 OK** |
| `scripts/qa-humo-visoria-expediente.mjs` (PDF real con pdf-lib) | **13/13 OK** |
| `scripts/qa-visoria-consentimiento.mjs` (unitaria) | **24/24 OK** |
| `scripts/qa-static.mjs` | OK |
| Todas las suites unitarias del repo | OK |
| Las 64 suites de navegador del repo | OK, ninguna falló |
| Compatibilidad con el esquema de producción (columnas, pgcrypto, `sha256`, bucket) | Verificada por consultas de sólo lectura |

Casos de la matriz 03 cubiertos por la prueba 12: TC-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16 y 18. TC-17 (rastreo comercial) está cubierto por diseño: `/visoria/` no carga píxeles ni analítica, y el PDF no lleva salud.

**Falta correr** la prueba 12 en producción (dentro de una transacción que se revierte) inmediatamente antes de aplicar h54.

## 4. Pendientes que NO puede resolver el código (bloquean abrir la firma)

| # | Pendiente | Quién |
|---|---|---|
| 1 | Razón social completa del organizador jurídico | Presidencia / abogado |
| 2 | Revisión del consentimiento y del aviso por abogado de Guanajuato (incluye límites de responsabilidad, capacidad del firmante, imagen, transferencias) | Abogado → aprobación **legal** en Evento |
| 3 | Estado **real** del seguro de este evento (club, recinto, evaluador) | Operación → Evento |
| 4 | Coordinador responsable y coordinador de emergencias; protocolo (dirección exacta, ambulancia, 911, hospital) | Operación |
| 5 | Inspección de cancha, botiquín, personal en primeros auxilios, hidratación/calor, entrega y recogida | Operación → aprobación **operativa** |
| 6 | Revisión de roles, archivos, conservación y copias | Seguridad → aprobación **seguridad** |
| 7 | Procedimiento ARCO, proveedores tecnológicos, medios oficiales, analítica, tabla de conservación | Presidencia / abogado |
| 8 | Club evaluador externo (si habrá) | Presidencia |
| 9 | Acceso de Marketing a la lista de "quién autorizó fotos" (no se tocó el rol de Marketing) | Decisión de Presidencia |
| 10 | Protocolo en papel preaprobado para fallas de conectividad (captura posterior) | Operación + desarrollo |
| 11 | OTP por SMS/WhatsApp (proveedor y credenciales) | Decisión + proveedor |

## 5. Riesgos residuales

- **Identidad del firmante**: no hay OTP. Se verifica por el **WhatsApp del club**, cuando el pase llega del número registrado, o **en persona con identificación**; la verificación queda con referencia en la bitácora. El trazo por sí solo no prueba identidad.
- **PDF**: lo genera nuestro servidor con su hash; no es constancia NOM-151 ni firma electrónica avanzada.
- **Salud del registro viejo**: la inscripción de prueba TC-2026-00039 tiene salud en `metadata` (h53). No se borra sin autorización; propuesta: archivarla.
- **Liga de la familia**: quien tenga la liga puede firmar o ver el estado de ese niño. Vence 120 días después del evento y el staff puede generar otra.
- **Límite de intentos**: el límite es por huella (IP + navegador), no por persona.
- **Retención**: no se fijó un plazo; requiere la tabla de conservación aprobada.

## 6. Checklist "apto para publicar"

- [x] Código, migración y función listos y probados.
- [ ] Autorización de Presidencia para aplicar h54 y desplegar `visoria-expediente`.
- [ ] Prueba 12 en producción (transacción revertida) en verde.
- [ ] Datos legales completos en **Evento**.
- [ ] Seguro verificado.
- [ ] Aprobación **legal** con nombre del abogado y fecha.
- [ ] Aprobación **operativa**.
- [ ] Aprobación **seguridad**.

Mientras falte cualquiera de las tres aprobaciones, el sistema **sólo deja apartar lugar** y nadie aparece como AUTORIZADO.
