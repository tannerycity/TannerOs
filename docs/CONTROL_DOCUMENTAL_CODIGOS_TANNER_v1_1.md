# Control documental — Código del Jugador Tanner y Código de las Familias Tanner v1.1

Registro de control para los dos documentos integrados el 26/11/2026, como pide la
misión de integración de Mich. Donde no hay un dato confirmado, se escribe
**PENDIENTE** — no se inventa.

## Código del Jugador Tanner

| Campo | Valor |
|---|---|
| Identificador | `codigo_jugador` (`app.consent_documents`) |
| Versión actual | 2 (v1 publicación inicial; v2 aclara quién autoriza excepciones de uniforme) |
| Estado | Publicado y activo |
| Responsable | PENDIENTE — Presidencia debe confirmar quién lo aprobó formalmente |
| Fecha real de aprobación | PENDIENTE |
| Fecha de publicación (en Centro Tanner) | 26 de noviembre de 2026 |
| Fecha de entrada en vigor | 26 de noviembre de 2026 (igual a la de publicación; Presidencia puede cambiarla) |
| Documentos relacionados | Cultura y Convivencia Tanner v1.0 (OFICIAL), Reglamento Tanner vigente, Aviso de privacidad |
| Historial de cambios | v1 (26/11): publicación inicial · v2 (26/11): aclara que Dirección Deportiva autoriza excepciones de uniforme |

## Código de las Familias Tanner

| Campo | Valor |
|---|---|
| Identificador | `codigo_familias` (`app.consent_documents`) |
| Versión actual | 1 |
| Estado | Publicado y activo |
| Responsable | PENDIENTE |
| Fecha real de aprobación | PENDIENTE |
| Fecha de publicación (en Centro Tanner) | 26 de noviembre de 2026 |
| Fecha de entrada en vigor | 26 de noviembre de 2026 (igual a la de publicación; Presidencia puede cambiarla) |
| Documentos relacionados | Cultura y Convivencia Tanner v1.0 (OFICIAL), Reglamento Tanner vigente, protocolos de protección de menores, reglas vigentes del parque, Aviso de privacidad |
| Historial de cambios | v1 (26/11): publicación inicial |

## Cultura y Convivencia Tanner (documento base, no modificado en su contenido)

| Campo | Valor |
|---|---|
| Identificador | `codigo_convivencia` |
| Versión actual | 2 (de registro — el contenido v1.0 sigue intacto) |
| Cambio aplicado | Se agregó un párrafo de referencia a los dos códigos nuevos; nada se borró ni se reescribió |
| Fecha del cambio | 26 de noviembre de 2026 |

## Mecanismo de aceptación digital (verificado, no nuevo)

Ambos documentos quedaron `active=true` y `required=true` en `app.consent_documents`.
El Portal de familias (`private.portal_paperwork`) ya lista **todos** los documentos
activos de la organización sin una lista fija de códigos escrita en el código — en
cuanto un documento queda activo, aparece solo como pendiente de firmar, con versión,
fecha, tutor y jugador vinculado. No se construyó nada nuevo para esto: ya existía.

## Pendiente de decisión por Presidencia

1. Responsable y fecha real de aprobación de ambos códigos (campos arriba en PENDIENTE).
2. Si la fecha de entrada en vigor debe ser distinta a la de publicación (ej. inicio de
   temporada en vez de "hoy").
3. Si "Dirección Deportiva" es el cargo correcto para autorizar excepciones de uniforme
   (así quedó redactado v2 del Código del Jugador; corregible si no es el cargo correcto).
