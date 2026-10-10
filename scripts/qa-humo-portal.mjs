// Portal de la plataforma (/admin/clubes/) en Chromium, con Supabase falso.
//
// Presidencia, 10/10/2026: "un portal para dar de alta un club y
// configurarlo fácil". Revisa:
//   · quien no es administrador de plataforma no ve nada;
//   · tablero: clubes, jugadores, ingreso estimado, dueños sin entrar, planes;
//   · alta en 5 pasos: no avanza con datos faltantes; el identificador sale
//     del nombre; categorías sugeridas con mensualidad; resumen;
//   · lo que se manda al servidor es exactamente lo capturado;
//   · al final, el mensaje de bienvenida con WhatsApp al dueño;
//   · cambiar el nombre del producto.
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
await new Promise(r => srv.listen(4807, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ admin = true, ancho = 390 } = {}) {
  const p = await nav.newPage({ viewport: { width: ancho, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ admin }) => {
    window.__llamadas = [];
    const planes = [
      { code: 'cantera', name: 'Cantera', priceMxn: 990, maxPlayers: 50, extraPlayerMxn: 15, modules: 14, description: 'Lo básico' },
      { code: 'primera', name: 'Primera', priceMxn: 1990, maxPlayers: 150, modules: 22, description: 'Todo Cantera y más' },
      { code: 'seleccion', name: 'Selección', priceMxn: 3490, maxPlayers: null, modules: 27, description: 'Todo' }];
    const estado = { product: { name: 'TannerOS', tagline: 'El sistema operativo de tu club' }, plans: planes,
      clubs: [{ id: 'o1', slug: 'tannery-city-fc', name: 'Tannery City FC', city: 'León', planCode: 'internal_full', plan: 'Tannery Internal Full', players: 64, users: 9, categories: 5, colors: { primary: '#184159', secondary: '#247C8F' }, lastActivity: new Date().toISOString() },
        // Un club Cantera que ya pasó su límite (53 de 50) y no ha completado su aviso.
        { id: 'o2', slug: 'halcones', name: 'Halcones FC', city: 'Silao', planCode: 'cantera', plan: 'Cantera', players: 53, users: 2, categories: 2, docsPending: 1, colors: { primary: '#222222', secondary: '#555555' }, lastActivity: new Date().toISOString() }] };
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Presidencia', is_owner: true }],
      v2_my_navigation: () => ['admin', 'inicio'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_am_i_platform_admin: () => admin,
      // "Tu plan" en Administración: un Cantera con 53 de 50 y el aviso por completar.
      v2_my_plan: () => ({ plan: 'Cantera', planCode: 'cantera', forSale: window.__planDeVenta !== false, priceMxn: 990, founder: false, maxPlayers: 50, activePlayers: 53, extraPlayers: 3, extraPlayerMxn: 15, docsPending: 1 }),
      v2_platform_board: () => JSON.parse(JSON.stringify(estado)),
      v2_set_product_name: prm => { estado.product = { name: prm.name, tagline: prm.tagline }; return null; },
      v2_provision_club: prm => {
        const c = prm.club;
        estado.clubs.push({ id: 'o2', slug: c.slug, name: c.name, city: c.city, planCode: c.planCode, plan: planes.find(x => x.code === c.planCode).name, founder: c.founder,
          players: 0, users: 0, categories: c.categories.length, colors: c.colors, ownerPending: c.owner.email });
        return { organizationId: 'o2', slug: c.slug, name: c.name, plan: c.planCode, categories: c.categories.length, ownerEmail: c.owner.email, ownerName: c.owner.name, ownerPhone: c.owner.phone };
      }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { admin });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto('http://127.0.0.1:4807/v2/admin/clubes/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.getElementById('pf').classList.contains('hidden') || !document.getElementById('pfDenied').classList.contains('hidden'), null, { timeout: 8000 });
  return p;
}
const llamada = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).at(-1)?.prm, n);

{
  const p = await abre({ admin: false });
  revisa('[acceso] quien no administra la plataforma no ve el portal', await p.isVisible('#pfDenied') && await p.isHidden('#pf'));
  revisa('[acceso] y nunca pide el tablero', !(await p.evaluate(() => window.__llamadas.some(x => x.n === 'v2_platform_board'))));
  await p.close();
}

{
  const p = await abre();
  revisa('[tablero] el nombre del producto', (await p.textContent('#pfProducto')) === 'TannerOS');
  revisa('[tablero] clubes y jugadores', (await p.textContent('#kClubes')) === '2' && (await p.textContent('#kJugadores')) === '117');
  revisa('[tablero] Tannery City no cuenta como ingreso; el Cantera con 3 extras sí ($990 + $45)', /\$1,035/.test(await p.textContent('#kIngreso')), await p.textContent('#kIngreso'));
  const halcones = await p.innerText('#pfClubes');
  revisa('[tablero] el club que pasó su límite dice cuántos extras y cuánto', /53\/50 jugadores · \+3 extra \(\$45\)/.test(halcones), halcones);
  revisa('[tablero] y que le falta completar su aviso', /1 documento por completar/.test(halcones));
  revisa('[tablero] los tres planes con su precio', (await p.$$('#pfPlanes .pf-plancard')).length === 3 && /\$1,990/.test(await p.innerText('#pfPlanes')));

  // Alta
  await p.click('#pfAlta');
  revisa('[alta] abre en el paso 1 de 5', /Paso 1 de 5/.test(await p.textContent('#azPasoTxt')) && (await p.textContent('#azTitulo')) === 'Identidad');
  await p.click('#azSig');
  revisa('[alta] sin nombre no avanza', /nombre del club/.test(await p.textContent('#azMsg')) && (await p.textContent('#azTitulo')) === 'Identidad');
  await p.fill('#aNombre', 'Club Atlético León Norte');
  revisa('[alta] el identificador sale del nombre', (await p.inputValue('#aSlug')) === 'club-atletico-leon-norte');
  await p.fill('#aCiudad', 'León');
  await p.evaluate(() => { const i = document.getElementById('aC1'); i.value = '#aa0000'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  revisa('[alta] la vista previa toma el color del club', /rgb\(170, 0, 0\)/.test(await p.$eval('#aVista', e => e.style.background)));
  await p.click('#azSig');

  revisa('[plan] paso 2: Cantera viene elegido', (await p.textContent('#azTitulo')) === 'Plan' && await p.$eval('[data-plan="cantera"]', b => b.classList.contains('activo')));
  await p.click('[data-plan="primera"]');
  await p.check('#aFundador');
  await p.click('#azSig');

  revisa('[categorías] paso 3', (await p.textContent('#azTitulo')) === 'Categorías');
  await p.click('#azSig');
  revisa('[categorías] sin categorías no avanza', /al menos una categoría/.test(await p.textContent('#azMsg')));
  await p.fill('#aCuota', '550'); await p.dispatchEvent('#aCuota', 'change');
  await p.click('[data-cat="Sub-8"]'); await p.click('[data-cat="Sub-10"]');
  await p.fill('#aOtraCat', 'Porteras'); await p.click('#aAgregaCat');
  revisa('[categorías] las tocadas y la escrita, con la mensualidad general', JSON.stringify(await p.$$eval('#aCats .az-cat', e => e.map(x => [x.querySelector('strong').textContent, x.querySelector('input').value]))) === '[["Sub-8","550"],["Sub-10","550"],["Porteras","550"]]');
  await p.fill('#aCats [data-cuota="2"]', '400');
  await p.click('#azSig');

  revisa('[cobro] paso 4 con día 1, vence 5 y $100 de entrada', (await p.textContent('#azTitulo')) === 'Cobro' && (await p.inputValue('#aCobro')) === '1' && (await p.inputValue('#aVence')) === '5' && (await p.inputValue('#aRecargo')) === '100');
  await p.fill('#aVence', '40'); await p.click('#azSig');
  revisa('[cobro] un día imposible no pasa', /1 al 28/.test(await p.textContent('#azMsg')));
  await p.fill('#aVence', '10'); await p.click('#azSig');

  revisa('[dueño] paso 5', (await p.textContent('#azTitulo')) === 'Dueño');
  await p.fill('#aDueno', 'juan pérez'); await p.fill('#aCorreo', 'juan'); await p.click('#azSig');
  revisa('[dueño] sin correo válido no pasa', /correo válido/.test(await p.textContent('#azMsg')));
  await p.fill('#aCorreo', 'Juan@LeonNorte.MX'); await p.fill('#aTel', '477 123 4567');
  await p.click('#azSig');

  const resumen = (await p.innerText('#azCuerpo')).replace(/\s+/g, ' ');
  revisa('[resumen] todo lo capturado, antes de crear', /Club Atlético León Norte/.test(resumen) && /Primera/.test(resumen) && /Fundador/.test(resumen) && /Porteras/.test(resumen) && /vence el 10/.test(resumen) && /juan@leonnorte\.mx/.test(resumen), resumen.slice(0, 300));
  revisa('[resumen] el botón dice Crear club', (await p.textContent('#azSig')) === 'Crear club');
  await p.click('#azSig');
  await p.waitForFunction(() => /quedó creado/.test(document.getElementById('azTitulo').textContent), null, { timeout: 4000 });

  const c = (await llamada(p, 'v2_provision_club')).club;
  revisa('[servidor] identidad y plan', c.name === 'Club Atlético León Norte' && c.slug === 'club-atletico-leon-norte' && c.city === 'León' && c.planCode === 'primera' && c.founder === true && c.colors.primary === '#aa0000', JSON.stringify(c).slice(0, 200));
  revisa('[servidor] categorías con su mensualidad', JSON.stringify(c.categories) === '[{"name":"Sub-8","monthlyFee":550},{"name":"Sub-10","monthlyFee":550},{"name":"Porteras","monthlyFee":400}]', JSON.stringify(c.categories));
  revisa('[servidor] cobro y dueño limpios', c.chargeDay === 1 && c.dueDay === 10 && c.lateFee === 100 && c.owner.email === 'juan@leonnorte.mx' && c.owner.phone === '4771234567');

  const bienvenida = await p.textContent('#aBienvenida');
  revisa('[bienvenida] dice dónde entrar y con qué correo', /^Hola Juan, ya está listo Club Atlético León Norte en TannerOS\./.test(bienvenida) && /Crea tu cuenta con este correo: juan@leonnorte\.mx/.test(bienvenida), bienvenida);
  revisa('[bienvenida] botón de WhatsApp al dueño con lada', /^https:\/\/wa\.me\/524771234567\?text=/.test(await p.getAttribute('.az-listo .pf-cta', 'href') || ''));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/portal-alta-lista.png') });
  await p.click('#azSig');
  revisa('[tablero] el club nuevo ya sale, con su dueño pendiente', (await p.textContent('#kClubes')) === '3' && /Dueño sin entrar: juan@leonnorte\.mx/.test(await p.innerText('#pfClubes')) && (await p.textContent('#kPendientes')) === '1');
  revisa('[tablero] el ingreso estimado cuenta al fundador a mitad', /\$2,030/.test(await p.textContent('#kIngreso')), await p.textContent('#kIngreso'));
  revisa('[sin desborde] nada se sale a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  // Nombre del producto
  const respuestas = ['Cancha OS', 'Tu club, en orden'];
  p.on('dialog', d => d.accept(respuestas.shift()));
  await p.click('#pfRenombrar');
  await p.waitForFunction(() => document.getElementById('pfProducto').textContent === 'Cancha OS', null, { timeout: 4000 });
  revisa('[producto] se cambia el nombre sin tocar código', (await llamada(p, 'v2_set_product_name')).name === 'Cancha OS' && (await p.textContent('#pfLema')) === 'Tu club, en orden');
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/portal.png'), fullPage: true });

  // Tu plan, en Administración del club
  await p.goto('http://127.0.0.1:4807/v2/admin/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#planCard:not(.hidden)', { timeout: 5000 }).catch(() => {});
  const plan = await p.evaluate(() => ({ visible: !document.getElementById('planCard').classList.contains('hidden'),
    nombre: document.getElementById('planName').textContent, uso: document.getElementById('planUso').textContent,
    tono: document.getElementById('planCard').dataset.tono, docs: document.getElementById('planDocs'), }))
    .then(x => ({ ...x, docs: undefined }));
  const docs = await p.$eval('#planDocs', a => ({ texto: a.textContent, href: a.getAttribute('href'), oculto: a.classList.contains('hidden') }));
  revisa('[tu plan] el dueño ve su plan y su uso', plan.visible && plan.nombre === 'Cantera' && /Los 3 de más se cobran a \$15 cada uno \(\$45 al mes\)/.test(plan.uso) && plan.tono === 'extra', JSON.stringify(plan));
  revisa('[tu plan] y lo que le falta del aviso, con liga a Centro Tanner', !docs.oculto && /domicilio y tu correo/.test(docs.texto) && docs.href === '/admin/centro-tanner/', JSON.stringify(docs));
  await p.evaluate(() => { window.__planDeVenta = false; });
  await p.addInitScript(() => { window.__planDeVenta = false; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#view:not(.hidden)', { timeout: 5000 }).catch(() => {});
  revisa('[tu plan] un plan interno (Tannery) no enseña la tarjeta', await p.$eval('#planCard', e => e.classList.contains('hidden')));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Portal humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Portal humo OK · ${revisiones.length} revisiones: acceso, tablero, alta en 5 pasos, datos al servidor, bienvenida y nombre del producto`);
