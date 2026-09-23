// El CSP tiene que permitir lo que la app misma fabrica
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// photo-cache.js crea blob: URLs a proposito: es lo que hace que una foto ya
// descargada no se vuelva a pedir. Pero el CSP de produccion no listaba blob:
// en connect-src, y un fetch() se rige por connect-src, no por img-src. Las
// fotos se VEIAN bien y aun asi /admin/fotos/ fallo con "Failed to fetch" en
// las diez del lote, con cero bytes bajados.
//
// Reproducido en Chromium con el CSP exacto de produccion: el fetch falla con
// ese mismo mensaje, y pasa en cuanto blob: entra en connect-src.
// La pantalla que recodifica originales tiene que pedirlos a Storage, no al
// cache: un blob: no se puede descargar, y el cache puede traer hasta 24 horas.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  const cspLinea = (fs.readFileSync('vercel.json','utf8').match(/"Content-Security-Policy","value":"([^"]+)"/) || [])[1] || '';
  const connectSrc = (cspLinea.match(/connect-src([^;]*)/) || [])[1] || '';
  if (!cspLinea) errors.push('CSP: no se encontro la cabecera en vercel.json');
  else if (!/\bblob:/.test(connectSrc))
    errors.push('CSP: connect-src no permite blob:, y photo-cache.js entrega blob: URLs. '
      + 'Cualquier fetch() sobre una foto cacheada falla con "Failed to fetch"');

  const herramientaFotos = fs.readFileSync('v2/admin/fotos/app.js','utf8');
  if (/[^w]getSignedPhotoUrl\(/.test(herramientaFotos))
    errors.push('/admin/fotos/: usa getSignedPhotoUrl, que devuelve blob:. Debe usar getRawSignedPhotoUrl');
  return errors;
}
