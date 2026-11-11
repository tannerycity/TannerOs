/* Las librerías de terceros viven en /vendor/ (11/11/2026).
 *
 * Antes se pedían a esm.sh desde el navegador: si ese CDN se caía o lo
 * comprometían, ese código corría con la sesión del staff. Lo que se protege:
 *   1. El cliente de Supabase (copia propia) arma la llamada rpc con la llave.
 *   2. jsPDF genera un PDF real.
 *   3. libphonenumber valida y da formato a un celular de México.
 *   4. xlsx lee un libro que él mismo escribió.
 *   5. Nada sale de 127.0.0.1.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
let rpc = null;
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/rest/v1/rpc/')) {
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      rpc = { ruta: u, llave: q.headers.apikey, cuerpo: b };
      r.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); r.end('{"ok":true}');
    }); return;
  }
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>v</title>'); return; }
  const f = path.join(RAIZ, u);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await nav.newPage();
let fallos = 0, corridas = 0; const fuera = [], errs = [];
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
pg.on('pageerror', e => errs.push(e.message));
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { fuera.push(r.request().url()); r.abort(); });
await pg.goto(BASE + '/');

const res = await pg.evaluate(async base => {
  const o = {};
  const { createClient } = await import('/v2/supabase-client.js');
  const c = createClient(base, 'llave-publica', { auth: { persistSession: false, autoRefreshToken: false } });
  o.rpc = await c.rpc('v2_public_context', { club_key: 'x' });
  const { jsPDF } = await import('/vendor/jspdf.mjs');
  const d = new jsPDF(); d.text('Tannery City', 10, 10);
  o.pdf = d.output('datauristring').slice(0, 40); o.pdfLargo = d.output('arraybuffer').byteLength;
  const t = await import('/vendor/libphonenumber-js.mjs');
  const n = t.parsePhoneNumberFromString('4771234567', 'MX');
  o.tel = { ok: n.isValid(), num: n.number, paises: t.getCountries().length, lada: t.getCountryCallingCode('MX'), tecleo: new t.AsYouType('MX').input('4771234567') };
  const X = await import('/vendor/xlsx.mjs');
  const libro = X.utils.book_new(); X.utils.book_append_sheet(libro, X.utils.aoa_to_sheet([['Nombre', 'Año'], ['Leo', 2014]]), 'Hoja');
  const leido = X.read(X.write(libro, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  o.xlsx = X.utils.sheet_to_json(leido.Sheets[leido.SheetNames[0]], { header: 1 });
  return o;
}, BASE).catch(e => ({ error: String(e) }));

revisa('sin error al cargar', !res.error, res.error);
revisa('1. el cliente de Supabase llama al rpc con la llave', rpc?.ruta === '/rest/v1/rpc/v2_public_context' && rpc?.llave === 'llave-publica' && /club_key/.test(rpc?.cuerpo || '') && res.rpc?.data?.ok === true, JSON.stringify(rpc));
revisa('2. jsPDF genera un PDF', /^data:application\/pdf/.test(res.pdf || '') && res.pdfLargo > 1000, `${res.pdf} ${res.pdfLargo}`);
revisa('3. libphonenumber valida un celular de México', res.tel?.ok && res.tel.num === '+524771234567' && res.tel.paises > 200 && res.tel.lada === '52' && /477/.test(res.tel.tecleo), JSON.stringify(res.tel));
revisa('4. xlsx lee lo que escribió', JSON.stringify(res.xlsx) === '[["Nombre","Año"],["Leo",2014]]', JSON.stringify(res.xlsx));
revisa('5. nada sale de 127.0.0.1', !fuera.length, fuera.join(' | '));
revisa('sin errores de página', !errs.length, errs.join(' | '));
await nav.close(); srv.close();
console.log(fallos ? `Vendor FAILED · ${fallos} de ${corridas}` : `Vendor OK · ${corridas} revisiones: Supabase, jsPDF, teléfonos y Excel desde /vendor/, sin CDN`);
process.exit(fallos ? 1 : 0);
