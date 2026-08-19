import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

const $ = id => document.getElementById(id);
const views = ['authView','pendingView','appView'];
let authMode = 'signin';
let ctx = null;
let players = [];
let lastSignupEmail = '';
const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});

function showView(id){ views.forEach(v => $(v)?.classList.toggle('hidden',v!==id)); }
function setMessage(text='',type='error'){ const b=$('authMessage'); if(!b)return; b.textContent=text; b.dataset.type=type; b.classList.toggle('hidden',!text); }
function showResend(show=true){ $('resendConfirmation')?.classList.toggle('hidden',!show); }
function friendlyError(e){ const r=String(e?.message||e||'Ocurrió un error.'); if(/invalid login credentials/i.test(r))return 'Correo o contraseña incorrectos.'; if(/email not confirmed/i.test(r))return 'Confirma tu correo antes de entrar.'; if(/user already registered/i.test(r))return 'Ese correo ya tiene una cuenta. Usa “Entrar”.'; if(/rate limit/i.test(r))return 'Demasiados intentos. Intenta de nuevo en unos minutos.'; if(/not authorized/i.test(r))return 'Tu cuenta todavía no tiene acceso al club.'; return r; }
function switchAuthMode(mode){ authMode=mode; const up=mode==='signup'; $('signInTab')?.classList.toggle('active',!up); $('signUpTab')?.classList.toggle('active',up); $('nameField')?.classList.toggle('hidden',!up); $('authSubmit').textContent=up?'Crear cuenta':'Entrar'; $('password')?.setAttribute('autocomplete',up?'new-password':'current-password'); setMessage(); showResend(false); }
async function rpc(name,params={}){ const {data,error}=await supabase.rpc(name,params); if(error)throw error; return data; }

async function handleAuthSubmit(ev){
  ev.preventDefault(); setMessage(); showResend(false);
  const email=$('email').value.trim(), password=$('password').value, displayName=$('displayName')?.value.trim();
  const btn=$('authSubmit'); btn.disabled=true;
  try{
    if(authMode==='signup'){
      lastSignupEmail=email;
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||email.split('@')[0]},emailRedirectTo:`${location.origin}/v2`}});
      if(error)throw error;
      if(!data.session){ setMessage('Cuenta creada. Revisa tu correo y confirma el acceso. Si el enlace expira, puedes reenviarlo aquí.','success'); showResend(true); return; }
    }else{
      const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)throw error;
    }
    await loadAuthenticatedApp();
  }catch(e){
    const msg=friendlyError(e); setMessage(msg);
    if(/confirma tu correo/i.test(msg)){ lastSignupEmail=email; showResend(true); }
  }
  finally{ btn.disabled=false; btn.textContent=authMode==='signup'?'Crear cuenta':'Entrar'; }
}

async function resendConfirmation(){
  const email=lastSignupEmail||$('email')?.value.trim();
  if(!email){ setMessage('Escribe primero el correo que quieres confirmar.'); return; }
  const btn=$('resendConfirmation'); btn.disabled=true;
  try{
    const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:`${location.origin}/v2`}});
    if(error)throw error;
    setMessage(`Listo. Enviamos un nuevo correo de confirmación a ${email}. Usa el más reciente.`,'success');
  }catch(e){ setMessage(friendlyError(e)); }
  finally{ btn.disabled=false; }
}

async function loadAuthenticatedApp(){
  const {data:userData}=await supabase.auth.getUser();
  if(!userData?.user){ showView('authView'); return; }
  const rows=await rpc('v2_my_context');
  if(!Array.isArray(rows)||!rows.length){ $('pendingText').textContent=`La cuenta ${userData.user.email||'actual'} ya existe en Supabase Auth. Falta vincularla a Tannery City.`; showView('pendingView'); return; }
  ctx=rows[0];
  await loadDashboard(userData.user);
  showView('appView');
}

function monthStart(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
async function loadDashboard(user){
  const org=ctx.organization_id;
  const [snap,playerRows,moduleRows]=await Promise.all([
    rpc('v2_collection_snapshot',{organization_id:org,billing_period:monthStart()}),
    rpc('v2_players',{organization_id:org,status_filter:'active'}),
    rpc('v2_my_modules',{organization_id:org})
  ]);
  players=Array.isArray(playerRows)?playerRows:[];
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';
  $('roleBadge').textContent=ctx.is_owner?'Propietario':(ctx.role||'Miembro');
  $('welcome').textContent=`Sesión segura de ${ctx.display_name||user.email||'Tanner'}`;
  $('kpiPlayers').textContent=snap?.active_players??players.length;
  $('kpiCollection').textContent=snap?.collection_rate==null?'—':`${snap.collection_rate}%`;
  $('kpiCovered').textContent=snap?.covered==null?'':`${snap.covered}/${snap.collection_population} cubiertos`;
  $('kpiCurrentDebt').textContent=money.format(Number(snap?.current_period_receivable||0));
  $('kpiTotalDebt').textContent=money.format(Number(snap?.total_receivable||0));
  renderModules((moduleRows||[]).filter(m=>m.enabled&&m.can_read));
  renderPlayers(players);
}

const moduleLabels={players:'Jugadores',billing:'Cobranza',accounting:'Contabilidad',academies:'Academias',attendance:'Asistencia',programs:'Programas',commerce:'Tienda',prospects:'Prospectos',scouting:'Scouting',sponsors:'Patrocinadores',equipment:'Utilería',calendar:'Calendario',users:'Usuarios',admin:'Administración',qa:'QA'};
function renderModules(rows){ const list=$('modulesList'); list.innerHTML=''; rows.forEach(m=>{ const x=document.createElement('span'); x.className='module'; x.textContent=moduleLabels[m.module_code]||m.module_code; list.appendChild(x); }); if(!rows.length){ const x=document.createElement('span'); x.className='module'; x.textContent='Sin módulos disponibles'; list.appendChild(x); } }
function playerName(p){ return [p.first_name,p.last_name].filter(Boolean).join(' ').trim(); }
function renderPlayers(rows){
  const body=$('playersBody'); body.innerHTML=''; $('playersEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(p=>{ const tr=document.createElement('tr'); [p.code||'—',playerName(p)||'Sin nombre',p.category||'Sin categoría',p.base_monthly_fee==null?'Por configurar':money.format(Number(p.base_monthly_fee))].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);}); const td=document.createElement('td'), badge=document.createElement('span'); const review=Boolean(p.needs_review||p.billing_status==='review'); badge.className=`status ${review?'review':'active'}`; badge.textContent=review?'Revisar':'Activo'; td.appendChild(badge); tr.appendChild(td); body.appendChild(tr); });
}
function filterPlayers(){ const q=$('playerSearch').value.trim().toLocaleLowerCase('es-MX'); renderPlayers(!q?players:players.filter(p=>`${p.code||''} ${playerName(p)} ${p.category||''}`.toLocaleLowerCase('es-MX').includes(q))); }
async function signOut(){ await supabase.auth.signOut(); ctx=null; players=[]; switchAuthMode('signin'); showView('authView'); }

$('signInTab')?.addEventListener('click',()=>switchAuthMode('signin'));
$('signUpTab')?.addEventListener('click',()=>switchAuthMode('signup'));
$('authForm')?.addEventListener('submit',handleAuthSubmit);
$('resendConfirmation')?.addEventListener('click',resendConfirmation);
$('signOut')?.addEventListener('click',signOut);
$('pendingSignOut')?.addEventListener('click',signOut);
$('refreshAccess')?.addEventListener('click',loadAuthenticatedApp);
$('playerSearch')?.addEventListener('input',filterPlayers);

const {data:initial}=await supabase.auth.getSession();
if(initial?.session){ try{ await loadAuthenticatedApp(); }catch(e){ console.error(e); $('pendingText').textContent=friendlyError(e); showView('pendingView'); } }
else{ switchAuthMode('signin'); showView('authView'); }
