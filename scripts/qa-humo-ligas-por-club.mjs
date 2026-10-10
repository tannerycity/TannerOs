/* LIGAS PÚBLICAS POR CLUB, probadas como las abre una familia sin cuenta.
 *
 * TannerOS da de alta otros clubes desde el portal (10/10/2026). Las páginas
 * públicas mandaban siempre la llave de Tannery: el registro de otro club
 * habría inscrito a sus niños en Tannery. Lo que se protege:
 *
 *   1. Con ?club=<slug>, registro, tienda, Centro Tanner y aviso de
 *      privacidad le preguntan al servidor por ESE club, no por Tannery.
 *   2. La página dice el nombre de ese club, no "Tannery City".
 *   3. Las ligas propias (Centro Tanner, privacidad) se llevan el ?club=:
 *      navegar no regresa a nadie a Tannery.
 *   4. Sin ?club= sigue siendo Tannery: los QR impresos no se rompen.
 *   5. Un club que no existe lo dice y no enseña el formulario: nadie se
 *      registra en otro club por error.
 *   6. El club habla con SU palabra para los jugadores ("Jugador", no
 *      "Tanner"), también en lo que sale por WhatsApp.
 *   7. La entrada con ?club=&alta=1 enseña el nombre del club, sin el
 *      escudo de Tannery, y abre "Tengo invitación".
 *
 * Se espía la llamada RPC: lo que importa es A QUIÉN se le pregunta.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const CLUBES = {
  '1850TC1850': { organizationId:'o-tc', organizationName:'Tannery City FC', brand:'Tannery City', slug:'tannery-city-fc', playerNoun:{ singular:'Tanner', plural:'Tanners' }, categories:['Mini Baby Tanner','Baby Tanner','T8','T10','T12'] },
  'leon-norte': { organizationId:'o-leon', organizationName:'Club León Norte', brand:'León Norte', slug:'leon-norte', playerNoun:{ singular:'Jugador', plural:'Jugadores' }, categories:['Sub-8','Sub-10'] }
};
const llamadas = [];
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/favicon|Club unavailable|404/.test(m.text())) errs.push('console: ' + m.text()); });
await pg.exposeFunction('__anota', (n, p) => { llamadas.push({ n, p }); });
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  const CLUBES=${JSON.stringify(CLUBES)};
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async(ps)=>({data:[],error:null})})},
    rpc:async(n,p={})=>{
      await window.__anota(n, JSON.parse(JSON.stringify(p)));
      const club=CLUBES[p.club_key];
      if(n==='v2_public_context')return club?{data:club,error:null}:{data:null,error:{message:'Club unavailable'}};
      if(!club)return{data:null,error:{message:'Club unavailable'}};
      if(n==='v2_public_offerings')return{data:{products:[],bundles:[]},error:null};
      if(n==='v2_public_centro_tanner_home')return{data:{faqs:[],groups:[],documents:[{code:'reglamento',title:'Reglamento'}]},error:null};
      if(n==='v2_public_centro_tanner_document')return{data:{version:'1',effectiveDate:'2026-01-01',body:'Texto',title:'Aviso'},error:null};
      return {data:null,error:null};}};}` }));
await pg.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function AsYouType(){return{input:v=>v}}
  export function getCountries(){return['MX','US']}
  export function getCountryCallingCode(c){return c==='MX'?'52':'1'}
  export function parsePhoneNumberFromString(v){return{isValid:()=>true,formatInternational:()=>v,number:v};}` }));

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
const llaves = n => llamadas.filter(c => c.n === n).map(c => c.p.club_key);
const limpia = () => { llamadas.length = 0; };

/* ===== Registro de otro club ===== */
limpia();
await pg.goto(BASE + '/registro/?club=leon-norte', { waitUntil:'networkidle' });
await pg.waitForSelector('#regForm', { timeout: 5000 });
revisa('[registro] pregunta por León Norte, no por Tannery', llaves('v2_public_context').every(k => k === 'leon-norte') && llaves('v2_public_context').length > 0, JSON.stringify(llamadas));
const textoReg = await pg.evaluate(() => document.body.innerText);
revisa('[registro] dice el nombre del club', /LEÓN NORTE/i.test(textoReg));
revisa('[registro] no dice Tannery en ningún lado', !/Tannery/i.test(textoReg), textoReg.match(/.{0,40}Tannery.{0,40}/i)?.[0]);
revisa('[registro] el título de la pestaña es del club', /León Norte/.test(await pg.title()), await pg.title());
const catsLeon = await pg.$$eval('#category option', os => os.map(o => o.textContent));
revisa('[registro] ofrece las categorías del club', JSON.stringify(catsLeon) === JSON.stringify(['Por definir','Sub-8','Sub-10']), JSON.stringify(catsLeon));
revisa('[registro] habla de jugadores, no de Tanners', !/\bTanners?\b/.test(textoReg) && /jugador/i.test(textoReg), textoReg.match(/.{0,40}\bTanners?\b.{0,40}/)?.[0]);
const waLiga = await pg.evaluate(() => {
  const a = document.createElement('a'); a.href = 'https://wa.me/524771112233?text=' + encodeURIComponent('Hola, su Tanner Leo'); document.body.appendChild(a);
  let visto = ''; a.addEventListener('click', e => { visto = a.href; e.preventDefault(); }); a.click(); a.remove();
  return new URL(visto).searchParams.get('text');
});
revisa('[registro] lo que sale por WhatsApp también dice jugador', waLiga === 'Hola, su jugador Leo', waLiga);
const ligasReg = await pg.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
revisa('[registro] Centro Tanner y privacidad se llevan el club', ligasReg.length > 0 && ligasReg.every(h => /club=leon-norte/.test(h)), ligasReg.join(' '));

/* ===== Sin ?club= sigue siendo Tannery ===== */
limpia();
await pg.goto(BASE + '/registro/', { waitUntil:'networkidle' });
await pg.waitForSelector('#regForm', { timeout: 5000 });
revisa('[QR viejo] sin club pregunta por Tannery', llaves('v2_public_context')[0] === '1850TC1850');
const ligasTc = await pg.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
revisa('[QR viejo] las ligas de Tannery no cambian', ligasTc.every(h => !/club=/.test(h)), ligasTc.join(' '));

const textoTc = await pg.evaluate(() => document.body.innerText);
const catsTc = await pg.$$eval('#category option', os => os.map(o => o.textContent));
revisa('[QR viejo] Tannery conserva sus categorías', catsTc.includes('Mini Baby Tanner') && catsTc.includes('T12'), JSON.stringify(catsTc));
revisa('[QR viejo] Tannery sigue diciendo Tanner', /\bTanner\b/.test(textoTc));

/* ===== Club que no existe ===== */
limpia();
await pg.goto(BASE + '/registro/?club=no-existe', { waitUntil:'networkidle' });
await pg.waitForTimeout(300);
revisa('[club inexistente] lo dice', /No encontramos este club/.test(await pg.evaluate(() => document.body.innerText)));
revisa('[club inexistente] no enseña el formulario', (await pg.$('#regForm')) === null);
revisa('[club inexistente] no cae a Tannery', !llaves('v2_public_context').includes('1850TC1850'));

/* ===== Tienda ===== */
limpia();
await pg.goto(BASE + '/pedido/?club=leon-norte', { waitUntil:'networkidle' });
await pg.waitForTimeout(300);
revisa('[tienda] el catálogo es de León Norte', llaves('v2_public_offerings')[0] === 'leon-norte', JSON.stringify(llaves('v2_public_offerings')));
const textoTienda = await pg.evaluate(() => document.body.innerText);
revisa('[tienda] dice el club y no Tannery', /León Norte/.test(textoTienda) && !/Tannery/i.test(textoTienda), textoTienda.match(/.{0,40}Tannery.{0,40}/i)?.[0]);
const ligasTienda = await pg.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
revisa('[tienda] sus ligas se llevan el club', ligasTienda.every(h => /club=leon-norte/.test(h)), ligasTienda.join(' '));

/* ===== Centro Tanner ===== */
limpia();
await pg.goto(BASE + '/centro-tanner/?club=leon-norte', { waitUntil:'networkidle' });
await pg.waitForTimeout(300);
revisa('[centro] pregunta por León Norte', llaves('v2_public_centro_tanner_home')[0] === 'leon-norte', JSON.stringify(llamadas.map(c => c.n + ':' + c.p.club_key)));
const textoCentro = await pg.evaluate(() => document.querySelector('#ctContent')?.innerText || '');
revisa('[centro] dice el club y no Tannery', /León Norte/i.test(textoCentro) && !/Tannery/i.test(textoCentro), textoCentro.slice(0, 200));
const ligasCentro = await pg.$$eval('a[href^="/centro-tanner"]', as => as.map(a => a.getAttribute('href')));
revisa('[centro] navegar se lleva el club', ligasCentro.length > 0 && ligasCentro.every(h => /club=leon-norte/.test(h)), ligasCentro.join(' '));

/* ===== Aviso de privacidad ===== */
limpia();
await pg.goto(BASE + '/aviso-de-privacidad/?club=leon-norte', { waitUntil:'networkidle' });
await pg.waitForTimeout(300);
revisa('[privacidad] el aviso es el de León Norte', llaves('v2_public_centro_tanner_document')[0] === 'leon-norte');

/* ===== La capa de vocabulario por sí sola (la usan todas las pantallas) ===== */
await pg.goto(BASE + '/aviso-de-privacidad/', { waitUntil:'networkidle' });
const capa = await pg.evaluate(async () => {
  const abiertas = [];
  window.open = url => { abiertas.push(url); return null; };
  document.body.insertAdjacentHTML('beforeend', '<section id="qaVoc"><h2>Tanners activos</h2><input id="qaIn" placeholder="Buscar Tanner" value="Tanner escrito"><p data-sin-vocabulario>Tanner Smith</p><span>Tanner010</span></section>');
  document.title = 'Ficha Tanner';
  const { instalaVocabulario } = await import('/v2/vocabulario.js');
  instalaVocabulario({ singular: 'Jugador', plural: 'Jugadores' });
  document.getElementById('qaVoc').insertAdjacentHTML('beforeend', '<p id="qaTarde">Cobrar al Tanner</p>');
  await new Promise(r => setTimeout(r, 50));
  window.open('https://wa.me/1?text=' + encodeURIComponent('Hola, su Tanner'));
  return { h2: document.querySelector('#qaVoc h2').textContent, ph: document.getElementById('qaIn').placeholder,
    valor: document.getElementById('qaIn').value, marcado: document.querySelector('[data-sin-vocabulario]').textContent,
    codigo: document.querySelector('#qaVoc span').textContent, tarde: document.getElementById('qaTarde').textContent,
    titulo: document.title, wa: new URL(abiertas[0]).searchParams.get('text') };
});
revisa('[capa] cambia texto, placeholder y título', capa.h2 === 'Jugadores activos' && capa.ph === 'Buscar jugador' && capa.titulo === 'Ficha jugador', JSON.stringify(capa));
revisa('[capa] lo que aparece después también', capa.tarde === 'Cobrar al jugador', capa.tarde);
revisa('[capa] no toca lo escrito, lo marcado ni los códigos', capa.valor === 'Tanner escrito' && capa.marcado === 'Tanner Smith' && capa.codigo === 'Tanner010', JSON.stringify(capa));
revisa('[capa] la ventana a WhatsApp sale traducida', capa.wa === 'Hola, su jugador', capa.wa);

/* ===== Entrada del dueño de un club nuevo ===== */
limpia();
await pg.goto(BASE + '/?club=leon-norte&alta=1', { waitUntil:'networkidle' });
await pg.waitForTimeout(400);
revisa('[entrada] pregunta por León Norte', llaves('v2_public_context')[0] === 'leon-norte', JSON.stringify(llamadas.map(c => c.n)));
revisa('[entrada] enseña el nombre del club', (await pg.$eval('.tc-club-nombre', e => e.textContent).catch(() => '')) === 'León Norte');
revisa('[entrada] sin escudo ni firma de Tannery', (await pg.$('.tc-escudo')) === null && (await pg.$('.tc-wordmark')) === null);
revisa('[entrada] la bajada es del club', /León Norte/.test(await pg.$eval('.tc-bajada', e => e.textContent).catch(() => '')));
revisa('[entrada] abre "Tengo invitación"', await pg.$eval('#signUpTab', e => e.classList.contains('active')).catch(() => false));
await pg.goto(BASE + '/', { waitUntil:'networkidle' });
await pg.waitForTimeout(300);
revisa('[entrada] sin club sigue siendo Tannery', (await pg.$('.tc-wordmark')) !== null && (await pg.$('.tc-club-nombre')) === null);

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));
await nav.close(); srv.close();
console.log(fallos
  ? `Ligas por club humo FAILED · ${fallos} de ${corridas}`
  : `Ligas por club humo OK · ${corridas} revisiones: registro, tienda, Centro Tanner y privacidad preguntan por su club; vocabulario del club, entrada del dueño y los QR viejos siguen en Tannery`);
process.exit(fallos ? 1 : 0);
