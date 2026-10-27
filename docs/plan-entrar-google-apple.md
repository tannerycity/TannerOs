# Plan: entrar con Google y Apple (portal de familias)

27/10/2026. Presidencia: "me gustaría que armaras el plan de entrar con Google y Apple".

## Resumen

Las familias hoy entran con usuario y contraseña. Su cuenta nace de la
invitación del club (`family-access` → `claim`) con un correo interno que la
familia no conoce. Por eso **no** conviene "entrar con Google" por coincidencia
de correo: el correo de Google no va a coincidir, y con Apple ("Ocultar mi
correo") casi nunca.

La propuesta: **vincular**. La familia entra una vez como hoy (o al aceptar la
invitación) y toca "Vincular Google" / "Vincular Apple". Desde ese momento, el
botón "Entrar con Google/Apple" de la pantalla de inicio la lleva a SU portal,
sin contraseña. Supabase lo hace con `linkIdentity`: la identidad de Google o
Apple se cuelga del mismo usuario, así que los permisos, los niños y los pagos
no cambian.

No se espera migración: el vínculo vive en `auth.identities` (lo maneja
Supabase) y el portal ya busca a la familia por `auth.uid()`.

## Pasos

| # | Qué | Quién | Dónde |
|---|-----|-------|-------|
| 1 | Crear el cliente OAuth "Web" (pantalla de consentimiento con nombre y escudo de Tannery City, dominio `app.tannerycity.com`) | Presidencia o Mich | Google Cloud Console → APIs y servicios → Credenciales |
| 2 | Pegar Client ID y Secret en Supabase y activar Google | Mich | Supabase → Authentication → Sign In / Providers → Google |
| 3 | Apple: App ID + **Services ID** (`com.tannerycity.app.web`), dominio y return URL; crear la llave "Sign in with Apple" (.p8) | Presidencia (cuenta Apple Developer, USD 99/año) | developer.apple.com → Certificates, IDs & Profiles |
| 4 | Pegar Services ID, Team ID, Key ID y la llave en Supabase y activar Apple. La llave .p8 caduca cada 6 meses: poner recordatorio | Mich | Supabase → Providers → Apple |
| 5 | Callback de los dos: `https://pacnegivzgxpanphrnwp.supabase.co/auth/v1/callback`. URLs permitidas: `https://app.tannerycity.com/familias/**` | Mich | Google/Apple y Supabase → URL Configuration |
| 6 | Activar **Manual linking** (permite `linkIdentity`) | Mich | Supabase → Authentication → Settings |
| 7 | Código: en "Mi cuenta" del portal, botones "Vincular Google" y "Vincular Apple" (`supabase.auth.linkIdentity({ provider })`), y la lista de lo vinculado con "Desvincular" (`unlinkIdentity`, sólo si queda otra forma de entrar) | Claude | `v2/familias/app.js` |
| 8 | Código: en el inicio de sesión, "Continuar con Apple" y "Continuar con Google" arriba de usuario y contraseña (`signInWithOAuth`, `redirectTo` al portal). Si entra alguien con Google/Apple que no está vinculado, se le cierra la sesión y se le dice: "Entra con tu usuario una vez y vincula tu cuenta en Mi cuenta" | Claude | `v2/familias/app.js` |
| 9 | CSP: nada nuevo (es una redirección completa, no un script) | — | `vercel.json` |
| 10 | Pruebas: suite de navegador con Supabase simulado (vincular, entrar vinculado, entrar sin vincular, desvincular el último método bloqueado) | Claude | `scripts/qa-humo-familias-oauth.mjs` |
| 11 | Aviso de privacidad: una línea "si eliges entrar con Google o Apple, recibimos tu nombre y correo de ese servicio sólo para identificarte" | Mich autoriza | `app.consent_documents` |

## Cuidados

- **Cuentas nuevas por OAuth:** se apaga el alta libre. Sólo entra quien ya
  tiene cuenta y la vinculó; nadie crea una familia "vacía" con su Google.
  Con el paso 8 esa sesión se cierra en seguida; además se revisa que
  Supabase no deje usuarios huérfanos y, si los deja, se limpian con
  `archivado` (sin borrar).
- **Staff:** primero sólo familias. Para staff se puede repetir después
  (mismo vínculo), pero con 2 pasos de verificación aparte.
- **Apple con correo oculto:** no importa, porque se vincula por sesión y no
  por correo.
- **"Mantener sesión":** ya se mantiene (Supabase guarda la sesión). Con
  Google/Apple, cuando caduque, entrar es un toque.

## Por qué te recomiendo esto

- Vincular evita el error típico: entrar con Google y caer en un portal vacío
  porque el correo no coincide.
- No toca permisos ni datos de los niños: es el mismo usuario con otra llave.
- Apple es obligatorio a futuro si TannerOS sale como app en la App Store y
  ofrece Google (regla de Apple), así que conviene hacerlo de una vez.

## Lo que necesito de ti

1. Acceso a Google Cloud (o que crees el cliente OAuth con los datos del paso 1).
2. Cuenta de Apple Developer (o confirmar si ya existe una de Skyrock/Tannery).
3. Tu "sí" para activar los proveedores en Supabase y publicar.
