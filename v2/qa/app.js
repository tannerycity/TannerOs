import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://pacnegivzgxpanphrnwp.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const supabase=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const anonClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=id=>document.getElementById(id);
const suiteNames={smoke:'RÁPIDA',critical:'ESENCIAL',full:'COMPLETA'};
const statusNames={passed:'Aprobada',failed:'Bloqueante',warning:'Atención',skipped:'Omitida'};
const sourceLabel={legacy:'Histórica',approved_v2:'Aprobada',platform_safety:'Seguridad'};
const enforcementLabel={database:'Base de datos',command:'Servicio',workflow:'Flujo',frontend:'Interfaz',pending:'Pendiente'};
const moduleCatalog={
  platform:{name:'Plataforma y seguridad',short:'Plataforma',route:'/admin/'},
  home:{name:'Inicio',short:'Inicio',route:'/'},
  public:{name:'Registros públicos',short:'Registros',route:'/registro/'},
  club:{name:'Club y dirección',short:'Club',route:'/club/'},
  players:{name:'Jugadores y familias',short:'Jugadores',route:'/jugadores/'},
  attendance:{name:'Asistencia',short:'Asistencia',route:'/asistencia/'},
  prospects:{name:'Captación',short:'Captación',route:'/prospectos/'},
  scouting:{name:'Scouting',short:'Scouting',route:'/scouting/'},
  commerce:{name:'Pedidos y producción',short:'Pedidos',route:'/pedidos/'},
  cashier:{name:'Taquilla',short:'Taquilla',route:'/taquilla/'},
  finance:{name:'Finanzas y contabilidad',short:'Finanzas',route:'/finanzas/'},
  sponsors:{name:'Patrocinios',short:'Patrocinios',route:'/patrocinadores/'},
  programs:{name:'Programas y eventos',short:'Programas',route:'/operacion/programas/'},
  academies:{name:'Academias',short:'Academias',route:'/operacion/academias/'},
  equipment:{name:'Utilería',short:'Utilería',route:'/utileria/'},
  calendar:{name:'Calendario',short:'Calendario',route:'/calendario/'},
  users:{name:'Usuarios y permisos',short:'Usuarios',route:'/usuarios/'},
  parking:{name:'Estacionamiento',short:'Estacionamiento',route:'/estacionamiento/'},
  sport:{name:'Área deportiva',short:'Deportivo',route:'/deportivo/'},
  admin:{name:'Administración',short:'Administración',route:'/admin/'},
  qa:{name:'Centro de Calidad',short:'Calidad',route:'/qa/'}
};
const routes={home:'/',players:'/jugadores/',attendance:'/asistencia/',prospects:'/prospectos/',scouting:'/scouting/',orders:'/pedidos/',production:'/produccion/',finance:'/finanzas/',cashier:'/taquilla/',accounting:'/contabilidad/',sponsors:'/patrocinadores/',programs:'/operacion/programas/',academies:'/operacion/academias/',equipment:'/utileria/',calendar:'/calendario/',admin:'/admin/',qa:'/qa/'};
let ctx=null,modules=[],rules=[],integrity=null,history=[],currentResults=[],lastRun=null,running=false,moduleStatusFilter='';

function show(id){['loadingView','deniedView','view'].forEach(view=>$(view)?.classList.toggle('hidden',view!==id));}
function safe(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function assert(ok,message){if(!ok)throw new Error(message||'La validación no pasó');}
function permission(code,write=false){const module=modules.find(item=>item.module_code===code);return Boolean(module?.enabled&&(write?module.can_write:module.can_read));}
function fmtMs(ms){const value=Number(ms||0);return value<1000?value+' ms':(value/1000).toFixed(1)+' s';}
function percentile(values,value=.95){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*value)-1)];}
function moduleFor(test){
  if(test.module)return test.module;
  const key=test.key||'';
  if(/^(auth|context|permissions|security|integrity|migration|rules|performance)/.test(key))return 'platform';
  if(/home/.test(key))return 'home';
  if(/registro|public/.test(key))return 'public';
  if(/players|goalkeepers/.test(key))return 'players';
  if(/attendance/.test(key))return 'attendance';
  if(/prospects/.test(key))return 'prospects';
  if(/scouting/.test(key))return 'scouting';
  if(/orders|catalog|production/.test(key))return 'commerce';
  if(/cashier/.test(key))return 'cashier';
  if(/finance|accounting/.test(key))return 'finance';
  if(/sponsors/.test(key))return 'sponsors';
  if(/programs/.test(key))return 'programs';
  if(/academies/.test(key))return 'academies';
  if(/equipment/.test(key))return 'equipment';
  if(/calendar/.test(key))return 'calendar';
  if(/admin/.test(key))return 'admin';
  if(/qa/.test(key))return 'qa';
  return 'platform';
}
async function runTest(def){
  const started=performance.now();
  try{
    const out=await def.run(),status=out?.status||'passed';
    return {...def,module:moduleFor(def),status,detail:out?.detail||(status==='passed'?'Todo en orden.':'Revisar.'),metrics:out?.metrics||null,durationMs:Math.round(performance.now()-started)};
  }catch(error){
    return {...def,module:moduleFor(def),status:'failed',detail:error?.message||String(error),durationMs:Math.round(performance.now()-started)};
  }
}
async function checkRoute(path,{contains=null,minBytes=120}={}){
  const started=performance.now(),response=await fetch(path,{cache:'no-store',redirect:'follow'}),text=await response.text(),responseMs=Math.round(performance.now()-started);
  assert(response.ok,path+' respondió HTTP '+response.status);
  assert(text.length>=minBytes,path+' devolvió contenido insuficiente');
  assert(!/<title>\s*404/i.test(text),path+' parece una página inexistente');
  if(contains)assert(text.includes(contains),path+' no contiene el recurso esperado');
  return {detail:'HTTP '+response.status+' · '+fmtMs(responseMs)+' · '+text.length.toLocaleString('es-MX')+' bytes',metrics:{responseMs,bytes:text.length}};
}
function routeTest(key,name,path,module,options={}){return {key:'route.'+key,name,category:'Disponibilidad',module,run:()=>checkRoute(path,options)};}
function rpcTest(key,name,moduleCode,rpcName,params,module=moduleCode){
  return {key:'rpc.'+key,name,category:'Datos',module,run:async()=>{
    if(moduleCode&&!permission(moduleCode))return {status:'skipped',detail:'Este usuario no tiene lectura del módulo.'};
    const data=await rpc(rpcName,params?params():{}),count=Array.isArray(data)?data.length:null;
    return {detail:count===null?'El servicio respondió correctamente.':count+' registro(s) disponibles.'};
  }};
}
function coreTests(){return [
  {key:'auth.session',name:'Sesión del equipo',category:'Seguridad',module:'platform',run:async()=>{const {data:{session},error}=await supabase.auth.getSession();if(error)throw error;assert(session?.user?.id,'No hay una sesión válida');return {detail:'La sesión está activa.'};}},
  {key:'context.organization',name:'Club correcto',category:'Datos',module:'platform',run:async()=>{const rows=await rpc('v2_my_context');assert(rows?.[0]?.organization_id===ctx.organization_id,'El contexto del club es inconsistente');return {detail:(ctx.organization_name||'Organización')+' · '+ctx.role};}},
  {key:'permissions.qa',name:'Acceso al Centro de Calidad',category:'Permisos',module:'qa',run:async()=>{assert(permission('qa'),'El usuario no tiene lectura de Calidad');return permission('qa',true)?{detail:'Puede ejecutar y guardar revisiones.'}:{status:'warning',detail:'Puede revisar, pero el historial no se guardará.'};}},
  routeTest('home','Inicio',routes.home,'home'),
  routeTest('registro','Registro general','/registro/','public',{contains:'/public-form.js'}),
  routeTest('pedido','Pedido público','/pedido/','public',{contains:'/public-form.js'}),
  routeTest('programas','Registro a programas','/programas/','public',{contains:'/public-form.js'}),
  {key:'integrity.snapshot',name:'Integridad del club',category:'Datos',module:'platform',run:async()=>{integrity=await rpc('v2_qa_integrity',{organization_id:ctx.organization_id});assert(integrity,'No se recibió el estado de integridad');return {detail:'La fotografía de integridad está disponible.'};}},
  {key:'migration.financial-drift',name:'Movimientos financieros completos',category:'Datos',module:'finance',run:async()=>{integrity=integrity||await rpc('v2_qa_integrity',{organization_id:ctx.organization_id});const count=Number(integrity.legacyFinancialDrift||0);assert(count===0,count+' movimiento(s) financiero(s) sin relación completa');return {detail:'Todos los movimientos están relacionados.'};}}
];}
function criticalTests(){return [
  {key:'security.dml',name:'Escritura directa bloqueada',category:'Seguridad',module:'platform',run:async()=>{integrity=integrity||await rpc('v2_qa_integrity',{organization_id:ctx.organization_id});assert(integrity.canonicalDmlLocked===true,(integrity.authenticatedDirectDmlGrants||0)+' acceso(s) directos abiertos');return {detail:'Las operaciones sensibles pasan por funciones protegidas.'};}},
  {key:'rules.active-tested',name:'Reglas activas cubiertas',category:'Reglas',module:'platform',run:async()=>{integrity=integrity||await rpc('v2_qa_integrity',{organization_id:ctx.organization_id});const count=Number(integrity?.rules?.activeUntested||0);assert(count===0,count+' regla(s) activa(s) sin prueba');return {detail:'Todas las reglas activas tienen prueba registrada.'};}},
  {key:'players.duplicates',name:'Expedientes sin duplicados',category:'Datos',module:'players',run:async()=>{if(!permission('players'))return {status:'skipped',detail:'Sin lectura de Jugadores.'};const rows=await rpc('v2_player_duplicates',{organization_id:ctx.organization_id})||[];return rows.length?{status:'warning',detail:rows.length+' Tanner(es) requieren revisión de expediente.'}:{detail:'No hay expedientes duplicados activos.'};}},
  {key:'security.anon-internal',name:'Visitante bloqueado de información interna',category:'Seguridad',module:'platform',run:async()=>{const {error}=await anonClient.rpc('v2_qa_integrity',{organization_id:ctx.organization_id});assert(Boolean(error),'Un visitante pudo consultar información interna');return {detail:'El acceso anónimo fue rechazado.'};}},
  routeTest('goalkeepers','Registro de porteros','/registro/porteros/','public',{contains:'/public-form.js'}),
  routeTest('players-campaign','Registro de jugadores','/registro/jugadores/','public',{contains:'/public-form.js'}),
  routeTest('players','Jugadores',routes.players,'players'),routeTest('prospects','Captación',routes.prospects,'prospects'),
  routeTest('scouting','Scouting',routes.scouting,'scouting'),routeTest('orders','Pedidos',routes.orders,'commerce'),
  routeTest('catalog','Catálogo','/catalogo/','commerce'),routeTest('cashier','Taquilla',routes.cashier,'cashier'),
  routeTest('finance','Finanzas',routes.finance,'finance'),routeTest('admin','Administración',routes.admin,'admin'),
  rpcTest('players','Lectura de jugadores','players','v2_players',()=>({organization_id:ctx.organization_id,status_filter:'active'}),'players'),
  rpcTest('prospects','Lectura de prospectos','prospects','v2_prospects',()=>({organization_id:ctx.organization_id,status_filter:null}),'prospects'),
  rpcTest('orders','Lectura de pedidos','commerce','v2_orders',()=>({organization_id:ctx.organization_id,status_filter:null}),'commerce'),
  rpcTest('action-center','Pendientes del club',null,'v2_action_center',()=>({organization_id:ctx.organization_id}),'home')
];}
const fullRouteMatrix=[
  ['home-full','Inicio','/','home'],['club','Club','/club/','club'],['direction','Dirección','/direccion/','club'],
  ['finance-full','Finanzas','/finanzas/','finance'],['cashier-full','Taquilla','/taquilla/','cashier'],['tanner','Ficha Tanner','/tanner/','players'],
  ['families','Familias','/familias/','players'],['parking','Estacionamiento','/estacionamiento/','parking'],['players-full','Jugadores','/jugadores/','players'],
  ['attendance','Asistencia','/asistencia/','attendance'],['callups','Convocatoria','/convocatoria/','attendance'],['calendar','Calendario','/calendario/','calendar'],
  ['academies','Academias','/operacion/academias/','academies'],['prospects-full','Captación','/prospectos/','prospects'],['scouting-full','Scouting','/scouting/','scouting'],
  ['orders-full','Pedidos','/pedidos/','commerce'],['equipment','Utilería','/utileria/','equipment'],['sponsors','Patrocinios','/patrocinadores/','sponsors'],
  ['accounting','Contabilidad','/contabilidad/','finance'],['users','Usuarios','/usuarios/','users'],['admin-full','Administración','/admin/','admin'],
  ['qa','Centro de Calidad','/qa/','qa'],['modules','Puertas disponibles','/modulos/','admin'],['sport','Área deportiva','/deportivo/','sport'],
  ['goalkeepers','Porteros','/porteros/','sport'],['production','Producción','/produccion/','commerce'],['programs-v2','Programas y eventos','/operacion/programas/','programs'],
  ['audit','Historial del club','/admin/auditoria/','admin'],['branding','Identidad del club','/admin/branding/','admin'],['club-settings','Datos del club','/admin/club/','admin'],
  ['onboarding','Preparación del club','/admin/onboarding/','admin']
];
function fullTests(){return [
  ...fullRouteMatrix.map(item=>routeTest(item[0],item[1],item[2],item[3])),
  rpcTest('sponsors','Lectura de patrocinadores','sponsors','v2_sponsors',()=>({organization_id:ctx.organization_id}),'sponsors'),
  {key:'rules.catalog',name:'Catálogo de reglas',category:'Reglas',module:'platform',run:async()=>{const data=await rpc('v2_business_rules',{organization_id:ctx.organization_id});assert(Array.isArray(data)&&data.length>0,'El catálogo de reglas está vacío');return {detail:data.length+' regla(s) disponibles.'};}},
  {key:'migration.conflicts',name:'Registros históricos revisados',category:'Datos',module:'platform',run:async()=>{integrity=integrity||await rpc('v2_qa_integrity',{organization_id:ctx.organization_id});const count=Number(integrity.migrationConflictTotal||0);return count?{status:'warning',detail:count+' registro(s) históricos requieren confirmación.'}:{detail:'No hay registros pendientes de revisión.'};}},
  {key:'public.assets',name:'Recursos principales disponibles',category:'Disponibilidad',module:'platform',run:async()=>{for(const path of ['/public-form.js','/public-form.css','/v2/branding-auto.js']){const response=await fetch(path,{cache:'no-store'});assert(response.ok,path+' respondió HTTP '+response.status);}return {detail:'Los recursos críticos están disponibles.'};}},
  {key:'performance.routes',name:'Respuesta de rutas principales',category:'Rendimiento',module:'platform',run:async()=>{const paths=['/','/jugadores/','/taquilla/','/prospectos/','/scouting/','/admin/'],times=[];for(const path of paths){const started=performance.now(),response=await fetch(path,{cache:'no-store'});assert(response.ok,path+' respondió HTTP '+response.status);await response.text();times.push(Math.round(performance.now()-started));}const p95=percentile(times);return p95>2500?{status:'warning',detail:'Respuesta p95 de '+fmtMs(p95)+'; objetivo menor a 2.5 s.',metrics:{p95,samples:times}}:{detail:'Respuesta p95 de '+fmtMs(p95)+' en '+paths.length+' rutas.',metrics:{p95,samples:times}};}}
];}
function suiteDefinitions(suite){const all=[...coreTests(),...(suite==='smoke'?[]:criticalTests()),...(suite==='full'?fullTests():[])],seen=new Set();return all.filter(test=>!seen.has(test.key)&&seen.add(test.key));}

function aggregates(){
  const grouped=new Map();
  currentResults.forEach(result=>{
    const key=result.module||'platform';
    if(!grouped.has(key))grouped.set(key,{key,total:0,passed:0,failed:0,warning:0,skipped:0,durationMs:0,tests:[]});
    const item=grouped.get(key);
    item.total+=1;item[result.status]+=1;item.durationMs+=result.durationMs||0;item.tests.push(result);
  });
  return [...grouped.values()].map(item=>{
    const measured=item.total-item.skipped;
    return {...item,name:moduleCatalog[item.key]?.name||item.key,route:moduleCatalog[item.key]?.route||'#',status:item.failed?'failed':item.warning?'warning':item.passed?'passed':'skipped',passRate:measured?Math.round((item.passed/measured)*100):0};
  }).sort((a,b)=>b.failed-a.failed||b.warning-a.warning||a.name.localeCompare(b.name));
}
function setView(viewName){
  ['summary','modules','runs','findings'].forEach(name=>$(name+'View')?.classList.toggle('hidden',name!==viewName));
  document.querySelectorAll('.qa-tab').forEach(button=>button.classList.toggle('is-active',button.dataset.view===viewName));
}
function statusMarkup(status){return '<span class="status-pill status-'+safe(status)+'"><i></i>'+safe(statusNames[status]||status)+'</span>';}
function renderTestCard(result){
  return '<article class="test-card"><div class="test-status">'+statusMarkup(result.status)+'</div><div class="test-copy"><strong>'+safe(result.name)+'</strong><small>'+safe(moduleCatalog[result.module]?.name||result.module)+' · '+safe(result.category)+'</small><p>'+safe(result.detail)+'</p></div><time>'+fmtMs(result.durationMs)+'</time></article>';
}
function renderModules(){
  const rows=aggregates();
  const filtered=rows.filter(row=>!moduleStatusFilter||(moduleStatusFilter==='healthy'?row.status==='passed':row.status!=='passed'));
  const card=row=>'<button class="module-card status-'+row.status+'" type="button" data-module="'+safe(row.key)+'"><span class="module-state"><i></i>'+(row.status==='passed'?'Saludable':row.status==='failed'?'Bloqueado':row.status==='warning'?'Requiere atención':'Sin cobertura')+'</span><strong>'+safe(row.name)+'</strong><span class="module-score">'+row.passRate+'%</span><small>'+row.passed+' de '+(row.total-row.skipped)+' pruebas aprobadas</small><span class="module-foot">'+(row.failed?row.failed+' bloqueante(s)':row.warning?row.warning+' advertencia(s)':'Todo en orden')+' <b>Ver detalle</b></span></button>';
  $('moduleGrid').innerHTML=filtered.map(card).join('');
  $('moduleEmpty').classList.toggle('hidden',filtered.length>0);
  $('modulePreview').innerHTML=rows.slice(0,4).map(card).join('');
  $('modulePreviewEmpty').classList.toggle('hidden',rows.length>0);
  document.querySelectorAll('[data-module]').forEach(button=>button.addEventListener('click',()=>openModule(button.dataset.module)));
}
function openModule(key){
  const row=aggregates().find(item=>item.key===key);if(!row)return;
  $('moduleDetailTitle').textContent=row.name;
  $('moduleDetailStats').innerHTML='<article><span>Aprobadas</span><strong>'+row.passed+'</strong></article><article><span>Bloqueantes</span><strong>'+row.failed+'</strong></article><article><span>Atención</span><strong>'+row.warning+'</strong></article><article><span>Cobertura ejecutada</span><strong>'+row.passRate+'%</strong></article>';
  $('moduleDetailTests').innerHTML=row.tests.map(renderTestCard).join('');
  $('moduleDetail').classList.remove('hidden');
  $('moduleDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderResults(){
  const filter=$('resultFilter')?.value||'',rows=filter?currentResults.filter(result=>result.status===filter):currentResults;
  $('resultRows').innerHTML=rows.map(renderTestCard).join('');
  $('resultsEmpty').classList.toggle('hidden',rows.length>0);
  renderModules();renderFindings();
}
function renderFindings(){
  const filter=$('findingFilter')?.value||'';
  let rows=currentResults.filter(result=>['failed','warning'].includes(result.status));
  if(filter)rows=rows.filter(result=>result.status===filter);
  rows.sort((a,b)=>(a.status==='failed'?0:1)-(b.status==='failed'?0:1));
  $('findingList').innerHTML=rows.map((result,index)=>'<article class="finding-card finding-'+result.status+'"><span class="finding-rank">'+String(index+1).padStart(2,'0')+'</span><div><div>'+statusMarkup(result.status)+'<span class="finding-module">'+safe(moduleCatalog[result.module]?.name||result.module)+'</span></div><h3>'+safe(result.name)+'</h3><p>'+safe(result.detail)+'</p></div></article>').join('');
  $('findingsEmpty').classList.toggle('hidden',rows.length>0);
  const total=currentResults.filter(result=>['failed','warning'].includes(result.status)).length;
  $('findingCount').textContent=total;$('findingCount').classList.toggle('hidden',total===0);
}
function renderNextAction(){
  const finding=currentResults.find(result=>result.status==='failed')||currentResults.find(result=>result.status==='warning'),box=$('nextAction');
  box.classList.toggle('next-danger',finding?.status==='failed');box.classList.toggle('next-warning',finding?.status==='warning');box.classList.toggle('next-ok',Boolean(lastRun&&!finding));
  if(!lastRun)return;
  if(finding){
    $('nextTitle').textContent=(moduleCatalog[finding.module]?.short||finding.module)+': '+finding.name;
    $('nextDetail').textContent=finding.detail;$('nextActionButton').textContent='Ver hallazgo';$('nextActionButton').onclick=()=>setView('findings');
  }else{
    $('nextTitle').textContent='El equipo está listo para jugar';$('nextDetail').textContent='La ejecución terminó sin bloqueantes ni advertencias.';$('nextActionButton').textContent='Ver ejecución';$('nextActionButton').onclick=()=>setView('runs');
  }
}
function updateRunSummary(){
  if(!lastRun)return;
  const counted=lastRun.total-lastRun.skipped,passRate=counted?Math.round((lastRun.passed/counted)*100):0,moduleRows=aggregates(),healthy=moduleRows.filter(row=>row.status==='passed').length;
  $('qualityScore').querySelector('strong').textContent=passRate+'%';$('qualityScore').className='quality-score quality-'+lastRun.status;
  $('overallHealth').innerHTML='<i></i> '+(lastRun.status==='failed'?'Versión detenida':lastRun.status==='warning'?'Requiere atención':'Lista para jugar');
  $('kpiPassRate').textContent=passRate+'%';$('kpiPassDetail').textContent=lastRun.passed+' de '+counted+' pruebas';
  $('kpiModules').textContent=healthy+'/'+moduleRows.length;$('kpiModuleDetail').textContent=moduleRows.length?'módulos revisados':'sin módulos';
  $('kpiBlockers').textContent=lastRun.failed;$('kpiDuration').textContent=fmtMs(lastRun.durationMs);$('kpiSuite').textContent='Revisión '+(suiteNames[lastRun.suite]?.toLowerCase()||'realizada');
  $('heroTitle').textContent=lastRun.status==='failed'?'La versión necesita banca.':lastRun.status==='warning'?'Hay jugadas por corregir.':'TannerOS está listo para jugar.';
  $('heroCopy').textContent=lastRun.status==='failed'?'Encontramos fallas que deben resolverse antes de publicar.':lastRun.status==='warning'?'La operación funciona, pero hay puntos que conviene atender.':'Los controles ejecutados terminaron sin hallazgos.';
  renderNextAction();
}
async function runSuite(suite,{automatic=false}={}){
  if(running)return;
  running=true;document.body.classList.add('qa-running');currentResults=[];integrity=null;
  const definitions=suiteDefinitions(suite),startedAt=new Date(),started=performance.now();
  $('runnerStatus').textContent='Entrando a la cancha · 0/'+definitions.length;$('progressBar').style.width='0%';renderResults();
  for(let index=0;index<definitions.length;index+=1){
    currentResults.push(await runTest(definitions[index]));
    $('runnerStatus').textContent='Revisión '+suiteNames[suite].toLowerCase()+' · '+(index+1)+'/'+definitions.length;
    $('progressBar').style.width=Math.round(((index+1)/definitions.length)*100)+'%';renderResults();
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const finishedAt=new Date(),durationMs=Math.round(performance.now()-started),passed=currentResults.filter(result=>result.status==='passed').length,failed=currentResults.filter(result=>result.status==='failed').length,warnings=currentResults.filter(result=>result.status==='warning').length,skipped=currentResults.filter(result=>result.status==='skipped').length,status=failed?'failed':warnings?'warning':'passed';
  lastRun={suite,status,startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),durationMs,total:currentResults.length,passed,failed,warnings,skipped,automatic,results:currentResults.map(result=>({key:result.key,name:result.name,category:result.category,module:result.module,status:result.status,detail:result.detail,durationMs:result.durationMs,metrics:result.metrics||null}))};
  updateRunSummary();renderIntegrity();
  if(permission('qa',true)){
    try{
      await rpc('v2_qa_record_run',{organization_id:ctx.organization_id,suite,summary:{status,startedAt:lastRun.startedAt,finishedAt:lastRun.finishedAt,durationMs,total:lastRun.total,passed,failed,warnings,skipped},results:lastRun.results,environment:location.hostname,user_agent:navigator.userAgent,app_version:'TannerOS'});
      await loadHistory();
    }catch(error){$('runnerStatus').textContent='La revisión terminó, pero el historial no se guardó: '+error.message;}
  }
  $('runnerStatus').textContent=failed?failed+' bloqueante(s) detectado(s)':warnings?warnings+' punto(s) requieren atención':'Todo en orden · listo para jugar';
  running=false;document.body.classList.remove('qa-running');
}
async function loadHistory(){history=await rpc('v2_qa_runs',{organization_id:ctx.organization_id,limit_count:15});renderHistory();}
function renderHistory(){
  $('historyList').innerHTML=history.map(run=>{
    const failures=Array.isArray(run.failures)?run.failures:[];
    return '<article class="history-card"><div class="history-main"><strong>'+(suiteNames[run.suite]||'REVISIÓN')+' · '+statusMarkup(run.status)+'</strong><small>'+new Date(run.startedAt).toLocaleString('es-MX')+'</small></div><div class="history-metric"><span>Aprobadas</span><b>'+(run.passed||0)+'</b></div><div class="history-metric"><span>Bloqueantes</span><b>'+(run.failed||0)+'</b></div><div class="history-metric"><span>Atención</span><b>'+(run.warnings||0)+'</b></div><div class="history-metric"><span>Tiempo</span><b>'+fmtMs(run.durationMs)+'</b></div>'+(failures.length?'<div class="history-failures">'+failures.slice(0,4).map(item=>'<div>'+safe(item.name)+': '+safe(item.detail||item.status)+'</div>').join('')+'</div>':'')+'</article>';
  }).join('');
  $('historyEmpty').classList.toggle('hidden',history.length>0);
}
function renderFilters(){
  const select=$('domainFilter'),domains=[...new Set(rules.map(rule=>rule.domain))].sort((a,b)=>a.localeCompare(b));
  select.querySelectorAll('option:not(:first-child)').forEach(option=>option.remove());
  domains.forEach(domain=>{const option=document.createElement('option');option.value=domain;option.textContent=domain;select.appendChild(option);});
}
function renderRules(){
  const domain=$('domainFilter').value,status=$('statusFilter').value;
  const rows=rules.filter(rule=>(!domain||rule.domain===domain)&&(!status||(status==='tested'?rule.test_status==='tested':rule.enforcement==='pending'||rule.test_status==='pending'||rule.status==='pending')));
  $('ruleList').innerHTML=rows.map(rule=>'<article class="rule-card"><div class="rule-top"><div><span class="rule-key">'+safe(rule.rule_key)+'</span><strong>'+safe(rule.title)+'</strong></div><div class="rule-badges"><span class="tag">'+safe(sourceLabel[rule.source]||rule.source)+'</span><span class="tag '+(rule.enforcement==='pending'?'pending':'enforced')+'">'+safe(enforcementLabel[rule.enforcement]||rule.enforcement)+'</span><span class="tag '+(rule.test_status==='tested'?'tested':'pending')+'">'+(rule.test_status==='tested'?'Probada':'Pendiente')+'</span></div></div><p>'+safe(rule.description)+'</p><div class="rule-foot"><span>'+safe(rule.domain)+'</span><span>Prioridad '+safe(rule.precedence)+'</span></div></article>').join('');
}
function renderIntegrity(){
  if(!integrity)return;
  const ruleData=integrity.rules||{},locked=Boolean(integrity.canonicalDmlLocked);
  $('integrityDml').textContent=locked?'0':Number(integrity.authenticatedDirectDmlGrants||0);$('integrityDmlText').textContent=locked?'operaciones directas abiertas':'accesos directos requieren atención';$('integrityDml').className=locked?'integrity-ok':'integrity-bad';
  $('integrityAudit').textContent=Number(integrity.legacyAuditEvents||0).toLocaleString('es-MX');$('integrityConflicts').textContent=Number(integrity.migrationConflictTotal||0).toLocaleString('es-MX');$('integrityUntested').textContent=Number(ruleData.activeUntested||0).toLocaleString('es-MX');
  const labels={attendance:'Asistencia',commerce:'Comercio',players:'Jugadores',programs:'Programas'};
  $('conflictList').innerHTML=(integrity.migrationConflicts||[]).map(item=>'<article class="conflict-card"><div><strong>'+safe(labels[item.domain]||item.domain)+'</strong><span>'+safe(item.type)+'</span></div><b>'+Number(item.count||0)+'</b></article>').join('');
}
function exportJson(){
  if(!lastRun){$('runnerStatus').textContent='Primero ejecuta una revisión.';return;}
  const blob=new Blob([JSON.stringify(lastRun,null,2)],{type:'application/json'}),anchor=document.createElement('a');
  anchor.href=URL.createObjectURL(blob);anchor.download='tanneros-calidad-'+lastRun.suite+'-'+new Date().toISOString().slice(0,10)+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(anchor.href),500);
}
function bindEvents(){
  document.querySelectorAll('.qa-tab,.qa-jump').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  document.querySelectorAll('[data-suite]').forEach(button=>button.addEventListener('click',()=>runSuite(button.dataset.suite)));
  document.querySelectorAll('[data-module-status]').forEach(button=>button.addEventListener('click',()=>{moduleStatusFilter=button.dataset.moduleStatus;document.querySelectorAll('[data-module-status]').forEach(item=>item.classList.toggle('is-active',item===button));renderModules();}));
  $('runSmoke').addEventListener('click',()=>runSuite('smoke'));$('runCritical').addEventListener('click',()=>runSuite('critical'));$('runFull').addEventListener('click',()=>runSuite('full'));
  $('nextActionButton').onclick=()=>runSuite('critical');$('exportJson').addEventListener('click',exportJson);$('refreshHistory').addEventListener('click',loadHistory);
  $('resultFilter').addEventListener('change',renderResults);$('findingFilter').addEventListener('change',renderFindings);$('domainFilter').addEventListener('change',renderRules);$('statusFilter').addEventListener('change',renderRules);$('closeModule').addEventListener('click',()=>$('moduleDetail').classList.add('hidden'));
}
async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta todavía no pertenece a un club.';show('deniedView');return;}
  ctx=rows[0];modules=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  if(!permission('qa')){$('deniedText').textContent='Tu llave no incluye el Centro de Calidad.';show('deniedView');return;}
  $('orgName').textContent=ctx.organization_name||'Tannery City';$('roleBadge').textContent=ctx.is_owner?'Presidencia':ctx.role;
  [rules,integrity]=await Promise.all([rpc('v2_business_rules',{organization_id:ctx.organization_id}),rpc('v2_qa_integrity',{organization_id:ctx.organization_id})]);
  renderFilters();renderRules();renderIntegrity();await loadHistory();show('view');
  const lastAuto=Number(localStorage.getItem('tosQaLastAutoSmoke')||0);
  if(Date.now()-lastAuto>10*60*1000){localStorage.setItem('tosQaLastAutoSmoke',String(Date.now()));setTimeout(()=>runSuite('smoke',{automatic:true}),250);}
}
bindEvents();
boot().catch(error=>{$('deniedText').textContent=error.message||'No pudimos preparar el Centro de Calidad.';show('deniedView');});
