// Humo de navegador: carga TODAS las pantallas del repositorio en Chromium y
// falla si alguna revienta.
//
// NO forma parte de la verificación obligatoria: necesita `playwright-core` y un
// Chromium instalado, cosa que el repo no trae.
//
// Por qué existe: `node --check` valida sintaxis y nada más. No ve una
// referencia a algo que no existe, ni una constante declarada dos veces. Las dos
// cosas tumbaron pantallas enteras en producción y sólo las encontró abrir la
// página. Esto lo hace con las 47 de un jalón.
//
// Sólo se sustituye el cliente de Supabase. El shell, el `app.js`, el markup y
// el CSS que se ejecutan son los de verdad.
//
// Uso:  npm i playwright-core   &&   node scripts/qa-humo-navegador.mjs

import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};

// El modulo que sustituye a /v2/supabase-client.js. Se sirve tal cual, asi que
// `createClient()` devuelve un cliente falso y TODO lo demas del repositorio
// —shell.js, cada app.js, el markup, el CSS— corre sin tocarse.
const STUB=`
const _u={id:'presi-1',email:'mich@tannerycity.com',app_metadata:{},user_metadata:{}};
function _store(bucket){
  return {
    getPublicUrl:()=>({data:{publicUrl:''}}),
    createSignedUrl:async(p)=>{window.__llamadas.firma.push(p);
      return {data:{signedUrl:window.__fotoUrl||('https://firmada.local/'+p)},error:null};},
    createSignedUrls:async(ps)=>{(ps||[]).forEach(p=>window.__llamadas.firma.push(p));
      return {data:(ps||[]).map(p=>({path:p,signedUrl:window.__fotoUrl||('https://firmada.local/'+p),error:null})),error:null};},
    list:async(carpeta)=>{window.__llamadas.list.push(carpeta);
      return {data:(window.__storage||{})[carpeta]||null,error:null};},
    upload:async(ruta,blob,opts)=>{window.__llamadas.upload.push({ruta,tipo:blob?.type||'',bytes:blob?.size||0,cacheControl:opts?.cacheControl,upsert:!!opts?.upsert});
      return {data:{path:ruta},error:null};},
    remove:async(rutas)=>{window.__llamadas.remove.push(rutas);return {data:[],error:null};},
    download:async(p)=>{window.__llamadas.download.push(p);return {data:null,error:null};},
  };
}
export const createClient=()=>({
  auth:{
    getUser:async()=>({data:{user:_u},error:null}),
    getSession:async()=>({data:{session:{user:_u,access_token:'x'}},error:null}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    refreshSession:async()=>({data:{session:null},error:null}),
    signOut:async()=>({error:null}),
  },
  functions:{invoke:async()=>({data:{ok:true},error:null})},
  storage:{from:_store},
  from:()=>({select:()=>({eq:async()=>({data:[],error:null})})}),
  rpc:async(name,params)=>{window.__rpc.push({name,params});
    const f=window.__fixtures[name];
    if(f===undefined){window.__sinFixture.push(name);return {data:null,error:null};}
    return {data:typeof f==='function'?f(params):f,error:null};},
});
`;
const s=http.createServer((q,r)=>{
  const u=decodeURIComponent(q.url.split('?')[0]);
  // El unico archivo sustituido. Este entorno tampoco alcanza esm.sh.
  if(u==='/v2/supabase-client.js'){r.writeHead(200,{'Content-Type':'text/javascript'});
    r.end(STUB);return;}
  let f=path.join(ROOT,u==='/'?'index.html':u);
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);r.end();return;}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});
  fs.createReadStream(f).pipe(r);
});
// Puerto libre que elige el sistema: dos corridas a la vez no se estorban.
await new Promise(r=>s.listen(0,r));
const BASE='http://localhost:'+s.address().port;

// Todos los codigos de navegacion que piden las pantallas. Si falta uno, esa
// pantalla se cae con «No access» y parece un bug cuando es un hueco del arnes.
const NAV=['inicio','club','direccion','finanzas','taquilla','tanner','jugadores','asistencia',
  'convocatoria','calendario','academias','prospectos','scouting','pedidos','catalogo','utileria',
  'patrocinadores','contabilidad','usuarios','admin','qa','modulos','deportivo','porteros',
  'produccion','programas','estacionamiento','familias','captura']
  .map((c,i)=>({module_code:c,module_name:c,can_read:true,can_write:true,enabled:true,customized:false,sort_order:i*10}));
const MOD=['sponsors','equipment','prospects','players','programs','catalog','scouting','admin','calendar','attendance','tanner','store','pos']
  .map(c=>({module_code:c,enabled:true,can_read:true,can_write:true}));
const JUGADORES=[
  {id:'p1',player_id:'p1',first_name:'Liam',last_name:'Santos',player_name:'Liam Santos',category:'T10',
   photo_path:'organizations/org-1/players/p1/profile-1756000000000.webp',photo_thumb_path:'organizations/org-1/players/p1/profile-1756000000000-thumb.webp',photo_bucket:'tanneros-private'},
  {id:'p2',player_id:'p2',first_name:'Ana',last_name:'Uc',player_name:'Ana Uc',category:'T12',
   photo_path:'organizations/org-1/players/p2/profile-1756000001000.webp',photo_thumb_path:'organizations/org-1/players/p2/profile-1756000001000-thumb.webp',photo_bucket:'tanneros-private'},
  {id:'p3',player_id:'p3',first_name:'Gianluca',last_name:'Enríquez',player_name:'Gianluca Enríquez',category:'T8',
   photo_path:'organizations/org-1/players/p3/profile-1756000002000.webp',photo_thumb_path:'organizations/org-1/players/p3/profile-1756000002000-thumb.webp',photo_bucket:'tanneros-private'},
];
// Metadata que devolveria Storage: p1 sin miniatura y PNG gordo, p2 PNG gordo
// con miniatura, p3 WebP sano y completo.
const STORAGE={
  'organizations/org-1/players/p1':[{name:'profile-1756000000000.webp',metadata:{mimetype:'image/png',size:3100000}}],
  'organizations/org-1/players/p2':[{name:'profile-1756000001000.webp',metadata:{mimetype:'image/png',size:2900000}},
                                    {name:'profile-1756000001000-thumb.webp',metadata:{mimetype:'image/png',size:117000}}],
  'organizations/org-1/players/p3':[{name:'profile-1756000002000.webp',metadata:{mimetype:'image/webp',size:198000}},
                                    {name:'profile-1756000002000-thumb.webp',metadata:{mimetype:'image/webp',size:19000}}],
};
const FIX={
  v2_my_context:[{user_id:'presi-1',display_name:'Michel Enriquez',organization_id:'org-1',organization_name:'Tannery City',organization_slug:'tannery-city',role:'Presidencia',is_owner:true}],
  v2_my_navigation:NAV, v2_my_modules:MOD,
  v2_players:JUGADORES,
  v2_set_player_photo:{ok:true},
  // Estas dos devuelven null sin fixture y las pantallas hacen .length / .name
  // sobre el resultado. Sin ellas el humo marca un error que no es del codigo.
  v2_audit_events:[],
  // hub.js (club, direccion, finanzas) hace .filter sobre estas sin protegerse
  // de un null. Sin fixture, el humo reporta un error que no es del codigo.
  v2_prospects:[], v2_sponsors:[], v2_open_receivables:[], v2_search_index:[],
  v2_collection_snapshot:{},
  v2_club_config:{name:'Tannery City FC',legalName:'Tannery City FC',timezone:'America/Mexico_City',
    locale:'es-MX',currency:'MXN',slug:'tannery-city',status:'active'},
  v2_organization_settings:{whatsappNumber:'524792651338',ledgerCutoverOn:'2026-08-01'},
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

// --- 1. Humo: ninguna pantalla tocada revienta al cargar --------------------
// La lista sale del disco, no escrita a mano: una pantalla nueva entra sola.
// Cuando estaba fija, la de Clubes no se probo hasta que alguien lo noto.
function rutasDelRepo(dir=ROOT, rel=''){
  const salida=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='supabase'||e.name==='docs'||e.name==='scripts')continue;
    const abs=path.join(dir,e.name);
    if(e.isDirectory())salida.push(...rutasDelRepo(abs, rel+'/'+e.name));
    else if(e.name==='index.html')salida.push((rel||'')+'/');
  }
  return salida;
}
const PANTALLAS=rutasDelRepo().sort();
let fallos=0;
for(const ruta of PANTALLAS){
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  p.on('console',m=>{if(m.type()==='error'&&!/favicon|404|Failed to load resource/.test(m.text()))errs.push('console: '+m.text().slice(0,140));});
  await p.addInitScript(d=>{window.__fixtures=d.fix;window.__rpc=[];window.__sinFixture=[];
    window.__storage=d.storage;window.__llamadas={list:[],upload:[],remove:[],download:[],firma:[]};},{fix:FIX,storage:STORAGE});
  try{await p.goto(BASE+ruta,{waitUntil:'networkidle',timeout:20000});}catch(e){errs.push('goto: '+e.message.split('\n')[0]);}
  await p.waitForTimeout(700);
  // Esta linea decia `.test('')` en vez de `.test(e)`, asi que el filtro daba
  // false para TODO y ninguna pantalla podia salir en rojo. El arnes reporto 48
  // pantallas en verde mientras cinco de ellas no compilaban. Lo atrapo el CI.
  if(errs.length){fallos++;console.log(`✗ ${ruta}`);errs.slice(0,4).forEach(e=>console.log('   '+e));}
  else console.log(`✓ ${ruta}`);
  await p.close();
}

// --- 2. Prueba 7 de docs/auditoria/06 · ninguna lista firma un original ------
//
// La barrera de qa-static impide que el CODIGO pida la foto completa en una
// lista. Esto lo comprueba EN EJECUCION: se abre la pantalla con Tanners que
// tienen original y miniatura, y se revisa que lo unico que se pidio firmar
// sean miniaturas. Un original en un padron de 50 son megabytes por apertura.
console.log('\n--- Prueba 7: las listas solo piden miniaturas ---');
let fugas=0,firmasVistas=0;
for(const ruta of ['/v2/jugadores/','/v2/asistencia/','/v2/']){
  const p=await b.newPage({viewport:{width:1280,height:900}});
  await p.addInitScript(d=>{window.__fixtures=d.fix;window.__rpc=[];window.__sinFixture=[];
    window.__storage=d.storage;window.__llamadas={list:[],upload:[],remove:[],download:[],firma:[]};},{fix:FIX,storage:STORAGE});
  try{await p.goto(BASE+ruta,{waitUntil:'networkidle',timeout:20000});}catch(_){ }
  await p.waitForTimeout(900);
  const firmadas=await p.evaluate(()=>window.__llamadas.firma);
  firmasVistas+=firmadas.length;
  const originales=firmadas.filter(f=>f&&!/-thumb\.[a-z0-9]+$/i.test(f));
  if(originales.length){
    fugas++;
    console.log(`✗ ${ruta} firmo ${originales.length} original(es):`);
    originales.slice(0,3).forEach(o=>console.log('   '+o));
  }else{
    console.log(`✓ ${ruta} · ${firmadas.length} firma(s), todas miniaturas`);
  }
  await p.close();
}

await b.close();s.close();
if(fallos){console.error(`\n${fallos} pantalla(s) con error`);process.exit(1);}
if(fugas){console.error(`\n${fugas} pantalla(s) firmaron un original en una lista`);process.exit(1);}
// Sin una sola firma, la prueba 7 no probo nada: pasaria igual con el modulo roto.
if(!firmasVistas){console.error('\nLa prueba 7 no vio ni una firma de foto: no probo nada');process.exit(1);}
console.log(`\nHumo de navegador OK · ${PANTALLAS.length} pantallas sin errores · las listas solo piden miniaturas`);
