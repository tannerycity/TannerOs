import assert from 'node:assert/strict';

// El caché de fotos tiene dos capas y aquí se prueban las dos:
//   1. La URL firmada se reusa dentro de la sesión (capa vieja).
//   2. Los BYTES se guardan bajo la ruta del archivo, que no cambia, para que
//      al rotar el token no haya que volver a descargar la foto (Bloque B3c).

function sessionFalsa() {
  const v = new Map();
  return {
    get length() { return v.size; },
    key: (i) => [...v.keys()][i] ?? null,
    getItem: (k) => v.get(k) ?? null,
    setItem: (k, x) => v.set(k, x),
    removeItem: (k) => v.delete(k),
    _map: v,
  };
}
function cachesFalso() {
  const almacenes = new Map();
  const api = {
    borrados: [],
    async open(nombre) {
      if (!almacenes.has(nombre)) almacenes.set(nombre, new Map());
      const m = almacenes.get(nombre);
      return {
        async match(k) { return m.get(k) ?? undefined; },
        async put(k, r) { m.set(k, r); },
        async delete(k) { return m.delete(k); },
        get _m() { return m; },
      };
    },
    async delete(nombre) { api.borrados.push(nombre); return almacenes.delete(nombre); },
    _almacenes: almacenes,
  };
  return api;
}
function clienteFalso(estado) {
  return {
    storage: {
      from() {
        return {
          async createSignedUrls(paths, expiresIn) {
            estado.firmas += 1;
            assert.equal(expiresIn, 3600, 'el token NO se alarga: sigue durando una hora');
            return { data: paths.map((path) => ({ path, signedUrl: `https://storage.test/${path}?call=${estado.firmas}` })) };
          },
        };
      },
    },
  };
}

let semilla = 0;
async function escenario({ conCaches = true, bytes = 5000, fetchFalla = false } = {}) {
  const estado = { firmas: 0, descargas: 0, revocadas: [] };
  globalThis.sessionStorage = sessionFalsa();
  globalThis.caches = conCaches ? cachesFalso() : undefined;
  if (!conCaches) delete globalThis.caches;
  globalThis.fetch = async (url) => {
    estado.descargas += 1;
    if (fetchFalla) throw new Error('sin red');
    return new Response(Buffer.alloc(bytes), {
      headers: { 'Content-Type': 'image/webp', 'Content-Length': String(bytes) },
    });
  };
  globalThis.URL.createObjectURL = (blob) => `blob:foto-${blob.size}-${estado.descargas}`;
  globalThis.URL.revokeObjectURL = (u) => estado.revocadas.push(u);
  semilla += 1;
  const mod = await import(`../v2/photo-cache.js?v=${semilla}`);
  // Volver a abrir la app: se pierde lo que vivía en memoria y en la sesión,
  // se conserva lo que está en disco. Es lo que pasa cuando una mamá cierra la
  // pestaña y vuelve a entrar más tarde.
  const vuelveAEntrar = async () => {
    globalThis.sessionStorage = sessionFalsa();
    semilla += 1;
    return import(`../v2/photo-cache.js?v=${semilla}`);
  };
  return { ...mod, estado, cliente: clienteFalso(estado), vuelveAEntrar };
}

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('sin Cache API se comporta como antes: devuelve la URL firmada', async () => {
  const { getSignedPhotoUrl, getSignedPhotoUrls, cliente, estado } = await escenario({ conCaches: false });
  const primera = await getSignedPhotoUrls(cliente, 'private', ['a.webp', 'a.webp', 'b.webp']);
  assert.equal(estado.firmas, 1, 'las rutas repetidas se firman una sola vez');
  assert.match(primera['a.webp'], /call=1/);
  const segunda = await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.equal(estado.firmas, 1, 'la misma URL firmada se reusa dentro de la sesión');
  assert.equal(segunda, primera['a.webp']);
  await getSignedPhotoUrl(cliente, 'private', 'c.webp');
  assert.equal(estado.firmas, 2, 'sólo un fallo de caché llama a Supabase');
});

prueba('con Cache API los bytes se bajan una vez y se sirven desde el disco', async () => {
  const { getSignedPhotoUrl, cliente, estado } = await escenario();
  const a = await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.match(a, /^blob:/, 'se sirve el blob guardado, no la URL con token');
  assert.equal(estado.descargas, 1);
  const b = await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.equal(b, a);
  assert.equal(estado.descargas, 1, 'la segunda vista no vuelve a descargar');
});

// EL CASO QUE JUSTIFICA TODO EL BLOQUE. Antes, al rotar el token, la URL
// cambiaba y el navegador volvía a bajar los mismos bytes. La clave del caché
// es la ruta, así que un token nuevo ya no cuesta una descarga.
prueba('un token nuevo no cuesta una descarga nueva', async () => {
  const { getSignedPhotoUrl, cliente, estado, vuelveAEntrar } = await escenario();
  await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.equal(estado.descargas, 1);
  const otraVisita = await vuelveAEntrar();
  const despues = await otraVisita.getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.match(despues, /^blob:/);
  assert.equal(estado.firmas, 2, 'sí hubo que firmar otra vez');
  assert.equal(estado.descargas, 1, 'pero NO hubo que descargar otra vez');
});

prueba('los bytes caducan al día y se vuelven a pedir', async () => {
  const { getSignedPhotoUrl, cliente, estado, vuelveAEntrar } = await escenario();
  await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  const almacen = await globalThis.caches.open('tanneros-fotos-v1');
  const clave = 'https://foto.tanneros.local/private/a.webp';
  const viejo = almacen._m.get(clave);
  almacen._m.set(clave, new Response(await viejo.arrayBuffer(), {
    headers: { 'Content-Type': 'image/webp', 'x-tanneros-guardado': String(Date.now() - 25 * 3600 * 1000) },
  }));
  const otraVisita = await vuelveAEntrar();
  await otraVisita.getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.equal(estado.descargas, 2, 'pasado el día la foto se vuelve a bajar');
});

// Un original heredado de 3 MB se descarga UNA vez y se sirve como blob, pero no
// ocupa la cuota de disco. Cortarlo por las cabeceras se probó y salió peor: el
// navegador ya había traído el cuerpo al cancelar y la etiqueta <img> lo volvía
// a pedir — 6 MB por una foto de 3 MB.
prueba('un archivo de más de 1 MB se baja una vez pero no ocupa la cuota', async () => {
  const { getSignedPhotoUrl, cliente, estado } = await escenario({ bytes: 3 * 1024 * 1024 });
  const url = await getSignedPhotoUrl(cliente, 'private', 'gordo.webp');
  assert.match(url, /^blob:/, 'una sola descarga: el <img> ya no vuelve a pedirla');
  assert.equal(estado.descargas, 1);
  const almacen = await globalThis.caches.open('tanneros-fotos-v1');
  assert.equal(almacen._m.size, 0, 'pero no se guarda en disco');
});

// Sin tope, una vuelta larga por el padrón iría acumulando bytes vivos en la
// pestaña. Lo que se desaloja ya se pintó, así que revocarlo no borra nada.
prueba('la memoria tiene tope y lo desalojado se revoca', async () => {
  const { getSignedPhotoUrl, cliente, estado } = await escenario();
  for (let i = 0; i < 130; i += 1) await getSignedPhotoUrl(cliente, 'private', `f${i}.webp`);
  assert.equal(estado.descargas, 130);
  assert.equal(estado.revocadas.length, 10, 'se revocaron las 10 más viejas');
  assert.match(estado.revocadas[0], /-1$/, 'la primera en salir fue la primera que entró');
});

prueba('si la descarga falla se devuelve la URL firmada, como antes', async () => {
  const { getSignedPhotoUrl, cliente } = await escenario({ fetchFalla: true });
  const url = await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.match(url, /^https:\/\/storage\.test\//, 'sin red la foto sigue cargando por la vía normal');
});

prueba('al cerrar sesión no queda ni un byte de la foto en el aparato', async () => {
  const { getSignedPhotoUrl, clearPhotoCache, cliente, estado } = await escenario();
  const url = await getSignedPhotoUrl(cliente, 'private', 'a.webp');
  assert.ok(globalThis.sessionStorage.length > 0);
  await clearPhotoCache();
  assert.deepEqual(estado.revocadas, [url], 'la URL del blob se revoca');
  assert.equal(globalThis.sessionStorage.length, 0, 'no quedan URLs firmadas');
  assert.deepEqual(globalThis.caches.borrados, ['tanneros-fotos-v1'], 'se borra el caché de bytes');
});

let fallos = 0;
for (const [nombre, fn] of pruebas) {
  try { await fn(); } catch (e) { fallos += 1; console.error(` - ${nombre}: ${e.message}`); }
}
if (fallos) { console.error(`Photo URL cache QA FAILED`); process.exit(1); }
console.log(`Photo URL cache QA OK · ${pruebas.length} casos, incluido el token que rota`);
