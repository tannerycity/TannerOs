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
    // El caso real: 55 de 63 familias nunca fueron preguntadas por las fotos.
    let PAPERWORK = { documents:[], consents:[
        { code:'reglamento', title:'Reglamento del club', body:'Texto del reglamento.',
          version:1, required:true, accepted_at:null, outdated:false },
        { code:'uso_de_imagen', title:'Uso de fotos y video',
          body:'El club usa fotos de los entrenamientos en sus redes.',
          version:1, required:false, accepted_at:null, outdated:false }
      ],
      image_consent:{ status:'sin_preguntar', authorized:false, decided_at:null, notice_version:null } };
    const RESP = { v2_portal_home: HOME, v2_portal_progress: PROGRESS,
      v2_portal_statement: STATEMENT,
      v2_portal_calendar: [], v2_portal_catalog: { products:[] }, v2_portal_parking: { passes:[] } };
    export const supabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
             getUser:async()=>({data:{user:{app_metadata:{}}}}),
             signOut:async()=>({}) } };
    export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
    export const $ = id => document.getElementById(id);
    window.__decisiones = [];
    export async function rpc(name, params={}){
      if(name==='v2_portal_attendance'){
        window.__mesPedidos.push(params);
        return params.from_date.startsWith('2026-09') ? MES : MES_VACIO;
      }
      if(name==='v2_portal_paperwork') return PAPERWORK;
      if(name==='v2_portal_decide_image_consent'){
        window.__decisiones.push(params);
        PAPERWORK = { ...PAPERWORK, image_consent:{
          status: params.authorize ? 'autoriza' : 'no_autoriza',
          authorized: !!params.authorize,
          decided_at: params.authorize ? '2026-09-23T12:00:00Z' : null,
          notice_version: 'uso_de_imagen v1' } };
        return { ok:true };
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

/* ¿Podemos publicar sus fotos?
   Es la tarjeta que convierte 55 pendientes en 55 respuestas. Lo que se vigila
   aquí es que el "no" sea una respuesta de primera clase: mismo peso que el
   "sí", guardada igual, y que la familia pueda cambiar de opinión después. */
await pagina.click('.fam-nav-item[data-tab="cuenta"]');
await pagina.waitForSelector('.fam-imagen', { timeout: 6000 });
const tarjeta = (await pagina.textContent('.fam-imagen')).replace(/\s+/g, ' ');
revisa('se le pregunta por las fotos, no se asume', /¿Podemos publicar sus fotos\?/.test(tarjeta), tarjeta.slice(0, 160));
revisa('dice que decir que no no afecta la inscripción',
  /no afecta su inscripción/.test(tarjeta), tarjeta.slice(0, 300));
revisa('las dos respuestas están a la misma altura',
  (await pagina.$$('.fam-imagen-botones .fam-btn')).length === 2);
revisa('la pregunta NO se repite abajo como documento',
  !/Uso de fotos y video/.test(await pagina.textContent('#famBody')));

await pagina.click('[data-imagen="no"]');
await pagina.waitForFunction(() => /no autorizado/.test(document.querySelector('.fam-imagen')?.textContent || ''), { timeout: 6000 });
const dijoNo = await pagina.evaluate(() => window.__decisiones);
revisa('el "no" se manda al servidor, no se queda en la pantalla',
  dijoNo.length === 1 && dijoNo[0].authorize === false && dijoNo[0].player_id === 'p1',
  JSON.stringify(dijoNo));
const trasNo = (await pagina.textContent('.fam-imagen')).replace(/\s+/g, ' ');
revisa('después de decir que no, ya no se le vuelve a preguntar',
  !/¿Podemos publicar sus fotos\?/.test(trasNo) && /No aparece en las redes/.test(trasNo), trasNo.slice(0, 220));
revisa('pero puede cambiar de opinión', await pagina.isVisible('[data-imagen="si"]'));

await pagina.click('[data-imagen="si"]');
await pagina.waitForFunction(() => /autorizado/.test(document.querySelector('.fam-imagen')?.textContent || ''), { timeout: 6000 });
const trasSi = (await pagina.textContent('.fam-imagen')).replace(/\s+/g, ' ');
revisa('cambiar a sí queda registrado con su fecha',
  /Sí puede aparecer/.test(trasSi) && /Desde el/.test(trasSi), trasSi.slice(0, 220));

const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
revisa('no hay scroll horizontal en iPhone', !desborde);

// De vuelta a Progreso: la captura de evidencia es la del mes de asistencia.
await pagina.click('.fam-nav-item[data-tab="progreso"]');
await pagina.waitForSelector('#famMesLabel', { timeout: 6000 });

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
