/* Prueba del codificador de imágenes.
 *
 * Reproduce el defecto real: un navegador sin soporte de WebP devuelve PNG
 * —no null— y con la calidad ignorada. Así entraron 143 MB en PNG.
 */
import assert from 'node:assert/strict';

// Canvas simulado. `soporta` decide qué tipos entiende el navegador.
function canvasFalso({ soporta = ['image/webp', 'image/jpeg', 'image/png'], tamanos = {} } = {}) {
  const pedidos = [];
  return {
    pedidos,
    width: 1200, height: 900,
    getContext: () => ({ drawImage() {} }),
    toBlob(cb, type, quality) {
      pedidos.push({ type, quality });
      // Comportamiento real del estándar: si el tipo no se soporta, usa PNG y
      // descarta la calidad.
      const real = soporta.includes(type) ? type : 'image/png';
      const size = tamanos[real] ?? (real === 'image/png' ? 3_060_000 : real === 'image/webp' ? 204_000 : 260_000);
      cb({ type: real, size });
    },
  };
}

globalThis.document = { createElement: () => canvasFalso() };
const { encodeCanvas } = await import('../v2/image-encode.js');

const errores = [];
const prueba = async (nombre, fn) => {
  try { await fn(); } catch (e) { errores.push(`${nombre}: ${e.message}`); }
};

await prueba('navegador CON WebP entrega webp', async () => {
  const canvas = canvasFalso();
  const r = await encodeCanvas(canvas, 0.82, 400 * 1024);
  assert.equal(r.mime, 'image/webp');
  assert.equal(r.ext, 'webp');
});

await prueba('navegador SIN WebP NO entrega el PNG silencioso', async () => {
  const canvas = canvasFalso({ soporta: ['image/jpeg', 'image/png'] });
  const r = await encodeCanvas(canvas, 0.82, 400 * 1024);
  assert.equal(r.mime, 'image/jpeg', 'debió caer a JPEG, no aceptar el PNG');
  assert.equal(r.ext, 'jpg');
  assert.ok(r.blob.size < 400 * 1024, `pesa ${r.blob.size}, el defecto dejaba pasar 3 MB`);
});

// EL CASO QUE AÍSLA EL DEFECTO. Un PNG que CABE en el techo: la red de peso no
// lo atrapa, así que sólo lo detiene mirar el tipo que toBlob devolvió. Con el
// código viejo esta prueba falla; es la que le da valor al arreglo.
await prueba('un PNG que cabe en el techo tampoco se acepta como WebP', async () => {
  const canvas = canvasFalso({ soporta: ['image/jpeg', 'image/png'], tamanos: { 'image/png': 100_000, 'image/jpeg': 90_000 } });
  const r = await encodeCanvas(canvas, 0.82, 400 * 1024);
  assert.equal(r.mime, 'image/jpeg', 'aceptó el PNG silencioso: el techo no lo atrapa porque cabe');
  assert.equal(r.ext, 'jpg');
});

await prueba('el archivo nunca se llama .webp siendo otra cosa', async () => {
  const canvas = canvasFalso({ soporta: ['image/png'], tamanos: { 'image/png': 100_000 } });
  const r = await encodeCanvas(canvas, 0.82, 400 * 1024);
  assert.notEqual(r.ext, 'webp', 'un PNG etiquetado .webp fue lo que escondió el problema');
  assert.equal(r.ext, 'png');
});

await prueba('rechaza lo que excede el techo', async () => {
  const canvas = canvasFalso({ soporta: ['image/jpeg'], tamanos: { 'image/jpeg': 900_000 } });
  await assert.rejects(() => encodeCanvas(canvas, 0.82, 400 * 1024), /demasiado pesada/);
});

await prueba('el techo de la variante grande filtra de verdad', async () => {
  // Con el techo viejo de 5 MB, un PNG de 3 MB pasaba. Con 400 kB, no.
  const canvas = canvasFalso({ soporta: ['image/png'], tamanos: { 'image/png': 3_060_000 } });
  await assert.rejects(() => encodeCanvas(canvas, 0.82, 400 * 1024), /demasiado pesada/);
});

await prueba('pide WebP primero, no al revés', async () => {
  const canvas = canvasFalso();
  await encodeCanvas(canvas, 0.82, 400 * 1024);
  assert.equal(canvas.pedidos[0].type, 'image/webp');
});

if (errores.length) {
  console.error('\nImage encode QA FAILED');
  errores.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('Image encode QA OK · 7 casos, incluido el PNG silencioso');
