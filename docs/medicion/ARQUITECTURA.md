# Arquitectura de medición

## Regla principal: un solo método por sitio

| Sitio | Método | GA4 | Meta Pixel | GTM | Por qué |
|---|---|---|---|---|---|
| www.tannerycity.com | GTM `GTM-5H8QT73B` | `G-H485DE37EF` (Marketing) | `1477125554314319` | Sí | GoDaddy no tiene repo; GTM es la única forma versionada de instalar y cambiar etiquetas. |
| tcp.tannerycity.com | gtag directo (código) | `G-H485DE37EF` (Marketing) | `1477125554314319` | **No** | Código revisado y probado en el repo; CSP estricto. |
| app.tannerycity.com/tienda | gtag + fbq directo | `G-KJN3NJS2YJ` (TannerOS) | `1477125554314319` | **No** | Igual; la tienda es parte de TannerOS. |
| app.tannerycity.com (staff) | gtag directo | `G-KJN3NJS2YJ` (TannerOS) | **Nunca** | **No** | Área privada con datos de menores. |
| app.tannerycity.com (familias, Tanner, visoría, registro) | Nada | — | — | — | Datos de menores; sin medición de terceros. |

GTM **no** se carga en app ni en tcp. Meter GTM además del código directo duplicaría cada evento.

Club y TCP comparten la propiedad de Marketing y se separan por la dimensión `hostname`
(`www.tannerycity.com` vs `tcp.tannerycity.com`). En GA4 conviene crear dos
comparaciones o grupos de canales por hostname (ver [VERIFICACION.md](VERIFICACION.md)).

## Flujo de consentimiento (los tres sitios)

```
carga de página
   └─ ¿hay decisión guardada?
        ├─ no  → banner (Aceptar / Sólo necesarias, mismo peso visual) → no se carga nada
        ├─ "no" → no se carga nada
        └─ "sí" → se inyecta gtag/fbq, se envían eventos permitidos
cambiar preferencias (enlace "Cookies" / "Preferencias de analítica")
   └─ revocar → se borran _ga, _gid, _gat, _fbp, _fbc → recarga sin scripts
```

Ninguna petición a Google o Meta sale antes de aceptar. Esto está cubierto por pruebas de
navegador en TannerOS (`qa-humo-medicion`) y en TCP (E2E "medición").

## TannerOS: dos capas de uso

| Capa | Qué mide | Quién | Dónde se guarda | Estado |
|---|---|---|---|---|
| GA4 de uso (`v2/analitica-uso.js`) | módulos, navegación, funciones, carga, errores por tipo | staff que acepta, en `app.tannerycity.com` | Google | En código |
| Conteo propio (h55) | aperturas por día y módulo, usuarios activos día/semana/mes | todo el staff (no Tanner, no familias) | Supabase, agregado; actor = sha256(uid:org:sal) | Aplicada (30/10/2026) |

Por qué dos capas: GA4 da embudos, dispositivos y tiempos, pero sólo cuenta a quien acepta.
h55 da el número completo y nunca sale del club. El resumen (`v2_usage_summary`) sólo lo ve
quien tiene el módulo Administración.

### Protecciones en GA4 de uso

- Catálogo cerrado de módulos (`MODULOS`, igual a `navItems` + `convocatoria`) y de funciones (`FUNCIONES`).
- Lista blanca de parámetros por evento (`PARAMETROS`); cualquier otro se tira.
- `page_location` sintético: `https://app.tannerycity.com/m/<modulo>`; nunca la URL real (que puede llevar ids).
- `allow_google_signals: false`, sin `user_id`.
- Errores sólo por tipo (`js`, `promesa`, `red`), nunca el mensaje.
- Sólo en el host oficial; en previews de Vercel o localhost no se envía nada.

### Tienda (corrección de #357)

- Rutas medibles: `/tienda`, `/tienda/<slug>`, `/pedido/`. Se excluyen `#/embajador`, `#/recibo` y `#/mis-pedidos`.
- Query permitido: `club`, `c`, `codigo`, `utm_*`, `fbclid`, `gclid`. Lo demás se quita.
- "Pedido creado" se envía como `store_order_placed` (GA4) y `OrderPlaced` personalizado (Meta), **no** como `purchase`.
- `purchase` sólo desde servidor con pago confirmado (pendiente; ver abajo).

## `purchase` desde servidor (propuesto, no implementado)

```
Mercado Pago webhook (pago aprobado)
   └─ edge function existente de pagos
        ├─ GA4 Measurement Protocol (api_secret en secretos de Supabase)
        │    client_id: el _ga guardado con el pedido SOLO si hubo consentimiento
        └─ Meta Conversions API (token en secretos de Supabase), event_id = folio (dedup)
```

Requiere crear el `api_secret` de GA4 y el token de CAPI. Ninguno va en el frontend.

## SEO técnico

| Sitio | robots | sitemap | noindex |
|---|---|---|---|
| app | Disallow `/v2/`, `/api/`, `/familias/` | público: portada, tienda, visoría, registro, aviso, centro Tanner, demo | `X-Robots-Tag: noindex, nofollow` en cada módulo del staff (vercel.json) |
| tcp | PR #12 | sólo `/` | ligas cortas y aviso pendiente |
| www | GoDaddy | lo genera GoDaddy | revisar en Search Console |

`qa-seo-tanneros` verifica que ningún módulo del menú quede sin noindex y que ninguna página
pública quede tapada.
