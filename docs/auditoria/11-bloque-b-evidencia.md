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
| B3c | Que los bytes de una foto sobrevivan a cerrar la pestaña | **Decisión pendiente · abajo** |

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

## B3c · la decisión que falta

Subir el `Cache-Control` a un año no sirve de mucho solo, y hay que decirlo
claro. Las fotos viven en un **bucket privado** y se sirven con **URL firmada**:

1. El token dura **1 hora**.
2. El navegador cachea por URL completa, token incluido.
3. `photo-cache.js` reusa la URL 50 minutos, y en `sessionStorage`: **se borra
   al cerrar la pestaña.**

Resultado: una mamá que abre el portal hoy en la mañana y otra vez en la tarde
**descarga la foto de su hijo dos veces**. Siempre.

Las dos formas de arreglarlo, y por qué no elegí solo:

| Camino | Ahorro | Qué se paga |
|---|---|---|
| **Alargar el token** (1 h → 1 o 7 días) | Alto | Una URL que se filtre sirve días, no una hora |
| **Guardar los bytes por ruta** (Cache API), token intacto | Alto | La foto del niño queda guardada en el navegador aunque cierre sesión |

Las dos guardan por más tiempo algo privado: fotos de menores. La regla 5 del
contrato de Codex es **«privacidad antes que ahorro»**, así que esto no se
decide solo.

**Mi recomendación:** el segundo camino, con vida de **24 horas** y borrado al
cerrar sesión. Captura el patrón real —la misma mamá entrando varias veces el
mismo día— sin alargar la vida del token ni un minuto, y la foto se va del
dispositivo cuando ella sale. Falta el sí de Mich.

## Reversión

| Paso | Cómo |
|---|---|
| B1+B2 | Aditivo: sube archivos nuevos, no borra ninguno. El padrón se puede reapuntar al original viejo, que sigue ahí |
| B3a, B3b, B4 | `git revert` del commit. No tocan datos |

## Lo que este bloque NO hizo

- **No se corrió la conversión.** Los 48 PNG siguen siendo los que sirve el
  padrón. Esperan al 22 de septiembre.
- **No se borró nada de Storage.** Los 143 MB siguen ocupados.
- **No se desplegó.**
- **B3c no está implementado**, y es donde está el ahorro grande de Supabase.
