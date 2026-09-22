// Cómo se llaman los archivos de foto, y por qué importa tanto.
//
// v2_set_player_photo no acepta cualquier ruta: valida el nombre contra un
// patrón fijo y, si no cuadra, rechaza con "Invalid photo path". La foto ya
// está subida a Storage para entonces, así que un nombre mal armado gasta la
// descarga completa y no deja nada a cambio.
//
// Eso fue exactamente lo que paso: la pantalla de mantenimiento subía
//   profile-1756000000000-opt1790102340964.webp
// y el "-opt<stamp>" en medio rompe el patrón. Diez fotos, 27.8 MB
// descargados, cero guardadas.
//
// El patrón vive en la base. Aquí se repite a propósito, para poder probar
// contra él sin ir a la base, y qa-static comprueba que los dos sigan diciendo
// lo mismo.

export const PATRON_FOTO  = /^profile-[0-9]{10,16}\.(jpg|jpeg|png|webp)$/i;
export const PATRON_MINI  = /^profile-[0-9]{10,16}-thumb\.(jpg|jpeg|png|webp)$/i;

export function carpetaDeRuta(ruta) {
  const partes = String(ruta || '').split('/');
  partes.pop();
  return partes.join('/');
}

export function nombreDeRuta(ruta) {
  return String(ruta || '').split('/').pop() || '';
}

export function sinExtensionNombre(nombre) {
  return String(nombre || '').replace(/\.[^.]+$/, '');
}

// El nombre de un original recodificado.
//
// Se usa un sello nuevo en vez de un sufijo sobre el nombre viejo: un sufijo
// rompe el patrón, y un sello nuevo ya basta para no pisar el archivo anterior,
// que es lo único que hacía falta.
export function rutaDeOriginal(rutaVieja, sello, ext) {
  const carpeta = carpetaDeRuta(rutaVieja);
  return `${carpeta ? carpeta + '/' : ''}profile-${sello}.${ext}`;
}

// La miniatura siempre cuelga del nombre del original que va a quedar
// registrado, sea el nuevo o el que ya estaba.
export function rutaDeMiniatura(rutaDelOriginal, ext) {
  const carpeta = carpetaDeRuta(rutaDelOriginal);
  const base = sinExtensionNombre(nombreDeRuta(rutaDelOriginal));
  return `${carpeta ? carpeta + '/' : ''}${base}-thumb.${ext}`;
}

// Lo mismo que valida la base, para poder fallar aquí —antes de gastar la
// descarga— en vez de descubrirlo al guardar.
export function rutaValida(ruta, organizationId, playerId) {
  const partes = String(ruta || '').split('/');
  return partes.length === 5
    && partes[0] === 'organizations'
    && partes[1] === String(organizationId)
    && partes[2] === 'players'
    && partes[3] === String(playerId)
    && PATRON_FOTO.test(partes[4]);
}

export function miniaturaValida(ruta, organizationId, playerId) {
  const partes = String(ruta || '').split('/');
  return partes.length === 5
    && partes[0] === 'organizations'
    && partes[1] === String(organizationId)
    && partes[2] === 'players'
    && partes[3] === String(playerId)
    && PATRON_MINI.test(partes[4]);
}
