import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,setShellSearchItems,shellIcon} from '/v2/shell.js';

const page=document.body.dataset.hub;
const titles={club:'Club',direccion:'Dirección',finanzas:'Finanzas'};
const boot=await bootstrapProtectedShell({active:page,title:titles[page]||'TannerOS'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const safe=(p,fallback=null)=>p.catch(e=>{console.warn('hub widget',e);return fallback;});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const org=ctx.organization_id;

function card(code,title,desc,href,tone='',iconName='home'){if(!can(code))return '';return `<a class="tos-hub-card ${esc(tone)}" href="${esc(href)}"><span class="tos-hub-icon" aria-hidden="true">${shellIcon(iconName)}</span><div class="tos-hub-copy"><strong>${esc(title)}</strong><span>${esc(desc)}</span></div><span class="tos-hub-chevron" aria-hidden="true">${shellIcon('chevronRight')}</span></a>`;}
function kpi(label,value,sub='',cls=''){return `<article class="tos-kpi ${esc(cls)}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;}
function ringKpi(label,value,sub,progress,cls=''){const safeProgress=Math.max(0,Math.min(100,Number(progress)||0)),badge=cls==='good'?'En objetivo':cls==='attention'?'Revisar':cls==='danger'?'Atención':'';return `<article class="tos-kpi tos-kpi-chart ${esc(cls)}"><div class="tos-kpi-label"><span>${esc(label)}</span>${badge?`<em>${badge}</em>`:''}</div><div class="tos-ring-row"><div class="tos-metric-ring" style="--metric-progress:${safeProgress}" role="img" aria-label="${esc(label)}: ${esc(value)}"><strong>${esc(value)}</strong></div><small>${esc(sub)}</small></div></article>`;}
function barKpi(label,value,sub,progress,cls=''){const safeProgress=Math.max(0,Math.min(100,Number(progress)||0));return `<article class="tos-kpi tos-kpi-bar ${esc(cls)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small><div class="tos-metric-track" role="img" aria-label="${esc(sub)}"><i style="width:${safeProgress}%"></i></div></article>`;}
function iconKpi(label,value,sub,iconName='target',cls=''){return `<article class="tos-kpi tos-kpi-icon ${esc(cls)}"><span>${esc(label)}</span><div class="tos-icon-metric"><i aria-hidden="true">${shellIcon(iconName)}</i><div><strong>${esc(value)}</strong><small>${esc(sub)}</small></div></div></article>`;}
function moneyKpi(label,amount,sub='',severity='danger'){const numeric=Number(amount||0),cls=numeric>0?severity:'good',badge=numeric>0?(severity==='attention'?'En seguimiento':'Por cobrar'):numeric<0?'A favor':'Al día',detail=numeric===0?'Sin saldo pendiente':numeric<0?'Saldo disponible':sub;return `<article class="tos-kpi tos-kpi-money ${esc(cls)}"><div class="tos-kpi-label"><span>${esc(label)}</span><em>${badge}</em></div><strong>${money.format(Math.abs(numeric))}</strong><small>${esc(detail)}</small></article>`;}
function alerta(tag,title,value,detail,type='',href=''){const body=`<span class="tos-alert-tag">${esc(tag)}</span><b>${esc(title)}${value?`<br>${esc(value)}`:''}</b><small>${esc(detail)}</small>`;return href?`<a class="tos-alert ${esc(type)}" href="${esc(href)}">${body}</a>`:`<article class="tos-alert ${esc(type)}">${body}</article>`;}
function countBy(rows,getter){const map=new Map();for(const row of rows||[]){const key=String(getter(row)||'').trim();if(!key)continue;map.set(key,(map.get(key)||0)+1);}return [...map.entries()].sort((a,b)=>b[1]-a[1]);}
// Pone en mayúscula la inicial de cada palabra sin romper los acentos: con
// /\b\w/ la ó no es \w, así que "recomendación" abría un falso límite de
// palabra antes de la n y salía "RecomendacióN". \p{L} sí es Unicode.
function titleCase(text){return String(text||'').replace(/(^|\s)(\p{L})/gu,(m,sep,ch)=>sep+ch.toUpperCase());}
function campaignLabel(value){const code=String(value||'').trim();if(!code)return 'Sin campaña';const known={captacion_porteros_2026:'Captación Porteros',captacion_jugadores_2026:'Captación Jugadores',registro_general_2026:'Registro general'};return known[code]||titleCase(code.replaceAll('_',' '));}

async function renderClub(){
  $('hubEyebrow').textContent='EL CORAZÓN DEPORTIVO DEL CLUB';$('hubTitle').textContent='Club';$('hubSubtitle').textContent='Plantilla, asistencia, convocatorias, fichajes y calendario.';
  $('hubBody').innerHTML=`<section class="tos-hub-grid">${card('jugadores','Jugadores','Plantilla y fichas Tanner','/jugadores/','','users')}${card('jugadores','Porteros','Todos los porteros, su paquete y su saldo','/paquetes/?ver=porteros','blue','shield')}${card('cobranza','Paquetes','Precios, becas y quién paga qué','/paquetes/?ver=precios','gold','wallet')}${card('asistencia','Asistencia','Entrenamientos y registro','/asistencia/','blue','check')}${card('callups','Partidos','Convocados, goles y quién jugó','/partidos/','gold','list')}${card('prospectos','Fichajes','Los que quieren entrar al club','/prospectos/','gold','target')}${card('scouting','Scouting','Visorías y radar de talento','/scouting/','','search')}${card('academias','Academias','Inscripciones y operación','/operacion/academias/','blue','academy')}</section>`;
}

async function renderDirection(){
  $('hubEyebrow').textContent='INTELIGENCIA DEL CLUB';$('hubTitle').textContent='Dirección';$('hubSubtitle').textContent='Decisiones deportivas, financieras y de fichajes desde una sola fuente de verdad.';
  const [players,collection,prospects,sponsors]=await Promise.all([
    can('jugadores')?safe(rpc('v2_players',{organization_id:org,status_filter:'active'}),[]):[],
    (can('cobranza')||can('contabilidad'))?safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:new Date().toISOString().slice(0,7)+'-01'}),null):null,
    (can('prospectos')||can('scouting'))?safe(rpc('v2_prospects',{organization_id:org,status_filter:null}),[]):[],
    can('patrocinadores')?safe(rpc('v2_sponsors',{organization_id:org}),[]):[]
  ]);
  const open=prospects.filter(p=>!['converted','not_continuing','archived','lost'].includes(String(p.status||''))),converted=prospects.filter(p=>p.status==='converted').length;
  const overdue=open.filter(p=>p.next_action_at&&new Date(p.next_action_at)<new Date());
  const renewal=sponsors.filter(s=>['due','soon','overdue','attention'].includes(String(s.renewal_state||'').toLowerCase()));
  const topCampaign=countBy(prospects,p=>p.source_campaign||p.source_channel||p.source)[0],topCategory=countBy(players,p=>p.category)[0];
  const conversion=prospects.length?Math.round(converted/prospects.length*100):0;
  const cards=[];
  if(can('jugadores')){const categoryShare=topCategory&&players.length?Math.round(topCategory[1]/players.length*100):0;cards.push(barKpi('Jugadores activos',players.length,topCategory?`${topCategory[0]} · ${topCategory[1]} Tanners`:'Plantilla actual',categoryShare));}
  if(collection){const rate=Number(collection.collection_rate||0),rateState=rate>=90?'good':rate>=75?'attention':'danger';cards.push(ringKpi('Cobranza',`${rate}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,rate,rateState));cards.push(moneyKpi('Cartera del mes',collection.current_period_receivable,'Pendiente del periodo','attention'));const _cob=Number(collection.total_receivable||0);if(_cob>Number(collection.current_period_receivable||0))cards.push(moneyKpi('Cartera cobrable',_cob,`${collection.pending_players||0} Tanners activos pendientes`,'danger'));if(Number(collection.residual_receivable||0)>0)cards.push(moneyKpi('Arrastre anterior',collection.residual_receivable,`${collection.residual_players||0} Tanners con saldo de meses previos`,'attention'));}
  if(can('prospectos')||can('scouting')){cards.push(ringKpi('Fichajes concretados',`${conversion}%`,`${converted}/${prospects.length} convertidos`,conversion));cards.push(iconKpi('Mejor fuente',topCampaign?campaignLabel(topCampaign[0]):'Sin datos',topCampaign?`${topCampaign[1]} registros`:'Aún sin atribución','target'));}
  if(can('patrocinadores'))cards.push(kpi('Marcas activas',sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${renewal.length} por revisar`));
  const attention=[];
  const _cobrable=collection?Number(collection.total_receivable||0):0;
  if(_cobrable>0)attention.push(alerta('Atención','Cartera cobrable',money.format(_cobrable),`${collection.pending_players||0} Tanners activos con saldo por cobrar.`,'danger','/metricas/#cobranza'));
  if(collection&&Number(collection.residual_receivable||0)>0)attention.push(alerta('Atención','Arrastre de meses anteriores',money.format(Number(collection.residual_receivable)),`${collection.residual_players||0} Tanners con saldo de meses previos. Es lo más viejo por cobrar.`,'danger','/metricas/#cobrar'));
  if(collection&&Number(collection.needs_configuration||0)>0)attention.push(alerta('Atención','Cuotas por configurar',collection.needs_configuration,'Se requiere definición antes de cobrar.','','/metricas/#cobranza'));
  if(overdue.length)attention.push(alerta('Atención','Seguimientos vencidos',overdue.length,'Fichajes requiere acción.','danger','/prospectos/'));
  if(open.length)attention.push(alerta('Oportunidad','Talento en seguimiento',open.length,'Niños en proceso de fichaje.','opportunity','/prospectos/'));
  if(renewal.length)attention.push(alerta('Oportunidad','Patrocinios por revisar',renewal.length,'Revisa convenios y renovaciones.','opportunity','/patrocinadores/'));
  if(!attention.length)attention.push(alerta('Bien','Todo en orden','','No detectamos alertas en los módulos que puedes ver.','good'));
  $('hubBody').innerHTML=`<section class="tos-kpis">${cards.slice(0,6).join('')}</section><section class="tos-panel"><div class="tos-panel-head"><h2>Requiere tu atención</h2></div><div class="tos-attention-list">${attention.slice(0,6).join('')}</div></section>`;
  setShellHealth(attention.some(x=>x.includes('Atención'))?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
  setShellSearchItems(players.map(p=>({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||''}`,href:'/jugadores/'})));
}



if(page==='club')await renderClub();else if(page==='direccion')await renderDirection();
