/* Reuse signed URLs so unchanged private photos remain browser-cacheable. */
const PREFIX = 'tanneros:photo-url:v1:';
const TTL_SECONDS = 3600;
const REUSE_MS = 50 * 60 * 1000;

// Caché de bytes, no sólo de URLs.
//
// Las fotos viven en un bucket privado y se sirven con URL firmada. El token
// dura una hora y el navegador cachea por URL completa, token incluido: cuando
// el token rota, el caché del navegador falla aunque los bytes sean idénticos.
// Por eso una mamá que abre el portal en la mañana y otra vez en la tarde
// descargaba la foto de su hijo dos veces.
//
// Aquí los bytes se guardan bajo la RUTA del archivo, que no cambia —las rutas
// llevan un Date.now() y se suben con upsert:false, así que son inmutables—.
// El token sigue durando una hora: esto no alarga ni un minuto la vida de una
// URL que se pudiera filtrar.
//
// Privacidad antes que ahorro: son fotos de menores, así que duran un día y se
// borran al cerrar sesión (clearPhotoCache).
const BYTES_CACHE = 'tanneros-fotos-v1';
const BYTES_TTL_MS = 24 * 60 * 60 * 1000;
// Lo que se guarda EN DISCO son miniaturas y fotos ya optimizadas. Un original
// heredado de 3 MB no tiene por qué ocupar la cuota del navegador de nadie.
const BYTES_MAX = 1024 * 1024;
// Cuántas fotos se mantienen vivas en memoria a la vez. Una URL de blob retiene
// sus bytes hasta que se revoca, así que sin tope una vuelta larga por el padrón
// las iría acumulando. Con 120 caben de sobra las miniaturas de una lista, y lo
// que se desaloja ya se pintó: revocarlo no borra la imagen de la pantalla.
const MEMORIA_MAX = 120;
const GUARDADO_EN = 'x-tanneros-guardado';

const cacheKey = (bucket, path) => `${PREFIX}${bucket}:${path}`;
const bytesKey = (bucket, path) => `https://foto.tanneros.local/${bucket}/${path}`;
const objectUrls = new Map();

function read(bucket, path) {
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey(bucket, path)) || 'null');
    if (value?.url && Number(value.expiresAt) > Date.now()) return value.url;
    sessionStorage.removeItem(cacheKey(bucket, path));
  } catch (_) { /* Cache access can be disabled by the browser. */ }
  return null;
}

function write(bucket, path, url) {
  if (!url) return;
  try {
    sessionStorage.setItem(cacheKey(bucket, path), JSON.stringify({ url, expiresAt: Date.now() + REUSE_MS }));
  } catch (_) { /* This cache is an optimization, not a requirement. */ }
}

function recuerda(clave, url) {
  objectUrls.set(clave, url);
  while (objectUrls.size > MEMORIA_MAX) {
    const vieja = objectUrls.keys().next().value;
    const url = objectUrls.get(vieja);
    objectUrls.delete(vieja);
    try { URL.revokeObjectURL(url); } catch (_) { /* ya revocada */ }
  }
}

async function abreCache() {
  // Falta en Node, en contextos no seguros y en algunos modos privados.
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(BYTES_CACHE);
  } catch (_) { return null; }
}

async function bytesGuardados(cache, clave) {
  try {
    const guardado = await cache.match(clave);
    if (!guardado) return null;
    const cuando = Number(guardado.headers.get(GUARDADO_EN)) || 0;
    if (Date.now() - cuando > BYTES_TTL_MS) { await cache.delete(clave); return null; }
    return await guardado.blob();
  } catch (_) { return null; }
}

async function guardaBytes(cache, clave, blob) {
  if (!blob) return;
  try {
    await cache.put(clave, new Response(blob, {
      headers: { 'Content-Type': blob.type || 'image/jpeg', [GUARDADO_EN]: String(Date.now()) },
    }));
  } catch (_) { /* Sin cuota disponible se sigue sin caché. */ }
}

// Devuelve una URL lista para `img.src`. Ante cualquier tropiezo —sin Cache
// API, sin cuota, un fetch que falla— devuelve la URL firmada tal cual, que es
// exactamente el comportamiento anterior.
async function urlDeBytes(cache, bucket, path, firmada) {
  const memoria = objectUrls.get(`${bucket}:${path}`);
  if (memoria) return memoria;
  const clave = bytesKey(bucket, path);
  let blob = await bytesGuardados(cache, clave);
  if (!blob) {
    if (!firmada) return null;
    try {
      const respuesta = await fetch(firmada);
      if (!respuesta.ok) return firmada;
      blob = await respuesta.blob();
    } catch (_) { return firmada; }
    // Se descarga una sola vez pase lo que pase. Cortar por las cabeceras no
    // sirve: el navegador ya trajo el cuerpo cuando se cancela, y después la
    // etiqueta <img> lo vuelve a pedir. Medido: 6 MB por una foto de 3 MB.
    // Lo único que decide el peso es si además se guarda en disco.
    if (blob.size <= BYTES_MAX) await guardaBytes(cache, clave, blob);
  }
  try {
    const url = URL.createObjectURL(blob);
    recuerda(`${bucket}:${path}`, url);
    return url;
  } catch (_) { return firmada; }
}

async function conBytes(supabase, bucket, resultado) {
  const cache = await abreCache();
  if (!cache) return resultado;
  const rutas = Object.keys(resultado);
  const urls = await Promise.all(rutas.map((path) => urlDeBytes(cache, bucket, path, resultado[path])));
  const salida = {};
  rutas.forEach((path, i) => { if (urls[i]) salida[path] = urls[i]; });
  return salida;
}

export async function getSignedPhotoUrls(supabase, bucket, paths) {
  const result = {};
  const missing = [];
  [...new Set((paths || []).filter(Boolean))].forEach((path) => {
    const cached = read(bucket, path);
    if (cached) result[path] = cached;
    else missing.push(path);
  });
  if (!missing.length) return conBytes(supabase, bucket, result);

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_SECONDS);
  if (error) throw error;
  (data || []).forEach((row) => {
    if (!row?.signedUrl || row.error) return;
    result[row.path] = row.signedUrl;
    write(bucket, row.path, row.signedUrl);
  });
  return conBytes(supabase, bucket, result);
}

export async function getSignedPhotoUrl(supabase, bucket, path) {
  if (!path) return null;
  const urls = await getSignedPhotoUrls(supabase, bucket, [path]);
  return urls[path] || null;
}

// La URL firmada tal cual, sin pasar por el cache de bytes.
//
// getSignedPhotoUrl devuelve un blob: cuando tiene los bytes guardados, que es
// justo lo que quiere una etiqueta <img>. Pero un fetch() sobre un blob: lo
// gobierna connect-src, no img-src, y ahi se cayo la pantalla de /admin/fotos/:
// las diez fotos del lote fallaron con "Failed to fetch" y cero bytes bajados.
//
// Quien va a recodificar un original lo quiere de Storage, no una copia del
// cache que ademas puede tener hasta 24 horas. Por eso esta funcion existe
// aparte en vez de arreglarse solo relajando el CSP.
export async function getRawSignedPhotoUrl(supabase, bucket, path) {
  if (!path) return null;
  const guardada = read(bucket, path);
  if (guardada) return guardada;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls([path], TTL_SECONDS);
  if (error) throw error;
  const fila = (data || [])[0];
  if (!fila?.signedUrl || fila.error) return null;
  write(bucket, path, fila.signedUrl);
  return fila.signedUrl;
}

// La pantalla de mantenimiento baja originales pesados de uno en uno y ya no los
// necesita en cuanto los recodifica. Sin esto, un lote grande dejaría vivos
// cientos de MB de fotos que nadie va a volver a mirar.
export function forgetPhoto(bucket, path) {
  const clave = `${bucket}:${path}`;
  const url = objectUrls.get(clave);
  if (!url) return;
  objectUrls.delete(clave);
  try { URL.revokeObjectURL(url); } catch (_) { /* ya revocada */ }
}

// Se llama al cerrar sesión. La foto de un menor no se queda en el dispositivo
// después de que su familia salió, aunque sea una compu compartida.
export async function clearPhotoCache() {
  for (const url of objectUrls.values()) { try { URL.revokeObjectURL(url); } catch (_) { /* ya revocada */ } }
  objectUrls.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch (_) { /* sessionStorage puede estar bloqueado */ }
  try { if (typeof caches !== 'undefined') await caches.delete(BYTES_CACHE); } catch (_) { /* sin Cache API */ }
}
