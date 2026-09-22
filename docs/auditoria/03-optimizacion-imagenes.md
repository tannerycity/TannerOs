# 03 · Arquitectura de imágenes

## Usos reales, medidos en el código

Antes de elegir tamaños hay que saber dónde se muestra una foto. Esto sale de
leer las pantallas, no de suponer:

| Uso | Dónde | Caja real | Variante |
|---|---|---|---|
| Avatar en lista | `jcard-photo` (Jugadores), pestañas del portal | 44–58 px | **thumb 260px** |
| Fila de asistencia | `photo-box tiny` | 34 px | **thumb 260px** |
| Tarjeta de producto | `fam-shot` (tienda) | ~180 px | **thumb 260px** |
| Ficha / perfil | `fam-hero-photo`, `photoBox` | 96–104 px | **thumb 260px** |
| Credencial y PDF | impresión | hasta 600 px | **grande 1200px** |
| Edición | drawer de catálogo, ficha | 96 px | thumb; original sólo al reemplazar |

**Conclusión que cambia el diseño actual:** ninguna pantalla de uso diario
necesita el original. La caja más grande en pantalla es de 104 px; una
miniatura de 260px cubre incluso retina (2×). El original de 1200px sólo se
justifica para impresión.

Por eso el contrato de `docs/MEDIA_EGRESS_ARCHITECTURE.md` es correcto y esta
auditoría lo respalda: **listas y fichas con miniatura, original bajo intención.**

## Variantes propuestas

| Variante | Lado máx | Calidad | Peso objetivo | Formato |
|---|---:|---:|---:|---|
| `thumb` | 260 px | 0.75 | ≤ 40 kB | WebP → JPEG |
| `full` | 1200 px | 0.82 | ≤ 400 kB | WebP → JPEG |

El peso objetivo de `full` baja de **5 MB a 400 kB**. Los 5 MB actuales son la
razón por la que un PNG de 3 MB pasa el filtro sin que nadie se entere.

Medido en los archivos que sí salieron bien: WebP original 204 kB, thumb WebP
19 kB. Los objetivos son alcanzables con la calidad actual.

## Correcciones

### 1. Detectar el tipo real que devuelve `toBlob` — la que más pesa

```js
let blob = await canvasBlobFrom(canvas, 'image/webp', quality), ext = 'webp';
// toBlob devuelve PNG —no null— cuando el navegador no soporta el tipo pedido,
// y para PNG ignora la calidad. Hay que mirar lo que de verdad regresó.
if (!blob || blob.type !== 'image/webp') {
  blob = await canvasBlobFrom(canvas, 'image/jpeg', quality);
  ext = 'jpg';
}
```

8 archivos. Sin esto, cualquier otra optimización se reinicia con cada foto
que suba una familia desde un iPhone.

### 2. Bajar el techo de `full` de 5 MB a 400 kB

Un filtro de 5 MB no filtra nada. Con 400 kB, un PNG de 3 MB cae al camino de
JPEG aunque falle la detección del punto 1. Es el cinturón además del tirante.

### 3. `Cache-Control` de 1 hora a 1 año

Hoy todas las fotos se suben con `cacheControl: '3600'`. Las rutas ya son
versionadas (`foto-<timestamp>.webp`): cambiar la foto produce una ruta nueva,
así que **no hay nada que invalidar**. Un año es seguro y correcto.

`tanneros-branding` ya usa `max-age=31536000`. Las fotos de personas no.

### 4. Convertir los 48 PNG existentes

143 MB → ~10 MB estimados. La herramienta de `admin/fotos` ya hace el ciclo
completo (descargar, reducir, subir, registrar); hay que extenderla para
regenerar también el original cuando detecte que es PNG.

## Lo que ya está resuelto y no hay que rehacer

- Contrato de miniaturas y caché de firmas: `v2/photo-cache.js` (Codex).
- Barreras automáticas: `scripts/qa-static.mjs` y `qa-photo-cache.mjs`.
- Generación de las miniaturas faltantes: `v2/admin/fotos/` (PR #137).
- `loading="lazy"` en las tarjetas de Jugadores y en la vitrina.

## Lo que sigue pendiente

- **`srcset` y tamaños responsivos**: no existen. Con una sola variante por uso
  el beneficio es menor; conviene evaluarlo después de las correcciones.
- **Orientación EXIF**: no se corrige. Una foto de iPhone en horizontal puede
  guardarse girada. No se detectó un caso reportado, pero el riesgo está.
- **Metadatos EXIF**: `canvas.toBlob` los descarta al redibujar, así que la
  ubicación GPS de la foto original **no** llega al servidor. Esto es correcto
  por accidente, no por diseño; conviene dejarlo documentado como requisito.
- **Deduplicación**: no hay hash de contenido. Subir dos veces la misma foto
  crea dos archivos.
- **Limpieza de variantes viejas**: al reemplazar una foto, la anterior se queda
  en el bucket. No hay proceso de purga.
