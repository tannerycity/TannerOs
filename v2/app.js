import {supabase,rpc,money,$,renderShell,moduleAccess,setShellSearchItems,setShellHealth} from '/v2/shell.js';

const views=['authView','pendingView','appView'];
let authMode='signin';
let ctx=null;
let navigation=[];
let state={players:[],prospects:[],calendar:[],attendance:[],sponsors:[],equipment:[],collection:null};

const roleProfiles={
  'Presidencia':{subtitle:'Control del club · datos vivos en Supabase',focus:'Pulso del club'},
  'Operaciones':{subtitle:'La operación de hoy, en un solo lugar',focus:'Operación del día'},
  'Formadores':{subtitle:'Entrenamientos, jugadores y seguimiento',focus:'Sesiones y equipo'},
  'Academia':{subtitle:'Academias, asistencia y calendario',focus:'Academia hoy'},
  'Contabilidad':{subtitle:'Cobranza, pagos y caja del club',focus:'Pulso de cobranza'},
  'Taquilla':{subtitle:'Cobros, pedidos y atención a familias',focus:'Caja y atención'},
  'La Quinta Fuerza':{subtitle:'Marcas, acuerdos y activaciones',focus:'Ruta de marcas'},
  'Scouting':{subtitle:'El próximo Tanner está ahí afuera',focus:'Talento en el radar'},
  'Tanner':{subtitle:'Tu club, tu agenda y tu camino Tanner',focus:'Tu semana'}
};

const moduleLinks=[
  {codes:['taquilla','cobranza'],label:'Cobrar',href:'/taquilla/?action=cobrar',write:true,primary:true},
  {codes:['jugadores'],label:'Jugadores',href:'/jugadores/'},
  {codes:['asistencia'],label:'Asistencia',href:'/asistencia/'},
  {codes:['finanzas','cobranza','contabilidad'],label:'Finanzas',href:'/finanzas/'},
  {codes:['taquilla'],label:'Taquilla',href:'/taquilla/'},
  {codes:['prospectos'],label:'Captación',href:'/prospectos/'},
  {codes:['scouting'],label:'Scouting',href:'/scouting/'},
  {codes:['academias'],label:'Academias',href:'/academias/'},
  {codes:['tienda'],label:'Pedidos',href:'/pedidos/'},
  {codes:['cursosVerano'],label:'Programas',href:'/operacion/programas/'},
  {codes:['calendario'],label:'Calendario',href:'/calendario/'},
  {codes:['callups','convocatoria'],label:'Convocatoria',href:'/convocatoria/'},
  {codes:['utileria'],label:'Utilería',href:'/utileria/'},
  {codes:['patrocinadores'],label:'Patrocinadores',href:'/patrocinadores/'},
  {codes:['contabilidad'],label:'Contabilidad',href:'/contabilidad/'},
  {codes:['usuarios'],label:'Usuarios',href:'/usuarios/'},
  {codes:['admin'],label:'Administración',href:'/admin/'},
  {codes:['qa'],label:'QA',href:'/qa/'}
];

function showView(id){views.forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function setMessage(text='',type='error'){const b=$('authMessage');if(!b)return;b.textContent=text;b.dataset.type=type;b.classList.toggle('hidden',!text);}
function showResend(show=true){$('resendConfirmation')?.classList.toggle('hidden',!show);}
function friendlyError(e){
  const r=String(e?.message||e||'Ocurrió un error.');
  if(/invalid login credentials/i.test(r))return 'Correo o contraseña incorrectos.';
  if(/email not confirmed/i.test(r))return 'Confirma tu correo antes de entrar.';
  if(/user already registered/i.test(r))return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if(/rate limit/i.test(r))return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
  if(/not authorized/i.test(r))return 'Tu usuario no tiene permiso para esta sección.';
  return r;
}
function switchAuthMode(mode){
  authMode=mode;const up=mode==='signup';
  $('signInTab')?.classList.toggle('active',!up);$('signUpTab')?.classList.toggle('active',up);
  $('nameField')?.classList.toggle('hidden',!up);if($('authSubmit'))$('authSubmit').textContent=up?'Crear cuenta':'Entrar';
  $('password')?.setAttribute('autocomplete',up?'new-password':'current-password');setMessage();showResend(false);
}
async function handleAuthSubmit(ev){
  ev.preventDefault();setMessage();showResend(false);
  const email=$('email').value.trim(),password=$('password').value,displayName=$('displayName')?.value.trim();
  const btn=$('authSubmit');btn.disabled=true;
  try{
    if(authMode==='signup'){
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||email.split('@')[0]},emailRedirectTo:`${location.origin}/`}});
      if(error)throw error;
      if(!data.session){setMessage('Cuenta creada. Revisa tu correo y confirma el acceso.','success');showResend(true);return;}
    }else{
      const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
    }
    await loadAuthenticatedApp();
  }catch(e){setMessage(friendlyError(e));if(/confirma tu correo/i.test(friendlyError(e)))showResend(true);}
  finally{btn.disabled=false;btn.textContent=authMode==='signup'?'Crear cuenta':'Entrar';}
}
async function resendConfirmation(){
  const email=$('email')?.value.trim();if(!email){setMessage('Escribe primero el correo.');return;}
  const btn=$('resendConfirmation');btn.disabled=true;
  try{
    const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${location.origin}/`}});
    if(error)throw error;setMessage(`Listo. Enviamos un nuevo correo a ${email}.`,'success');
  }catch(e){setMessage(friendlyError(e));}finally{btn.disabled=false;}
}

function monthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
function isoDaysFromNow(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString();}
function can(code,write=false){return moduleAccess(navigation,code,write);}
function canAny(codes,write=false){return codes.some(code=>can(code,write));}
function firstName(){return String(ctx?.display_name||'Tanner').trim().split(/\s+/)[0];}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function rpcSafe(name,params,fallback,timeoutMs=6500){
  let timer;
  try{
    return await Promise.race([
      rpc(name,params),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} timeout`)),timeoutMs);})
    ]);
  }catch(err){console.warn('home rpc',name,err);return fallback;}
  finally{if(timer)clearTimeout(timer);}
}

function renderImmediateHome(){
  const profile=roleProfiles[ctx?.role]||roleProfiles['Presidencia'];
  if($('welcomeTitle'))$('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;
  if($('welcomeSubtitle'))$('welcomeSubtitle').textContent=profile.subtitle;
  renderQuickActions();
  if($('homeKpis'))$('homeKpis').innerHTML='<article class="tos-kpi"><span>Conexión</span><strong>Lista</strong><small>Cargando indicadores del club…</small></article>';
  if($('attentionList'))$('attentionList').innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">TannerOS</span><b>Módulos conectados</b><small>Los indicadores se actualizan en segundo plano.</small></article>';
  if($('agendaList'))$('agendaList').innerHTML='<div class="tos-empty">Cargando agenda…</div>';
  if($('roleFocusBody'))$('roleFocusBody').innerHTML='<div class="tos-empty">Cargando pulso del club…</div>';
  setShellHealth({state:'ok',label:'Conectando datos'});
}

async function loadAuthenticatedApp(){
  const {data:userData}=await supabase.auth.getUser();
  if(!userData?.user){showView('authView');return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){
    if($('pendingText'))$('pendingText').textContent=`La cuenta ${userData.user.email||'actual'} ya existe. Falta vincularla a Tannery City.`;
    showView('pendingView');return;
  }
  ctx=rows[0];
  navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});
  showView('appView');document.body.classList.add('tos-body');
  renderShell({ctx,navigation,active:'inicio',title:'Inicio'});
  renderImmediateHome();
  loadHomeData().catch(err=>{console.error('home data',err);setShellHealth({state:'attention',label:'Datos parciales'});});
}

async function loadHomeData(){
  const org=ctx.organization_id,now=new Date().toISOString(),week=isoDaysFromNow(7);
  const jobs=[];
  if(can('jugadores'))jobs.push(rpcSafe('v2_players',{organization_id:org,status_filter:'active'},[]).then(v=>state.players=Array.isArray(v)?v:[]));
  if(can('prospectos')||can('scouting'))jobs.push(rpcSafe('v2_prospects',{organization_id:org,status_filter:null},[]).then(v=>state.prospects=Array.isArray(v)?v:[]));
  if(can('cobranza')||can('contabilidad')||can('finanzas'))jobs.push(rpcSafe('v2_collection_snapshot',{organization_id:org,billing_period:monthStart()},null).then(v=>state.collection=v&&typeof v==='object'?v:null));
  if(can('calendario'))jobs.push(rpcSafe('v2_calendar',{organization_id:org,from_at:now,to_at:week},[]).then(v=>state.calendar=Array.isArray(v)?v:[]));
  if(can('asistencia'))jobs.push(rpcSafe('v2_attendance_sessions',{organization_id:org,from_at:now,to_at:week},[]).then(v=>state.attendance=Array.isArray(v)?v:[]));
  if(can('patrocinadores'))jobs.push(rpcSafe('v2_sponsors',{organization_id:org},[]).then(v=>state.sponsors=Array.isArray(v)?v:[]));
  if(can('utileria'))jobs.push(rpcSafe('v2_equipment_items',{organization_id:org},[]).then(v=>state.equipment=Array.isArray(v)?v:[]));
  await Promise.allSettled(jobs);
  renderHome();
}

function activeProspects(){return state.prospects.filter(p=>!['converted','not_continuing','archived','lost'].includes(String(p.status||'')));}
function overdueProspects(){const now=Date.now();return activeProspects().filter(p=>p.next_action_at&&new Date(p.next_action_at).getTime()<now);}
function equipmentAlerts(){return state.equipment.filter(x=>x.needs_reorder||Number(x.available_quantity||0)<0);}
function sponsorRenewals(){return state.sponsors.filter(s=>['due','soon','overdue','attention'].includes(String(s.renewal_state||'').toLowerCase()));}
function kpi(label,value,sub='',className=''){return `<article class="tos-kpi ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;}

function renderKpis(){
  const cards=[];
  if(can('jugadores'))cards.push(kpi('Plantilla',state.players.length,'Tanners activos'));
  if(state.collection){
    cards.push(kpi('Cobranza',`${Number(state.collection.collection_rate||0)}%`,`${state.collection.covered||0}/${state.collection.collection_population||0} cubiertos`,Number(state.collection.collection_rate||0)>=85?'good':''));
    cards.push(kpi('Cartera total',money.format(Number(state.collection.total_receivable||0)),`${money.format(Number(state.collection.current_period_receivable||0))} del mes`,Number(state.collection.total_receivable||0)>0?'danger':''));
  }
  if(can('prospectos')||can('scouting'))cards.push(kpi('Captación',activeProspects().length,`${state.prospects.filter(p=>p.status==='new').length} nuevos`));
  if(can('asistencia'))cards.push(kpi('Sesiones',state.attendance.length,'Próximos 7 días'));
  if(can('patrocinadores'))cards.push(kpi('Patrocinadores',state.sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${sponsorRenewals().length} por revisar`));
  if(can('utileria'))cards.push(kpi('Utilería',state.equipment.reduce((a,x)=>a+Number(x.available_quantity||0),0),`${equipmentAlerts().length} alertas`));
  $('homeKpis').innerHTML=cards.length?cards.slice(0,4).join(''):kpi('TannerOS','Listo','Usa los accesos para trabajar');
}

function renderQuickActions(){
  const visible=moduleLinks.filter(item=>canAny(item.codes,item.write===true));
  const prioritized=visible.sort((a,b)=>(b.primary?1:0)-(a.primary?1:0));
  if($('quickActions'))$('quickActions').innerHTML=prioritized.slice(0,8).map((x,i)=>`<a class="tos-quick-action ${(x.primary||i===0)?'primary':''}" href="${x.href}">${esc(x.label)}</a>`).join('')||'<div class="tos-empty">No hay acciones disponibles para tu rol.</div>';
  const cashVisible=can('taquilla',true)||can('cobranza',true)||can('contabilidad',true);
  if($('cashPanel'))$('cashPanel').classList.toggle('hidden',!cashVisible);
  if($('cashActions'))$('cashActions').innerHTML=`${(can('taquilla',true)||can('cobranza',true))?'<a class="tos-action-big collect" href="/taquilla/?action=cobrar">COBRAR</a>':''}${can('contabilidad',true)?'<a class="tos-action-big pay" href="/taquilla/">CAJA</a>':''}`;
}

function alertCard(tag,title,value,detail,type='',href=''){
  const inner=`<span class="tos-alert-tag">${esc(tag)}</span><b>${esc(title)}${value?`<br>${esc(value)}`:''}</b><small>${esc(detail)}</small>`;
  return href?`<a class="tos-alert ${type}" href="${href}">${inner}</a>`:`<article class="tos-alert ${type}">${inner}</article>`;
}
function renderAttention(){
  const alerts=[];
  if(state.collection&&Number(state.collection.total_receivable||0)>0)alerts.push(alertCard('Atención','Cartera por cobrar',money.format(Number(state.collection.total_receivable||0)),`${state.collection.pending_players||0} Tanners pendientes`,'danger','/finanzas/#cobranza'));
  if(state.collection&&Number(state.collection.needs_configuration||0)>0)alerts.push(alertCard('Atención','Cuotas por configurar',String(state.collection.needs_configuration),'Requieren definición antes de cobrar.','','/finanzas/'));
  const overdue=overdueProspects();if(overdue.length)alerts.push(alertCard('Atención','Seguimientos vencidos',String(overdue.length),'Captación requiere acción.','danger','/prospectos/'));
  const news=state.prospects.filter(p=>p.status==='new');if(news.length)alerts.push(alertCard('Oportunidad','Prospectos nuevos',String(news.length),'Nuevos registros esperando seguimiento.','opportunity','/prospectos/'));
  const eq=equipmentAlerts();if(eq.length)alerts.push(alertCard('Atención','Utilería con alerta',String(eq.length),'Revisa faltantes o mínimos.','','/utileria/'));
  const renew=sponsorRenewals();if(renew.length)alerts.push(alertCard('Oportunidad','Patrocinios por revisar',String(renew.length),'Hay acuerdos próximos a requerir acción.','opportunity','/patrocinadores/'));
  if(!alerts.length)alerts.push(alertCard('Bien','Todo en orden','','No hay alertas visibles para tus módulos.','good'));
  $('attentionList').innerHTML=alerts.slice(0,6).join('');
  setShellHealth(alerts.some(a=>a.includes('Atención'))?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
}

function fmtDateTime(v){if(!v)return 'Sin fecha';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d);}
function renderAgenda(){
  const rows=[...state.calendar].sort((a,b)=>new Date(a.startsAt||a.starts_at)-new Date(b.startsAt||b.starts_at)).slice(0,6);
  $('calendarLink')?.classList.toggle('hidden',!can('calendario'));
  if($('calendarLink'))$('calendarLink').href='/calendario/';
  $('agendaList').innerHTML=rows.length?rows.map(x=>`<a class="tos-list-row" href="/calendario/"><div><strong>${esc(x.title||'Actividad')}</strong><span>${esc(fmtDateTime(x.startsAt||x.starts_at))}${x.location?` · ${esc(x.location)}`:''}</span></div><b>›</b></a>`).join(''):'<div class="tos-empty">Sin eventos en los próximos 7 días.</div>';
}
function mini(label,value){return `<div class="tos-mini-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;}
function renderRoleFocus(){
  const profile=roleProfiles[ctx.role]||roleProfiles['Presidencia'];$('roleFocusTitle').textContent=profile.focus;
  let html='',href='';
  if(state.collection){html=`<div class="tos-mini-stats">${mini('Cobranza',`${state.collection.collection_rate||0}%`)}${mini('Pendientes',state.collection.pending_players||0)}${mini('Cartera',money.format(Number(state.collection.total_receivable||0)))}</div>`;href='/finanzas/';}
  else if(can('prospectos')){html=`<div class="tos-mini-stats">${mini('En seguimiento',activeProspects().length)}${mini('Nuevos',state.prospects.filter(p=>p.status==='new').length)}${mini('Jugadores',state.players.length)}</div>`;href='/prospectos/';}
  else{html=`<div class="tos-mini-stats">${mini('Módulos',navigation.filter(n=>n.enabled&&n.can_read).length)}${mini('Jugadores',state.players.length)}${mini('Sesiones',state.attendance.length)}</div>`;}
  $('roleFocusBody').innerHTML=html;const link=$('roleFocusLink');if(link){link.classList.toggle('hidden',!href);if(href)link.href=href;}
}
function daysToBirthday(date){if(!date)return 999;const birth=new Date(`${String(date).slice(0,10)}T12:00:00`),now=new Date();let next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate(),12);if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate(),0))next.setFullYear(next.getFullYear()+1);return Math.ceil((next-now)/86400000);}
function renderBirthdays(){
  const rows=state.players.map(p=>({...p,days:daysToBirthday(p.birth_date)})).filter(p=>p.days>=0&&p.days<=31).sort((a,b)=>a.days-b.days).slice(0,8);
  $('birthdayPanel')?.classList.toggle('hidden',!rows.length);
  if($('birthdayList'))$('birthdayList').innerHTML=rows.map(p=>`<a class="tos-list-row" href="/jugadores/"><div><strong>${esc([p.first_name,p.last_name].filter(Boolean).join(' '))}</strong><span>${p.days===0?'Hoy':p.days===1?'Mañana':`En ${p.days} días`} · ${esc(p.category||'Sin categoría')}</span></div><span>🎂</span></a>`).join('');
}
function renderSearch(){
  const items=[];
  state.players.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||'Sin categoría'}`,href:'/jugadores/'}));
  state.prospects.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Prospecto · ${p.phone||p.category_interest||''}`,href:'/prospectos/'}));
  setShellSearchItems(items);
}
function renderHome(){
  const profile=roleProfiles[ctx.role]||roleProfiles['Presidencia'];
  $('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;$('welcomeSubtitle').textContent=profile.subtitle;
  renderKpis();renderQuickActions();renderAttention();renderAgenda();renderRoleFocus();renderBirthdays();renderSearch();
}

$('signInTab')?.addEventListener('click',()=>switchAuthMode('signin'));
$('signUpTab')?.addEventListener('click',()=>switchAuthMode('signup'));
$('authForm')?.addEventListener('submit',handleAuthSubmit);
$('resendConfirmation')?.addEventListener('click',resendConfirmation);
$('refreshAccess')?.addEventListener('click',loadAuthenticatedApp);
$('pendingSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});

const {data:{session}}=await supabase.auth.getSession();
if(session)loadAuthenticatedApp().catch(e=>{console.error(e);showView('authView');setMessage(friendlyError(e));});
else showView('authView');
