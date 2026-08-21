import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

export const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
export const $=id=>document.getElementById(id);

export const navItems=[
  {code:'inicio',label:'Inicio',href:'/',group:'main'},
  {code:'club',label:'Club',href:'/club/',group:'main'},
  {code:'direccion',label:'Dirección',href:'/direccion/',group:'main'},
  {code:'finanzas',label:'Finanzas',href:'/finanzas/',group:'main',aliases:['cobranza','contabilidad']},
  {code:'taquilla',label:'Taquilla',href:'/taquilla/',group:'finance'},
  {code:'jugadores',label:'Jugadores',href:'/jugadores/',group:'club'},
  {code:'asistencia',label:'Asistencia',href:'/asistencia/',group:'club'},
  {code:'convocatoria',label:'Convocatoria',href:'/convocatoria/',group:'club',aliases:['callups']},
  {code:'calendario',label:'Calendario',href:'/calendario/',group:'club'},
  {code:'academias',label:'Academias',href:'/academias/',group:'club'},
  {code:'prospectos',label:'Captación',href:'/prospectos/',group:'club'},
  {code:'scouting',label:'Scouting',href:'/scouting/',group:'club'},
  {code:'cursosVerano',label:'Programas y eventos',href:'/operacion/programas/',group:'club'},
  {code:'tienda',label:'Pedidos',href:'/pedidos/',group:'ops'},
  {code:'utileria',label:'Utilería',href:'/utileria/',group:'ops'},
  {code:'patrocinadores',label:'Patrocinadores',href:'/patrocinadores/',group:'ops'},
  {code:'contabilidad',label:'Contabilidad',href:'/contabilidad/',group:'finance'},
  {code:'usuarios',label:'Usuarios',href:'/usuarios/',group:'admin'},
  {code:'admin',label:'Administración',href:'/admin/',group:'admin'},
  {code:'qa',label:'QA',href:'/qa/',group:'admin'}
];

const groupLabels={main:'',club:'Club',finance:'Finanzas',ops:'Operación',admin:'Administración'};

export async function rpc(name,params={}){
  const {data,error}=await supabase.rpc(name,params);
  if(error)throw error;
  return data;
}

export function navigationMap(rows=[]){return new Map((rows||[]).map(r=>[r.module_code,r]));}
export function moduleAccess(rows,code,write=false){
  const row=navigationMap(rows).get(code);
  return Boolean(row?.enabled && (write?row.can_write:row.can_read));
}
function itemReadable(rows,item){return [item.code,...(item.aliases||[])].some(code=>moduleAccess(rows,code,false));}
function itemActive(item,active){return item.code===active||(item.aliases||[]).includes(active);}

export function setShellSearchItems(items=[]){
  window.__tosSearchExtras=Array.isArray(items)?items:[];
}

function renderNavigation(nav,navigation,active){
  if(!nav)return;
  nav.innerHTML='';
  ['main','club','finance','ops','admin'].forEach(group=>{
    const items=navItems.filter(item=>item.group===group&&itemReadable(navigation,item));
    if(!items.length)return;
    const section=document.createElement('div');section.className=`tos-nav-section tos-nav-section-${group}`;
    if(groupLabels[group]){const title=document.createElement('div');title.className='tos-nav-section-label';title.textContent=groupLabels[group];section.appendChild(title);}
    items.forEach(item=>{
      const a=document.createElement('a');a.href=item.href;a.className=`tos-nav-item ${itemActive(item,active)?'active':''}`;a.dataset.module=item.code;
      a.innerHTML=`<span class="tos-nav-icon" aria-hidden="true">${item.code==='inicio'?'⌂':item.code==='finanzas'?'$':item.code==='taquilla'?'▣':'•'}</span><span>${item.label}</span>`;
      a.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));
      section.appendChild(a);
    });
    nav.appendChild(section);
  });
}

function wireMobileNav(){
  if(document.documentElement.dataset.tosMobileNavWired==='1')return;
  document.documentElement.dataset.tosMobileNavWired='1';
  $('shellMenuToggle')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));
  $('shellNavBackdrop')?.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));
}

function wireSearch(navigation){
  const input=$('shellSearch'),results=$('shellSearchResults');
  if(!input||!results||input.dataset.tosSearchWired==='1')return;
  input.dataset.tosSearchWired='1';
  const close=()=>{results.classList.add('hidden');results.innerHTML='';};
  const run=()=>{
    const q=String(input.value||'').trim().toLocaleLowerCase('es-MX');
    if(!q){close();return;}
    const moduleRows=navItems.filter(item=>itemReadable(navigation,item)&&`${item.label} ${item.code}`.toLocaleLowerCase('es-MX').includes(q)).map(item=>({label:item.label,meta:'Módulo',href:item.href}));
    const extras=(window.__tosSearchExtras||[]).filter(item=>`${item.label||''} ${item.meta||''}`.toLocaleLowerCase('es-MX').includes(q));
    const rows=[...moduleRows,...extras].slice(0,12);
    results.innerHTML=rows.length?rows.map(row=>`<a class="tos-smart-result" href="${row.href||'#'}"><strong>${String(row.label||'Resultado')}</strong><span>${String(row.meta||'')}</span></a>`).join(''):'<div class="tos-empty">Sin resultados.</div>';
    results.classList.remove('hidden');
  };
  input.addEventListener('input',run);input.addEventListener('focus',run);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.tos-search-wrap'))close();});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.focus();}});
}

function ensureBackButton(){
  const topLeft=document.querySelector('.tos-topbar .tos-top-left');
  if(!topLeft)return;
  const root=location.pathname==='/'||location.pathname==='/v2'||location.pathname==='/v2/';
  topLeft.querySelector('.tos-back-button')?.remove();
  if(root)return;
  const button=document.createElement('button');button.type='button';button.className='tos-back-button';button.setAttribute('aria-label','Volver');button.textContent='‹';
  button.addEventListener('click',()=>{if(history.length>1)history.back();else location.href='/';});
  topLeft.prepend(button);
}

export function renderShell({ctx,navigation,active='inicio',title='Inicio',searchItems=[]}){
  window.__tosNavigation=navigation||[];window.__tosExperienceNavigation=navigation||[];window.__tosExperienceContext=ctx||null;
  renderNavigation($('sidebarNav'),navigation,active);
  const role=ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro'),display=ctx?.display_name||'Tanner';
  if($('sidebarName'))$('sidebarName').textContent=display;
  if($('sidebarRole'))$('sidebarRole').textContent=role;
  if($('shellTitle'))$('shellTitle').textContent=title;
  if($('shellRole'))$('shellRole').textContent=role;
  if($('shellOrg'))$('shellOrg').textContent=ctx?.organization_name||'Tannery City';
  setShellSearchItems(searchItems);wireMobileNav();wireSearch(navigation);ensureBackButton();
  if($('shellSignOut')&&!$('shellSignOut').dataset.tosWired){$('shellSignOut').dataset.tosWired='1';$('shellSignOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});}
}

export async function bootstrapProtectedShell({active,title}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/';return null;}
  const rows=await rpc('v2_my_context');if(!rows?.length){location.href='/';return null;}
  const ctx=rows[0],navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});
  if(active!=='inicio'&&!moduleAccess(navigation,active,false)){location.href='/';return null;}
  renderShell({ctx,navigation,active,title});
  return {ctx,navigation,map:navigationMap(navigation)};
}

export function setShellHealth({state='ok',label='Todo en orden'}={}){
  const pill=$('shellHealth');if(!pill)return;pill.dataset.state=state;const text=pill.querySelector('span');if(text)text.textContent=label;
}
