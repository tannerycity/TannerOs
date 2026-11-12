# vendor/

Código de terceros copiado al repositorio a propósito.

Este repositorio **no tiene `package.json`**: es un sitio estático de módulos
ES servidos tal cual, sin build ni instalación. Eso es una decisión, no un
descuido — no hay paso de compilación que pueda romperse ni versiones que se
desincronicen entre tu máquina y producción.

Cuando hace falta una pieza de terceros, se copia aquí, con su cabecera de
licencia intacta y anotada abajo. Nada en `vendor/` se edita: si hay que
actualizarlo, se vuelve a copiar la versión nueva.

| Archivo | Versión | Licencia | De dónde | Para qué |
|---|---|---|---|---|
| `qrcode.mjs` | qrcode-generator 2.0.4 | MIT · © 2009 Kazuhiko Arase | https://www.npmjs.com/package/qrcode-generator | El QR de la credencial Tanner |
| `supabase-js.mjs` | @supabase/supabase-js 2.116.0 | MIT · © Supabase | https://www.npmjs.com/package/@supabase/supabase-js | El cliente de la base (lo importa sólo `v2/supabase-client.js`) |
| `jspdf.mjs` | jspdf 2.5.2 | MIT · © James Hall y colaboradores | https://www.npmjs.com/package/jspdf | Recibos, estados de cuenta y el PDF del proveedor |
| `libphonenumber-js.mjs` | libphonenumber-js 1.11.20 (`/max`) | MIT · © Nikolay Kuchumov | https://www.npmjs.com/package/libphonenumber-js | Validar y dar formato a los teléfonos de los formularios |
| `xlsx.mjs` | xlsx (SheetJS CE) 0.18.5 | Apache-2.0 · © SheetJS LLC | https://www.npmjs.com/package/xlsx | Leer el Excel al importar jugadores |

## Por qué estas cuatro ya no se piden a un CDN (11/11/2026)

Se pedían a `esm.sh` desde el navegador. Ese código corre con la sesión de
quien está usando TannerOS: si el CDN se cae, la app no abre; si lo
comprometen, puede leer lo que ve el staff. Ahora son copias propias, la CSP
de `vercel.json` ya no permite scripts de `esm.sh` y `qa-static.mjs` truena si
alguien vuelve a importar código desde otro sitio.

Cómo se generaron (en una carpeta temporal, fuera del repo):

```
npm i @supabase/supabase-js@2.116.0 jspdf@2.5.2 libphonenumber-js@1.11.20 xlsx@0.18.5 esbuild
npx esbuild entrada.mjs --bundle --format=esm --minify --platform=browser --target=es2020 --legal-comments=eof --outfile=vendor/<nombre>.mjs
```

Cada `entrada.mjs` sólo reexporta lo que usa el sitio (`createClient`,
`jsPDF`, las cuatro funciones de teléfonos, `export * from 'xlsx'`). En jsPDF
se dejan fuera `canvg`, `html2canvas` y `dompurify`: sólo los pide
`doc.html()` y `addSvgAsImage()`, que TannerOS no usa. Las licencias van al
final de cada archivo. `scripts/qa-humo-vendor.mjs` prueba las cuatro.


## Por qué este no se escribió a mano

Un generador de QR tiene corrección de errores Reed-Solomon, ocho patrones de
máscara y tablas de versión. Escribirlo es posible; **probarlo** es el
problema: sin un decodificador de verdad, lo único que se puede comprobar es
que salió un cuadro con puntos. Un QR que parece QR y no escanea es peor que
no tener QR, porque el de la portería confía en él.

Así que se usa una implementación con quince años de uso, y se verifica de
extremo a extremo decodificando los píxeles que de verdad se dibujan
(`scripts/vista-credencial.mjs`, con `jsqr`).

## Cómo se carga

`welcome-card.js` lo trae con `import()` dinámico, sólo cuando de verdad va a
dibujar un QR. Quien abre el formulario de registro y no lo termina nunca
descarga estos 52 KB.
