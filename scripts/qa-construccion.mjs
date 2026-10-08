// La construcción que publica Vercel (scripts/construir.mjs) no puede romper
// nada ni dejar a nadie con código viejo.
//
// Lo que se revisa, sobre una construcción real en una carpeta temporal:
//   1. Cada "?v=" de dist/ apunta a un archivo que existe y lleva huella de
//      contenido (12 hex). Una versión a mano que sobreviva sería un archivo
//      que el navegador nunca suelta.
//   2. Ninguna referencia a un archivo local se queda sin huella, salvo las
//      que la construcción deja fijas a propósito (sw.js).
//   3. Si cambia un módulo, cambia la huella de quien lo importa (y de quien
//      importa a ése). Si no, el navegador usaría el importador viejo, que
//      apunta al módulo viejo.
//   4. Construir dos veces da lo mismo: si no, cada publicación obligaría a
//      todos a bajar todo otra vez.
//   5. Lo que no es sitio (scripts, supabase, docs, api) no se publica.
//   6. vercel.json publica dist/ y sólo marca "immutable" lo que trae huella.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { construir } from './construir.mjs';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const fallos = [];
const revisa = (ok, msg) => { if (!ok) fallos.push(msg); };
let revisiones = 0;
const r = (ok, msg) => { revisiones++; revisa(ok, msg); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'construir-'));
const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
const { referencias, huella } = construir(a);
construir(b);

function lista(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? lista(path.join(dir, e.name), rel + '/' + e.name) : [rel + '/' + e.name]);
}
const publicados = lista(a);
const publicado = new Set(publicados);

// 1 y 2
const REF = /(['"`(])(\/[A-Za-z0-9_\-./]+\.(?:js|css|png|svg|jpg|jpeg|webp|woff2))(\?v=[A-Za-z0-9._-]*)?(?=['"`)])/g;
let conHuella = 0;
for (const f of publicados.filter(f => /\.(html|js|css)$/.test(f))) {
  const texto = fs.readFileSync(path.join(a, f), 'utf8');
  for (const [, , ruta, v] of texto.matchAll(REF)) {
    if (!publicado.has(ruta)) continue;
    if (ruta === '/sw.js') { r(!v, `${f}: /sw.js no debe llevar ?v= (su URL registra el service worker)`); continue; }
    r(!!v, `${f}: ${ruta} quedó sin huella`);
    if (!v) continue;
    conHuella++;
    r(/^\?v=[0-9a-f]{12}$/.test(v), `${f}: ${ruta}${v} no es una huella de contenido`);
    r(v === `?v=${huella.get(ruta)}`, `${f}: ${ruta}${v} no coincide con la huella del archivo`);
  }
}
r(conHuella === referencias && referencias > 300, `se esperaban más de 300 referencias con huella, hubo ${conHuella}/${referencias}`);

// Las URLs duplicadas (con y sin versión a mano) se unifican: el mismo módulo
// ya no se baja ni se ejecuta dos veces.
const urlsShell = new Set();
for (const f of publicados.filter(f => /\.(html|js)$/.test(f))) {
  for (const m of fs.readFileSync(path.join(a, f), 'utf8').matchAll(/\/v2\/shell\.js\?v=[^'"`]+/g)) urlsShell.add(m[0]);
}
r(urlsShell.size === 1, `/v2/shell.js se pide con ${urlsShell.size} URLs distintas`);

// 3: se cambia supabase-client.js en una copia y se reconstruye.
const copia = path.join(tmp, 'repo');
fs.cpSync(RAIZ, copia, { recursive: true, filter: s => !/[/\\](node_modules|\.git|dist|docs|supabase)$/.test(s) });
fs.appendFileSync(path.join(copia, 'v2/supabase-client.js'), '\n// cambio\n');
const { construir: construirCopia } = await import(path.join(copia, 'scripts/construir.mjs'));
const otra = construirCopia(path.join(tmp, 'c')).huella;
r(otra.get('/v2/supabase-client.js') !== huella.get('/v2/supabase-client.js'), 'cambiar supabase-client.js no cambió su huella');
r(otra.get('/v2/shell.js') !== huella.get('/v2/shell.js'), 'cambiar supabase-client.js no cambió la huella de shell.js, que lo importa');
r(otra.get('/v2/branding-auto.js') !== huella.get('/v2/branding-auto.js'), 'cambiar supabase-client.js no cambió la huella de branding-auto.js, que importa shell.js');
r(otra.get('/v2/dorsal.js') === huella.get('/v2/dorsal.js'), 'dorsal.js no importa el cliente y aun así cambió su huella');

// 4
const iguales = publicados.every(f => fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))));
r(iguales, 'dos construcciones seguidas no dan los mismos archivos');

// 5
for (const fuera of ['/scripts/', '/supabase/', '/docs/', '/api/', '/vercel.json', '/README.md', '/node_modules/']) {
  r(!publicados.some(f => f.startsWith(fuera)), `se publicaría ${fuera}`);
}
for (const dentro of ['/index.html', '/v2/index.html', '/sw.js', '/manifest.webmanifest', '/v2/shell.js', '/fonts/inter-400.woff2']) {
  r(publicado.has(dentro), `falta ${dentro} en lo publicado`);
}
r(fs.readFileSync(path.join(a, 'index.html')).equals(fs.readFileSync(path.join(a, 'v2/index.html'))), 'index.html y v2/index.html ya no son iguales tras construir');

// 6
const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
r(vercel.buildCommand === 'node scripts/construir.mjs', 'vercel.json no construye con scripts/construir.mjs');
r(vercel.outputDirectory === 'dist', 'vercel.json no publica dist/');
const inmutables = vercel.headers.filter(h => h.headers.some(x => x.key === 'Cache-Control' && /immutable/.test(x.value)));
r(inmutables.length === 1, `se esperaba una sola regla immutable, hay ${inmutables.length}`);
const regla = inmutables[0] || {};
r(vercel.headers.at(-1) === regla, 'la regla immutable debe ir al final para ganarle al no-cache general');
r((regla.has || []).some(h => h.type === 'query' && h.key === 'v' && h.value === '[0-9a-f]{12}'), 'la regla immutable debe exigir ?v= con huella de 12 hex');
const fuente = new RegExp('^' + String(regla.source || '').replace(/\\\\/g, '\\') + '$');
r(fuente.test('/v2/shell.js') && fuente.test('/fonts/inter-400.woff2'), 'la regla immutable no cubre JS y fuentes');
r(!fuente.test('/') && !fuente.test('/club/') && !fuente.test('/api/manifest') && !fuente.test('/index.html'), 'la regla immutable cubriría HTML o la API');

fs.rmSync(tmp, { recursive: true, force: true });
if (fallos.length) { console.error('Construcción QA FALLA:\n - ' + fallos.slice(0, 30).join('\n - ')); process.exit(1); }
console.log(`Construcción QA OK · ${revisiones} revisiones: ${conHuella} referencias con huella, todas resuelven; cambiar un módulo cambia a quien lo importa; HTML y API fuera de la caché larga`);
