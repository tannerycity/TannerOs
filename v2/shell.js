import {createClient} from '/v2/supabase-client.js';
import { ligaPublica } from '/v2/club-publico.js';

import { clearPhotoCache } from '/v2/photo-cache.js';
import {busca,filasEnOrden,trozosResaltados,TIPOS,llaveDeCache,cacheVigente,empaquetaCache,borraCacheDelBuscador,agregaReciente,llaveDeRecientes,MIN_LETRAS} from '/v2/buscador.js';
import {FUENTES,desdeModulos,desdeAcciones,armaIndice} from '/v2/buscador-fuentes.js';
export const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);
// Cualquier salida (el botón, otra pestaña o una sesión que caducó) borra el
// índice del buscador: trae teléfonos de familias y no debe sobrevivir a quien
// lo pidió.
try{supabase.auth.onAuthStateChange(evento=>{if(evento==='SIGNED_OUT')borraCacheDelBuscador();});}catch(_){/* cliente sin eventos */}
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
  car:'<path d="M4.2 14.8v-2.1l1.9-4.5A2 2 0 0 1 8 7h8a2 2 0 0 1 1.9 1.2l1.9 4.5v2.1"/><path d="M4.2 12.7h15.6"/><circle cx="7.6" cy="17" r="1.7"/><circle cx="16.4" cy="17" r="1.7"/>',
  briefcase:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
  ledger:'<path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  userCog:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 12-5"/><circle cx="18" cy="18" r="3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.9V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
  bug:'<path d="M8 2h8"/><rect x="6" y="5" width="12" height="15" rx="6"/><path d="M3 9h3"/><path d="M18 9h3"/><path d="M3 15h3"/><path d="M18 15h3"/>',
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  userPlus:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6"/><path d="M16 11h6"/>',
  moneyIn:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1"/>',
  moneyOut:'<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><rect x="4" y="3" width="16" height="4" rx="1"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z"/>',
  book:'<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5Z"/><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20"/>',
  star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'
};
export const shellIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.home}</svg>`;

/* Menú por secciones (21/10/2026, "hagámoslo Apple"): de ~29 entradas a ~12.
   Una pantalla con dentroDe vive dentro de su sección: en el menú sale debajo
   de ella sólo cuando estás ahí, y arriba de la pantalla salen las pestañas de
   la sección. Si la persona no ve la sección, la pantalla sale suelta como
   antes. Nada cambia de permisos: dentroDe sólo acomoda. */
export const navItems=[
  {code:'inicio',label:'Inicio',href:'/',group:'main',icon:'home',always:true},
  // Mensajes es de todos: cualquier miembro activo platica con su área y con el club.
  {code:'mensajes',label:'Mensajes',href:'/mensajes/',group:'main',icon:'chat',always:true},
  {code:'club',label:'Club',href:'/club/',group:'main',icon:'shield',dentroDe:'inicio'},
  {code:'direccion',label:'Dirección',href:'/direccion/',group:'main',icon:'chart',dentroDe:'inicio'},
  {code:'taquilla',label:'Taquilla',href:'/taquilla/',group:'finance',icon:'cashier'},
  {code:'contabilidad',label:'Contabilidad',href:'/contabilidad/',group:'finance',icon:'ledger',dentroDe:'finanzas'},
  {code:'finanzas',label:'Finanzas',href:'/finanzas/',group:'finance',icon:'wallet',aliases:['cobranza']},
  {code:'jugadores',label:'Jugadores',href:'/jugadores/',group:'club',icon:'users'},
  {code:'asistencia',label:'Asistencia',href:'/asistencia/',group:'club',icon:'check',dentroDe:'jugadores'},
  // Becas no es un módulo: lo ve quien ve Dirección (Presidencia, 09/10/2026).
  {code:'becas',label:'Becas',href:'/becas/',group:'club',icon:'star',lee:['direccion'],dentroDe:'jugadores'},
  // Partidos (09/10/2026) reemplaza a Convocatoria en el menú: la convocatoria
  // es el primer paso del partido. Lo ve quien ve Convocatoria.
  {code:'partidos',label:'Partidos',href:'/partidos/',group:'club',icon:'shield',lee:['convocatoria','callups']},
  {code:'calendario',label:'Calendario',href:'/calendario/',group:'club',icon:'calendar',dentroDe:'partidos'},
  {code:'centro_tanner',label:'Centro Tanner',href:'/admin/centro-tanner/',group:'club',icon:'book',dentroDe:'formacion'},
  {code:'academias',label:'Academias',href:'/operacion/academias/',group:'club',icon:'academy',dentroDe:'formacion'},
  // Formación (Metodología Tannery, 12/10/2026): el Formador planea su semana;
  // Dirección Deportiva publica la Semana Tanner. Lo ve quien tiene cualquiera de los dos.
  {code:'formacion',label:'Formación',href:'/formacion/',group:'club',icon:'book',lee:['formacion_direccion']},
  {code:'prospectos',label:'Fichajes',href:'/prospectos/',group:'club',icon:'target'},
  // Candidatos a staff (12/10/2026): las postulaciones de /trabaja/. No es
  // módulo: la ve quien contrata (Usuarios o Dirección deportiva).
  {code:'candidatos',label:'Candidatos',href:'/candidatos/',group:'club',icon:'briefcase',lee:['usuarios','formacion_direccion'],dentroDe:'staff'},
  // Staff y organigrama (13/10/2026): lo ve todo el staff (decisión de Presidencia).
  {code:'staff',label:'Staff',href:'/staff/',group:'club',icon:'users',always:true},
  // Encuestas (15/10/2026): cómo se la pasan papás y visitantes en cada evento.
  // Desde h14 es módulo: Presidencia siempre; a otra persona se le da en
  // Usuarios > persona > Encuestas (así se le dio a Zul).
  {code:'encuestas',label:'Encuestas',href:'/encuestas/',group:'club',icon:'chat',lee:['direccion'],dentroDe:'inicio'},
  {code:'scouting',label:'Scouting',href:'/scouting/',group:'club',icon:'search',dentroDe:'prospectos'},
  {code:'cursosVerano',label:'Programas y eventos',href:'/operacion/programas/',group:'club',icon:'spark',dentroDe:'formacion'},
  {code:'tienda',label:'Tienda',href:'/pedidos/',group:'ops',icon:'bag'},
  // Tienda unificada (21/10/2026): Pedidos, Nuevo pedido y Catálogo son
  // pestañas de una sola Tienda.
  {code:'catalogo',label:'Catálogo',href:'/catalogo/',group:'ops',icon:'box',aliases:['tienda'],dentroDe:'tienda'},
  {code:'utileria',label:'Utilería',href:'/utileria/',group:'ops',icon:'box'},
  {code:'estacionamiento',label:'Estacionamiento',href:'/estacionamiento/',group:'finance',icon:'car',dentroDe:'taquilla'},
  {code:'patrocinadores',label:'Patrocinadores',href:'/patrocinadores/',group:'finance',icon:'briefcase',dentroDe:'finanzas'},
  {code:'usuarios',label:'Usuarios',href:'/usuarios/',group:'admin',icon:'userCog',dentroDe:'admin'},
  // Familias en el portal (18/10/2026): invitar por WhatsApp con liga personal.
  // No es módulo: la ve quien maneja Usuarios (y Presidencia).
  {code:'invitaciones',label:'Familias en el portal',href:'/invitaciones/',group:'admin',icon:'users',lee:['usuarios'],dentroDe:'admin'},
  {code:'admin',label:'Administración',href:'/admin/',group:'admin',icon:'settings'},
  // Cambios (22/10/2026): la bitácora de correcciones que revisa Presidencia.
  {code:'cambios',label:'Cambios',href:'/cambios/',group:'admin',icon:'list',lee:['admin'],dentroDe:'admin'},
  {code:'qa',label:'QA',href:'/qa/',group:'admin',icon:'bug',dentroDe:'admin'}
];
const groupLabels={main:'',club:'Club',finance:'Finanzas',ops:'Operación',admin:'Administración'};

export async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
export function navigationMap(rows=[]){return new Map((rows||[]).map(r=>[r.module_code,r]));}
export function moduleAccess(rows,code,write=false){const row=navigationMap(rows).get(code);return Boolean(row?.enabled&&(write?row.can_write:row.can_read));}
// Una pantalla que no es módulo (Candidatos, Becas…) se abre con los módulos
// que su entrada del menú dice que la leen.
function puedeEntrar(rows,active){if(moduleAccess(rows,active,false))return true;const item=navItems.find(x=>x.code===active);return Boolean(item&&!item.always&&itemReadable(rows,item));}
function itemReadable(rows,item){if(item.always)return true;return [item.code,...(item.aliases||[]),...(item.lee||[])].some(code=>moduleAccess(rows,code,false));}
function itemActive(item,active){return item.code===active||(item.aliases||[]).includes(active);}
const padreDe=item=>item?.dentroDe?navItems.find(x=>x.code===item.dentroDe):null;
function itemEnMenu(rows,item,fuera=new Set()){if(!itemReadable(rows,item))return false;const padre=padreDe(item);return !(padre&&itemReadable(rows,padre)&&!fuera.has(padre.code));}
const hijosDe=(rows,item)=>navItems.filter(x=>x.dentroDe===item.code&&itemReadable(rows,x));
// La sección donde estás: la pantalla misma o la sección que la contiene.
function seccionDe(rows,active){const item=navItems.find(x=>itemActive(x,active));if(!item)return null;const padre=padreDe(item);return padre&&itemReadable(rows,padre)?padre:item;}
export function seccionVisible(rows,active){const sec=seccionDe(rows,active);if(!sec)return [];const miembros=[sec,...hijosDe(rows,sec)].filter(x=>itemReadable(rows,x));return miembros.length>1?miembros:[];}
export function setShellSearchItems(items=[]){window.__tosSearchExtras=Array.isArray(items)?items:[];}

/* ---------- Mensajes / notificaciones push ---------- */
export const PUSH_PUBLIC_KEY='BDtFwZWNPYPy3-puGg1Q18Bs_hLfVI4tkA1m2cZqqa3h5Dl-Cf-81Iv3gR44saaQmof-Ri3o2oZ7LZe1cKTfnaQ';
const ROLE_OPTIONS=['Presidencia','Marketing','Taquilla','Contabilidad','Scouting','Operaciones'];
function escBell(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function urlBase64ToUint8Array(base64){
  const padding='='.repeat((4-base64.length%4)%4);
  const base64Safe=(base64+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64Safe);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
function positionBellPanel(){
  const button=document.getElementById('tosBellButton'),panel=document.getElementById('tosBellPanel');
  if(!button||!panel)return;
  if(window.innerWidth<=560){panel.style.top='';panel.style.right='';panel.style.left='';return;}
  const rect=button.getBoundingClientRect();
  const width=Math.min(360,window.innerWidth*0.88);
  let right=Math.max(12,window.innerWidth-rect.right);
  if(right+width>window.innerWidth-12)right=Math.max(12,window.innerWidth-width-12);
  panel.style.left='';
  panel.style.right=`${right}px`;
  panel.style.top=`${Math.round(rect.bottom+10)}px`;
}
function ensureBellMarkup(){
  if($('tosBellButton'))return;
  const topRight=document.querySelector('.tos-top-right');
  if(!topRight)return;
  topRight.insertAdjacentHTML('afterbegin',`
    <div class="tos-bell-wrap">
      <button id="tosBellButton" class="tos-bell-button" type="button" aria-label="Mensajes"><span class="tos-icon tos-icon-bell" aria-hidden="true"></span><span id="tosBellBadge" class="tos-bell-badge hidden">0</span></button>
    </div>`);
  document.body.insertAdjacentHTML('beforeend',`
    <div id="tosBellPanel" class="tos-bell-panel hidden">
      <div class="tos-bell-head"><strong>Mensajes</strong><button id="tosBellCompose" class="secondary mini hidden" type="button">+ Nuevo</button></div>
      <div id="tosBellSubscribeRow" class="tos-bell-subscribe hidden"><span>Recibe estos avisos aunque no tengas TannerOS abierto.</span><button id="tosEnablePush" class="secondary mini" type="button">Activar notificaciones</button></div>
      <div id="tosBellList" class="tos-bell-list"></div>
      <div id="tosBellEmpty" class="tos-bell-empty hidden">Sin mensajes por ahora.</div>
    </div>
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
    // Desde el Vestidor (05/10/2026) la campana abre Mensajes: chats y avisos
    // viven en una sola pantalla, no en un panel encima de lo que estás viendo.
    // Directo a donde está lo nuevo (19/10/2026): chats primero, luego avisos.
    if(!location.pathname.startsWith('/mensajes')&&!location.pathname.startsWith('/v2/mensajes')){const p=window.__tosPulso?.detalle||{};location.href=Number(p.chats||0)?'/mensajes/?tab=chats':Number(p.avisos||0)?'/mensajes/?tab=avisos':'/mensajes/';return;}
    window.dispatchEvent(new CustomEvent('tos:campana'));
    return;
    const panel=document.getElementById('tosBellPanel');
    const opening=panel.classList.contains('hidden');
    if(opening){positionBellPanel();window.addEventListener('resize',positionBellPanel);}
    else window.removeEventListener('resize',positionBellPanel);
    panel.classList.toggle('hidden');
    if(opening&&window.__tosCtx)markAnnouncementsSeen(window.__tosCtx);
  });
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('.tos-bell-wrap')||event.target.closest?.('#tosBellPanel'))return;
    document.getElementById('tosBellPanel')?.classList.add('hidden');
    window.removeEventListener('resize',positionBellPanel);
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
  const gen=window.__tosPulso?.gen;
  try{
    const rows=await rpc('v2_my_announcements',{organization_id:ctx.organization_id});
    // Si mientras tanto cambió la sesión, esta lista ya no es de quien está viendo.
    if(window.__tosPulso&&window.__tosPulso.gen!==gen)return;
    const list=Array.isArray(rows)?rows:[];
    const list_el=$('tosBellList'),empty=$('tosBellEmpty'),badge=$('tosBellBadge');
    if(!list_el)return;
    const unread=list.filter(a=>a.unread).length;
    // El globito es del pulso (chats + avisos). La lista sólo lo pone mientras
    // el pulso no ha contestado: así no gana la carrera con un número menor.
    if(window.__tosPulso?.total==null){
      badge.textContent=String(unread);
      badge.classList.toggle('hidden',unread===0);
    }else consultaPulso(ctx,{deRegreso:true}); // p. ej. tras publicar un aviso; respeta el mínimo de 15 s
    empty.classList.toggle('hidden',list.length>0);
    list_el.innerHTML=list.slice(0,20).map(a=>`
      ${a.source==='order'&&a.sourceId?`<a class="tos-bell-item tos-bell-link ${a.unread?'unread':''}" href="/pedidos/?pedido=${encodeURIComponent(a.sourceId)}">`:`<article class="tos-bell-item ${a.unread?'unread':''}">`}
        <strong>${escBell(a.title)}</strong>
        ${a.body?`<p>${escBell(a.body)}</p>`:''}
        <small>${a.publishedAt?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(a.publishedAt)):''}</small>
      ${a.source==='order'&&a.sourceId?'</a>':'</article>'}`).join('');
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
  pulsoMensajes(ctx); // primero: si cambió la sesión, apaga lo anterior antes de pedir los avisos
  loadAnnouncements(ctx);
  wirePush(ctx);
}
// El globito de la campana cuenta chats y avisos sin leer (v2_chat_pulse).
// Un solo poller por pestaña, guardado en window.__tosPulso para que lo
// compartan las dos copias de este módulo (branding-auto importa
// shell.js?v=…). Reglas (auditoría del 13/10/2026):
//   · llave = organización + usuario: si cambia, se apaga lo anterior y una
//     respuesta tardía del contexto viejo ya no toca la campana (generación).
//   · una sola petición en vuelo; volver a la pestaña consulta como mucho
//     cada 15 s; cada 30 s mientras está visible; oculta, no consulta.
//   · si falla, espera el doble (hasta 5 min); un acierto o volver la red
//     regresa a 30 s.
const PULSO_MS=30000,PULSO_REGRESO_MS=15000,PULSO_MAX_MS=300000;
// detalle: el último {chats, avisos, total}, para que la campana abra la pestaña de lo nuevo.
const pulso=()=>window.__tosPulso||(window.__tosPulso={llave:'',gen:0,timer:null,enVuelo:null,ultimo:0,espera:PULSO_MS,quita:null,total:null,detalle:null,reprograma:null});
// Apaga el pulso de la sesión actual (cerrar sesión, cambiar de cuenta o de club).
export function detenPulso(){
  const s=window.__tosPulso;if(!s)return;
  s.gen++;clearTimeout(s.timer);s.timer=null;s.quita?.();s.quita=null;s.reprograma=null;s.enVuelo=null;s.llave='';s.ultimo=0;s.espera=PULSO_MS;s.total=null;s.detalle=null;
  const badge=$('tosBellBadge');if(badge){badge.textContent='0';badge.classList.add('hidden');}
}
function consultaPulso(ctx,{deRegreso=false}={}){
  const s=pulso(),gen=s.gen;
  if(s.enVuelo)return s.enVuelo;
  if(deRegreso&&Date.now()-s.ultimo<PULSO_REGRESO_MS)return Promise.resolve();
  s.ultimo=Date.now();
  s.enVuelo=rpc('v2_chat_pulse',{organization_id:ctx.organization_id}).then(p=>{
    if(gen!==s.gen)return; // respuesta de otra sesión: se descarta
    const veniaEsperando=s.espera>PULSO_MS;s.espera=PULSO_MS;if(veniaEsperando)s.reprograma?.();
    const badge=$('tosBellBadge');if(!badge||!p)return;
    const n=Number(p.total||0);s.total=n;s.detalle=p;
    badge.textContent=n>99?'99+':String(n);badge.classList.toggle('hidden',n===0);
    window.dispatchEvent(new CustomEvent('tos:pulso',{detail:p}));
  }).catch(()=>{if(gen===s.gen)s.espera=Math.min(s.espera*2,PULSO_MAX_MS);})
    .finally(()=>{if(gen===s.gen)s.enVuelo=null;});
  return s.enVuelo;
}
function pulsoMensajes(ctx){
  const llave=`${ctx.organization_id}:${ctx.user_id||''}`,s=pulso();
  if(s.llave===llave&&s.quita){consultaPulso(ctx);return;}
  detenPulso();
  s.llave=llave;const gen=s.gen;
  const ciclo=()=>{clearTimeout(s.timer);s.timer=setTimeout(async()=>{
    if(gen!==s.gen)return;
    if(document.visibilityState==='visible')await consultaPulso(ctx);
    if(gen===s.gen)ciclo();
  },s.espera);};
  const alVolver=()=>{if(document.visibilityState==='visible')consultaPulso(ctx,{deRegreso:true});};
  const enLinea=()=>{s.espera=PULSO_MS;s.ultimo=0;ciclo();consultaPulso(ctx);};
  document.addEventListener('visibilitychange',alVolver);window.addEventListener('online',enLinea);
  s.quita=()=>{document.removeEventListener('visibilitychange',alVolver);window.removeEventListener('online',enLinea);};
  s.reprograma=ciclo;
  consultaPulso(ctx);ciclo();
}

function ensureProductionCss(){if(document.getElementById('tosProductionCss'))return;const link=document.createElement('link');link.id='tosProductionCss';link.rel='stylesheet';link.href='/v2/production.css?v=20260907b';document.head.appendChild(link);}
// Roles con barra lateral simplificada: sin encabezados de sección y sin ítems que no usan a diario.
// Taquilla ve solo Inicio (implícito), Taquilla, Pedidos, Calendario y Programas — nada de Finanzas,
// aunque técnicamente tenga lectura de cobranza (la necesita solo para el buscador de Tanners en Cobrar).
const SIMPLE_SIDEBAR_ROLES={Taquilla:{exclude:['finanzas']}};
// El profesor de academia entra a SU academia, no al panel administrativo:
// mismo permiso de módulo, distinta puerta. Se decide por poder escribir, que es
// lo que distingue a quien administra academias de quien solo da clase en una.
function destinoAcademias(navigation,item){
  if(item.code!=='academias')return item.href;
  return moduleAccess(navigation,'academias',true)?item.href:'/mi-academia/';
}
function renderNavigation(nav,navigation,active,role){
  if(!nav)return;nav.innerHTML='';
  const sec=seccionDe(navigation,active);
  const liga=(item,sub=false)=>{const a=document.createElement('a');a.href=destinoAcademias(navigation,item);a.className=`tos-nav-item${sub?' tos-nav-sub':''} ${itemActive(item,active)||(!sub&&sec?.code===item.code)?'active':''}`;a.dataset.module=item.code;a.innerHTML=`<span class="tos-nav-icon">${shellIcon(item.icon)}</span><span>${item.label}</span>`;a.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));return a;};
  // Cada sección con sus pantallas debajo, sólo la sección donde estás.
  const pinta=(section,item)=>{section.appendChild(liga(item));if(sec?.code===item.code)hijosDe(navigation,item).forEach(h=>section.appendChild(liga(h,true)));};
  const simple=SIMPLE_SIDEBAR_ROLES[role];
  if(simple){
    const exclude=new Set(simple.exclude||[]);
    const section=document.createElement('div');section.className='tos-nav-section tos-nav-section-simple';
    navItems.filter(item=>itemEnMenu(navigation,item,exclude)&&!exclude.has(item.code)).forEach(item=>pinta(section,item));
    nav.appendChild(section);
    return;
  }
  ['main','club','finance','ops','admin'].forEach(group=>{
    const items=navItems.filter(item=>item.group===group&&itemEnMenu(navigation,item));if(!items.length)return;
    const section=document.createElement('div');section.className=`tos-nav-section tos-nav-section-${group}`;
    if(groupLabels[group]){const title=document.createElement('div');title.className='tos-nav-section-label';title.textContent=groupLabels[group];section.appendChild(title);}
    items.forEach(item=>pinta(section,item));
    nav.appendChild(section);
  });
}
// Pestañas de la sección arriba de la pantalla (Jugadores · Asistencia · Becas).
// La Tienda trae las suyas (con Nuevo pedido), así que ahí no se ponen.
function pintaPestanasSeccion(navigation,active){
  document.getElementById('tosSeccion')?.remove();
  const miembros=seccionVisible(navigation,active);
  if(!miembros.length||document.querySelector('.tienda-tabs'))return;
  const destino=document.querySelector('.tos-main>.tos-content')||document.querySelector('main.tos-content')||document.querySelector('main .app-wrap');if(!destino)return;
  const nav=document.createElement('nav');nav.id='tosSeccion';nav.className='tos-seccion';nav.setAttribute('aria-label',miembros[0].label);
  nav.innerHTML=miembros.map(it=>`<a href="${destinoAcademias(navigation,it)}"${itemActive(it,active)?' aria-current="page"':''}>${it.code==='inicio'?'Resumen':it.label}</a>`).join('');
  destino.prepend(nav);
}
function wireMobileNav(){if(document.documentElement.dataset.tosMobileNavWired==='1')return;document.documentElement.dataset.tosMobileNavWired='1';$('shellMenuToggle')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));$('shellNavBackdrop')?.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));}
function wireRouteMemory(){if(document.documentElement.dataset.tosRouteMemoryWired==='1')return;document.documentElement.dataset.tosRouteMemoryWired='1';document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented||link.target==='_blank')return;try{const target=new URL(link.href,location.origin),here=new URL(location.href);if(target.origin!==location.origin||target.pathname===here.pathname&&target.search===here.search)return;sessionStorage.setItem(`tos:return:${target.pathname}`,here.pathname+here.search+here.hash);}catch{}},{capture:true});}
function wireSearch(navigation,ctx){
  const input=$('shellSearch'),results=$('shellSearchResults');
  if(!input||!results||input.dataset.tosSearchWired==='1')return;
  input.dataset.tosSearchWired='1';
  // Un solo texto en todas las pantallas (había seis, y varias prometían
  // "categoría, evento" que no funcionaba). Y lo que necesita un lector de
  // pantalla para saber que es un buscador con lista de resultados.
  input.placeholder='Busca un Tanner, papá o acción';
  input.setAttribute('aria-label','Buscar en TannerOS: Tanners, papás, teléfonos, categorías, pantallas o acciones');
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','shellSearchResults');
  results.setAttribute('role','listbox');results.setAttribute('aria-label','Resultados de la búsqueda');
  let estado=$('shellSearchEstado');
  if(!estado){estado=document.createElement('span');estado.id='shellSearchEstado';estado.className='tos-sr';estado.setAttribute('aria-live','polite');results.after(estado);}
  const anuncia=t=>{if(estado.textContent!==t)estado.textContent=t;};

  // El indice se arma una sola vez y solo cuando alguien toca el buscador.
  // Antes se pedia en CADA carga de pagina aunque nadie lo usara.
  let indice=null,cargando=false,promesa=null,resaltado=-1,ultimoResultado=null;
  const modulos=()=>desdeModulos(navItems.filter(item=>itemReadable(navigation,item)));
  const acciones=()=>desdeAcciones(accionesBuscables(ctx,navigation));
  const base0=()=>armaIndice([acciones(),modulos()]);
  // Lo que la persona abrió desde aquí. sessionStorage y con el prefijo del
  // buscador: se va al cerrar la pestaña o al salir (trae nombres de familias).
  const llaveRec=llaveDeRecientes(ctx?.organization_id,ctx?.user_id);
  const leeRecientes=()=>{try{return JSON.parse(sessionStorage.getItem(llaveRec)||'[]')||[];}catch(e){return [];}};
  const guardaReciente=f=>{try{sessionStorage.setItem(llaveRec,JSON.stringify(agregaReciente(leeRecientes(),f)));}catch(e){/* modo privado */}};
  let filasVacio=[];

  const ensureIndex=()=>{
    if(promesa)return promesa;
    cargando=true;pinta();
    promesa=cargaIndiceUniversal(ctx,navigation).then(filas=>{
      indice=armaIndice([acciones(),filas,modulos()]);cargando=false;pinta();
    }).catch(()=>{indice=base0();cargando=false;pinta();});
    return promesa;
  };

  const cerrar=()=>{results.classList.add('hidden');results.innerHTML='';resaltado=-1;filasVacio=[];input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
  const abre=()=>{results.classList.remove('hidden');input.setAttribute('aria-expanded','true');};
  const marcaActiva=()=>{const a=results.querySelector('.tos-res.activa');if(a){input.setAttribute('aria-activedescendant',a.id);a.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');};
  // Sin escribir nada: lo reciente y lo que se suele hacer en esta pantalla.
  const pintaVacio=()=>{
    const rec=leeRecientes();
    const sug=[...accionesDeEstaPantalla(ctx,navigation),...accionesRapidas(ctx,navigation)].filter(a=>a.href&&!a.href.startsWith('#')||a.clic)
      .slice(0,3).map(a=>({tipo:'accion',titulo:a.label,subtitulo:a.sub||'Acción',href:a.clic?`${rutaSinV2().replace(/\/$/,'')}/?accion=${encodeURIComponent(a.clave)}`:a.href}));
    filasVacio=[...rec,...sug];
    if(!filasVacio.length){cerrar();return;}
    let i=0;
    const f=x=>{const idx=i++;return `<a class="tos-res${idx===resaltado?' activa':''}" id="tosRes${idx}" role="option" aria-selected="${idx===resaltado}" href="${escBell(x.href)}" data-i="${idx}"><span class="tos-res-ico" data-tipo="${escBell(x.tipo)}" aria-hidden="true"></span><span class="tos-res-txt"><strong>${escBell(x.titulo)}</strong><small>${escBell(x.subtitulo||'')}</small></span></a>`;};
    results.innerHTML=(rec.length?`<div class="tos-res-grupo" role="group" aria-label="Recientes"><div class="tos-res-titulo">Recientes</div>${rec.map(f).join('')}</div>`:'')
      +(sug.length?`<div class="tos-res-grupo" role="group" aria-label="Sugerencias"><div class="tos-res-titulo">Para hacer aquí</div>${sug.map(f).join('')}</div>`:'');
    abre();marcaActiva();anuncia(rec.length?`${rec.length} recientes`:'Sugerencias');
  };
  const filasVisibles=()=>String(input.value||'').trim()?filasEnOrden(ultimoResultado):filasVacio;

  const pinta=()=>{
    const q=String(input.value||'').trim();
    if(!q){if(document.activeElement===input)pintaVacio();else cerrar();return;}
    abre();
    // Mientras carga se busca en lo que ya hay (las pantallas), para que el
    // buscador responda desde la primera tecla en vez de quedarse en blanco.
    const base=indice||base0();
    const r=busca(base,q);
    if(r.corta){ultimoResultado=r;results.innerHTML=`<div class="tos-buscando">Escribe al menos ${MIN_LETRAS} letras</div>`;anuncia('Escribe al menos dos letras');return;}
    ultimoResultado=r;
    const filas=filasEnOrden(r);
    if(resaltado>=filas.length)resaltado=filas.length-1;

    if(!filas.length){
      results.innerHTML=cargando
        ?'<div class="tos-buscando">Buscando en todo el club…</div>'
        :`<div class="tos-sin-resultados"><strong>Nada con “${escBell(q)}”</strong><span>Prueba con el nombre de un Tanner o de un papá, un teléfono, una categoría (T10) o lo que quieres hacer (cobrar, gafete).</span></div>`;
      anuncia(cargando?'Buscando':'Sin resultados');
      return;
    }
    let i=0;
    const fila=(f,clase)=>{
      const idx=i++;
      const titulo=trozosResaltados(f.titulo,q)
        .map(t=>t.resaltado?`<mark>${escBell(t.texto)}</mark>`:escBell(t.texto)).join('');
      return `<a class="tos-res ${clase}${idx===resaltado?' activa':''}" id="tosRes${idx}" role="option" aria-selected="${idx===resaltado}" href="${escBell(f.href||'#')}" data-i="${idx}">`
        +`<span class="tos-res-ico" data-tipo="${escBell(f.tipo)}" aria-hidden="true"></span>`
        +`<span class="tos-res-txt"><strong>${titulo}</strong><small>${escBell(f.subtitulo||'')}</small></span></a>`;
    };
    let html='';
    if(r.mejor)html+=`<div class="tos-res-grupo"><div class="tos-res-titulo">Mejor resultado</div>${fila(r.mejor,'destacada')}</div>`;
    for(const sec of r.secciones)
      html+=`<div class="tos-res-grupo"><div class="tos-res-titulo">${escBell(sec.etiqueta)}</div>${sec.filas.map(f=>fila(f,'')).join('')}</div>`;
    if(cargando)html+='<div class="tos-buscando">Buscando en todo el club…</div>';
    // Un resultado incompleto que se ve completo es peor que ninguno: fue lo
    // que escondió durante semanas que el índice de Tanners estaba muerto.
    else if(fuentesDelBuscadorCaidas().length)
      html+=`<div class="tos-buscador-roto">Faltan resultados: ${fuentesDelBuscadorCaidas().length===1?'una parte del buscador no respondió':'varias partes del buscador no respondieron'}. Vuelve a entrar; si sigue igual, avísale a quien lleva el sistema.</div>`;
    results.innerHTML=html;
    marcaActiva();
    anuncia(`${r.total} ${r.total===1?'resultado':'resultados'}`);
  };

  const mover=(paso)=>{
    const filas=filasVisibles();
    if(!filas.length)return;
    resaltado=(resaltado+paso+filas.length+1)%(filas.length+1);
    if(resaltado===filas.length)resaltado=paso>0?0:filas.length-1;
    pinta();
  };

  input.addEventListener('focus',ensureIndex,{once:true});
  input.addEventListener('input',()=>{resaltado=-1;pinta();});
  input.addEventListener('focus',pinta);
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();mover(1);return;}
    if(event.key==='ArrowUp'){event.preventDefault();mover(-1);return;}
    if(event.key==='Escape'){input.value='';cerrar();input.blur();return;}
    if(event.key==='Enter'){
      const filas=filasVisibles();
      const destino=filas[resaltado>=0?resaltado:0];
      if(destino&&destino.href){event.preventDefault();guardaReciente(destino);location.href=destino.href;}
    }
  });
  // Lo que se abre con el dedo o el mouse también queda en Recientes.
  results.addEventListener('click',event=>{
    const a=event.target.closest?.('.tos-res');if(!a)return;
    const f=filasVisibles()[Number(a.dataset.i)];if(f)guardaReciente(f);
  });
  results.addEventListener('pointermove',event=>{
    const a=event.target.closest?.('.tos-res');if(!a)return;
    const idx=Number(a.dataset.i);
    if(idx!==resaltado){resaltado=idx;
      results.querySelectorAll('.tos-res.activa').forEach(el=>el.classList.remove('activa'));
      a.classList.add('activa');}
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.tos-search-wrap'))cerrar();});
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.focus();input.select();}
  });

  /* Se puede llegar buscando algo: /v2/?buscar=TC-2026-00020
   *
   * Es lo que hace que el QR de la credencial Tanner sirva de verdad. Sin
   * esto, escanear el codigo abre TannerOS en la pantalla de inicio y quien
   * esta en la porteria con la familia enfrente tiene que teclear el folio a
   * mano, que es justo lo que el codigo venia a evitar.
   *
   * Tambien sirve para cualquier liga que se mande por WhatsApp al staff.
   * Se carga el indice y se pinta: si hay un solo resultado, ahi esta. */
  try{
    const buscado=new URLSearchParams(location.search).get('buscar');
    if(buscado&&buscado.trim()){
      input.value=buscado.trim();
      ensureIndex().then(pinta);
      pinta();
      // Sin robarle el foco en un telefono: abrir el teclado encima de los
      // resultados los tapa justo cuando acaban de aparecer.
      if(!matchMedia('(pointer:coarse)').matches)input.focus();
    }
  }catch{}
}

// Pide en paralelo solo las fuentes que esta persona puede ver: cada RPC valida
// permisos por su cuenta, asi que un profe indexa unicamente lo suyo. Una sola
// vez por carga, y nada mas si el buscador se usa.
// Qué fuentes del buscador no respondieron en la última carga. Vive fuera de
// la función porque quien pinta los resultados está en otro lado y tiene que
// poder decirlo.
let fuentesCaidas=[];
export function fuentesDelBuscadorCaidas(){ return fuentesCaidas.slice(); }

async function cargaIndiceUniversal(ctx,navigation){
  if(!ctx||!ctx.organization_id)return [];
  const llave=llaveDeCache(ctx.organization_id,ctx.user_id);
  // Una pestana abierta toda la tarde arma el indice una sola vez.
  try{
    const crudo=sessionStorage.getItem(llave);
    // Un índice cacheado se sirve como bueno: si la vez pasada falló una
    // fuente, el aviso se perdería. Se guarda junto con las filas.
    if(crudo){const guardado=JSON.parse(crudo);if(cacheVigente(guardado,Date.now(),ctx.user_id)){fuentesCaidas=guardado.caidas||[];return guardado.filas;}}
  }catch(e){/* modo privado o storage lleno: se pide y ya */}

  const permitidas=FUENTES.filter(f=>!f.modulo||navItems.some(item=>item.code===f.modulo&&itemReadable(navigation,item)));
  /* Una fuente caída no deja sin buscador a las demás — pero tampoco se calla.

     Este catch devolvía [] en silencio, y por eso nadie notó durante semanas
     que v2_search_index tronaba con "column reference organization_id is
     ambiguous": el buscador seguía viéndose completo mientras la fuente MÁS
     importante estaba muerta. Buscar un Tanner devolvía su ficha vieja de
     prospecto, porque el Tanner no competía con nadie.

     Se conserva la resiliencia y se pierde el silencio: lo que no se pudo
     traer se anota y la pantalla lo dice. */
  const caidas=[];
  const partes=await Promise.all(permitidas.map(async f=>{
    try{
      const data=await rpc(f.rpc,{organization_id:ctx.organization_id});
      return f.convierte(data||[]);
    }catch(e){
      caidas.push(f.rpc);
      console.error(`buscador: la fuente ${f.rpc} no respondió`,e);
      return [];
    }
  }));
  fuentesCaidas=caidas;
  const filas=partes.flat();
  try{sessionStorage.setItem(llave,JSON.stringify(empaquetaCache(filas,Date.now(),caidas,ctx.user_id)));}catch(e){/* sin cache, funciona igual */}
  return filas;
}

function ensureBackButton(){
  const topLeft=document.querySelector('.tos-topbar .tos-top-left');if(!topLeft)return;topLeft.querySelector('.tos-back-button')?.remove();const root=location.pathname==='/'||location.pathname==='/v2'||location.pathname==='/v2/';if(root)return;
  const button=document.createElement('button');button.type='button';button.className='tos-back-button';button.setAttribute('aria-label','Volver');button.textContent='‹';button.addEventListener('click',()=>{try{const key=`tos:return:${location.pathname}`,saved=sessionStorage.getItem(key),ref=document.referrer?new URL(document.referrer):null;if(saved&&saved.startsWith('/')&&saved!==location.pathname+location.search+location.hash){sessionStorage.removeItem(key);if(ref?.origin===location.origin&&ref.pathname+ref.search+ref.hash===saved&&history.length>1){history.back();return;}location.href=saved;return;}if(ref?.origin===location.origin&&ref.pathname!==location.pathname&&history.length>1){history.back();return;}}catch{}const clubRoutes=['/jugadores/','/asistencia/','/convocatoria/','/operacion/academias/','/prospectos/','/scouting/'];location.href=clubRoutes.some(path=>location.pathname.startsWith(path))?'/club/':'/';});topLeft.prepend(button);
}
/* ===== Acciones rápidas: botón flotante en todas las pantallas =====
   Cada rol trae a la mano lo que más repite (pedido de Presidencia,
   05/10/2026). Una acción sólo aparece si la persona tiene el permiso que la
   pantalla de destino pide: el botón nunca lleva a un "Sin acceso".
   No se pinta donde la pantalla ya es esa acción en grande (Taquilla,
   Estacionamiento, levantar pedido), ni para cuentas de familia. */
const ACCIONES_RAPIDAS={
  registrar:{label:'Registrar jugador',sub:'Formulario de nuevo ingreso',href:'/registro/jugadores/',publica:true,icon:'userPlus',modulos:['prospectos','jugadores'],escribe:true},
  captacion:{label:'Fichajes',sub:'Los que quieren entrar al club',href:'/prospectos/',icon:'target',modulos:['prospectos']},
  cobrar:{label:'Cobrar',sub:'Entra dinero al club',href:'/taquilla/?action=cobrar',icon:'moneyIn',modulos:['taquilla','cobranza'],escribe:true},
  pagar:{label:'Pagar',sub:'Sale dinero del club',href:'/taquilla/?action=pagar',icon:'moneyOut',modulos:['taquilla','contabilidad'],escribe:true},
  tienda:{label:'Tienda',sub:'Nuevo pedido y entregas',href:'/pedidos/',icon:'bag',modulos:['tienda'],escribe:true},
  gafete:{label:'Gafete de estacionamiento',sub:'Agregar, cobrar y entregar',href:'/estacionamiento/?nuevo=1',icon:'car',modulos:['estacionamiento'],escribe:true},
  conciliar:{label:'Por conciliar',sub:'Cobros por validar',href:'/taquilla/?ver=concilia',icon:'check',modulos:['taquilla','contabilidad']},
  caja:{label:'Caja del día',sub:'Movimientos y corte',href:'/taquilla/?ver=caja',icon:'ledger',modulos:['taquilla','contabilidad']},
  asistencia:{label:'Pasar asistencia',sub:'Lista del entrenamiento',href:'/asistencia/',icon:'check',modulos:['asistencia'],escribe:true},
  convocatoria:{label:'Partido',sub:'Convocados, goles y quién jugó',href:'/partidos/',icon:'list',modulos:['convocatoria','callups']},
  miAcademia:{label:'Tomar asistencia',sub:'Mi academia',href:'/mi-academia/',icon:'check',siempre:true},
  scouting:{label:'Scouting',sub:'Visorías y prospectos',href:'/scouting/',icon:'search',modulos:['scouting']},
  mensaje:{label:'Mensaje',sub:'Escribir al equipo',href:'/mensajes/',icon:'chat',siempre:true},
  // Cualquiera del club cotiza a una familia nueva (21/10/2026): los precios
  // de Costos son de Tannery, así que en otro club no sale.
  cotizar:{label:'Cotizar',sub:'Cuánto paga una familia nueva',href:'/costos/?para=familia',icon:'wallet',siempre:true,soloTannery:true}
};
const ACCIONES_POR_ROL={
  Presidencia:['registrar','captacion','cobrar','pagar','tienda','gafete','cotizar'],
  Operaciones:['registrar','cobrar','pagar','gafete','tienda','captacion','mensaje','cotizar'],
  Contabilidad:['cobrar','pagar','conciliar','caja','cotizar'],
  Taquilla:['cobrar','pagar','gafete','tienda','cotizar'],
  Formadores:['asistencia','convocatoria','mensaje','cotizar'],
  Academia:['miAcademia','mensaje','cotizar'],
  Scouting:['registrar','scouting','captacion','cotizar']
};
// Estacionamiento ya tiene botón (19/10/2026): Nuevo gafete y Pendientes.
const RUTAS_SIN_BOTON=['/taquilla','/captura','/v2/captura','/v2/taquilla'];
export function accionesRapidas(ctx,navigation){
  const rol=ctx?.is_owner?'Presidencia':ctx?.role;
  // El registro es página pública: su liga lleva el club de quien la abre.
  return (ACCIONES_POR_ROL[rol]||[]).map(k=>({clave:k,...ACCIONES_RAPIDAS[k]})).map(a=>a.publica?{...a,href:ligaPublica(a.href,ctx,{},'')}:a).filter(a=>a.siempre||a.modulos.some(m=>moduleAccess(navigation,m,Boolean(a.escribe))))
    .filter(a=>!a.soloTannery||!ctx?.organization_slug||ctx.organization_slug==='tannery-city-fc');
}
function cierraAcciones(){document.body.classList.remove('tos-fab-open');$('tosFab')?.setAttribute('aria-expanded','false');}
/* Lo de ESTA pantalla primero (13/10/2026): "que tenga dos, tres funciones de
   esa pantalla y ya después las generales". Cada pantalla publica sus
   acciones con setAccionesDePantalla([...]) —o window.tosAccionesDePantalla y
   el evento 'tos:acciones'— porque branding-auto carga el shell con otra URL y
   un import directo sería otra copia del módulo. Una acción trae label, sub,
   icon y href o run (una función de la pantalla). Las pantallas que no
   publican nada usan las de ACCIONES_POR_RUTA. */
/* Acciones por pantalla (19/10/2026, elegidas una por una con Presidencia).
   `clic` presiona el botón real de la pantalla; `href` lleva a otra. Cada una
   pide el permiso de la pantalla que toca (`modulos`, `escribe`), así que el
   botón nunca enseña algo que la persona no puede hacer.
   Desde el buscador, una acción con `clic` se abre como <ruta>?accion=<clave>:
   sólo se ejecutan claves de esta lista, así que una liga no puede presionar
   cualquier botón (Eliminar, por ejemplo). */
const TAQ={modulos:['taquilla','contabilidad'],escribe:true};
const ACCIONES_POR_RUTA=[
  ['/catalogo',[{clave:'nuevo-producto',label:'Nuevo producto',sub:'Foto, nombre, precio y tallas',href:'/catalogo/?nuevo=producto',icon:'plus',claves:['producto','alta']},{clave:'nuevo-kit',label:'Nuevo kit',sub:'Junta piezas con su precio',href:'/catalogo/?nuevo=kit',icon:'bag',claves:['kit','paquete']}]],
  ['/pedidos',[{clave:'nuevo-pedido',label:'Nuevo pedido',sub:'Levantarlo en el mostrador',href:'/captura/',icon:'bag',claves:['venta','vender','uniforme']},{clave:'produccion',label:'Producción',sub:'Cortes y hoja para el proveedor',href:'/produccion/',icon:'list',claves:['proveedor','corte']}]],
  ['/calendario',[{clave:'nuevo-evento',label:'Nuevo evento',sub:'Partido, torneo o junta',href:'/calendario/?action=evento',icon:'plus',claves:['evento','junta','torneo']}]],
  ['/candidatos',[{clave:'compartir-convocatoria',label:'Compartir la convocatoria',sub:'Liga y QR para el flyer',href:'#candLiga',icon:'chat'}]],
  ['/encuestas',[{clave:'nueva-encuesta',label:'Nueva encuesta',sub:'Liga y QR para el evento',href:'/encuestas/?nueva=1',icon:'chat',claves:['encuesta','opinion']}]],
  ['/jugadores',[{clave:'registrar',label:'Registrar jugador',sub:'Formulario de nuevo ingreso',href:'/registro/jugadores/',publica:true,icon:'userPlus',modulos:['prospectos','jugadores'],escribe:true,claves:['alta','inscribir','nuevo jugador','nuevo tanner']}]],
  ['/asistencia',[{clave:'pasar-lista',label:'Pasar lista de hoy',sub:'El entrenamiento de hoy',clic:'#tabCapture',icon:'check',modulos:['asistencia'],escribe:true,claves:['lista','asistencia','tomar lista']}]],
  ['/partidos',[{clave:'nuevo-partido',label:'Nuevo partido',sub:'Rival, fecha y convocados',clic:'#ptNuevo',icon:'plus',claves:['partido','convocatoria','juego']},{clave:'registrar-resultado',label:'Registrar resultado',sub:'El próximo partido: goles y quién jugó',clic:'#ptProximos .pt-partido-fila',icon:'list',claves:['resultado','marcador','goles']}]],
  ['/contabilidad',[{clave:'cobrar',label:'Cobrar',sub:'Entra dinero al club',href:'/taquilla/?action=cobrar',icon:'moneyIn',...TAQ,claves:['cobro','pago','mensualidad']},{clave:'gasto',label:'Registrar gasto',sub:'Sale dinero del club',href:'/taquilla/?action=pagar',icon:'moneyOut',...TAQ,claves:['gasto','egreso','pagar']},{clave:'conciliar',label:'Por conciliar',sub:'Cobros por validar',href:'/taquilla/?ver=concilia',icon:'check',modulos:['taquilla','contabilidad'],claves:['conciliar','transferencias','comprobantes']},{clave:'corte',label:'Corte del día',sub:'Caja: movimientos y corte',href:'/taquilla/?ver=caja',icon:'ledger',modulos:['taquilla','contabilidad'],claves:['corte','caja']}]],
  ['/prospectos',[{clave:'nuevo-prospecto',label:'Nuevo prospecto',sub:'Formulario de nuevo ingreso',href:'/registro/jugadores/',publica:true,icon:'userPlus',modulos:['prospectos'],claves:['prospecto','fichaje','registro']}]],
  ['/usuarios',[{clave:'invitar-staff',label:'Invitar usuario del staff',sub:'Darle su llave y su rol',clic:'#openCreateUser',icon:'userPlus',modulos:['usuarios'],escribe:true,claves:['usuario','staff','acceso','alta']},{clave:'invitar-familias',label:'Invitar a las familias que faltan',sub:'Por WhatsApp, una por una',href:'/invitaciones/?accion=invitar-familias',icon:'chat',modulos:['usuarios'],escribe:true,claves:['invitar','familias','portal']},{clave:'liga-contrasena',label:'Mandar liga de contraseña',sub:'Para una familia que la olvidó',href:'/invitaciones/?accion=liga-contrasena',icon:'chat',modulos:['usuarios'],escribe:true,claves:['contrasena','olvido','password']}]],
  ['/invitaciones',[{clave:'invitar-familias',label:'Invitar a las familias que faltan',sub:'Por WhatsApp, una por una',clic:'#invRapido',icon:'chat',modulos:['usuarios'],escribe:true,claves:['invitar','familias','portal']},{clave:'liga-contrasena',label:'Mandar liga de contraseña',sub:'Familias que ya tienen cuenta',clic:'[data-filtro="cuenta"]',icon:'chat',modulos:['usuarios'],escribe:true,claves:['contrasena','olvido','password']},{clave:'invitar-staff',label:'Invitar usuario del staff',sub:'Darle su llave y su rol',href:'/usuarios/?accion=invitar-staff',icon:'userPlus',modulos:['usuarios'],escribe:true,claves:['usuario','staff','acceso']}]],
  ['/becas',[{clave:'solicitudes-beca',label:'Solicitudes por revisar',sub:'Las que pidieron las familias',clic:'[data-ir="solicitudes"]',icon:'check',modulos:['becas'],claves:['beca','solicitud','apoyo']}]],
  ['/patrocinadores',[{clave:'nuevo-patrocinador',label:'Nuevo patrocinador',sub:'Dar de alta una marca',clic:'#newSponsorButton',icon:'plus',modulos:['patrocinadores'],escribe:true,claves:['marca','sponsor','patrocinio']}]],
  // Mensajes publica estas mismas claves con su propia función (abre el aviso
  // con el destinatario ya elegido); aquí se declaran para que se puedan buscar.
  ['/mensajes',[{clave:'aviso-familias',label:'Aviso a todas las familias',sub:'Les llega al portal y al celular',enPantalla:true,icon:'chat',claves:['aviso','familias','comunicado','papas']},{clave:'aviso-categoria',label:'Aviso a una categoría',sub:'Sólo a las familias de esa categoría',enPantalla:true,icon:'chat',claves:['aviso','categoria','equipo']},{clave:'mensaje-staff',label:'Mensaje al staff',sub:'Un chat con alguien del club',enPantalla:true,icon:'chat',claves:['chat','mensaje','staff','equipo']}]],
  ['/estacionamiento',[{clave:'nuevo-gafete',label:'Nuevo gafete',sub:'Agregar, cobrar y entregar',clic:'#pkNuevo',icon:'car',modulos:['estacionamiento'],escribe:true,claves:['gafete','placas','estacionamiento']},{clave:'gafetes-pendientes',label:'Gafetes pendientes',sub:'Lo que pidieron desde el portal',clic:'[data-tab="pendientes"]',icon:'list',modulos:['estacionamiento'],claves:['pendientes','solicitudes']}]]
];
// Finanzas comparte las de Contabilidad.
ACCIONES_POR_RUTA.push(['/finanzas',ACCIONES_POR_RUTA.find(([r])=>r==='/contabilidad')[1]]);
export function setAccionesDePantalla(lista){window.tosAccionesDePantalla=Array.isArray(lista)?lista:[];window.dispatchEvent(new Event('tos:acciones'));}
const rutaSinV2=(p=location.pathname)=>p.replace(/^\/v2/,'');
const accionesDeRuta=ruta=>(ACCIONES_POR_RUTA.find(([r])=>ruta===r||ruta.startsWith(r+'/'))||[])[1]||[];
const puedeAccion=(a,navigation)=>!a.modulos||a.modulos.some(m=>moduleAccess(navigation,m,Boolean(a.escribe)));
// Un `clic` sólo se ofrece si el botón está en pantalla y visible: si la
// pantalla lo escondió (sin permiso, sin partidos próximos), no se promete.
function botonVisible(sel){try{const el=document.querySelector(sel);return !!el&&!el.disabled&&!el.closest('.hidden,[hidden]')&&el.getClientRects().length>0;}catch(e){return false;}}
const conLiga=(a,ctx)=>a.publica?{...a,href:ligaPublica(a.href,ctx,{},'')}:a;
function accionesDeEstaPantalla(ctx,navigation){
  if(Array.isArray(window.tosAccionesDePantalla))return window.tosAccionesDePantalla;
  return accionesDeRuta(rutaSinV2()).filter(a=>!a.enPantalla).filter(a=>puedeAccion(a,navigation)).filter(a=>!a.clic||botonVisible(a.clic)).map(a=>conLiga(a,ctx));
}
function ejecutaAccion(a){
  if(typeof a?.run==='function'){a.run();return true;}
  if(a?.clic){const el=document.querySelector(a.clic);if(el){el.click();el.scrollIntoView?.({block:'nearest',behavior:'smooth'});return true;}}
  return false;
}
// Todas las acciones que esta persona puede hacer, para el buscador: las de
// cada pantalla que puede abrir y las generales. Las de `clic` abren la
// pantalla con ?accion=<clave>.
export function accionesBuscables(ctx,navigation){
  const vistas=new Set(),fuera=[];
  const legible=ruta=>navItems.some(item=>(item.href||'').replace(/\/$/,'')===ruta&&itemReadable(navigation,item));
  for(const [ruta,lista] of ACCIONES_POR_RUTA){
    if(!legible(ruta))continue;
    const pantalla=navItems.find(item=>(item.href||'').replace(/\/$/,'')===ruta)?.label||'';
    for(const a of lista){
      if(!puedeAccion(a,navigation))continue;
      const href=a.clic||a.enPantalla?`${ruta}/?accion=${encodeURIComponent(a.clave)}`:conLiga(a,ctx).href;
      if(!href||href.startsWith('#')||vistas.has(a.label+href))continue;
      vistas.add(a.label+href);fuera.push({...a,href,pantalla});
    }
  }
  for(const [clave,a] of Object.entries(ACCIONES_RAPIDAS)){
    if(!(a.siempre||a.modulos.some(m=>moduleAccess(navigation,m,Boolean(a.escribe)))))continue;
    const x=conLiga({clave,...a},ctx);
    if(fuera.some(f=>f.label===x.label))continue;
    fuera.push({...x,pantalla:'Acción rápida'});
  }
  return fuera;
}
// /taquilla/?accion=... no aplica (Taquilla tiene sus propios parámetros):
// esto sólo corre claves de ACCIONES_POR_RUTA o de setAccionesDePantalla.
function accionDeLiga(ctx,navigation){
  let clave=null;
  try{const u=new URL(location.href);clave=u.searchParams.get('accion');if(!clave)return;
    u.searchParams.delete('accion');history.replaceState(null,'',u.pathname+u.search+u.hash);}catch(e){return;}
  const inicio=Date.now();
  const intenta=()=>{
    const a=accionesDeEstaPantalla(ctx,navigation).find(x=>x.clave===clave);
    if(a&&ejecutaAccion(a))return;
    if(Date.now()-inicio<8000)setTimeout(intenta,250);
  };
  intenta();
}
function pintaMenuFab(menu,ctx,navigation){
  const aqui=accionesDeEstaPantalla(ctx,navigation),dest=new Set(aqui.map(a=>a.href).filter(Boolean));
  const generales=accionesRapidas(ctx,navigation).filter(a=>!dest.has(a.href)&&location.pathname.replace(/^\/v2/,'')!==a.href.split('?')[0]);
  const item=(a,k,tipo)=>`<a class="tos-fab-item${tipo==='aqui'?' aqui':''}" href="${escBell(a.href||'#')}" data-accion="${escBell(a.clave||`${tipo}-${k}`)}"${tipo==='aqui'&&(a.run||a.clic)?` data-run="${k}"`:''}><span class="tos-fab-ico">${shellIcon(a.icon||'plus')}</span><span><strong>${escBell(a.label)}</strong>${a.sub?`<small>${escBell(a.sub)}</small>`:''}</span></a>`;
  menu.innerHTML=`<div class="tos-fab-grab" aria-hidden="true"></div>`
    +(aqui.length?`<p class="tos-fab-title">En esta pantalla</p>${aqui.map((a,k)=>item(a,k,'aqui')).join('')}`:'')
    +(generales.length?`<p class="tos-fab-title${aqui.length?' sep':''}">${aqui.length?'Generales':'Acciones rápidas'}</p>${generales.map((a,k)=>item(a,k,'gen')).join('')}`:'');
  return aqui.length+generales.length;
}
function ensureQuickFab(ctx,navigation){
  $('tosFab')?.remove();$('tosFabMenu')?.remove();$('tosFabBackdrop')?.remove();
  if(RUTAS_SIN_BOTON.some(r=>location.pathname===r||location.pathname.startsWith(r+'/')))return;
  const fondo=document.createElement('div');fondo.id='tosFabBackdrop';fondo.className='tos-fab-backdrop';
  const menu=document.createElement('nav');menu.id='tosFabMenu';menu.className='tos-fab-menu';menu.setAttribute('aria-label','Acciones rápidas');
  const boton=document.createElement('button');boton.id='tosFab';boton.type='button';boton.className='tos-fab';boton.setAttribute('aria-label','Acciones rápidas');boton.setAttribute('aria-expanded','false');boton.setAttribute('aria-controls','tosFabMenu');boton.innerHTML=shellIcon('plus');
  const repinta=()=>{const n=pintaMenuFab(menu,ctx,navigation);boton.hidden=!n;if(!n)cierraAcciones();};
  boton.addEventListener('click',()=>{repinta();const abierto=document.body.classList.toggle('tos-fab-open');boton.setAttribute('aria-expanded',String(abierto));if(abierto)menu.querySelector('a')?.focus({preventScroll:true});});
  fondo.addEventListener('click',cierraAcciones);
  menu.addEventListener('click',e=>{
    const a=e.target.closest('a');if(!a)return;
    const k=a.dataset.run;
    if(k!=null){e.preventDefault();cierraAcciones();try{ejecutaAccion(accionesDeEstaPantalla(ctx,navigation)[Number(k)]);}catch(err){console.error(err);}return;}
    cierraAcciones();
  });
  if(!document.documentElement.dataset.tosFabKeys){document.documentElement.dataset.tosFabKeys='1';document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('tos-fab-open')){cierraAcciones();$('tosFab')?.focus();}});}
  window.addEventListener('tos:acciones',repinta);
  repinta();
  // Los botones de la pantalla aparecen cuando la pantalla termina de cargar:
  // se vuelve a contar para no esconder el botón por llegar antes que ellos.
  setTimeout(repinta,1200);
  document.body.append(fondo,menu,boton);
}
export function renderShell({ctx,navigation,active='inicio',title='Inicio',searchItems=[]}){
  ensureProductionCss();window.__tosNavigation=navigation||[];window.__tosExperienceNavigation=navigation||[];window.__tosExperienceContext=ctx||null;
  const role=ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro'),display=ctx?.display_name||'Tanner';
  renderNavigation($('sidebarNav'),navigation,active,role);pintaPestanasSeccion(navigation,active);if($('sidebarName'))$('sidebarName').textContent=display;if($('sidebarRole'))$('sidebarRole').textContent=role;if($('shellTitle'))$('shellTitle').textContent=title;if($('shellRole'))$('shellRole').textContent=role;if($('shellOrg'))$('shellOrg').textContent=ctx?.organization_name||'el club';setShellSearchItems(searchItems);wireMobileNav();wireRouteMemory();wireSearch(navigation,ctx);ensureBackButton();if($('shellSignOut')&&!$('shellSignOut').dataset.tosWired){$('shellSignOut').dataset.tosWired='1';$('shellSignOut').addEventListener('click',async()=>{borraCacheDelBuscador();await clearPhotoCache();await supabase.auth.signOut();location.href='/';});}
  if(ctx){ensureBellMarkup();wireBell(ctx,navigation);ensureQuickFab(ctx,navigation);accionDeLiga(ctx,navigation);}
}
// Solo lectura (j4–n4): el club debe su mensualidad o es una demo. La base ya
// no deja guardar; aquí sólo se avisa arriba de cada pantalla, sin esperar.
const SOLO_LECTURA={pago:'Tu club está en solo lectura por un pago pendiente de la mensualidad. Puedes ver todo; para guardar cambios, que Presidencia registre el pago.',demo:'Estás en una demo: puedes ver todo, pero los cambios no se guardan.'};
export function avisoSoloLectura(organizationId){
  rpc('v2_my_access_mode',{organization_id:organizationId}).then(m=>{
    if(m?.mode!=='solo_lectura'||document.getElementById('tosSoloLectura'))return;
    const main=document.querySelector('.tos-content');if(!main)return;
    const d=document.createElement('div');d.id='tosSoloLectura';d.className='tos-solo-lectura';d.dataset.reason=m.reason||'';d.setAttribute('role','status');
    d.textContent=SOLO_LECTURA[m.reason]||SOLO_LECTURA.pago;main.prepend(d);
  }).catch(()=>{});
}
export async function bootstrapProtectedShell({active,title}){ensureProductionCss();const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return null;}const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return null;}const ctx=rows[0],navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});if(active!=='inicio'&&active!=='mensajes'&&active!=='staff'&&!puedeEntrar(navigation,active)){location.href='/';return null;}renderShell({ctx,navigation,active,title});avisoSoloLectura(ctx.organization_id);return {ctx,navigation,map:navigationMap(navigation)};}
export function setShellHealth({state='ok',label='Todo en orden'}={}){const pill=$('shellHealth');if(!pill)return;pill.dataset.state=state;const text=pill.querySelector('span');if(text)text.textContent=label;}
