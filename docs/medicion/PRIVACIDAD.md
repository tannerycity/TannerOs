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
| 13 | Aviso de privacidad cubre esta medición | **✘ falta** (staff) | ✔ sección 11 (v2, 12/10/2026) | `[ABOGADO]` pendiente | revisar |

## Bloqueante: aviso de privacidad de TannerOS

El aviso vigente (versión 2, 12/10/2026, en `app.consent_documents`, código `privacidad`) ya
cubre la tienda en su sección 11: cookies, Pixel de Meta y etiqueta de Google con botones
"Aceptar" / "Solo lo necesario" y cambio desde "Cookies". **Lo que no cubre:**

1. La analítica de uso del personal (GA4 de TannerOS para staff que acepta) y el conteo propio
   agregado (h55). El aviso habla de familias y postulantes, no del personal en funciones.
2. La sección 4 ("Con quién los compartimos") no nombra a Google ni a Meta ni la posible
   transferencia fuera de México (la sección 11 sí los menciona).
3. La sección 11 dice "Google Ads"; hoy no se instala Ads. No es incorrecto informar de más,
   pero conviene "y, en su caso, Google Ads".

**No activar la analítica del staff en producción hasta que un abogado apruebe el texto.**
La tienda ya está cubierta. Propuesta de sección 12 (borrador, `[ABOGADO]`; no se publicó):

> **12. Uso de la plataforma por el personal del club.** Si formas parte del personal y nos
> das tu permiso con «Aceptar», usamos Google Analytics para entender qué módulos de la
> plataforma se usan y cómo cargan. Sólo enviamos el nombre del módulo y de la acción (por
> ejemplo «Taquilla · cobro registrado»), nunca tu nombre, tu correo ni datos de jugadores
> o familias, y no usamos el Pixel de Meta dentro de la plataforma. Puedes cambiar tu
> decisión en «Preferencias de analítica».
> Además contamos dentro de nuestro propio sistema cuántas veces se abre cada módulo por día,
> con un identificador seudónimo que no revela quién eres, para conocer cuánto se usa la
> plataforma. Conservamos estos conteos 13 meses.

Puntos para el abogado:
- Transferencias y remisiones a Google y Meta según la LFPDPPP vigente (publicada en 2025) y si requieren mención o consentimiento expreso.
- Si el conteo propio del staff (h55) necesita aviso laboral además del aviso general.
- Plazo de conservación (GA4 14 meses; h55 13 meses).

## Lo que nunca se hace

- Meta en áreas privadas o con menores.
- `user_id`, correo o teléfono hacia GA4/Meta.
- Activar Google Ads, presupuestos o campañas.
- Tokens de Windsor, api_secret de GA4 o tokens de CAPI en código público.
