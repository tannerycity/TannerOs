import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);

const settings=[
  {module:'admin',name:'Datos del club',detail:'Nombre, región, moneda y plan.',href:'/admin/club/',symbol:'TC'},
  {module:'admin',name:'Puertas disponibles',detail:'Revisa qué áreas están activas en TannerOS.',href:'/modulos/',symbol:'MO'},
  {module:'admin',name:'Huella de movimientos',detail:'Consulta quién hizo cada cambio y cuándo.',href:'/admin/auditoria/',symbol:'HI'},
  {module:'qa',name:'Estado de TannerOS',detail:'Pruebas y salud técnica del club.',href:'/qa/',symbol:'OK'}
];

function show(id){['loadingView','deniedView','view'].forEach(view=>$(view)?.classList.toggle('hidden',view!==id));}
function safe(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}

function renderSettings(allowed){
  const list=$('settingsList');list.innerHTML='';
  settings.filter(item=>item.module==='admin'||allowed.has(item.module)).forEach(item=>{
    const link=document.createElement('a');link.href=item.href;link.className='settings-row';
    link.innerHTML=`<span class="settings-symbol" aria-hidden="true">${safe(item.symbol)}</span><span class="settings-copy"><strong>${safe(item.name)}</strong><small>${safe(item.detail)}</small></span><span class="settings-arrow" aria-hidden="true"></span>`;
    list.appendChild(link);
  });
}

function renderReadiness(data){
  const percent=Math.max(0,Math.min(100,Number(data?.percent||0))),checks=Array.isArray(data?.checks)?data.checks:[];
  $('readinessPercent').textContent=`${percent}%`;
  $('setupProgress').textContent=`${Number(data?.ready||0)} de ${Number(data?.total||0)} puntos del club listos.`;
  const order={blocker:0,warning:1,ready:2};
  const pending=[...checks].sort((a,b)=>(order[a.status]??3)-(order[b.status]??3)).find(check=>check.status!=='ready');
  const panel=$('nextPanel'),action=$('nextAction');
  if(!pending){
    panel.dataset.state='ready';$('nextTitle').textContent='El club está listo para jugar';
    $('nextDetail').textContent='No hay configuraciones urgentes. Puedes entrar al vestidor con tranquilidad.';
    action.classList.add('hidden');return;
  }
  panel.dataset.state=pending.status==='blocker'?'needed':'attention';
  $('nextTitle').textContent=pending.label||'Hay algo por preparar';
  $('nextDetail').textContent=pending.detail||'Completa este punto para dejar el club listo.';
  action.href=pending.href||'/admin/onboarding/';action.textContent=pending.status==='blocker'?'Completar ahora':'Revisar ahora';action.classList.remove('hidden');
}

function renderReadinessFallback(){
  $('readinessPercent').textContent='—';$('setupProgress').textContent='Entra a Preparar el club para revisar el avance.';
  $('nextPanel').dataset.state='attention';$('nextTitle').textContent='Revisa la preparación del club';
  $('nextDetail').textContent='Tu checklist conserva todos los puntos necesarios para operar.';
  $('nextAction').href='/admin/onboarding/';$('nextAction').textContent='Ver preparación';$('nextAction').classList.remove('hidden');
}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const contexts=await rpc('v2_my_context');
  if(!contexts?.length){$('deniedText').textContent='Tu llave todavía no pertenece a un club.';show('deniedView');return;}
  const ctx=contexts[0],modules=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),admin=modules.find(module=>module.module_code==='admin');
  if(!admin?.enabled||!admin?.can_read){$('deniedText').textContent='Tu llave no abre el Club House.';show('deniedView');return;}
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Presidencia':(ctx.role||'Integrante');
  const allowed=new Set(modules.filter(module=>module.enabled&&module.can_read).map(module=>module.module_code));
  renderSettings(allowed);$('usersDoor').classList.toggle('hidden',!allowed.has('users'));
  try{renderReadiness(await rpc('v2_onboarding_readiness',{organization_id:ctx.organization_id}));}catch{renderReadinessFallback();}
  show('view');
}

boot().catch(error=>{$('deniedText').textContent=error.message||'No pudimos abrir el Club House.';show('deniedView');});
