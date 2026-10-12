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
    const cobros = { settings: { dueDay: 5, lateFeeMxn: 100, readOnlyDay: 15, bank: null, clabe: null, holder: null }, invoices: [
      { id: 'i1', organizationId: 'o2', club: 'Halcones FC', period: '2026-11-01', status: 'pending', total: 1135, lateFeeMxn: 100, dueDate: '2026-11-05', readOnlyDate: '2026-11-15', readOnly: true },
      { id: 'i2', organizationId: 'o3', club: 'Club Norte', period: '2026-11-01', status: 'pending', total: 990, lateFeeMxn: 0, dueDate: '2099-11-05', readOnlyDate: '2099-11-15', readOnly: false },
      { id: 'i3', organizationId: 'o4', club: 'Club Sur', period: '2026-10-01', status: 'paid', total: 495, lateFeeMxn: 0, dueDate: '2026-10-05', readOnlyDate: '2026-10-15', paidAt: '2026-10-03T10:00:00Z' }] };
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
      v2_platform_invoices: () => JSON.parse(JSON.stringify(cobros)),
      v2_record_club_payment: prm => { const c = cobros.invoices.find(x => x.id === prm.invoice_id); c.status = 'paid'; c.paidAt = '2026-11-16T12:00:00Z'; if (prm.waive_late_fee) { c.total -= c.lateFeeMxn; c.lateFeeMxn = 0; } c.readOnly = false; return { invoiceId: c.id, total: c.total, readOnly: false }; },
      v2_update_platform_billing: prm => { cobros.settings = { ...prm.settings }; return cobros.settings; },
      v2_my_access_mode: () => window.__modo || { mode: 'normal' },
      v2_my_club_invoice: () => window.__cobroClub || null,
      v2_create_demo_club: prm => {
        estado.clubs.push({ id: 'o9', slug: 'demo-halcones', name: 'Halcones FC (demo)', city: 'León, Gto.', planCode: 'seleccion', plan: 'Selección', demo: true,
          players: 48, users: 1, categories: 4, colors: { primary: '#1B2A41', secondary: '#2E7D5B' }, ownerPending: prm.owner_email });
        return { organizationId: 'o9', slug: 'demo-halcones', name: 'Halcones FC (demo)', demo: true, datos: { jugadores: 48 } };
      },
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

{ // Cobros a clubes: estados, registrar pago (perdonando el recargo) y datos de cobro.
  const p = await abre();
  await p.waitForSelector('#pfCobros .pf-cobro', { timeout: 5000 });
  const filas = await p.$$eval('#pfCobros .pf-cobro', a => a.map(x => [x.className.replace('pf-cobro ', ''), x.querySelector('.pf-cobro-estado').textContent, !!x.querySelector('[data-pagar]')]));
  revisa('[cobros] cada estado con su color', JSON.stringify(filas.map(f => f[0])) === '["pf-cobro-bloqueo","pf-cobro-aviso","pf-cobro-ok"]', JSON.stringify(filas));
  revisa('[cobros] dice qué pasa y cuándo', filas[0][1] === 'Solo lectura' && filas[1][1] === 'Vence el 05/11' && /Pagado 03\/10/.test(filas[2][1]), JSON.stringify(filas));
  revisa('[cobros] sólo lo pendiente se puede registrar', filas[0][2] && filas[1][2] && !filas[2][2]);
  revisa('[cobros] el total por cobrar', /\$2,125 por cobrar/.test(await p.textContent('#pfCobrosTitulo')), await p.textContent('#pfCobrosTitulo'));
  revisa('[cobros] avisa que falta la CLABE', /Falta tu CLABE/.test(await p.textContent('#pfCobroReglas')));
  const respuestas = ['SPEI 4455', true];
  p.on('dialog', d => { const r = respuestas.shift(); d.type() === 'confirm' ? (r ? d.accept() : d.dismiss()) : d.accept(r); });
  await p.click('[data-pagar="i1"]');
  await p.waitForFunction(() => /registrado/.test(document.getElementById('pfMensaje').textContent), null, { timeout: 4000 }).catch(() => {});
  const pago = await llamada(p, 'v2_record_club_payment');
  revisa('[cobros] registra el pago con su referencia y perdonando el recargo', pago?.invoice_id === 'i1' && pago.reference === 'SPEI 4455' && pago.waive_late_fee === true, JSON.stringify(pago));
  revisa('[cobros] y se ve pagado', /\$1,035/.test(await p.textContent('#pfMensaje')) && await p.$eval('[data-id="i1"]', e => e.classList.contains('pf-cobro-ok')));
  await p.click('#pfCobroAjustes');
  await p.fill('#cbBanco', 'BBVA'); await p.fill('#cbTitular', 'Michel E.');
  await p.fill('#cbClabe', '0121 8000 1234'); await p.click('#pfCobroForm button[type=submit]');
  revisa('[cobros] una CLABE corta no llega al servidor', /18 dígitos/.test(await p.textContent('#pfMensaje')) && !(await llamada(p, 'v2_update_platform_billing')));
  await p.fill('#cbClabe', '0121 8000 1234 5678 90'); await p.fill('#cbSoloLectura', '4'); await p.click('#pfCobroForm button[type=submit]');
  revisa('[cobros] solo lectura antes del vencimiento no pasa', /después del vencimiento/.test(await p.textContent('#pfMensaje')));
  await p.fill('#cbSoloLectura', '12'); await p.fill('#cbRecargo', '150'); await p.click('#pfCobroForm button[type=submit]');
  await p.waitForFunction(() => /guardados/.test(document.getElementById('pfMensaje').textContent), null, { timeout: 4000 }).catch(() => {});
  const cfg = (await llamada(p, 'v2_update_platform_billing'))?.settings;
  revisa('[cobros] guarda CLABE limpia y reglas', cfg?.clabe === '012180001234567890' && cfg.bank === 'BBVA' && cfg.lateFeeMxn === 150 && cfg.readOnlyDay === 12 && cfg.dueDay === 5, JSON.stringify(cfg));
  revisa('[cobros] y las reglas nuevas se leen', /\$150 de recargo; desde el día 12/.test(await p.textContent('#pfCobroReglas')) && !/Falta tu CLABE/.test(await p.textContent('#pfCobroReglas')));
  revisa('[sin desborde] los cobros caben a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // Club en solo lectura: aviso arriba en cualquier pantalla y su cobro en Administración.
  const p = await abre();
  revisa('[solo lectura] un club al corriente no ve aviso', !(await p.$('#tosSoloLectura')));
  await p.addInitScript(() => {
    window.__modo = { mode: 'solo_lectura', reason: 'pago' };
    window.__cobroClub = { id: 'i1', period: '2026-11-01', status: 'pending', total: 1135, lateFeeMxn: 100, dueDate: '2026-11-05', readOnlyDate: '2026-11-15', readOnly: true,
      payTo: { bank: 'BBVA', clabe: '012180001234567890', holder: 'Michel E.' } };
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#tosSoloLectura', { timeout: 5000 }).catch(() => {});
  const aviso = await p.$eval('#tosSoloLectura', e => ({ t: e.textContent, r: e.dataset.reason, primero: e.parentElement.firstElementChild === e })).catch(() => null);
  revisa('[solo lectura] aviso arriba de la pantalla, diciendo por qué', aviso?.primero && aviso.r === 'pago' && /pago pendiente de la mensualidad/.test(aviso.t), JSON.stringify(aviso));
  await p.goto('http://127.0.0.1:4807/v2/admin/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#planCobro:not(.hidden)', { timeout: 5000 }).catch(() => {});
  const cobro = await p.evaluate(() => ({ tono: document.getElementById('planCobro').dataset.tono, t: document.getElementById('planCobroTitulo').textContent,
    d: document.getElementById('planCobroDetalle').textContent, pagar: document.getElementById('planCobroPagar').textContent, oculto: document.getElementById('planCobro').classList.contains('hidden') }));
  revisa('[tu plan] el club ve que está en solo lectura y cuánto debe', !cobro.oculto && cobro.tono === 'bloqueo' && /solo lectura/.test(cobro.t) && /\$1,135/.test(cobro.d), JSON.stringify(cobro));
  revisa('[tu plan] y a dónde pagar', /CLABE 0121 8000 1234 5678 90 \(BBVA\) a nombre de Michel E\./.test(cobro.pagar), cobro.pagar);
  await p.addInitScript(() => { window.__modo = { mode: 'solo_lectura', reason: 'demo' }; });
  await p.goto('http://127.0.0.1:4807/v2/admin/clubes/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#tosSoloLectura', { timeout: 5000 }).catch(() => {});
  revisa('[demo] la demo avisa que no se guarda', /Estás en una demo/.test(await p.textContent('#tosSoloLectura').catch(() => '')));
  await p.close();
}

{ // Club demo para vender: sale marcado y no cuenta en clubes, jugadores ni ingreso.
  const p = await abre();
  const respuestas = ['correo-malo', ' Mich@TannerOS.MX '];
  p.on('dialog', d => d.accept(respuestas.shift()));
  await p.click('#pfDemo');
  revisa('[demo] un correo mal escrito no llega al servidor', /correo válido/.test(await p.textContent('#pfMensaje')) && !(await llamada(p, 'v2_create_demo_club')));
  await p.click('#pfDemo');
  await p.waitForFunction(() => /Listo/.test(document.getElementById('pfMensaje').textContent), null, { timeout: 4000 }).catch(() => {});
  revisa('[demo] se crea con el correo limpio', (await llamada(p, 'v2_create_demo_club'))?.owner_email === 'mich@tanneros.mx');
  revisa('[demo] dice con qué entrar', /48 jugadores de ejemplo/.test(await p.textContent('#pfMensaje')) && /\?club=demo-halcones/.test(await p.textContent('#pfMensaje')), await p.textContent('#pfMensaje'));
  revisa('[demo] sale en la lista marcado como Demo', await p.$eval('#pfClubes', e => !!e.querySelector('.pf-club-demo .pf-demo')));
  revisa('[demo] no cuenta en clubes, jugadores, pendientes ni ingreso', (await p.textContent('#kClubes')) === '2' && (await p.textContent('#kJugadores')) === '117'
    && (await p.textContent('#kPendientes')) === '0' && /\$1,035/.test(await p.textContent('#kIngreso')));
  revisa('[sin desborde] con la demo, nada se sale a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Portal humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Portal humo OK · ${revisiones.length} revisiones: acceso, tablero, alta en 5 pasos, datos al servidor, bienvenida, nombre del producto, club demo, cobros y solo lectura`);
