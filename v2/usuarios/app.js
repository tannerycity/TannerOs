import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);

let ctx=null;
let canWrite=false;
let members=[];
let invites=[];
let guardians=[];
let currentPerson=null;
let categoryCatalog=[];      // categorías vivas del club
let categoriesByUser={};     // userId -> [categoryId]
let memberFilter='active';
let wizard={step:1,kind:null,role:null,method:'username'};
let lastCredentialText='';

const roleLabels={
  president:'Presidencia',operations:'Operación',coach:'Entrenador',academy:'Academia',
  cashier:'Taquilla',accounting:'Contabilidad',commercial:'Marketing',scouting:'Scout',player:'Familia'
};
const profileDescriptions={
  guardian:'Acompaña únicamente a sus Tanners: ficha, estado de cuenta, pagos, calendario, tienda y gafete.',
  president:'Abre todo el club y la administración de sus llaves.',
  operations:'Mantiene en movimiento jugadores, programas, tienda y utilería.',
  coach:'Dirige jugadores, asistencia, convocatorias, calendario y trabajo deportivo.',
  academy:'Acompaña academias, asistencia y calendario.',
  cashier:'Recibe cobros y acompaña pedidos, programas y calendario.',
  accounting:'Cuida cobranza, pagos y contabilidad del club.',
  commercial:'Impulsa patrocinios, tienda, rentabilidad y calendario.',
  scouting:'Observa talento y consulta calendario, sin información administrativa.'
};
const profileHighlights={
  guardian:['Sus Tanners','Historial de pagos','Calendario'],
  president:['Todo TannerOS','Usuarios y permisos','Administración'],
  operations:['Jugadores','Operación diaria','Tienda y utilería'],
  coach:['Jugadores','Asistencia','Convocatorias'],
  academy:['Academias','Asistencia','Calendario'],
  cashier:['Cobros','Pedidos','Calendario'],
  accounting:['Cobranza','Pagos','Contabilidad'],
  commercial:['Patrocinios','Tienda','Calendario'],
  scouting:['Scouting','Evaluaciones','Calendario']
};
const moduleLabels={
  inicio:'Inicio',club:'Club',direccion:'Dirección',finanzas:'Finanzas',jugadores:'Jugadores',
  asistencia:'Asistencia',callups:'Convocatoria',calendario:'Calendario',academias:'Academias',
  scouting:'Scouting',prospectos:'Captación',cursosVerano:'Programas y Eventos',taquilla:'Taquilla',
  cobranza:'Cobranza',contabilidad:'Contabilidad',patrocinadores:'Patrocinios',tienda:'Tienda',
  utileria:'Utilería',usuarios:'Usuarios',qa:'QA',admin:'Administración',estacionamiento:'Estacionamiento',
  catalogo:'Catálogo'
};
const hiddenModules=new Set(['convocatoria','sync','commerce_finance']);

function show(id){['loadingView','deniedView','view'].forEach(view=>$(view)?.classList.toggle('hidden',view!==id));}
function message(id,text='',type='error'){
  const box=$(id);if(!box)return;
  box.textContent=text;box.dataset.type=type;box.classList.toggle('hidden',!text);
}
function safe(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function initials(value){return String(value||'TC').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'TC';}
function usernameFromEmail(email){const match=String(email||'').match(/^(.+)@staff\.tanneros\.invalid$/i);return match?.[1]||'';}
function roleName(code){return roleLabels[code]||'Integrante';}
function memberName(member){return member?.displayName||member?.email||'Integrante';}
function guardianName(guardian){return guardian?.name||guardian?.email||guardian?.phone||'Tutor';}
function friendly(error){
  const raw=String(error?.message||error||'No pudimos completar esta acción.');
  const translations={
    'Not authorized':'No tienes permiso para administrar usuarios.',
    'Valid email required':'Escribe un correo válido.',
    'Invalid role':'Ese perfil no está disponible.',
    'Owner membership is protected':'La cuenta propietaria está protegida.',
    'Owner account is protected':'La cuenta propietaria está protegida.',
    'Pending invitation not found':'La invitación ya no está pendiente.',
    'Membership not found':'No encontramos esa llave.',
    'Guardian not found':'No encontramos a ese tutor.',
    'Valid guardian required':'Selecciona un tutor válido.',
    'Guardian has no linked players':'Ese tutor todavía no está ligado a un Tanner.',
    'Guardian already has portal access':'Esta familia ya tiene acceso.',
    'Este tutor ya tiene acceso':'Esta familia ya tiene acceso.',
    'Este tutor no tiene acceso todavía':'Esta familia todavía no tiene acceso.',
    'Ese correo ya tiene una cuenta':'Ese correo ya tiene una cuenta. Usa otro correo o recupera su acceso.',
    'Username must use 3-32 letters, numbers, dots, dashes or underscores':'El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.',
    'Valid display name required':'Escribe el nombre completo.',
    'Username already exists':'Ese usuario ya existe. Elige otro.',
    'Password resets for email accounts use email recovery':'Las cuentas con correo recuperan su contraseña desde la pantalla de entrada.',
    'Email already registered':'Ese correo ya tiene una cuenta. Puede recuperar su acceso desde la pantalla de entrada.',
    'Email rate limit exceeded':'Se alcanzó temporalmente el límite de correos. Intenta de nuevo en unos minutos.',
    'rate limit exceeded':'Se alcanzó temporalmente el límite de correos. Intenta de nuevo en unos minutos.'
  };
  return translations[raw]||raw;
}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
async function invokeStaff(body){
  const {data,error}=await supabase.functions.invoke('staff-access',{body:{organization_id:ctx.organization_id,...body}});
  if(error){
    let detail='';
    try{detail=(await error.context?.clone?.().json())?.error||'';}catch{}
    throw new Error(detail||error.message);
  }
  if(data?.error)throw new Error(data.error);
  return data;
}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/';return;}
  const contexts=await rpc('v2_my_context');
  if(!contexts?.length){$('deniedText').textContent='Tu cuenta no está vinculada a Tannery City.';show('deniedView');return;}
  ctx=contexts[0];
  const modules=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const access=modules.find(module=>module.module_code==='users');
  if(!access?.enabled||!access?.can_read){$('deniedText').textContent='Tu llave no abre Usuarios.';show('deniedView');return;}
  canWrite=Boolean(access.can_write);
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';
  $('roleBadge').textContent=ctx.is_owner?'Presidencia':(ctx.role||'Integrante');
  $('openCreateUser').disabled=!canWrite;
  await load();show('view');
}

async function load(reopen=false){
  const [userData,guardianData,catData]=await Promise.all([
    rpc('v2_users_admin',{organization_id:ctx.organization_id}),
    rpc('v2_guardian_access',{organization_id:ctx.organization_id}),
    // Si falla, el resto del módulo sigue vivo: la sección de categorías
    // simplemente no se muestra.
    rpc('v2_category_staff',{organization_id:ctx.organization_id}).catch(()=>null)
  ]);
  members=Array.isArray(userData?.members)?userData.members:[];
  invites=Array.isArray(userData?.invitations)?userData.invitations:[];
  guardians=Array.isArray(guardianData)?guardianData:[];
  categoryCatalog=Array.isArray(catData?.categories)?catData.categories:[];
  categoriesByUser=catData?.byUser&&typeof catData.byUser==='object'?catData.byUser:{};
  render();
  if(reopen&&currentPerson){
    if(currentPerson.kind==='staff')currentPerson.data=members.find(member=>member.membershipId===currentPerson.data.membershipId)||null;
    else currentPerson.data=guardians.find(guardian=>String(guardian.guardian_id)===String(currentPerson.data.guardian_id))||null;
    if(currentPerson.data)renderPersonDrawer();else closePerson();
  }
}

function pendingInvites(){return invites.filter(invite=>invite.status==='pending'&&new Date(invite.expiresAt)>new Date());}
function personRows(){
  return [
    ...members.map(data=>({kind:'staff',id:data.membershipId,active:Boolean(data.active),name:memberName(data),data})),
    ...guardians.map(data=>({kind:'guardian',id:data.guardian_id,active:Boolean(data.has_access),name:guardianName(data),data}))
  ];
}
function render(){
  const activeStaff=members.filter(member=>member.active).length;
  const activeFamilies=guardians.filter(guardian=>guardian.has_access).length;
  $('kpiActive').textContent=activeStaff+activeFamilies;
  $('kpiFamilies').textContent=activeFamilies;
  $('kpiPending').textContent=pendingInvites().length;
  $('kpiNeedsAttention').textContent=guardians.filter(guardian=>!guardian.has_access).length;
  renderPeople();renderInvites();renderGuardianOptions();
}

function personMatchesFilter(person){
  if(memberFilter==='active')return person.active;
  if(memberFilter==='inactive')return !person.active;
  if(memberFilter==='family')return person.kind==='guardian'||person.data.roleCode==='player';
  if(memberFilter==='team')return person.kind==='staff'&&person.data.roleCode!=='player'&&person.active;
  return true;
}
function personSearchText(person){
  if(person.kind==='guardian')return normalize([person.name,person.data.email,person.data.phone,(person.data.players||[]).join(' ')].join(' '));
  return normalize([person.name,person.data.email,usernameFromEmail(person.data.email),roleName(person.data.roleCode)].join(' '));
}
function renderPeople(){
  const query=normalize($('userSearch').value.trim());
  const rows=personRows().filter(person=>personMatchesFilter(person)&&(!query||personSearchText(person).includes(query))).sort((a,b)=>Number(b.data.isOwner)-Number(a.data.isOwner)||Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'es-MX'));
  const list=$('memberList');list.innerHTML='';$('memberEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(person=>{
    const family=person.kind==='guardian'||person.data.roleCode==='player';
    const username=person.kind==='staff'?usernameFromEmail(person.data.email):'';
    const contact=person.kind==='guardian'?(person.data.email||person.data.phone||'Sin contacto'):(username?`@${username}`:(person.data.email||'Sin correo visible'));
    const detail=person.kind==='guardian'?((person.data.players||[]).join(' · ')||'Sin Tanner ligado'):`${roleName(person.data.roleCode)} · ${person.active?'Llave activa':'Llave pausada'}`;
    const card=document.createElement('article');card.className=`member-card ${person.active?'':'inactive'}`;
    card.innerHTML=`
      <div class="member-avatar ${family?'family':''}">${safe(initials(person.name))}</div>
      <div class="member-info">
        <div class="member-title-line"><strong>${safe(person.name)}</strong>${person.data.isOwner?'<span class="member-chip owner">Protegida</span>':''}${person.kind==='guardian'&&!person.active?'<span class="member-chip attention">Sin llave</span>':''}</div>
        <span>${safe(contact)}</span><small>${safe(detail)}</small>
      </div>
      <button class="member-open" type="button" data-kind="${person.kind}" data-person-id="${safe(person.id)}" aria-label="Abrir a ${safe(person.name)}"><span aria-hidden="true"></span></button>`;
    list.appendChild(card);
  });
  list.querySelectorAll('[data-person-id]').forEach(button=>button.addEventListener('click',()=>openPerson(button.dataset.kind,button.dataset.personId)));
}

function renderInvites(){
  const rows=pendingInvites();$('invitationPanel').classList.toggle('hidden',!rows.length);
  const list=$('inviteList');list.innerHTML='';$('inviteEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(invite=>{
    const expires=new Date(invite.expiresAt).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
    const card=document.createElement('article');card.className='invite-card';
    card.innerHTML=`<div><strong>${safe(invite.email)}</strong><span>${safe(roleName(invite.roleCode))} · disponible hasta ${safe(expires)}</span></div>${canWrite?`<div class="invite-actions"><button class="secondary mini resend-invite" type="button" data-email="${safe(invite.email)}" data-role="${safe(invite.roleCode)}">Reenviar</button><button class="secondary mini revoke-invite" type="button" data-id="${safe(invite.id)}">Revocar</button></div>`:''}`;
    list.appendChild(card);
  });
  list.querySelectorAll('.resend-invite').forEach(button=>button.addEventListener('click',()=>resendInvite(button.dataset.email,button.dataset.role)));
  list.querySelectorAll('.revoke-invite').forEach(button=>button.addEventListener('click',()=>revokeInvite(button.dataset.id)));
}

function setFilter(filter){
  memberFilter=filter;
  document.querySelectorAll('.filter-chip').forEach(button=>button.classList.toggle('active',button.dataset.filter===filter));
  renderPeople();
}
function renderGuardianOptions(){
  const select=$('familyGuardian'),current=select.value;
  select.innerHTML='<option value="">Selecciona al tutor</option>';
  guardians.forEach(guardian=>{
    const option=document.createElement('option');option.value=guardian.guardian_id;
    option.textContent=`${guardianName(guardian)}${guardian.has_access?' · Ya tiene llave':''}`;
    option.dataset.search=[guardian.email,guardian.phone,(guardian.players||[]).join(' ')].filter(Boolean).join(' ');
    select.appendChild(option);
  });
  if([...select.options].some(option=>option.value===current))select.value=current;
  select.dispatchEvent(new Event('change',{bubbles:true}));
}

function openWizard(guardianId=''){
  if(!canWrite)return;
  wizard={step:1,kind:null,role:null,method:'username'};lastCredentialText='';
  $('accessForm').reset();$('credentialResult').classList.add('hidden');$('wizardProgress').classList.remove('hidden');
  document.querySelectorAll('[data-role],[data-profile]').forEach(button=>button.classList.remove('selected'));
  setMethod('username');setWizardStep(1);message('wizardMessage');message('createMessage');
  $('wizardBackdrop').classList.remove('hidden');$('wizardModal').classList.remove('hidden');document.body.style.overflow='hidden';
  if(guardianId){chooseProfile('guardian');$('familyGuardian').value=guardianId;$('familyGuardian').dispatchEvent(new Event('change',{bubbles:true}));syncGuardianEmail();}
}
function closeWizard(){$('wizardBackdrop').classList.add('hidden');$('wizardModal').classList.add('hidden');document.body.style.overflow='';}
function setWizardStep(step){
  wizard.step=step;
  [1,2,3].forEach(index=>{$(`wizardStep${index}`)?.classList.toggle('hidden',index!==step);document.querySelector(`[data-step-indicator="${index}"]`)?.classList.toggle('active',index<=step);});
  $('accessForm').classList.toggle('hidden',step===1);$('credentialResult').classList.add('hidden');
}
function chooseProfile(profile){
  const guardian=profile==='guardian';
  if(!guardian&&!roleLabels[profile])return;
  wizard.kind=guardian?'guardian':'staff';wizard.role=guardian?null:profile;
  document.querySelectorAll('[data-role]').forEach(button=>button.classList.toggle('selected',button.dataset.role===profile));
  document.querySelectorAll('[data-profile]').forEach(button=>button.classList.toggle('selected',button.dataset.profile===profile));
  $('staffIdentityFields').classList.toggle('hidden',guardian);$('familyIdentityFields').classList.toggle('hidden',!guardian);
  renderAccessPreview();setWizardStep(2);
  if(guardian)focusSmartSelect('familyGuardian');else $('accessDisplayName').focus();
}
function setMethod(method){
  wizard.method=method;
  $('methodUsername').classList.toggle('active',method==='username');$('methodEmail').classList.toggle('active',method==='email');
  $('usernameField').classList.toggle('hidden',method!=='username');$('emailField').classList.toggle('hidden',method!=='email');
}
function currentProfile(){return wizard.kind==='guardian'?'guardian':wizard.role;}
function renderAccessPreview(){
  const profile=currentProfile()||'operations',tags=profileHighlights[profile]||[];
  $('accessPreview').innerHTML=`<strong>Esto podrá hacer en el club</strong><p>${safe(profileDescriptions[profile])}</p><div class="access-tags">${tags.map(tag=>`<span>${safe(tag)}</span>`).join('')}</div>`;
}
function suggestedUsername(name){return normalize(name).trim().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'').slice(0,32);}
function focusSmartSelect(id){const select=$(id),input=select?.nextElementSibling?.querySelector('.tos-smart-select-input');(input||select)?.focus();}
function selectedGuardian(){return guardians.find(guardian=>String(guardian.guardian_id)===String($('familyGuardian').value));}
function syncGuardianEmail(){const guardian=selectedGuardian();$('familyEmail').value=guardian?.email||'';}
function validEmail(input){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());}
function validateStep2(){
  message('wizardMessage');
  if(wizard.kind==='guardian'){
    const guardian=selectedGuardian();
    if(!guardian){message('wizardMessage','Selecciona al tutor que recibirá esta llave.');focusSmartSelect('familyGuardian');return false;}
    if(guardian.has_access){message('wizardMessage','Esta familia ya tiene acceso. Ábrela desde la lista para administrarlo.');focusSmartSelect('familyGuardian');return false;}
    if(!(guardian.players||[]).length){message('wizardMessage','Primero liga este tutor con un Tanner desde la ficha del jugador.');focusSmartSelect('familyGuardian');return false;}
    if(!validEmail($('familyEmail'))){message('wizardMessage','Escribe un correo válido para esta familia.');$('familyEmail').focus();return false;}
    return true;
  }
  const name=$('accessDisplayName').value.trim();
  if(name.length<2){message('wizardMessage','Escribe el nombre de la persona.');$('accessDisplayName').focus();return false;}
  if(wizard.method==='username'){
    const username=$('accessUsername').value.trim();
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username)){message('wizardMessage','El usuario necesita al menos 3 caracteres y no puede llevar espacios.');$('accessUsername').focus();return false;}
  }else if(!validEmail($('accessEmail'))){message('wizardMessage','Escribe un correo válido.');$('accessEmail').focus();return false;}
  return true;
}
function renderReview(){
  const profile=currentProfile();
  if(wizard.kind==='guardian'){
    const guardian=selectedGuardian(),players=(guardian?.players||[]).join(' · ')||'Sin Tanner ligado';
    $('accessReview').innerHTML=`
      <div class="review-row"><span>Persona</span><strong>${safe(guardianName(guardian))}</strong></div>
      <div class="review-row"><span>Perfil</span><strong>Familia</strong></div>
      <div class="review-row"><span>Entrada</span><strong>${safe($('familyEmail').value.trim())}</strong></div>
      <div class="review-row"><span>Puede ver</span><strong>${safe(players)}</strong></div>
      <div class="review-row"><span>Acceso</span><strong>${safe(profileHighlights.guardian.join(' · '))}</strong></div>`;
    return;
  }
  const credential=wizard.method==='username'?`@${$('accessUsername').value.trim()}`:$('accessEmail').value.trim();
  $('accessReview').innerHTML=`
    <div class="review-row"><span>Persona</span><strong>${safe($('accessDisplayName').value.trim())}</strong></div>
    <div class="review-row"><span>Perfil</span><strong>${safe(roleName(wizard.role))}</strong></div>
    <div class="review-row"><span>Entrada</span><strong>${safe(credential)}</strong></div>
    <div class="review-row"><span>Acceso</span><strong>${safe(profileHighlights[profile].join(' · '))}</strong></div>`;
}
function goToReview(){if(!validateStep2())return;renderReview();setWizardStep(3);}

async function createAccess(event){
  event.preventDefault();if(!canWrite||!wizard.kind||!validateStep2())return;
  message('createMessage');const button=$('createAccess');button.disabled=true;button.textContent='Preparando llave…';
  try{
    let result,displayName,portal='staff';
    if(wizard.kind==='guardian'){
      const guardian=selectedGuardian();displayName=guardianName(guardian);portal='family';
      result=await invokeStaff({action:'create_guardian_access',guardian_id:guardian.guardian_id,email:$('familyEmail').value.trim()});
    }else{
      displayName=$('accessDisplayName').value.trim();
      result=wizard.method==='username'
        ?await invokeStaff({action:'create_username_user',display_name:displayName,username:$('accessUsername').value.trim(),role_code:wizard.role})
        :await invokeStaff({action:'send_email_invite',display_name:displayName,email:$('accessEmail').value.trim(),role_code:wizard.role});
    }
    await load();showCredentialResult(result,displayName,portal);
  }catch(error){message('createMessage',friendly(error));}
  finally{button.disabled=!canWrite;button.textContent='Entregar llave';}
}
function showCredentialResult(result,displayName,portal='staff'){
  $('wizardStep3').classList.add('hidden');$('accessForm').classList.add('hidden');$('wizardProgress').classList.add('hidden');$('credentialResult').classList.remove('hidden');
  if(result.temporary_password){
    const login=portal==='family'?(result.email||'Correo'):result.username,loginLabel=portal==='family'?'Correo':'Usuario',url=portal==='family'?'https://app.tannerycity.com/familias/':'https://app.tannerycity.com/';
    $('credentialTitle').textContent=`${displayName} ya tiene su llave`;
    $('credentialHelp').textContent='Entrégale estos datos ahora. La contraseña temporal sólo se muestra una vez.';
    $('credentialRows').innerHTML=`<div class="credential-row"><span>${loginLabel}</span><strong>${safe(login)}</strong></div><div class="credential-row"><span>Contraseña temporal</span><code>${safe(result.temporary_password)}</code></div>`;
    $('copyCredential').classList.remove('hidden');
    lastCredentialText=`Bienvenido a Tannery City\nTu llave está lista.\n\n${loginLabel}: ${login}\nContraseña temporal: ${result.temporary_password}\nEntrar: ${url}\n\nAl entrar crearás tu propia contraseña.`;
  }else if(result.invitation_link){
    $('credentialTitle').textContent=`${displayName} está por entrar al club`;$('credentialHelp').textContent='Comparte esta invitación de forma privada.';
    $('credentialRows').innerHTML=`<div class="credential-row"><span>Correo</span><strong>${safe(result.email)}</strong></div><div class="credential-row"><span>Enlace privado</span><code>${safe(result.invitation_link)}</code></div>`;
    $('copyCredential').classList.remove('hidden');lastCredentialText=`Bienvenido a Tannery City\nCrea tu llave de TannerOS aquí:\n${result.invitation_link}`;
  }else{
    $('credentialTitle').textContent=`Invitamos a ${displayName} al club`;$('credentialHelp').textContent=`La llave va en camino a ${result.email}. Puede revisar también Spam o No deseado.`;
    $('credentialRows').innerHTML=`<div class="credential-row"><span>Correo enviado</span><strong>${safe(result.email)}</strong></div>`;
    $('copyCredential').classList.add('hidden');lastCredentialText='';
  }
}
async function copyCredential(){
  if(!lastCredentialText)return;
  try{await navigator.clipboard.writeText(lastCredentialText);}catch{
    const area=document.createElement('textarea');area.value=lastCredentialText;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }
  const button=$('copyCredential'),original=button.textContent;button.textContent='Llave copiada';setTimeout(()=>button.textContent=original,1500);
}

function roleOptions(current){
  return Object.entries(roleLabels).filter(([value])=>value!=='player'||current==='player').map(([value,label])=>`<option value="${safe(value)}" ${value===current?'selected':''}>${safe(label)}</option>`).join('');
}
function customCount(member){return (member.modules||[]).filter(module=>module.customized&&!hiddenModules.has(module.moduleCode)).length;}
function openPerson(kind,id){
  const data=kind==='staff'?members.find(member=>String(member.membershipId)===String(id)):guardians.find(guardian=>String(guardian.guardian_id)===String(id));
  if(!data)return;currentPerson={kind,data};renderPersonDrawer();
  $('memberBackdrop').classList.remove('hidden');$('memberDrawer').classList.remove('hidden');$('memberDrawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function closePerson(){currentPerson=null;$('memberBackdrop').classList.add('hidden');$('memberDrawer').classList.add('hidden');$('memberDrawer').setAttribute('aria-hidden','true');document.body.style.overflow='';message('profileMessage');message('accessMessage');}
function renderPersonDrawer(){
  if(!currentPerson)return;
  const guardian=currentPerson.kind==='guardian',data=currentPerson.data,name=guardian?guardianName(data):memberName(data),username=guardian?'':usernameFromEmail(data.email),active=guardian?Boolean(data.has_access):Boolean(data.active);
  $('memberName').textContent=name;$('memberAvatar').textContent=initials(name);$('memberAvatar').classList.toggle('family',guardian||data.roleCode==='player');
  $('memberMeta').textContent=guardian?`${data.email||data.phone||'Sin contacto'} · ${active?'Portal familiar activo':'Sin llave'}`:`${username?`@${username}`:(data.email||'Sin correo visible')} · ${active?'Llave activa':'Llave pausada'}`;
  $('ownerProtection').classList.toggle('hidden',guardian||!data.isOwner);
  $('memberProfileFields').classList.toggle('hidden',guardian);$('guardianProfileFields').classList.toggle('hidden',!guardian);$('memberAccessDetails').classList.toggle('hidden',guardian);
  if(guardian){
    $('guardianPlayers').textContent=(data.players||[]).join(' · ')||'Sin Tanner ligado';$('guardianContact').textContent=data.email||data.phone||'Sin correo';
  }else{
    $('memberRole').innerHTML=roleOptions(data.roleCode);$('memberRole').disabled=data.isOwner||!canWrite;$('saveMemberProfile').disabled=data.isOwner||!canWrite;
    $('resetAllModules').disabled=data.isOwner||!canWrite||!customCount(data);renderModuleAccess();
  }
  renderCategoryPicker();
  $('resetMemberPassword').classList.toggle('hidden',!active||(guardian?false:(!username||data.isOwner)));$('resetMemberPassword').disabled=!canWrite;
  $('toggleMember').classList.toggle('hidden',!guardian&&data.isOwner);$('toggleMember').disabled=!canWrite;
  $('toggleMember').textContent=guardian?(active?'Retirar llave':'Entregar llave'):(active?'Pausar llave':'Reactivar llave');
  $('memberSecurityHelp').textContent=guardian?'Puedes renovar su contraseña o retirar la llave sin afectar la ficha del Tanner.':username?'Puedes entregar una nueva contraseña o pausar esta llave.':'Las cuentas con correo recuperan su contraseña desde la entrada al vestidor.';
}
// Las categorías del profe. Sólo se ofrece para quien entrena: a Presidencia y
// Operaciones no se les asigna nada porque ven el club completo, y ofrecerles
// la sección haría pensar que el candado también les aplica.
function renderCategoryPicker(){
  const box=$('memberCategories');if(!box)return;
  const data=currentPerson?.data;
  const aplica=currentPerson?.kind==='staff'&&data?.roleCode==='coach'&&categoryCatalog.length>0;
  box.classList.toggle('hidden',!aplica);
  if(!aplica)return;
  const mias=new Set((categoriesByUser[data.userId]||[]).map(String));
  $('categoryPicker').innerHTML=categoryCatalog.map(c=>
    `<label class="category-option"><input type="checkbox" value="${safe(c.id)}" ${mias.has(String(c.id))?'checked':''} ${canWrite?'':'disabled'}>`+
    `<span><strong>${safe(c.name)}</strong><small>${Number(c.players||0)} Tanner${Number(c.players||0)===1?'':'s'}</small></span></label>`).join('');
  $('saveCategories').disabled=!canWrite;
  message('categoryMessage');
}
async function saveCategories(){
  const data=currentPerson?.data;if(!data)return;
  const ids=[...document.querySelectorAll('#categoryPicker input:checked')].map(i=>i.value);
  const button=$('saveCategories');button.disabled=true;
  try{
    await rpc('v2_set_category_staff',{organization_id:ctx.organization_id,user_id:data.userId,category_ids:ids});
    categoriesByUser[data.userId]=ids;
    message('categoryMessage', ids.length
      ? `Listo. Verá ${ids.length===1?'esa categoría':`esas ${ids.length} categorías`}.`
      : 'Sin categorías asignadas: por ahora no verá el expediente de ningún Tanner.','success');
  }catch(error){message('categoryMessage',friendly(error));}
  finally{button.disabled=!canWrite;}
}

function moduleSort(a,b){return Number(a.sortOrder||999)-Number(b.sortOrder||999)||String(a.moduleName).localeCompare(String(b.moduleName),'es-MX');}
function levelOf(module){return module.effectiveCanWrite?'write':module.effectiveCanRead?'read':'none';}
function baseLevelOf(module){return module.baseCanWrite?'write':module.baseCanRead?'read':'none';}
function renderModuleAccess(){
  if(currentPerson?.kind!=='staff')return;
  const member=currentPerson.data,list=$('moduleAccessList');list.innerHTML='';
  (member.modules||[]).filter(module=>!hiddenModules.has(module.moduleCode)&&moduleLabels[module.moduleCode]).sort(moduleSort).forEach(module=>{
    const disabled=member.isOwner||!canWrite||!module.enabled,current=levelOf(module),source=!module.enabled?'No disponible':module.customized?'Ajuste especial':`Incluido en ${roleName(member.roleCode)}`;
    const row=document.createElement('article');row.className=`module-access-row ${module.customized?'customized':''} ${!module.enabled?'plan-disabled':''}`;
    row.innerHTML=`<div class="module-access-name"><strong>${safe(moduleLabels[module.moduleCode])}</strong><small>${safe(source)}</small></div><select class="module-level" data-code="${safe(module.moduleCode)}" ${disabled?'disabled':''}><option value="none" ${current==='none'?'selected':''}>No abre</option><option value="read" ${current==='read'?'selected':''}>Puede consultar</option><option value="write" ${current==='write'?'selected':''}>Puede operar</option></select>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.module-level').forEach(select=>select.addEventListener('change',()=>setModuleLevel(select.dataset.code,select.value)));
}
function moduleByCode(code){return currentPerson?.kind==='staff'?(currentPerson.data.modules||[]).find(module=>module.moduleCode===code):null;}
function setDrawerBusy(busy){$('moduleAccessList').classList.toggle('busy',busy);$('resetAllModules').disabled=busy||currentPerson?.data?.isOwner||!canWrite||!customCount(currentPerson?.data||{});}
async function setModuleLevel(code,level){
  if(currentPerson?.kind!=='staff'||currentPerson.data.isOwner)return;
  const member=currentPerson.data,module=moduleByCode(code),read=level!=='none',write=level==='write',useRole=module&&level===baseLevelOf(module);
  setDrawerBusy(true);message('accessMessage');
  try{await rpc('v2_set_membership_module_access',{organization_id:ctx.organization_id,membership_id:member.membershipId,module_code:code,can_read:useRole?null:read,can_write:useRole?null:write});await load(true);message('accessMessage',`${moduleLabels[code]} actualizado.`,'success');}
  catch(error){message('accessMessage',friendly(error));await load(true);}finally{setDrawerBusy(false);}
}
async function saveMemberProfile(){
  if(currentPerson?.kind!=='staff'||currentPerson.data.isOwner)return;
  const member=currentPerson.data,roleCode=$('memberRole').value,button=$('saveMemberProfile');button.disabled=true;message('profileMessage');
  try{await rpc('v2_update_membership',{organization_id:ctx.organization_id,membership_id:member.membershipId,role_code:roleCode,active:member.active});await load(true);message('profileMessage','Su lugar quedó guardado y la llave ya abre lo necesario.','success');}
  catch(error){message('profileMessage',friendly(error));await load(true);}finally{button.disabled=!canWrite||currentPerson?.data?.isOwner;}
}
async function resetAllModules(){
  if(currentPerson?.kind!=='staff'||currentPerson.data.isOwner)return;
  const member=currentPerson.data,customized=(member.modules||[]).filter(module=>module.customized&&!hiddenModules.has(module.moduleCode));if(!customized.length)return;
  const ok=await tosConfirm({kicker:'LLAVES',title:'¿Volver al acceso recomendado?',
    message:`${memberName(member)} tiene ${customized.length} permiso${customized.length===1?'':'s'} a la medida. Se le devolverán los de ${roleName(member.roleCode)}.`,
    confirmText:'Sí, restaurar'});
  if(!ok)return;
  setDrawerBusy(true);message('accessMessage');
  try{for(const module of customized)await rpc('v2_set_membership_module_access',{organization_id:ctx.organization_id,membership_id:member.membershipId,module_code:module.moduleCode,can_read:null,can_write:null});await load(true);message('accessMessage','La llave volvió a las puertas recomendadas para su función.','success');}
  catch(error){message('accessMessage',friendly(error));await load(true);}finally{setDrawerBusy(false);}
}
async function togglePersonAccess(){
  if(!currentPerson)return;
  if(currentPerson.kind==='guardian'){
    const guardian=currentPerson.data;
    if(!guardian.has_access){const id=guardian.guardian_id;closePerson();openWizard(id);return;}
    const ok=await tosConfirm({kicker:'PORTAL DE FAMILIAS',title:'¿Quitar el acceso del portal?',
      message:`${guardianName(guardian)} dejará de entrar. La ficha y los pagos del Tanner se conservan.`,
      confirmText:'Sí, quitar acceso',danger:true});
    if(!ok)return;
    try{await invokeStaff({action:'revoke_guardian_access',guardian_id:guardian.guardian_id});await load();closePerson();}
    catch(error){message('profileMessage',friendly(error));}
    return;
  }
  const member=currentPerson.data;if(member.isOwner)return;
  const next=!member.active,verb=next?'reactivar':'desactivar';
  const ok=await tosConfirm({kicker:'LLAVES',title:`¿${verb[0].toUpperCase()+verb.slice(1)} esta llave?`,
    message:next?`${memberName(member)} podrá volver a entrar a TannerOS.`:`${memberName(member)} dejará de entrar a TannerOS. Su historial se conserva.`,
    confirmText:next?'Sí, reactivar':'Sí, desactivar',danger:!next});
  if(!ok)return;
  try{await rpc('v2_update_membership',{organization_id:ctx.organization_id,membership_id:member.membershipId,role_code:member.roleCode,active:next});await load();closePerson();}
  catch(error){message('profileMessage',friendly(error));}
}
async function resetPersonPassword(){
  if(!currentPerson)return;
  const guardian=currentPerson.kind==='guardian',data=currentPerson.data,name=guardian?guardianName(data):memberName(data);
  const ok=await tosConfirm({kicker:'LLAVES',title:'¿Nueva contraseña temporal?',
    message:`Para ${name}. La anterior dejará de funcionar de inmediato.`,
    confirmText:'Sí, generarla',danger:true});
  if(!ok)return;
  try{
    const result=await invokeStaff(guardian?{action:'reset_guardian_password',guardian_id:data.guardian_id}:{action:'reset_username_password',user_id:data.userId});
    closePerson();openWizard();showCredentialResult(result,name,guardian?'family':'staff');
  }catch(error){message('profileMessage',friendly(error));}
}
async function resendInvite(email,roleCode){
  try{const result=await invokeStaff({action:'send_email_invite',email,role_code:roleCode});await load();if(result.email_sent)await tosAlert({kicker:'LLAVES',title:'Invitación enviada',message:`Le llegó a ${email}.`});else if(result.invitation_link){lastCredentialText=`Bienvenido a Tannery City\nCrea tu llave de TannerOS aquí:\n${result.invitation_link}`;await copyCredential();alert('El enlace privado quedó copiado.');}}
  catch(error){await tosAlert({kicker:'LLAVES',title:'No se pudo reenviar',message:friendly(error)});}
}
async function revokeInvite(id){
  const ok=await tosConfirm({kicker:'LLAVES',title:'¿Revocar esta invitación?',
    message:'El enlace dejará de servir. Puedes volver a invitar después.',
    confirmText:'Sí, revocar',danger:true});
  if(!ok)return;
  try{await rpc('v2_revoke_invitation',{organization_id:ctx.organization_id,invitation_id:id});await load();}
  catch(error){await tosAlert({kicker:'LLAVES',title:'No se pudo revocar',message:friendly(error)});}}

$('openCreateUser').addEventListener('click',()=>openWizard());$('closeWizard').addEventListener('click',closeWizard);$('wizardBackdrop').addEventListener('click',closeWizard);$('finishWizard').addEventListener('click',closeWizard);$('copyCredential').addEventListener('click',copyCredential);
document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>chooseProfile(button.dataset.role)));
document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>chooseProfile(button.dataset.profile)));
document.querySelectorAll('[data-method]').forEach(button=>button.addEventListener('click',()=>setMethod(button.dataset.method)));
$('wizardBack2').addEventListener('click',()=>setWizardStep(1));$('wizardNext2').addEventListener('click',goToReview);$('wizardBack3').addEventListener('click',()=>setWizardStep(2));$('accessForm').addEventListener('submit',createAccess);
$('accessDisplayName').addEventListener('blur',()=>{if(wizard.method==='username'&&!$('accessUsername').value)$('accessUsername').value=suggestedUsername($('accessDisplayName').value);});
$('familyGuardian').addEventListener('change',syncGuardianEmail);$('userSearch').addEventListener('input',renderPeople);document.querySelectorAll('.filter-chip').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.filter)));$('refresh').addEventListener('click',()=>load());
$('closeMember').addEventListener('click',closePerson);$('memberBackdrop').addEventListener('click',closePerson);$('saveMemberProfile').addEventListener('click',saveMemberProfile);$('resetAllModules').addEventListener('click',resetAllModules);$('saveCategories').addEventListener('click',saveCategories);$('toggleMember').addEventListener('click',togglePersonAccess);$('resetMemberPassword').addEventListener('click',resetPersonPassword);
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('memberDrawer').classList.contains('hidden'))closePerson();else if(!$('wizardModal').classList.contains('hidden'))closeWizard();}});

boot().catch(error=>{$('deniedText').textContent=friendly(error);show('deniedView');});
