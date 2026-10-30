# Checklist de privacidad

| # | Control | app staff | app tienda | tcp | www |
|---|---|---|---|---|---|
| 1 | Nada se carga antes de consentir | ✔ probado | ✔ probado | ✔ probado (E2E) | GTM con Consent Mode (por configurar) |
| 2 | Aceptar y rechazar con el mismo peso | ✔ | ✔ | ✔ | por configurar |
| 3 | Se puede cambiar la decisión | ✔ "Preferencias de analítica" | ✔ "Cookies" en pie | ✔ | por configurar |
| 4 | Revocar borra cookies | ✔ | ✔ | ✔ | por configurar |
| 5 | Sin Meta Pixel donde hay datos de menores | ✔ nunca | n/a | n/a | n/a |
| 6 | Sin PII en eventos (nombre, tel, correo, ids, montos individuales, salud) | ✔ lista blanca | ✔ | ✔ | revisar en GTM |
| 7 | Sin medición en familias, Tanner, visoría, registro | ✔ | — | — | — |
| 8 | URL real nunca enviada en áreas privadas | ✔ página sintética | ✔ query filtrado | ✔ | — |
| 9 | Google Signals apagado | ✔ | — | — | recomendado |
| 10 | Sin secretos en frontend | ✔ (IDs de medición son públicos por diseño) | ✔ | ✔ | ✔ |
| 11 | Conteo propio seudónimo y agregado | h55 (pendiente) | — | — | — |
| 12 | Conservación definida | GA4: configurar 14 meses; h55: 13 meses propuesto | GA4 14 meses | GA4 14 meses | GA4 14 meses |
| 13 | Aviso de privacidad menciona cookies y analítica | **✘ falta** | **✘ falta** | `[ABOGADO]` pendiente | revisar |

## Bloqueante: aviso de privacidad de TannerOS

El aviso actual (`aviso-de-privacidad/app.js`) no menciona cookies, analítica ni terceros
(Google, Meta). **No activar la medición en producción hasta que un abogado revise y apruebe
el texto.** Propuesta de redacción (borrador, `[ABOGADO]`; no se publicó):

> **Cookies y tecnologías de medición.** Con tu consentimiento, usamos Google Analytics
> (Google LLC) para entender cómo se usa la tienda y la plataforma, y Meta Pixel (Meta
> Platforms) sólo en la tienda pública, para medir la efectividad de nuestros anuncios.
> No los usamos en el portal de familias ni en ninguna pantalla con datos de jugadores.
> Puedes aceptar, rechazar o cambiar tu decisión en cualquier momento desde "Cookies" o
> "Preferencias de analítica". Al retirar tu consentimiento borramos esas cookies de tu
> navegador. Dichos proveedores pueden tratar datos fuera de México.
>
> **Uso de la plataforma por el personal.** Contamos de forma agregada qué módulos abre el
> personal del club, con un identificador seudónimo, para mejorar la herramienta. No
> registramos qué datos consulta ni a qué jugador corresponden. Conservamos estos conteos
> 13 meses.

Puntos para el abogado:
- Transferencia a Google y Meta (art. 36–37 LFPDPPP) y si requiere mención expresa.
- Si el conteo propio del staff (h55) necesita aviso laboral además del aviso general.
- Plazo de conservación (GA4 14 meses; h55 13 meses).

## Lo que nunca se hace

- Meta en áreas privadas o con menores.
- `user_id`, correo o teléfono hacia GA4/Meta.
- Activar Google Ads, presupuestos o campañas.
- Tokens de Windsor, api_secret de GA4 o tokens de CAPI en código público.
