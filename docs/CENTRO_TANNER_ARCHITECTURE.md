# Centro Tanner — arquitectura

Centro Tanner reutiliza por completo el stack existente de TannerOS: sitio
estático (sin build, sin framework) desplegado en Vercel, con Supabase como
única base de datos. No se creó infraestructura nueva.

## Principio: una fuente, todos los canales

- Las políticas y FAQ viven en `app.policies` / `app.faqs` (Postgres).
- El Reglamento, el Aviso de Privacidad, Uso de imagen y Visoría **ya
  existían** como `app.consent_documents` (usados por el portal de
  familias en `/familias/`). Centro Tanner los consume, no los duplica.
- `/aviso-de-privacidad/` (usado por los formularios de registro) ahora lee
  el mismo documento desde Supabase en vez de tener el texto incrustado en
  el HTML — mismo texto, una sola fuente.
- El portal de familias (`v2/familias/app.js`, función `consentsBlock`)
  ya mostraba versión, estado de firma y aviso de "el club actualizó este
  documento" — es el mecanismo real detrás de "Mis documentos" y el banner
  de nueva versión pedido en la misión. No se reescribió: se le sumó el
  documento `privacidad` a la misma tabla y automáticamente aparece ahí.

## Modelo de datos (schema `app`, mismo patrón que el resto del proyecto)

| Tabla | Para qué |
|---|---|
| `policies` | Las ~140 políticas del club. `status` (draft/published/archived), `version`, `category`, `requires_acceptance`. |
| `policy_versions` | Historial insert-only: nunca se borra una versión publicada. |
| `faqs` | Preguntas frecuentes, opcionalmente ligadas a una política. |
| `centro_tanner_changes` | Changelog curado (`/centro-tanner/cambios`). |
| `consent_documents` (ya existía) | Reglamento, Privacidad, Uso de imagen, Visoría. Se añadieron `effective_date`/`published_at`. |
| `consent_document_versions` (nueva) | Respaldo automático (trigger) del texto anterior cada vez que se edita un documento. |
| `consent_acceptances` (ya existía) | Aceptación por tutor/jugador — sin cambios. |
| `centro_tanner_search_log` | Cada búsqueda pública y cuántos resultados dio, para detectar preguntas sin respuesta (sección Analítica). |

RLS: todas las tablas nuevas tienen Row Level Security activo **sin
políticas** — exactamente el mismo patrón que `consent_documents`. Nadie
lee ni escribe la tabla directamente; todo pasa por funciones
`SECURITY DEFINER`.

## Funciones (RPC)

Mismo patrón que `v2_public_*` / `v2_*` existentes: una función delgada en
`public` (la que llama el navegador) que delega en `private` (la que
valida y opera).

Públicas (anónimas, solo contenido publicado):
`v2_public_centro_tanner_home`, `..._search`, `..._policy`, `..._category`,
`..._document`, `..._changelog`.

Administración (staff autenticado, exige el módulo `centro_tanner`):
`v2_centro_tanner_admin_list`, `..._policy_upsert`, `..._policy_publish`,
`..._policy_archive`, `..._faq_upsert`, `..._document_upsert`,
`..._change_upsert`, `..._acceptance_stats`.

La escritura de documentos oficiales (`document_upsert`) recibe
`bump_version` como decisión editorial explícita: un cambio cosmético no
sube versión (no fuerza a las familias a firmar de nuevo); una regla nueva
sí, porque el admin lo marca así al guardar.

## RBAC

Se dio de alta el módulo `centro_tanner` (`public.modules`,
`plan_modules`, `role_module_permissions`) con el mismo mecanismo que
`admin`/`usuarios`: lectura para todo el staff (Presidencia, Academia,
Contabilidad, Formadores, Marketing, Operaciones, Scouting, Tanner,
Taquilla), escritura únicamente para Presidencia.

## Rutas

- Público: `/centro-tanner/` (home, buscador, categorías, `/tema/...`,
  `/p/<slug>`, `/documento/<code>`, `/privacidad`, `/cambios`). Es una
  única página (`centro-tanner/index.html` + `app.js`) con enrutamiento
  por `location.pathname`, necesario porque el contenido es dinámico
  (viene de la base de datos, no se puede generar como archivos estáticos
  sin un build). `vercel.json` agrega un rewrite catch-all solo para este
  prefijo; el resto del sitio sigue igual.
- TannerOS: nuevo ítem "Centro Tanner" en el menú lateral
  (`v2/shell.js`), visible según permisos igual que cualquier otro módulo.
- Administración: `/admin/centro-tanner/`, enlazado desde `/admin/`.

## Por qué no hay chatbot

La misión pide explícitamente evitar una IA que pueda inventar reglas en
esta primera versión. La búsqueda combina texto completo en español
(`tsvector`) con similitud de trigramas (`pg_trgm`) para tolerar errores
de escritura, sin alucinar contenido. Cada búsqueda y su número de
resultados se registra en `centro_tanner_search_log`, dejando la base
lista para que un futuro "Ask Tanner" —cuando exista— solo pueda responder
citando `policies`/`faqs`/`consent_documents` ya publicados.
