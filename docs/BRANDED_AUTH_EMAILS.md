# Correos de acceso · Tannery City

## Invitación

- Asunto: `Bienvenido al vestidor · Tannery City`
- Template: `supabase/templates/invite.html`
- Remitente recomendado: `Tannery City <acceso@tannerycity.com>`
- Dominio de envío recomendado: `acceso.tannerycity.com`

El template conserva `{{ .ConfirmationURL }}` y usa `{{ .Data.role_label }}`, enviado desde la función protegida `staff-access`.

## Activación necesaria

Este proyecto Supabase fue creado el 21 de junio de 2026 en el plan Free. Los proyectos Free nuevos no pueden personalizar templates usando el SMTP predeterminado de Supabase. Para activar este correo:

1. Verificar un dominio o subdominio de Tannery City en un proveedor transaccional.
2. Conectar su SMTP a Supabase Auth.
3. Configurar nombre y correo remitente.
4. Pegar el asunto y el HTML del template de invitación.
5. Enviar una prueba a una dirección controlada y revisar Inbox/Spam.

Nunca subir llaves SMTP o API al repositorio.
