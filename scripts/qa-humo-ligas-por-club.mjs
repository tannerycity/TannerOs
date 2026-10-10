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
  '1850TC1850': { organizationId:'o-tc', organizationName:'Tannery City FC', brand:'Tannery City', slug:'tannery-city-fc' },
  'leon-norte': { organizationId:'o-leon', organizationName:'Club León Norte', brand:'León Norte', slug:'leon-norte' }
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
const ligasReg = await pg.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
revisa('[registro] Centro Tanner y privacidad se llevan el club', ligasReg.length > 0 && ligasReg.every(h => /club=leon-norte/.test(h)), ligasReg.join(' '));

/* ===== Sin ?club= sigue siendo Tannery ===== */
limpia();
await pg.goto(BASE + '/registro/', { waitUntil:'networkidle' });
await pg.waitForSelector('#regForm', { timeout: 5000 });
revisa('[QR viejo] sin club pregunta por Tannery', llaves('v2_public_context')[0] === '1850TC1850');
const ligasTc = await pg.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
revisa('[QR viejo] las ligas de Tannery no cambian', ligasTc.every(h => !/club=/.test(h)), ligasTc.join(' '));

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

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));
await nav.close(); srv.close();
console.log(fallos
  ? `Ligas por club humo FAILED · ${fallos} de ${corridas}`
  : `Ligas por club humo OK · ${corridas} revisiones: registro, tienda, Centro Tanner y privacidad preguntan por su club; los QR viejos siguen en Tannery`);
process.exit(fallos ? 1 : 0);
