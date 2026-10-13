// Pulso de la campana (v2_chat_pulse) en Chromium, con reloj controlado y
// Supabase falso. Auditoría del 13/10/2026:
//   · 2 consultas por minuto con la pestaña visible, 0 oculta;
//   · volver a la pestaña consulta como mucho cada 15 s;
//   · una sola petición en vuelo aunque dos partes pidan el estado;
//   · cambiar de cuenta o de club apaga lo anterior: una respuesta tardía del
//     contexto viejo no toca la campana ni emite tos:pulso;
//   · cerrar sesión deja de preguntar;
//   · sin red espera más (hasta 5 min) y al volver la red regresa a 30 s;
//   · dos copias del shell o varios arranques no duplican intervalos ni listeners.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="tos-layout"><nav id="sidebarNav"></nav>
<header class="tos-topbar"><div class="tos-top-right"></div></header><main class="tos-content"></main></div>
<script type="module">
window.__ctx = {
  A: { user_id: 'uA', organization_id: 'orgA', organization_name: 'A', display_name: 'Ana', role: 'Presidencia' },
  A2: { user_id: 'uA', organization_id: 'orgB', organization_name: 'B', display_name: 'Ana', role: 'Presidencia' },
  B: { user_id: 'uB', organization_id: 'orgB', organization_name: 'B', display_name: 'Beto', role: 'Presidencia' } };
window.__sh = await import('/v2/shell.js');
window.__sh2 = await import('/v2/shell.js?v=otra-copia');
window.__listo = true;
</script></body></html>`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });

async function nueva() {
  const p = await nav.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await p.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
  await p.addInitScript(() => {
    window.__llamadas = []; window.__eventos = []; window.__lat = 150; window.__falla = false; window.__latPorOrg = {};
    // Contador de listeners netos de visibilidad y red.
    window.__escuchas = { visibilitychange: 0, online: 0 };
    const addD = Document.prototype.addEventListener, remD = Document.prototype.removeEventListener;
    Document.prototype.addEventListener = function (t, ...a) { if (t in window.__escuchas) window.__escuchas[t]++; return addD.call(this, t, ...a); };
    Document.prototype.removeEventListener = function (t, ...a) { if (t in window.__escuchas) window.__escuchas[t]--; return remD.call(this, t, ...a); };
    const addW = window.addEventListener.bind(window), remW = window.removeEventListener.bind(window);
    window.addEventListener = (t, ...a) => { if (t === 'online') window.__escuchas.online++; return addW(t, ...a); };
    window.removeEventListener = (t, ...a) => { if (t === 'online') window.__escuchas.online--; return remW(t, ...a); };
    addW('tos:pulso', e => window.__eventos.push(e.detail));
    const respuesta = (n, prm) => {
      if (n === 'v2_chat_pulse') return { chats: prm.organization_id === 'orgA' ? 4 : 1, avisos: prm.organization_id === 'orgA' ? 3 : 1, total: prm.organization_id === 'orgA' ? 7 : 2, lastAt: null };
      if (n === 'v2_my_announcements') return [{ id: prm.organization_id, title: `Aviso de ${prm.organization_id}`, unread: true, publishedAt: '2026-10-13T11:00:00Z' }];
      return [];
    };
    window.__fake = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), getUser: async () => ({ data: { user: { id: 'u' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) },
      rpc: (n, prm) => new Promise(res => {
        window.__llamadas.push({ n, org: prm?.organization_id, t: Date.now() });
        const lat = window.__latPorOrg[prm?.organization_id] ?? window.__lat;
        setTimeout(() => res(window.__falla && n === 'v2_chat_pulse' ? { data: null, error: { message: 'Failed to fetch' } } : { data: respuesta(n, prm || {}), error: null }), lat);
      }),
      from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}, storage: { from: () => ({}) }
    };
  });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fake; }' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route(BASE + '/__pulso.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGINA }));
  await p.goto(BASE + '/__pulso.html');
  await p.waitForFunction(() => window.__listo);
  return p;
}
const pulsos = (p, desde = 0) => p.evaluate(d => window.__llamadas.filter(x => x.n === 'v2_chat_pulse' && x.t >= d), desde);
const ahora = p => p.evaluate(() => Date.now());
const ponVisible = (p, visible) => p.evaluate(v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v ? 'visible' : 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }, visible);
const pinta = (p, quien, copia = '__sh') => p.evaluate(([q, c]) => window[c].renderShell({ ctx: window.__ctx[q], navigation: [] }), [quien, copia]);
const globito = p => p.evaluate(() => { const b = document.getElementById('tosBellBadge'); return b ? (b.classList.contains('hidden') ? '' : b.textContent) : null; });

{ // Pestaña visible 10 min: 2 por minuto. Oculta: 0.
  const p = await nueva(); await pinta(p, 'A');
  const t0 = await ahora(p); await p.clock.runFor(10 * 60_000);
  const n = (await pulsos(p, t0)).length;
  revisa('[visible] 2 consultas por minuto (cada 30 s)', n >= 19 && n <= 21, `${n} en 10 min`);
  revisa('[campana] muestra el total del pulso', (await globito(p)) === '7', await globito(p));
  revisa('[mensajes] cada pulso emite tos:pulso', (await p.evaluate(() => window.__eventos.length)) >= 19);
  await ponVisible(p, false); const t1 = await ahora(p); await p.clock.runFor(10 * 60_000);
  revisa('[oculta] no consulta', (await pulsos(p, t1)).length === 0);
  await ponVisible(p, true); await p.clock.runFor(500);
  revisa('[oculta → visible] al volver consulta una vez', (await pulsos(p, t1)).length === 1);
  await p.close();
}
{ // Volver 10 veces a la pestaña en 60 s: como mucho una consulta cada 15 s.
  const p = await nueva(); await pinta(p, 'A'); await p.clock.runFor(1000);
  const t0 = await ahora(p);
  for (let i = 0; i < 10; i++) { await ponVisible(p, false); await p.clock.runFor(2000); await ponVisible(p, true); await p.clock.runFor(4000); }
  const n = (await pulsos(p, t0)).length;
  revisa('[regresos] 10 regresos en 60 s no disparan 10 consultas', n <= 4, `${n} consultas`);
  await p.close();
}
{ // Dos partes piden el estado a la vez; varios arranques con la misma sesión.
  const p = await nueva(); const t0 = await ahora(p);
  await p.evaluate(() => { const c = window.__ctx.A; window.__sh.renderShell({ ctx: c, navigation: [] }); window.__sh.renderShell({ ctx: c, navigation: [] }); window.__sh2.renderShell({ ctx: c, navigation: [] }); });
  await p.clock.runFor(100);
  revisa('[dedupe] 3 arranques simultáneos = 1 petición en vuelo', (await pulsos(p, t0)).length === 1, String((await pulsos(p, t0)).length));
  const t1 = await ahora(p) + 1000; await p.clock.runFor(10 * 60_000);
  const n = (await pulsos(p, t1)).length;
  revisa('[dedupe] y después sigue en 2 por minuto (sin intervalos acumulados)', n >= 19 && n <= 21, `${n} en 10 min`);
  const esc = await p.evaluate(() => window.__escuchas);
  revisa('[listeners] un solo listener de visibilidad y uno de red', esc.visibilitychange === 1 && esc.online === 1, JSON.stringify(esc));
  revisa('[global] sólo window.__tosPulso para el pulso', await p.evaluate(() => typeof window.__tosPulso === 'object' && Object.keys(window.__tosPulso).sort().join() === 'enVuelo,espera,gen,llave,quita,reprograma,timer,total,ultimo'));
  await p.close();
}
{ // Cambiar de cuenta (y de club) sin recargar, con respuestas tardías del contexto viejo.
  const p = await nueva();
  await p.evaluate(() => { window.__latPorOrg.orgA = 20_000; });
  await pinta(p, 'A'); await p.clock.runFor(1000); // la de A sigue en vuelo (tarda 20 s)
  await pinta(p, 'B'); // cambia de cuenta y de club
  await p.evaluate(() => { window.__eventos = []; });
  await p.clock.runFor(25_000); // llega la respuesta tardía de A
  revisa('[respuesta tardía] la de la cuenta anterior no toca la campana', (await globito(p)) === '2', await globito(p));
  revisa('[respuesta tardía] ni emite tos:pulso del club anterior', (await p.evaluate(() => window.__eventos.every(e => e.total === 2))), JSON.stringify(await p.evaluate(() => window.__eventos)));
  const lista = await p.evaluate(() => document.getElementById('tosBellList')?.textContent || '');
  revisa('[respuesta tardía] la lista de avisos es la del club nuevo', /Aviso de orgB/.test(lista) && !/Aviso de orgA/.test(lista), lista.trim().slice(0, 80));
  const t0 = await ahora(p); await p.clock.runFor(5 * 60_000);
  const l = await pulsos(p, t0);
  revisa('[cambio de cuenta] ya no pregunta por el club anterior', l.every(x => x.org === 'orgB') && l.length >= 9, JSON.stringify(l.map(x => x.org)));
  // Misma persona, otro club.
  await pinta(p, 'A2'); await p.clock.runFor(100);
  revisa('[cambio de club] misma persona, otro club: pregunta por el nuevo', (await pulsos(p, await ahora(p) - 100)).every(x => x.org === 'orgB'));
  const esc = await p.evaluate(() => window.__escuchas);
  revisa('[cambio de cuenta] no se acumulan listeners', esc.visibilitychange === 1 && esc.online === 1, JSON.stringify(esc));
  await p.close();
}
{ // Cerrar sesión: deja de preguntar y limpia el globito.
  const p = await nueva(); await pinta(p, 'A'); await p.clock.runFor(1000);
  const hay = await p.evaluate(() => { if (typeof window.__sh.detenPulso !== 'function') return false; window.__sh.detenPulso(); return true; });
  revisa('[cerrar sesión] el shell expone detenPulso()', hay);
  const t0 = await ahora(p); await p.clock.runFor(5 * 60_000);
  revisa('[cerrar sesión] cero consultas después', (await pulsos(p, t0)).length === 0);
  revisa('[cerrar sesión] el globito se apaga', (await globito(p)) === '');
  const esc = await p.evaluate(() => window.__escuchas);
  revisa('[cerrar sesión] quita sus listeners', esc.visibilitychange === 0 && esc.online === 0, JSON.stringify(esc));
  await pinta(p, 'B'); await p.clock.runFor(1000);
  revisa('[otra cuenta] al entrar otra cuenta arranca limpio', (await globito(p)) === '2');
  await p.close();
}
{ // Sin red 10 min: espera más; al volver la red, consulta al instante y regresa a 30 s.
  const p = await nueva(); await p.evaluate(() => { window.__falla = true; });
  await pinta(p, 'A'); const t0 = await ahora(p); await p.clock.runFor(10 * 60_000);
  const n = (await pulsos(p, t0)).length;
  revisa('[sin red] espera cada vez más (no 20 fallos en 10 min)', n <= 7, `${n} intentos en 10 min`);
  await p.evaluate(() => { window.__falla = false; window.dispatchEvent(new Event('online')); });
  await p.clock.runFor(500);
  revisa('[reconexión] al volver la red se pone al día', (await globito(p)) === '7', await globito(p));
  const t1 = await ahora(p); await p.clock.runFor(5 * 60_000);
  const m = (await pulsos(p, t1)).length;
  revisa('[reconexión] y regresa a 2 por minuto', m >= 9 && m <= 11, `${m} en 5 min`);
  await p.close();
}
{ // Llega un aviso o mensaje nuevo: el siguiente pulso lo muestra.
  const p = await nueva(); await pinta(p, 'B'); await p.clock.runFor(1000);
  revisa('[avisos] arranca en 2', (await globito(p)) === '2');
  await p.evaluate(() => { const r = window.__fake.rpc; window.__fake.rpc = (n, prm) => n === 'v2_chat_pulse' ? (window.__llamadas.push({ n, org: prm.organization_id, t: Date.now() }), Promise.resolve({ data: { chats: 2, avisos: 3, total: 5 }, error: null })) : r(n, prm); });
  await p.clock.runFor(31_000);
  revisa('[avisos] un aviso nuevo aparece en ≤ 30 s', (await globito(p)) === '5', await globito(p));
  await p.close();
}
{ // Arrancar la página no suma consultas extra por la lista de avisos.
  const p = await nueva(); const t0 = await ahora(p); await pinta(p, 'A'); await p.clock.runFor(2000);
  revisa('[arranque] una sola consulta al abrir la página', (await pulsos(p, t0)).length === 1, String((await pulsos(p, t0)).length));
  await p.close();
}
{ // Dos pestañas: cada una con su poller, sin interferir.
  const a = await nueva(), b = await nueva(); await pinta(a, 'A'); await pinta(b, 'B');
  const ta = await ahora(a), tb = await ahora(b); await a.clock.runFor(5 * 60_000); await b.clock.runFor(5 * 60_000);
  const la = await pulsos(a, ta), lb = await pulsos(b, tb);
  revisa('[dos pestañas] cada una 2 por minuto y con su propio club', la.length <= 11 && lb.length <= 11 && la.every(x => x.org === 'orgA') && lb.every(x => x.org === 'orgB'), `${la.length}/${lb.length}`);
  await a.close(); await b.close();
}

revisa('sin errores en la página', errores.length === 0, errores.join(' | '));
await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const f of fallas) console.error(` - ${f.nombre}${f.detalle ? `\n   ${f.detalle}` : ''}`);
console.log(fallas.length ? `Pulso humo FAILED · ${fallas.length} de ${revisiones.length}`
  : `Pulso humo OK · ${revisiones.length} revisiones: 2/min visible, 0 oculta, un solo poller, respuestas tardías descartadas, cambio de cuenta y club, cerrar sesión y reconexión`);
process.exit(fallas.length ? 1 : 0);
