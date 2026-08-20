import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {applyBranding,loadAndApplyBranding} from '/v2/branding.js';
import {initUniversalExperience,renderExperienceNavigation} from '/v2/experience.js';
import {initFocusFallback} from '/v2/focus-fallback.js?v=20260819a';
import {installProductExtensions} from '/v2/product-extensions.js?v=20260819a';
import {installModuleContext} from '/v2/module-context.js?v=20260819a';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let lastOrg=null,busy=false;

const FINAL_ROUTES=[
  {prefix:'/admin/branding/',active:'admin',title:'Marca y apariencia',parent:'/admin/'},
  {prefix:'/operacion/programas/',active:'cursosVerano',title:'Programas y eventos',parent:'/club/'},
  {prefix:'/produccion/',active:'tienda',title:'Producción',parent:'/finanzas/'},
  {prefix:'/porteros/',active:'academias',title:'Porteros',parent:'/academias/'},
  {prefix:'/deportivo/',active:'club',title:'Rendimiento deportivo',parent:'/club/'},
  {prefix:'/convocatoria/',active:'convocatoria',title:'Convocatoria',parent:'/club/'},
  {prefix:'/jugadores/',active:'jugadores',title:'Jugadores',parent:'/club/'},
  {prefix:'/asistencia/',active:'asistencia',title:'Asistencia',parent:'/club/'},
  {prefix:'/calendario/',active:'calendario',title:'Calendario',parent:'/club/'},
  {prefix:'/academias/',active:'academias',title:'Academias',parent:'/club/'},
  {prefix:'/prospectos/',active:'prospectos',title:'Captación',parent:'/club/'},
  {prefix:'/scouting/',active:'scouting',title:'Scouting',parent:'/club/'},
  {prefix:'/pedidos/',active:'tienda',title:'Pedidos',parent:'/finanzas/'},
  {prefix:'/taquilla/',active:'taquilla',title:'Taquilla',parent:'/finanzas/'},
  {prefix:'/contabilidad/',active:'contabilidad',title:'Contabilidad',parent:'/finanzas/'},
  {prefix:'/patrocinadores/',active:'patrocinadores',title:'Patrocinadores',parent:'/direccion/'},
  {prefix:'/utileria/',active:'utileria',title:'Utilería',parent:'/club/'},
  {prefix:'/usuarios/',active:'usuarios',title:'Usuarios',parent:'/admin/'},
  {prefix:'/qa/',active:'qa',title:'QA',parent:'/admin/'},
  {prefix:'/admin/',active:'admin',title:'Administración',parent:'/direccion/'},
  {prefix:'/modulos/',active:'inicio',title:'Módulos',parent:'/'},
  {prefix:'/club/',active:'club',title:'Club',parent:'/'},
  {prefix:'/direccion/',active:'direccion',title:'Dirección',parent:'/'},
  {prefix:'/finanzas/',active:'finanzas',title:'Finanzas',parent:'/'}
];

function canonicalPath(pathname=location.pathname){
  let path=String(pathname||'/');
  if(path==='/v2'||path==='/v2/')return '/';
  if(path==='/v2/programas'||path.startsWith('/v2/programas/'))return path.replace(/^\/v2\/programas(?=\/|$)/,'/operacion/programas');
  if(path.startsWith('/v2/'))return path.slice(3)||'/';
  return path;
}

function normalizedCanonicalPath(pathname=location.pathname){
  const path=canonicalPath(pathname);
  if(path==='/')return '/';
  return path.endsWith('/')?path:`${path}/`;
}

function finalMeta(pathname=location.pathname){
  const path=normalizedCanonicalPath(pathname);
  if(path==='/')return {path,active:'inicio',title:'Inicio',parent:'/'};
  return {...(FINAL_ROUTES.find(item=>path.startsWith(item.prefix))||{active:'inicio',title:'Inicio',parent:'/'}),path};
}

function isTannerOSPath(pathname){
  const path=normalizedCanonicalPath(pathname);
  return path==='/'||FINAL_ROUTES.some(item=>path.startsWith(item.prefix));
}

function canonicalHref(value){
  if(!value||value.startsWith('#')||value.startsWith('mailto:')||value.startsWith('tel:')||value.startsWith('javascript:'))return value;
  try{
    const url=new URL(value,location.origin);
    if(url.origin!==location.origin)return value;
    const path=canonicalPath(url.pathname);
    if(path===url.pathname)return value;
    return `${path}${url.search}${url.hash}`;
  }catch{return value;}
}

function cleanProductText(value){
  let text=String(value??'');
  text=text.replace(/TannerOS\s+(?:v(?:ersion)?\s*)?2(?:\.0)?/gi,'TannerOS');
  text=text.replace(/\bV2(?:\.0)?\b/gi,'');
  text=text.replace(/\b(?:versión|version)\s*2(?:\.0)?\b/gi,'');
  return text.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:])/g,'$1');
}

function normalizeTextNode(node){
  if(!node?.nodeValue||node.parentElement?.closest('script,style,code,pre'))return;
  const next=cleanProductText(node.nodeValue);
  if(next!==node.nodeValue)node.nodeValue=next;
}

function normalizeSurface(root=document){
  if(root?.nodeType===Node.TEXT_NODE){normalizeTextNode(root);return;}
  const scope=root?.querySelectorAll?root:document;
  if(root?.nodeType===Node.ELEMENT_NODE){
    root.querySelectorAll('a[href]').forEach(link=>{const next=canonicalHref(link.getAttribute('href'));if(next&&next!==link.getAttribute('href'))link.setAttribute('href',next);});
  }else{
    scope.querySelectorAll?.('a[href]').forEach(link=>{const next=canonicalHref(link.getAttribute('href'));if(next&&next!==link.getAttribute('href'))link.setAttribute('href',next);});
  }
  const walker=document.createTreeWalker(root?.nodeType===Node.DOCUMENT_NODE?root.documentElement:root,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode()))normalizeTextNode(node);
  const cleanTitle=cleanProductText(document.title);if(cleanTitle!==document.title)document.title=cleanTitle;
}

function installFinalProductLayer(){
  normalizeSurface(document);
  if(document.documentElement.dataset.tosFinalProductLayer==='1')return;
  document.documentElement.dataset.tosFinalProductLayer='1';
  const target=document.body||document.documentElement;
  const observer=new MutationObserver(mutations=>{
    mutations.forEach(mutation=>{
      if(mutation.type==='attributes')normalizeSurface(mutation.target);
      mutation.addedNodes.forEach(node=>normalizeSurface(node));
    });
  });
  observer.observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
}

function wireFinalBackButton(meta){
  const button=document.querySelector('.tos-back-button');
  if(meta.path==='/'){button?.remove();return;}
  if(!button||button.dataset.tosFinalBack==='1')return;
  const clean=button.cloneNode(true);clean.dataset.tosFinalBack='1';button.replaceWith(clean);
  clean.addEventListener('click',()=>{
    try{
      const ref=document.referrer?new URL(document.referrer):null;
      if(ref?.origin===location.origin&&isTannerOSPath(ref.pathname)&&history.length>1){history.back();return;}
    }catch{}
    location.href=meta.parent||'/';
  });
}

function syncFinalExperience({navigation,ctx}){
  const meta=finalMeta();
  const nav=document.getElementById('sidebarNav')||document.getElementById('tosExperienceNav');
  if(nav){renderExperienceNavigation(nav,navigation||[],meta.active);normalizeSurface(nav);}
  const title=document.getElementById('shellTitle')||document.getElementById('tosExperienceTitle');if(title)title.textContent=meta.title;
  document.querySelectorAll('.tos-version').forEach(el=>{if(/TannerOS|^\s*$/.test(el.textContent||''))el.textContent=ctx?.organization_name||'Tannery City';});
  wireFinalBackButton(meta);
  normalizeSurface(document);
}

function installUiSystem(){document.body?.classList.add('tos-ui-v3');if(document.getElementById('tosUiSystemCss'))return;const link=document.createElement('link');link.id='tosUiSystemCss';link.rel='stylesheet';link.href='/v2/ui-system.css?v=20260819a';document.head.appendChild(link);}

async function applyForSession(){
  if(busy)return;busy=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session){normalizeSurface(document);return;}
    const {data,error}=await supabase.rpc('v2_my_context');if(error||!data?.length)return;
    const ctx=data[0],org=ctx.organization_id;if(!org)return;
    installUiSystem();
    let branding=window.__tosBranding;
    if(lastOrg!==org||!branding)branding=await loadAndApplyBranding(supabase,org);
    const experience=await initUniversalExperience({supabase,ctx});
    const navigation=experience?.navigation||window.__tosExperienceNavigation||[];
    syncFinalExperience({navigation,ctx});
    installProductExtensions({navigation});
    installModuleContext({navigation});
    await initFocusFallback({supabase,ctx});
    if(branding)applyBranding(branding,{organizationId:org});
    syncFinalExperience({navigation,ctx});
    lastOrg=org;
  }catch(e){console.warn('branding/experience auto',e);}finally{busy=false;}
}

installFinalProductLayer();
applyForSession();
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(applyForSession,0);if(event==='SIGNED_OUT'){lastOrg=null;window.__tosExperienceNavigation=null;}});
