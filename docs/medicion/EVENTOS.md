# Matriz de eventos

Estado: **C** = en código y probado · **P** = pendiente (requiere algo externo) · **G** = se configura en GTM (www)

## Marketing (www + tcp → GA4 `G-H485DE37EF`, Meta `1477125554314319`)

| Evento GA4 | Cuándo | Parámetros | Meta | www | tcp | Conversión clave |
|---|---|---|---|---|---|---|
| `page_view` | carga de página con consentimiento | `page_location` (sólo utm/fbclid/gclid), `page_title` | `PageView` | G | C | No |
| `click_whatsapp` | clic en un enlace `wa.me` / `api.whatsapp.com` | `link_id` (clave fija del enlace) | `Contact` | G | C | Sí |
| `view_registration` | abrir formulario de registro / lista de espera | `link_id` | `ViewRegistration` (custom) | G | C | No |
| `generate_lead` | alta nueva confirmada (no repetida) en lista de espera / formulario | `form_id` | `Lead` | G | C | Sí |
| `reservation_interest` | clic en "reservar" (cancha, evento) | `link_id` | `ReservationInterest` (custom) | — | C | Sí |
| `purchase` | **sólo** pago confirmado | `transaction_id`, `value`, `currency` | `Purchase` | — | P | Sí |

Separación club / TCP: dimensión `hostname`. Nunca se envían nombre, teléfono, correo ni texto libre.

## Tienda (app/tienda → GA4 `G-KJN3NJS2YJ`, Meta `1477125554314319`)

| Evento GA4 | Cuándo | Meta | Estado |
|---|---|---|---|
| `page_view` | rutas medibles de la tienda | `PageView` | C |
| `view_item` | ver un producto | `ViewContent` | C |
| `add_to_cart` | agregar al carrito | `AddToCart` | C |
| `begin_checkout` | abrir el pedido | `InitiateCheckout` | C |
| `store_order_placed` | pedido creado (pago no confirmado) | `OrderPlaced` (custom) | C |
| `purchase` | pago confirmado (servidor) | `Purchase` (CAPI) | P |

## Uso de TannerOS (staff → GA4 `G-KJN3NJS2YJ`, sin Meta)

| Evento | Cuándo | Parámetros permitidos | Estado |
|---|---|---|---|
| `page_view` | abrir un módulo | `page_location` sintético `/m/<modulo>`, `page_title` | C |
| `tanner_module_opened` | abrir un módulo | `module_name` | C |
| `tanner_navigation` | pasar de un módulo a otro | `from_module`, `to_module` | C |
| `tanner_feature_used` | acción clave completada | `module_name`, `feature` | C |
| `tanner_screen_load` | pantalla lista | `module_name`, `load_ms` (redondeado a 100, tope 60 s) | C |
| `tanner_error` | error JS / promesa / red | `module_name`, `error_type` | C |

### Funciones instrumentadas (`feature`)

| `feature` | Módulo | Momento | Estado |
|---|---|---|---|
| `cobro_registrado` | taquilla | tras `v2_post_payment` OK | C |
| `asistencia_guardada` | asistencia | tras `v2_save_attendance` OK | C |
| `pedido_enviado_proveedor` | pedidos | tras `v2_create_production_batch` OK | C |
| `llegada_visoria` | visorias | tras registrar llegada | C |
| `evaluacion_guardada`, `pedido_entregado`, `identidad_verificada`, `aviso_publicado`, `mensaje_enviado`, `busqueda`, `exportar` | varios | en catálogo, sin instrumentar todavía | P |

Agregar una función nueva = agregarla a `FUNCIONES` en `v2/analitica-uso.js` y llamar `usaFuncion('<feature>')` tras el éxito.

## Conteo propio (h55, sin Google)

| RPC | Quién | Qué guarda |
|---|---|---|
| `v2_usage_ping(org, module)` | staff autenticado (no Tanner) | +1 apertura (org, día, módulo) y actor seudónimo |
| `v2_usage_summary(org, days)` | módulo Administración | DAU por día, WAU, MAU, usuarios del periodo y anterior, uso por módulo |

## Dimensiones personalizadas a registrar en GA4 (Admin → Definiciones personalizadas)

| Propiedad | Dimensión (ámbito evento) |
|---|---|
| TannerOS | `module_name`, `from_module`, `to_module`, `feature`, `error_type` |
| TannerOS | métrica `load_ms` (milisegundos) |
| Marketing | `link_id`, `form_id` |
