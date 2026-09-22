/* Codificación de imágenes: un solo camino, verificado.
 *
 * El defecto que motivó este módulo: canvas.toBlob(cb,'image/webp',q) NO
 * devuelve null cuando el navegador no soporta WebP. El estándar manda usar
 * image/png, y para PNG el parámetro de calidad se IGNORA. El código anterior
 * asumía null, así que el respaldo a JPEG nunca corría y salían fotos de 3 MB
 * nombradas .webp. Safari sin soporte de WebP es el navegador de las familias:
 * 48 originales PNG de 3,060 kB de media contra 204 kB de los WebP.
 *
 * Aquí se mira SIEMPRE lo que toBlob devolvió de verdad.
 */

// La caja más grande en pantalla mide 104px; 260 cubre retina 2x.
export const THUMB_MAX_SIDE = 260;
export const THUMB_MAX_BYTES = 40 * 1024;
// 1200 alcanza para credencial e impresión. El techo viejo de 5 MB no filtraba
// nada: por eso un PNG de 3 MB pasaba sin que nadie se enterara.
export const FULL_MAX_SIDE = 1200;
export const FULL_MAX_BYTES = 400 * 1024;

// Cabecera Cache-Control de toda foto que subimos a Storage.
//
// Un año es seguro porque las rutas son inmutables: llevan un `Date.now()` y
// se suben con `upsert:false`, así que una foto nueva es siempre una ruta
// nueva. Nadie sobreescribe bytes bajo una ruta que un navegador ya guardó.
//
// Ojo: por sí solo esto ahorra poco. Las fotos viven en un bucket privado y se
// sirven con URL firmada; el navegador cachea por URL completa, token incluido,
// así que cuando el token rota el caché falla igual. Ver docs/auditoria/11.
export const UPLOAD_CACHE_CONTROL = '31536000';

export function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function extensionDe(mime) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  // Si acaba saliendo otra cosa, el archivo se llama como lo que es. Nunca se
  // etiqueta un PNG como .webp: fue así como el problema pasó desapercibido.
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/** Codifica un canvas respetando el techo de peso. Devuelve {blob, ext, mime}. */
export async function encodeCanvas(canvas, quality, maxBytes) {
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  // La comprobación que faltaba: un PNG silencioso se ve igual que un WebP
  // bueno salvo por su tipo.
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (blob && blob.size > maxBytes) {
    const reintento = await canvasToBlob(canvas, 'image/jpeg', Math.max(0.5, quality - 0.17));
    if (reintento && reintento.size < blob.size) blob = reintento;
  }
  if (!blob) throw new Error('Tu navegador no pudo preparar la foto.');
  if (blob.size > maxBytes) {
    throw new Error('La foto es demasiado pesada. Prueba con una imagen más pequeña.');
  }
  const mime = blob.type || 'image/jpeg';
  return { blob, ext: extensionDe(mime), mime };
}

/** Dibuja la imagen reducida al lado máximo pedido. */
export function canvasDesde(img, maxSide) {
  const ancho = img.naturalWidth || img.width;
  const alto = img.naturalHeight || img.height;
  if (!ancho || !alto) throw new Error('No pudimos leer el tamaño de esa foto.');
  const escala = Math.min(1, maxSide / Math.max(ancho, alto));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ancho * escala));
  canvas.height = Math.max(1, Math.round(alto * escala));
  const cx = canvas.getContext('2d');
  if (!cx) throw new Error('Tu navegador no pudo preparar la foto.');
  cx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Reduce y codifica en un paso. Devuelve {blob, ext, mime}. */
export async function encodeVariant(img, maxSide, quality, maxBytes) {
  return encodeCanvas(canvasDesde(img, maxSide), quality, maxBytes);
}

/** Las dos variantes que consume la app: miniatura para listas, grande para detalle. */
export async function encodeAmbas(img) {
  return {
    full: await encodeVariant(img, FULL_MAX_SIDE, 0.82, FULL_MAX_BYTES),
    thumb: await encodeVariant(img, THUMB_MAX_SIDE, 0.75, THUMB_MAX_BYTES),
  };
}
