// Staff y organigrama en Chromium, con Supabase falso.
//
// Presidencia, 12-13/10/2026: "una parte que diga Staff y que se vea el
// organigrama; que los papás vean cuál es su entrenador". Revisa:
//   1. Organigrama por nivel (Presidencia → Dirección → Formadores), con cara,
//      nombre, puesto y categorías.
//   2. Avisos: formadores sin categoría y sin carta de no antecedentes.
//   3. Lista con las bajas al final.
//   4. Quien contrata abre la ficha y la guarda con nivel, a quién reporta,
//      categorías, carta y "lo ven las familias".
//   5. Si guardar fichas aún no está activado en la base, lo dice claro.
//   6. + Agregar crea la ficha con nombre, WhatsApp y puesto.
//   7. Con cuenta y sin ficha: un toque para agregarlos.
//   8. Quien no contrata ve el organigrama y la ficha sin teléfono ni editar.
//   9. Nada se sale a 390px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ORG = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';

const TABLERO = (editor) => ({
  canEdit: editor,
  members: [
    { id:'s-mich', fullName:'Michel Enríquez', title:'Presidente', level:'presidencia', reportsTo:null, active:true, showToFamilies:true, categories:[], hasAccount:true },
    { id:'s-brandon', fullName:'Brandon Andrade', title:'Director deportivo', level:'direccion', reportsTo:'s-mich', active:true, showToFamilies:true, categories:[], hasAccount:true },
    { id:'s-ana', fullName:'Ana Ruiz', title:'Formadora T10', level:'formador', reportsTo:'s-brandon', active:true, showToFamilies:true,
      categories:[{ id:'c-t10', name:'T10' }], hasAccount:false, ...(editor ? { phone:'4771112233', backgroundCheck:'entregada' } : {}) },
    { id:'s-leo', fullName:'Leo Pérez', title:'Formador', level:'formador', reportsTo:'s-brandon', active:true, showToFamilies:true,
      categories:[], hasAccount:false, ...(editor ? { phone:'4774445566', backgroundCheck:'pendiente' } : {}) },
    { id:'s-baja', fullName:'Carlos Baja', title:'Formador', level:'formador', reportsTo:null, active:false, showToFamilies:false, categories:[], hasAccount:false,
      ...(editor ? { backgroundCheck:'pendiente' } : {}) }
  ].filter(m => editor || m.active),
  categories: [{ id:'c-t8', name:'T8' }, { id:'c-t10', name:'T10' }, { id:'c-t12', name:'T12' }],
  withoutCard: editor ? [{ userId:'u-zul', role:'Operaciones', name:'Zul' }] : []
});

async function abre(opts = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG, tablero }) => {
    window.__llamadas = [];
    const R = {
      v2_my_context: () => [{ user_id:'u1', display_name:'Mich', organization_id:ORG, organization_name:'Tannery City FC', role: opts.editor ? 'Presidencia' : 'Formadores', is_owner: !!opts.editor }],
      v2_my_navigation: () => ['inicio', 'jugadores'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true })),
      v2_staff_board: () => tablero,
      v2_save_staff_member: () => { if (opts.sinGuardar) throw new Error('Could not find the function public.v2_save_staff_member'); return { id:'s-x' }; },
      v2_quick_add_staff: prm => ({ staffId:'s-nuevo', name: prm.full_name }),
      v2_delete_staff_member: () => ({ accessRemoved:true, files:['organizations/o/staff/s-baja/foto-1.webp'] })
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id:'u1' } } } }), getUser: async () => ({ data: { user: { id:'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => ({ createSignedUrls: async ps => ({ data: ps.map(x => ({ path: x, signedUrl: null, error: null })), error: null }), upload: async () => ({ data: {}, error: null }), remove: async ps => { (window.__borrados = window.__borrados || []).push(...ps); return { data: [], error: null }; } }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { opts, ORG, tablero: TABLERO(!!opts.editor) });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + '/v2/staff/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.st-tarjeta', { timeout: 8000 }).catch(() => {});
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

{ // Presidencia: edita
  const p = await abre({ editor: true });
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/staff.png`, fullPage: true });
  const niveles = await p.$$eval('.st-nivel h2', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  revisa('1. el organigrama va por nivel, de Presidencia a Formadores', JSON.stringify(niveles) === '["Presidencia 1","Dirección deportiva 1","Formadores 2"]', JSON.stringify(niveles));
  revisa('1. la tarjeta dice nombre, puesto y categoría', /Ana Ruiz\s*Formadora T10\s*T10/.test(await p.innerText('.st-tarjeta[data-id="s-ana"]')));
  revisa('1. la baja no sale en el organigrama', !(await p.$('#stOrganigrama .st-tarjeta[data-id="s-baja"]')));
  const avisos = await p.innerText('#stAvisos');
  revisa('2. avisa del formador sin categoría y del que no trae carta', /1 formador sin categoría/.test(avisos) && /1 sin carta de no antecedentes/.test(avisos), avisos);
  revisa('2. la tarjeta marca la carta pendiente', /Carta pendiente/.test(await p.innerText('.st-tarjeta[data-id="s-leo"]')));
  await p.click('.st-seg [data-ver="lista"]');
  const lista = await p.$$eval('#stLista .st-tarjeta', ts => ts.map(t => t.dataset.id));
  revisa('3. la lista trae a todos, con la baja al final', lista[lista.length - 1] === 's-baja' && lista.length === 5, JSON.stringify(lista));
  await p.click('.st-seg [data-ver="organigrama"]');

  await p.click('#stOrganigrama .st-tarjeta[data-id="s-leo"]');
  await p.waitForSelector('#fFicha', { timeout: 4000 }).catch(() => {});
  revisa('4. quien contrata ve el WhatsApp en la ficha', (await p.inputValue('#fTel').catch(() => '')) === '4774445566');
  await p.click('#fCats [data-cat="c-t8"]');
  await p.click('#fCarta [data-carta="entregada"]');
  await p.fill('#fVence', '2027-10-13');
  await p.fill('#fPuesto', 'Formador T8');
  await p.click('#fFicha [type=submit]');
  await p.waitForTimeout(300);
  const g = (await llamadas(p, 'v2_save_staff_member'))[0]?.member || {};
  revisa('4. guarda puesto, nivel, a quién reporta, categorías y carta',
    g.id === 's-leo' && g.title === 'Formador T8' && g.level === 'formador' && g.reportsTo === 's-brandon' && JSON.stringify(g.categoryIds) === '["c-t8"]'
    && g.backgroundCheck === 'entregada' && g.backgroundValidUntil === '2027-10-13' && g.showToFamilies === true, JSON.stringify(g));
  revisa('4. y la hoja se cierra con aviso', await p.isHidden('#stHoja') && /Ficha guardada/.test(await p.textContent('#stMensaje')));

  // 6. + Agregar
  await p.click('#stNuevo');
  await p.fill('#nNombre', 'Juan Ruiz');
  await p.fill('#nTel', '477 123 4567');
  await p.click('#nNivel [data-nivel="coordinacion"]');
  await p.click('#nForm [type=submit]');
  await p.waitForTimeout(300);
  const alta = (await llamadas(p, 'v2_quick_add_staff'))[0] || {};
  revisa('6. + Agregar crea la ficha con nombre, WhatsApp y puesto', alta.full_name === 'Juan Ruiz' && alta.phone === '477 123 4567' && alta.level === 'coordinacion', JSON.stringify(alta));

  // 7. Con cuenta, sin ficha
  revisa('7. sale quien tiene cuenta y no ficha', /Zul/.test(await p.textContent('#stSinFicha').catch(() => '')));
  await p.click('[data-sin="0"]');
  await p.waitForTimeout(300);
  const conCuenta = (await llamadas(p, 'v2_save_staff_member')).map(x => x.member).find(m => m.userId);
  revisa('7. un toque lo agrega con su cuenta y su puesto', conCuenta?.userId === 'u-zul' && conCuenta?.level === 'operacion', JSON.stringify(conCuenta));
  revisa('9. nada se sale a 390px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close();
}

{ // 10. Eliminar a quien ya se dio de baja (h21): sólo Presidencia y sólo una baja
  const p = await abre({ editor: true });
  await p.click('.st-seg [data-ver="lista"]');
  revisa('10. una baja ya no marca "Carta pendiente"', !/Carta pendiente/.test(await p.innerText('#stLista .st-tarjeta[data-id="s-baja"]')));
  await p.click('#stLista .st-tarjeta[data-id="s-ana"]');
  await p.waitForSelector('#fFicha', { timeout: 4000 }).catch(() => {});
  revisa('10. alguien activo no tiene "Eliminar"', !(await p.$('#fEliminar')));
  await p.click('#stCerrar');
  await p.click('#stLista .st-tarjeta[data-id="s-baja"]');
  await p.waitForSelector('#fEliminar', { timeout: 4000 }).catch(() => {});
  revisa('10. la baja sí tiene "Eliminar del staff" y avisa que no se deshace', await p.isVisible('#fEliminar') && /No se puede deshacer/.test(await p.textContent('.st-eliminar-nota')));
  await p.evaluate(() => { window.__pregunta = null; window.tosConfirm = async q => { window.__pregunta = q; return false; }; });
  await p.click('#fEliminar'); await p.waitForTimeout(200);
  revisa('10. pregunta antes y, si dices que no, no borra nada', /Carlos Baja/.test(await p.evaluate(() => window.__pregunta?.title || '')) && (await llamadas(p, 'v2_delete_staff_member')).length === 0);
  await p.evaluate(() => { window.tosConfirm = async () => true; });
  await p.click('#fEliminar'); await p.waitForTimeout(300);
  const del = (await llamadas(p, 'v2_delete_staff_member'))[0] || {};
  revisa('10. si confirmas, elimina esa ficha', del.member_id === 's-baja' && del.organization_id === ORG, JSON.stringify(del));
  revisa('10. y suelta su foto de Storage', JSON.stringify(await p.evaluate(() => window.__borrados || [])) === '["organizations/o/staff/s-baja/foto-1.webp"]');
  revisa('10. cierra la hoja y dice que ya no tiene acceso', await p.isHidden('#stHoja') && /ya no está en el staff y su cuenta quedó sin acceso/.test(await p.textContent('#stMensaje')));
  await p.close();
}

{ // 5. Guardar aún no activado en la base
  const p = await abre({ editor: true, sinGuardar: true });
  await p.click('#stOrganigrama .st-tarjeta[data-id="s-ana"]');
  await p.click('#fFicha [type=submit]');
  await p.waitForTimeout(300);
  revisa('5. si guardar no está activado, lo dice claro', /todavía no está activado/.test(await p.textContent('#fMsg')), await p.textContent('#fMsg'));
  await p.close();
}

{ // 8. Formador: sólo ve
  const p = await abre({ editor: false });
  revisa('8. el formador ve el organigrama', (await p.$$('#stOrganigrama .st-tarjeta')).length === 4);
  revisa('8. sin "+ Agregar" ni "con cuenta, sin ficha"', await p.isHidden('#stNuevo') && await p.isHidden('#stSinFicha'));
  await p.click('#stOrganigrama .st-tarjeta[data-id="s-ana"]');
  const hoja = await p.innerText('#stHoja');
  revisa('8. la ficha muestra puesto, categorías y a quién reporta, sin teléfono ni formulario', /Formadora T10/.test(hoja) && /Brandon Andrade/.test(hoja) && !(await p.$('#fFicha')) && !/4771112233/.test(hoja), hoja);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Staff humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Staff humo OK · ${revisiones.length} revisiones: organigrama, avisos, ficha, alta rápida y quién ve qué`);
