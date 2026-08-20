import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

export const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
export const $=id=>document.getElementById(id);

export async function rpc(name,params={}){
  const {data,error}=await supabase.rpc(name,params);
  if(error)throw error;
  return data;
}

const iconPaths={
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  chart:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 11h5"/><circle cx="16" cy="12.5" r=".7"/>',
  briefcase:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  academy:'<path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/><path d="M21 10v6"/>',
  spark:'<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/><circle cx="12" cy="12" r="3"/>',
  bag:'<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  box:'<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/><path d="M12 13v9"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>'
};

function icon(name){
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]||iconPaths.home}</svg>`;
}

export const navItems=[
  {code:'inicio',label:'Inicio',href:'/v2/',icon:'home'},
  {code:'club',label:'Club',href:'/v2/club/',icon:'shield'},
  {code:'direccion',label:'Dirección',href:'/v2/direccion/',icon:'chart'},
  {code:'finanzas',label:'Finanzas',href:'/v2/finanzas/',icon:'wallet'},
  {code:'patrocinadores',label:'Patrocinadores',href:'/v2/patrocinadores/',icon:'briefcase'},
  {code:'scouting',label:'Scouting',href:'/v2/scouting/',icon:'search'},
  {code:'academias',label:'Academias',href:'/v2/academias/',icon:'academy'},
  {code:'cursosVerano',label:'Programas y Eventos',href:'/v2/programas/',icon:'spark'},
  {code:'tienda',label:'Tienda',href:'/v2/pedidos/',icon:'bag'},
  {code:'utileria',label:'Utilería',href:'/v2/utileria/',icon:'box'},
  {code:'admin',label:'Administración',href:'/v2/admin/',icon:'settings'}
];

export function navigationMap(rows=[]){
  return new Map((rows||[]).map(r=>[r.module_code,r]));
}

export function moduleAccess(rows,code,write=false){
  const row=navigationMap(rows).get(code);
  return Boolean(row?.enabled && (write?row.can_write:row.can_read));
}

function searchNavItems(navigation){
  const map=navigationMap(navigation);
  return navItems.filter(item=>map.get(item.code)?.enabled&&map.get(item.code)?.can_read)
    .map(item=>({label:item.label,meta:'Sección',href:item.href}));
}

let currentSearchItems=[];

export function setShellSearchItems(items=[]){
  currentSearchItems=[...searchNavItems(window.__tosNavigation||[]),...(items||[])];
}

function renderSearchResults(q){
  const box=$('shellSearchResults');
  if(!box)return;
  const query=String(q||'').trim().toLocaleLowerCase('es-MX');
  if(query.length<2){box.classList.add('hidden');box.innerHTML='';return;}
  const rows=currentSearchItems.filter(x=>`${x.label||''} ${x.meta||''}`.toLocaleLowerCase('es-MX').includes(query)).slice(0,8);
  box.innerHTML='';
  if(!rows.length){
    box.innerHTML='<div class="tos-search-empty">Sin resultados.</div>';
  }else{
    rows.forEach(row=>{
      const a=document.createElement('a');
      a.href=row.href||'#';
      a.className='tos-search-result';
      const strong=document.createElement('strong');strong.textContent=row.label;
      const small=document.createElement('span');small.textContent=row.meta||'';
      a.append(strong,small);box.appendChild(a);
    });
  }
  box.classList.remove('hidden');
}

function wireSearch(){
  const input=$('shellSearch');
  if(!input)return;
  input.addEventListener('input',()=>renderSearchResults(input.value));
  input.addEventListener('focus',()=>renderSearchResults(input.value));
  document.addEventListener('click',e=>{
    if(!e.target.closest?.('.tos-search-wrap'))$('shellSearchResults')?.classList.add('hidden');
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();input.focus();input.select();
    }
    if(e.key==='Escape')$('shellSearchResults')?.classList.add('hidden');
  });
}

function wireMobileNav(){
  $('shellMenuToggle')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));
  $('shellNavBackdrop')?.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));
}

export function renderShell({ctx,navigation,active='inicio',title='Inicio',searchItems=[]}){
  window.__tosNavigation=navigation||[];
  const map=navigationMap(navigation);
  const nav=$('sidebarNav');
  if(nav){
    nav.innerHTML='';
    navItems.forEach(item=>{
      const row=map.get(item.code);
      if(!(row?.enabled&&row?.can_read))return;
      const a=document.createElement('a');
      a.href=item.href;
      a.className=`tos-nav-item ${item.code===active?'active':''}`;
      a.innerHTML=`<span class="tos-nav-icon">${icon(item.icon)}</span><span>${item.label}</span>`;
      nav.appendChild(a);
    });
  }

  const role=ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro');
  const display=ctx?.display_name||'Tanner';
  if($('sidebarName'))$('sidebarName').textContent=display;
  if($('sidebarRole'))$('sidebarRole').textContent=role;
  if($('shellTitle'))$('shellTitle').textContent=title;
  if($('shellRole'))$('shellRole').textContent=role;
  if($('shellOrg'))$('shellOrg').textContent=ctx?.organization_name||'Tannery City';
  setShellSearchItems(searchItems);
  wireSearch();wireMobileNav();

  $('shellSignOut')?.addEventListener('click',async()=>{
    await supabase.auth.signOut();
    location.href='/v2/';
  });
}

export async function bootstrapProtectedShell({active,title}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/v2/';return null;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){location.href='/v2/';return null;}
  const ctx=rows[0];
  const navigation=await rpc('v2_my_navigation',{organization_id:ctx.organization_id});
  if(active!=='inicio'&&!moduleAccess(navigation,active,false)){
    location.href='/v2/';
    return null;
  }
  renderShell({ctx,navigation,active,title});
  return {ctx,navigation,map:navigationMap(navigation)};
}

export function setShellHealth({state='ok',label='Todo en orden'}={}){
  const pill=$('shellHealth');
  if(!pill)return;
  pill.dataset.state=state;
  const text=pill.querySelector('span');
  if(text)text.textContent=label;
}
