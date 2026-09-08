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
function alert(tag,title,value,detail,type='',href=''){const body=`<span class="tos-alert-tag">${esc(tag)}</span><b>${esc(title)}${value?`<br>${esc(value)}`:''}</b><small>${esc(detail)}</small>`;return href?`<a class="tos-alert ${esc(type)}" href="${esc(href)}">${body}</a>`:`<article class="tos-alert ${esc(type)}">${body}</article>`;}
function countBy(rows,getter){const map=new Map();for(const row of rows||[]){const key=String(getter(row)||'').trim();if(!key)continue;map.set(key,(map.get(key)||0)+1);}return [...map.entries()].sort((a,b)=>b[1]-a[1]);}
// Pone en mayúscula la inicial de cada palabra sin romper los acentos: con
// /\b\w/ la ó no es \w, así que "recomendación" abría un falso límite de
// palabra antes de la n y salía "RecomendacióN". \p{L} sí es Unicode.
function titleCase(text){return String(text||'').replace(/(^|\s)(\p{L})/gu,(m,sep,ch)=>sep+ch.toUpperCase());}
function campaignLabel(value){const code=String(value||'').trim();if(!code)return 'Sin campaña';const known={captacion_porteros_2026:'Captación Porteros',captacion_jugadores_2026:'Captación Jugadores',registro_general_2026:'Registro general'};return known[code]||titleCase(code.replaceAll('_',' '));}

async function renderClub(){
  $('hubEyebrow').textContent='EL CORAZÓN DEPORTIVO DEL CLUB';$('hubTitle').textContent='Club';$('hubSubtitle').textContent='Plantilla, asistencia, convocatorias, captación y calendario.';
  $('hubBody').innerHTML=`<section class="tos-hub-grid">${card('jugadores','Jugadores','Plantilla y fichas Tanner','/jugadores/','','users')}${card('asistencia','Asistencia','Entrenamientos y registro','/asistencia/','blue','check')}${card('callups','Convocatoria','Arma tu convocatoria','/convocatoria/','gold','list')}${card('prospectos','Captación','Seguimiento de talento','/prospectos/','gold','target')}${card('scouting','Scouting','Visorías y radar de talento','/scouting/','','search')}${card('academias','Academias','Inscripciones y operación','/operacion/academias/','blue','academy')}</section>`;
}

async function renderDirection(){
  $('hubEyebrow').textContent='INTELIGENCIA DEL CLUB';$('hubTitle').textContent='Dirección';$('hubSubtitle').textContent='Decisiones deportivas, financieras y de captación desde una sola fuente de verdad.';
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
  if(can('prospectos')||can('scouting')){cards.push(ringKpi('Conversión captación',`${conversion}%`,`${converted}/${prospects.length} convertidos`,conversion));cards.push(iconKpi('Mejor fuente',topCampaign?campaignLabel(topCampaign[0]):'Sin datos',topCampaign?`${topCampaign[1]} registros`:'Aún sin atribución','target'));}
  if(can('patrocinadores'))cards.push(kpi('Marcas activas',sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${renewal.length} por revisar`));
  const attention=[];
  const _cobrable=collection?Number(collection.total_receivable||0):0;
  if(_cobrable>0)attention.push(alert('Atención','Cartera cobrable',money.format(_cobrable),`${collection.pending_players||0} Tanners activos con saldo por cobrar.`,'danger','/finanzas/'));
  if(collection&&Number(collection.residual_receivable||0)>0)attention.push(alert('Atención','Arrastre de meses anteriores',money.format(Number(collection.residual_receivable)),`${collection.residual_players||0} Tanners con saldo de meses previos. Es lo más viejo por cobrar.`,'danger','/finanzas/#cobranza'));
  if(collection&&Number(collection.needs_configuration||0)>0)attention.push(alert('Atención','Cuotas por configurar',collection.needs_configuration,'Se requiere definición antes de cobrar.','','/finanzas/'));
  if(overdue.length)attention.push(alert('Atención','Seguimientos vencidos',overdue.length,'Captación requiere acción.','danger','/prospectos/'));
  if(open.length)attention.push(alert('Oportunidad','Talento en seguimiento',open.length,'Prospectos activos en el funnel.','opportunity','/prospectos/'));
  if(renewal.length)attention.push(alert('Oportunidad','Patrocinios por revisar',renewal.length,'Revisa convenios y renovaciones.','opportunity','/patrocinadores/'));
  if(!attention.length)attention.push(alert('Bien','Todo en orden','','No detectamos alertas en los módulos que puedes ver.','good'));
  $('hubBody').innerHTML=`<section class="tos-kpis">${cards.slice(0,6).join('')}</section><section class="tos-panel"><div class="tos-panel-head"><h2>Requiere tu atención</h2></div><div class="tos-attention-list">${attention.slice(0,6).join('')}</div></section>`;
  setShellHealth(attention.some(x=>x.includes('Atención'))?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
  setShellSearchItems(players.map(p=>({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||''}`,href:'/jugadores/'})));
}


async function renderFinance(){
  $('hubEyebrow').textContent='COBRANZA Y CONTABILIDAD';$('hubTitle').textContent='Finanzas';$('hubSubtitle').textContent='Caja, cartera activa y movimientos financieros desde el mismo ledger.';
  const [collection,receivables,searchIdx]=await Promise.all([
    (can('cobranza')||can('contabilidad'))?safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:new Date().toISOString().slice(0,7)+'-01'}),null):null,
    can('cobranza')?safe(rpc('v2_open_receivables',{organization_id:org}),[]):[],
    can('cobranza')?safe(rpc('v2_search_index',{organization_id:org}),[]):[]
  ]);
  const _today=new Date().toISOString().slice(0,10);
  // La asignación de pagos sólo toca cargos desde 2026-09-01 (frontera de la
  // migración). Desde que la asignación de pagos dejó de respetar ese corte, ese
  // saldo sí se concilia y sí se cobra: se separa sólo por antigüedad, porque el
  // arrastre es el que urge. Fuera de cobranza quedan únicamente las bajas.
  const CORTE=String((collection&&collection.billing_cutover)||'2026-09-01').slice(0,10);
  const vencidos=(receivables||[]).filter(r=>{const d=r.due_date||r.billing_period;return d&&String(d).slice(0,10)<_today&&Number(r.balance_due||0)>0;});
  const esBaja=r=>r.player_status&&r.player_status!=='active';
  const esArrastre=r=>String(r.billing_period||'').slice(0,10)<CORTE;
  const _ovd=vencidos.filter(r=>!esBaja(r));
  const bajas=vencidos.filter(esBaja),arrastre=_ovd.filter(esArrastre);
  const suma=list=>list.reduce((a,r)=>a+Number(r.balance_due||0),0);
  const abiertos=(receivables||[]).filter(r=>Number(r.balance_due||0)>0);
  const cobrables=abiertos.filter(r=>!esBaja(r));
  const cobrablesTotal=suma(cobrables),cobrablesSet=new Set(cobrables.map(r=>r.player_id||r.player_name));
  const fueraTotal=suma(abiertos)-cobrablesTotal;
  const _ovdTotal=suma(_ovd);const _ovdSet=new Set(_ovd.map(r=>r.player_id||r.player_name));
  const bajasSet=new Set(bajas.map(r=>r.player_id||r.player_name)),arrastreSet=new Set(arrastre.map(r=>r.player_id||r.player_name));const _byP={};_ovd.forEach(r=>{const k=r.player_id||r.player_name;_byP[k]=(_byP[k]||0)+1;});const _multi=Object.values(_byP).filter(n=>n>=2).length;const _rate=Number((collection&&collection.collection_rate)||0);const _alerts=[];
  const _aparte=[];
  if(bajasSet.size)_aparte.push({t:`${bajasSet.size} Tanner${bajasSet.size>1?'s':''} dado${bajasSet.size>1?'s':''} de baja con saldo`,d:`${money.format(suma(bajas))} · fuera de cobranza. Cancélalo con un ajuste autorizado.`,cta:'Ajustar'});
  if(arrastreSet.size)_alerts.push({t:`${arrastreSet.size} Tanner${arrastreSet.size>1?'s':''} con saldo de meses anteriores`,d:`${money.format(suma(arrastre))} · lo más viejo, cóbralo primero`,tone:'danger'});if(_ovdSet.size>0)_alerts.push({t:`${_ovdSet.size} Tanner${_ovdSet.size>1?'s':''} con pagos vencidos`,d:`${money.format(_ovdTotal)} por cobrar de Tanners activos`,tone:'danger'});if(_multi>0)_alerts.push({t:`${_multi} Tanner${_multi>1?'s':''} con 2+ meses vencidos`,d:'Prioriza el cobro por antigüedad',tone:'danger'});if(_rate>0&&_rate<85)_alerts.push({t:`Cobranza en ${_rate}%`,d:'Por debajo del objetivo (85%)',tone:'warn'});const _ajusteHref=can('contabilidad')?'/contabilidad/#ajustes':'';const _aparteRow=a=>`<span style="display:flex;flex-direction:column;gap:2px"><strong style="color:#4a585e;font-size:13.5px;font-weight:600">${esc(a.t)}</strong><span style="color:#7d8a8f;font-size:12px;line-height:1.4">${esc(a.d)}</span></span>${_ajusteHref?`<span style="color:#4a585e;font-weight:600;font-size:13px;white-space:nowrap">${esc(a.cta)} \u2192</span>`:''}`;const _aparteStyle='display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;background:#f4f6f5;border:1px solid #e2e7e5;text-decoration:none';const _aparteHtml=_aparte.length?`<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px"><span style="color:#8a949a;font-size:11.5px;font-weight:600;letter-spacing:.02em;margin-top:6px">FUERA DE LA COBRANZA DEL MES</span>${_aparte.map(a=>_ajusteHref?`<a href="${_ajusteHref}" style="${_aparteStyle}">${_aparteRow(a)}</a>`:`<div style="${_aparteStyle}">${_aparteRow(a)}</div>`).join('')}</div>`:'';
  const phoneMap={};(searchIdx||[]).forEach(p=>{if(p&&p.id&&p.phones)phoneMap[p.id]=String(p.phones).split(' ')[0];});const byPlayer=new Map();for(const r of _ovd){const key=r.player_id||r.player_name,old=byPlayer.get(key)||{name:r.player_name,amount:0,playerId:r.player_id||null,oldest:null};old.amount+=Number(r.balance_due||0);const dd=r.due_date||r.billing_period;if(dd&&(!old.oldest||String(dd)<old.oldest))old.oldest=String(dd);byPlayer.set(key,old);}const debtors=[...byPlayer.values()].sort((a,b)=>String(a.oldest||'9999').localeCompare(String(b.oldest||'9999'))||b.amount-a.amount);
  const kpis=collection?`<section class="tos-kpis">${kpi('Cobranza del mes',`${collection.collection_rate||0}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,Number(collection.collection_rate||0)>=85?'good':'')}${kpi('Cartera del mes',money.format(Number(collection.current_period_receivable||0)),'Pendiente actual',Number(collection.current_period_receivable||0)>0?'danger':'')}${kpi('Cartera cobrable',money.format(cobrablesTotal),fueraTotal>0?`${cobrablesSet.size} Tanners activos · ${money.format(fueraTotal)} aparte`:`${cobrablesSet.size} Tanners activos`,cobrablesTotal>0?'danger':'')}${kpi('Por configurar',collection.needs_configuration||0,'Cuotas que requieren definición')}</section>`:'';
  const modules=`<section class="tos-hub-grid">${can('cobranza')?`<a class="tos-hub-card" href="#cobranza"><span class="tos-hub-icon" aria-hidden="true">${shellIcon('wallet')}</span><div class="tos-hub-copy"><strong>Cobranza</strong><span>Estado de cuenta y saldos</span></div><span class="tos-hub-chevron" aria-hidden="true">${shellIcon('chevronRight')}</span></a>`:''}${card('taquilla','Taquilla','Cobros, ingresos y egresos del día','/taquilla/','gold','cashier')}${card('contabilidad','Contabilidad','Movimientos, ajustes y trazabilidad','/contabilidad/','','ledger')}${card('estacionamiento','Estacionamiento','Gafetes: solicitudes y padrón','/estacionamiento/','blue','car')}${card('tienda','Tienda','Pedidos, cobrado y rentabilidad','/pedidos/','blue','bag')}${can('tienda')?`<a class="tos-hub-card" href="/catalogo/"><span class="tos-hub-icon" aria-hidden="true">${shellIcon('box')}</span><div class="tos-hub-copy"><strong>Catálogo</strong><span>Kits, productos y precios</span></div><span class="tos-hub-chevron" aria-hidden="true">${shellIcon('chevronRight')}</span></a>`:''}</section>`;
  const debtRows=debtors.map(d=>{const ph=d.playerId&&phoneMap[d.playerId]?String(phoneMap[d.playerId]).replace(/\D/g,''):'';const waMsg=encodeURIComponent(`Hola, le recordamos el pago pendiente de ${d.name} en Tannery City por ${money.format(d.amount)}. ¡Gracias!`);const wa=ph?`<a href="https://wa.me/${ph}?text=${waMsg}" target="_blank" rel="noopener" style="background:#25D366;color:#fff;padding:5px 11px;border-radius:8px;font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap">WhatsApp</a>`:'';const cob=d.playerId?`<a href="/v2/taquilla/?action=cobrar&player=${d.playerId}&amount=${Math.round(d.amount)}&name=${encodeURIComponent(d.name||'')}" style="background:#087d8e;color:#fff;padding:5px 11px;border-radius:8px;font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap">Cobrar</a>`:'';const since=d.oldest?` · desde ${d.oldest}`:'';const ver=d.playerId?`<a href="/tanner/?id=${encodeURIComponent(d.playerId)}" style="background:#eef2f1;color:#31525c;padding:5px 11px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap">Ver estado</a>`:'';return `<div class="tos-list-row"><div><strong>${esc(d.name||'Tanner')}</strong><span>Saldo pendiente${since}</span></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><b style="color:#d23829">${money.format(d.amount)}</b><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${ver}${wa}${cob}</div></div></div>`;}).join('');
  const list=can('cobranza')?`<section id="cobranza" class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Vencidos por cobrar</h2><span class="tos-user-note">${debtors.length?`${debtors.length} con saldo`:'Sin saldos'}</span></div><div class="tos-list">${debtRows||'<div class="tos-empty">Sin pagos vencidos. Todo al corriente.</div>'}</div></section>`:'';
  const attentionBlock=(_alerts.length||_aparte.length)?`<section class="tos-panel" style="margin-top:14px;padding:16px 18px"><strong style="display:block;margin-bottom:10px;font-size:15px">Necesita tu atención</strong><div style="display:flex;flex-direction:column;gap:8px">${_alerts.map(a=>{const col=a.tone==='danger'?'#d23829':'#a9791b';const bg=a.tone==='danger'?'#fdeceb':'#fbf3e2';const bd=a.tone==='danger'?'#f5c6c2':'#ecd9a8';return `<a href="#cobranza" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:${bg};border:1px solid ${bd};text-decoration:none"><span style="display:flex;flex-direction:column"><strong style="color:${col};font-size:14px">${esc(a.t)}</strong><span style="color:#66737a;font-size:12.5px">${esc(a.d)}</span></span><span style="color:${col};font-weight:800;font-size:13px;white-space:nowrap">Ver →</span></a>`;}).join('')}</div>${_aparteHtml}</section>`:'';$('hubBody').innerHTML=`${kpis}${attentionBlock}${modules}${list}`;if(collection&&Number(collection.total_receivable||0)>0)setShellHealth({state:'attention',label:'Cobranza pendiente'});
}

if(page==='club')await renderClub();else if(page==='direccion')await renderDirection();else if(page==='finanzas')await renderFinance();
