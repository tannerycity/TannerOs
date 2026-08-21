import {supabase,rpc,money,$,renderShell,moduleAccess,setShellSearchItems,setShellHealth} from '/v2/shell.js';

const views=['authView','pendingView','appView'];
let authMode='signin';
let ctx=null;
let navigation=[];
let booting=false;
let homeGeneration=0;
const state={players:[],prospects:[],calendar:[],attendance:[],sponsors:[],equipment:[],orders:[],scouting:[],collection:null,actionCenter:null};

const roleProfiles={
  Presidencia:{subtitle:'Control del club · una sola operación, datos vivos',focus:'Inteligencia del club'},
  Operaciones:{subtitle:'La operación de hoy, en un solo lugar',focus:'Operación del día'},
  Formadores:{subtitle:'Entrenamientos, jugadores y seguimiento',focus:'Pulso deportivo'},
  Academia:{subtitle:'Academias, asistencia y calendario',focus:'Academia hoy'},
  Contabilidad:{subtitle:'Cobranza, pagos y caja del club',focus:'Pulso financiero'},
  Taquilla:{subtitle:'Cobros, pedidos y atención a familias',focus:'Caja y atención'},
  'La Quinta Fuerza':{subtitle:'Marcas, acuerdos y activaciones',focus:'Ruta de marcas'},
  Scouting:{subtitle:'El próximo Tanner está ahí afuera',focus:'Talento en el radar'},
  Tanner:{subtitle:'Tu club, tu agenda y tu camino Tanner',focus:'Tu semana'}
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
  {codes:['callups'],label:'Convocatoria',href:'/convocatoria/'},
  {codes:['utileria'],label:'Utilería',href:'/utileria/'},
  {codes:['patrocinadores'],label:'Patrocinadores',href:'/patrocinadores/'},
  {codes:['contabilidad'],label:'Contabilidad',href:'/contabilidad/'},
  {codes:['usuarios'],label:'Usuarios',href:'/usuarios/'},
  {codes:['admin'],label:'Administración',href:'/admin/'},
  {codes:['qa'],label:'QA',href:'/qa/'}
];

const actionRoutes={
  billing_overdue:'/finanzas/#cobranza',billing_review:'/finanzas/',players_review:'/jugadores/',prospects_unplanned:'/prospectos/',
  sponsors_followup_overdue:'/patrocinadores/',orders_payment_pending:'/pedidos/',legacy_cutover:'/admin/'
};
const actionModules={billing:['cobranza','finanzas','contabilidad'],players:['jugadores'],prospects:['prospectos'],sponsors:['patrocinadores'],commerce:['tienda'],admin:['admin']};
const priorityLabels={critical:'Urgente',attention:'Atención',info:'Seguimiento'};
const safePriorities=new Set(['critical','attention','info']);

function showView(id){views.forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function setMessage(text='',type='error'){const box=$('authMessage');if(!box)return;box.textContent=text;box.dataset.type=type;box.classList.toggle('hidden',!text);}
function showResend(show=true){$('resendConfirmation')?.classList.toggle('hidden',!show);}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function friendlyError(error){
  const raw=String(error?.message||error||'Ocurrió un error.');
  if(/invalid login credentials/i.test(raw))return 'Correo o contraseña incorrectos.';
  if(/email not confirmed/i.test(raw))return 'Confirma tu correo antes de entrar.';
  if(/user already registered/i.test(raw))return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if(/rate limit/i.test(raw))return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
  if(/not authorized|permission denied/i.test(raw))return 'Tu usuario no tiene permiso para esta sección.';
  return raw;
}
function switchAuthMode(mode){
  authMode=mode;const signup=mode==='signup';
  $('signInTab')?.classList.toggle('active',!signup);$('signUpTab')?.classList.toggle('active',signup);
  $('nameField')?.classList.toggle('hidden',!signup);if($('authSubmit'))$('authSubmit').textContent=signup?'Crear cuenta':'Entrar';
  $('password')?.setAttribute('autocomplete',signup?'new-password':'current-password');setMessage();showResend(false);
}
function installAuthExtras(){
  const form=$('authForm');if(!form||document.getElementById('forgotPassword'))return;
  const button=document.createElement('button');button.id='forgotPassword';button.type='button';button.className='auth-link-button';button.textContent='Olvidé mi contraseña';
  form.after(button);
  button.addEventListener('click',async()=>{
    const email=$('email')?.value.trim();if(!email){setMessage('Escribe primero tu correo.');$('email')?.focus();return;}
    button.disabled=true;
    try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/?recovery=1`});if(error)throw error;setMessage('Te enviamos un correo para cambiar tu contraseña.','success');}
    catch(e){setMessage(friendlyError(e));}finally{button.disabled=false;}
  });
}
async function renderRecovery(){
  const card=document.querySelector('.auth-card');if(!card)return;
  showView('authView');
  card.innerHTML='<div class="preview-pill">Recuperar acceso</div><h2>Nueva contraseña</h2><p class="muted">Elige una contraseña nueva para volver al vestidor.</p><form id="recoveryForm"><label>Nueva contraseña<input id="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar contraseña<input id="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><button id="savePassword" class="primary" type="submit">Guardar contraseña</button></form><div id="authMessage" class="message hidden"></div>';
  $('recoveryForm')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const a=$('newPassword').value,b=$('confirmPassword').value;if(a!==b){setMessage('Las contraseñas no coinciden.');return;}
    const btn=$('savePassword');btn.disabled=true;
    try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('El enlace de recuperación venció. Solicita uno nuevo.');const {error}=await supabase.auth.updateUser({password:a});if(error)throw error;setMessage('Contraseña actualizada. Entrando…','success');setTimeout(()=>location.replace('/'),700);}
    catch(e){setMessage(friendlyError(e));btn.disabled=false;}
  });
}
async function handleAuthSubmit(ev){
  ev.preventDefault();setMessage();showResend(false);
  const email=$('email')?.value.trim(),password=$('password')?.value,displayName=$('displayName')?.value.trim();if(!email||!password)return;
  const btn=$('authSubmit');btn.disabled=true;
  try{
    if(authMode==='signup'){
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||email.split('@')[0]},emailRedirectTo:`${location.origin}/`}});if(error)throw error;
      if(!data.session){setMessage('Cuenta creada. Revisa tu correo y confirma el acceso.','success');showResend(true);return;}
    }else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
    await loadAuthenticatedApp();
  }catch(e){const msg=friendlyError(e);setMessage(msg);if(/confirma tu correo/i.test(msg))showResend(true);}
  finally{btn.disabled=false;btn.textContent=authMode==='signup'?'Crear cuenta':'Entrar';}
}
async function resendConfirmation(){
  const email=$('email')?.value.trim();if(!email){setMessage('Escribe primero el correo.');return;}
  const btn=$('resendConfirmation');btn.disabled=true;
  try{const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${location.origin}/`}});if(error)throw error;setMessage(`Listo. Enviamos un nuevo correo a ${email}.`,'success');}
  catch(e){setMessage(friendlyError(e));}finally{btn.disabled=false;}
}

function monthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
function isoDaysFromNow(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString();}
function can(code,write=false){return moduleAccess(navigation,code,write);}
function canAny(codes,write=false){return codes.some(code=>can(code,write));}
function firstName(){return String(ctx?.display_name||'Tanner').trim().split(/\s+/)[0];}
async function rpcSafe(name,params,fallback,timeoutMs=7000){let timer;try{return await Promise.race([rpc(name,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} timeout`)),timeoutMs);})]);}catch(error){console.warn('home rpc',name,error);return fallback;}finally{if(timer)clearTimeout(timer);}}

function clearHomeState(){state.players=[];state.prospects=[];state.calendar=[];state.attendance=[];state.sponsors=[];state.equipment=[];state.orders=[];state.scouting=[];state.collection=null;state.actionCenter=null;}
function renderImmediateHome(){
  const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia;
  if($('welcomeTitle'))$('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;
  if($('welcomeSubtitle'))$('welcomeSubtitle').textContent=profile.subtitle;
  renderQuickActions();
  if($('homeKpis'))$('homeKpis').innerHTML='<article class="tos-kpi"><span>Conexión</span><strong>Lista</strong><small>Cargando indicadores del club…</small></article>';
  if($('attentionList'))$('attentionList').innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">TannerOS</span><b>Conectando operación</b><small>Los indicadores se actualizan sin bloquear tu trabajo.</small></article>';
  if($('agendaList'))$('agendaList').innerHTML='<div class="tos-empty">Cargando agenda…</div>';
  if($('roleFocusBody'))$('roleFocusBody').innerHTML='<div class="tos-empty">Preparando inteligencia del club…</div>';
  setShellHealth({state:'ok',label:'Conectando datos'});
}

async function loadAuthenticatedApp(){
  if(booting)return;booting=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();if(!user){showView('authView');document.body.classList.remove('tos-body');installAuthExtras();return;}
    const rows=await rpc('v2_my_context');
    if(!rows?.length){if($('pendingText'))$('pendingText').textContent=`La cuenta ${user.email||'actual'} ya existe. Falta vincularla a Tannery City.`;showView('pendingView');return;}
    ctx=rows[0];navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});clearHomeState();
    showView('appView');document.body.classList.add('tos-body');renderShell({ctx,navigation,active:'inicio',title:'Inicio'});renderImmediateHome();
    const generation=++homeGeneration;loadHomeData(generation).catch(error=>{console.error('home data',error);setShellHealth({state:'attention',label:'Datos parciales'});});
  }finally{booting=false;}
}
async function loadHomeData(generation){
  const org=ctx.organization_id,now=new Date().toISOString(),week=isoDaysFromNow(7),jobs=[];
  jobs.push(rpcSafe('v2_action_center',{organization_id:org},{items:[],summary:{}}).then(v=>state.actionCenter=v&&typeof v==='object'?v:{items:[],summary:{}}));
  if(can('jugadores'))jobs.push(rpcSafe('v2_players',{organization_id:org,status_filter:'active'},[]).then(v=>state.players=Array.isArray(v)?v:[]));
  if(can('prospectos')||can('scouting'))jobs.push(rpcSafe('v2_prospects',{organization_id:org,status_filter:null},[]).then(v=>state.prospects=Array.isArray(v)?v:[]));
  if(can('cobranza')||can('contabilidad')||can('finanzas'))jobs.push(rpcSafe('v2_collection_snapshot',{organization_id:org,billing_period:monthStart()},null).then(v=>state.collection=v&&typeof v==='object'?v:null));
  if(can('calendario'))jobs.push(rpcSafe('v2_calendar',{organization_id:org,from_at:now,to_at:week},[]).then(v=>state.calendar=Array.isArray(v)?v:[]));
  if(can('asistencia'))jobs.push(rpcSafe('v2_attendance_sessions',{organization_id:org,from_at:now,to_at:week},[]).then(v=>state.attendance=Array.isArray(v)?v:[]));
  if(can('patrocinadores'))jobs.push(rpcSafe('v2_sponsors',{organization_id:org},[]).then(v=>state.sponsors=Array.isArray(v)?v:[]));
  if(can('utileria'))jobs.push(rpcSafe('v2_equipment_items',{organization_id:org},[]).then(v=>state.equipment=Array.isArray(v)?v:[]));
  if(can('tienda'))jobs.push(rpcSafe('v2_orders',{organization_id:org,status_filter:null},[]).then(v=>state.orders=Array.isArray(v)?v:[]));
  if(can('scouting'))jobs.push(rpcSafe('v2_scouting_reports',{organization_id:org,prospect_id:null},[]).then(v=>state.scouting=Array.isArray(v)?v:[]));
  await Promise.allSettled(jobs);if(generation===homeGeneration)renderHome();
}

function activeProspects(){return state.prospects.filter(p=>!['converted','not_continuing','archived','lost'].includes(String(p.status||'')));}
function kpi(label,value,sub='',className=''){return `<article class="tos-kpi ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;}
function renderKpis(){
  const cards=[];
  if(can('jugadores'))cards.push(kpi('Plantilla',state.players.length,'Tanners activos'));
  if(state.collection){cards.push(kpi('Cobranza',`${Number(state.collection.collection_rate||0)}%`,`${state.collection.covered||0}/${state.collection.collection_population||0} cubiertos`,Number(state.collection.collection_rate||0)>=85?'good':''));cards.push(kpi('Cartera',money.format(Number(state.collection.total_receivable||0)),`${money.format(Number(state.collection.current_period_receivable||0))} del mes`,Number(state.collection.total_receivable||0)>0?'danger':''));}
  if(can('prospectos')||can('scouting'))cards.push(kpi('Captación',activeProspects().length,`${state.prospects.filter(p=>p.status==='new').length} nuevos`));
  if(cards.length<4&&can('asistencia'))cards.push(kpi('Sesiones',state.attendance.length,'Próximos 7 días'));
  if(cards.length<4&&can('tienda'))cards.push(kpi('Pedidos',state.orders.length,'Pedidos registrados'));
  if($('homeKpis'))$('homeKpis').innerHTML=cards.length?cards.slice(0,4).join(''):kpi('TannerOS','Listo','Usa los accesos para trabajar');
}
function renderQuickActions(){
  const visible=moduleLinks.filter(item=>canAny(item.codes,item.write===true)).sort((a,b)=>(b.primary?1:0)-(a.primary?1:0));
  if($('quickActions'))$('quickActions').innerHTML=visible.slice(0,9).map((x,i)=>`<a class="tos-quick-action ${(x.primary||i===0)?'primary':''}" href="${x.href}">${esc(x.label)}</a>`).join('')||'<div class="tos-empty">No hay acciones disponibles para tu rol.</div>';
  const cashVisible=can('taquilla',true)||can('cobranza',true)||can('contabilidad',true);$('cashPanel')?.classList.toggle('hidden',!cashVisible);
  if($('cashActions'))$('cashActions').innerHTML=`${(can('taquilla',true)||can('cobranza',true))?'<a class="tos-action-big collect" href="/taquilla/?action=cobrar">COBRAR</a>':''}${can('contabilidad',true)?'<a class="tos-action-big pay" href="/taquilla/">CAJA</a>':''}`;
}
function actionAllowed(item){if(item?.code==='legacy_cutover')return false;const codes=actionModules[item?.module]||[];return !codes.length||codes.some(code=>can(code));}
function actionHref(item){return actionRoutes[item?.code]||'/';}
function renderAttention(){
  const list=$('attentionList');if(!list)return;
  const items=(Array.isArray(state.actionCenter?.items)?state.actionCenter.items:[]).filter(actionAllowed);
  if(!items.length){list.innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">Bien</span><b>Todo en orden</b><small>No hay pendientes visibles para tus módulos.</small></article>';setShellHealth({state:'ok',label:'Todo en orden'});return;}
  list.innerHTML=items.slice(0,7).map(item=>{const p=safePriorities.has(item.priority)?item.priority:'info';return `<a class="tos-action-alert ${p}" href="${actionHref(item)}"><span class="tos-alert-tag">${priorityLabels[p]}</span><div><b>${esc(item.title||'Pendiente')}${Number(item.count||0)>0?` <em>${Number(item.count)}</em>`:''}</b><small>${esc(item.detail||'Abrir para revisar')}</small></div><span class="tos-action-arrow">›</span></a>`;}).join('');
  const critical=items.filter(x=>x.priority==='critical').length,attention=items.filter(x=>x.priority==='attention').length;
  setShellHealth(critical?{state:'danger',label:`${critical} urgente${critical===1?'':'s'}`}:attention?{state:'attention',label:`${attention} por atender`}:{state:'ok',label:'Todo en orden'});
}
function fmtDateTime(value){if(!value)return 'Sin fecha';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d);}
function renderAgenda(){
  const rows=[...state.calendar].sort((a,b)=>new Date(a.startsAt||a.starts_at)-new Date(b.startsAt||b.starts_at)).slice(0,6);
  $('calendarLink')?.classList.toggle('hidden',!can('calendario'));if($('calendarLink'))$('calendarLink').href='/calendario/';
  if($('agendaList'))$('agendaList').innerHTML=rows.length?rows.map(x=>`<a class="tos-list-row" href="/calendario/"><div><strong>${esc(x.title||'Actividad')}</strong><span>${esc(fmtDateTime(x.startsAt||x.starts_at))}${x.location?` · ${esc(x.location)}`:''}</span></div><b>›</b></a>`).join(''):'<div class="tos-empty">Sin eventos en los próximos 7 días.</div>';
}
function mini(label,value){return `<div class="tos-mini-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;}
function actionCount(code){const item=(state.actionCenter?.items||[]).find(x=>x.code===code);return Number(item?.count||0);}
function topSource(){const counts=new Map();for(const p of state.prospects){const source=String(p.source_channel||p.source||'').trim();if(source)counts.set(source,(counts.get(source)||0)+1);}return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]||null;}
function renderRoleFocus(){
  const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia;if($('roleFocusTitle'))$('roleFocusTitle').textContent=profile.focus;
  const monthly=Number(state.collection?.current_period_receivable||0),unplanned=actionCount('prospects_unplanned'),pendingOrders=actionCount('orders_payment_pending'),source=topSource();
  const insights=[];if(monthly>0)insights.push(`Hay ${money.format(monthly)} pendientes del mes.`);if(unplanned>0)insights.push(`${unplanned} prospecto${unplanned===1?'':'s'} nuevo${unplanned===1?'':'s'} aún no tiene${unplanned===1?'':'n'} próxima acción.`);if(pendingOrders>0)insights.push(`${pendingOrders} pedido${pendingOrders===1?'':'s'} sigue${pendingOrders===1?'':'n'} pendiente${pendingOrders===1?'':'s'} de pago.`);if(source)insights.push(`La fuente con más registros es ${source[0]} (${source[1]}).`);
  const stats=[];if(state.collection)stats.push(mini('Cobranza',`${state.collection.collection_rate||0}%`),mini('Pendientes',state.collection.pending_players||0),mini('Cartera',money.format(Number(state.collection.total_receivable||0))));else stats.push(mini('Jugadores',state.players.length),mini('Prospectos',activeProspects().length),mini('Visorías',state.scouting.length));
  if($('roleFocusBody'))$('roleFocusBody').innerHTML=`<div class="tos-mini-stats">${stats.join('')}</div><p class="tos-insight-copy">${esc(insights.join(' ')||'Sin alertas relevantes en los datos cargados.')}</p>`;
  const link=$('roleFocusLink');const href=monthly?'/finanzas/':unplanned?'/prospectos/':pendingOrders?'/pedidos/':'';if(link){link.classList.toggle('hidden',!href);if(href)link.href=href;}
}
function daysToBirthday(date){if(!date)return 999;const birth=new Date(`${String(date).slice(0,10)}T12:00:00`),now=new Date();let next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate(),12);if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate(),0))next.setFullYear(next.getFullYear()+1);return Math.ceil((next-now)/86400000);}
function renderBirthdays(){const rows=state.players.map(p=>({...p,days:daysToBirthday(p.birth_date)})).filter(p=>p.days>=0&&p.days<=31).sort((a,b)=>a.days-b.days).slice(0,8);$('birthdayPanel')?.classList.toggle('hidden',!rows.length);if($('birthdayList'))$('birthdayList').innerHTML=rows.map(p=>`<a class="tos-list-row" href="/jugadores/"><div><strong>${esc([p.first_name,p.last_name].filter(Boolean).join(' '))}</strong><span>${p.days===0?'Hoy':p.days===1?'Mañana':`En ${p.days} días`} · ${esc(p.category||'Sin categoría')}</span></div><span>🎂</span></a>`).join('');}
function renderSearch(){const items=[];state.players.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||'Sin categoría'}`,href:'/jugadores/'}));state.prospects.forEach(p=>items.push({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Prospecto · ${p.phone||p.category_interest||''}`,href:'/prospectos/'}));setShellSearchItems(items);}
function renderHome(){const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia;if($('welcomeTitle'))$('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;if($('welcomeSubtitle'))$('welcomeSubtitle').textContent=profile.subtitle;renderKpis();renderQuickActions();renderAttention();renderAgenda();renderRoleFocus();renderBirthdays();renderSearch();}

function wireAuth(){$('signInTab')?.addEventListener('click',()=>switchAuthMode('signin'));$('signUpTab')?.addEventListener('click',()=>switchAuthMode('signup'));$('authForm')?.addEventListener('submit',handleAuthSubmit);$('resendConfirmation')?.addEventListener('click',resendConfirmation);$('refreshAccess')?.addEventListener('click',loadAuthenticatedApp);$('pendingSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});installAuthExtras();}

const recovery=new URLSearchParams(location.search).get('recovery')==='1'||/type=recovery/i.test(location.hash);
if(recovery){await renderRecovery();}
else{wireAuth();const {data:{session}}=await supabase.auth.getSession();if(session)await loadAuthenticatedApp().catch(e=>{console.error(e);showView('authView');setMessage(friendlyError(e));});else showView('authView');supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){ctx=null;navigation=[];homeGeneration++;showView('authView');document.body.classList.remove('tos-body');}else if(event==='SIGNED_IN'&&!ctx){setTimeout(()=>loadAuthenticatedApp().catch(console.error),0);}});}
