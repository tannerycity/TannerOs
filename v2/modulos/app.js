import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const routes={
  players:{name:'Jugadores',desc:'Expedientes, tutores, salud y categoría con historial.',href:'/jugadores/'},
  attendance:{name:'Asistencia',desc:'Sesiones, roster y registro de asistencia.',href:'/asistencia/'},
  prospects:{name:'Captación',desc:'Prospectos, seguimiento y funnel.',href:'/prospectos/'},
  scouting:{name:'Scouting',desc:'Visorías y evaluación de talento.',href:'/scouting/'},
  academies:{name:'Academias',desc:'Academias, cupos e inscripciones de Tanners.',href:'/academias/'},
  commerce:{name:'Pedidos y producción',desc:'Órdenes, cortes, producción, entrega y garantías.',href:'/pedidos/'},
  billing:{name:'Cobranza',desc:'Pagos, beneficios y cartera del club.',href:'/finanzas/'},
  accounting:{name:'Contabilidad',desc:'Egresos y trazabilidad contable.',href:'/contabilidad/'},
  programs:{name:'Programas',desc:'Programas, cupos e inscritos.',href:'/operacion/programas/'},
  sponsors:{name:'Patrocinadores',desc:'Pipeline, convenios, derechos y renovaciones.',href:'/patrocinadores/'},
  equipment:{name:'Utilería',desc:'Inventario, asignaciones y devoluciones.',href:'/utileria/'},
  calendar:{name:'Calendario',desc:'Entrenamientos, partidos, programas y eventos.',href:'/calendario/'},
  users:{name:'Usuarios',desc:'Cuentas, membresías e invitaciones.',href:'/usuarios/'},
  admin:{name:'Administración',desc:'Gobierno, seguridad y operación de TannerOS.',href:'/admin/'},
  qa:{name:'QA · Reglas',desc:'Reglas, integridad y pruebas.',href:'/qa/'}
};
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return;}
  const ctx=rows[0],mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  const grid=$('moduleGrid');grid.innerHTML='';
  mods.filter(m=>m.enabled&&m.can_read).forEach(m=>{const meta=routes[m.module_code]||{name:m.module_code,desc:'Módulo habilitado.',href:null};const card=document.createElement(meta.href?'a':'article');card.className=`module-card ${meta.href?'available':'coming'}`;if(meta.href)card.href=meta.href;card.innerHTML=`<div><strong>${meta.name}</strong><p>${meta.desc}</p></div><span>${meta.href?'Abrir':'Próximamente'}</span>`;grid.appendChild(card);});
  $('loading').classList.add('hidden');$('view').classList.remove('hidden');
}
boot().catch(()=>{location.href='/';});
