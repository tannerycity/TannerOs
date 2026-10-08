// Construye lo que publica Vercel en dist/: el mismo sitio, con una huella de
// contenido en cada archivo que piden las pantallas.
//
// Por qué existe: cada pantalla pedía 20-30 archivos (JS, CSS, fuentes) y el
// navegador tenía que preguntarle a Vercel por cada uno en cada visita
// ("no-cache"). Las versiones a mano (?v=20260821f) se olvidaban, y el mismo
// archivo llegaba con y sin versión, así que se bajaba dos veces.
//
// Aquí cada referencia "/v2/shell.js" (con o sin ?v= viejo) se vuelve
// "/v2/shell.js?v=<huella>". La huella sale del contenido del archivo y de
// todo lo que importa, así que:
//   - si el archivo no cambió, la URL es la misma y el navegador lo usa de su
//     caché sin preguntar (vercel.json lo marca "immutable" un año);
//   - si cambió él o algo que importa, la URL cambia y se baja la nueva.
// El HTML nunca lleva huella: siempre se revisa, y es el que apunta a lo nuevo.
//
// El repositorio no cambia: las pruebas corren contra el código tal cual y la
// huella sólo existe en dist/.
//
// Uso:  node scripts/construir.mjs [carpeta-destino]   (por omisión dist/)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const DESTINO = path.resolve(RAIZ, process.argv[2] || 'dist');

// Lo que no es sitio: herramientas, documentación, la base, las funciones de
// servidor (Vercel las toma de api/ en la raíz) y el propio destino.
const FUERA = new Set(['.git', '.github', '.claude', 'node_modules', 'docs', 'scripts', 'supabase', 'api',
  'dist', 'README.md', 'vercel.json', '.gitignore', '.vercelignore']);

// Lo que se reescribe: donde viven las referencias.
const CON_REFERENCIAS = new Set(['.html', '.js', '.css']);

// Archivos cuya URL no puede cambiar nunca: el service worker se registra por
// su URL; con otra, el navegador instalaría uno nuevo en cada publicación.
const URL_FIJA = new Set(['/sw.js']);

// "/ruta/archivo.ext" entre comillas o dentro de url(...), con o sin un ?v=
// viejo. Las rutas armadas con ${...} no entran: se quedan sin huella y se
// revisan en cada visita, que es lo seguro.
const REF = /(['"`(])(\/[A-Za-z0-9_\-./]+\.(?:js|css|png|svg|jpg|jpeg|webp|woff2))(?:\?v=[A-Za-z0-9._-]*)?(?=['"`)])/g;

function archivos(dir, rel = '') {
  const lista = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!rel && FUERA.has(e.name)) continue;
    const r = rel + '/' + e.name;
    if (e.isDirectory()) lista.push(...archivos(path.join(dir, e.name), r));
    else if (e.isFile()) lista.push(r);
  }
  return lista;
}

export function construir(destino = DESTINO) {
  const todos = archivos(RAIZ);
  const existe = new Set(todos);
  const contenido = new Map(todos.map(r => [r, fs.readFileSync(path.join(RAIZ, r))]));
  const conRefs = r => CON_REFERENCIAS.has(path.extname(r));
  const deps = new Map();
  for (const r of todos) {
    if (!conRefs(r)) { deps.set(r, []); continue; }
    const d = new Set();
    for (const m of contenido.get(r).toString('utf8').matchAll(REF)) {
      if (existe.has(m[2]) && !URL_FIJA.has(m[2])) d.add(m[2]);
    }
    deps.set(r, [...d]);
  }

  // Huella = contenido propio + contenido de todo lo alcanzable. Sobre el
  // contenido original, no el reescrito: así los ciclos de imports no estorban.
  const propia = new Map(todos.map(r => [r, crypto.createHash('sha256').update(contenido.get(r)).digest('hex')]));
  const huella = new Map();
  const huellaDe = r => {
    if (huella.has(r)) return huella.get(r);
    const visto = new Set([r]), pila = [r];
    while (pila.length) for (const d of deps.get(pila.pop())) if (!visto.has(d)) { visto.add(d); pila.push(d); }
    const h = crypto.createHash('sha256');
    for (const v of [...visto].sort()) h.update(v + '\0' + propia.get(v) + '\0');
    const valor = h.digest('hex').slice(0, 12);
    huella.set(r, valor);
    return valor;
  };

  fs.rmSync(destino, { recursive: true, force: true });
  let referencias = 0;
  for (const r of todos) {
    const sale = path.join(destino, r);
    fs.mkdirSync(path.dirname(sale), { recursive: true });
    if (!conRefs(r)) { fs.writeFileSync(sale, contenido.get(r)); continue; }
    const texto = contenido.get(r).toString('utf8').replace(REF, (todo, abre, ruta) => {
      if (!existe.has(ruta) || URL_FIJA.has(ruta)) return todo;
      referencias++;
      return `${abre}${ruta}?v=${huellaDe(ruta)}`;
    });
    fs.writeFileSync(sale, texto);
  }
  return { archivos: todos.length, referencias, huella };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { archivos: n, referencias } = construir();
  console.log(`Construido ${path.relative(RAIZ, DESTINO) || '.'}: ${n} archivos, ${referencias} referencias con huella`);
}
