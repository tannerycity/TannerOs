// El portal de Familias: la asistencia del mes del propio hijo.
//
// Dos cosas que este humo protege:
//   1. Que un retardo o una justificada NO se le muestren al papá como
//      "Faltó". Antes la lista sólo distinguía present de todo lo demás.
//   2. Que el porcentaje del mes salga sobre los entrenamientos con lista
//      tomada, y que se diga cuántos son.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(4601, r));

const errores = [];
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
pagina.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
pagina.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

await pagina.route('**/v2/shell.js', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: `
    const HOME = { organization:{name:'Tannery City FC'},
      players:[{id:'p1',first_name:'Gianluca',last_name:'Enríquez',category:'T10',balance:0,photo_thumb_path:null}] };
    const PROGRESS = { attendance:{present:12,absent:3,total:15,percent:80},
      recent:[{date:'2026-09-20',status:'late',title:'Entrenamiento'},
              {date:'2026-09-18',status:'excused',title:'Entrenamiento'},
              {date:'2026-09-16',status:'present',title:'Entrenamiento'}],
      evaluations:[] };
    const MES = { from:'2026-09-01', to:'2026-09-30', goal:90,
      attended:6, absences:4, excused:2, late:1, recorded:10, pct:60.0, belowGoal:true,
      history:[{date:'2026-09-20',startsAt:'2026-09-20T18:00:00Z',title:'Entrenamiento',status:'late'},
               {date:'2026-09-18',startsAt:'2026-09-18T18:00:00Z',title:'Entrenamiento',status:'excused'},
               {date:'2026-09-16',startsAt:'2026-09-16T18:00:00Z',title:'Entrenamiento',status:'absent'},
               {date:'2026-09-14',startsAt:'2026-09-14T18:00:00Z',title:'Entrenamiento',status:'present'}] };
    const MES_VACIO = { goal:90, attended:0, absences:0, excused:0, late:0, recorded:0, pct:null, belowGoal:false, history:[] };
    window.__mesPedidos = [];
    const STATEMENT = { summary:{ balance:0, credit_available:0, since:'2026-08-01' },
      charges:[], payments:[], orders:[] };
    const RESP = { v2_portal_home: HOME, v2_portal_progress: PROGRESS,
      v2_portal_statement: STATEMENT, v2_portal_paperwork: { documents:[], consents:[] },
      v2_portal_calendar: [], v2_portal_catalog: { products:[] }, v2_portal_parking: { passes:[] } };
    export const supabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
             getUser:async()=>({data:{user:{app_metadata:{}}}}),
             signOut:async()=>({}) } };
    export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
    export const $ = id => document.getElementById(id);
    export async function rpc(name, params={}){
      if(name==='v2_portal_attendance'){
        window.__mesPedidos.push(params);
        return params.from_date.startsWith('2026-09') ? MES : MES_VACIO;
      }
      return RESP[name] ?? null;
    }
    export const shellIcon = () => '';
    export const navItems = [];
    export function navigationMap(){ return new Map(); }
    export function moduleAccess(){ return false; }
  `
}));
await pagina.route('**/v2/photo-cache.js', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: ['export async function getSignedPhotoUrls(){ return {}; }',
         'export async function getSignedPhotoUrl(){ return null; }',
         'export async function getRawSignedPhotoUrl(){ return null; }',
         'export function clearPhotoCache(){}',
         'export function forgetPhoto(){}'].join('\n')
}));

// El reloj se fija en septiembre 2026 para que "este mes" sea determinista.
await pagina.addInitScript(() => {
  const Real = Date;
  const FIJO = new Real(2026, 8, 23, 12, 0, 0);
  class D extends Real {
    constructor(...a) { if (!a.length) { super(FIJO.getTime()); } else { super(...a); } }
    static now() { return FIJO.getTime(); }
  }
  window.Date = D;
});

await pagina.goto('http://127.0.0.1:4601/v2/familias/', { waitUntil: 'networkidle' });
await pagina.waitForSelector('#appView:not(.hidden)', { timeout: 8000 });

const revisiones = [];
const revisa = (nombre, ok, detalle = '') => revisiones.push({ nombre, ok, detalle });

// Ir a Progreso
await pagina.click('.fam-nav-item[data-tab="progreso"]');
await pagina.waitForSelector('#famMesCard', { timeout: 6000 });
await pagina.waitForFunction(() => !/Cargando/.test(document.getElementById('famMesBody')?.textContent || 'Cargando'), { timeout: 6000 });

const mes = (await pagina.textContent('#famMesCard')).replace(/\s+/g, ' ');
revisa('la tarjeta dice de qué mes habla', /Septiembre de 2026/.test(mes), mes.slice(0, 90));
revisa('muestra el porcentaje del mes', /60%/.test(mes), mes.slice(0, 160));
revisa('dice sobre cuántos entrenamientos con lista', /sobre 10 entrenamientos con lista tomada/.test(mes), mes.slice(0, 260));
revisa('identifica las justificadas', /2 faltas justificadas/.test(mes), mes.slice(0, 260));
revisa('cuenta los retardos aparte', /1 retardo/.test(mes), mes.slice(0, 260));
revisa('usa la meta del becado (90%), no la ordinaria', /objetivo 90%/.test(mes), mes.slice(0, 260));
revisa('avisa la asistencia baja en tono de apoyo', /escríbenos/.test(mes), mes.slice(0, 400));

// El bug que esto cierra: un retardo no es una falta.
revisa('un retardo se ve como "Llegó tarde", no como "Faltó"', /Llegó tarde/.test(mes), mes.slice(0, 400));
revisa('una justificada se ve identificada como tal', /Falta justificada/.test(mes), mes.slice(0, 400));

const recientes = (await pagina.textContent('#famBody')).replace(/\s+/g, ' ');
revisa('la lista de últimos entrenamientos ya no llama "Faltó" a un retardo',
  !/Entrenamiento 20 de sep[^|]*Faltó/.test(recientes) && /Llegó tarde/.test(recientes), recientes.slice(0, 200));

// Navegación de meses
await pagina.click('#famMesNav [data-mes="prev"]');
await pagina.waitForFunction(() => /Agosto/.test(document.getElementById('famMesLabel')?.textContent || ''), { timeout: 6000 });
const pedidos = await pagina.evaluate(() => window.__mesPedidos);
revisa('al cambiar de mes se pide el rango correcto',
  pedidos.some(p => p.from_date === '2026-08-01' && p.to_date === '2026-08-31'),
  JSON.stringify(pedidos).slice(0, 200));
const agosto = (await pagina.textContent('#famMesBody')).replace(/\s+/g, ' ');
revisa('un mes sin listas lo dice, no pinta un cero', /Todavía no hay listas tomadas/.test(agosto), agosto.slice(0, 140));

// No se puede ir al futuro
await pagina.click('#famMesNav [data-mes="next"]');
await pagina.waitForTimeout(200);
await pagina.click('#famMesNav [data-mes="next"]');
await pagina.waitForTimeout(200);
const etiqueta = await pagina.textContent('#famMesLabel');
revisa('no deja avanzar al futuro', /Septiembre de 2026/.test(etiqueta), etiqueta);

// Privacidad: sólo se piden ids de los propios hijos
const idsPedidos = await pagina.evaluate(() => [...new Set(window.__mesPedidos.map(p => p.player_id))]);
revisa('sólo pide la asistencia de su propio Tanner',
  idsPedidos.length === 1 && idsPedidos[0] === 'p1', JSON.stringify(idsPedidos));

const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
revisa('no hay scroll horizontal en iPhone', !desborde);

// La captura se toma en septiembre, que es el mes con datos.
await pagina.waitForFunction(() => /Septiembre/.test(document.getElementById('famMesLabel')?.textContent || ''), { timeout: 4000 });
await pagina.waitForFunction(() => /60%/.test(document.getElementById('famMesBody')?.textContent || ''), { timeout: 4000 });
await pagina.screenshot({ path: path.join(RAIZ, 'docs/evidencias/familias-asistencia-mes.png'), fullPage: false });

await navegador.close();
server.close();

let mal = 0;
for (const r of revisiones) { if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); } }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Humo Familias FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Humo Familias OK · ${revisiones.length} revisiones en Chromium a 390px, 0 errores de consola`);
