# 10 · Bloque A · evidencia de la corrección

Rama `claude/auditoria-saas-egress`. **No desplegado.** Este documento es la
prueba de que el Bloque A hace lo que el plan dice que hace.

## Lo que estaba mal

`canvas.toBlob(cb, 'image/webp', q)` **no devuelve `null`** cuando el navegador
no soporta WebP. El estándar HTML manda usar `image/png` y **ignorar la
calidad**. Los ocho archivos que subían fotos comprobaban `if (!blob)` — una
condición que nunca se cumple — así que guardaban un PNG creyendo que era un
WebP, y con extensión `.webp`.

La red de seguridad por peso no lo atrapaba porque el techo de la variante
grande era de **5 MB**: un PNG de 2.9 MB cabe de sobra.

## La medición

`scripts/qa-image-encode-browser.mjs` abre la misma foto sintética de celular
(3024×4032) en Chromium con el codificador viejo y con el nuevo, **cada uno con
sus techos reales**, y repite ambas corridas con `toBlob` parcheado para
comportarse como un Safari sin WebP.

| Navegador | Código | Variante grande | Miniatura | Total por foto |
|---|---|---|---|---|
| Con WebP | viejo (1600px / 5 MB) | `image/webp` 66 kB | 6 kB | **72 kB** |
| Con WebP | nuevo (1200px / 400 kB) | `image/webp` 45 kB | 6 kB | **51 kB** |
| **Sin WebP** | **viejo** | **`image/png` 2,886 kB, guardado como `.webp`** | 85 kB | **2,971 kB** |
| **Sin WebP** | **nuevo** | `image/jpeg` 87 kB | 8 kB | **95 kB** |

**97% menos peso** por foto subida desde un navegador sin WebP. El caso con
WebP también baja un 29%, por el techo más bajo y el lado de 1200px.

Los 2,886 kB medidos cuadran con la evidencia de producción de `02`: **48
originales PNG con 3,060 kB de media**. Es el mismo defecto, reproducido.

## Lo que se cambió

`v2/image-encode.js` (nuevo) concentra la codificación de los ocho módulos:

1. Pide WebP.
2. **Comprueba `blob.type`**, no sólo `!blob`. Un PNG silencioso se ve igual
   que un WebP bueno salvo por su tipo.
3. Si no es WebP, reintenta en JPEG con la misma calidad.
4. Si aun así pasa el techo, reintenta en JPEG con calidad −0.17.
5. La extensión sale del tipo real del blob, nunca de lo que se pidió.

Techos nuevos: grande **1200px / 400 kB**, miniatura **260px / 40 kB** (antes
1600px / 5 MB y 260px / 180 kB).

Convertidos al helper: `public-form.js`, `v2/jugadores/photos.js`,
`v2/scouting/app.js`, `v2/patrocinadores/app.js`, `v2/utileria/app.js`,
`v2/catalogo/app.js`, `v2/admin/fotos/app.js`.

`v2/admin/branding/app.js` queda fuera **a propósito**: genera los iconos de la
app, que deben ser PNG, y sube el original de la marca sin recomprimir.

## Las pruebas

**`scripts/qa-image-encode.mjs`** — 7 casos sobre un canvas falso que reproduce
el estándar (tipo no soportado → PNG, calidad ignorada). El caso decisivo usa
un PNG que **cabe** bajo el techo, para que la red de peso no lo tape y el
único que pueda detenerlo sea la comprobación del tipo.

Verificado contra las dos versiones del código:

```
=== contra el código ARREGLADO:
Image encode QA OK · 7 casos, incluido el PNG silencioso     (salida 0)

=== contra el código CON EL DEFECTO:
Image encode QA FAILED
 - un PNG que cabe en el techo tampoco se acepta como WebP:
   aceptó el PNG silencioso                                   (salida 1)
```

**Barrera en `scripts/qa-static.mjs`** — falla si cualquier archivo de cliente
pide `'image/webp'` sin importar el helper. Verificada con una regresión
deliberada:

```
- Egress: v2/utileria/app.js codifica a WebP sin el helper que
  verifica el tipo devuelto
```

**Las tres verificaciones obligatorias, en verde:**

```
TannerOS static QA OK · 37 pantallas · 30 rutas canónicas · assets /v2 protegidos
Image encode QA OK · 7 casos, incluido el PNG silencioso
Photo URL cache QA OK
```

## Lo que esta evidencia NO prueba

El plan pedía **probar en WebKit**, que es donde ocurre de verdad. **En este
entorno no hay WebKit instalado.** Lo que se midió es Chromium con `toBlob`
parcheado para comportarse como el estándar manda ante un tipo no soportado.

Eso reproduce **el mecanismo**, no **el navegador**. Antes de desplegar, alguien
debe subir una foto desde un iPhone real y confirmar que el archivo que llega a
Storage es `.jpg` y pesa menos de 400 kB. Hasta entonces el criterio 5 del
checklist sigue abierto.

## Lo que este bloque NO arregla

Los **48 PNG que ya están en Storage** (143 MB) siguen ahí. El Bloque A sólo
corrige las fotos **nuevas**. Los existentes son Bloque B, y no se borra nada
sin autorización.

## Reversión

`git revert` del commit. No toca base de datos, ni Storage, ni datos. Las fotos
subidas con el código nuevo siguen siendo legibles con el viejo: son JPEG y
WebP normales, con la extensión correcta.
