const GROUPS=[
  {name:'Club deportivo',match:['/jugadores/','/deportivo/','/asistencia/','/convocatoria/','/calendario/'],items:[
    {label:'Plantilla',href:'/jugadores/',module:'jugadores'},
    {label:'Rendimiento',href:'/deportivo/',module:'jugadores'},
    {label:'Asistencia',href:'/asistencia/',module:'asistencia'},
    {label:'Convocatoria',href:'/convocatoria/',module:'convocatoria'},
    {label:'Calendario',href:'/calendario/',module:'calendario'}
  ]},
  {name:'Talento',match:['/prospectos/','/scouting/','/operacion/academias/','/porteros/'],items:[
    {label:'Captación',href:'/prospectos/',module:'prospectos'},
    {label:'Scouting',href:'/scouting/',module:'scouting'},
    {label:'Academias',href:'/operacion/academias/',module:'academias'},
    {label:'Porteros',href:'/porteros/',module:'academias'}
  ]},
  {name:'Tienda',match:['/pedidos/','/produccion/'],items:[
    {label:'Pedidos',href:'/pedidos/',module:'tienda'},
    {label:'Producción y garantías',href:'/produccion/',module:'tienda'}
  ]},
  {name:'Finanzas',match:['/finanzas/','/taquilla/','/contabilidad/'],items:[
    {label:'Resumen',href:'/finanzas/',module:'finanzas'},
    {label:'Taquilla',href:'/taquilla/',module:'taquilla'},
    {label:'Contabilidad',href:'/contabilidad/',module:'contabilidad'}
  ]}
];
function canonicalPath(pathname=location.pathname){const p=String(pathname||'/');if(p==='/v2'||p==='/v2/')return'/';if(p==='/v2/programas'||p.startsWith('/v2/programas/'))return p.replace(/^\/v2\/programas(?=\/|$)/,'/operacion/programas');if(p==='/v2/academias'||p.startsWith('/v2/academias/'))return p.replace(/^\/v2\/academias(?=\/|$)/,'/operacion/academias');if(p.startsWith('/v2/'))return p.slice(3)||'/';return p;}
const normalizedPath=()=>{const p=canonicalPath();return p==='/'?'/':(p.endsWith('/')?p:`${p}/`);};
function readable(navigation,code){const row=(navigation||[]).find(r=>r.module_code===code);return Boolean(row?.enabled&&row?.can_read);}
function active(item,path){return path.startsWith(item.href);}
function applyPlayerContext(path){
  if(!path.startsWith('/deportivo/'))return;
  const params=new URLSearchParams(location.search),player=params.get('player'),action=params.get('action');if(!player)return;
  const apply=()=>{const primary=document.getElementById('playerSelect');if(!primary||![...primary.options].some(o=>o.value===player))return false;primary.value=player;primary.dispatchEvent(new Event('change',{bubbles:true}));['statPlayer','evalPlayer','notePlayer'].forEach(id=>{const s=document.getElementById(id);if(s&&[...s.options].some(o=>o.value===player))s.value=player;});if(action==='evaluar')document.getElementById('evaluationPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return true;};
  if(!apply()){const observer=new MutationObserver(()=>{if(apply())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),7000);}
}
function installPlayerSnapshotActions(path){
  if(!path.startsWith('/jugadores/')||document.documentElement.dataset.tosPlayerSnapshotActions==='1')return;
  document.documentElement.dataset.tosPlayerSnapshotActions='1';
  const update=playerId=>{const head=document.querySelector('.sports-snapshot .snapshot-head');if(!head||!playerId)return;const open=document.getElementById('openSports');if(open)open.href=`/deportivo/?player=${encodeURIComponent(playerId)}`;let evaluate=document.getElementById('newEvaluation');if(!evaluate){evaluate=document.createElement('a');evaluate.id='newEvaluation';evaluate.className='primary mini nav-link';evaluate.textContent='Nueva evaluación';head.appendChild(evaluate);}evaluate.href=`/deportivo/?player=${encodeURIComponent(playerId)}&action=evaluar`;};
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
