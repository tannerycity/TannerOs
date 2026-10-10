// Vocabulario del club (v2/vocabulario.js) y vista previa por club
// (api/vista-previa.js), sin navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { traduce, traduceLiga, vocabularioValido, esDeTannery } from '../v2/vocabulario.js';
const require = createRequire(import.meta.url);
const vista = require('../api/vista-previa.js');

let fallos = 0, corridas = 0;
async function prueba(nombre, fn) { corridas++; try { await fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }
const J = { singular: 'Jugador', plural: 'Jugadores' };
const TC = { singular: 'Tanner', plural: 'Tanners' };

await prueba('Tannery no cambia nada', () => {
  assert.equal(traduce('Buscar Tanner por nombre', TC), 'Buscar Tanner por nombre');
  assert.equal(esDeTannery(TC), true);
});
await prueba('otro club: la palabra, con mayúscula sólo al inicio', () => {
  assert.equal(traduce('Buscar Tanner por nombre', J), 'Buscar jugador por nombre');
  assert.equal(traduce('Tanners activos', J), 'Jugadores activos');
  assert.equal(traduce('Le escribimos de su Tanner. Tanner del mes', J), 'Le escribimos de su jugador. Jugador del mes');
  assert.equal(traduce('¿Tu Tanner viene?', J), '¿Tu jugador viene?');
});
await prueba('mayúsculas y Centro Tanner', () => {
  assert.equal(traduce('TANNERS', J), 'JUGADORES');
  assert.equal(traduce('Centro Tanner', J), 'Centro del club');
});
await prueba('no toca códigos, TannerOS ni hashtags', () => {
  assert.equal(traduce('Tanner010 · TannerOS · #WeAreTanners', J), 'Tanner010 · TannerOS · #WeAreTanners');
});
await prueba('el texto de WhatsApp también', () => {
  const u = traduceLiga('https://wa.me/524771112233?text=' + encodeURIComponent('Hola, su Tanner Leo'), J);
  assert.equal(new URL(u).searchParams.get('text'), 'Hola, su jugador Leo');
  assert.equal(traduceLiga('https://example.com/?text=Tanner', J), 'https://example.com/?text=Tanner');
});
await prueba('vocabulario inválido se ignora', () => {
  assert.equal(vocabularioValido({ singular: '<x>', plural: '' }), null);
  assert.deepEqual(vocabularioValido({ singular: ' Halcón ', plural: 'Halcones' }), { singular: 'Halcón', plural: 'Halcones' });
});

await prueba('vista previa: nombre del club, escapado, sin Tannery', () => {
  const h = vista.armaVistaPrevia({ pagina: 'registro', club: 'leon-norte', nombre: 'León <Norte>', imagen: null, origen: 'https://app.x' });
  assert.match(h, /og:title" content="Únete a León &lt;Norte&gt; · Registro"/);
  assert.match(h, /og:url" content="https:\/\/app\.x\/registro\/\?club=leon-norte"/);
  assert.doesNotMatch(h, /Tannery|og:image/);
});
await prueba('vista previa: cada página dice lo suyo', () => {
  for (const p of Object.keys(vista.PAGINAS)) {
    const h = vista.armaVistaPrevia({ pagina: p, club: 'leon-norte', nombre: 'León', imagen: 'https://img/x.png', origen: 'https://app.x' });
    assert.match(h, new RegExp(`${vista.PAGINAS[p].ruta.replace(/\//g, '\\/')}\\?club=leon-norte`));
    assert.match(h, /og:image" content="https:\/\/img\/x\.png"/);
  }
});
await prueba('vista previa: el logo sale de la marca del club', () => {
  assert.equal(vista.logoDe({ assets: { logo: 'organizations/o1/branding/logo 1.png' } }),
    'https://pacnegivzgxpanphrnwp.supabase.co/storage/v1/object/public/tanneros-branding/organizations/o1/branding/logo%201.png');
  assert.equal(vista.logoDe({ assets: {} }), null);
});
await prueba('vista previa: club inválido o inexistente da 404', async () => {
  const res = () => { const r = { code: 0, body: '', headers: {} }; r.status = c => { r.code = c; return r; }; r.send = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
  const a = res(); await vista({ query: { club: '<x>', pagina: 'registro' }, headers: {} }, a); assert.equal(a.code, 404);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: !/no-existe/.test('') && /context/.test(url) ? false : true, status: 400, json: async () => ({}) });
  const b = res(); await vista({ query: { club: 'no-existe', pagina: 'registro' }, headers: {} }, b); assert.equal(b.code, 404);
  globalThis.fetch = async (url, op) => ({ ok: true, json: async () => /context/.test(url)
    ? { organizationId: 'o1', organizationName: 'Club León Norte', brand: 'León Norte' } : { assets: {} } });
  const c = res(); await vista({ query: { club: 'leon-norte', pagina: 'pedido' }, headers: { host: 'app.x' } }, c);
  globalThis.fetch = original;
  assert.equal(c.code, 200); assert.match(c.body, /Tienda León Norte/);
});
await prueba('vercel.json: sólo robots con ?club= van a la vista previa', () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const r = v.redirects.filter(x => String(x.destination).startsWith('/api/vista-previa'));
  assert.equal(r.length, 10);
  for (const x of r) {
    assert.ok(x.has.some(h => h.type === 'query' && h.key === 'club'), x.source);
    const ua = x.has.find(h => h.type === 'header' && h.key === 'user-agent');
    assert.ok(ua && /WhatsApp/.test(ua.value) && /facebookexternalhit/.test(ua.value), x.source);
    assert.equal(x.permanent, false);
  }
  assert.ok(!new RegExp(r[0].has.find(h => h.key === 'user-agent').value).test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'));
  assert.ok(new RegExp(r[0].has.find(h => h.key === 'user-agent').value).test('WhatsApp/2.23.20.0 A'));
});

if (fallos) { console.error(`Vocabulario QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Vocabulario QA OK · ${corridas} casos: palabra del club, mensajes, vista previa por club y sólo para robots`);
