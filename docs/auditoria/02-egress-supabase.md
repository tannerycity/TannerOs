# 02 · Auditoría de egress en Supabase

Medición del 19 de septiembre de 2026. Toda la evidencia sale de consultas a
`storage.objects` y de ejecutar las RPC midiendo el tamaño del JSON en el
servidor. **No se descargó ninguna imagen** para producir este documento.

## Resumen

El consumo se disparó por **imágenes**, y la causa no es la que parecía. No es
sólo que falten miniaturas: es que **el 95% del peso almacenado son PNG que
debieron ser WebP**, por un defecto en el código de compresión que sigue vivo.

| Fuente de egress | Evidencia | Consumo estimado | Severidad | Solución | Ahorro |
|---|---|---:|---|---|---:|
| PNG silencioso en vez de WebP | 48 originales PNG, 3,060 kB de media, 143 MB; WebP equivalente: 204 kB | ~93% del egress de imágenes | **P0** | Detectar el tipo real que devuelve `toBlob` | ~93% |
| Miniaturas inexistentes | 46 de 50 jugadores activos con foto no tienen `photo_thumb_path` | Alto antes del contrato de Codex | **P1** | Generarlas (PR #137) | 99% en listados |
| `Cache-Control: max-age=3600` en fotos | `storage.objects.metadata`, todos los buckets de fotos | Re-descarga cada hora | **P1** | 1 año: las rutas ya son versionadas | Alta |
| `no-store` en todo `/v2/` | `vercel.json`, `source: "/v2/(.*)"` | Egress de **Vercel**, no de Supabase | **P1** | Cachear por hash | Indirecto |
| `v2_players` sin paginar | 56.0 kB por llamada con 161 jugadores | Moderado hoy, grave en SaaS | **P2** | Paginar y separar el detalle | Escala |
| Realtime | `pg_publication_tables` = **0 tablas** | **Cero** | — | Descartado con evidencia | — |

## Hallazgo principal: el PNG silencioso

### Evidencia

```
tipo      formato    archivos   peso     promedio   rango
original  image/png       48    143 MB   3,060 kB   23 ago – 12 sep
original  image/webp      31    6.3 MB     204 kB   31 ago – 11 sep
miniatura image/png        4    458 kB     114 kB   10–11 sep
miniatura image/webp      11    209 kB      19 kB   9 sep
```

Un PNG pesa **15 veces** más que el WebP equivalente. Las miniaturas PNG pesan
**6 veces** más que las WebP.

Las fechas importan: **los PNG siguen entrando hasta el 12 de septiembre.** No
son un legado de la migración, es un defecto activo.

Las carpetas también: los PNG vienen de `players`, `prospects` y `scouting`
—los flujos que se usan desde el teléfono— y los WebP de `equipment`, que el
staff captura desde computadora.

### Causa raíz

El patrón está copiado en 8 archivos:

```js
let blob = await canvasBlobFrom(canvas, 'image/webp', quality);
let ext = 'webp';
if (!blob) { blob = await canvasBlobFrom(canvas, 'image/jpeg', quality); ext = 'jpg'; }
if (blob && blob.size > maxBytes) { /* recomprime a JPEG */ }
```

El código asume que si el navegador no soporta WebP, `toBlob` devuelve `null`.
**No es así.** El estándar HTML dice que ante un tipo no soportado el navegador
usa `image/png`. Además, el parámetro `quality` **se ignora para PNG**, así que
sale sin comprimir.

Resultado en un Safari sin soporte de WebP —el navegador de las familias—:

1. `blob` llega lleno, así que el fallback a JPEG nunca corre.
2. Sale un PNG de ~3 MB, que pasa el filtro de 5 MB de la variante grande.
3. El archivo se nombra `.webp` pero por dentro es PNG.
4. `contentType` se toma de `blob.type`: por eso el metadata dice `image/png`.

Verificado: **ningún archivo del repositorio comprueba el tipo real devuelto.**

```
$ grep -rn "blob.type === 'image/webp'" --include=*.js .
  (sin resultados)
```

### Archivos afectados

`public-form.js`, `v2/jugadores/photos.js`, `v2/scouting/app.js`,
`v2/patrocinadores/app.js`, `v2/utileria/app.js`, `v2/catalogo/app.js`,
`v2/admin/fotos/app.js`, `v2/admin/branding/app.js`.

### Corrección propuesta

```js
let blob = await canvasBlobFrom(canvas, 'image/webp', quality), ext = 'webp';
// toBlob devuelve PNG —no null— cuando el navegador no soporta el tipo pedido,
// y para PNG ignora la calidad. Hay que mirar lo que de verdad regresó.
if (!blob || blob.type !== 'image/webp') {
  blob = await canvasBlobFrom(canvas, 'image/jpeg', quality);
  ext = 'jpg';
}
```

## Peso de las respuestas de base de datos

Medido con impersonación de Presidencia, sobre los datos reales:

| RPC | Peso del JSON |
|---|---:|
| `v2_players` | **56.0 kB** |
| `v2_open_receivables` | 26.8 kB |
| `v2_billing_players` | 25.6 kB |
| `v2_my_navigation` | 4.0 kB |
| `v2_my_modules` | 1.6 kB |
| `v2_my_context` | 0.3 kB |

Para dimensionar: **una sola foto PNG (3,060 kB) pesa 55 veces más que el padrón
completo en JSON.** Las imágenes dominan y el JSON no es el problema hoy.

`v2_my_context` + `v2_my_navigation` se llaman en **cada** pantalla desde
`shell.js`: 4.3 kB por navegación. Con `no-store` en `/v2/`, cada navegación
recarga el código **y** repite esas llamadas.

## Escenario de ahorro

Apertura del padrón de Jugadores, 50 Tanners activos con foto:

```
Antes del contrato de egress (fallback al original):
  46 originales × 3,060 kB            = 138 MB por apertura

Hoy (contrato aplicado, sin miniaturas):
  46 aparecen como iniciales          = 0 kB · pero se perdió la foto

Con miniaturas WebP generadas:
  50 miniaturas × 19 kB               = 0.95 MB por apertura
```

**Reducción: 99.3%.** Los 11.87 GB consumidos equivalen a unas 86 aperturas del
padrón al ritmo viejo; al ritmo nuevo, esas mismas 86 aperturas cuestan 82 MB.

## Lo que este documento NO afirma

- No se midió el egress real por ruta: los `edge_logs` devolvieron error de
  backend en los dos intentos. El reparto entre Storage y Data API es una
  inferencia a partir de los pesos, no una lectura directa.
- No se descargó ninguna imagen para medir, por la restricción de no aumentar
  el consumo. Los tamaños salen de `storage.objects.metadata`.
