# 08 · Plan de implementación

Cada bloque es independiente y reversible. No se mezclan cambios sin relación.

## Bloque A — P0 de egress · el PNG silencioso

**Problema.** `canvas.toBlob(cb,'image/webp',q)` devuelve PNG —no `null`— cuando
el navegador no soporta WebP, e ignora la calidad. Salen fotos de 3 MB en vez
de 204 kB.

**Evidencia.** 48 originales PNG, 3,060 kB de media, 143 MB; subidos hasta el
12 de septiembre. Ningún archivo comprueba `blob.type`.

**Cambio.** Verificar el tipo real y caer a JPEG. Bajar el techo de la variante
grande de 5 MB a 400 kB.

**Archivos.** `public-form.js`, `v2/jugadores/photos.js`, `v2/scouting/app.js`,
`v2/patrocinadores/app.js`, `v2/utileria/app.js`, `v2/catalogo/app.js`,
`v2/admin/fotos/app.js`, `v2/admin/branding/app.js`.

**Impacto.** ~93% menos peso por foto nueva. **Riesgo: bajo** — sólo cambia el
formato de salida; JPEG se ve igual a esta calidad.

**Pruebas.** Unitaria del selector de formato simulando `toBlob` que devuelve
PNG. Barrera en `qa-static.mjs` que falle si un archivo pide WebP sin verificar
el tipo. **Prueba en WebKit**, que es donde ocurre.

**Reversión.** Revertir el commit. No toca datos.

## Bloque B — Egress e imágenes · lo existente

**B1. Miniaturas faltantes.** 46 de 50 jugadores. Herramienta lista en PR #137,
sin mergear.

**B2. Convertir los 48 PNG.** Extender `admin/fotos` para regenerar también el
original cuando detecte PNG. 143 MB → ~10 MB. Requiere descargar 143 MB una
vez: **hacerlo después del 22 de septiembre.**

**B3. `Cache-Control` a 1 año.** Las rutas ya son versionadas. Cambio en los 8
puntos de subida; los archivos existentes requieren re-subida o actualización
de metadata.

**B4. Quitar `no-store` de `/v2/`.** Versionar los assets con hash. Egress de
Vercel y velocidad percibida.

**Reversión.** B1 y B2 son aditivos (una miniatura de más no rompe nada).
B3 y B4 son configuración, se revierten con un commit.

## Bloque C — Rendimiento

**C1.** Fijar la versión del cliente de Supabase. *Riesgo de disponibilidad.*
**C2.** Paginar `v2_players` y separar el detalle. Requiere migración con RPC
nueva; la vieja se mantiene hasta migrar las pantallas.
**C3.** Podar índices sin uso, **uno por uno y con evidencia**. Nunca en bloque.

## Bloque D — QA

Las 8 pruebas de `06`, en ese orden. Primero las de aislamiento entre familias
y las de dinero.

Añadir **WebKit** al arnés de navegador: el defecto del PNG no se habría
encontrado nunca corriendo sólo Chromium.

## Bloque E — SaaS

**E1.** Medición de uso por organización (cron + tabla).
**E2.** Límites por plan en `organizations.settings.limits`.
**E3.** Alertas al 50/75/90%.
**E4.** Branch de Supabase para desarrollo. *El más importante: hoy no existe
ambiente de pruebas.*

## Orden recomendado

```
A  →  B1  →  B3  →  B4  →  D(1,2,3,4)  →  [22 sep: cuota restablecida]
   →  B2  →  C1  →  E4  →  C2  →  E1,E2,E3  →  C3
```

A y B1 antes del 22 porque sin ellos el consumo se reproduce. B2 después,
porque descarga 143 MB. C3 al final porque es el de mayor riesgo y menor
beneficio.
