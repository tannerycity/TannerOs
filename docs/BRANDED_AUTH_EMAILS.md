# Correos de acceso · Mi Club FC (y TannerOS para Tannery)

## Invitación

- Asunto: `Tu acceso a tu club en Mi Club FC`
- Una sola plantilla para todos los clubes (22/11/2026): el nombre del club sale de `{{ .Data.brand_name }}` (lo manda `staff-access`); dice TannerOS sólo si el club es Tannery City y Mi Club FC para los demás. Sin logo fijo de ningún club.
- Template: `supabase/templates/invite.html`
- Remitente recomendado: `Mi Club FC <acceso@DOMINIO-DE-MI-CLUB-FC>` (cuando exista el dominio)
- Dominio de envío por verificar: el de Mi Club FC

El template conserva `{{ .ConfirmationURL }}` y usa `{{ .Data.role_label }}`, enviado desde la función protegida `staff-access`.

## Activación necesaria

Este proyecto Supabase fue creado el 21 de junio de 2026 en el plan Free. Los proyectos Free nuevos no pueden personalizar templates usando el SMTP predeterminado de Supabase. Para activar este correo:

1. Verificar un dominio o subdominio de Tannery City en un proveedor transaccional.
2. Conectar su SMTP a Supabase Auth.
3. Configurar nombre y correo remitente.
4. Pegar el asunto y el HTML del template de invitación.
5. Enviar una prueba a una dirección controlada y revisar Inbox/Spam.

Nunca subir llaves SMTP o API al repositorio.
