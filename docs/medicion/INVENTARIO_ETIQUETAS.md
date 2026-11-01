# Inventario de etiquetas

| Etiqueta | ID | Dónde | Cómo se instala | Cuándo carga | Estado 30/10/2026 |
|---|---|---|---|---|---|
| GA4 TannerOS | `G-KJN3NJS2YJ` (propiedad 561403621) | app.tannerycity.com/tienda y /pedido | `v2/medicion.js` (gtag directo) | Sólo con «Aceptar» | Publicada; 0 datos aún |
| GA4 TannerOS (staff) | `G-KJN3NJS2YJ` | módulos del staff | `v2/analitica-uso.js` | Apagada (`GA4_STAFF_HABILITADO = false`) | Espera aviso con sección del personal |
| Meta Pixel | `1477125554314319` | app.tannerycity.com/tienda y /pedido | `v2/medicion.js` (fbq directo, `autoConfig` apagado) | Sólo con «Aceptar» | Publicada |
| Meta Pixel | `1477125554314319` | tcp.tannerycity.com (portada pública) | `src/sitio/analitica.js` (tcp-app #13) | Sólo con aviso aprobado y «Aceptar» | Sin publicar |
| GA4 Marketing | `G-H485DE37EF` (propiedad 561548928) | tcp.tannerycity.com | `src/sitio/analitica.js` (tcp-app #13) | Igual que arriba | Sin publicar |
| GA4 Marketing + Meta | `G-H485DE37EF`, `1477125554314319` | www.tannerycity.com | GTM `GTM-5H8QT73B` en GoDaddy | Consent Mode, denegado por defecto | No verificable desde la sesión |
| Google Ads | Cliente 743-685-4864 | — | — | — | Cuenta no habilitada; sin etiqueta AW- (no se inventa) |
| Conteo propio (h55) | — | módulos del staff | `v2_usage_ping` (Supabase) | Siempre (no sale del club) | Aplicada; sin terceros |

Nunca hay dos mecanismos para la misma etiqueta en el mismo sitio. GTM sólo en www.

## Snippet oficial de GTM (para contrastar el de GoDaddy)

Debe haber exactamente esto. Un solo contenedor, y ningún `gtag.js` adicional con `G-H485DE37EF` en la página (si lo hay, GA4 se cuenta doble).

```html
<!-- en <head>, lo más arriba posible -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5H8QT73B');</script>

<!-- justo después de abrir <body> -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5H8QT73B"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
```

Antes del contenedor, el valor por defecto de Consent Mode (todo `denied`). Detalle en INSTALACION-WWW-GTM.md.

## Cookies de terceros

| Cookie | De | Para | Dónde |
|---|---|---|---|
| `_ga`, `_ga_<id>`, `_gid`, `_gat` | Google Analytics | Distinguir visitantes y sesiones | tienda (con «Aceptar»); TCP/www cuando se publiquen |
| `_fbp`, `_fbc` | Meta | Medir anuncios | tienda (con «Aceptar»); TCP/www cuando se publiquen |

Al retirar el permiso, TannerOS y TCP las borran del navegador.
