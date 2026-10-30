# www.tannerycity.com: instalación con GTM (GoDaddy)

www vive en GoDaddy Website Builder; no hay repo. No se tocan DNS ni registros de verificación.
Todo se hace en los paneles, con una persona con acceso.

## 1. GoDaddy: pegar el contenedor

1. GoDaddy → Sitio web → Editar → Configuración → Configuración del sitio → **Google Analytics / Código personalizado** (la sección "Cabecera" o "Head HTML").
2. Pegar el fragmento `<head>` de GTM `GTM-5H8QT73B` (Admin de GTM → Instalar Google Tag Manager).
3. **No** conectar también la integración nativa de Google Analytics ni de Facebook Pixel de GoDaddy: duplicaría eventos.
4. Si GoDaddy ofrece su propio banner de cookies, apagarlo y usar uno solo (paso 2).
5. Publicar el sitio.

## 2. GTM: consentimiento primero

| Pieza | Configuración |
|---|---|
| Plantilla de banner | Una CMP de la galería con Consent Mode v2 (p. ej. CookieYes o Cookiebot gratis), o una etiqueta HTML propia que guarde la decisión |
| Predeterminado | `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` = **denied** antes de cualquier etiqueta |
| Al aceptar | `update` a granted |
| Botones | "Aceptar" y "Sólo necesarias" con el mismo peso; enlace permanente "Cookies" en pie |

## 3. GTM: etiquetas

| Etiqueta | Tipo | Activador | Requiere consentimiento |
|---|---|---|---|
| GA4 config | Etiqueta de Google `G-H485DE37EF` | Inicialización – todas las páginas | `analytics_storage` |
| Meta base | HTML personalizado o plantilla "Facebook Pixel" `1477125554314319` | Todas las páginas | `ad_storage` |
| `click_whatsapp` | Evento GA4 + Meta `Contact` | Clic en enlace, URL contiene `wa.me` o `api.whatsapp.com` | ambos |
| `view_registration` | Evento GA4 + Meta `trackCustom ViewRegistration` | Vista de página del formulario de registro / clic en "Inscríbete" | ambos |
| `generate_lead` | Evento GA4 + Meta `Lead` | Envío de formulario **confirmado** (mensaje de éxito visible) | ambos |

Parámetros: sólo `link_id` / `form_id` fijos. Nunca variables con texto del formulario.

## 4. Versión y prueba

1. Vista previa (Tag Assistant) → confirmar que sin aceptar no se dispara ninguna etiqueta.
2. Aceptar → `page_view`, clic de WhatsApp → `click_whatsapp`.
3. Publicar con nombre "v1 medición www con consentimiento" y descripción.
4. Seguir [VERIFICACION.md](VERIFICACION.md).

## 5. Lo que GTM NO hace

- No va en app.tannerycity.com ni en tcp.tannerycity.com (ya tienen código directo).
- No instala Google Ads hasta tener ID AW- y etiqueta de conversión reales.
