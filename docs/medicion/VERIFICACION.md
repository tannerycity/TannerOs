# Verificación en producción (requiere acceso a las cuentas)

No se pudo hacer desde el contenedor: sin acceso a GA4, Meta, Search Console ni red hacia los dominios.

## GA4 DebugView

1. Instalar la extensión "Google Analytics Debugger" (o `?debug_mode=1` en Tag Assistant).
2. Abrir el sitio, aceptar cookies.
3. GA4 → Admin → DebugView. Esperado:

| Sitio | Propiedad | Debe aparecer | No debe aparecer |
|---|---|---|---|
| app tienda | TannerOS | `page_view`, `view_item`, `add_to_cart`, `store_order_placed` | `purchase`, nombres, teléfonos |
| app staff | TannerOS | `page_view` con `/m/<modulo>`, `tanner_module_opened`, `tanner_navigation`, `tanner_feature_used` | URL real, ids |
| tcp | Marketing | `page_view` hostname tcp, `click_whatsapp`, `reservation_interest`, `generate_lead` | texto del formulario |
| www | Marketing | `page_view` hostname www, `click_whatsapp`, `generate_lead` | — |

4. Rechazar → no debe aparecer nada nuevo.

## Meta Events Manager → Probar eventos

1. Pixel `1477125554314319` → Probar eventos → URL de la tienda / tcp / www.
2. Aceptar; esperado: `PageView`, `Contact`, `Lead`, `ViewContent`, `AddToCart`, `OrderPlaced`.
3. Confirmar que **no** llega nada desde app.tannerycity.com fuera de `/tienda` y `/pedido/`.
4. En Configuración del pixel: apagar "Coincidencia avanzada automática" (el código ya manda `autoConfig false`).

## GA4: ajustes de propiedad

- Retención de datos: 14 meses (ambas).
- Google Signals: apagado en TannerOS.
- Dimensiones personalizadas de [EVENTOS.md](EVENTOS.md).
- Eventos clave (Marketing): `click_whatsapp`, `generate_lead`, `reservation_interest`, `purchase`.
- Marketing: filtro de hosts no deseados (Admin → Flujos → Configurar → Lista de dominios no deseados) y comparaciones por `hostname` www vs tcp.

## Search Console (propiedad de dominio `tannerycity.com`, ya verificada)

1. Sitemaps → enviar `https://app.tannerycity.com/sitemap.xml` y `https://tcp.tannerycity.com/sitemap.xml` (tras fusionar tcp #12).
2. Inspección de URL: `https://app.tannerycity.com/club/` → debe decir "Excluida por la etiqueta noindex" tras desplegar.
3. Inspección: `https://app.tannerycity.com/tienda/` → indexable.
4. No tocar registros TXT/DNS de verificación.

## Google Ads

Customer ID 743-685-4864. Cuando se decida usarlo: vincular con GA4 Marketing desde GA4
(Admin → Vinculación de Google Ads) e importar eventos clave. No se crean campañas ni
presupuestos desde aquí.
