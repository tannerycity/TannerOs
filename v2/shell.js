import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {EXPERIENCE_MODULES,renderExperienceNavigation,wireSmartOmnibox,wireFluidNavigation,ensureBackButton} from '/v2/experience.js';

export const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

export const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
export const $=id=>document.getElementById(id);

const canonicalRoutes={
  '/v2/':'/',
  '/v2/club/':'/club/',
  '/v2/direccion/':'/direccion/',
  '/v2/finanzas/':'/finanzas/',
  '/v2/jugadores/':'/jugadores/',
  '/v2/asistencia/':'/asistencia/',
  '/v2/convocatoria/':'/convocatoria/',
  '/v2/calendario/':'/calendario/',
  '/v2/academias/':'/academias/',
  '/v2/prospectos/':'/prospectos/',
  '/v2/scouting/':'/scouting/',
  '/v2/programas/':'/operacion/programas/',
  '/v2/pedidos/':'/pedidos/',
  '/v2/taquilla/':'/taquilla/',
  '/v2/contabilidad/':'/contabilidad/',
  '/v2/patrocinadores/':'/patrocinadores/',
  '/v2/utileria/':'/utileria/',
  '/v2/usuarios/':'/usuarios/',
  '/v2/qa/':'/qa/',
  '/v2/admin/':'/admin/'
};

export async function rpc(name,params={}){
  const {data,error}=await supabase.rpc(name,params);
  if(error)throw error;
  return data;
}

export const navItems=EXPERIENCE_MODULES;
export function navigationMap(rows=[]){return new Map((rows||[]).map(r=>[r.module_code,r]));}
export function moduleAccess(rows,code,write=false){const row=navigationMap(rows).get(code);return Boolean(row?.enabled && (write?row.can_write:row.can_read));}
export function setShellSearchItems(items=[]){window.__tosSearchExtras=Array.isArray(items)?items:[];window.dispatchEvent(new CustomEvent('tanneros:search-extras',{detail:window.__tosSearchExtras}));}

function canonicalizeNav(nav,navigation,active){
  if(!nav)return;
  nav.querySelectorAll('a[href]').forEach(a=>{
    const href=a.getAttribute('href');
    if(canonicalRoutes[href])a.setAttribute('href',canonicalRoutes[href]);
  });
  if(moduleAccess(navigation,'taquilla',false)&&!nav.querySelector('[data-module="taquilla"]')){
    const section=nav.querySelector('.tos-nav-section-finance')||nav.querySelector('.tos-nav-section-ops')||nav;
    const a=document.createElement('a');
    a.href='/taquilla/';a.className=`tos-nav-item ${active==='taquilla'?'active':''}`;a.dataset.module='taquilla';
    a.innerHTML='<span class="tos-nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10"/><path d="M8 15h4"/></svg></span><span>Taquilla</span>';
    section.appendChild(a);
  }
}

function wireMobileNav(){
  if(document.documentElement.dataset.tosMobileNavWired==='1')return;
  document.documentElement.dataset.tosMobileNavWired='1';
  $('shellMenuToggle')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));
  $('shellNavBackdrop')?.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));
}

export function renderShell({ctx,navigation,active='inicio',title='Inicio',searchItems=[]}){
  window.__tosNavigation=navigation||[];window.__tosExperienceNavigation=navigation||[];window.__tosExperienceContext=ctx||null;
  const nav=$('sidebarNav');
  if(nav){renderExperienceNavigation(nav,navigation,active);canonicalizeNav(nav,navigation,active);}

  const role=ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro');
  const display=ctx?.display_name||'Tanner';
  if($('sidebarName'))$('sidebarName').textContent=display;
  if($('sidebarRole'))$('sidebarRole').textContent=role;
  if($('shellTitle'))$('shellTitle').textContent=title;
  if($('shellRole'))$('shellRole').textContent=role;
  if($('shellOrg'))$('shellOrg').textContent=ctx?.organization_name||'Tannery City';
  setShellSearchItems(searchItems);wireMobileNav();wireFluidNavigation();

  const topLeft=document.querySelector('.tos-topbar .tos-top-left');
  if(location.pathname==='/'||location.pathname==='/v2'||location.pathname==='/v2/')document.querySelector('.tos-back-button')?.remove();
  else ensureBackButton(topLeft);

  wireSmartOmnibox({supabase,ctx,navigation,input:$('shellSearch'),results:$('shellSearchResults')});
  $('shellSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});
}

export async function bootstrapProtectedShell({active,title}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/';return null;}
  const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return null;}
  const ctx=rows[0];const navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});
  if(active!=='inicio'&&!moduleAccess(navigation,active,false)){location.href='/';return null;}
  renderShell({ctx,navigation,active,title});
  return {ctx,navigation,map:navigationMap(navigation)};
}

export function setShellHealth({state='ok',label='Todo en orden'}={}){
  const pill=$('shellHealth');if(!pill)return;pill.dataset.state=state;const text=pill.querySelector('span');if(text)text.textContent=label;
}
