# Fuentes para Windsor.ai

Windsor se conecta desde su panel con OAuth de cada cuenta. **Ningún token va en el código**;
si hace falta una API key de Windsor para un tablero, se guarda en secretos del servidor.

| Fuente | Cuenta / ID | Estado | KPIs que habilita |
|---|---|---|---|
| GA4 Marketing | `G-H485DE37EF` | Conectar | sesiones, usuarios, fuentes/medios, `click_whatsapp`, `generate_lead`, `reservation_interest` por hostname (club vs TCP) |
| GA4 TannerOS | `G-KJN3NJS2YJ` | Conectar | tienda (embudo, pedidos colocados); uso del staff con consentimiento |
| Search Console | dominio `tannerycity.com` | Conectar | clics, impresiones, CTR, posición por página y consulta |
| Meta Ads / Pixel | pixel `1477125554314319` + cuenta publicitaria | Conectar (falta ID de cuenta publicitaria) | gasto, alcance, CPL, conversiones |
| Google Ads | `743-685-4864` | **No conectar aún** | gasto/CPC cuando haya campañas |
| Instagram / Facebook páginas | — | Falta ID | seguidores, alcance orgánico |
| Supabase (pedidos pagados, inscripciones, uso h55) | — | No vía Windsor | ingresos reales y uso total; leer con RPC/vista de solo lectura |

## Datos que faltan para conectar

1. ID de la cuenta publicitaria de Meta (act_…).
2. ID de las páginas de Facebook / Instagram del club y de TCP.
3. Decisión de quién es dueño de la conexión en Windsor (cuenta de Presidencia o de Marketing).
4. GA4 Measurement Protocol `api_secret` (sólo para `purchase` desde servidor; no es para Windsor).
