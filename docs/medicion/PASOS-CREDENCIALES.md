# Credenciales del tablero: pasos para el dueño de las cuentas

Dos credenciales, gratis, de sólo lectura. **Ninguna se manda por chat, correo ni
WhatsApp**: se pegan directo en Supabase. A Claude sólo se le avisa "listo".

Supabase → proyecto **TannerOs** → Edge Functions → **Secrets** (Manage secrets) → Add new secret.

## A. Google (GA4 y Search Console) → secreto `GOOGLE_SERVICE_ACCOUNT_JSON`

1. Entra a https://console.cloud.google.com con la cuenta dueña de GA4.
2. Arriba, selector de proyecto → **New project** → nombre `tannery-city-tablero` → Create. No hace falta cuenta de facturación.
3. Menú → **APIs & Services → Library**. Busca y habilita:
   - **Google Analytics Data API**
   - **Google Search Console API**
4. Menú → **IAM & Admin → Service Accounts → Create service account**.
   - Nombre: `tablero-tannery`. Sin roles (Continue / Done).
   - Copia su correo (termina en `@tannery-city-tablero.iam.gserviceaccount.com`). Ese correo **no** es secreto.
5. Entra a la cuenta de servicio → pestaña **Keys → Add key → Create new key → JSON**. Se descarga un archivo.
   - Si Google dice que la creación de llaves está bloqueada por una política de la organización, avísale a Claude: es un bloqueo conocido y se resuelve con un ajuste de la política.
6. **GA4** (https://analytics.google.com) → Admin → en la propiedad **Tannery City - TannerOS** → Property access management → **+ → Add users** → pega el correo del paso 4 → rol **Viewer** → Add.
   Repite en la propiedad **Tannery City - Marketing**.
7. **Search Console** (https://search.google.com/search-console) → propiedad `tannerycity.com` → Settings → **Users and permissions → Add user** → el mismo correo → permiso **Restricted**.
8. Supabase → Secrets → Add new secret:
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: abre el archivo JSON del paso 5 con el Bloc de notas y pega **todo** su contenido.
9. Borra el archivo JSON de tu computadora y de Descargas.

## B. Meta (anuncios, Facebook e Instagram) → secreto `META_SYSTEM_USER_TOKEN`

1. Entra a https://business.facebook.com → **Configuración del negocio**.
2. Si no hay una app en **Cuentas → Apps**: ve a https://developers.facebook.com/apps → **Crear app** → tipo **Negocio** (Business) → conéctala a tu portafolio comercial de Tannery City.
3. **Usuarios → Usuarios del sistema → Agregar** → nombre `tablero-tannery` → rol **Empleado** (no administrador).
4. Con el usuario del sistema seleccionado → **Asignar activos**, sólo lectura:
   - Cuenta publicitaria **Tannery City Meta** (`1253862975729440`): ver rendimiento.
   - Páginas **Tannery City** y **TCP - Tannery City Park**: ver estadísticas.
   - Cuentas de Instagram **tannery_city** y **tannerycitypark**: ver estadísticas.
5. **Generar nuevo token** → elige la app del paso 2 → caducidad **Nunca** → marca sólo estos permisos:
   `ads_read`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights`.
6. Copia el token y pégalo directo en Supabase → Secrets:
   - Name: `META_SYSTEM_USER_TOKEN`
   - Value: el token.
7. Si Meta pide **revisión de la app** o **verificación del negocio** para algún permiso, no hace falta pelearse: avísale a Claude. Esa fuente quedará «bloqueada» con el motivo y, mientras tanto, se usan los reportes nativos de Meta.

## C. Lo que sí se le manda a Claude (nada secreto)

| Qué | Para qué |
|---|---|
| "Listo Google" + el correo de la cuenta de servicio | Verificar que el recolector lee GA4 y Search Console |
| "Listo Meta" | Verificar anuncios, Facebook e Instagram |
| Si Meta o Google mostraron algún aviso (captura de pantalla sin el token) | Diagnosticar un bloqueo |
| Fecha en que termina el trial de Windsor | Calendario de la semana en paralelo |

Al recibir el "listo", Claude dispara el recolector a mano, revisa qué fuentes
pasaron a «ok» y compara los números contra los paneles nativos.

## Para revocar

- Google: borrar la llave en la cuenta de servicio (Keys) o quitar al usuario en GA4/Search Console.
- Meta: Configuración del negocio → Usuarios del sistema → `tablero-tannery` → Revocar tokens.
- Supabase: borrar el secreto. La fuente queda «bloqueada» y el tablero la marca como no disponible.
