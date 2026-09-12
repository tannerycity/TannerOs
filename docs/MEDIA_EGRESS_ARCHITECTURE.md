# Arquitectura de fotos y control de egress

## Qué ocurrió

Una URL firmada nueva cambia la llave con la que el navegador identifica una
imagen. Firmar nuevamente el mismo objeto en cada pantalla impedía aprovechar su
caché HTTP. Además, algunas listas solicitaban la foto original de cada persona:
un patrón multiplicativo (`usuarios × registros × recargas × tamaño`) que puede
agotar la cuota aunque el número de archivos almacenados sea pequeño.

## Contrato obligatorio

1. **Una lista sólo consume miniaturas.** Si no existe `photo_thumb_path`, muestra
   iniciales; nunca hace fallback automático a `photo_path`.
2. **El original se carga bajo intención.** Sólo una ficha o visor abierto por la
   persona usuaria puede solicitar `photo_path`.
3. **Toda firma pasa por `v2/photo-cache.js`.** No se llama directamente a
   `createSignedUrls` desde una pantalla. Así una navegación reutiliza la misma
   URL y el navegador puede reutilizar los bytes descargados.
4. **Todo upload genera dos variantes.** La miniatura se usa en colecciones y la
   versión acotada se reserva para el detalle. Los paths son versionados; cambiar
   la foto produce un path nuevo y no requiere invalidar cachés.
5. **Privacidad antes que ahorro.** No se convierten fotos personales a bucket
   público ni se conservan URLs más allá de la sesión. El ahorro no debe debilitar
   autorización, RLS o consentimiento de imagen.

## Lo que sí prueban las verificaciones

`qa-photo-cache.mjs` es una prueba funcional del contrato de caché: duplicados,
hits y misses. No es un benchmark ni afirma cuántos GB ahorrará producción.
`qa-static.mjs` es una barrera arquitectónica: falla si una pantalla vuelve a
firmar lotes directamente o si un avatar cae en el original.

## Proceso para desarrollos futuros

- En diseño, estimar `vistas mensuales × imágenes por vista × KB por variante`.
- En revisión, identificar explícitamente colección, detalle y variante usada.
- En CI, ejecutar las dos verificaciones de egress junto con el QA general.
- En producción, alertar al 50%, 75% y 90% de la cuota mensual y segmentar Storage
  egress por bucket/ruta. Comparar el consumo por usuario activo, no sólo el total.
- Ante un pico, desactivar temporalmente la hidratación de imágenes en listas;
  no subir de plan antes de localizar la ruta responsable.

## Criterio de aceptación para una pantalla nueva

- Cero originales descargados al abrir una colección.
- Una firma por objeto como máximo durante una sesión vigente.
- Miniaturas con carga diferida cuando se renderizan como `<img>`.
- Estado usable con iniciales si Storage falla o no hay miniatura.
- Prueba automatizada que cubra cualquier excepción deliberada.
