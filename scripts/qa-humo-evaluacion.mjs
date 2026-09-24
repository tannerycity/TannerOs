// La faceta de Evaluación en Jugadores.
//
// Lo que este humo protege es el hallazgo, no el permiso. Medido el 23 de
// septiembre: 8 de 63 Tanners evaluados alguna vez, y las 15 evaluaciones que
// existen las firmó la misma persona. Desbloquear el permiso no hace que
// alguien evalúe; lo que mueve el número es ver el cero con el nombre del
// responsable al lado, y ver que hay categorías sin responsable.
//
// Por eso se vigilan tres cosas:
//   1. Que el profe (Formadores) VEA esta faceta. Si viviera detrás del
//      permiso de Presidencia, la persona que tiene que evaluar nunca se
//      enteraría de que le falta.
//   2. Que una categoría sin responsable lo diga con esas palabras.
//   3. Que tocar la categoría deje en pantalla justo a quien le falta.
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
await new Promise(r => server.listen(4607, r));

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

const errores = [];
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
pagina.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
pagina.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

// Jugadores no usa shell.js: crea su propio cliente. Se stubea ahí.
await pagina.route('**/v2/supabase-client.js', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: `
    // Un Formador: Jugadores en SOLO LECTURA, sin jugadores_estado. Es el rol
    // que hoy no podía evaluar y para el que se hizo esta faceta.
    const MODULES = [
      { module_code:'players',  enabled:true, can_read:true,  can_write:false },
      { module_code:'jugadores_familia', enabled:true, can_read:true, can_write:false },
      { module_code:'jugadores_estado',  enabled:false, can_read:false, can_write:false },
      // Un Formador NO lleva dinero: sin taquilla ni contabilidad.
      { module_code:'taquilla',     enabled:false, can_read:false, can_write:false },
      { module_code:'contabilidad', enabled:false, can_read:false, can_write:false }
    ];
    const PLAYERS = [
      { id:'p1', first_name:'Dario',  last_name:'Montalvo', category:'T10', status_value:'active', image_consent_status:'sin_preguntar' },
      { id:'p2', first_name:'Erick',  last_name:'García',   category:'T10', status_value:'active', image_consent_status:'sin_preguntar' },
      { id:'p3', first_name:'Matías', last_name:'Campos',   category:'T10', status_value:'active', image_consent_status:'autoriza', image_consent:true },
      { id:'p4', first_name:'Agustín',last_name:'Zamora',   category:'T8',  status_value:'active', image_consent_status:'sin_preguntar' }
    ];
    // T10 tiene responsable y uno al día. T8 no tiene responsable y nadie
    // evaluado: es el renglón que el club necesita ver.
    const COBERTURA = { months:4, cutoff:'2026-05-23', categories:[
      { categoryId:'c10', categoryName:'T10', sortKey:'00030', responsables:['Maximiliano Ponce'],
        players:3, upToDate:1, overdue:2, neverEvaluated:2, lastEvaluation:'2026-09-21',
        pending:[{playerId:'p1',name:'Dario Montalvo',lastEvaluatedOn:null,daysSince:null},
                 {playerId:'p2',name:'Erick García',lastEvaluatedOn:null,daysSince:null}] },
      { categoryId:'c8', categoryName:'T8', sortKey:'00020', responsables:[],
        players:1, upToDate:0, overdue:1, neverEvaluated:1, lastEvaluation:null,
        pending:[{playerId:'p4',name:'Agustín Zamora',lastEvaluatedOn:null,daysSince:null}] }
    ]};
    window.__rpc = [];
    export function createClient(){
      return {
        auth:{ getSession:async()=>({data:{session:{user:{id:'u-profe'}}}}),
               getUser:async()=>({data:{user:{app_metadata:{}}}}),
               signOut:async()=>({}) },
        storage:{ from:()=>({ createSignedUrl:async()=>({data:null,error:null}),
                              createSignedUrls:async()=>({data:[],error:null}) }) },
        rpc:async(name, params={})=>{
          window.__rpc.push({name,params});
          if(name==='v2_my_context') return { data:[{organization_id:'org1',organization_name:'Tannery City FC',role:'Formadores',is_owner:false}], error:null };
          if(name==='v2_my_modules') return { data:MODULES, error:null };
          if(name==='v2_players') return { data:PLAYERS, error:null };
          if(name==='v2_player_categories') return { data:[{id:'c10',name:'T10'},{id:'c8',name:'T8'}], error:null };
          if(name==='v2_evaluation_coverage') return { data:COBERTURA, error:null };
          if(name==='v2_player_profile') return { data:{
            player:{ id:'p1', firstName:'Dario', lastName:'Montalvo', code:'TC-2', status:'active',
              category:'T10', birthDate:'2016-03-01', dataConsent:false, imageConsent:false,
              privacyNoticeVersion:null, photoPath:null, photoBucket:'tanneros-private' },
            guardians:[], activeEnrollment:null }, error:null };
          if(name==='v2_player_documents') return { data:[], error:null };
          if(name==='v2_player_sports') return { data:null, error:null };
          if(name==='v2_player_benefits') return { data:[], error:null };
          return { data:[], error:null };
        }
      };
    }
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

await pagina.goto('http://127.0.0.1:4607/v2/jugadores/', { waitUntil: 'networkidle' });
await pagina.waitForSelector('#facetTabs', { timeout: 8000 });

// 1. El profe ve la faceta. Es lo que rompía todo el diseño si fallaba.
revisa('el profe (solo lectura) SÍ ve la faceta de Evaluación',
  await pagina.isVisible('[data-facet="evaluacion"]'));

// La marca de publicidad es la POSITIVA: sólo la lleva quien autoriza. Se mide
// con la lista sin filtrar, antes de tocar nada.
await pagina.waitForSelector('.jcard-name', { timeout: 6000 });
revisa('sólo el Tanner que autoriza lleva la marca verde',
  (await pagina.$$('.jcard-pub')).length === 1,
  `tarjetas: ${(await pagina.$$('.jcard-name')).length}`);

revisa('y sigue sin ver Expediente ni Becas',
  (await pagina.$$('[data-facet="expediente"]')).length === 0
  && (await pagina.$$('[data-facet="becas"]')).length === 0);

await pagina.click('[data-facet="evaluacion"]');
await pagina.waitForSelector('.fchip-eval', { timeout: 6000 });
const cuerpo = (await pagina.textContent('#facetBody')).replace(/\s+/g, ' ');

// 2. El contador con nombre, que es lo que mueve el número.
// textContent pega los <span> sin espacios, así que se busca la secuencia tal
// como sale: "T101 de 3Maximiliano Ponce".
revisa('T10 dice cuántos al día y quién responde',
  /T101 de 3Maximiliano Ponce/.test(cuerpo), cuerpo.slice(0, 260));
revisa('T8 dice que no tiene responsable, no una raya',
  /T80 de 1sin responsable/.test(cuerpo), cuerpo.slice(0, 260));
revisa('avisa cuántas categorías están sin responsable',
  /1 categoría sin responsable/.test(cuerpo), cuerpo.slice(0, 400));
revisa('explica qué significa "al día", con la fecha de corte',
  /últimos 4 meses/.test(cuerpo) && /2026-05-23/.test(cuerpo), cuerpo.slice(-220));
revisa('el chip de "Por evaluar" suma los de todas las categorías',
  /Por evaluar3/.test(cuerpo), cuerpo.slice(0, 160));

// 3. Un toque deja en pantalla justo a quien le falta.
await pagina.click('[data-filtro="evalcat:T10"]');
await pagina.waitForTimeout(250);
const nombres = await pagina.$$eval('.jcard-name', n => n.map(x => x.textContent.trim()));
revisa('tocar T10 deja sólo a los que le faltan a ese profe',
  nombres.length === 2 && nombres.includes('Dario Montalvo') && nombres.includes('Erick García'),
  JSON.stringify(nombres));
revisa('el que ya está al día NO aparece en la lista de pendientes',
  !nombres.includes('Matías Campos'), JSON.stringify(nombres));

/* El estado de cuenta NO es para el profe.

   El RPC que lo sirve deja pasar con lectura de Jugadores, o sea que un
   Formador podría abrirlo. Un profe no tiene por qué ver lo que debe la
   familia de su alumno, así que el enlace se ofrece sólo a quien lleva dinero
   (taquilla o contabilidad). */
await pagina.click('.jcard');
await pagina.waitForSelector('#profileView:not(.hidden)', { timeout: 6000 });
revisa('el enlace al estado de cuenta existe en la pantalla',
  (await pagina.$$('#verEstadoCuenta')).length === 1);
revisa('pero un Formador NO lo ve: no lleva dinero',
  await pagina.isHidden('#verEstadoCuenta'));

const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
revisa('no hay scroll horizontal en iPhone', !desborde);

await navegador.close();
server.close();

// esm.sh no se alcanza desde este entorno y jsPDF sólo se importa al exportar:
// ese fallo no es del módulo y ya lo cubre el humo de Montos.
const reales = errores.filter(e => !/esm\.sh/.test(e));
if (reales.length) { console.error('Errores de consola:'); reales.forEach(e => console.error('  ' + e)); }

console.log(fallos || reales.length
  ? `Humo Evaluación FAILED · ${fallos} de ${corridas}, ${reales.length} errores`
  : `Humo Evaluación OK · ${corridas} revisiones en Chromium a 390px (rol Formadores), 0 errores`);
process.exit(fallos || reales.length ? 1 : 0);
