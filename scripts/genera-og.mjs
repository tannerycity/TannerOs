/* Genera la imagen de preview del link de registro.
 *
 * Por que existe: el link de registro no tenia una sola etiqueta og:, asi que
 * pegado en WhatsApp salia una URL pelona. Un link sin preview compite en la
 * conversacion contra fotos y audios, y pierde.
 *
 * Por que se genera aqui y no a mano: la imagen tiene que salir de los MISMOS
 * assets de marca que usa la tarjeta de bienvenida (brand/crest-gold.png y
 * brand/wordmark-gold.png). Si alguien cambia el escudo, se vuelve a correr
 * esto y el preview no se queda con el escudo viejo.
 *
 *   node scripts/genera-og.mjs
 *
 * Escribe brand/og-registro.png (1200x630, la proporcion que piden WhatsApp,
 * Facebook, X y LinkedIn). El archivo SI se sube al repo: es un asset, no un
 * artefacto de build, y el sitio es estatico.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const W = 1200, H = 630;
// JPEG y no PNG: el preview se descarga cada vez que alguien pega el link en
// una conversacion. En PNG este degradado pesa 759 KB; en JPEG al 90% pesa una
// decima parte y nadie nota la diferencia en una burbuja de WhatsApp.
const SALIDA = 'brand/og-registro.jpg';

const TIPOS = { '.html':'text/html', '.js':'text/javascript','.mjs':'text/javascript', '.css':'text/css',
                '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4699, r));

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await nav.newPage({ viewport: { width: W, height: H } });
await pg.goto('http://127.0.0.1:4699/brand/crest-gold.png');

const dataUrl = await pg.evaluate(async ({ W, H }) => {
  const carga = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const fuente = async (fam, peso, url) => {
    try { const f = new FontFace(fam, `url(${url})`, { weight: peso }); document.fonts.add(await f.load()); } catch (e) {}
  };
  await Promise.all([
    fuente('Barlow Condensed', '800', '/fonts/barlow-condensed-800.woff2'),
    fuente('Inter', '600', '/fonts/inter-600.woff2'),
    fuente('Inter', '800', '/fonts/inter-800.woff2')
  ]);
  const [escudo, letras] = await Promise.all([carga('/brand/crest-gold.png'), carga('/brand/wordmark-gold.png')]);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // Fondo navy con el mismo degradado del encabezado de la credencial.
  const g = x.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, '#0f2b32'); g.addColorStop(1, '#07191e');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Textura de papel de seguridad, igual que la tarjeta: es la misma familia.
  x.save(); x.globalAlpha = 0.05; x.strokeStyle = '#c8ae62'; x.lineWidth = 2;
  x.beginPath();
  for (let ox = -H; ox < W + H; ox += 26) { x.moveTo(ox, 0); x.lineTo(ox + H, H); }
  x.stroke(); x.restore();

  // Escudo
  const eh = 150, ew = eh * (escudo.width / escudo.height);
  x.drawImage(escudo, W / 2 - ew / 2, 74, ew, eh);
  // Letras
  const lh = 74, lw = lh * (letras.width / letras.height);
  x.drawImage(letras, W / 2 - lw / 2, 74 + eh + 16, lw, lh);

  // Barra dorada
  const bg = x.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
  bg.addColorStop(0, 'rgba(169,137,90,0)'); bg.addColorStop(0.5, '#e9d19c'); bg.addColorStop(1, 'rgba(169,137,90,0)');
  x.fillStyle = bg; x.fillRect(W / 2 - 180, 74 + eh + 16 + lh + 30, 360, 3);

  // El llamado. Lo que la gente lee en la burbuja de WhatsApp antes de tocar.
  x.textAlign = 'center';
  x.font = '800 74px "Barlow Condensed"';
  x.fillStyle = '#f6f2e8';
  x.fillText('ÚNETE A TANNERY CITY', W / 2, 468);

  const esp = (txt, cx, cy, font, sep, color) => {
    x.font = font; x.fillStyle = color;
    const anchos = [...txt].map(ch => x.measureText(ch).width);
    const total = anchos.reduce((s, a) => s + a, 0) + sep * (txt.length - 1);
    let px = cx - total / 2;
    x.textAlign = 'left';
    [...txt].forEach((ch, i) => { x.fillText(ch, px, cy); px += anchos[i] + sep; });
    x.textAlign = 'center';
  };
  esp('REGISTRO ABIERTO · TEMPORADA 2026', W / 2, 516, '600 20px Inter', 3, '#c8ae62');

  // Pie
  x.fillStyle = 'rgba(200,174,98,.25)'; x.fillRect(0, 560, W, 2);
  esp('#WEARETANNERS', W / 2, 600, '800 26px "Barlow Condensed"', 2, '#ffffff');

  return c.toDataURL('image/jpeg', 0.9);
}, { W, H });

fs.writeFileSync(path.join(RAIZ, SALIDA), Buffer.from(dataUrl.split(',')[1], 'base64'));
await nav.close(); srv.close();

const bytes = fs.statSync(path.join(RAIZ, SALIDA)).size;
console.log(`${SALIDA} · ${W}x${H} · ${(bytes / 1024).toFixed(0)} KB`);
