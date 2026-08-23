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
  $('hubBody').innerHTML=`<section class="tos-hub-grid">${card('jugadores','Jugadores','Plantilla y fichas Tanner','/jugadores/','','J')}${card('asistencia','Asistencia','Entrenamientos y registro','/asistencia/','blue','A')}${card('callups','Convocatoria','Arma tu convocatoria','/convocatoria/','gold','C')}${card('prospectos','Captación','Seguimiento de talento','/prospectos/','gold','+')}${card('scouting','Scouting','Visorías y radar de talento','/scouting/','','S')}${card('academias','Academias','Inscripciones y operación','/academias/','blue','Ac')}</section>`;
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
  const sortedBillingPlayers=billingPlayers.slice().sort((a,b)=>String(a.player_name).localeCompare(String(b.player_name),'es-MX'));
  const payment=can('cobranza',true)?`<section class="tos-panel tos-quick-payment" style="margin-top:14px"><div class="tos-panel-head"><div><span class="tos-payment-kicker">COBRO EN 3 PASOS</span><h2>Caja rápida</h2><span class="tos-user-note">Busca al Tanner, ajusta el importe y confirma. Acepta pagos completos o parciales.</span></div></div><form id="financePaymentForm" class="tos-payment-form tos-payment-flow" autocomplete="off"><div class="tos-payment-step span-2"><span>1</span><div><strong>Selecciona al Tanner</strong><small>Escribe su nombre para encontrarlo rápido.</small></div></div><div class="tos-player-combobox span-2"><label for="financePaymentPlayerSearch">Buscar Tanner</label><div class="tos-combobox-control"><span class="tos-icon tos-icon-search" aria-hidden="true"></span><input id="financePaymentPlayerSearch" type="search" placeholder="Ej. José Mariano" autocomplete="off" role="combobox" aria-controls="financePlayerResults" aria-expanded="false"><button id="financePlayerClear" type="button" aria-label="Limpiar Tanner" class="hidden">×</button></div><input id="financePaymentPlayer" type="hidden"><div id="financePlayerResults" class="tos-combobox-results hidden" role="listbox"></div></div><div id="financePlayerSummary" class="tos-player-summary hidden span-2"><div><small>Tanner seleccionado</small><strong id="financeSelectedName">—</strong><span id="financeSelectedStatus">Cuota configurada</span></div><div><small>Mensualidad</small><strong id="financeSelectedFee">—</strong></div></div><div class="tos-payment-step span-2"><span>2</span><div><strong>Define cuánto recibiste</strong><small>La cuota es una referencia: puedes registrar un monto parcial.</small></div></div><div class="tos-amount-block"><label>Monto recibido<input id="financePaymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="$0.00" required></label><div class="tos-amount-presets"><button type="button" data-payment-part="full">Cuota completa</button><button type="button" data-payment-part="half">Mitad</button><button type="button" data-payment-part="custom">Otro monto</button></div><small id="financeAmountHelp">Primero selecciona un Tanner.</small></div><label>Concepto<select id="financePaymentConcept"><option value="Mensualidad">Mensualidad</option><option value="Media mensualidad">Media mensualidad</option><option value="Inscripción">Inscripción</option><option value="Otro">Otro</option></select></label><label>Fecha<input id="financePaymentDate" type="date" value="${todayLocal()}" required></label><div class="tos-payment-step span-2"><span>3</span><div><strong>Confirma el pago</strong><small>Agrega sólo los datos necesarios para identificarlo.</small></div></div><label>Método<select id="financePaymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label><label>Quién paga<select id="financePayerType"><option value="guardian">Familia / tutor</option><option value="sponsor">Patrocinador</option><option value="player">Jugador</option><option value="organization">Club</option><option value="other">Otro</option></select></label><label>Nombre del pagador<input id="financePayerName" type="text" maxlength="160" placeholder="Opcional"></label><label>Referencia o nota<input id="financePaymentReference" type="text" maxlength="160" placeholder="Ej. mitad de agosto"></label><div id="financePaymentReview" class="tos-payment-review span-2">Selecciona un Tanner para preparar el cobro.</div><button id="financePaymentSubmit" class="primary span-2 tos-payment-submit" type="submit" disabled>Registrar pago</button><div id="financePaymentMessage" class="inline-message hidden span-2"></div></form></section>`:'';
  const debtRows=debtors.map(d=>`<div class="tos-list-row"><div><strong>${esc(d.name||'Tanner')}</strong><span>Saldo pendiente</span></div><b style="color:#d23829">${money.format(d.amount)}</b></div>`).join('');
  const list=can('cobranza')?`<section id="cobranza" class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Cartera activa del club</h2><span class="tos-user-note">${debtors.length?`Top ${debtors.length} saldos`:'Sin saldos'}</span></div><div class="tos-list">${debtRows||'<div class="tos-empty">Sin cartera activa pendiente.</div>'}</div></section>`:'';
  $('hubBody').innerHTML=`${kpis}${modules}${payment}${list}`;if(collection&&Number(collection.total_receivable||0)>0)setShellHealth({state:'attention',label:'Cobranza pendiente'});
  const form=$('financePaymentForm');if(form){
    const search=$('financePaymentPlayerSearch'),results=$('financePlayerResults'),playerId=$('financePaymentPlayer'),amountInput=$('financePaymentAmount'),concept=$('financePaymentConcept'),submit=$('financePaymentSubmit'),clear=$('financePlayerClear');
    let selected=null;
    const closeResults=()=>{results.classList.add('hidden');search.setAttribute('aria-expanded','false');};
    const updateReview=()=>{
      const amount=Number(amountInput.value),valid=selected&&Number.isFinite(amount)&&amount>0;
      submit.disabled=!valid;
      $('financePaymentReview').innerHTML=valid?`<strong>${esc(selected.player_name)}</strong><span>${money.format(amount)} · ${esc(concept.value)} · se aplicará a la deuda más antigua.</span>`:'Selecciona un Tanner y captura un monto válido.';
      if(valid&&Number(selected.base_monthly_fee)>0){
        const fee=Number(selected.base_monthly_fee),difference=fee-amount;
        $('financeAmountHelp').textContent=Math.abs(difference)<.01?'Corresponde a la cuota completa.':difference>0?`Pago parcial: faltan ${money.format(difference)} respecto a su cuota.`:`Excedente de ${money.format(Math.abs(difference))}; quedará a favor.`;
      }else $('financeAmountHelp').textContent='Monto libre para este cobro.';
    };
    const selectPlayer=p=>{
      if(!p)return;selected=p;playerId.value=p.player_id;search.value=p.player_name;search.setAttribute('readonly','');clear.classList.remove('hidden');
      $('financeSelectedName').textContent=p.player_name;$('financeSelectedFee').textContent=Number(p.base_monthly_fee)>0?money.format(Number(p.base_monthly_fee)):'Sin configurar';$('financeSelectedStatus').textContent=p.billing_status==='review'?'Cuota pendiente de revisión':'Cuota configurada';$('financePlayerSummary').classList.remove('hidden');
      if(Number(p.base_monthly_fee)>0)amountInput.value=Number(p.base_monthly_fee);closeResults();updateReview();
    };
    const resetPlayer=()=>{selected=null;playerId.value='';search.value='';search.removeAttribute('readonly');clear.classList.add('hidden');$('financePlayerSummary').classList.add('hidden');amountInput.value='';search.focus();updateReview();};
    const renderMatches=()=>{
      if(search.readOnly)return;const q=search.value.trim().toLocaleLowerCase('es-MX');const matches=sortedBillingPlayers.filter(p=>!q||String(p.player_name).toLocaleLowerCase('es-MX').includes(q)).slice(0,10);
      results.innerHTML=matches.length?matches.map(p=>`<button type="button" role="option" data-player-id="${esc(p.player_id)}"><strong>${esc(p.player_name)}</strong><span>${Number(p.base_monthly_fee)>0?money.format(Number(p.base_monthly_fee)):'Cuota sin configurar'}${p.billing_status==='review'?' · revisar':''}</span></button>`).join(''):'<div class="tos-empty">No encontramos un Tanner con ese nombre.</div>';
      results.classList.remove('hidden');search.setAttribute('aria-expanded','true');
    };
    search.addEventListener('input',renderMatches);search.addEventListener('focus',renderMatches);clear.addEventListener('click',resetPlayer);
    results.addEventListener('click',e=>{const button=e.target.closest('[data-player-id]');if(button)selectPlayer(sortedBillingPlayers.find(p=>String(p.player_id)===button.dataset.playerId));});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.tos-player-combobox'))closeResults();});
    form.querySelectorAll('[data-payment-part]').forEach(button=>button.addEventListener('click',()=>{
      if(!selected){search.focus();renderMatches();return;}const fee=Number(selected.base_monthly_fee||0),part=button.dataset.paymentPart;
      if(part==='full'&&fee>0){amountInput.value=fee;concept.value='Mensualidad';}
      else if(part==='half'&&fee>0){amountInput.value=(fee/2).toFixed(2).replace(/\.00$/,'');concept.value='Media mensualidad';}
      else{amountInput.focus();amountInput.select();}updateReview();
    }));
    amountInput.addEventListener('input',updateReview);concept.addEventListener('change',updateReview);
    form.addEventListener('submit',async e=>{
      e.preventDefault();const btn=$('financePaymentSubmit'),message=$('financePaymentMessage'),amount=Number(amountInput.value),date=$('financePaymentDate').value,payerType=$('financePayerType').value,payerName=$('financePayerName').value.trim();
      if(!selected||!Number.isFinite(amount)||amount<=0||!date){updateReview();return;}
      if(payerType==='sponsor'&&!payerName){message.textContent='Indica el patrocinador que realiza el pago.';message.dataset.type='error';message.classList.remove('hidden');return;}
      btn.disabled=true;btn.textContent='Registrando…';message.classList.add('hidden');
      try{
        const id=await rpc('v2_post_payment',{organization_id:org,player_id:selected.player_id,amount,payment_date:date,method:$('financePaymentMethod').value,reference:$('financePaymentReference').value.trim()||null,concept:concept.value,payer_type:payerType,payer_name:payerName||null,idempotency_key:paymentKey()});
        await renderFinance();const next=$('financePaymentMessage');next.textContent=`Pago registrado correctamente · ${money.format(amount)}`;next.dataset.type='success';next.classList.remove('hidden');
      }catch(err){message.textContent=err?.message||'No se pudo registrar el pago.';message.dataset.type='error';message.classList.remove('hidden');btn.disabled=false;btn.textContent='Registrar pago';}
    });
  }
}

if(page==='club')await renderClub();else if(page==='direccion')await renderDirection();else if(page==='finanzas')await renderFinance();
