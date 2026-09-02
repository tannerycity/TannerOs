import {supabase,rpc,renderShell} from '/v2/shell.js?v=20260821f';
import {loadAndApplyBranding} from '/v2/branding.js';
import '/v2/smart-select.js';

const FINAL_ROUTES=[
  ['/admin/auditoria/','admin','Auditoría'],
  ['/admin/branding/','admin','Marca y apariencia'],
  ['/admin/club/','admin','Configuración del club'],
  ['/admin/onboarding/','admin','Configuración inicial'],
  ['/produccion/','tienda','Producción'],
  ['/porteros/','academias','Porteros'],
  ['/deportivo/','club','Rendimiento deportivo'],
  ['/convocatoria/','convocatoria','Convocatoria'],
  ['/jugadores/','jugadores','Jugadores'],
  ['/asistencia/','asistencia','Asistencia'],
  ['/calendario/','calendario','Calendario'],
  ['/academias/','academias','Academias'],
  ['/prospectos/','prospectos','Captación'],
  ['/scouting/','scouting','Scouting'],
  ['/operacion/programas/','cursosVerano','Programas y eventos'],
  ['/pedidos/','tienda','Tienda'],
  ['/catalogo/','catalogo','Catálogo'],
  ['/taquilla/','taquilla','Taquilla'],
  ['/contabilidad/','contabilidad','Contabilidad'],
  ['/patrocinadores/','patrocinadores','Patrocinadores'],
  ['/utileria/','utileria','Utilería'],
  ['/usuarios/','usuarios','Usuarios'],
  ['/qa/','qa','QA'],
  ['/admin/','admin','Administración'],
  ['/modulos/','inicio','Módulos'],
  ['/club/','club','Club'],
  ['/direccion/','direccion','Dirección'],
  ['/finanzas/','finanzas','Finanzas']
];
function canonicalPath(pathname=location.pathname){
  const path=String(pathname||'/');
  if(path==='/v2'||path==='/v2/')return '/';
  if(path==='/v2/programas'||path.startsWith('/v2/programas/'))return path.replace(/^\/v2\/programas(?=\/|$)/,'/operacion/programas');
  if(path.startsWith('/v2/'))return path.slice(3)||'/';
  return path;
}
function canonicalHref(value){
  if(!value||value.startsWith('#')||value.startsWith('mailto:')||value.startsWith('tel:')||value.startsWith('javascript:'))return value;
  try{const u=new URL(value,location.origin);if(u.origin!==location.origin)return value;const p=canonicalPath(u.pathname);return `${p}${u.search}${u.hash}`;}catch{return value;}
}
function meta(){const path=canonicalPath(location.pathname),normalized=path==='/'?'/':(path.endsWith('/')?path:`${path}/`),row=FINAL_ROUTES.find(([prefix])=>normalized.startsWith(prefix));return row?{active:row[1],title:row[2]}:{active:'inicio',title:'TannerOS'};}
function ensureCss(href,id){if(document.getElementById(id))return;const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=href;document.head.appendChild(link);}
function cleanText(value){
  return String(value??'')
    .replace(/TannerOS\s+(?:v(?:ersion)?\s*)?2(?:\.0)?/gi,'TannerOS')
    .replace(/TANNEROS\s*2\.0/gi,'TANNEROS')
    .replace(/\bCORE\s+V2\b/gi,'GESTIÓN')
    .replace(/\bCONTROL\s+V2\b/gi,'CONTROL')
    .replace(/\bV2(?:\.0)?\b/gi,'')
    .replace(/perfil\s+can[oó]nico/gi,'información completa')
    .replace(/datos?\s+can[oó]nicos?/gi,'información actualizada')
    .replace(/backend\s+can[oó]nico/gi,'información actualizada')
    .replace(/\bcan[oó]nic[oa]s?\b/gi,'principal')
    .replace(/\blegacy\b/gi,'anterior')
    .replace(/\bsaas\b/gi,'TannerOS')
    .replace(/\bledger\b/gi,'movimientos')
    .replace(/\bbackend\b/gi,'servicio')
    .replace(/\bpipeline\b/gi,'seguimiento')
    .replace(/\broster\b/gi,'lista')
    .replace(/\bslug\b/gi,'nombre del enlace')
    .replace(/\blocale\b/gi,'formato regional')
    .replace(/[ \t]{2,}/g,' ');
}
function normalizeNode(root=document){
  const scope=root?.querySelectorAll?root:document;scope.querySelectorAll?.('a[href]').forEach(a=>{const old=a.getAttribute('href'),next=canonicalHref(old);if(next&&next!==old)a.setAttribute('href',next);});
  const base=root?.nodeType===Node.DOCUMENT_NODE?root.documentElement:root;if(base){const walker=document.createTreeWalker(base,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.parentElement?.closest('script,style,code,pre'))continue;const next=cleanText(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;}}
  document.title=cleanText(document.title);
}
function buildFrame(){
  if(document.querySelector('.tos-layout')||document.getElementById('tosUnifiedSidebar'))return;
  document.body.classList.add('tos-unified-shell','tos-body');
  const aside=document.createElement('aside');aside.id='tosUnifiedSidebar';aside.className='tos-sidebar tos-experience-sidebar';aside.innerHTML='<div class="tos-brand"><div class="tos-brand-mark">T</div><div><strong>TannerOS</strong><small><span id="sidebarName">Usuario</span> · <span id="sidebarRole">Rol</span></small><small class="tos-version">Tannery City</small></div></div><nav id="sidebarNav" class="tos-nav"></nav><div class="tos-sidebar-bottom"><button id="shellSignOut" class="tos-signout" type="button">Salir del vestidor</button></div>';
  const backdrop=document.createElement('div');backdrop.id='shellNavBackdrop';backdrop.className='tos-nav-backdrop tos-experience-backdrop';
  const header=document.createElement('header');header.id='tosUnifiedTopbar';header.className='tos-topbar tos-experience-topbar';header.innerHTML='<div class="tos-top-left"><button id="shellMenuToggle" class="tos-menu-toggle" type="button" aria-label="Abrir menú"><span class="tos-icon tos-icon-menu" aria-hidden="true"></span></button><span id="shellTitle" class="tos-page-title">TannerOS</span></div><div class="tos-search-wrap"><div class="tos-search-box"><span class="tos-icon tos-icon-search" aria-hidden="true"></span><input id="shellSearch" type="search" placeholder="Buscar en todo TannerOS..." autocomplete="off"><kbd>Ctrl K</kbd></div><div id="shellSearchResults" class="tos-search-results hidden"></div></div><div class="tos-top-right"><span id="shellHealth" class="tos-health" data-state="ok"><i></i><span>Todo en orden</span></span><span id="shellRole" class="tos-role">Rol</span></div>';
  document.body.prepend(header);document.body.prepend(backdrop);document.body.prepend(aside);
}
function installObserver(){if(document.documentElement.dataset.tosNormalizeObserver==='1')return;document.documentElement.dataset.tosNormalizeObserver='1';const observer=new MutationObserver(mutations=>mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE||node.nodeType===Node.TEXT_NODE)normalizeNode(node);})));observer.observe(document.body,{childList:true,subtree:true});}
async function boot(){
  ensureCss('/icons.css?v=20260823a','tosIconsCss');ensureCss('/polish.css?v=20260823a','tosPolishCss');ensureCss('/v2/shell.css?v=20260823a','tosShellCss');ensureCss('/v2/experience.css?v=20260823a','tosExperienceCss');ensureCss('/v2/production.css?v=20260823a','tosProductionCss');
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return;}
  const ctx=rows[0],navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id}),nativeShell=Boolean(document.querySelector('.tos-layout')),page=meta();
  if(!nativeShell){buildFrame();renderShell({ctx,navigation,active:page.active,title:page.title});}
  try{await loadAndApplyBranding(supabase,ctx.organization_id);}catch(error){console.warn('branding',error);}
  normalizeNode(document);installObserver();
}
boot().catch(error=>{console.error('TannerOS shell',error);});
