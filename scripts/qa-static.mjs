import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const errors=[];
const routeContract={
  '/club/':'v2/club/index.html',
  '/direccion/':'v2/direccion/index.html',
  '/finanzas/':'v2/finanzas/index.html',
  '/taquilla/':'v2/taquilla/index.html',
  '/tanner/':'v2/tanner/index.html',
  '/familias/':'v2/familias/index.html',
  '/estacionamiento/':'v2/estacionamiento/index.html',
  '/jugadores/':'v2/jugadores/index.html',
  '/asistencia/':'v2/asistencia/index.html',
  '/convocatoria/':'v2/convocatoria/index.html',
  '/calendario/':'v2/calendario/index.html',
  '/operacion/academias/':'v2/academias/index.html',
  '/prospectos/':'v2/prospectos/index.html',
  '/scouting/':'v2/scouting/index.html',
  '/pedidos/':'v2/pedidos/index.html',
  '/utileria/':'v2/utileria/index.html',
  '/patrocinadores/':'v2/patrocinadores/index.html',
  '/contabilidad/':'v2/contabilidad/index.html',
  '/usuarios/':'v2/usuarios/index.html',
  '/admin/':'v2/admin/index.html',
  '/qa/':'v2/qa/index.html',
  '/modulos/':'v2/modulos/index.html',
  '/deportivo/':'v2/deportivo/index.html',
  '/porteros/':'v2/porteros/index.html',
  '/produccion/':'v2/produccion/index.html',
  '/operacion/programas/':'v2/programas/index.html',
  '/admin/auditoria/':'v2/admin/auditoria/index.html',
  '/admin/branding/':'v2/admin/branding/index.html',
  '/admin/club/':'v2/admin/club/index.html',
  '/admin/onboarding/':'v2/admin/onboarding/index.html',
  '/admin/fotos/':'v2/admin/fotos/index.html',
  '/admin/clubes/':'v2/admin/clubes/index.html'
};
const required=['index.html','v2/index.html','v2/app.js','v2/shell.js','v2/production.css','public-form.js','public-form.css','vercel.json',...Object.values(routeContract),'registro/index.html','registro/scouting/index.html','pedido/index.html','programas/index.html','academias/index.html','centro-tanner/index.html','centro-tanner/app.js','centro-tanner/styles.css','aviso-de-privacidad/index.html','aviso-de-privacidad/app.js','v2/admin/centro-tanner/index.html','v2/admin/centro-tanner/app.js'];
for(const file of new Set(required))if(!fs.existsSync(file))errors.push(`Falta archivo crítico: ${file}`);

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});}
const htmlFiles=walk('v2').filter(f=>f.endsWith('index.html'));
for(const file of htmlFiles){const html=fs.readFileSync(file,'utf8');if(!/name=["']viewport["']/i.test(html))errors.push(`Sin viewport mobile-first: ${file}`);if(html.length<120)errors.push(`HTML sospechosamente pequeño: ${file}`);}

const clientFiles=['index.html',...walk('v2').filter(f=>/\.(js|html)$/i.test(f)),'public-form.js'];
for(const file of clientFiles){const text=fs.readFileSync(file,'utf8');if(/sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE/i.test(text))errors.push(`Posible secreto de backend expuesto: ${file}`);}

const rootHtml=fs.readFileSync('index.html','utf8'),aliasHtml=fs.readFileSync('v2/index.html','utf8');
if(rootHtml!==aliasHtml)errors.push('index.html y v2/index.html deben ser el mismo shell; /v2 es solo compatibilidad');
for(const [entry,html] of [['index.html',rootHtml],['v2/index.html',aliasHtml]]){
  const boots=(html.match(/\/v2\/app\.js/g)||[]).length;if(boots!==1)errors.push(`${entry} debe cargar app.js exactamente una vez; encontró ${boots}`);
  if(/auth-gate\.js/i.test(html.replace(/auth-gate\.css/ig,'')))errors.push(`${entry} todavía ejecuta auth-gate.js`);
  if(/branding-auto\.js/i.test(html))errors.push(`${entry} no debe ejecutar branding-auto en Inicio`);
  if(!/id=["']email["']/i.test(html)||!/id=["']password["']/i.test(html))errors.push(`${entry} no conserva el acceso canónico`);
  if(!/production\.css/i.test(html))errors.push(`${entry} no carga la capa UX de producción`);
  if((html.match(/id=["']shellNavBackdrop["']/g)||[]).length!==1)errors.push(`${entry} debe tener exactamente un backdrop móvil`);
}

const shell=fs.readFileSync('v2/shell.js','utf8'),home=fs.readFileSync('v2/app.js','utf8');
for(const file of [['v2/shell.js',shell],['v2/app.js',home]])if(/href\s*:\s*["']\/v2\//i.test(file[1]))errors.push(`Navegación visible legacy /v2 en ${file[0]}`);

const vercelRaw=fs.readFileSync('vercel.json','utf8');let vercel;
try{vercel=JSON.parse(vercelRaw);}catch(e){errors.push(`vercel.json inválido: ${e.message}`);vercel={redirects:[],rewrites:[]};}
const rewrites=vercel.rewrites||[],redirects=vercel.redirects||[];
for(const [route,destination] of Object.entries(routeContract)){
  const noSlash=route==='/'?'/':route.replace(/\/$/,'');
  const mapped=rewrites.some(r=>(r.source===route||r.source===noSlash)&&r.destination===`/${destination}`);
  if(!mapped)errors.push(`Ruta canónica sin rewrite explícito: ${route} -> /${destination}`);
}
for(const rule of redirects){if(String(rule.source||'').startsWith('/v2/')&&String(rule.source||'').includes(':path*'))errors.push(`Redirect legacy captura assets y puede provocar 404: ${rule.source}`);}
for(const header of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'])if(!vercelRaw.includes(header))errors.push(`Falta header de seguridad: ${header}`);

const qa=fs.readFileSync('v2/qa/index.html','utf8');
for(const id of ['runSmoke','runCritical','runFull','qualityScore','moduleGrid','findingList','resultRows','historyList'])if(!qa.includes(`id="${id}"`))errors.push(`Calidad incompleto: falta #${id}`);
const qaApp=fs.readFileSync('v2/qa/app.js','utf8');
for(const moduleKey of ['platform','home','public','club','players','attendance','prospects','scouting','commerce','cashier','finance','sponsors','programs','academies','equipment','calendar','users','parking','sport','admin','qa'])if(!qaApp.includes(`${moduleKey}:{name:`))errors.push(`Centro de Calidad sin mapa para ${moduleKey}`);
for(const route of Object.keys(routeContract))if(!qaApp.includes(`'${route}'`))errors.push(`Centro de Calidad no reconoce la ruta ${route}`);
if(/nextActionButton'\)\.addEventListener/.test(qaApp))errors.push('Centro de Calidad registra dos acciones posibles en #nextActionButton; debe usar un único onclick reemplazable');
const publicForm=fs.readFileSync('public-form.js','utf8');for(const route of ['/registro/porteros','/registro/jugadores','/registro/scouting','/pedido','/programas'])if(!publicForm.includes(route))errors.push(`public-form.js no reconoce ${route}`);

const centroTannerApp=fs.readFileSync('centro-tanner/app.js','utf8');
for(const marker of ["rest[0] === 'tema'","rest[0] === 'p'","rest[0] === 'documento'","rest[0] === 'cambios'"])if(!centroTannerApp.includes(marker))errors.push(`centro-tanner/app.js perdió una ruta del router: ${marker}`);
const ctRewriteOk=rewrites.some(r=>r.source==='/centro-tanner/:path*'&&r.destination==='/centro-tanner/index.html');
if(!ctRewriteOk)errors.push('vercel.json no tiene el rewrite catch-all de /centro-tanner/:path*');
const ctAdminRewriteOk=rewrites.some(r=>r.source==='/admin/centro-tanner'&&r.destination==='/v2/admin/centro-tanner/index.html');
if(!ctAdminRewriteOk)errors.push('vercel.json no tiene el rewrite de /admin/centro-tanner');

// Guardas de egress: un avatar nunca debe caer silenciosamente en la foto
// original. El pull heredado se frena en el gateway de Supabase.
for(const file of ['v2/jugadores/app.js','v2/calendario/app.js','v2/app.js']){
  const source=fs.readFileSync(file,'utf8');
  if(/photo_thumb_path\s*\|\|\s*(?:p\.)?photo_path/.test(source))errors.push(`Egress: ${file} usa foto completa como fallback de miniatura`);
}
const attendanceApp=fs.readFileSync('v2/asistencia/app.js','utf8');
if(/signRosterPhotos[\s\S]*?photo_path[\s\S]*?createSignedUrls/.test(attendanceApp))errors.push('Egress: Asistencia firma fotos completas para el roster');
const prospectsApp=fs.readFileSync('v2/prospectos/app.js','utf8');
if(/loadProspects\(\)[\s\S]{0,300}await loadProspectPhotos\(\)/.test(prospectsApp))errors.push('Egress: Prospectos descarga todas las fotos al abrir la lista');
for(const file of ['v2/app.js','v2/asistencia/app.js','v2/calendario/app.js','v2/jugadores/app.js']){
  const source=fs.readFileSync(file,'utf8');
  if(!source.includes("from '/v2/photo-cache.js'"))errors.push(`Egress: ${file} no reutiliza URLs firmadas de fotos`);
}
// Toda firma de foto pasa por el cache compartido, en lote y de a una. Una URL
// firmada por fuera trae token nuevo, y el navegador cachea por URL completa:
// token nuevo es descarga nueva aunque los bytes sean los mismos.
for(const file of [...clientFiles.filter(f=>f.endsWith('.js')),'public-form.js']){
  if(file==='v2/photo-cache.js')continue;
  let source;try{source=fs.readFileSync(file,'utf8');}catch{continue;}
  if(source.includes('.createSignedUrls('))errors.push(`Egress: ${file} firma lotes fuera del caché compartido`);
  if(source.includes('.createSignedUrl('))errors.push(`Egress: ${file} firma una foto fuera del caché compartido`);
}
// Sintaxis EN MODO MODULO, que es como el navegador los carga de verdad.
//
// `node --check` a secas parsea como script de CommonJS y deja pasar un choque
// entre un `import` y un `const` con el mismo nombre. Asi se colaron cinco
// pantallas —scouting, patrocinadores, utileria, jugadores/photos y catalogo—
// que habrian quedado EN BLANCO en produccion: al convertirlas al helper de
// imagenes entro el import y se quedo la constante vieja. Lo atrapo el CI, no
// esta verificacion. Ahora lo atrapa aqui tambien.
for(const file of [...clientFiles.filter(f=>f.endsWith('.js')),'public-form.js','centro-tanner/app.js','pedido/app.js','aviso-de-privacidad/app.js']){
  let source;try{source=fs.readFileSync(file,'utf8');}catch{continue;}
  try{new (async function(){}).constructor(''); }catch{ /* entorno raro */ }
  const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  if(r.status!==0){
    const detalle=(r.stderr||'').split('\n').find(l=>/Error/.test(l))||'sintaxis invalida';
    errors.push(`Sintaxis de modulo: ${file} — ${detalle.trim()}`);
  }
}

// El historial de migraciones es historia: no se edita ni se borra. Estos 378
// archivos son la unica forma de reconstruir la base desde el repositorio, y
// hasta el 20 de septiembre de 2026 solo 11 estaban aqui: los otros 367 vivian
// nada mas dentro de Supabase.
const manifiesto=JSON.parse(fs.readFileSync('supabase/migrations/MANIFIESTO.json','utf8'));
const migraciones=fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/.test(f)).sort();
if(migraciones.length!==manifiesto.migraciones)
  errors.push(`Migraciones: el manifiesto dice ${manifiesto.migraciones} y hay ${migraciones.length}. Si aplicaste una nueva, exportala y corre scripts/manifiesto-migraciones.mjs --escribir`);
else{
  const suma=crypto.createHash('md5');
  for(const f of migraciones)suma.update(fs.readFileSync(`supabase/migrations/${f}`));
  if(suma.digest('hex')!==manifiesto.huella)
    errors.push('Migraciones: el contenido no coincide con el manifiesto. Una migracion ya aplicada se edito o se borro');
}

// Disponibilidad: el CDN y la versión del cliente de Supabase se nombran en UN
// solo archivo. Un `@2` flotante resuelve a la última 2.x que exista cuando un
// navegador la pide, así que el club podía amanecer con una versión que nadie
// eligió, sin haber desplegado nada — y hay una 3.0 en camino.
const clienteSupabase=fs.readFileSync('v2/supabase-client.js','utf8');
if(!/@supabase\/supabase-js@2\.\d+\.\d+'/.test(clienteSupabase))
  errors.push('Disponibilidad: v2/supabase-client.js no fija una versión exacta del cliente');
for(const file of [...clientFiles,'public-form.js','centro-tanner/app.js','pedido/app.js','aviso-de-privacidad/app.js']){
  if(file==='v2/supabase-client.js')continue;
  let source;try{source=fs.readFileSync(file,'utf8');}catch{continue;}
  if(source.includes('esm.sh/@supabase'))
    errors.push(`Disponibilidad: ${file} importa el cliente del CDN por su cuenta`);
}

// Toda subida declara el mismo Cache-Control, y sale de una sola constante. Las
// rutas llevan un Date.now() y van con upsert:false, asi que son inmutables y un
// max-age largo es seguro; un literal suelto se desincroniza sin que nadie note.
for(const file of [...clientFiles.filter(f=>f.endsWith('.js')),'public-form.js']){
  if(file==='v2/image-encode.js')continue;
  let source;try{source=fs.readFileSync(file,'utf8');}catch{continue;}
  if(/cacheControl\s*:\s*['"]/.test(source))
    errors.push(`Egress: ${file} escribe su propio Cache-Control en vez de UPLOAD_CACHE_CONTROL`);
}
// Egress de Vercel: /v2/ con no-store obliga a volver a bajar todo el JS en cada
// pantalla. Con no-cache el navegador lo guarda y revalida: 304 sin cuerpo.
const cabeceraV2=(vercel.headers||[]).find(h=>h.source==='/v2/(.*)');
const valorV2=cabeceraV2?.headers?.find(h=>h.key==='Cache-Control')?.value||'';
if(!valorV2)errors.push('vercel.json no declara Cache-Control para /v2/(.*)');
else if(valorV2.includes('no-store'))errors.push('Egress: /v2/ vuelve a no-store; el navegador no puede reusar nada');

// Egress: canvas.toBlob devuelve PNG —no null— cuando el navegador no soporta
// el tipo pedido, y para PNG ignora la calidad. Pedir WebP sin verificar lo que
// volvió fue lo que metió 143 MB en PNG. Toda codificación pasa por el helper.
for(const file of [...clientFiles.filter(f=>f.endsWith('.js')),'public-form.js']){
  if(['v2/image-encode.js','welcome-card.js','v2/admin/branding/app.js'].includes(file))continue;
  let source;try{source=fs.readFileSync(file,'utf8');}catch{continue;}
  if(source.includes("'image/webp'")&&!source.includes("from '/v2/image-encode.js'"))
    errors.push(`Egress: ${file} codifica a WebP sin el helper que verifica el tipo devuelto`);
}
const academyApp=fs.readFileSync('v2/mi-academia/app.js','utf8');
for(const contract of ["const METODOLOGIA='TC_1.0'",'Guardar y siguiente','Sin evidencia','BABY_DIMENSIONES','v2_save_academy_evaluation'])if(!academyApp.includes(contract))errors.push(`Perfil Tanner: falta contrato ${contract}`);
const playerProfile=fs.readFileSync('v2/jugadores/index.html','utf8');
if(/Promedio última evaluación|id="cardOverall"/.test(playerProfile))errors.push('Perfil Tanner: no debe mostrar promedio global');
const sportsApp=fs.readFileSync('v2/deportivo/app.js','utf8');
for(const contract of ["const METODOLOGIA='TC_1.0'",'restoreEvaluationDraft','v2_upsert_player_evaluation'])if(!sportsApp.includes(contract))errors.push(`Evaluación directa: falta ${contract}`);
if(sportsApp.includes("evaluationPanel').classList.add('hidden')"))errors.push('Evaluación directa: el panel oficial está oculto');
const playersApp=fs.readFileSync('v2/jugadores/app.js','utf8');
for(const contract of ['openInlineEvaluation','saveInlineEvaluation','v2_upsert_player_evaluation','scaleMax','isTcEvaluation'])if(!playersApp.includes(contract))errors.push(`Evaluación en ficha: falta ${contract}`);
if(!playersApp.includes("methodology_version==='TC_1.0'"))errors.push('Perfil Tanner: la ficha vuelve a mezclar evaluaciones de prueba');
if(/openSports.+href=/.test(playersApp))errors.push('Evaluación en ficha: no debe sacar al profesor del módulo de jugadores');
if(playersApp.includes('Evaluación histórica · escala 1–10'))errors.push('Perfil Tanner: no debe presentar evaluaciones legacy');
if(!playerProfile.includes('radarPoint5')||!playerProfile.includes('Espíritu</text>'))errors.push('Perfil Tanner: el mapa visual debe representar las cinco dimensiones');
if(playerProfile.includes('<details class="radar-secondary">'))errors.push('Perfil Tanner: el pentagrama debe estar siempre visible');
for(const contract of ['sportsRadarPrevious','profileEvalProgressBar','profileEvalRadarPolygon','PROFILE_SCALE_LABELS','sameStage','openEvaluationCoach','openDimensionGuidance','Guardar y siguiente'])if(!playersApp.includes(contract)&&!playerProfile.includes(contract))errors.push(`Perfil Tanner UX: falta ${contract}`);
if(!playersApp.includes("'/v2/evaluation-guidance.js'"))errors.push('Perfil Tanner UX: Jugadores no usa el catálogo configurable de coaching');
for(const [file,source] of [['Jugadores',playersApp],['Mi Academia',fs.readFileSync('v2/mi-academia/app.js','utf8')],['Deportivo',fs.readFileSync('v2/deportivo/index.html','utf8')]]){
  for(const label of ['En formación','Tomando ritmo','En nivel','Sobresale','Alto nivel','Sin evidencia'])if(!source.includes(label))errors.push(`Escala oficial: falta “${label}” en ${file}`);
}
const profileFixture=fs.readFileSync('v2/qa/perfil-tanner/index.html','utf8');
for(const contract of ['noindex,nofollow','TC_1.0','Sin evidencia','Guardar y siguiente'])if(!profileFixture.includes(contract))errors.push(`Captura Perfil Tanner: falta ${contract}`);
const cleanupMigration=fs.readFileSync('supabase/migrations-escritas-a-mano/202609130001_delete_legacy_player_evaluations.sql','utf8');
for(const contract of ['begin;','delete from app.player_evaluations',"not like '[TC_1.0] %'",'commit;'])if(!cleanupMigration.includes(contract))errors.push(`Limpieza de evaluaciones: falta ${contract}`);
const parkingApp=fs.readFileSync('v2/estacionamiento/app.js','utf8');
for(const contract of ["state.filtro==='por_cobrar'","state.filtro==='cancelados'",'data-kpi-filter','Cobrar en Taquilla','park-stepper','park-detail-hero','park-facts','v2_delete_parking_pass',"ctx.role==='Presidencia'"])if(!parkingApp.includes(contract))errors.push(`Estacionamiento UX: falta ${contract}`);
const parkingDeleteMigration=fs.readFileSync('supabase/migrations-escritas-a-mano/202609140001_delete_parking_pass_rpc.sql','utf8');
for(const contract of ['security definer','v2_my_context','Only Presidencia','rejected','revoked','grant execute'])if(!parkingDeleteMigration.includes(contract))errors.push(`Estacionamiento delete RPC: falta ${contract}`);

// ── El CSP tiene que permitir lo que la app misma fabrica ──────────────────
//
// photo-cache.js crea blob: URLs a proposito: es lo que hace que una foto ya
// descargada no se vuelva a pedir. Pero el CSP de produccion no listaba blob:
// en connect-src, y un fetch() se rige por connect-src, no por img-src. Las
// fotos se VEIAN bien y aun asi /admin/fotos/ fallo con "Failed to fetch" en
// las diez del lote, con cero bytes bajados.
//
// Reproducido en Chromium con el CSP exacto de produccion: el fetch falla con
// ese mismo mensaje, y pasa en cuanto blob: entra en connect-src.
const cspLinea = (fs.readFileSync('vercel.json','utf8').match(/"Content-Security-Policy","value":"([^"]+)"/) || [])[1] || '';
const connectSrc = (cspLinea.match(/connect-src([^;]*)/) || [])[1] || '';
if (!cspLinea) errors.push('CSP: no se encontro la cabecera en vercel.json');
else if (!/\bblob:/.test(connectSrc))
  errors.push('CSP: connect-src no permite blob:, y photo-cache.js entrega blob: URLs. '
    + 'Cualquier fetch() sobre una foto cacheada falla con "Failed to fetch"');

// La pantalla que recodifica originales tiene que pedirlos a Storage, no al
// cache: un blob: no se puede descargar, y el cache puede traer hasta 24 horas.
const herramientaFotos = fs.readFileSync('v2/admin/fotos/app.js','utf8');
if (/[^w]getSignedPhotoUrl\(/.test(herramientaFotos))
  errors.push('/admin/fotos/: usa getSignedPhotoUrl, que devuelve blob:. Debe usar getRawSignedPhotoUrl');

// ── Ninguna suite se queda sin correr ──────────────────────────────────────
//
// Dos suites (qa-login-credencial y qa-utileria-baja) se perdieron de CI al
// resolver un conflicto entre dos PRs que tocaban el workflow. Siguieron en el
// repo, dejaron de correr, y CI siguio en verde: exactamente el fallo que esas
// suites existian para impedir.
//
// Y esta barrera se perdio a su vez, al resolver OTRO conflicto sobre este
// mismo archivo dos horas despues. El mecanismo de fondo —que el workflow las
// descubra solo— sobrevivio, asi que las suites siguieron corriendo; lo que
// desaparecio fue el vigilante. Dos veces seguidas por la misma via dice que
// el riesgo real de este archivo es la resolucion de conflictos, no el olvido.
//
// Ahora el workflow las descubre solas y esto vigila la unica grieta que
// queda: que alguien silencie una metiendola a la lista de exclusiones. El
// archivo obliga a escribir el motivo, y este contador obliga a que la lista
// no crezca sin que alguien lo note.
const suitesEnDisco = fs.readdirSync('scripts').filter(f => /^qa-.*\.mjs$/.test(f)).sort();
const listaExclusiones = fs.readFileSync('scripts/qa-suites-excluidas.txt', 'utf8');
const excluidas = listaExclusiones.split('\n').map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

for (const nombre of excluidas) {
  if (!suitesEnDisco.includes(nombre)) errors.push(`Suites: se excluye "${nombre}", que ya no existe`);
}
// El workflow tiene que seguir descubriendolas solo. Si alguien vuelve a
// escribir la lista a mano, esto lo caza antes de que se pierda otra.
const flujo = fs.readFileSync('.github/workflows/tanneros-qa.yml', 'utf8');
if (!flujo.includes("find scripts -maxdepth 1 -name 'qa-*.mjs'"))
  errors.push('Suites: el workflow dejo de descubrirlas solo; una suite nueva podria no correr nunca');
if (!flujo.includes('qa-suites-excluidas.txt'))
  errors.push('Suites: el workflow ya no lee la lista de exclusiones');

const MAX_EXCLUIDAS = 5;  // sube a 5 por qa-humo-asistencia.mjs: necesita Chromium, como las otras dos de navegador
if (excluidas.length > MAX_EXCLUIDAS)
  errors.push(`Suites: hay ${excluidas.length} excluidas y el tope son ${MAX_EXCLUIDAS}. `
    + 'Excluir una suite es ocultarla: arregla lo que falla o sube el tope a proposito.');

if(errors.length){console.error('\nTannerOS static QA FAILED');errors.forEach(e=>console.error(`- ${e}`));process.exit(1);}
console.log(`TannerOS static QA OK · ${htmlFiles.length} pantallas · ${Object.keys(routeContract).length} rutas canónicas verificadas · assets /v2 protegidos`);
