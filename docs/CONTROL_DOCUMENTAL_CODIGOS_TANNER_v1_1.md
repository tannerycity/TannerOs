# Control documental — Código del Jugador Tanner y Código de Convivencia y Familias Tanner

Registro de control para los documentos integrados el 26/11/2026, como pide la
misión de integración de Mich, y para la fusión del 26/11/2026 (Mich sintió que
había demasiados códigos; ver sección de fusión más abajo). Donde no hay un dato
confirmado, se escribe **PENDIENTE** — no se inventa.

## Código del Jugador Tanner

| Campo | Valor |
|---|---|
| Identificador | `codigo_jugador` (`app.consent_documents`) |
| Versión actual | 2 (v1 publicación inicial; v2 aclara quién autoriza excepciones de uniforme) |
| Estado | Publicado y activo |
| Responsable | PENDIENTE — Presidencia debe confirmar quién lo aprobó formalmente |
| Fecha real de aprobación | PENDIENTE |
| Fecha de publicación (en Centro Tanner) | 26 de noviembre de 2026 |
| Fecha de entrada en vigor | 26 de noviembre de 2026 — confirmado por Mich: igual a la de publicación |
| Documentos relacionados | Cultura y Convivencia Tanner v1.0 (OFICIAL), Reglamento Tanner vigente, Aviso de privacidad |
| Historial de cambios | v1 (26/11): publicación inicial · v2 (26/11): aclara que Dirección Deportiva autoriza excepciones de uniforme |

## Código de Convivencia y Familias Tanner (documento fusionado, 26/11/2026)

| Campo | Valor |
|---|---|
| Identificador | `codigo_convivencia` (`app.consent_documents`) |
| Versión actual | 3 |
| Estado | Publicado y activo |
| Responsable | PENDIENTE |
| Fecha real de aprobación | PENDIENTE |
| Fecha de publicación (en Centro Tanner) | 26 de noviembre de 2026 |
| Fecha de entrada en vigor | 26 de noviembre de 2026 |
| Documentos relacionados | Reglamento Tanner vigente, protocolos de protección de menores, reglas vigentes del parque, Aviso de privacidad, Código del Jugador Tanner |
| Historial de cambios | v1: Cultura y Convivencia Tanner v1.0 (OFICIAL) · v2 (26/11): agrega párrafo de referencia a los códigos nuevos · v3 (26/11): se fusiona con el Código de las Familias Tanner en un solo documento — mismo contenido, cero firmas existentes afectadas (0 aceptaciones en ambos antes de la fusión) |

### Por qué se fusionó

Mich: "Siento que tenemos muchos códigos... analízalo y dime qué harías para hacerlo
más fácil." El Código de las Familias Tanner v1.1 se había escrito explícitamente
como "Documento complementario de Cultura y Convivencia Tanner v1.0" y cubría, más a
detalle, los mismos 7 puntos que v1.0 ya traía — eran el mismo tema contado dos veces.
El Código del Jugador Tanner se mantiene **separado** a petición de Mich: vive su
propio ritual "Explicar (60 seg)" por categoría y se dirige directamente al niño, no
a la familia.

`codigo_familias` no se borró: quedó con `active=false` y su historial de versiones
intacto en `app.consent_document_versions`, consultable si Presidencia lo necesita.

## Mecanismo de aceptación digital (verificado, no nuevo)

Ambos documentos quedaron `active=true` y `required=true` en `app.consent_documents`.
El Portal de familias (`private.portal_paperwork`) ya lista **todos** los documentos
activos de la organización sin una lista fija de códigos escrita en el código — en
cuanto un documento queda activo, aparece solo como pendiente de firmar, con versión,
fecha, tutor y jugador vinculado. No se construyó nada nuevo para esto: ya existía.

## Pendiente de decisión por Presidencia

1. Responsable y fecha real de aprobación de ambos códigos (campos arriba en PENDIENTE).
2. Si "Dirección Deportiva" es el cargo correcto para autorizar excepciones de uniforme
   (así quedó redactado v2 del Código del Jugador; corregible si no es el cargo correcto).

## Confirmado por Mich (26/11/2026)

- Fecha de entrada en vigor de ambos códigos = fecha de publicación (hoy). Cerrado, sin
  cambio de código necesario.
- FAQ para Formadores: se construyó como módulo real (no solo texto) dentro de la pestaña
  Convivencia — botón "Preguntas frecuentes para Formadores" que abre la hoja con las 7
  preguntas (ver `v2/convivencia/convivencia.js`, `FAQ_FORMADOR`).
