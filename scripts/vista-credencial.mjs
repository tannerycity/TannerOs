/* Dibuja la credencial y la tarjeta de redes con datos reales y las guarda
 * como PNG, para poder mirarlas.
 *
 * Una tarjeta se revisa con los ojos: que un renglon no se encime con otro, o
 * que un nombre largo no se salga, no lo dice ninguna aserción. Esto no es una
 * prueba —esa es scripts/qa-credencial.mjs— es el banco de pruebas.
 *
 *   node scripts/vista-credencial.mjs
 *
 * Escribe en docs/evidencias/. No corre en CI.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const TIPOS = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png',
                '.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4701, r));

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await nav.newPage({ viewport: { width: 540, height: 960 } });
pg.on('pageerror', e => { console.error('ERROR EN PAGINA:', e.message); });
await pg.goto('http://127.0.0.1:4701/registro/');

// Los tres casos que importan: el que casi no trae datos (un Baby Tanner
// recien registrado, que es el de la captura real), el que trae todo, y el de
// redes.
const CASOS = [
  ['credencial-minima', {
    firstName: 'Mauricio', lastName: 'Torres Avila', category: 'Baby Tanner',
    folio: 'TC-2026-00020', dateStr: '26 SEP 2026', birthDate: '2024-05-02'
  }],
  ['credencial-completa', {
    firstName: 'Maximiliano', lastName: 'de la Torre Zamora', category: 'T12',
    folio: 'TC-2026-00021', dateStr: '28 SEP 2026', birthDate: '2014-03-14',
    dominantFoot: 'left', school: 'Colegio Valladolid', jerseyNumber: '10', position: 'Mediocampista'
  }],
  ['redes', {
    firstName: 'Mauricio', lastName: 'Torres Avila', category: 'Baby Tanner',
    folio: 'TC-2026-00020', dateStr: '26 SEP 2026', birthDate: '2024-05-02',
    school: 'Jardín Santa Fe', imageConsent: true, modo: 'redes'
  }]
];

fs.mkdirSync(path.join(RAIZ, 'docs/evidencias'), { recursive: true });
for (const [nombre, datos] of CASOS) {
  const dataUrl = await pg.evaluate(async (d) => {
    const { renderWelcomeCard } = await import('/welcome-card.js');
    const { canvas } = await renderWelcomeCard(d);
    return canvas.toDataURL('image/jpeg', 0.88);
  }, datos);
  const destino = `docs/evidencias/ficha-${nombre}.jpg`;
  fs.writeFileSync(path.join(RAIZ, destino), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`${destino} · ${(fs.statSync(path.join(RAIZ, destino)).size / 1024).toFixed(0)} KB`);
}

/* LA VERIFICACION QUE IMPORTA: que el QR de verdad escanee.
 *
 * No basta con que salga un cuadro con puntos. Se lee de vuelta con un
 * decodificador real (jsqr) sobre los PIXELES que se acaban de dibujar, y
 * tiene que salir exactamente la liga que se metio. Esto es lo que separa un
 * QR de una decoracion que se le parece.
 *
 * jsqr no vive en el repositorio —aqui no hay package.json a proposito— asi
 * que si no esta instalado en la maquina, se dice y no se finge que paso. */
const rutaJsqr = '/tmp/claude-0/node_modules/jsqr/dist/jsQR.js';
if (fs.existsSync(rutaJsqr)) {
  const liga = 'https://app.tannerycity.com/v2/?buscar=TC-2026-00021';
  const leido = await pg.evaluate(async ({ codigo, datos }) => {
    const { renderWelcomeCard } = await import('/welcome-card.js');
    const { canvas } = await renderWelcomeCard(datos);
    // Se recorta la esquina donde vive el QR, como haria una camara.
    const x = 96, y = 1470, lado = 230;
    const recorte = document.createElement('canvas');
    recorte.width = lado; recorte.height = lado;
    recorte.getContext('2d').drawImage(canvas, x, y, lado, lado, 0, 0, lado, lado);
    const px = recorte.getContext('2d').getImageData(0, 0, lado, lado);
    // eslint-disable-next-line no-eval
    (0, eval)(codigo);
    const jsQR = window.jsQR || window.default;
    const r = jsQR(px.data, lado, lado);
    return r ? r.data : null;
  }, { codigo: fs.readFileSync(rutaJsqr, 'utf8'), datos: CASOS[1][1] });

  console.log(leido === liga
    ? `QR verificado · se decodifico de los pixeles: ${leido}`
    : `QR FALLO · se leyo ${JSON.stringify(leido)}, se esperaba ${liga}`);
  if (leido !== liga) process.exitCode = 1;
} else {
  console.log('QR sin verificar: falta jsqr (npm install jsqr en /tmp/claude-0)');
  process.exitCode = 1;
}

// Y el candado: en modo redes sin permiso no debe dibujarse nada.
const bloqueo = await pg.evaluate(async () => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  try { await renderWelcomeCard({ firstName: 'X', lastName: 'Y', modo: 'redes' }); return 'SE DIBUJO (mal)'; }
  catch (e) { return `bloqueado: ${e.message}`; }
});
console.log(bloqueo);

await nav.close(); srv.close();
