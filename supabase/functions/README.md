# Edge functions

Aquí vive el código de las funciones que corren en Supabase, no en Vercel.

## Esto NO se despliega solo

**No hay pipeline.** Cambiar un archivo de esta carpeta y mergear el PR *no*
publica nada: la función que atiende a los usuarios sigue siendo la última que
alguien desplegó a mano. Son dos pasos separados y hay que hacer los dos:

1. Cambiar el archivo aquí, con su PR y su revisión.
2. Desplegarlo a Supabase.

Si sólo haces el 1, el club sigue corriendo el código viejo. Si sólo haces el 2,
el repositorio miente sobre lo que está corriendo.

## Cómo verificar qué está corriendo

En el panel de Supabase, en Edge Functions, cada función muestra su versión y su
código. Si no coincide con lo que dice este repositorio, alguien hizo el 2 sin
el 1 (o al revés).

## staff-access

Crea y administra los accesos del club: llaves del staff, del portal de familias
y el reseteo de contraseñas.

Dos reglas que no hay que romper:

- **A un tutor no se le crea `organization_membership`.** Su cuenta existe sólo
  para el portal de familias; si tuviera membresía podría invocar los RPC
  internos del club aunque adivinara su nombre.
- **Los tutores se leen y escriben por RPC, nunca con `admin.from("guardians")`.**
  `app.guardians` vive en el esquema `app`, que no está expuesto a PostgREST: el
  cliente apunta a `public` por omisión y no la encuentra. Ese fue el motivo de
  que el portal de familias no se pudiera abrir para nadie, y el error salía
  como un "Unexpected error" que no decía nada.

Las tablas que sí viven en `public` (`profiles`, `organization_memberships`) sí
se pueden tocar con `admin.from(...)`.

## demo-login

La demo pública (`/demo/`): entra con un toque como Presidencia, Dirección
deportiva, Formador, Taquilla, Contabilidad o Familia a uno de los dos clubes
demo (con datos / recién dado de alta). Sin contraseña.

- Se despliega **sin verificación de JWT**: la usa quien todavía no tiene
  cuenta. Sólo abre sesión en las cuentas fijas `demo.<perfil>.<variante>@example.com`.
- Los clubes demo son de solo lectura (migración o4): el candado de la base
  frena cualquier escritura del staff, y `v2_my_modules` no da `can_write`,
  así que `staff-access` tampoco crea ni invita cuentas desde una demo.
