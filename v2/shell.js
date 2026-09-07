import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);
export const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
export const $=id=>document.getElementById(id);

const ICONS={
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  chart:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 11h5"/>',
  cashier:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10"/><path d="M8 15h4"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  check:'<path d="m4 12 4 4L20 4"/><path d="M20 12a8 8 0 1 1-4.2-7"/>',
  list:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/>',
  academy:'<path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chevronRight:'<path d="m9 18 6-6-6-6"/>',
  spark:'<path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="3"/>',
  bag:'<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  box:'<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
  ledger:'<path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  userCog:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 12-5"/><circle cx="18" cy="18" r="3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.9V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
  bug:'<path d="M8 2h8"/><rect x="6" y="5" width="12" height="15" rx="6"/><path d="M3 9h3"/><path d="M18 9h3"/><path d="M3 15h3"/><path d="M18 15h3"/>'
};
export const shellIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.home}</svg>`;

export const navItems=[
  {code:'inicio',label:'Inicio',href:'/',group:'main',icon:'home'},
  {code:'club',label:'Club',href:'/club/',group:'main',icon:'shield'},
  {code:'direccion',label:'Dirección',href:'/direccion/',group:'main',icon:'chart'},
  {code:'finanzas',label:'Finanzas',href:'/finanzas/',group:'main',icon:'wallet',aliases:['cobranza']},
  {code:'taquilla',label:'Taquilla',href:'/taquilla/',group:'finance',icon:'cashier'},
  {code:'contabilidad',label:'Contabilidad',href:'/contabilidad/',group:'finance',icon:'ledger'},
  {code:'jugadores',label:'Jugadores',href:'/jugadores/',group:'club',icon:'users'},
  {code:'asistencia',label:'Asistencia',href:'/asistencia/',group:'club',icon:'check'},
  {code:'convocatoria',label:'Convocatoria',href:'/convocatoria/',group:'club',icon:'list',aliases:['callups']},
  {code:'calendario',label:'Calendario',href:'/calendario/',group:'main',icon:'calendar'},
  {code:'academias',label:'Academias',href:'/operacion/academias/',group:'club',icon:'academy'},
  {code:'prospectos',label:'Captación',href:'/prospectos/',group:'club',icon:'target'},
  {code:'scouting',label:'Scouting',href:'/scouting/',group:'club',icon:'search'},
  {code:'cursosVerano',label:'Programas y eventos',href:'/operacion/programas/',group:'club',icon:'spark'},
  {code:'tienda',label:'Tienda',href:'/pedidos/',group:'ops',icon:'bag'},
  {code:'catalogo',label:'Catálogo',href:'/catalogo/',group:'ops',icon:'box',aliases:['tienda']},
  {code:'utileria',label:'Utilería',href:'/utileria/',group:'ops',icon:'box'},
  {code:'patrocinadores',label:'Patrocinadores',href:'/patrocinadores/',group:'ops',icon:'briefcase'},
  {code:'usuarios',label:'Usuarios',href:'/usuarios/',group:'admin',icon:'userCog'},
  {code:'admin',label:'Administración',href:'/admin/',group:'admin',icon:'settings'},
  {code:'qa',label:'QA',href:'/qa/',group:'admin',icon:'bug'}
];
const groupLabels={main:'',club:'Club',finance:'Finanzas',ops:'Operación',admin:'Administración'};

export async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
export function navigationMap(rows=[]){return new Map((rows||[]).map(r=>[r.module_code,r]));}
export function moduleAccess(rows,code,write=false){const row=navigationMap(rows).get(code);return Boolean(row?.enabled&&(write?row.can_write:row.can_read));}
function itemReadable(rows,item){return [item.code,...(item.aliases||[])].some(code=>moduleAccess(rows,code,false));}
function itemActive(item,active){return item.code===active||(item.aliases||[]).includes(active);}
export function setShellSearchItems(items=[]){window.__tosSearchExtras=Array.isArray(items)?items:[];}

/* ---------- Mensajes / notificaciones push ---------- */
const PUSH_PUBLIC_KEY='BDtFwZWNPYPy3-puGg1Q18Bs_hLfVI4tkA1m2cZqqa3h5Dl-Cf-81Iv3gR44saaQmof-Ri3o2oZ7LZe1cKTfnaQ';
const ROLE_OPTIONS=['Presidencia','Marketing','Taquilla','Contabilidad','Scouting','Operaciones'];
function escBell(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function urlBase64ToUint8Array(base64){
  const padding='='.repeat((4-base64.length%4)%4);
  const base64Safe=(base64+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64Safe);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
function ensureBellMarkup(){
  if($('tosBellButton'))return;
  const topRight=document.querySelector('.tos-top-right');
  if(!topRight)return;
  topRight.insertAdjacentHTML('afterbegin',`
    <div class="tos-bell-wrap">
      <button id="tosBellButton" class="tos-bell-button" type="button" aria-label="Mensajes"><span aria-hidden="true">🔔</span><span id="tosBellBadge" class="tos-bell-badge hidden">0</span></button>
      <div id="tosBellPanel" class="tos-bell-panel hidden">
        <div class="tos-bell-head"><strong>Mensajes</strong><button id="tosBellCompose" class="secondary mini hidden" type="button">+ Nuevo</button></div>
        <div id="tosBellSubscribeRow" class="tos-bell-subscribe hidden"><span>Recibe estos avisos aunque no tengas TannerOS abierto.</span><button id="tosEnablePush" class="secondary mini" type="button">Activar notificaciones</button></div>
        <div id="tosBellList" class="tos-bell-list"></div>
        <div id="tosBellEmpty" class="tos-bell-empty hidden">Sin mensajes por ahora.</div>
      </div>
    </div>`);
  document.body.insertAdjacentHTML('beforeend',`
    <div id="tosComposeBackdrop" class="tos-compose-backdrop hidden"></div>
    <section id="tosComposeModal" class="tos-compose-modal hidden" role="dialog" aria-modal="true">
      <h3>Nuevo mensaje</h3>
      <form id="tosComposeForm">
        <label>Título<input id="tosComposeTitle" maxlength="140" required></label>
        <label>Mensaje <span class="tos-optional">opcional</span><textarea id="tosComposeBody" rows="3" maxlength="1000"></textarea></label>
        <label>Para<select id="tosComposeAudience"><option value="club">Todo el club</option><option value="role">Un rol específico</option></select></label>
        <label id="tosComposeRoleField" class="hidden">Rol<select id="tosComposeRole">${ROLE_OPTIONS.map(r=>`<option value="${escBell(r)}">${escBell(r)}</option>`).join('')}</select></label>
        <div class="tos-compose-actions"><button type="button" id="tosComposeCancel" class="secondary">Cancelar</button><button type="submit" class="primary">Enviar</button></div>
        <div id="tosComposeMessage" class="tos-compose-message hidden"></div>
      </form>
    </section>`);
  document.getElementById('tosBellButton').addEventListener('click',()=>{
    const panel=document.getElementById('tosBellPanel');
    const opening=panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if(opening&&window.__tosCtx)markAnnouncementsSeen(window.__tosCtx);
  });
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('.tos-bell-wrap'))return;
    document.getElementById('tosBellPanel')?.classList.add('hidden');
  });
  document.getElementById('tosComposeCancel').addEventListener('click',closeCompose);
  document.getElementById('tosComposeBackdrop').addEventListener('click',closeCompose);
  document.getElementById('tosComposeAudience').addEventListener('change',event=>{
    document.getElementById('tosComposeRoleField').classList.toggle('hidden',event.target.value!=='role');
  });
  document.getElementById('tosComposeForm').addEventListener('submit',submitCompose);
}
function openCompose(){
  document.getElementById('tosComposeForm').reset();
  document.getElementById('tosComposeRoleField').classList.add('hidden');
  document.getElementById('tosComposeMessage').classList.add('hidden');
  document.getElementById('tosComposeBackdrop').classList.remove('hidden');
  document.getElementById('tosComposeModal').classList.remove('hidden');
  document.getElementById('tosBellPanel')?.classList.add('hidden');
}
function closeCompose(){
  document.getElementById('tosComposeBackdrop').classList.add('hidden');
  document.getElementById('tosComposeModal').classList.add('hidden');
}
async function submitCompose(event){
  event.preventDefault();
  const ctx=window.__tosCtx;if(!ctx)return;
  const button=event.target.querySelector('button[type="submit"]');
  button.disabled=true;
  const msgEl=document.getElementById('tosComposeMessage');
  msgEl.classList.add('hidden');
  try{
    const audienceType=document.getElementById('tosComposeAudience').value;
    await rpc('v2_publish_announcement',{
      organization_id:ctx.organization_id,
      title:document.getElementById('tosComposeTitle').value.trim(),
      body:document.getElementById('tosComposeBody').value.trim()||null,
      audience_type:audienceType,
      audience_value:audienceType==='role'?document.getElementById('tosComposeRole').value:null,
    });
    closeCompose();
    await loadAnnouncements(ctx);
  }catch(error){
    msgEl.textContent=error?.message||'No pudimos enviar el mensaje.';
    msgEl.classList.remove('hidden');
  }finally{
    button.disabled=false;
  }
}
async function markAnnouncementsSeen(ctx){
  try{
    await rpc('v2_mark_announcements_seen',{organization_id:ctx.organization_id});
    document.getElementById('tosBellBadge')?.classList.add('hidden');
    document.querySelectorAll('.tos-bell-item.unread').forEach(el=>el.classList.remove('unread'));
  }catch{/* silencioso */}
}
async function loadAnnouncements(ctx){
  try{
    const rows=await rpc('v2_my_announcements',{organization_id:ctx.organization_id});
    const list=Array.isArray(rows)?rows:[];
    const list_el=$('tosBellList'),empty=$('tosBellEmpty'),badge=$('tosBellBadge');
    if(!list_el)return;
    const unread=list.filter(a=>a.unread).length;
    badge.textContent=String(unread);
    badge.classList.toggle('hidden',unread===0);
    empty.classList.toggle('hidden',list.length>0);
    list_el.innerHTML=list.slice(0,20).map(a=>`
      <article class="tos-bell-item ${a.unread?'unread':''}">
        <strong>${escBell(a.title)}</strong>
        ${a.body?`<p>${escBell(a.body)}</p>`:''}
        <small>${a.publishedAt?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(a.publishedAt)):''}</small>
      </article>`).join('');
  }catch{/* silencioso */}
}
async function wirePush(ctx){
  const row=$('tosBellSubscribeRow'),button=$('tosEnablePush');
  if(!row||!button)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||Notification.permission==='denied'){row.classList.add('hidden');return;}
  try{
    const registration=await navigator.serviceWorker.ready;
    const existing=await registration.pushManager.getSubscription();
    if(existing){row.classList.add('hidden');return;}
  }catch{row.classList.add('hidden');return;}
  row.classList.remove('hidden');
  if(button.dataset.tosWired==='1')return;
  button.dataset.tosWired='1';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){row.classList.add('hidden');return;}
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(PUSH_PUBLIC_KEY)});
      const json=subscription.toJSON();
      await rpc('v2_save_push_subscription',{
        organization_id:ctx.organization_id,
        endpoint:json.endpoint,
        p256dh:json.keys.p256dh,
        auth:json.keys.auth,
        user_agent:navigator.userAgent,
      });
      row.classList.add('hidden');
    }catch(error){
      console.warn('No se pudo activar notificaciones',error);
    }finally{
      button.disabled=false;
    }
  });
}
function wireBell(ctx,navigation){
  window.__tosCtx=ctx;
  const canCompose=moduleAccess(navigation,'calendario',true)||moduleAccess(navigation,'admin',true);
  $('tosBellCompose')?.classList.toggle('hidden',!canCompose);
  if($('tosBellCompose')&&$('tosBellCompose').dataset.tosWired!=='1'){
    $('tosBellCompose').dataset.tosWired='1';
    $('tosBellCompose').addEventListener('click',openCompose);
  }
  loadAnnouncements(ctx);
  wirePush(ctx);
}

function ensureProductionCss(){if(document.getElementById('tosProductionCss'))return;const link=document.createElement('link');link.id='tosProductionCss';link.rel='stylesheet';link.href='/v2/production.css?v=20260821e';document.head.appendChild(link);}
// Roles con barra lateral simplificada: sin encabezados de sección y sin ítems que no usan a diario.
// Taquilla ve solo Inicio (implícito), Taquilla, Pedidos, Calendario y Programas — nada de Finanzas,
// aunque técnicamente tenga lectura de cobranza (la necesita solo para el buscador de Tanners en Cobrar).
const SIMPLE_SIDEBAR_ROLES={Taquilla:{exclude:['finanzas']}};
function renderNavigation(nav,navigation,active,role){
  if(!nav)return;nav.innerHTML='';
  const simple=SIMPLE_SIDEBAR_ROLES[role];
  if(simple){
    const exclude=new Set(simple.exclude||[]);
    const items=navItems.filter(item=>itemReadable(navigation,item)&&!exclude.has(item.code));
    const section=document.createElement('div');section.className='tos-nav-section tos-nav-section-simple';
    items.forEach(item=>{const a=document.createElement('a');a.href=item.href;a.className=`tos-nav-item ${itemActive(item,active)?'active':''}`;a.dataset.module=item.code;a.innerHTML=`<span class="tos-nav-icon">${shellIcon(item.icon)}</span><span>${item.label}</span>`;a.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));section.appendChild(a);});
    nav.appendChild(section);
    return;
  }
  ['main','club','finance','ops','admin'].forEach(group=>{
    const items=navItems.filter(item=>item.group===group&&itemReadable(navigation,item));if(!items.length)return;
    const section=document.createElement('div');section.className=`tos-nav-section tos-nav-section-${group}`;
    if(groupLabels[group]){const title=document.createElement('div');title.className='tos-nav-section-label';title.textContent=groupLabels[group];section.appendChild(title);}
    items.forEach(item=>{const a=document.createElement('a');a.href=item.href;a.className=`tos-nav-item ${itemActive(item,active)?'active':''}`;a.dataset.module=item.code;a.innerHTML=`<span class="tos-nav-icon">${shellIcon(item.icon)}</span><span>${item.label}</span>`;a.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));section.appendChild(a);});
    nav.appendChild(section);
  });
}
function wireMobileNav(){if(document.documentElement.dataset.tosMobileNavWired==='1')return;document.documentElement.dataset.tosMobileNavWired='1';$('shellMenuToggle')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));$('shellNavBackdrop')?.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));}
function wireRouteMemory(){if(document.documentElement.dataset.tosRouteMemoryWired==='1')return;document.documentElement.dataset.tosRouteMemoryWired='1';document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented||link.target==='_blank')return;try{const target=new URL(link.href,location.origin),here=new URL(location.href);if(target.origin!==location.origin||target.pathname===here.pathname&&target.search===here.search)return;sessionStorage.setItem(`tos:return:${target.pathname}`,here.pathname+here.search+here.hash);}catch{}},{capture:true});}
function wireSearch(navigation,ctx){
  const input=$('shellSearch'),results=$('shellSearchResults');if(!input||!results||input.dataset.tosSearchWired==='1')return;input.dataset.tosSearchWired='1';
  // El índice de jugadores (v2_search_index) antes se pedía en CADA carga de
  // página aunque nadie tocara el buscador. Ahora solo se pide la primera vez
  // que el usuario realmente interactúa con el buscador.
  let indexPromise=null;
  const ensureIndex=()=>{if(indexPromise)return indexPromise;indexPromise=loadTannerSearchIndex(ctx).then(()=>{if(String(input.value||'').trim())run();});return indexPromise;};
  const close=()=>{results.classList.add('hidden');results.innerHTML='';};
  const run=()=>{const q=String(input.value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!q){close();return;}const modules=navItems.filter(item=>itemReadable(navigation,item)&&`${item.label} ${item.code}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).map(item=>({label:item.label,meta:'Módulo',href:item.href}));const extras=(window.__tosSearchExtras||[]).filter(item=>`${item.label||''} ${item.meta||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));const rows=[...modules,...extras].slice(0,12);results.innerHTML=rows.length?rows.map(row=>`<a class="tos-smart-result" href="${row.href||'#'}"><strong>${String(row.label||'Resultado')}</strong><span>${String(row.meta||'')}</span></a>`).join(''):'<div class="tos-empty">Sin resultados.</div>';results.classList.remove('hidden');};
  input.addEventListener('focus',ensureIndex,{once:true});
  input.addEventListener('input',run);input.addEventListener('focus',run);document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.tos-search-wrap'))close();});document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.focus();}});
}
function ensureBackButton(){
  const topLeft=document.querySelector('.tos-topbar .tos-top-left');if(!topLeft)return;topLeft.querySelector('.tos-back-button')?.remove();const root=location.pathname==='/'||location.pathname==='/v2'||location.pathname==='/v2/';if(root)return;
  const button=document.createElement('button');button.type='button';button.className='tos-back-button';button.setAttribute('aria-label','Volver');button.textContent='‹';button.addEventListener('click',()=>{try{const key=`tos:return:${location.pathname}`,saved=sessionStorage.getItem(key),ref=document.referrer?new URL(document.referrer):null;if(saved&&saved.startsWith('/')&&saved!==location.pathname+location.search+location.hash){sessionStorage.removeItem(key);if(ref?.origin===location.origin&&ref.pathname+ref.search+ref.hash===saved&&history.length>1){history.back();return;}location.href=saved;return;}if(ref?.origin===location.origin&&ref.pathname!==location.pathname&&history.length>1){history.back();return;}}catch{}const clubRoutes=['/jugadores/','/asistencia/','/convocatoria/','/operacion/academias/','/prospectos/','/scouting/'];location.href=clubRoutes.some(path=>location.pathname.startsWith(path))?'/club/':'/';});topLeft.prepend(button);
}
async function loadTannerSearchIndex(ctx){
  try{
    if(!ctx||!ctx.organization_id)return;
    const data=await rpc('v2_search_index',{organization_id:ctx.organization_id});
    const items=(data||[]).map(p=>({
      label:p.name||'Tanner',
      meta:[p.jersey?('#'+p.jersey):'',p.pos||'',p.guardians||'',p.phones||''].filter(Boolean).join(' \u00b7 '),
      href:'/jugadores/?player='+p.id,
      __tanner:true
    }));
    const prev=(window.__tosSearchExtras||[]).filter(x=>!x.__tanner);
    window.__tosSearchExtras=[...prev,...items];
  }catch(e){/* silencioso */}
}
export function renderShell({ctx,navigation,active='inicio',title='Inicio',searchItems=[]}){
  ensureProductionCss();window.__tosNavigation=navigation||[];window.__tosExperienceNavigation=navigation||[];window.__tosExperienceContext=ctx||null;
  const role=ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro'),display=ctx?.display_name||'Tanner';
  renderNavigation($('sidebarNav'),navigation,active,role);if($('sidebarName'))$('sidebarName').textContent=display;if($('sidebarRole'))$('sidebarRole').textContent=role;if($('shellTitle'))$('shellTitle').textContent=title;if($('shellRole'))$('shellRole').textContent=role;if($('shellOrg'))$('shellOrg').textContent=ctx?.organization_name||'Tannery City';setShellSearchItems(searchItems);wireMobileNav();wireRouteMemory();wireSearch(navigation,ctx);ensureBackButton();if($('shellSignOut')&&!$('shellSignOut').dataset.tosWired){$('shellSignOut').dataset.tosWired='1';$('shellSignOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});}
  if(ctx){ensureBellMarkup();wireBell(ctx,navigation);}
}
export async function bootstrapProtectedShell({active,title}){ensureProductionCss();const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return null;}const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return null;}const ctx=rows[0],navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});if(active!=='inicio'&&!moduleAccess(navigation,active,false)){location.href='/';return null;}renderShell({ctx,navigation,active,title});return {ctx,navigation,map:navigationMap(navigation)};}
export function setShellHealth({state='ok',label='Todo en orden'}={}){const pill=$('shellHealth');if(!pill)return;pill.dataset.state=state;const text=pill.querySelector('span');if(text)text.textContent=label;}
