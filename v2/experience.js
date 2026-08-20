const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
const safeText=value=>String(value??'');

export const EXPERIENCE_MODULES=[
  {code:'inicio',label:'Inicio',href:'/v2/',group:'main',icon:'home'},
  {code:'club',label:'Club',href:'/v2/club/',group:'main',icon:'shield'},
  {code:'direccion',label:'Dirección',href:'/v2/direccion/',group:'main',icon:'chart'},
  {code:'finanzas',label:'Finanzas',href:'/v2/finanzas/',group:'main',icon:'wallet'},
  {code:'jugadores',label:'Jugadores',href:'/v2/jugadores/',group:'club',icon:'users'},
  {code:'asistencia',label:'Asistencia',href:'/v2/asistencia/',group:'club',icon:'check'},
  {code:'convocatoria',aliases:['callups'],label:'Convocatoria',href:'/v2/convocatoria/',group:'club',icon:'list'},
  {code:'calendario',label:'Calendario',href:'/v2/calendario/',group:'club',icon:'calendar'},
  {code:'academias',label:'Academias',href:'/v2/academias/',group:'club',icon:'academy'},
  {code:'prospectos',aliases:['scouting'],label:'Captación',href:'/v2/prospectos/',group:'club',icon:'target'},
  {code:'scouting',label:'Scouting',href:'/v2/scouting/',group:'club',icon:'search'},
  {code:'cursosVerano',label:'Programas',href:'/v2/programas/',group:'club',icon:'spark'},
  {code:'tienda',aliases:['taquilla'],label:'Pedidos',href:'/v2/pedidos/',group:'ops',icon:'bag'},
  {code:'utileria',label:'Utilería',href:'/v2/utileria/',group:'ops',icon:'box'},
  {code:'patrocinadores',label:'Patrocinadores',href:'/v2/patrocinadores/',group:'ops',icon:'briefcase'},
  {code:'contabilidad',label:'Contabilidad',href:'/v2/contabilidad/',group:'finance',icon:'ledger'},
  {code:'usuarios',label:'Usuarios',href:'/v2/usuarios/',group:'admin',icon:'userCog'},
  {code:'qa',label:'QA',href:'/v2/qa/',group:'admin',icon:'bug'},
  {code:'admin',label:'Administración',href:'/v2/admin/',group:'admin',icon:'settings'}
];

const PATH_META=[
  ['/v2/admin/branding/','admin','Marca y apariencia','/v2/admin/'],
  ['/v2/produccion/','tienda','Producción','/v2/finanzas/'],
  ['/v2/porteros/','academias','Porteros','/v2/academias/'],
  ['/v2/deportivo/','club','Rendimiento deportivo','/v2/club/'],
  ['/v2/convocatoria/','convocatoria','Convocatoria','/v2/club/'],
  ['/v2/jugadores/','jugadores','Jugadores','/v2/club/'],
  ['/v2/asistencia/','asistencia','Asistencia','/v2/club/'],
  ['/v2/calendario/','calendario','Calendario','/v2/club/'],
  ['/v2/academias/','academias','Academias','/v2/club/'],
  ['/v2/prospectos/','prospectos','Captación','/v2/club/'],
  ['/v2/scouting/','scouting','Scouting','/v2/club/'],
  ['/v2/programas/','cursosVerano','Programas y eventos','/v2/club/'],
  ['/v2/pedidos/','tienda','Pedidos','/v2/finanzas/'],
  ['/v2/contabilidad/','contabilidad','Contabilidad','/v2/finanzas/'],
  ['/v2/patrocinadores/','patrocinadores','Patrocinadores','/v2/direccion/'],
  ['/v2/utileria/','utileria','Utilería','/v2/club/'],
  ['/v2/usuarios/','usuarios','Usuarios','/v2/admin/'],
  ['/v2/qa/','qa','QA','/v2/admin/'],
  ['/v2/admin/','admin','Administración','/v2/direccion/'],
  ['/v2/modulos/','inicio','Módulos','/v2/'],
  ['/v2/club/','club','Club','/v2/'],
  ['/v2/direccion/','direccion','Dirección','/v2/'],
  ['/v2/finanzas/','finanzas','Finanzas','/v2/'],
  ['/v2/','inicio','Inicio','/v2/']
];

const ICON_PATHS={
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  chart:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 11h5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  check:'<path d="m4 12 4 4L20 4"/><path d="M20 12a8 8 0 1 1-4.2-7"/>',
  list:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/>',
  academy:'<path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M22 12h-3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  spark:'<path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="3"/>',
  bag:'<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  box:'<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/>',
  ledger:'<path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  userCog:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 12-5"/><circle cx="18" cy="18" r="3"/><path d="M18 13v2"/><path d="M18 21v2"/>',
  bug:'<path d="M8 2h8"/><path d="M9 2v3"/><path d="M15 2v3"/><rect x="6" y="5" width="12" height="15" rx="6"/><path d="M3 9h3"/><path d="M18 9h3"/><path d="M3 15h3"/><path d="M18 15h3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.9V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
  arrow:'<path d="m15 18-6-6 6-6"/>',
  menu:'<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'
};

const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]||ICON_PATHS.home}</svg>`;

function pageMeta(){
  const path=location.pathname.endsWith('/')?location.pathname:`${location.pathname}/`;
  return PATH_META.find(([prefix])=>path.startsWith(prefix))||PATH_META[PATH_META.length-1];
}

function navigationMap(rows=[]){return new Map((rows||[]).map(row=>[row.module_code,row]));}
function moduleReadable(navigation,item){
  const map=navigationMap(navigation),codes=[item.code,...(item.aliases||[])];
  return codes.some(code=>{const row=map.get(code);return row?.enabled&&row?.can_read;});
}
function isActive(item,active){return item.code===active||(item.aliases||[]).includes(active);}

function ensureStyle(href,id){
  if(document.getElementById(id))return;
  const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=href;document.head.appendChild(link);
}

export function renderExperienceNavigation(container,navigation,active=pageMeta()[1]){
  if(!container)return;
  const sections=[
    {key:'main',label:null},
    {key:'club',label:'Club'},
    {key:'finance',label:'Finanzas'},
    {key:'ops',label:'Operación'},
    {key:'admin',label:'Administración'}
  ];
  container.innerHTML='';
  sections.forEach(section=>{
    const visible=EXPERIENCE_MODULES.filter(item=>item.group===section.key&&moduleReadable(navigation,item));
    if(!visible.length)return;
    const wrap=document.createElement('div');wrap.className=`tos-nav-section tos-nav-section-${section.key}`;
    if(section.label){const label=document.createElement('div');label.className='tos-nav-section-label';label.textContent=section.label;wrap.appendChild(label);}
    visible.forEach(item=>{
      const a=document.createElement('a');a.href=item.href;a.className=`tos-nav-item ${isActive(item,active)?'active':''}`;a.dataset.module=item.code;
      a.innerHTML=`<span class="tos-nav-icon">${icon(item.icon)}</span><span>${item.label}</span>`;
      wrap.appendChild(a);
    });
    container.appendChild(wrap);
  });
}

const COMMANDS=[
  {terms:['inicio','home','principal'],title:'Ir a Inicio',subtitle:'Resumen del club',href:'/v2/',module:'inicio',icon:'home'},
  {terms:['jugadores','tanners','plantilla','expedientes','expediente'],title:'Abrir Jugadores',subtitle:'Plantilla y expedientes',href:'/v2/jugadores/',module:'jugadores',icon:'users'},
  {terms:['asistencia','entrenamiento','entrenamientos'],title:'Tomar asistencia',subtitle:'Sesiones y roster',href:'/v2/asistencia/',module:'asistencia',icon:'check'},
  {terms:['convocatoria','convocar','roster'],title:'Abrir Convocatoria',subtitle:'Roster de partido',href:'/v2/convocatoria/',module:'convocatoria',icon:'list'},
  {terms:['calendario','agenda','hoy','semana','eventos'],title:'Abrir Calendario',subtitle:'Agenda, partidos y eventos',href:'/v2/calendario/',module:'calendario',icon:'calendar'},
  {terms:['prospectos','captacion','captación','leads','porteros','jugadores nuevos'],title:'Abrir Captación',subtitle:'Prospectos y campañas',href:'/v2/prospectos/',module:'prospectos',icon:'target'},
  {terms:['scouting','visoria','visoría','talento'],title:'Abrir Scouting',subtitle:'Visorías y seguimiento',href:'/v2/scouting/',module:'scouting',icon:'search'},
  {terms:['academias','academia','porteros academia'],title:'Abrir Academias',subtitle:'Academias y paquetes',href:'/v2/academias/',module:'academias',icon:'academy'},
  {terms:['programas','cursos','curso','campamento','verano'],title:'Abrir Programas',subtitle:'Cursos y eventos',href:'/v2/programas/',module:'cursosVerano',icon:'spark'},
  {terms:['cobranza','morosos','deudores','por cobrar','deuda','saldo'],title:'Ver Cobranza',subtitle:'Cartera y saldos pendientes',href:'/v2/finanzas/#cobranza',module:'cobranza',icon:'wallet'},
  {terms:['cobrar','registrar pago','pago','mensualidad'],title:'Registrar un pago',subtitle:'Caja rápida',href:'/v2/finanzas/?action=cobrar',module:'cobranza',icon:'wallet'},
  {terms:['contabilidad','egresos','gastos','ledger'],title:'Abrir Contabilidad',subtitle:'Egresos y ajustes',href:'/v2/contabilidad/',module:'contabilidad',icon:'ledger'},
  {terms:['pedidos','pedido','tienda','uniformes'],title:'Abrir Pedidos',subtitle:'Tienda y órdenes',href:'/v2/pedidos/',module:'tienda',icon:'bag'},
  {terms:['produccion','producción','cortes','garantias','garantías'],title:'Abrir Producción',subtitle:'Cortes y garantías',href:'/v2/produccion/',module:'tienda',icon:'box'},
  {terms:['patrocinadores','sponsors','sponsor','marcas'],title:'Abrir Patrocinadores',subtitle:'Pipeline comercial',href:'/v2/patrocinadores/',module:'patrocinadores',icon:'briefcase'},
  {terms:['utileria','utilería','inventario','balones','material'],title:'Abrir Utilería',subtitle:'Inventario y asignaciones',href:'/v2/utileria/',module:'utileria',icon:'box'},
  {terms:['usuarios','permisos','roles','equipo'],title:'Abrir Usuarios',subtitle:'Accesos y permisos',href:'/v2/usuarios/',module:'usuarios',icon:'userCog'},
  {terms:['marca','branding','logo','logos','colores','apariencia'],title:'Marca y apariencia',subtitle:'Personalización white-label',href:'/v2/admin/branding/',module:'admin',icon:'settings'},
  {terms:['qa','reglas','integridad','pruebas'],title:'Abrir QA',subtitle:'Reglas e integridad',href:'/v2/qa/',module:'qa',icon:'bug'},
  {terms:['admin','administracion','administración','configuracion','configuración'],title:'Abrir Administración',subtitle:'Configuración del club',href:'/v2/admin/',module:'admin',icon:'settings'}
];

function commandAllowed(command,navigation){
  if(!command.module)return true;
  const item=EXPERIENCE_MODULES.find(x=>x.code===command.module||x.aliases?.includes(command.module))||{code:command.module};
  return moduleReadable(navigation,item);
}
function commandMatches(command,q){
  if(!q)return false;
  return command.terms.some(term=>{const t=normalize(term);return t.startsWith(q)||q.startsWith(t)||t.includes(q)||q.includes(t);});
}
function commandResults(q,navigation){
  return COMMANDS.filter(c=>commandAllowed(c,navigation)&&commandMatches(c,q)).slice(0,5).map((c,i)=>({...c,kind:'command',score:120-i}));
}

const ENTITY_LABELS={player:'Jugador',prospect:'Prospecto',order:'Pedido',sponsor:'Patrocinador',program:'Programa',event:'Evento',match:'Partido',academy:'Academia'};
const ENTITY_ICONS={player:'users',prospect:'target',order:'bag',sponsor:'briefcase',program:'spark',event:'calendar',match:'shield',academy:'academy'};

function recentKey(org){return `tanneros:recent-search:${org||'default'}`;}
function getRecent(org){try{return JSON.parse(localStorage.getItem(recentKey(org))||'[]').slice(0,5);}catch{return [];}}
function remember(org,row){
  if(!row?.href||!row?.title)return;
  const next=[{title:row.title,subtitle:row.subtitle||'',href:row.href,kind:row.kind||'recent',entity_type:row.entity_type||null},...getRecent(org).filter(x=>x.href!==row.href)].slice(0,5);
  try{localStorage.setItem(recentKey(org),JSON.stringify(next));}catch{}
}

function extrasResults(q){
  const rows=Array.isArray(window.__tosSearchExtras)?window.__tosSearchExtras:[];
  return rows.filter(row=>normalize(`${row.label||row.title||''} ${row.meta||row.subtitle||''}`).includes(q)).slice(0,4).map(row=>({kind:'local',title:row.label||row.title,subtitle:row.meta||row.subtitle||'En esta sección',href:row.href||'#',score:75}));
}

function createResultRow(row,index,org){
  const a=document.createElement('a');a.href=row.href||'#';a.className='tos-smart-result';a.dataset.searchIndex=String(index);a.setAttribute('role','option');
  const iconBox=document.createElement('span');iconBox.className='tos-smart-result-icon';iconBox.innerHTML=icon(row.icon||ENTITY_ICONS[row.entity_type]||'search');
  const copy=document.createElement('span');copy.className='tos-smart-result-copy';
  const strong=document.createElement('strong');strong.textContent=safeText(row.title);
  const small=document.createElement('small');small.textContent=safeText(row.subtitle||'');
  copy.append(strong,small);
  const badge=document.createElement('span');badge.className='tos-smart-result-badge';badge.textContent=row.kind==='command'?'Acción':(ENTITY_LABELS[row.entity_type]||row.kind||'Resultado');
  a.append(iconBox,copy,badge);
  a.addEventListener('click',()=>remember(org,row));
  return a;
}

function showSearchPanel(box,sections,org){
  box.innerHTML='';let index=0;
  sections.forEach(section=>{
    if(!section.rows?.length)return;
    const head=document.createElement('div');head.className='tos-smart-section-title';head.textContent=section.label;box.appendChild(head);
    section.rows.forEach(row=>box.appendChild(createResultRow(row,index++,org)));
  });
  if(!index){const empty=document.createElement('div');empty.className='tos-smart-empty';empty.innerHTML='<strong>No encontré eso.</strong><span>Prueba con nombre, teléfono, categoría, folio, sponsor o una acción como “cobranza”.</span>';box.appendChild(empty);}
  box.classList.remove('hidden');
  return index;
}

function defaultPanel(box,navigation,org){
  const recent=getRecent(org);
  const quick=COMMANDS.filter(c=>commandAllowed(c,navigation)&&['inicio','jugadores','cobranza','calendario','marca'].some(t=>c.terms.map(normalize).includes(t))).slice(0,5).map(c=>({...c,kind:'command'}));
  return showSearchPanel(box,[{label:'Recientes',rows:recent},{label:'Acciones rápidas',rows:quick}],org);
}

export function wireSmartOmnibox({supabase,ctx,navigation,input,results}){
  if(!input||!results||input.dataset.tosSmartWired==='1')return;
  input.dataset.tosSmartWired='1';input.placeholder='Buscar en todo TannerOS…';input.autocomplete='off';input.setAttribute('aria-label','Buscar en todo TannerOS');input.setAttribute('aria-expanded','false');
  results.classList.add('tos-smart-search-results');
  let timer=null,seq=0,active=-1,total=0;

  const setActive=next=>{
    const rows=[...results.querySelectorAll('.tos-smart-result')];if(!rows.length)return;
    active=Math.max(0,Math.min(next,rows.length-1));rows.forEach((el,i)=>el.classList.toggle('active',i===active));rows[active]?.scrollIntoView({block:'nearest'});
  };
  const close=()=>{results.classList.add('hidden');input.setAttribute('aria-expanded','false');active=-1;};
  const openDefault=()=>{total=defaultPanel(results,navigation,ctx?.organization_id);input.setAttribute('aria-expanded','true');active=-1;};

  async function run(){
    const raw=input.value.trim(),q=normalize(raw),mySeq=++seq;
    if(!q){openDefault();return;}
    const commands=commandResults(q,navigation),extras=extrasResults(q);
    let entities=[];
    if(q.length>=2){
      try{
        const {data,error}=await supabase.rpc('v2_global_search',{organization_id:ctx.organization_id,search_query:raw,result_limit:12});
        if(error)throw error;if(mySeq!==seq)return;entities=(data||[]).map(row=>({...row,kind:'entity'}));
      }catch(err){console.warn('omnibox search',err);}
    }
    if(mySeq!==seq)return;
    const seen=new Set();entities=entities.filter(row=>{const key=`${row.href}|${row.title}`;if(seen.has(key))return false;seen.add(key);return true;});
    total=showSearchPanel(results,[{label:'Acciones',rows:commands},{label:'Resultados',rows:entities},{label:'En esta vista',rows:extras}],ctx?.organization_id);
    input.setAttribute('aria-expanded','true');active=-1;
  }

  input.addEventListener('focus',()=>{if(!input.value.trim())openDefault();else run();});
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(run,160);});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();setActive(active+1);}
    else if(event.key==='ArrowUp'){event.preventDefault();setActive(active<0?total-1:active-1);}
    else if(event.key==='Enter'&&active>=0){event.preventDefault();results.querySelector(`.tos-smart-result[data-search-index="${active}"]`)?.click();}
    else if(event.key==='Escape'){event.preventDefault();close();input.blur();}
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.tos-search-wrap,.tos-experience-search'))close();});
  document.addEventListener('keydown',event=>{
    const tag=document.activeElement?.tagName?.toLowerCase(),typing=['input','textarea','select'].includes(tag);
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.focus();input.select();}
    else if(event.key==='/'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();input.focus();}
  });
  window.addEventListener('tanneros:search-extras',()=>{if(document.activeElement===input&&input.value.trim())run();});
}

const prefetched=new Set();
function prefetchHref(href){
  try{const u=new URL(href,location.origin);if(u.origin!==location.origin||!u.pathname.startsWith('/v2/'))return;if(prefetched.has(u.href)||u.href===location.href)return;prefetched.add(u.href);const link=document.createElement('link');link.rel='prefetch';link.href=u.href;document.head.appendChild(link);}catch{}
}

export function wireFluidNavigation(){
  if(document.documentElement.dataset.tosFluidWired==='1')return;document.documentElement.dataset.tosFluidWired='1';
  document.addEventListener('pointerover',event=>{const a=event.target.closest?.('a[href]');if(a)prefetchHref(a.href);},{passive:true});
  document.addEventListener('focusin',event=>{const a=event.target.closest?.('a[href]');if(a)prefetchHref(a.href);});
  document.addEventListener('click',event=>{
    const a=event.target.closest?.('a[href]');if(!a||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
    try{const u=new URL(a.href,location.origin);if(u.origin!==location.origin||!u.pathname.startsWith('/v2/'))return;const here=new URL(location.href);if(u.pathname===here.pathname&&u.search===here.search&&u.hash&&u.hash!==here.hash)return;document.body.classList.add('tos-navigating');}catch{}
  },{capture:true});
  window.addEventListener('pageshow',()=>document.body.classList.remove('tos-navigating'));
}

function fallbackForCurrent(){return pageMeta()[3]||'/v2/';}
function backAction(){
  const fallback=fallbackForCurrent();
  try{const ref=document.referrer?new URL(document.referrer):null;if(ref?.origin===location.origin&&ref.pathname.startsWith('/v2/')&&history.length>1){history.back();return;}}catch{}
  location.href=fallback;
}

export function ensureBackButton(target){
  if(!target||location.pathname.replace(/\/+$/,'')==='/v2'||target.querySelector('.tos-back-button'))return;
  const button=document.createElement('button');button.type='button';button.className='tos-back-button';button.title='Volver';button.setAttribute('aria-label','Volver');button.innerHTML=`${icon('arrow')}<span>Atrás</span>`;button.addEventListener('click',backAction);target.prepend(button);
}

function buildLegacyShell({supabase,ctx,navigation}){
  if(document.getElementById('tosExperienceSidebar')||document.querySelector('.tos-layout'))return;
  document.body.classList.add('tos-experience-legacy','tos-body');
  const [,active,title]=pageMeta();
  const aside=document.createElement('aside');aside.id='tosExperienceSidebar';aside.className='tos-sidebar tos-experience-sidebar';aside.innerHTML=`<div class="tos-brand"><div class="tos-brand-mark">T</div><div><strong data-brand-product>TannerOS</strong><small>${safeText(ctx?.display_name||'Usuario')} · ${safeText(ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro'))}</small><small class="tos-version">TannerOS v2.0</small></div></div><nav id="tosExperienceNav" class="tos-nav"></nav><div class="tos-sidebar-bottom"><button id="tosExperienceSignOut" class="tos-signout" type="button">Salir del vestidor</button></div>`;
  const backdrop=document.createElement('div');backdrop.id='tosExperienceBackdrop';backdrop.className='tos-nav-backdrop tos-experience-backdrop';
  const top=document.createElement('header');top.id='tosExperienceTopbar';top.className='tos-topbar tos-experience-topbar';top.innerHTML=`<div class="tos-top-left"><button id="tosExperienceMenu" class="tos-menu-toggle" type="button">${icon('menu')}</button><span id="tosExperienceTitle" class="tos-page-title">${safeText(title)}</span></div><div class="tos-search-wrap tos-experience-search"><div class="tos-search-box"><span>⌕</span><input id="tosExperienceSearch" type="search" placeholder="Buscar en todo TannerOS…"><kbd>Ctrl K</kbd></div><div id="tosExperienceSearchResults" class="tos-search-results hidden"></div></div><div class="tos-top-right"><span class="tos-role">${safeText(ctx?.is_owner?'Presidencia':(ctx?.role||'Miembro'))}</span></div>`;
  document.body.prepend(top);document.body.prepend(backdrop);document.body.prepend(aside);
  renderExperienceNavigation(document.getElementById('tosExperienceNav'),navigation,active);
  ensureBackButton(top.querySelector('.tos-top-left'));
  wireSmartOmnibox({supabase,ctx,navigation,input:document.getElementById('tosExperienceSearch'),results:document.getElementById('tosExperienceSearchResults')});
  document.getElementById('tosExperienceMenu')?.addEventListener('click',()=>document.body.classList.toggle('tos-nav-open'));
  backdrop.addEventListener('click',()=>document.body.classList.remove('tos-nav-open'));
  document.getElementById('tosExperienceSignOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/v2/';});
}

function upgradeNativeShell({supabase,ctx,navigation}){
  const nav=document.getElementById('sidebarNav');if(nav)renderExperienceNavigation(nav,navigation,pageMeta()[1]);
  const topLeft=document.querySelector('.tos-topbar .tos-top-left');ensureBackButton(topLeft);
  const input=document.getElementById('shellSearch'),results=document.getElementById('shellSearchResults');if(input&&results)wireSmartOmnibox({supabase,ctx,navigation,input,results});
}

function installMobileDock({navigation}){
  if(document.getElementById('tosMobileDock'))return;
  const allowed=code=>{const item=EXPERIENCE_MODULES.find(x=>x.code===code);return item&&moduleReadable(navigation,item);};
  const dock=document.createElement('nav');dock.id='tosMobileDock';dock.className='tos-mobile-dock';
  const items=[
    allowed('inicio')&&{label:'Inicio',href:'/v2/',icon:'home'},
    allowed('club')&&{label:'Club',href:'/v2/club/',icon:'shield'},
    {label:'Buscar',href:'#search',icon:'search',search:true},
    allowed('finanzas')&&{label:'Finanzas',href:'/v2/finanzas/',icon:'wallet'},
    {label:'Menú',href:'#menu',icon:'menu',menu:true}
  ].filter(Boolean);
  items.forEach(item=>{const a=document.createElement('a');a.href=item.href;a.innerHTML=`${icon(item.icon)}<span>${item.label}</span>`;if(item.search)a.addEventListener('click',event=>{event.preventDefault();(document.getElementById('shellSearch')||document.getElementById('tosExperienceSearch'))?.focus();});if(item.menu)a.addEventListener('click',event=>{event.preventDefault();document.body.classList.toggle('tos-nav-open');});dock.appendChild(a);});
  document.body.appendChild(dock);
}

function focusDeepLink(){
  const params=new URLSearchParams(location.search),focus=params.get('focus'),action=params.get('action'),player=params.get('player');
  if(action==='cobrar'){
    const tryPayment=()=>{const select=document.getElementById('financePaymentPlayer');if(!select)return false;if(player&&[...select.options].some(o=>o.value===player)){select.value=player;select.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('financePaymentAmount')?.focus();select.scrollIntoView({behavior:'smooth',block:'center'});return true;};
    if(!tryPayment()){const mo=new MutationObserver(()=>{if(tryPayment())mo.disconnect();});mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),5000);}
  }
  if(!focus)return;
  const attrs=['playerId','prospectId','orderId','sponsorId','programId','matchId','academyId','eventId','reportId','batchId'];
  const find=()=>{for(const attr of attrs){const el=document.querySelector(`[data-${attr.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}="${CSS.escape(focus)}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.click();return true;}}return false;};
  if(!find()){const mo=new MutationObserver(()=>{if(find())mo.disconnect();});mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),5000);}
}

export async function initUniversalExperience({supabase,ctx}){
  if(!supabase||!ctx?.organization_id)return null;
  ensureStyle('/v2/shell.css','tosShellCss');ensureStyle('/v2/experience.css','tosExperienceCss');
  let navigation=window.__tosExperienceNavigation;
  if(!navigation){const {data,error}=await supabase.rpc('v2_my_navigation',{organization_id:ctx.organization_id});if(error)throw error;navigation=data||[];window.__tosExperienceNavigation=navigation;}
  window.__tosExperienceContext=ctx;
  if(document.querySelector('.tos-layout'))upgradeNativeShell({supabase,ctx,navigation});else buildLegacyShell({supabase,ctx,navigation});
  installMobileDock({navigation});wireFluidNavigation();focusDeepLink();
  const observer=new MutationObserver(()=>{if(document.querySelector('.tos-layout'))upgradeNativeShell({supabase,ctx,navigation});});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),6000);
  window.TannerOSExperience={
    refreshSearch(){const input=document.getElementById('shellSearch')||document.getElementById('tosExperienceSearch');if(input&&document.activeElement===input)input.dispatchEvent(new Event('input',{bubbles:true}));},
    back:backAction,
    focusSearch(){(document.getElementById('shellSearch')||document.getElementById('tosExperienceSearch'))?.focus();}
  };
  return {navigation};
}
