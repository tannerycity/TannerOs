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
