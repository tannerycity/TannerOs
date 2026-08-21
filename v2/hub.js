import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,setShellSearchItems} from '/v2/shell.js';

const page=document.body.dataset.hub;
const titles={club:'Club',direccion:'Dirección',finanzas:'Finanzas'};
const boot=await bootstrapProtectedShell({active:page,title:titles[page]||'TannerOS'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const safe=(p,fallback=null)=>p.catch(e=>{console.warn('hub widget',e);return fallback;});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const org=ctx.organization_id;

function card(code,title,desc,href,tone='',symbol='T'){if(!can(code))return '';return `<a class="tos-hub-card ${esc(tone)}" href="${esc(href)}"><span class="tos-hub-icon">${esc(symbol)}</span><div><strong>${esc(title)}</strong><span>${esc(desc)}</span></div><b>›</b></a>`;}
function kpi(label,value,sub='',cls=''){return `<article class="tos-kpi ${esc(cls)}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;}
function alert(tag,title,value,detail,type='',href=''){const body=`<span class="tos-alert-tag">${esc(tag)}</span><b>${esc(title)}${value?`<br>${esc(value)}`:''}</b><small>${esc(detail)}</small>`;return href?`<a class="tos-alert ${esc(type)}" href="${esc(href)}">${body}</a>`:`<article class="tos-alert ${esc(type)}">${body}</article>`;}
function countBy(rows,getter){const map=new Map();for(const row of rows||[]){const key=String(getter(row)||'').trim();if(!key)continue;map.set(key,(map.get(key)||0)+1);}return [...map.entries()].sort((a,b)=>b[1]-a[1]);}
function campaignLabel(value){const code=String(value||'').trim();if(!code)return 'Sin campaña';const known={captacion_porteros_2026:'Captación Porteros',captacion_jugadores_2026:'Captación Jugadores',registro_general_2026:'Registro general'};return known[code]||code.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}

async function renderClub(){
  $('hubEyebrow').textContent='EL CORAZÓN DEPORTIVO DEL CLUB';$('hubTitle').textContent='Club';$('hubSubtitle').textContent='Plantilla, asistencia, convocatorias, captación y calendario.';
  $('hubBody').innerHTML=`<section class="tos-hub-grid">${card('jugadores','Jugadores','Plantilla y fichas Tanner','/jugadores/','','J')}${card('asistencia','Asistencia','Entrenamientos y registro','/asistencia/','blue','A')}${card('callups','Convocatoria','Arma tu convocatoria','/convocatoria/','gold','C')}${card('prospectos','Captación','Seguimiento de talento','/prospectos/','gold','+')}${card('scouting','Scouting','Visorías y radar de talento','/scouting/','','S')}${card('calendario','Calendario','Agenda deportiva','/calendario/','purple','D')}${card('academias','Academias','Inscripciones y operación','/academias/','blue','Ac')}</section>`;
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
  if(can('jugadores'))cards.push(kpi('Jugadores activos',players.length,topCategory?`${topCategory[0]} · ${topCategory[1]} Tanners`:'Plantilla actual'));
  if(collection){cards.push(kpi('Cobranza',`${collection.collection_rate||0}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,Number(collection.collection_rate||0)>=85?'good':''));cards.push(kpi('Cartera del mes',money.format(Number(collection.current_period_receivable||0)),'Pendiente del periodo',Number(collection.current_period_receivable||0)>0?'danger':''));cards.push(kpi('Cartera activa',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} Tanners activos pendientes`,Number(collection.total_receivable||0)>0?'danger':''));}
  if(can('prospectos')||can('scouting')){cards.push(kpi('Conversión captación',`${conversion}%`,`${converted}/${prospects.length} convertidos`));cards.push(kpi('Mejor fuente',topCampaign?campaignLabel(topCampaign[0]):'Sin datos',topCampaign?`${topCampaign[1]} registros`:'Aún sin atribución'));}
  if(can('patrocinadores'))cards.push(kpi('Marcas activas',sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${renewal.length} por revisar`));
  const attention=[];
  if(collection&&Number(collection.total_receivable||0)>0)attention.push(alert('Atención','Cartera activa por cobrar',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} Tanners activos con saldo.`,'danger','/finanzas/'));
  if(collection&&Number(collection.needs_configuration||0)>0)attention.push(alert('Atención','Cuotas por configurar',collection.needs_configuration,'Se requiere definición antes de cobrar.','','/finanzas/'));
  if(overdue.length)attention.push(alert('Atención','Seguimientos vencidos',overdue.length,'Captación requiere acción.','danger','/prospectos/'));
  if(open.length)attention.push(alert('Oportunidad','Talento en seguimiento',open.length,'Prospectos activos en el funnel.','opportunity','/prospectos/'));
  if(renewal.length)attention.push(alert('Oportunidad','Patrocinios por revisar',renewal.length,'Revisa convenios y renovaciones.','opportunity','/patrocinadores/'));
  if(!attention.length)attention.push(alert('Bien','Todo en orden','','No detectamos alertas en los módulos que puedes ver.','good'));
  $('hubBody').innerHTML=`<section class="tos-kpis">${cards.slice(0,6).join('')}</section><section class="tos-panel"><div class="tos-panel-head"><h2>Requiere tu atención</h2></div><div class="tos-attention-list">${attention.slice(0,6).join('')}</div></section>`;
  setShellHealth(attention.some(x=>x.includes('Atención'))?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
  setShellSearchItems(players.map(p=>({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||''}`,href:'/jugadores/'})));
}

function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function paymentKey(){return globalThis.crypto?.randomUUID?`pay:${org}:${crypto.randomUUID()}`:`pay:${org}:${Date.now()}:${Math.random().toString(36).slice(2)}`;}

async function renderFinance(){
  $('hubEyebrow').textContent='COBRANZA Y CONTABILIDAD';$('hubTitle').textContent='Finanzas';$('hubSubtitle').textContent='Caja, cartera activa y movimientos financieros desde el mismo ledger.';
  const [collection,receivables,billingPlayers]=await Promise.all([
    (can('cobranza')||can('contabilidad'))?safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:new Date().toISOString().slice(0,7)+'-01'}),null):null,
    can('cobranza')?safe(rpc('v2_open_receivables',{organization_id:org}),[]):[],
    can('cobranza')?safe(rpc('v2_billing_players',{organization_id:org}),[]):[]
  ]);
  const byPlayer=new Map();for(const r of receivables){const key=r.player_id||r.player_name,old=byPlayer.get(key)||{name:r.player_name,amount:0};old.amount+=Number(r.balance_due||0);byPlayer.set(key,old);}const debtors=[...byPlayer.values()].sort((a,b)=>b.amount-a.amount).slice(0,8);
  const kpis=collection?`<section class="tos-kpis">${kpi('Cobranza del mes',`${collection.collection_rate||0}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,Number(collection.collection_rate||0)>=85?'good':'')}${kpi('Cartera del mes',money.format(Number(collection.current_period_receivable||0)),'Pendiente actual',Number(collection.current_period_receivable||0)>0?'danger':'')}${kpi('Cartera activa',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} Tanners activos`,Number(collection.total_receivable||0)>0?'danger':'')}${kpi('Por configurar',collection.needs_configuration||0,'Cuotas que requieren definición')}</section>`:'';
  const modules=`<section class="tos-hub-grid">${can('cobranza')?'<a class="tos-hub-card" href="#cobranza"><span class="tos-hub-icon">$</span><div><strong>Cobranza</strong><span>Estado de cuenta y saldos</span></div><b>›</b></a>':''}${card('taquilla','Taquilla','Cobros, ingresos y egresos del día','/taquilla/','gold','T')}${card('contabilidad','Contabilidad','Ledger, ajustes y trazabilidad','/contabilidad/','','C')}${card('tienda','Pedidos','Ventas, cobrado y rentabilidad','/pedidos/','blue','P')}</section>`;
  const playerOptions=billingPlayers.slice().sort((a,b)=>String(a.player_name).localeCompare(String(b.player_name),'es-MX')).map(p=>`<option value="${esc(p.player_id)}" data-fee="${Number(p.base_monthly_fee??0)}">${esc(p.player_name)}${p.billing_status==='review'?' · revisar cuota':''}</option>`).join('');
  const payment=can('cobranza',true)?`<section class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><div><h2>Caja rápida · Cobrar</h2><span class="tos-user-note">El pago se aplica a la deuda más antigua; el excedente queda a favor.</span></div></div><form id="financePaymentForm" class="tos-payment-form"><label class="span-2">Tanner<select id="financePaymentPlayer" required><option value="">Selecciona un Tanner</option>${playerOptions}</select></label><label>Monto<input id="financePaymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label><label>Fecha<input id="financePaymentDate" type="date" value="${todayLocal()}" required></label><label>Método<select id="financePaymentMethod"><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label><label>Quién paga<select id="financePayerType"><option value="guardian">Familia / tutor</option><option value="sponsor">Patrocinador</option><option value="player">Jugador</option><option value="organization">Club</option><option value="other">Otro</option></select></label><label>Nombre del pagador<input id="financePayerName" type="text" maxlength="160" placeholder="Opcional"></label><label>Referencia<input id="financePaymentReference" type="text" maxlength="160" placeholder="Folio o nota"></label><button id="financePaymentSubmit" class="primary span-2" type="submit">Registrar pago</button><div id="financePaymentMessage" class="inline-message hidden span-2"></div></form></section>`:'';
  const debtRows=debtors.map(d=>`<div class="tos-list-row"><div><strong>${esc(d.name||'Tanner')}</strong><span>Saldo pendiente</span></div><b style="color:#d23829">${money.format(d.amount)}</b></div>`).join('');
  const list=can('cobranza')?`<section id="cobranza" class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Cartera activa del club</h2><span class="tos-user-note">${debtors.length?`Top ${debtors.length} saldos`:'Sin saldos'}</span></div><div class="tos-list">${debtRows||'<div class="tos-empty">Sin cartera activa pendiente.</div>'}</div></section>`:'';
  $('hubBody').innerHTML=`${kpis}${modules}${payment}${list}`;if(collection&&Number(collection.total_receivable||0)>0)setShellHealth({state:'attention',label:'Cobranza pendiente'});
  const form=$('financePaymentForm');if(form){$('financePaymentPlayer').addEventListener('change',()=>{const option=$('financePaymentPlayer').selectedOptions?.[0];if(!$('financePaymentAmount').value&&Number(option?.dataset?.fee)>0)$('financePaymentAmount').value=Number(option.dataset.fee);});form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('financePaymentSubmit'),message=$('financePaymentMessage'),playerId=$('financePaymentPlayer').value,amount=Number($('financePaymentAmount').value),date=$('financePaymentDate').value,payerType=$('financePayerType').value,payerName=$('financePayerName').value.trim();if(!playerId||!Number.isFinite(amount)||amount<=0||!date)return;if(payerType==='sponsor'&&!payerName){message.textContent='Indica el patrocinador que realiza el pago.';message.dataset.type='error';message.classList.remove('hidden');return;}btn.disabled=true;btn.textContent='Registrando…';message.classList.add('hidden');try{const id=await rpc('v2_post_payment',{organization_id:org,player_id:playerId,amount,payment_date:date,method:$('financePaymentMethod').value,reference:$('financePaymentReference').value.trim()||null,concept:'Mensualidad',payer_type:payerType,payer_name:payerName||null,idempotency_key:paymentKey()});await renderFinance();const next=$('financePaymentMessage');next.textContent=`Pago registrado · ${String(id).slice(0,8)}…`;next.dataset.type='success';next.classList.remove('hidden');}catch(err){message.textContent=err?.message||'No se pudo registrar el pago.';message.dataset.type='error';message.classList.remove('hidden');btn.disabled=false;btn.textContent='Registrar pago';}});}
}

if(page==='club')await renderClub();else if(page==='direccion')await renderDirection();else if(page==='finanzas')await renderFinance();
