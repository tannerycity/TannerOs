// El portal de becados (/becas/) en Chromium a 390px, con Supabase falso.
//
// Presidencia, 09/10/2026: "lo puede ver Presidencia y Dirección, los demás
// no". Y el mensaje a la familia es de atención: firmado por el club y sin
// mencionar la beca. Revisa:
//   · quien no tiene permiso ve "Sin acceso" y nunca pide el padrón;
//   · marcador, focos, filtros y orden (lo que hay que atender, arriba);
//   · el expediente con su % contra 90, vencimiento y el botón a la familia;
//   · sin teléfono, no hay botón; las caras son sólo miniaturas.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4803, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const PORTAL = {
  from: '2026-10-01', to: '2026-10-31', goal: 90,
  rows: [
    { playerId: 'p1', name: 'Zoe Ramírez', code: 'Tanner001', categoryName: 'T10', type: 'scholarship_full', calculation: 'full_waiver', percentage: 100, monthlyFee: 0,
      fundingSource: null, startsOn: '2026-07-01', endsOn: '2027-06-30', daysLeft: 264, notes: 'Talento destacado', attended: 9, marked: 10, pct: 90, streak: 0,
      lastSeen: '2026-10-07T00:00:00Z', guardianName: 'Laura', phone: '5511111111', thumb: 'p1-thumb.webp', bucket: 'tanneros-private' },
    { playerId: 'p2', name: 'José Ignacio Ramírez', code: 'Tanner002', categoryName: 'T8', type: 'scholarship_partial', calculation: 'informational', percentage: 50, monthlyFee: 600,
      fundingSource: null, startsOn: '2026-07-01', endsOn: '2026-12-31', daysLeft: 83, notes: null, attended: 1, marked: 3, pct: 33.3, streak: 2,
      lastSeen: '2026-09-20T00:00:00Z', guardianName: 'Juan Ignacio Ramírez', phone: '5522222222', thumb: null },
    { playerId: 'p3', name: 'Ciro Patrocinado', code: 'Tanner003', categoryName: 'T12', type: 'sponsor_funded', calculation: 'fixed_amount', fixedAmount: 800, monthlyFee: 400,
      fundingSource: 'Ferretería Don Trapo', startsOn: '2026-08-01', endsOn: '2026-10-25', daysLeft: 16, notes: 'Convenio', attended: 0, marked: 0, pct: null, streak: 0,
      lastSeen: null, guardianName: null, phone: null, thumb: null }
  ],
  requests: [{ id: 'r1', playerId: 'p2', name: 'José Ignacio Ramírez', guardian: 'Juan Ignacio Ramírez', reason: 'Perdí el trabajo', requestedAt: '2026-10-02T00:00:00Z' }]
};

async function abre({ puede = true, rol = 'Presidencia' } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ puede, rol, PORTAL }) => {
    window.__llamadas = []; window.__firmadas = [];
    const R = {
      v2_my_context: [{ organization_id: 'o1', organization_name: 'Tannery City FC', role: rol, is_owner: rol === 'Presidencia' }],
      v2_can_see_scholarships: puede,
      v2_scholarship_portal: PORTAL
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), getUser: async () => ({ data: { user: { id: 'u' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async n => { window.__llamadas.push(n); return { data: R[n] ?? null, error: null }; },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { puede, rol, PORTAL });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: [
    'export async function getSignedPhotoUrls(_s,b,paths){ const m={}; for(const x of paths){ window.__firmadas.push(x); m[x]="/icon-512.png?"+x; } return m; }',
    'export async function getSignedPhotoUrl(){ return null; }', 'export async function getRawSignedPhotoUrl(){ return null; }',
    'export function clearPhotoCache(){}', 'export function forgetPhoto(){}'].join('\n') }));
  await p.goto('http://127.0.0.1:4803/v2/becas/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.getElementById('loadingView') || document.getElementById('loadingView').classList.contains('hidden'), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  return p;
}

// --- Quien no es Presidencia ni Dirección ---
{
  const p = await abre({ puede: false, rol: 'Formadores' });
  revisa('[acceso] Formadores ve "Sin acceso"', await p.isVisible('#deniedView') && await p.isHidden('#view'));
  revisa('[acceso] y nunca se pide el padrón', !(await p.evaluate(() => window.__llamadas.includes('v2_scholarship_portal'))));
  await p.close();
}

// --- Presidencia ---
{
  const p = await abre();
  revisa('[portal] Presidencia entra', await p.isVisible('#view'));
  revisa('[marcador] 3 becados, 1 total y 1 parcial', (await p.textContent('#mTotal')) === '3' && (await p.textContent('#mTipos')) === '1 · 1', `${await p.textContent('#mTotal')} / ${await p.textContent('#mTipos')}`);
  // 10 de 13 marcadas.
  revisa('[marcador] asistencia de los becados con listas', (await p.textContent('#mPct')) === '77%', await p.textContent('#mPct'));
  const focos = await p.$$eval('#bcFocos .bc-foco', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  revisa('[focos] debajo de 90%, por vencer, solicitudes y sin motivo', /^1 Debajo de 90%/.test(focos[0]) && /^1 Por vencer/.test(focos[1]) && /^1 Solicitudes/.test(focos[2]) && /^1 Sin motivo/.test(focos[3]), focos.join(' | '));
  revisa('[solicitudes] se ve la de la familia con su motivo', /Perdí el trabajo/.test(await p.innerText('#bcSolicitudes')));
  const orden = await p.$$eval('#bcLista .bc-fila strong', els => els.map(e => e.textContent));
  revisa('[orden] primero el que está debajo de 90, luego el que vence', JSON.stringify(orden) === '["José Ignacio Ramírez","Ciro Patrocinado","Zoe Ramírez"]', JSON.stringify(orden));
  const ciro = (await p.innerText('#bcLista .bc-fila:nth-child(2)')).replace(/\s+/g, ' ');
  revisa('[fila] patrocinio con monto, vencimiento y sin rojo si no hay listas', /PATROCINIO · \$800/i.test(ciro) && /Vence en 16 días/.test(ciro) && /Sin listas/i.test(ciro), ciro);
  revisa('[caras] sólo se firman miniaturas', (await p.evaluate(() => window.__firmadas)).every(x => /-thumb\./.test(x)));
  revisa('[sin desborde] nada se sale a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  // Filtros
  await p.click('#bcFiltros [data-f="debajo"]');
  revisa('[filtro] "Debajo de 90%" deja sólo a José', (await p.$$('#bcLista .bc-fila')).length === 1);
  await p.click('#bcFiltros [data-f="todos"]');
  await p.fill('#bcBuscar', 'zoe');
  revisa('[buscar] encuentra por nombre', (await p.$$eval('#bcLista .bc-fila strong', e => e.map(x => x.textContent))).join() === 'Zoe Ramírez');
  await p.fill('#bcBuscar', '');

  // Expediente
  await p.click('#bcLista .bc-fila[data-id="p2"]');
  await p.waitForSelector('#bcFondo:not(.hidden)');
  const hoja = (await p.innerText('#bcHoja')).replace(/\s+/g, ' ');
  revisa('[expediente] su % contra 90 y cuántas vino', /33%/.test(hoja) && /meta 90%/.test(hoja) && /Vino a 1 de 3 entrenamientos/.test(hoja) && /2 faltas seguidas/.test(hoja), hoja.slice(0, 200));
  revisa('[expediente] tipo, cuánto cubre y cuota', /Beca parcial/.test(hoja) && /50%/.test(hoja) && /\$600/.test(hoja), hoja);
  revisa('[expediente] avisa que falta el motivo', /Sin motivo escrito/.test(hoja));
  revisa('[expediente] liga al expediente del Tanner', (await p.getAttribute('.bc-expediente', 'href')) === '/jugadores/?player=p2');
  const wa = await p.getAttribute('.bc-familia', 'href');
  const texto = decodeURIComponent((wa || '').split('?text=')[1] || '');
  revisa('[familia] WhatsApp al tutor con lada', /^https:\/\/wa\.me\/525522222222\?text=/.test(wa || ''), wa);
  revisa('[familia] firmado por el club y sin mencionar la beca', /^Hola Juan, te escribimos de Tannery City FC\./.test(texto) && /Tannery City FC$/.test(texto) && !/beca|90 ?%/i.test(texto), texto);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/becas-expediente.png') });
  await p.click('#bcCerrar');
  await p.click('#bcLista .bc-fila[data-id="p3"]');
  revisa('[familia] sin teléfono no hay botón', (await p.$('.bc-familia')) === null && /no tiene teléfono/.test(await p.innerText('#bcHoja')));
  revisa('[patrocinio] dice quién lo cubre', /Ferretería Don Trapo/.test(await p.innerText('#bcHoja')));
  await p.keyboard.press('Escape');
  revisa('[expediente] Escape cierra', await p.isHidden('#bcFondo'));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/becas.png'), fullPage: true });
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Becas humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Becas humo OK · ${revisiones.length} revisiones: sólo Presidencia y Dirección, focos, orden, expediente y mensaje a la familia`);
