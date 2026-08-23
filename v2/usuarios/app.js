import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
let ctx=null,canWrite=false,members=[],invites=[],currentMember=null;

const roleLabels={president:'Presidencia',operations:'Operaciones',coach:'Formadores',academy:'Academia',cashier:'Taquilla',accounting:'Contabilidad',commercial:'Marketing',scouting:'Scouting',player:'Tanner'};
const moduleLabels={inicio:'Inicio',club:'Club',direccion:'Dirección',finanzas:'Finanzas',jugadores:'Jugadores',asistencia:'Asistencia',callups:'Convocatoria',calendario:'Calendario',academias:'Academias',scouting:'Scouting',prospectos:'Captación',cursosVerano:'Programas y Eventos',taquilla:'Taquilla',cobranza:'Cobranza',contabilidad:'Contabilidad',patrocinadores:'Patrocinadores',tienda:'Tienda',utileria:'Utilería',usuarios:'Usuarios',qa:'QA',admin:'Administración'};
const hiddenModules=new Set(['convocatoria','sync']);

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,t='',type='error'){const e=$(id);if(!e)return;e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function friendly(e){const t=String(e?.message||e||'Error');const map={'Not authorized':'No tienes permiso para administrar usuarios.','Valid email required':'Escribe un correo válido.','Invalid role':'Rol inválido.','Owner membership is protected':'La cuenta Owner está protegida.','Pending invitation not found':'La invitación ya no está pendiente.','Invalid module':'Módulo inválido.','Membership not found':'No encontramos esa membresía.'};return map[t]||t;}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}
  ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});const mod=mods.find(m=>m.module_code==='users');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Usuarios.';show('deniedView');return;}
  canWrite=!!mod.can_write;$('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;$('sendInvite').disabled=!canWrite;
  await load();show('view');
}
async function load(reopen=false){
  const data=await rpc('v2_users_admin',{organization_id:ctx.organization_id});
  members=Array.isArray(data?.members)?data.members:[];invites=Array.isArray(data?.invitations)?data.invitations:[];
  render();
  if(reopen&&currentMember){currentMember=members.find(m=>m.membershipId===currentMember.membershipId)||null;if(currentMember)renderAccessDrawer();}
}
function render(){
  const pending=invites.filter(i=>i.status==='pending'&&new Date(i.expiresAt)>new Date());
  $('kpiActive').textContent=members.filter(m=>m.active).length;$('kpiInactive').textContent=members.filter(m=>!m.active).length;$('kpiPending').textContent=pending.length;
  $('kpiCustomized').textContent=members.filter(m=>(m.modules||[]).some(x=>x.customized)).length;
  renderMembers();renderInvites(pending);
}
function roleOptions(current){return Object.entries(roleLabels).map(([v,l])=>`<option value="${safe(v)}" ${v===current?'selected':''}>${safe(l)}</option>`).join('');}
function customCount(m){return (m.modules||[]).filter(x=>x.customized&&!hiddenModules.has(x.moduleCode)).length;}
function renderMembers(){
  const box=$('memberList');box.innerHTML='';$('memberEmpty').classList.toggle('hidden',members.length>0);
  members.forEach(m=>{
    const row=document.createElement('article');row.className=`member-card ${m.active?'':'inactive'}`;const locked=m.isOwner||!canWrite;const custom=customCount(m);
    const id=safe(m.membershipId),display=safe(m.displayName||m.email||'Usuario'),email=safe(m.email||'Sin correo visible'),role=safe(roleLabels[m.roleCode]||m.role||'Miembro');
    row.innerHTML=`<div class="member-main"><div class="member-title"><strong>${display}</strong>${m.isOwner?'<span class="owner-chip">Owner</span>':''}${custom?`<span class="custom-chip">${custom} personalizado${custom===1?'':'s'}</span>`:''}</div><span>${email}</span><small>${m.active?'Acceso activo':'Acceso inactivo'} · ${role}</small></div><div class="member-actions"><button class="secondary mini permissions-member" data-id="${id}" type="button">Permisos</button><select class="role-select" data-id="${id}" ${locked?'disabled':''}>${roleOptions(m.roleCode||'player')}</select>${m.isOwner?'':`<button class="secondary mini toggle-member" data-id="${id}" data-active="${m.active}" type="button" ${!canWrite?'disabled':''}>${m.active?'Desactivar':'Reactivar'}</button>`}</div>`;
    box.appendChild(row);
  });
  box.querySelectorAll('.role-select').forEach(s=>s.addEventListener('change',()=>updateMember(s.dataset.id,s.value,null)));
  box.querySelectorAll('.toggle-member').forEach(b=>b.addEventListener('click',()=>updateMember(b.dataset.id,null,b.dataset.active!=='true')));
  box.querySelectorAll('.permissions-member').forEach(b=>b.addEventListener('click',()=>openAccess(b.dataset.id)));
}
function renderInvites(rows){
  const box=$('inviteList');box.innerHTML='';$('inviteEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(i=>{const exp=new Date(i.expiresAt).toLocaleDateString('es-MX'),id=safe(i.id),email=safe(i.email),role=safe(roleLabels[i.roleCode]||i.roleCode||'Miembro');const row=document.createElement('article');row.className='invite-card';row.innerHTML=`<div><strong>${email}</strong><span>${role} · vence ${safe(exp)}</span></div>${canWrite?`<button class="secondary mini revoke-invite" data-id="${id}" type="button">Revocar</button>`:''}`;box.appendChild(row);});
  box.querySelectorAll('.revoke-invite').forEach(b=>b.addEventListener('click',()=>revokeInvite(b.dataset.id)));
}
function openAccess(id){
  currentMember=members.find(m=>m.membershipId===id)||null;if(!currentMember)return;
  renderAccessDrawer();$('accessBackdrop').classList.remove('hidden');$('accessDrawer').classList.remove('hidden');$('accessDrawer').setAttribute('aria-hidden','false');
}
function closeAccess(){currentMember=null;$('accessBackdrop').classList.add('hidden');$('accessDrawer').classList.add('hidden');$('accessDrawer').setAttribute('aria-hidden','true');msg('accessMessage');}
function moduleSort(a,b){return Number(a.sortOrder||999)-Number(b.sortOrder||999)||String(a.moduleName).localeCompare(String(b.moduleName),'es-MX');}
function renderAccessDrawer(){
  if(!currentMember)return;
  $('accessName').textContent=currentMember.displayName||currentMember.email||'Usuario';
  $('accessMeta').textContent=`${roleLabels[currentMember.roleCode]||currentMember.role} · ${currentMember.active?'Acceso activo':'Acceso inactivo'}`;
  $('ownerProtection').classList.toggle('hidden',!currentMember.isOwner);
  $('resetAllModules').disabled=currentMember.isOwner||!canWrite||!customCount(currentMember);
  const box=$('moduleAccessList');box.innerHTML='';
  (currentMember.modules||[]).filter(m=>!hiddenModules.has(m.moduleCode)&&moduleLabels[m.moduleCode]).sort(moduleSort).forEach(m=>{
    const row=document.createElement('article');row.className=`module-access-row ${m.customized?'customized':''} ${!m.enabled?'plan-disabled':''}`;
    const disabled=currentMember.isOwner||!canWrite||!m.enabled,code=safe(m.moduleCode),label=safe(moduleLabels[m.moduleCode]||m.moduleName||m.moduleCode);
    const description=!m.enabled?'Fuera del plan':m.customized?'Personalizado':`Del rol · ${m.baseCanRead?'ver':'sin acceso'}${m.baseCanWrite?' + editar':''}`;
    row.innerHTML=`<div class="module-access-name"><strong>${label}</strong><small>${safe(description)}</small></div><label class="switch-wrap"><input class="read-switch" type="checkbox" data-code="${code}" ${m.effectiveCanRead?'checked':''} ${disabled?'disabled':''}><span class="switch-ui"></span></label><label class="switch-wrap"><input class="write-switch" type="checkbox" data-code="${code}" ${m.effectiveCanWrite?'checked':''} ${disabled||!m.effectiveCanRead?'disabled':''}><span class="switch-ui"></span></label><button class="inherit-module secondary mini" data-code="${code}" type="button" ${disabled||!m.customized?'disabled':''}>Rol</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll('.read-switch').forEach(input=>input.addEventListener('change',()=>setModule(input.dataset.code,input.checked,input.checked?getModule(input.dataset.code)?.effectiveCanWrite:false)));
  box.querySelectorAll('.write-switch').forEach(input=>input.addEventListener('change',()=>setModule(input.dataset.code,true,input.checked)));
  box.querySelectorAll('.inherit-module').forEach(btn=>btn.addEventListener('click',()=>inheritModule(btn.dataset.code)));
}
function getModule(code){return (currentMember?.modules||[]).find(m=>m.moduleCode===code);}
async function setModule(code,read,write){
  if(!currentMember||currentMember.isOwner)return;msg('accessMessage');setDrawerBusy(true);
  try{
    await rpc('v2_set_membership_module_access',{organization_id:ctx.organization_id,membership_id:currentMember.membershipId,module_code:code,can_read:read,can_write:write});
    await load(true);msg('accessMessage',`${moduleLabels[code]||code}: permisos actualizados.`,'success');
  }catch(e){msg('accessMessage',friendly(e));await load(true);}finally{setDrawerBusy(false);}
}
async function inheritModule(code){
  if(!currentMember||currentMember.isOwner)return;msg('accessMessage');setDrawerBusy(true);
  try{
    await rpc('v2_set_membership_module_access',{organization_id:ctx.organization_id,membership_id:currentMember.membershipId,module_code:code,can_read:null,can_write:null});
    await load(true);msg('accessMessage',`${moduleLabels[code]||code}: vuelve a heredar del rol.`,'success');
  }catch(e){msg('accessMessage',friendly(e));await load(true);}finally{setDrawerBusy(false);}
}
function setDrawerBusy(busy){$('moduleAccessList')?.classList.toggle('busy',busy);$('resetAllModules').disabled=busy||currentMember?.isOwner||!canWrite||!customCount(currentMember);}
async function resetAll(){
  if(!currentMember||currentMember.isOwner)return;
  const customized=(currentMember.modules||[]).filter(m=>m.customized&&!hiddenModules.has(m.moduleCode));
  if(!customized.length)return;
  if(!confirm(`¿Restaurar ${customized.length} permiso(s) de ${currentMember.displayName||'este usuario'} a lo definido por su rol?`))return;
  setDrawerBusy(true);msg('accessMessage');
  try{
    for(const m of customized)await rpc('v2_set_membership_module_access',{organization_id:ctx.organization_id,membership_id:currentMember.membershipId,module_code:m.moduleCode,can_read:null,can_write:null});
    await load(true);msg('accessMessage','Todos los módulos vuelven a heredar del rol.','success');
  }catch(e){msg('accessMessage',friendly(e));await load(true);}finally{setDrawerBusy(false);}
}
async function createInvite(e){
  e.preventDefault();msg('inviteMessage');const btn=$('sendInvite');btn.disabled=true;
  try{await rpc('v2_create_invitation',{organization_id:ctx.organization_id,email:$('inviteEmail').value.trim(),role_code:$('inviteRole').value});e.target.reset();$('inviteRole').value='president';await load();msg('inviteMessage','Invitación creada. Debe registrarse con ese mismo correo dentro de 7 días.','success');}
  catch(err){msg('inviteMessage',friendly(err));}finally{btn.disabled=!canWrite;}
}
async function updateMember(id,roleCode,active){
  const m=members.find(x=>x.membershipId===id);if(!m)return;
  try{await rpc('v2_update_membership',{organization_id:ctx.organization_id,membership_id:id,role_code:roleCode||m.roleCode,active:active===null?m.active:active});await load();}
  catch(err){alert(friendly(err));await load();}
}
async function revokeInvite(id){if(!confirm('¿Revocar esta invitación?'))return;try{await rpc('v2_revoke_invitation',{organization_id:ctx.organization_id,invitation_id:id});await load();}catch(err){alert(friendly(err));}}

$('inviteForm').addEventListener('submit',createInvite);$('refresh').addEventListener('click',()=>load());
$('closeAccess').addEventListener('click',closeAccess);$('accessBackdrop').addEventListener('click',closeAccess);$('resetAllModules').addEventListener('click',resetAll);
boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});
