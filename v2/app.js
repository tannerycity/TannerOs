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
  $('nameField')?.classList.toggle('hidden',!up);$('authSubmit').textContent=up?'Crear cuenta':'Entrar';
  $('password')?.setAttribute('autocomplete',up?'new-password':'current-password');setMessage();showResend(false);
}
async function handleAuthSubmit(ev){
  ev.preventDefault();setMessage();showResend(false);
  const email=$('email').value.trim(),password=$('password').value,displayName=$('displayName')?.value.trim();
  const btn=$('authSubmit');btn.disabled=true;
  try{
    if(authMode==='signup'){
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||email.split('@')[0]},emailRedirectTo:`${location.origin}/v2/`}});
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
    const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${location.origin}/v2/`}});
    if(error)throw error;setMessage(`Listo. Enviamos un nuevo correo a ${email}.`,'success');
  }catch(e){setMessage(friendlyError(e));}finally{btn.disabled=false;}
}
function monthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
function isoDaysFromNow(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString();}
function safe(promise,fallback=null){return promise.catch(err=>{console.warn('home widget',err);return fallback;});}
function can(code,write=false){return moduleAccess(navigation,code,write);}

async function loadAuthenticatedApp(){
  const {data:userData}=await supabase.auth.getUser();
  if(!userData?.user){showView('authView');return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){
    $('pendingText').textContent=`La cuenta ${userData.user.email||'actual'} ya existe. Falta vincularla a Tannery City.`;
    showView('pendingView');return;
  }
  ctx=rows[0];
  navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});
  showView('appView');document.body.classList.add('tos-body');
  renderShell({ctx,navigation,active:'inicio',title:'Inicio'});
  await loadHome();
}

async function loadHome(){
  const org=ctx.organization_id,now=new Date().toISOString(),week=isoDaysFromNow(7);
  const calls=[];
  if(can('jugadores'))calls.push(safe(rpc('v2_players',{organization_id:org,status_filter:'active'}),[]).then(v=>state.players=v||[]));
  if(can('prospectos')||can('scouting'))calls.push(safe(rpc('v2_prospects',{organization_id:org,status_filter:null}),[]).then(v=>state.prospects=v||[]));
  if(can('cobranza')||can('contabilidad'))calls.push(safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:monthStart()}),null).then(v=>state.collection=v));
  if(can('calendario'))calls.push(safe(rpc('v2_calendar',{organization_id:org,from_at:now,to_at:week}),[]).then(v=>state.calendar=Array.isArray(v)?v:[]));
  if(can('asistencia'))calls.push(safe(rpc('v2_attendance_sessions',{organization_id:org,from_at:now,to_at:week}),[]).then(v=>state.attendance=v||[]));
  if(can('patrocinadores'))calls.push(safe(rpc('v2_sponsors',{organization_id:org}),[]).then(v=>state.sponsors=v||[]));
  if(can('utileria'))calls.push(safe(rpc('v2_equipment_items',{organization_id:org}),[]).then(v=>state.equipment=v||[]));
  await Promise.all(calls);
  renderHome();
}

function firstName(){return String(ctx.display_name||'Tanner').trim().split(/\s+/)[0];}
function activeProspects(){return state.prospects.filter(p=>!['converted','not_continuing','archived'].includes(p.status));}
function overdueProspects(){const now=Date.now();return activeProspects().filter(p=>p.next_action_at&&new Date(p.next_action_at).getTime()<now);}
function upcomingTrialCount(){return activeProspects().filter(p=>p.status==='trial_scheduled').length;}
function equipmentAlerts(){return state.equipment.filter(x=>x.needs_reorder||Number(x.available_quantity||0)<0);}
function sponsorRenewals(){return state.sponsors.filter(s=>['due','soon','overdue','attention'].includes(String(s.renewal_state||'').toLowerCase()));}

function kpi(label,value,sub='',className=''){
  return `<article class="tos-kpi ${className}"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</article>`;
}
function renderKpis(){
  const candidates=[];
  if(can('jugadores'))candidates.push({key:'players',html:kpi('Plantilla',state.players.length,'Tanners activos')});
  if(can('prospectos')||can('scouting'))candidates.push({key:'talent',html:kpi('Talento',activeProspects().length,`${state.prospects.filter(p=>p.status==='new').length} nuevos`)});
  if(state.collection){
    candidates.push({key:'collection',html:kpi('Cobranza',`${Number(state.collection.collection_rate||0)}%`,`${state.collection.covered||0}/${state.collection.collection_population||0} cubiertos`,Number(state.collection.collection_rate||0)>=85?'good':'')});
    candidates.push({key:'debt',html:kpi('Cartera total',money.format(Number(state.collection.total_receivable||0)),`${money.format(Number(state.collection.current_period_receivable||0))} del periodo`,Number(state.collection.total_receivable||0)>0?'danger':'')});
  }
  if(can('asistencia'))candidates.push({key:'sessions',html:kpi('Sesiones esta semana',state.attendance.length,'Entrenamientos / sesiones')});
  if(can('patrocinadores'))candidates.push({key:'sponsors',html:kpi('Marcas activas',state.sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${sponsorRenewals().length} por atender`)});
  if(can('utileria'))candidates.push({key:'stock',html:kpi('Utilería',state.equipment.reduce((a,x)=>a+Number(x.available_quantity||0),0),`${equipmentAlerts().length} alertas de stock`)});

  const priorities={
    'Presidencia':['players','talent','collection','debt'],
    'Contabilidad':['collection','debt','players','sessions'],
    'Taquilla':['collection','debt','talent','players'],
    'Scouting':['talent','players','sessions','sponsors'],
    'Formadores':['players','sessions','talent','stock'],
    'Academia':['players','sessions','collection','talent'],
    'Operaciones':['players','talent','sessions','stock'],
    'La Quinta Fuerza':['sponsors','talent','collection','debt'],
    'Tanner':['sessions','players','talent','collection']
  };
  const order=priorities[ctx.role]||priorities['Presidencia'];
  const sorted=[...candidates].sort((a,b)=>{
    const ai=order.indexOf(a.key),bi=order.indexOf(b.key);
    return (ai<0?99:ai)-(bi<0?99:bi);
  }).slice(0,4);
  $('homeKpis').innerHTML=sorted.map(x=>x.html).join('');
  if(!sorted.length)$('homeKpis').innerHTML=kpi('Acceso','Listo','Usa el menú para entrar a tus módulos');
}

const quickDefs=[
  {code:'jugadores',write:true,label:'Nuevo jugador',href:'/v2/jugadores/'},
  {code:'asistencia',write:true,label:'Asistencia',href:'/v2/asistencia/'},
  {code:'callups',write:true,label:'Convocar',href:'/v2/convocatoria/'},
  {code:'prospectos',write:true,label:'Captación',href:'/v2/prospectos/'},
  {code:'scouting',write:true,label:'Scouting',href:'/v2/scouting/'},
  {code:'academias',write:true,label:'Academias',href:'/v2/academias/'},
  {code:'tienda',write:true,label:'Pedidos',href:'/v2/pedidos/'},
  {code:'utileria',write:true,label:'Utilería',href:'/v2/utileria/'}
];
function renderQuickActions(){
  const rows=quickDefs.filter(x=>can(x.code,x.write)).slice(0,5);
  $('quickActions').innerHTML=rows.length?rows.map((x,i)=>`<a class="tos-quick-action ${i===0?'primary':''}" href="${x.href}">${x.label}</a>`).join(''):'<div class="tos-empty">Tu rol no tiene acciones de captura en Inicio.</div>';
  const collect=can('cobranza',true),pay=can('contabilidad',true);
  $('cashPanel').classList.toggle('hidden',!(collect||pay));
  $('cashActions').innerHTML=`${collect?'<a class="tos-action-big collect" href="/v2/finanzas/">COBRAR</a>':''}${pay?'<a class="tos-action-big pay" href="/v2/finanzas/">PAGAR</a>':''}`;
}

function alertCard(tag,title,value,detail,type=''){
  return `<article class="tos-alert ${type}"><span class="tos-alert-tag">${tag}</span><b>${value?`${title}<br>${value}`:title}</b><small>${detail}</small></article>`;
}
function renderAttention(){
  const alerts=[];
  if(state.collection&&Number(state.collection.total_receivable||0)>0){
    alerts.push(alertCard('Atención','Cartera por cobrar',money.format(Number(state.collection.total_receivable||0)),`${state.collection.pending_players||0} Tanners pendientes`,'danger'));
  }
  if(state.collection&&Number(state.collection.needs_configuration||0)>0){
    alerts.push(alertCard('Atención','Cuotas por configurar',String(state.collection.needs_configuration),`No se inventa ninguna cuota: requiere definición.`,''));
  }
  const overdue=overdueProspects();
  if(overdue.length)alerts.push(alertCard('Atención','Seguimientos vencidos',String(overdue.length),'Prospectos con próxima acción ya vencida.','danger'));
  const news=state.prospects.filter(p=>p.status==='new');
  if(news.length)alerts.push(alertCard('Oportunidad','Prospectos nuevos',String(news.length),`${activeProspects().filter(p=>p.registration_type==='goalkeeper').length} portero(s) en captación.`,'opportunity'));
  const eq=equipmentAlerts();
  if(eq.length)alerts.push(alertCard('Atención','Utilería con alerta',String(eq.length),'Revisa faltantes o mínimos de inventario.',''));
  const renew=sponsorRenewals();
  if(renew.length)alerts.push(alertCard('Oportunidad','Patrocinios por revisar',String(renew.length),'Hay acuerdos próximos a requerir acción.','opportunity'));
  if(!alerts.length)alerts.push(alertCard('Bien','Todo en orden','', 'No hay alertas disponibles para los módulos que puedes ver.','good'));
  $('attentionList').innerHTML=alerts.slice(0,6).join('');
  const hasAttention=alerts.some(a=>a.includes('Atención'));
  setShellHealth(hasAttention?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
}

function fmtDateTime(v){
  if(!v)return 'Sin fecha';
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d);
}
function renderAgenda(){
  const rows=[...state.calendar].sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)).slice(0,6);
  $('calendarLink').classList.toggle('hidden',!can('calendario'));
  $('agendaList').innerHTML=rows.length?rows.map(x=>`<div class="tos-list-row"><div><strong>${x.title||'Actividad'}</strong><span>${fmtDateTime(x.startsAt)}${x.location?` · ${x.location}`:''}</span></div><b>›</b></div>`).join(''):'<div class="tos-empty">Sin eventos visibles en los próximos 7 días.</div>';
}
function mini(label,value){return `<div class="tos-mini-stat"><strong>${value}</strong><span>${label}</span></div>`;}
function renderRoleFocus(){
  const profile=roleProfiles[ctx.role]||roleProfiles['Presidencia'];
  $('roleFocusTitle').textContent=profile.focus;
  let html='',href='';
  if(ctx.role==='Scouting'||(can('prospectos')&&!state.collection)){
    html=`<div class="tos-mini-stats">${mini('En seguimiento',activeProspects().length)}${mini('Nuevos',state.prospects.filter(p=>p.status==='new').length)}${mini('Pruebas',upcomingTrialCount())}</div>`;href='/v2/prospectos/';
  }else if(ctx.role==='La Quinta Fuerza'&&can('patrocinadores')){
    html=`<div class="tos-mini-stats">${mini('Marcas',state.sponsors.length)}${mini('Activas',state.sponsors.filter(s=>Number(s.active_agreements||0)>0).length)}${mini('Por atender',sponsorRenewals().length)}</div>`;href='/v2/patrocinadores/';
  }else if((ctx.role==='Formadores'||ctx.role==='Academia'||ctx.role==='Operaciones')&&can('asistencia')){
    html=`<div class="tos-mini-stats">${mini('Sesiones',state.attendance.length)}${mini('Plantilla',state.players.length)}${mini('Talento',activeProspects().length)}</div>`;href='/v2/asistencia/';
  }else if(state.collection){
    html=`<div class="tos-mini-stats">${mini('Cobranza',`${state.collection.collection_rate||0}%`)}${mini('Pendientes',state.collection.pending_players||0)}${mini('Cartera',money.format(Number(state.collection.total_receivable||0)))}</div>`;href='/v2/finanzas/';
  }else{
    html=`<div class="tos-mini-stats">${mini('Agenda',state.calendar.length)}${mini('Módulos',navigation.filter(n=>n.enabled&&n.can_read).length)}${mini('Rol',ctx.role||'Tanner')}</div>`;
  }
  $('roleFocusBody').innerHTML=html;
  const link=$('roleFocusLink');link.classList.toggle('hidden',!href);if(href)link.href=href;
}
function daysToBirthday(date){
  if(!date)return 999;
  const birth=new Date(`${String(date).slice(0,10)}T12:00:00`),now=new Date();
  let next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate(),12);
  if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate(),0))next.setFullYear(next.getFullYear()+1);
  return Math.ceil((next-now)/(86400000));
}
function renderBirthdays(){
  const rows=state.players.map(p=>({...p,days:daysToBirthday(p.birth_date)})).filter(p=>p.days>=0&&p.days<=31).sort((a,b)=>a.days-b.days).slice(0,8);
  $('birthdayPanel').classList.toggle('hidden',!rows.length);
  $('birthdayList').innerHTML=rows.map(p=>`<div class="tos-list-row"><div><strong>${[p.first_name,p.last_name].filter(Boolean).join(' ')}</strong><span>${p.days===0?'Hoy':p.days===1?'Mañana':`En ${p.days} días`} · ${p.category||'Sin categoría'}</span></div><span>🎂</span></div>`).join('');
}
function renderSearch(){
  const items=[];
  state.players.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||'Sin categoría'}`,href:'/v2/jugadores/'}));
  state.prospects.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Prospecto · ${p.phone||p.category_interest||''}`,href:'/v2/prospectos/'}));
  setShellSearchItems(items);
}
function renderHome(){
  const profile=roleProfiles[ctx.role]||roleProfiles['Presidencia'];
  $('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;
  $('welcomeSubtitle').textContent=profile.subtitle;
  renderKpis();renderQuickActions();renderAttention();renderAgenda();renderRoleFocus();renderBirthdays();renderSearch();
}

$('signInTab')?.addEventListener('click',()=>switchAuthMode('signin'));
$('signUpTab')?.addEventListener('click',()=>switchAuthMode('signup'));
$('authForm')?.addEventListener('submit',handleAuthSubmit);
$('resendConfirmation')?.addEventListener('click',resendConfirmation);
$('refreshAccess')?.addEventListener('click',loadAuthenticatedApp);
$('pendingSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});

const {data:{session}}=await supabase.auth.getSession();
if(session)loadAuthenticatedApp().catch(e=>{console.error(e);showView('authView');setMessage(friendlyError(e));});
else showView('authView');
