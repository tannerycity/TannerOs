const GROUPS=[
  {name:'Club deportivo',match:['/v2/jugadores/','/v2/deportivo/','/v2/asistencia/','/v2/convocatoria/','/v2/calendario/'],items:[
    {label:'Plantilla',href:'/v2/jugadores/',module:'jugadores'},
    {label:'Rendimiento',href:'/v2/deportivo/',module:'jugadores'},
    {label:'Asistencia',href:'/v2/asistencia/',module:'asistencia'},
    {label:'Convocatoria',href:'/v2/convocatoria/',module:'convocatoria'},
    {label:'Calendario',href:'/v2/calendario/',module:'calendario'}
  ]},
  {name:'Talento',match:['/v2/prospectos/','/v2/scouting/','/v2/academias/','/v2/porteros/'],items:[
    {label:'Captación',href:'/v2/prospectos/',module:'prospectos'},
    {label:'Scouting',href:'/v2/scouting/',module:'scouting'},
    {label:'Academias',href:'/v2/academias/',module:'academias'},
    {label:'Porteros',href:'/v2/porteros/',module:'academias'}
  ]},
  {name:'Tienda',match:['/v2/pedidos/','/v2/produccion/'],items:[
    {label:'Pedidos',href:'/v2/pedidos/',module:'tienda'},
    {label:'Producción y garantías',href:'/v2/produccion/',module:'tienda'}
  ]},
  {name:'Finanzas',match:['/v2/finanzas/','/v2/taquilla/','/v2/contabilidad/'],items:[
    {label:'Resumen',href:'/v2/finanzas/',module:'finanzas'},
    {label:'Taquilla',href:'/v2/taquilla/',module:'taquilla'},
    {label:'Contabilidad',href:'/v2/contabilidad/',module:'contabilidad'}
  ]}
];
const normalizedPath=()=>location.pathname.endsWith('/')?location.pathname:`${location.pathname}/`;
function readable(navigation,code){const row=(navigation||[]).find(r=>r.module_code===code);return Boolean(row?.enabled&&row?.can_read);}
function active(item,path){return path.startsWith(item.href);}
function applyPlayerContext(path){
  if(!path.startsWith('/v2/deportivo/'))return;
  const params=new URLSearchParams(location.search),player=params.get('player'),action=params.get('action');if(!player)return;
  const apply=()=>{const primary=document.getElementById('playerSelect');if(!primary||![...primary.options].some(o=>o.value===player))return false;primary.value=player;primary.dispatchEvent(new Event('change',{bubbles:true}));['statPlayer','evalPlayer','notePlayer'].forEach(id=>{const s=document.getElementById(id);if(s&&[...s.options].some(o=>o.value===player))s.value=player;});if(action==='evaluar')document.getElementById('evaluationPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return true;};
  if(!apply()){const observer=new MutationObserver(()=>{if(apply())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),7000);}
}
function installPlayerSnapshotActions(path){
  if(!path.startsWith('/v2/jugadores/')||document.documentElement.dataset.tosPlayerSnapshotActions==='1')return;
  document.documentElement.dataset.tosPlayerSnapshotActions='1';
  const update=playerId=>{const head=document.querySelector('.sports-snapshot .snapshot-head');if(!head||!playerId)return;const open=document.getElementById('openSports');if(open)open.href=`/v2/deportivo/?player=${encodeURIComponent(playerId)}`;let evaluate=document.getElementById('newEvaluation');if(!evaluate){evaluate=document.createElement('a');evaluate.id='newEvaluation';evaluate.className='primary mini nav-link';evaluate.textContent='Nueva evaluación';head.appendChild(evaluate);}evaluate.href=`/v2/deportivo/?player=${encodeURIComponent(playerId)}&action=evaluar`;};
  document.addEventListener('tanner-profile-opened',event=>update(event.detail?.playerId));
}
export function installModuleContext({navigation}={}){
  const path=normalizedPath();applyPlayerContext(path);installPlayerSnapshotActions(path);
  if(document.getElementById('tosModuleContext'))return;
  const group=GROUPS.find(g=>g.match.some(p=>path.startsWith(p)));if(!group)return;
  const items=group.items.filter(item=>readable(navigation,item.module));if(items.length<2)return;
  const target=document.querySelector('.app-wrap .hero,.tos-content .tos-welcome,.tos-content .brand-hero');if(!target)return;
  const nav=document.createElement('nav');nav.id='tosModuleContext';nav.className='tos-module-context';nav.setAttribute('aria-label',group.name);
  const label=document.createElement('span');label.className='tos-module-context-label';label.textContent=group.name;nav.appendChild(label);
  const rail=document.createElement('div');rail.className='tos-module-context-rail';
  items.forEach(item=>{const a=document.createElement('a');a.href=item.href;a.textContent=item.label;if(active(item,path)){a.classList.add('active');a.setAttribute('aria-current','page');}rail.appendChild(a);});nav.appendChild(rail);target.insertAdjacentElement('afterend',nav);
}
