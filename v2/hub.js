import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,setShellSearchItems} from '/v2/shell.js';

const page=document.body.dataset.hub;
const titles={club:'Club',direccion:'Dirección',finanzas:'Finanzas'};
const boot=await bootstrapProtectedShell({active:page,title:titles[page]||'TannerOS'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const safe=(p,fallback=null)=>p.catch(e=>{console.warn('hub widget',e);return fallback;});
const org=ctx.organization_id;

function card(code,title,desc,href,tone='',symbol='T'){
  if(!can(code))return '';
  return `<a class="tos-hub-card ${tone}" href="${href}"><span class="tos-hub-icon">${symbol}</span><div><strong>${title}</strong><span>${desc}</span></div><b>›</b></a>`;
}
function kpi(label,value,sub='',cls=''){return `<article class="tos-kpi ${cls}"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</article>`;}
function alert(tag,title,value,detail,type=''){return `<article class="tos-alert ${type}"><span class="tos-alert-tag">${tag}</span><b>${value?`${title}<br>${value}`:title}</b><small>${detail}</small></article>`;}

async function renderClub(){
  $('hubEyebrow').textContent='EL CORAZÓN DEPORTIVO DEL CLUB';
  $('hubTitle').textContent='Club';
  $('hubSubtitle').textContent='Plantilla, asistencia, convocatorias, captación y calendario.';
  $('hubBody').innerHTML=`<section class="tos-hub-grid">
    ${card('jugadores','Jugadores','Plantilla y fichas Tanner','/v2/jugadores/','','J')}
    ${card('asistencia','Asistencia','Entrenamientos y registro','/v2/asistencia/','blue','A')}
    ${card('callups','Convocatoria','Arma tu convocatoria','/v2/convocatoria/','gold','C')}
    ${card('prospectos','Captación','Seguimiento de talento','/v2/prospectos/','gold','+')}
    ${card('calendario','Calendario','Agenda deportiva','/v2/calendario/','purple','D')}
  </section>`;
}

async function renderDirection(){
  $('hubEyebrow').textContent='SALUD DEL CLUB';
  $('hubTitle').textContent='Dirección';
  $('hubSubtitle').textContent='Lo que conviene revisar hoy. Datos calculados desde Supabase.';
  const [players,collection,prospects,sponsors]=await Promise.all([
    can('jugadores')?safe(rpc('v2_players',{organization_id:org,status_filter:'active'}),[]):[],
    (can('cobranza')||can('contabilidad'))?safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:new Date().toISOString().slice(0,7)+'-01'}),null):null,
    (can('prospectos')||can('scouting'))?safe(rpc('v2_prospects',{organization_id:org,status_filter:null}),[]):[],
    can('patrocinadores')?safe(rpc('v2_sponsors',{organization_id:org}),[]):[]
  ]);
  const open=prospects.filter(p=>!['converted','not_continuing','archived'].includes(p.status));
  const overdue=open.filter(p=>p.next_action_at&&new Date(p.next_action_at)<new Date());
  const renewal=sponsors.filter(s=>['due','soon','overdue','attention'].includes(String(s.renewal_state||'').toLowerCase()));
  const cards=[];
  if(can('jugadores'))cards.push(kpi('Jugadores activos',players.length,'Plantilla V2'));
  if(collection){
    cards.push(kpi('Cobranza',`${collection.collection_rate||0}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,Number(collection.collection_rate||0)>=85?'good':''));
    cards.push(kpi('Cartera del mes',money.format(Number(collection.current_period_receivable||0)),'Pendiente del periodo',Number(collection.current_period_receivable||0)>0?'danger':''));
    cards.push(kpi('Cartera total',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} Tanners pendientes`,Number(collection.total_receivable||0)>0?'danger':''));
  }
  if(can('prospectos')||can('scouting'))cards.push(kpi('Talento abierto',open.length,`${prospects.filter(p=>p.status==='new').length} nuevos`));
  if(can('patrocinadores'))cards.push(kpi('Marcas activas',sponsors.filter(s=>Number(s.active_agreements||0)>0).length,`${renewal.length} por revisar`));
  const attention=[];
  if(collection&&Number(collection.total_receivable||0)>0)attention.push(alert('Atención','Cartera por cobrar',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} jugadores con saldo.`,'danger'));
  if(collection&&Number(collection.needs_configuration||0)>0)attention.push(alert('Atención','Cuotas por configurar',collection.needs_configuration,'Se requiere definición antes de cobrar.'));
  if(overdue.length)attention.push(alert('Atención','Seguimientos vencidos',overdue.length,'Captación requiere acción.','danger'));
  if(open.length)attention.push(alert('Oportunidad','Talento en seguimiento',open.length,'Prospectos activos en el funnel.','opportunity'));
  if(renewal.length)attention.push(alert('Oportunidad','Patrocinios por revisar',renewal.length,'Revisa la ruta de marcas.','opportunity'));
  if(!attention.length)attention.push(alert('Bien','Todo en orden','','No detectamos alertas en los módulos que puedes ver.','good'));
  $('hubBody').innerHTML=`<section class="tos-kpis">${cards.slice(0,6).join('')}</section>
    <section class="tos-panel"><div class="tos-panel-head"><h2>Requiere tu atención</h2></div><div class="tos-attention-list">${attention.slice(0,6).join('')}</div></section>`;
  setShellHealth(attention.some(x=>x.includes('Atención'))?{state:'attention',label:'Requiere atención'}:{state:'ok',label:'Todo en orden'});
  setShellSearchItems(players.map(p=>({label:[p.first_name,p.last_name].filter(Boolean).join(' '),meta:`Jugador · ${p.category||''}`,href:'/v2/jugadores/'})));
}

function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function paymentKey(){return globalThis.crypto?.randomUUID?`pay:${org}:${crypto.randomUUID()}`:`pay:${org}:${Date.now()}:${Math.random().toString(36).slice(2)}`;}

async function renderFinance(){
  $('hubEyebrow').textContent='COBRANZA Y CONTABILIDAD';
  $('hubTitle').textContent='Finanzas';
  $('hubSubtitle').textContent='Caja, cartera y movimientos financieros sin duplicar fuentes de verdad.';
  const [collection,receivables,billingPlayers]=await Promise.all([
    (can('cobranza')||can('contabilidad'))?safe(rpc('v2_collection_snapshot',{organization_id:org,billing_period:new Date().toISOString().slice(0,7)+'-01'}),null):null,
    can('cobranza')?safe(rpc('v2_open_receivables',{organization_id:org}),[]):[],
    can('cobranza')?safe(rpc('v2_billing_players',{organization_id:org}),[]):[]
  ]);
  const byPlayer=new Map();
  receivables.forEach(r=>{
    const key=r.player_id||r.player_name;
    const old=byPlayer.get(key)||{name:r.player_name,amount:0};
    old.amount+=Number(r.balance_due||0);byPlayer.set(key,old);
  });
  const debtors=[...byPlayer.values()].sort((a,b)=>b.amount-a.amount).slice(0,8);
  const kpis=collection?`<section class="tos-kpis">
    ${kpi('Cobranza del mes',`${collection.collection_rate||0}%`,`${collection.covered||0}/${collection.collection_population||0} cubiertos`,Number(collection.collection_rate||0)>=85?'good':'')}
    ${kpi('Cartera del mes',money.format(Number(collection.current_period_receivable||0)),'Pendiente actual',Number(collection.current_period_receivable||0)>0?'danger':'')}
    ${kpi('Cartera total',money.format(Number(collection.total_receivable||0)),`${collection.pending_players||0} Tanners`,Number(collection.total_receivable||0)>0?'danger':'')}
    ${kpi('Por configurar',collection.needs_configuration||0,'Cuotas que requieren definición')}
  </section>`:'';
  const modules=`<section class="tos-hub-grid">
    ${can('cobranza')?`<a class="tos-hub-card" href="#cobranza"><span class="tos-hub-icon">$</span><div><strong>Cobranza</strong><span>Estado de cuenta y morosos</span></div><b>›</b></a>`:''}
    ${card('contabilidad','Contabilidad','Egresos, ajustes y ledger','/v2/contabilidad/','','C')}
    ${can('taquilla')?`<a class="tos-hub-card gold" href="/v2/pedidos/"><span class="tos-hub-icon">T</span><div><strong>Taquilla / operación</strong><span>Pedidos y atención de caja</span></div><b>›</b></a>`:''}
  </section>`;
  const payment=can('cobranza',true)?`<section class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><div><h2>Caja rápida · Cobrar</h2><span class="tos-user-note">El pago se aplica a la deuda más antigua; el excedente queda a favor.</span></div></div>
    <form id="financePaymentForm" class="tos-payment-form">
      <label class="span-2">Tanner<select id="financePaymentPlayer" required><option value="">Selecciona un Tanner</option>${billingPlayers.slice().sort((a,b)=>String(a.player_name).localeCompare(String(b.player_name),'es-MX')).map(p=>`<option value="${p.player_id}" data-fee="${p.base_monthly_fee??''}">${p.player_name}${p.billing_status==='review'?' · revisar cuota':''}</option>`).join('')}</select></label>
      <label>Monto<input id="financePaymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
      <label>Fecha<input id="financePaymentDate" type="date" value="${todayLocal()}" required></label>
      <label>Método<select id="financePaymentMethod"><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label>
      <label>Quién paga<select id="financePayerType"><option value="guardian">Familia / tutor</option><option value="sponsor">Patrocinador</option><option value="player">Jugador</option><option value="organization">Club</option><option value="other">Otro</option></select></label>
      <label>Nombre del pagador<input id="financePayerName" type="text" placeholder="Opcional"></label>
      <label>Referencia<input id="financePaymentReference" type="text" placeholder="Folio o nota"></label>
      <button id="financePaymentSubmit" class="primary span-2" type="submit">Registrar pago</button>
      <div id="financePaymentMessage" class="inline-message hidden span-2"></div>
    </form></section>`:'';
  const list=can('cobranza')?`<section id="cobranza" class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Cartera del club</h2><span class="tos-user-note">${debtors.length?`Top ${debtors.length} saldos`:'Sin saldos'}</span></div><div class="tos-list">${debtors.length?debtors.map(d=>`<div class="tos-list-row"><div><strong>${d.name||'Tanner'}</strong><span>Saldo pendiente</span></div><b style="color:#d23829">${money.format(d.amount)}</b></div>`).join(''):'<div class="tos-empty">Sin cartera pendiente.</div>'}</div></section>`:'';
  $('hubBody').innerHTML=`${kpis}${modules}${payment}${list}`;
  if(collection&&Number(collection.total_receivable||0)>0)setShellHealth({state:'attention',label:'Cobranza pendiente'});

  const form=$('financePaymentForm');
  if(form){
    $('financePaymentPlayer').addEventListener('change',()=>{
      const option=$('financePaymentPlayer').selectedOptions?.[0];
      if(!$('financePaymentAmount').value&&option?.dataset?.fee)$('financePaymentAmount').value=Number(option.dataset.fee)||'';
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=$('financePaymentSubmit'),message=$('financePaymentMessage');
      const playerId=$('financePaymentPlayer').value,amount=Number($('financePaymentAmount').value),date=$('financePaymentDate').value;
      if(!playerId||!Number.isFinite(amount)||amount<=0||!date)return;
      btn.disabled=true;btn.textContent='Registrando…';message.classList.add('hidden');
      try{
        const id=await rpc('v2_post_payment',{
          organization_id:org,player_id:playerId,amount,payment_date:date,method:$('financePaymentMethod').value,
          reference:$('financePaymentReference').value.trim()||null,concept:'Mensualidad',
          payer_type:$('financePayerType').value,payer_name:$('financePayerName').value.trim()||null,idempotency_key:paymentKey()
        });
        await renderFinance();
        const next=$('financePaymentMessage');next.textContent=`Pago registrado · ${String(id).slice(0,8)}…`;next.dataset.type='success';next.classList.remove('hidden');
      }catch(err){
        message.textContent=err?.message||'No se pudo registrar el pago.';message.dataset.type='error';message.classList.remove('hidden');
        btn.disabled=false;btn.textContent='Registrar pago';
      }
    });
  }
}

if(page==='club')await renderClub();
else if(page==='direccion')await renderDirection();
else if(page==='finanzas')await renderFinance();
