import {supabase,rpc,money,$,renderShell,moduleAccess,setShellSearchItems,setShellHealth} from '/v2/shell.js';

const views=['authView','pendingView','forcePasswordView','appView'];
const state={players:[],prospects:[],calendar:[],orders:[],executive:null,actionCenter:null};
let authMode='signin';
let ctx=null;
let navigation=[];
let bootPromise=null;
let loadGeneration=0;

const roleProfiles={
  Presidencia:{subtitle:'Control del club · una sola operación, datos vivos',focus:'Inteligencia del club'},
  Operaciones:{subtitle:'La operación de hoy, en un solo lugar',focus:'Operación del día'},
  Formadores:{subtitle:'Entrenamientos, jugadores y seguimiento',focus:'Pulso deportivo'},
  Academia:{subtitle:'Academias, asistencia y calendario',focus:'Academia hoy'},
  Contabilidad:{subtitle:'Cobranza, pagos y caja del club',focus:'Pulso financiero'},
  Taquilla:{subtitle:'Cobros, pedidos y atención a familias',focus:'Caja y atención'},
  Marketing:{subtitle:'Marcas, acuerdos y activaciones',focus:'Ruta de marcas'},
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
  {codes:['callups','convocatoria'],label:'Convocatoria',href:'/convocatoria/'},
  {codes:['utileria'],label:'Utilería',href:'/utileria/'},
  {codes:['patrocinadores'],label:'Patrocinios',href:'/patrocinadores/'},
  {codes:['contabilidad'],label:'Contabilidad',href:'/contabilidad/'},
  {codes:['usuarios'],label:'Usuarios',href:'/usuarios/'},
  {codes:['admin'],label:'Administración',href:'/admin/'},
  {codes:['qa'],label:'QA',href:'/qa/'}
];

const actionModules={
  billing:['cobranza','finanzas','contabilidad'],players:['jugadores'],prospects:['prospectos'],
  sponsors:['patrocinadores'],commerce:['tienda'],equipment:['utileria'],admin:['admin']
};
const priorityLabels={critical:'Urgente',attention:'Atención',info:'Seguimiento'};
const safePriorities=new Set(['critical','attention','info']);

function showView(id){views.forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function setMessage(text='',type='error'){
  const box=$('authMessage');if(!box)return;
  box.textContent=text;box.dataset.type=type;box.classList.toggle('hidden',!text);
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function credentialEmail(value){const credential=String(value||'').trim().toLowerCase();if(credential.includes('@'))return credential;return `${credential.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_')}@staff.tanneros.invalid`;}
function friendlyError(error){
  const raw=String(error?.message||error||'Ocurrió un error.');
  if(/invalid login credentials/i.test(raw))return 'Usuario, correo o contraseña incorrectos.';
  if(/email not confirmed/i.test(raw))return 'Confirma tu correo antes de entrar.';
  if(/user already registered/i.test(raw))return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if(/rate limit/i.test(raw))return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
  if(/not authorized|permission denied/i.test(raw))return 'Tu usuario no tiene permiso para esta sección.';
  if(/failed to fetch|network/i.test(raw))return 'No pudimos conectar con TannerOS. Revisa tu señal e intenta de nuevo.';
  return raw;
}
function can(code,write=false){return moduleAccess(navigation,code,write);}
function canAny(codes,write=false){return codes.some(code=>can(code,write));}
function firstName(){return String(ctx?.display_name||'Tanner').trim().split(/\s+/)[0];}
function isoDaysFromNow(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString();}

async function rpcSafe(name,params,fallback,timeoutMs=7500){
  let timer;
  try{
    return await Promise.race([
      rpc(name,params),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} timeout`)),timeoutMs);})
    ]);
  }catch(error){console.warn('TannerOS home RPC',name,error);return fallback;}
  finally{if(timer)clearTimeout(timer);}
}

function switchAuthMode(mode){
  authMode=mode;const signup=mode==='signup';
  $('signInTab')?.classList.toggle('active',!signup);
  $('signUpTab')?.classList.toggle('active',signup);
  $('nameField')?.classList.toggle('hidden',!signup);
  if($('authSubmit'))$('authSubmit').textContent=signup?'Crear cuenta':'Entrar';
  const credential=$('email');if(credential){credential.type=signup?'email':'text';credential.inputMode='email';credential.autocomplete=signup?'email':'username';credential.placeholder=signup?'tu@correo.com':'Ej. brandon';}
  if($('credentialLabel'))$('credentialLabel').textContent=signup?'Correo de la invitación':'Usuario o correo';
  $('password')?.setAttribute('autocomplete',signup?'new-password':'current-password');
  setMessage();$('resendConfirmation')?.classList.add('hidden');
}

function installAuthExtras(){
  const form=$('authForm');if(!form||document.getElementById('forgotPassword'))return;
  const button=document.createElement('button');
  button.id='forgotPassword';button.type='button';button.className='auth-link-button';button.textContent='Olvidé mi contraseña';
  form.after(button);
  button.addEventListener('click',async()=>{
    const credential=$('email')?.value.trim();
    if(!credential){setMessage('Escribe primero tu usuario o correo.');$('email')?.focus();return;}
    if(!credential.includes('@')){setMessage('Pide a Presidencia una contraseña temporal nueva para tu usuario.');return;}
    button.disabled=true;
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(credential.toLowerCase(),{redirectTo:`${location.origin}/?recovery=1`});
      if(error)throw error;setMessage('Te enviamos un correo para cambiar tu contraseña.','success');
    }catch(error){setMessage(friendlyError(error));}
    finally{button.disabled=false;}
  });
}

async function handleAuthSubmit(event){
  event.preventDefault();setMessage();
  const emailInput=$('email'),passwordInput=$('password'),displayName=$('displayName')?.value.trim();
  const credential=emailInput?.value.trim(),email=credentialEmail(credential),password=passwordInput?.value||'';
  if(!credential){setMessage(authMode==='signup'?'Escribe el correo de la invitación.':'Escribe tu usuario o correo.');emailInput?.focus();return;}
  if(authMode==='signup'&&!credential.includes('@')){setMessage('Para aceptar una invitación escribe el correo completo.');emailInput?.focus();return;}
  if(password.length<8){setMessage('La contraseña debe tener al menos 8 caracteres.');passwordInput?.focus();return;}
  const btn=$('authSubmit');btn.disabled=true;btn.textContent=authMode==='signup'?'Creando cuenta…':'Entrando…';
  try{
    if(authMode==='signup'){
      const {data,error}=await supabase.auth.signUp({
        email,password,
        options:{data:{display_name:displayName||email.split('@')[0]},emailRedirectTo:`${location.origin}/`}
      });
      if(error)throw error;
      if(!data.session){setMessage('Cuenta creada. Revisa tu correo y confirma el acceso.','success');$('resendConfirmation')?.classList.remove('hidden');return;}
    }else{
      const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
    }
    await loadAuthenticatedApp();
  }catch(error){
    const message=friendlyError(error);setMessage(message);
    if(/confirma tu correo/i.test(message))$('resendConfirmation')?.classList.remove('hidden');
  }finally{btn.disabled=false;btn.textContent=authMode==='signup'?'Crear cuenta':'Entrar';}
}

async function resendConfirmation(){
  const email=$('email')?.value.trim();if(!email||!email.includes('@')){setMessage('Escribe primero el correo completo de la invitación.');return;}
  const btn=$('resendConfirmation');btn.disabled=true;
  try{
    const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${location.origin}/`}});
    if(error)throw error;setMessage(`Listo. Enviamos un nuevo correo a ${email}.`,'success');
  }catch(error){setMessage(friendlyError(error));}
  finally{btn.disabled=false;}
}

async function renderRecovery(){
  const card=document.querySelector('.auth-card');if(!card)return;
  showView('authView');
  card.innerHTML=`<div class="preview-pill">Recuperar acceso</div><h2>Nueva contraseña</h2><p class="muted">Elige una contraseña nueva para volver al vestidor.</p><form id="recoveryForm"><label>Nueva contraseña<input id="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar contraseña<input id="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><button id="savePassword" class="primary" type="submit">Guardar contraseña</button></form><div id="authMessage" class="message hidden"></div>`;
  $('recoveryForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const a=$('newPassword').value,b=$('confirmPassword').value;
    if(a.length<8){setMessage('La contraseña debe tener al menos 8 caracteres.');return;}
    if(a!==b){setMessage('Las contraseñas no coinciden.');return;}
    const btn=$('savePassword');btn.disabled=true;
    try{
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('El enlace de recuperación venció. Solicita uno nuevo.');
      const {error}=await supabase.auth.updateUser({password:a});if(error)throw error;
      setMessage('Contraseña actualizada. Entrando…','success');setTimeout(()=>location.replace('/'),700);
    }catch(error){setMessage(friendlyError(error));btn.disabled=false;}
  });
}

async function handleForcedPassword(event){
  event.preventDefault();const password=$('forceNewPassword')?.value||'',confirmPassword=$('forceConfirmPassword')?.value||'',message=$('forcePasswordMessage'),button=$('forcePasswordSubmit');
  const show=(text,type='error')=>{message.textContent=text;message.dataset.type=type;message.classList.toggle('hidden',!text);};
  show();if(password.length<10){show('Usa al menos 10 caracteres.');return;}if(password!==confirmPassword){show('Las contraseñas no coinciden.');return;}
  button.disabled=true;button.textContent='Guardando…';
  try{
    const {error:updateError}=await supabase.auth.updateUser({password});if(updateError)throw updateError;
    const {data,error}=await supabase.functions.invoke('staff-access',{body:{action:'complete_password_change'}});if(error)throw error;if(data?.error)throw new Error(data.error);
    await supabase.auth.refreshSession();$('forcePasswordForm').reset();show('Contraseña actualizada. Entrando…','success');ctx=null;setTimeout(()=>loadAuthenticatedApp().catch(console.error),350);
  }catch(error){show(friendlyError(error));button.disabled=false;button.textContent='Guardar y entrar';}
}

function wireAuth(){
  if(document.documentElement.dataset.tosAuthWired==='1')return;
  document.documentElement.dataset.tosAuthWired='1';
  $('signInTab')?.addEventListener('click',()=>switchAuthMode('signin'));
  $('signUpTab')?.addEventListener('click',()=>switchAuthMode('signup'));
  $('authForm')?.addEventListener('submit',handleAuthSubmit);
  $('resendConfirmation')?.addEventListener('click',resendConfirmation);
  $('refreshAccess')?.addEventListener('click',()=>loadAuthenticatedApp());
  $('pendingSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});
  $('forcePasswordForm')?.addEventListener('submit',handleForcedPassword);
  installAuthExtras();
}

async function retireLegacyCaches(){
  try{
    if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(r=>r.unregister()));}
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>/^tanneros-shell/i.test(k)||k==='app-shell').map(k=>caches.delete(k)));}
  }catch(error){console.warn('Legacy cache cleanup',error);}
}

function resetHomeState(){
  state.players=[];state.prospects=[];state.calendar=[];state.orders=[];state.executive=null;state.actionCenter=null;
}

function renderImmediateHome(){
  const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia;
  $('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;
  $('welcomeSubtitle').textContent=profile.subtitle;
  renderQuickActions();
  $('homeKpis').innerHTML='<article class="tos-kpi"><span>Conexión</span><strong>Lista</strong><small>Cargando indicadores del club…</small></article>';
  $('attentionList').innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">TannerOS</span><b>Operación disponible</b><small>Los indicadores se actualizan en segundo plano sin bloquear tu trabajo.</small></article>';
  $('agendaList').innerHTML='<div class="tos-empty">Cargando agenda…</div>';
  $('roleFocusBody').innerHTML='<div class="tos-empty">Preparando inteligencia del club…</div>';
  setShellHealth({state:'ok',label:'Conectando datos'});
}

async function renderTaquillaHome(){
  $('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;
  $('welcomeSubtitle').textContent='Cobra, paga y revisa pedidos y calendario.';
  $('attentionPanel')?.classList.add('hidden');
  $('roleFocusPanel')?.classList.add('hidden');
  $('birthdayPanel')?.classList.add('hidden');
  $('agendaList')?.closest('.tos-panel')?.classList.add('hidden');
  $('cashPanel')?.classList.remove('hidden');
  $('cashActions').innerHTML=`${can('taquilla',true)?'<a class="tos-action-big collect" href="/taquilla/?action=cobrar">COBRAR</a><a class="tos-action-big pay" href="/taquilla/?action=pagar">PAGAR</a>':''}`;
  const links=[];
  if(can('tienda'))links.push('<a class="tos-quick-action primary" href="/pedidos/">Pedidos</a>');
  if(can('calendario'))links.push('<a class="tos-quick-action primary" href="/calendario/">Calendario</a>');
  if(can('cursosVerano'))links.push('<a class="tos-quick-action" href="/operacion/programas/">Programas vigentes</a>');
  $('quickActions').innerHTML=links.join('')||'<div class="tos-empty">Sin accesos disponibles para tu rol.</div>';
  setShellHealth({state:'ok',label:'Listo para cobrar'});
  // Un solo número operativo: efectivo del día para entregar al cierre. Nada de saldos, nada de historial.
  const kpis=$('homeKpis');
  if(kpis&&can('taquilla')){
    kpis.style.gridTemplateColumns='minmax(0,320px)';
    kpis.classList.remove('hidden');
    kpis.innerHTML=kpi('Efectivo de hoy','Calculando…','Para entregar al cierre de caja');
    try{
      const snap=await rpcSafe('v2_cashier_snapshot',{organization_id:ctx.organization_id},null);
      const net=Number(snap?.cashTodayNet||0);
      kpis.innerHTML=kpi('Efectivo de hoy',money.format(net),'Para entregar al cierre de caja · solo efectivo',net>0?'good':'');
    }catch(error){kpis.innerHTML=kpi('Efectivo de hoy','—','No se pudo calcular. Abre Taquilla para ver el detalle.');}
  }else if(kpis){
    kpis.innerHTML='';kpis.classList.add('hidden');
  }
}

async function loadAuthenticatedApp(){
  if(bootPromise)return bootPromise;
  bootPromise=(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){ctx=null;navigation=[];showView('authView');document.body.classList.remove('tos-body');installAuthExtras();return;}
    if(user.app_metadata?.must_change_password){showView('forcePasswordView');document.body.classList.remove('tos-body');return;}
    const rows=await rpc('v2_my_context');
    if(!rows?.length){
      $('pendingText').textContent=`La cuenta ${user.email||'actual'} ya existe. Falta vincularla a Tannery City.`;
      showView('pendingView');document.body.classList.remove('tos-body');return;
    }
    ctx=rows[0];navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});resetHomeState();
    showView('appView');document.body.classList.add('tos-body');
    renderShell({ctx,navigation,active:'inicio',title:'Inicio'});
    if(ctx.role==='Taquilla'){renderTaquillaHome().catch(error=>console.error('Taquilla home',error));}
    else{
      renderImmediateHome();
      const generation=++loadGeneration;
      loadHomeData(generation).catch(error=>{console.error('TannerOS home data',error);setShellHealth({state:'attention',label:'Datos parciales'});});
    }
  })().finally(()=>{bootPromise=null;});
  return bootPromise;
}

async function loadHomeData(generation){
  const org=ctx.organization_id,now=new Date().toISOString(),week=isoDaysFromNow(7),jobs=[];
  jobs.push(rpcSafe('v2_executive_insights',{organization_id:org},null).then(v=>state.executive=v&&typeof v==='object'?v:null));
  jobs.push(rpcSafe('v2_action_center',{organization_id:org},{items:[],summary:{}}).then(v=>state.actionCenter=v&&typeof v==='object'?v:{items:[],summary:{}}));
  if(can('jugadores'))jobs.push(rpcSafe('v2_players',{organization_id:org,status_filter:'active'},[]).then(v=>state.players=Array.isArray(v)?v:[]));
  if(can('prospectos')||can('scouting'))jobs.push(rpcSafe('v2_prospects',{organization_id:org,status_filter:null},[]).then(v=>state.prospects=Array.isArray(v)?v:[]));
  if(can('calendario'))jobs.push(rpcSafe('v2_calendar',{organization_id:org,from_at:now,to_at:week},[]).then(v=>state.calendar=Array.isArray(v)?v:[]));
  if(can('tienda'))jobs.push(rpcSafe('v2_orders',{organization_id:org,status_filter:null},[]).then(v=>state.orders=Array.isArray(v)?v:[]));
  await Promise.allSettled(jobs);
  if(generation===loadGeneration)renderHome();
}

function kpi(label,value,sub='',className=''){
  return `<article class="tos-kpi ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;
}
function mini(label,value,sub=''){
  return `<div class="tos-mini-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
}

function renderKpis(){
  const cards=[],executive=state.executive||{},billing=executive.billing,acquisition=executive.acquisition,attendance=executive.attendance,commerce=executive.commerce;
  if(executive.players||can('jugadores'))cards.push(kpi('Plantilla',executive.players?.active??state.players.length,'Tanners activos'));
  if(billing)cards.push(kpi('Cobranza',`${Number(billing.collection_rate||0)}%`,`${billing.covered||0}/${billing.collection_population||0} cubiertos`,Number(billing.collection_rate||0)>=85?'good':''));
  if(attendance?.rate30d!=null)cards.push(kpi('Asistencia 30 días',`${Number(attendance.rate30d).toFixed(1)}%`,`${attendance.attended30d||0}/${attendance.records30d||0} registros`,Number(attendance.rate30d)>=85?'good':''));
  if(acquisition)cards.push(kpi('Conversión captación',`${Number(acquisition.conversionRate||0).toFixed(1)}%`,`${acquisition.converted||0}/${acquisition.total||0} convertidos`));
  if(cards.length<4&&billing)cards.push(kpi('Cartera activa',money.format(Number(billing.total_receivable||0)),`${money.format(Number(billing.current_period_receivable||0))} del mes`,Number(billing.total_receivable||0)>0?'danger':''));
  if(cards.length<4&&commerce)cards.push(kpi('Ventas 30 días',money.format(Number(commerce.sales30d||0)),`${commerce.orders30d||0} pedidos`));
  $('homeKpis').innerHTML=(cards.length?cards.slice(0,4):[kpi('TannerOS','Listo','Usa los accesos para trabajar')]).join('');
}

function renderQuickActions(){
  const visible=moduleLinks.filter(item=>canAny(item.codes,item.write===true)).sort((a,b)=>(b.primary?1:0)-(a.primary?1:0));
  $('quickActions').innerHTML=visible.slice(0,9).map((item,index)=>`<a class="tos-quick-action ${(item.primary||index===0)?'primary':''}" href="${item.href}">${esc(item.label)}</a>`).join('')||'<div class="tos-empty">No hay acciones disponibles para tu rol.</div>';
  const cashVisible=can('taquilla',true)||can('cobranza',true)||can('contabilidad',true);
  $('cashPanel').classList.toggle('hidden',!cashVisible);
  $('cashActions').innerHTML=`${(can('taquilla',true)||can('cobranza',true))?'<a class="tos-action-big collect" href="/taquilla/?action=cobrar">COBRAR</a>':''}${can('contabilidad',true)?'<a class="tos-action-big pay" href="/taquilla/">CAJA</a>':''}`;
}

function actionAllowed(item){
  if(item?.code==='legacy_cutover')return false;
  const codes=actionModules[item?.module]||[];return !codes.length||codes.some(code=>can(code));
}
function actionHref(item){
  const href=String(item?.href||'').trim();
  if(href.startsWith('/')&&!href.startsWith('//'))return href;
  const fallbacks={billing_overdue:'/finanzas/#cobranza',billing_review:'/finanzas/',players_review:'/jugadores/',prospects_overdue:'/prospectos/',prospects_unplanned:'/prospectos/',orders_ready:'/pedidos/',orders_payment_pending:'/pedidos/',sponsors_renewal_overdue:'/patrocinadores/',sponsors_renewal_soon:'/patrocinadores/',sponsors_followup_overdue:'/patrocinadores/',equipment_low:'/utileria/'};
  return fallbacks[item?.code]||'/';
}
function renderAttention(){
  const items=(Array.isArray(state.actionCenter?.items)?state.actionCenter.items:[]).filter(actionAllowed);
  if(!items.length){
    $('attentionList').innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">Bien</span><b>Todo en orden</b><small>No hay pendientes visibles para tus módulos.</small></article>';
    setShellHealth({state:'ok',label:'Todo en orden'});return;
  }
  $('attentionList').innerHTML=items.slice(0,7).map(item=>{
    const priority=safePriorities.has(item.priority)?item.priority:'info';
    return `<a class="tos-action-alert ${priority}" href="${esc(actionHref(item))}"><span class="tos-alert-tag">${priorityLabels[priority]}</span><div><b>${esc(item.title||'Pendiente')}${Number(item.count||0)>0?` <em>${Number(item.count)}</em>`:''}</b><small>${esc(item.detail||'Abrir para revisar')}</small></div><span class="tos-action-arrow">›</span></a>`;
  }).join('');
  const critical=items.filter(x=>x.priority==='critical').length,attention=items.filter(x=>x.priority==='attention').length;
  setShellHealth(critical?{state:'danger',label:`${critical} urgente${critical===1?'':'s'}`}:attention?{state:'attention',label:`${attention} por atender`}:{state:'ok',label:'Todo en orden'});
}

function fmtDateTime(value){
  if(!value)return 'Sin fecha';const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);
  return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date);
}
function renderAgenda(){
  const rows=[...state.calendar].sort((a,b)=>new Date(a.startsAt||a.starts_at)-new Date(b.startsAt||b.starts_at)).slice(0,6);
  $('calendarLink').classList.toggle('hidden',!can('calendario'));
  $('agendaList').innerHTML=rows.length?rows.map(item=>`<a class="tos-list-row" href="/calendario/"><div><strong>${esc(item.title||'Actividad')}</strong><span>${esc(fmtDateTime(item.startsAt||item.starts_at))}${item.location?` · ${esc(item.location)}`:''}</span></div><b>›</b></a>`).join(''):'<div class="tos-empty">Sin eventos en los próximos 7 días.</div>';
}

function usefulSourceRows(){
  const rows=state.executive?.acquisition?.bySource||[];
  return rows.filter(row=>Number(row.total||0)>=3&&!/^(desconocido|sin atribuci[oó]n|otro)$/i.test(String(row.label||'').trim()));
}
function renderRoleFocus(){
  const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia,executive=state.executive||{};
  $('roleFocusTitle').textContent=profile.focus;
  const billing=executive.billing,acquisition=executive.acquisition,attendance=executive.attendance,commerce=executive.commerce,sponsors=executive.sponsors;
  const stats=[];
  if(billing)stats.push(mini('Cobranza',`${Number(billing.collection_rate||0)}%`,`${billing.pending_players||0} pendientes`));
  if(attendance?.rate30d!=null)stats.push(mini('Asistencia',`${Number(attendance.rate30d).toFixed(1)}%`,'últimos 30 días'));
  if(acquisition)stats.push(mini('Conversión',`${Number(acquisition.conversionRate||0).toFixed(1)}%`,'captación'));
  if(!stats.length)stats.push(mini('Jugadores',executive.players?.active??state.players.length),mini('Prospectos',acquisition?.active??state.prospects.length),mini('Pedidos',commerce?.orders30d??state.orders.length));

  const insights=[];
  if(billing?.current_period_receivable>0)insights.push(`Hay ${money.format(Number(billing.current_period_receivable))} pendientes del periodo y ${billing.pending_players||0} Tanners con saldo activo.`);
  if(acquisition?.unplanned>0)insights.push(`${acquisition.unplanned} prospecto${acquisition.unplanned===1?'':'s'} nuevo${acquisition.unplanned===1?'':'s'} todavía no tiene${acquisition.unplanned===1?'':'n'} próxima acción.`);
  if(acquisition?.topSource?.count>0)insights.push(`${acquisition.topSource.label} es la fuente con más registros (${acquisition.topSource.count}).`);
  const best=usefulSourceRows().sort((a,b)=>Number(b.conversionRate||0)-Number(a.conversionRate||0))[0];
  if(best)insights.push(`${best.label} convierte ${Number(best.conversionRate||0).toFixed(1)}% (${best.converted||0}/${best.total||0}) entre las fuentes con volumen suficiente.`);
  if(attendance?.rate30d!=null)insights.push(`La asistencia registrada de los últimos 30 días es ${Number(attendance.rate30d).toFixed(1)}%.`);
  if(commerce?.pendingPayment>0)insights.push(`${commerce.pendingPayment} pedido${commerce.pendingPayment===1?'':'s'} tiene${commerce.pendingPayment===1?'':'n'} pago pendiente.`);
  if(sponsors?.followupsOverdue>0)insights.push(`${sponsors.followupsOverdue} seguimiento${sponsors.followupsOverdue===1?'':'s'} comercial${sponsors.followupsOverdue===1?'':'es'} de patrocinio está${sponsors.followupsOverdue===1?'':'n'} vencido${sponsors.followupsOverdue===1?'':'s'}.`);

  $('roleFocusBody').innerHTML=`<div class="tos-mini-stats">${stats.slice(0,3).join('')}</div><p class="tos-insight-copy">${esc(insights.slice(0,5).join(' ')||'Sin alertas relevantes en los datos cargados.')}</p>`;
  const href=billing?.current_period_receivable>0?'/finanzas/':acquisition?.unplanned>0?'/prospectos/':commerce?.pendingPayment>0?'/pedidos/':'';
  $('roleFocusLink').classList.toggle('hidden',!href);if(href)$('roleFocusLink').href=href;
}

function daysToBirthday(date){
  if(!date)return 999;const birth=new Date(`${String(date).slice(0,10)}T12:00:00`),now=new Date();
  let next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate(),12);
  if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate()))next.setFullYear(next.getFullYear()+1);
  return Math.ceil((next-now)/86400000);
}
function renderBirthdays(){
  const rows=state.players.map(player=>({...player,days:daysToBirthday(player.birth_date)})).filter(player=>player.days>=0&&player.days<=31).sort((a,b)=>a.days-b.days).slice(0,8);
  $('birthdayPanel').classList.toggle('hidden',!rows.length);
  $('birthdayList').innerHTML=rows.map(player=>`<a class="tos-list-row" href="/jugadores/"><div><strong>${esc([player.first_name,player.last_name].filter(Boolean).join(' '))}</strong><span>${player.days===0?'Hoy':player.days===1?'Mañana':`En ${player.days} días`} · ${esc(player.category||'Sin categoría')}</span></div><span class="tos-icon tos-icon-cake" aria-hidden="true"></span></a>`).join('');
}
function renderSearch(){
  const items=[];
  state.players.forEach(player=>items.push({label:[player.first_name,player.last_name].filter(Boolean).join(' '),meta:`Jugador · ${player.category||'Sin categoría'}`,href:'/jugadores/'}));
  state.prospects.forEach(prospect=>items.push({label:[prospect.first_name,prospect.last_name].filter(Boolean).join(' '),meta:`Prospecto · ${prospect.phone||prospect.category_interest||''}`,href:'/prospectos/'}));
  setShellSearchItems(items);
}
function renderHome(){
  const profile=roleProfiles[ctx?.role]||roleProfiles.Presidencia;
  $('welcomeTitle').textContent=`Bienvenido al vestidor, ${firstName()}`;$('welcomeSubtitle').textContent=profile.subtitle;
  renderKpis();renderQuickActions();renderAttention();renderAgenda();renderRoleFocus();renderBirthdays();renderSearch();
}

const recovery=new URLSearchParams(location.search).get('recovery')==='1'||/type=recovery/i.test(location.hash);
await retireLegacyCaches();
if(recovery){await renderRecovery();}
else{
  wireAuth();
  const {data:{session}}=await supabase.auth.getSession();
  if(session){try{await loadAuthenticatedApp();}catch(error){console.error(error);showView('authView');setMessage(friendlyError(error));}}
  else showView('authView');
  supabase.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT'){
      ctx=null;navigation=[];loadGeneration++;resetHomeState();showView('authView');document.body.classList.remove('tos-body');
    }else if(event==='SIGNED_IN'&&!ctx){setTimeout(()=>loadAuthenticatedApp().catch(console.error),0);}
  });
}
