# 11 · Bloque B · egress de lo que ya existe

Rama `claude/auditoria-saas-egress`. **No desplegado. No se ejecutó ninguna
conversión: no se descargó ni una foto de producción.**

El Bloque A arregló las fotos **nuevas**. El Bloque B es lo que ya está subido y
lo que se vuelve a bajar sin necesidad.

## Resumen de lo que se hizo

| Paso | Qué | Estado |
|---|---|---|
| B1+B2 | Miniatura y original aligerado **en una sola pasada** | Herramienta lista · **falta correrla** |
| B3a | Las 6 firmas de foto sueltas pasan por el caché compartido | Aplicado |
| B3b | Un solo `Cache-Control` para las 15 subidas del sistema | Aplicado |
| B4 | `/v2/` deja de ser `no-store` | Aplicado |
| B3c | Que los bytes de una foto sobrevivan a cerrar la pestaña | Aplicado · 24 h, se borra al salir |

## B1 + B2 · una pasada, no dos

El plan las tenía separadas: primero generar las 46 miniaturas que faltan,
después convertir los 48 PNG. **Eso obligaba a descargar el padrón dos veces.**

Las dos necesitan exactamente lo mismo: la foto original, decodificada. Así que
`v2/admin/fotos` hace las dos en el mismo paso, con **una descarga por foto**.

### Primero revisar, que es gratis

`supabase.storage.list()` devuelve el **tipo real y el peso** de cada archivo
sin descargarlo. La pantalla lo usa para decir, antes de gastar un solo MB,
cuántas fotos hay que arreglar y **cuánto costaría**.

Verificado en navegador: la revisión leyó 3 carpetas y descargó **0 bytes** de
imagen. El botón de procesar arranca deshabilitado y dice «Revisa primero».

### Qué se considera «hay que arreglarla»

| Condición | Qué se genera |
|---|---|
| No tiene miniatura | Miniatura |
| El original es `image/png` | Original nuevo + miniatura |
| El original pasa de 400 kB | Original nuevo + miniatura |
| Nada de lo anterior | **Nada.** No se toca |

Una foto que ya es WebP y cabe en el techo **se queda como está**:
recomprimirla sólo perdería calidad a cambio de nada.

### Nunca borra

El original nuevo va a una **ruta nueva** (`-opt<stamp>`), el padrón apunta ahí,
y el archivo viejo **se queda en Storage**. Al terminar, la pantalla lista los
archivos que quedaron sin uso para que alguien decida aparte.

El egress baja de inmediato —nadie vuelve a pedir el PNG— aunque el
almacenamiento no. Esa es la parte segura del trato: si algo sale mal, el
archivo viejo sigue ahí.

### Verificado de punta a punta, en navegador

Padrón de prueba: p1 sin miniatura y con PNG de 3.1 MB, p2 con miniatura pero
PNG de 2.9 MB, p3 WebP sano de 198 kB.

```
tras revisar : con foto 3 · se ven como iniciales 1 · original pesado 2
               "descarga cada foto una sola vez: 5.7 MB en total"
               3 carpetas leídas · 0 bytes de imagen descargados

tras procesar: Listas las 2 fotos. Descargados 0.8 MB, subidos 0.1 MB.
  p1  original 393 kB → 26 kB · miniatura 4 kB
  p2  original 393 kB → 26 kB · miniatura 4 kB

subidas:
  .../p1/profile-1756000000000-opt<stamp>.webp        26 kB  cache=31536000
  .../p1/profile-1756000000000-opt<stamp>-thumb.webp   4 kB  cache=31536000
  .../p2/profile-1756000001000-opt<stamp>.webp        26 kB  cache=31536000
  .../p2/profile-1756000001000-opt<stamp>-thumb.webp   4 kB  cache=31536000

borrados : NINGUNO
huérfanos reportados: 3 rutas
p3 (WebP sano): no se tocó
```

### Lo que falta: correrla

**No se ejecutó contra producción.** Correrla completa descarga ~143 MB una
vez, y el plan dice esperar al **22 de septiembre**, cuando se restablece la
cuota. La pantalla permite hacerlo por lotes justamente para no gastarlo de
golpe.

## B3a · seis firmas que se escapaban del caché

El contrato de egress de Codex dice que toda URL firmada sale de
`v2/photo-cache.js`. **Seis archivos firmaban por su cuenta:**

`v2/tanner/app.js`, `v2/patrocinadores/app.js`, `v2/utileria/app.js`,
`v2/prospectos/app.js`, `v2/jugadores/photos.js`, `v2/programas/app.js`.

Importa porque el navegador cachea por **URL completa, token incluido**: una
firma nueva es una descarga nueva aunque los bytes sean idénticos. Cada uno
conserva su comportamiento anterior ante un error (unos devuelven vacío, otros
lanzan); lo único que cambia es por dónde pasan.

`qa-static.mjs` ahora rechaza cualquier `createSignedUrl` fuera del caché.
Verificado con una regresión deliberada:

```
- Egress: v2/tanner/app.js firma una foto fuera del caché compartido
```

## B3b · un solo Cache-Control

Las 15 subidas del sistema declaraban `'3600'` a mano (branding, `'31536000'`).
Ahora salen todas de `UPLOAD_CACHE_CONTROL` en `v2/image-encode.js`, con
`qa-static.mjs` rechazando cualquier literal suelto.

Un año es seguro porque **las rutas son inmutables**: llevan un `Date.now()` y
se suben con `upsert:false`. Una foto nueva es siempre una ruta nueva; nadie
sobreescribe bytes bajo una ruta que un navegador ya guardó.

**Honestidad sobre el ahorro: por sí solo, esto ahorra poco.** Ver B3c.

## B4 · `/v2/` deja de ser `no-store`

`no-store` le prohíbe al navegador **guardar** el archivo. Cada vez que un profe
entra a una pantalla vuelve a bajar todo el JavaScript, aunque no haya cambiado
nada. Con `no-cache` lo guarda y **revalida**: si no cambió, el servidor
contesta `304` sin cuerpo.

No hay riesgo de quedarse con una versión vieja: `no-cache` obliga a preguntar
siempre. Un despliegue se ve al instante, igual que hoy.

Medido sobre un recorrido de 5 pantallas (familias, jugadores, asistencia,
taquilla, calendario), comprimido con brotli como lo sirve Vercel:

| | Peso |
|---|---:|
| Hoy, con `no-store` | **168 kB** cada vuelta |
| Con `no-cache`, primera vuelta | 108 kB |
| Con `no-cache`, siguientes vueltas | ~4 kB de `304` sin cuerpo |

**98% menos en la segunda vuelta**, y se siente en la velocidad de abrir una
pantalla desde el celular en la cancha.

**Ojo con la cuenta:** esto es egress de **Vercel**, no de Supabase. **No mueve
ni un byte de los 11.87 GB.** Es velocidad percibida y factura de Vercel.

`qa-static.mjs` rechaza que `/v2/` vuelva a `no-store`.

## B3c · que la foto no se vuelva a bajar en cada visita

Este era el ahorro grande, y el que hacía falta decidir. Mich pidió el mejor
resultado para las familias y el staff, así que se tomó el camino que ahorra sin
alargar la vida de una URL firmada ni un minuto.

### El problema

Las fotos viven en un **bucket privado** y se sirven con **URL firmada**:

1. El token dura **1 hora**.
2. El navegador cachea por URL completa, **token incluido**.
3. `photo-cache.js` reusaba la URL 50 minutos, y en `sessionStorage`: **se
   borraba al cerrar la pestaña.**

Una mamá que abría el portal en la mañana y otra vez en la tarde **descargaba la
foto de su hijo dos veces**. Un profe que abría Asistencia cinco veces al día
bajaba las 50 miniaturas cinco veces.

### La solución

Los bytes ahora se guardan bajo la **ruta** del archivo, no bajo su URL. La ruta
no cambia nunca —lleva un `Date.now()` y se sube con `upsert:false`—, así que
**un token nuevo ya no cuesta una descarga nueva**.

| | Antes | Ahora |
|---|---|---|
| Vida del token | 1 hora | **1 hora, igual** |
| Dónde vive el caché | `sessionStorage` | Cache API, en disco |
| Qué guarda | La URL | Los bytes, bajo la ruta |
| Cuánto dura | 50 minutos | 24 horas |
| Al cerrar sesión | — | **Se borra todo** |

**Lo que NO se hizo, a propósito:** alargar el token. Era la opción más fácil de
programar, y la que peor se paga: una URL que se filtrara —una captura, el
historial de una compu compartida, un link reenviado— daría acceso a la foto de
un menor durante días. La regla 5 del contrato de Codex es «privacidad antes que
ahorro», y aquí se respeta al pie de la letra.

Se borra en los **cuatro** puntos de salida del sistema: el vestidor
(`v2/shell.js`), el portal de familias (dos), y la sesión pendiente
(`v2/app.js`).

### Verificado en navegador de verdad

Misma foto, tres visitas, **un token distinto en cada una**:

```
1ª visita : blob:...  · descargas hasta aquí: 1
2ª visita : blob:...  · descargas hasta aquí: 1
3ª visita : blob:...  · descargas hasta aquí: 1

cerrar sesión: caches ['tanneros-fotos-v1'] → []  · sessionStorage 0
```

Una descarga, tres visitas, tokens rotando. Antes eran tres descargas.

### Un defecto que sólo se vio en el navegador

El primer intento cortaba la descarga por las cabeceras cuando el archivo
pasaba de 1 MB, para no llenar la cuota del navegador con un original heredado
de 3 MB. **En Chromium salió peor:** el cuerpo ya venía en camino cuando se
cancelaba, y después la etiqueta `<img>` lo volvía a pedir.

```
peticiones a la foto de 3 MB: 2 · bytes transferidos: 6,291,456
```

**6 MB por una foto de 3 MB.** Las pruebas unitarias pasaban; sólo lo vio el
navegador. Ahora se descarga una sola vez pase lo que pase, y el peso decide
únicamente si además se guarda en disco.

```
peticiones a la foto de 3 MB: 1 · bytes transferidos: 3,145,728
```

### Los topes

| Tope | Valor | Por qué |
|---|---|---|
| Se guarda en disco | ≤ 1 MB | Miniaturas y fotos optimizadas sí; un original heredado no llena la cuota |
| Vive en memoria | 120 fotos | Una URL de blob retiene sus bytes; lo que se desaloja ya se pintó |
| Dura | 24 horas | Cubre el día de una familia sin dejar la foto ahí una semana |

La pantalla de mantenimiento suelta cada original en cuanto lo recodifica
(`forgetPhoto`), para que un lote grande no deje vivos cientos de MB.

### Las pruebas

`scripts/qa-photo-cache.mjs` pasó de 1 caso a **8**, y se verificó que
**fallan contra el código viejo** —cuatro de ellas—, no sólo que pasan contra el
nuevo:

```
=== contra el código VIEJO (sin caché de bytes):
 - con Cache API los bytes se bajan una vez y se sirven desde el disco
 - un token nuevo no cuesta una descarga nueva            (0 !== 1)
 - los bytes caducan al día y se vuelven a pedir
 - al cerrar sesión no queda ni un byte de la foto en el aparato
Photo URL cache QA FAILED

=== contra el código NUEVO:
Photo URL cache QA OK · 8 casos, incluido el token que rota
```

También se verificó que **sin Cache API** —Node, modo privado, contexto no
seguro— el módulo se comporta **exactamente como antes**: devuelve la URL
firmada y todo sigue funcionando.

### Y el service worker

`sw.js` borraba **todos** los cachés menos el suyo en cada activación, así que
habría barrido el de fotos en cada arranque. Ahora respeta los que empiezan con
`tanneros-fotos-`.

## Humo: las 17 pantallas que tocan fotos

Cargadas en Chromium con el cliente de Supabase sustituido —el shell, el
`app.js`, el markup y el CSS son los de verdad—, ninguna con errores:

```
✓ tanner        ✓ patrocinadores  ✓ utileria     ✓ prospectos
✓ jugadores     ✓ programas       ✓ catalogo     ✓ scouting
✓ admin/fotos   ✓ admin/branding  ✓ registro     ✓ familias
✓ asistencia    ✓ calendario      ✓ taquilla     ✓ inicio
✓ mi-academia
```

## Reversión

| Paso | Cómo |
|---|---|
| B1+B2 | Aditivo: sube archivos nuevos, no borra ninguno. El padrón se puede reapuntar al original viejo, que sigue ahí |
| B3a, B3b, B4, B3c | `git revert` del commit. No tocan datos ni Storage |

## Lo que este bloque NO hizo

- **No se corrió la conversión.** Los 48 PNG siguen siendo los que sirve el
  padrón. Esperan al 22 de septiembre.
- **No se borró nada de Storage.** Los 143 MB siguen ocupados.
- **No se desplegó.**
- **No se probó en un iPhone real.** El caché de bytes usa la Cache API, que
  Safari soporta desde hace años, y el módulo cae con elegancia si no está.
  Aun así, alguien debería abrir el portal desde un iPhone dos veces y confirmar
  que la foto aparece al instante la segunda.
