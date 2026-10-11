// Primeros pasos del dueño (/admin/onboarding/) y datos para cobrar
// (/admin/club/#cobro) en Chromium, con Supabase falso.
//
// Presidencia, 10/10/2026: que la app guíe al dueño de un club nuevo. Revisa:
//   · los pasos van numerados y en orden; el primero que falta dice
//     "Siguiente" y su botón lleva a donde se resuelve;
//   · la liga de registro del club se puede copiar y mandar por WhatsApp;
//   · los datos de pago: una CLABE mal escrita no llega al servidor, una
//     buena se guarda con banco, titular y métodos;
//   · nada se sale a 390px.
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
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre(ruta, { pasos } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ pasos }) => {
    window.__llamadas = [];
    let pago = { methods: ['Efectivo'] };
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Ana', organization_id: 'o9', organization_name: 'Halcones FC', organization_slug: 'halcones', role: 'Presidencia', is_owner: true }],
      v2_my_navigation: () => ['admin', 'inicio', 'jugadores'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_onboarding_readiness: () => pasos,
      v2_organization_settings: () => ({ name: 'Halcones FC', timezone: 'America/Mexico_City', locale: 'es-MX', currency: 'MXN' }),
      v2_club_config: () => ({ name: 'Halcones FC', whatsapp: '524771112233', passwordPrefix: 'HF', storeUrl: null, paymentInstructions: pago }),
      v2_update_payment_info: prm => { pago = { methods: prm.info.methods, transfer: { bank: prm.info.bank, clabe: prm.info.clabe, holder: prm.info.holder } }; return {}; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { pasos });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export function clearPhotoCache(){}' }));
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n), n);
const PASOS = { percent: 17, ready: 1, total: 6, checks: [
  { code: 'escudo', label: 'Tu escudo y colores', status: 'ready', detail: 'Listo', href: '/admin/branding/', cta: 'Subir escudo' },
  { code: 'aviso', label: 'Tu aviso de privacidad', status: 'blocker', detail: 'Falta tu domicilio y tu correo de contacto.', href: '/admin/centro-tanner/', cta: 'Completar aviso' },
  { code: 'cuotas', label: 'Cuotas por categoría', status: 'warning', detail: '1 de 2 categorías sin mensualidad.', href: '/taquilla/?ver=montos', cta: 'Poner cuotas' },
  { code: 'cobro', label: 'Datos para que te paguen', status: 'warning', detail: 'Pon tu banco y CLABE.', href: '/admin/club/#cobro', cta: 'Poner datos de pago' },
  { code: 'jugadores', label: 'Tus jugadores', status: 'blocker', detail: 'Trae tu lista de Excel.', href: '/jugadores/importar/', cta: 'Importar desde Excel' },
  { code: 'equipo', label: 'Tu equipo', status: 'warning', detail: 'Invita a tus profes.', href: '/usuarios/', cta: 'Invitar' }] };

{ // Primeros pasos
  const p = await abre('/v2/admin/onboarding/', { pasos: PASOS });
  await p.waitForSelector('#checkList .onboarding-check', { timeout: 5000 });
  const pasos = await p.$$eval('#checkList .onboarding-check', as => as.map(a => ({ n: a.querySelector('.check-num').textContent, href: a.getAttribute('href'),
    estado: a.querySelector('.check-status').textContent, cta: a.querySelector('.check-cta').textContent, sig: a.classList.contains('siguiente') })));
  revisa('[pasos] seis, numerados y en orden', pasos.length === 6 && pasos.map(x => x.n).join('') === '123456', JSON.stringify(pasos.map(x => x.n)));
  revisa('[pasos] el primero que falta es el siguiente, y sólo él', pasos[1].sig && pasos[1].estado === 'Siguiente' && pasos.filter(x => x.sig).length === 1, JSON.stringify(pasos));
  revisa('[pasos] cada uno lleva a donde se resuelve', pasos[1].href === '/admin/centro-tanner/' && pasos[4].href === '/jugadores/importar/' && pasos[4].cta === 'Importar desde Excel');
  revisa('[pasos] lo listo dice "Ver", no vuelve a pedir', pasos[0].cta === 'Ver' && pasos[0].estado === 'Listo');
  revisa('[pasos] el avance', (await p.textContent('#readinessText')) === '1 de 6 pasos listos' && (await p.textContent('#readinessPercent')) === '17%');
  const liga = await p.textContent('#ligaTexto');
  revisa('[liga] la liga de registro es la del club', /\/registro\/\?club=halcones$/.test(liga), liga);
  const wa = await p.getAttribute('#ligaWa', 'href');
  revisa('[liga] se manda por WhatsApp con el nombre del club', /^https:\/\/wa\.me\/\?text=/.test(wa) && /Halcones FC/.test(decodeURIComponent(wa)), wa);
  const fondo = await p.$eval('.onboarding-hero', e => getComputedStyle(e).backgroundImage + ' ' + getComputedStyle(e).backgroundColor);
  revisa('[encabezado] tiene fondo oscuro (el texto es blanco)', /gradient/.test(fondo), fondo);
  revisa('[sin desborde] los pasos caben a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  await p.close();
}

{ // Datos para cobrar
  const p = await abre('/v2/admin/club/#cobro');
  await p.waitForSelector('#payForm', { timeout: 5000 });
  await p.waitForFunction(() => document.querySelector('.pay-metodos input[value="Efectivo"]')?.checked, null, { timeout: 4000 }).catch(() => {});
  revisa('[cobro] carga lo que ya tenía', await p.isChecked('.pay-metodos input[value="Efectivo"]') && !(await p.isChecked('.pay-metodos input[value="Tarjeta"]')));
  await p.fill('#payBank', 'Banregio'); await p.fill('#payHolder', 'Halcones AC');
  await p.fill('#payClabe', '167210000079567651');
  await p.click('#savePay');
  revisa('[cobro] una CLABE mal escrita no llega al servidor', /no es válida/.test(await p.textContent('#payMessage')) && (await llamadas(p, 'v2_update_payment_info')).length === 0);
  await p.fill('#payClabe', '1672 1000 0079 5676 50');
  await p.check('.pay-metodos input[value="Transferencia"]');
  await p.click('#savePay');
  await p.waitForFunction(() => /guardados/.test(document.getElementById('payMessage').textContent), null, { timeout: 4000 }).catch(() => {});
  const g = await llamadas(p, 'v2_update_payment_info');
  revisa('[cobro] una buena se guarda con banco, titular y métodos', g.length === 1 && g[0].prm.info.clabe === '167210000079567650' && g[0].prm.info.bank === 'Banregio'
    && g[0].prm.info.holder === 'Halcones AC' && JSON.stringify(g[0].prm.info.methods) === '["Transferencia","Efectivo"]', JSON.stringify(g));
  revisa('[cobro] y lo vuelve a mostrar', (await p.inputValue('#payClabe')) === '167210000079567650');
  revisa('[sin desborde] el formulario cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Primeros pasos humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Primeros pasos humo OK · ${revisiones.length} revisiones: pasos en orden, el siguiente resaltado, liga de registro y datos para cobrar`);
