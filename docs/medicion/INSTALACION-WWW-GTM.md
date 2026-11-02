# www.tannerycity.com: instalación con GTM (GoDaddy)

www vive en GoDaddy Website Builder; no hay repo. No se tocan DNS ni registros de verificación.
Todo se hace en los paneles, con una persona con acceso.

## 1. GoDaddy: pegar el contenedor

1. GoDaddy → Sitio web → Editar → Configuración → Configuración del sitio → **Google Analytics / Código personalizado** (la sección "Cabecera" o "Head HTML").
2. Pegar el fragmento `<head>` de GTM `GTM-5H8QT73B` (Admin de GTM → Instalar Google Tag Manager).
3. **No** conectar también la integración nativa de Google Analytics ni de Facebook Pixel de GoDaddy: duplicaría eventos.
4. Si GoDaddy ofrece su propio banner de cookies, apagarlo y usar uno solo (paso 2).
5. Publicar el sitio.

## 2. GTM: consentimiento primero (lo instalado el 02/11/2026)

Banner propio, gratis y sin terceros: [www/banner-cookies.html](www/banner-cookies.html)
(copia versionada; prueba `scripts/qa-humo-banner-www.mjs`). Se descartó CookieYes: su
liga lleva a una prueba de pago.

| Pieza | Configuración en GTM |
|---|---|
| Consentimiento | Admin → Configuración del contenedor → "Habilitar la vista general del consentimiento" |
| Etiqueta `Consentimiento - banner y predeterminado` | HTML personalizado con el banner; activador **Consent Initialization - All Pages**; sin consentimiento adicional |
| Predeterminado | `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` = denied |
| Decisión | Evento `tc_cookies` (`si` / `no`) al decidir y en cada página si ya se decidió |
| Enlace permanente | Cualquier enlace a `#cookies` (pie de página de GoDaddy) reabre el banner en la misma página |
| Revocar | Borra `_ga`, `_ga_*` y `_gid` del dominio y sus padres y recarga |

GoDaddy: banner de cookies propio **apagado**, "Seguimiento avanzado" **apagado**, campos
Google Analytics, Etiqueta de Google y Píxel de Meta **vacíos**; GTM conectado en
"Administrador de etiquetas de Google".

## 3. GTM: etiquetas

| Etiqueta | Tipo | Activador | Consentimiento |
|---|---|---|---|
| GA4 - Etiqueta de Google | Etiqueta de Google `G-H485DE37EF`, con `allow_google_signals=false`, `allow_ad_personalization_signals=false` y `cookie_expires=33696000` (390 días, ~13 meses; igual en todos los navegadores); "Una vez por página" | **Cookies decididas** (evento personalizado `tc_cookies`) | `analytics_storage` |
| GA4 - Evento click_whatsapp | Evento GA4 `click_whatsapp`, sin parámetros propios | **Clic WhatsApp** (Click URL coincide con `wa\.me\|whatsapp\.com`) | `analytics_storage` |
| `generate_lead` | Pendiente: falta saber cómo confirma el formulario de GoDaddy | — | — |
| Meta Pixel | **No instalado**. Si se instala: sólo páginas públicas, nunca registro o inscripción | — | `ad_storage` |

GA4 no se activa en "Initialization": el consentimiento llega después y GTM no reintenta;
por eso escucha `tc_cookies`.

GA4, flujo "Sitios Públicos" (02/11/2026): Medición mejorada sólo con páginas vistas,
desplazamientos y descargas; ocultar datos con correo y claves de URL
`tel,telefono,phone,nombre,name,email,correo`. Conservación: eventos 2 meses, usuario
14 meses desde la última actividad.

Probado en Vista previa el 02/11/2026: GA4 sólo tras "Aceptar"; "Sólo necesarias" lo
bloquea; revocar borra `_ga*`; enlace "Cookies" del pie reabre el banner. www no tiene
formularios de menores (las inscripciones van a TannerOS).

Pendiente antes de publicar: aviso aprobado por el abogado y su URL en `AVISO`.

## 4. Versión y prueba

1. Vista previa (Tag Assistant) → confirmar que sin aceptar no se dispara ninguna etiqueta.
2. Aceptar → `page_view`, clic de WhatsApp → `click_whatsapp`.
3. Publicar con nombre "v1 medición www con consentimiento" y descripción.
4. Seguir [VERIFICACION.md](VERIFICACION.md).

## 5. Lo que GTM NO hace

- No va en app.tannerycity.com ni en tcp.tannerycity.com (ya tienen código directo).
- No instala Google Ads hasta tener ID AW- y etiqueta de conversión reales.
