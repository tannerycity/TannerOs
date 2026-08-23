import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const cards=[
  {module:'admin',name:'Onboarding / Go Live',desc:'Checklist automático para preparar un club y retirar sistemas anteriores sin perder datos.',href:'/admin/onboarding/'},
  {module:'admin',name:'Configuración del club',desc:'Datos generales, región, moneda y plan.',href:'/admin/club/'},
  {module:'admin',name:'Marca y apariencia',desc:'Logos, colores, icono PWA y white-label por organización.',href:'/admin/branding/'},
  {module:'admin',name:'Auditoría',desc:'Quién hizo qué y cuándo, con trazabilidad por organización.',href:'/admin/auditoria/'},
  {module:'users',name:'Usuarios',desc:'Membresías, roles e invitaciones.',href:'/usuarios/'},
  {module:'admin',name:'Módulos',desc:'Módulos habilitados para tu organización.',href:'/modulos/'},
  {module:'qa',name:'Calidad',desc:'Smoke, pruebas críticas, regresión, seguridad, integridad e historial de fallas.',href:'/qa/'},
  {module:'accounting',name:'Contabilidad',desc:'Egresos y trazabilidad contable.',href:'/contabilidad/'},
  {module:'calendar',name:'Calendario',desc:'Agenda unificada del club.',href:'/calendario/'},
  {module:'sponsors',name:'Patrocinadores',desc:'Seguimiento y convenios comerciales.',href:'/patrocinadores/'},
  {module:'commerce',name:'Pedidos y producción',desc:'Órdenes, cortes y garantías.',href:'/pedidos/'},
  {module:'equipment',name:'Utilería',desc:'Inventario y asignaciones.',href:'/utileria/'}
];
function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}
  const ctx=rows[0],mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),admin=mods.find(m=>m.module_code==='admin');
  if(!admin?.enabled||!admin?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Administración.';show('deniedView');return;}
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  const allowed=new Map(mods.filter(m=>m.enabled&&m.can_read).map(m=>[m.module_code,m])),grid=$('adminGrid');grid.innerHTML='';
  cards.filter(c=>c.module==='admin'||allowed.has(c.module)).forEach(c=>{const a=document.createElement('a');a.href=c.href;a.className='admin-card';a.innerHTML=`<div><strong>${c.name}</strong><p>${c.desc}</p></div><span>Abrir →</span>`;grid.appendChild(a);});
  show('view');
}
boot().catch(e=>{$('deniedText').textContent=e.message||'No pudimos abrir Administración.';show('deniedView');});
