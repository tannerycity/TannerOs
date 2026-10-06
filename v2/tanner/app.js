import {supabase,bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,shellIcon} from '/v2/shell.js';
import {getSignedPhotoUrl} from '/v2/photo-cache.js';

// El shell valida el módulo activo, pero un estado de cuenta lo abre tanto
// Cobranza como Contabilidad. Se entra con 'inicio' (que el shell exceptúa) y
// el permiso real lo impone el RPC, que exige billing o accounting (desde n2).
const boot=await bootstrapProtectedShell({active:'inicio',title:'Estado de cuenta'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const playerId=new URLSearchParams(location.search).get('id');

const CHARGE_LABEL={monthly_fee:'Mensualidad',late_fee:'Recargo',academy_fee:'Academia',uniform:'Uniforme',parking_pass:'Gafete',other:'Otro cargo'};
const DOC_LABEL={birth_certificate:'Acta de nacimiento',curp:'CURP',studies:'Constancia de estudios',photo:'Fotografía',id:'Identificación'};
const STATUS_LABEL={active:'Activo',withdrawn:'Baja',paused:'En pausa',archived:'Archivado'};
const chargeLabel=t=>CHARGE_LABEL[t]||'Cargo';
const docLabel=t=>DOC_LABEL[t]||String(t||'').replace(/_/g,' ');

function fmtDate(value){
  if(!value)return '';
  const d=new Date(`${String(value).slice(0,10)}T12:00:00`);
  if(Number.isNaN(d.getTime()))return String(value);
  return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(d);
}
function initials(p){
  return [p.first_name,p.last_name].filter(Boolean).map(s=>String(s).trim()[0]||'').join('').toUpperCase().slice(0,2)||'T';
}
// Una foto por Tanner: se firma sola, sin lote, y se prefiere la miniatura.
async function signPhoto(p){
  const path=p.photo_thumb_path||p.photo_path;
  if(!path)return '';
  try{
    return await getSignedPhotoUrl(supabase,p.photo_bucket||'tanneros-private',path)||'';
  }catch(e){return '';}
}

function headBlock(p,photoUrl){
  const face=photoUrl?`<img src="${esc(photoUrl)}" alt="">`:`<b aria-hidden="true">${esc(initials(p))}</b>`;
  const name=[p.first_name,p.last_name].filter(Boolean).join(' ');
  const chips=[];
  if(p.category)chips.push(`<span class="tan-chip">${esc(p.category)}</span>`);
  chips.push(`<span class="tan-chip" ${p.status!=='active'?'data-tone="off"':''}>${esc(STATUS_LABEL[p.status]||p.status||'')}</span>`);
  if(p.jersey_number)chips.push(`<span class="tan-chip">#${esc(p.jersey_number)}</span>`);
  // La fecha de ingreso al club que capturó Presidencia manda. La primera
  // inscripción sólo cubre mientras no haya una: en los migrados es el día de
  // la migración, no el día en que entraron.
  const desde=p.joined_at||p.enrolled_on;
  if(desde)chips.push(`<span class="tan-chip">En el club desde ${esc(fmtDate(desde))}</span>`);
  return `<section class="tan-head"><div class="tan-face">${face}</div><div class="tan-id"><h1>${esc(name)}</h1><div class="tan-meta">${chips.join('')}</div></div></section>`;
}

function balanceBlock(data){
  const s=data.summary||{},p=data.player||{};
  const saldo=Number(s.balance||0),aFavor=Number(s.credit_available||0),retenido=Number(s.credit_held||0);
  // Un saldo a favor no es deuda: se muestra como tal en vez de "$0".
  const neto=saldo>0?saldo:aFavor>0?-aFavor:0;
  const state=saldo>0?'due':aFavor>0?'credit':'clear';
  const titulo=saldo>0?'Saldo pendiente':aFavor>0?'Saldo a favor':'Sin adeudo';
  const cifra=money.format(Math.abs(neto));
  const partes=(s.by_type||[]).map(t=>`<div class="tan-split-item"><span>${esc(chargeLabel(t.type))}</span><b>${money.format(Number(t.pending||0))}</b></div>`).join('');
  const sub=saldo>0
    ? `${(s.by_type||[]).length} concepto${(s.by_type||[]).length===1?'':'s'}${s.oldest_due?` · el más antiguo desde ${fmtDate(s.oldest_due)}`:''}`
    : aFavor>0?'Pagado por adelantado, se aplicará al próximo cargo':'Todo al corriente';

  const tel=(data.player?.guardians||[]).find(g=>g.phone)?.phone||'';
  const acciones=[];
  if(saldo>0&&can('taquilla',true))acciones.push(`<a class="tan-btn" data-kind="pay" href="/taquilla/?action=cobrar&player=${encodeURIComponent(p.id)}&amount=${Math.round(saldo)}&name=${encodeURIComponent([p.first_name,p.last_name].filter(Boolean).join(' '))}">Cobrar ${money.format(saldo)}</a>`);
  if(saldo>0&&tel){
    const msg=encodeURIComponent(`Hola, le recordamos el pago pendiente de ${[p.first_name,p.last_name].filter(Boolean).join(' ')} en Tannery City por ${money.format(saldo)}. ¡Gracias!`);
    acciones.push(`<a class="tan-btn" data-kind="wa" target="_blank" rel="noopener" href="https://wa.me/${String(tel).replace(/\D/g,'')}?text=${msg}">WhatsApp</a>`);
  }
  if(data.canAdjust){
    if(saldo>0)acciones.push(`<button type="button" class="tan-btn" data-kind="ghost" data-pres="ajustar">Ajustar saldo</button>`);
    acciones.push(`<button type="button" class="tan-btn" data-kind="ghost" data-pres="cargo">Agregar cargo</button>`);
    if(saldo>0&&aFavor>0)acciones.push(`<button type="button" class="tan-btn" data-kind="ghost" data-pres="favor">Aplicar ${money.format(aFavor)} a favor</button>`);
  }
  if(can('jugadores'))acciones.push(`<a class="tan-btn" data-kind="ghost" href="/jugadores/?player=${encodeURIComponent(p.id)}">Ver ficha</a>`);

  // Explica de dónde sale un saldo que parece no cuadrar tras un cobro.
  const notas=[];
  if(aFavor>0&&saldo>0)notas.push({t:`${money.format(aFavor)} a favor sin aplicar`,d:'Hay un pago con saldo sobrante que todavía no cubre ningún cargo abierto.'});
  if(retenido>0)notas.push({t:`${money.format(retenido)} de crédito retenido`,d:'Pago migrado que requiere conciliación manual antes de aplicarse.'});
  const notasHtml=notas.map(n=>`<div class="tan-note"><span class="tan-dot" style="background:#d9e9ec;color:#0c5163">${shellIcon('wallet')}</span><span><strong>${esc(n.t)}</strong><span>${esc(n.d)}</span></span></div>`).join('');

  return `<section class="tan-balance" data-state="${state}"><span>${titulo}</span><strong>${cifra}</strong><small>${esc(sub)}</small>${partes?`<div class="tan-split">${partes}</div>`:''}${acciones.length?`<div class="tan-actions">${acciones.join('')}</div>`:''}${notasHtml}</section>`;
}

// Un saldo corriente negativo es dinero a favor del Tanner, no un número roto.
function saldoTexto(v){
  if(v>0.004)return `saldo ${money.format(v)}`;
  if(v<-0.004)return `${money.format(Math.abs(v))} a favor`;
  return 'al corriente';
}
// Tarjetero por mes: la pregunta "¿de qué meses debe este niño?" no se contesta
// leyendo movimientos uno por uno. Se arma agrupando los cargos que ya trae el
// estado de cuenta, sin pedirle nada más al servidor.
function monthsBlock(data){
  const hoy=new Date().toISOString().slice(0,10);
  const meses=new Map();
  (data.ledger||[]).filter(m=>m.kind==='charge'&&m.period).forEach(m=>{
    const k=String(m.period).slice(0,7);
    const acc=meses.get(k)||{key:k,cargado:0,saldo:0,vence:'',conceptos:[]};
    acc.cargado+=Number(m.amount||0);
    acc.saldo+=Number(m.charge_balance||0);
    if(m.date&&String(m.date)>acc.vence)acc.vence=String(m.date).slice(0,10);
    if(Number(m.charge_balance||0)>0)acc.conceptos.push({l:chargeLabel(m.subtype),v:Number(m.charge_balance||0)});
    meses.set(k,acc);
  });
  const filas=[...meses.values()].sort((a,b)=>b.key.localeCompare(a.key));
  if(!filas.length)return '';
  const conSaldo=filas.filter(f=>f.saldo>0.004);
  const nombre=k=>{
    const d=new Date(`${k}-01T12:00:00`);
    return Number.isNaN(d.getTime())?k:new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','');
  };
  const cards=filas.map(f=>{
    const debe=f.saldo>0.004,vencido=debe&&f.vence&&f.vence<hoy;
    const estado=!debe?'pagado':vencido?'vencido':'pendiente';
    const pie=!debe?'Pagado':vencido?'Vencido':'Por vencer';
    const cifra=debe?money.format(f.saldo):money.format(f.cargado);
    const titulo=debe?`Debe ${money.format(f.saldo)} de ${[...new Set(f.conceptos.sort((a,b)=>b.v-a.v).map(c=>c.l))].join(' y ').toLowerCase()||'mensualidad'}`:`Pagado · ${money.format(f.cargado)}`;
    return `<div class="tan-mes" data-state="${estado}" title="${esc(titulo)}"><span class="tan-mes-nom">${esc(nombre(f.key))}</span><b>${cifra}</b><span class="tan-mes-pie">${pie}</span>${f.key.slice(0,4)!==String(new Date().getFullYear())?`<small>${esc(f.key.slice(0,4))}</small>`:''}</div>`;
  }).join('');
  const resumen=conSaldo.length
    ? `debe ${conSaldo.length} mes${conSaldo.length===1?'':'es'}`
    : 'sin meses pendientes';
  return `<section class="tan-section"><div class="tan-section-head"><h2>Por mes</h2><span>${esc(resumen)}</span></div><div class="tan-meses">${cards}</div></section>`;
}

function ledgerBlock(data){
  const rows=(data.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted');
  if(!rows.length)return '';
  const html=rows.map(m=>{
    const monto=Number(m.amount||0),cargo=m.kind==='charge';
    const titulo=cargo?`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}`:'Pago recibido';
    const detalle=cargo
      ? `${fmtDate(m.date)}${m.charge_balance>0?` · quedan ${money.format(Number(m.charge_balance))}`:' · liquidado'}`
      : `${fmtDate(m.date)}${m.method?` · ${esc(m.method)}`:''}${m.reference?` · ${esc(m.reference)}`:''}`;
    // En un historial de pagos, "quién lo cobró" es la mitad del dato. El club
    // encontró un movimiento que decía "Pagó: Michel" y lo había capturado la
    // cuenta iPad; aquí no se repite ese error: el nombre tecleado no se
    // presenta a secas, la cuenta real está a un toque.
    const id=m.id||m.ref_id;
    const audit=(!cargo&&id&&puedeAuditar)
      ?`<button type="button" class="tan-audit" data-audit="${esc(id)}">¿quién lo cobró?</button>`:'';
    // Presidencia corrige aquí mismo: el cargo que todavía se debe se ajusta y
    // el pago mal capturado se revierte. Siempre con motivo; nada se borra.
    const pres=!data.canAdjust||!id?''
      :cargo?(Number(m.charge_balance||0)>0?`<button type="button" class="tan-audit tan-pres" data-pres="ajustar" data-charge="${esc(id)}">Ajustar</button>`:'')
      :`<button type="button" class="tan-audit tan-pres" data-pres="corregir" data-payment="${esc(id)}">Corregir</button>`;
    return `<div class="tan-mov" data-kind="${cargo?'charge':'payment'}"><span class="tan-dot">${shellIcon(cargo?'ledger':'check')}</span><span class="tan-mov-body"><strong>${esc(titulo)}</strong><span>${detalle}</span>${audit}${pres}</span><span class="tan-mov-nums"><b>${cargo?'+':'−'}${money.format(Math.abs(monto))}</b><span>${saldoTexto(Number(m.running_balance||0))}</span></span></div>`;
  }).join('');
  return `<section class="tan-section"><div class="tan-section-head"><h2>Movimientos</h2><span>${rows.length} en total</span></div><div class="tan-ledger">${html}</div></section>`;
}

// Sólo quien puede ver el libro puede preguntar por su autor. A quien no, ni
// se le enseña el botón: un botón que siempre falla es peor que no tenerlo.
const puedeAuditar=can('taquilla')||can('contabilidad');

/* ¿Quién cobró este pago, de verdad?

   `collected_by_name` se teclea y no prueba nada; `created_by_user_id` es la
   cuenta desde la que se guardó y no se puede teclear. v2_movement_audit
   devuelve las dos por separado, y el detalle dice cuándo no coinciden. */
document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-audit]');if(!b)return;
  const antes=b.textContent;b.disabled=true;b.textContent='…';
  try{
    const a=await rpc('v2_movement_audit',{organization_id:ctx.organization_id,movement_id:b.dataset.audit});
    const cuenta=a?.audited?.account||'—';
    const rol=a?.audited?.role?` · ${a.audited.role}`:'';
    const escrito=a?.declared?.name;
    const lineas=[`Se guardó desde la cuenta ${cuenta}${rol}`,`El ${fmtDate(a?.audited?.at)}`];
    if(escrito)lineas.push(`${a.declared.label||'Cobró'} (texto escrito a mano): ${escrito}`);
    if(a?.declared?.counterparty)lineas.push(`Pagador (texto): ${a.declared.counterparty}`);
    if(a?.audited?.reconciledByAccount)lineas.push(`Conciliado por: ${a.audited.reconciledByAccount}`);
    if(a?.declaredDiffersFromAccount)lineas.push(`Ojo: el nombre escrito no es la cuenta que lo guardó.`);
    b.insertAdjacentHTML('afterend',
      `<span class="tan-audit-detalle${a?.declaredDiffersFromAccount?' alerta':''}">${lineas.map(l=>`<span>${esc(l)}</span>`).join('')}</span>`);
    b.remove();
  }catch(err){
    b.disabled=false;b.textContent=antes;
    b.insertAdjacentHTML('afterend','<span class="tan-audit-detalle">No se pudo abrir el detalle.</span>');
  }
});

function docsBlock(data){
  const docs=data.documents||[];
  if(!docs.length)return '';
  const ok=docs.filter(d=>d.received).length;
  const rows=docs.map(d=>`<div class="tan-row"><span><strong>${esc(docLabel(d.type))}</strong>${d.received&&d.received_at?`<small>Entregado ${esc(fmtDate(d.received_at))}</small>`:''}</span><span class="tan-state" data-ok="${d.received?1:0}">${d.received?'Entregado':'Pendiente'}</span></div>`).join('');
  return `<section class="tan-section"><div class="tan-section-head"><h2>Documentos</h2><span>${ok} de ${docs.length}</span></div><div class="tan-rows">${rows}</div></section>`;
}

function extrasBlock(data){
  const p=data.player||{},rows=[];
  if(p.base_monthly_fee!=null)rows.push({t:'Cuota mensual',d:money.format(Number(p.base_monthly_fee||0))});
  (p.benefits||[]).forEach(b=>{
    const cubre=b.percentage?`${b.percentage}%`:b.fixed!=null?money.format(Number(b.fixed)):'';
    rows.push({t:b.source||b.label||'Apoyo',d:[cubre,'de apoyo'].filter(Boolean).join(' ')});
  });
  (data.academies||[]).forEach(a=>rows.push({t:'Academia',d:`${money.format(Number(a.fee||0))} · desde ${fmtDate(a.starts_on)}`}));
  (data.orders||[]).forEach(o=>{
    const falta=Number(o.total||0)-Number(o.paid||0);
    rows.push({t:`Pedido ${o.folio||''}`.trim(),d:`${money.format(Number(o.total||0))} · ${falta>0?`faltan ${money.format(falta)}`:'pagado'}`});
  });
  (data.other_payments||[]).forEach(x=>rows.push({t:x.concept||'Otro pago',d:`${money.format(Number(x.amount||0))} · ${fmtDate(x.date)}`}));
  (p.guardians||[]).forEach(g=>rows.push({t:g.name,d:[g.relationship,g.phone].filter(Boolean).join(' · ')}));
  if(!rows.length)return '';
  const html=rows.map(r=>`<div class="tan-row"><span><strong>${esc(r.t)}</strong></span><span class="tan-state">${esc(r.d)}</span></div>`).join('');
  return `<section class="tan-section"><div class="tan-section-head"><h2>Cuota, apoyos y contacto</h2></div><div class="tan-rows">${html}</div></section>`;
}

async function render(){
  if(!playerId){$('tannerBody').innerHTML='<div class="tos-empty">Falta indicar el Tanner.</div>';return;}
  let data;
  try{
    data=await rpc('v2_player_account_statement',{organization_id:ctx.organization_id,player_id:playerId});
  }catch(error){
    console.warn('estado de cuenta',error);
    $('tannerBody').innerHTML='<div class="tos-empty">No pudimos abrir el estado de cuenta. Revisa tus permisos o vuelve a intentar.</div>';
    return;
  }
  if(!data||!data.player){$('tannerBody').innerHTML='<div class="tos-empty">No encontramos a este Tanner.</div>';return;}
  ultimo=data;
  const p=data.player;
  const nombre=[p.first_name,p.last_name].filter(Boolean).join(' ');
  document.title=`${nombre} · Estado de cuenta`;
  const titulo=$('shellTitle');if(titulo)titulo.textContent=nombre;

  // Se pinta sin foto y la foto entra después: la URL firmada no debe retrasar
  // el dato, que es a lo que la persona vino.
  const paint=url=>{
    $('tannerBody').innerHTML=`${headBlock(p,url)}${balanceBlock(data)}${monthsBlock(data)}${ledgerBlock(data)}<div class="tan-grid">${docsBlock(data)}${extrasBlock(data)}</div>`;
  };
  paint('');
  const saldo=Number(data.summary?.balance||0);
  setShellHealth(saldo>0?{state:'attention',label:`Debe ${money.format(saldo)}`}:{state:'ok',label:'Al corriente'});
  if(p.photo_thumb_path||p.photo_path){const url=await signPhoto(p);if(url)paint(url);}
}

/* ===== Presidencia ajusta el saldo aquí mismo =====
   Pedido del club (06/10/2026): no ir hasta Taquilla o Contabilidad para
   corregir un saldo. Un saldo nunca se sobrescribe: cada acción es un
   movimiento con motivo y con el nombre de quien lo hizo.
     · Ajustar: descuento, condonación o corrección de un cargo que se debe
       (v2_presidency_adjust_charge: autoriza y aplica en un paso).
     · Agregar cargo: torneo, uniforme, etc. (v2_presidency_add_charge).
     · Corregir pago: lo revierte y el adeudo vuelve (v2_correct_tanner_payment).
     · Aplicar saldo a favor (v2_apply_player_credit).
   La llave de idempotencia se crea al abrir la hoja y se reusa si se reintenta:
   un doble toque o una red lenta no duplican nada. */
let ultimo=null,hoja=null;
const llave=()=>(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`);
const TIPOS_AJUSTE=[['discount','Descuento'],['waiver','Condonación'],['correction','Corrección']];
function cargosAbiertos(){
  return (ultimo?.ledger||[]).filter(m=>m.kind==='charge'&&Number(m.charge_balance||0)>0&&m.id)
    .map(m=>({id:m.id,saldo:Number(m.charge_balance),texto:`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}${m.concept&&m.subtype==='other'?` · ${m.concept}`:''}`}));
}
function asegurarHoja(){
  if($('presSheet'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="presBackdrop" class="pres-backdrop hidden"></div><section id="presSheet" class="pres-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="presTitle"><div class="pres-grab" aria-hidden="true"></div><div id="presBody"></div></section>');
  $('presBackdrop').addEventListener('click',()=>{if(!hoja?.enviando)cerrarHoja();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&hoja&&!hoja.enviando)cerrarHoja();});
}
function cerrarHoja(){hoja=null;$('presSheet')?.classList.add('hidden');$('presBackdrop')?.classList.add('hidden');document.body.style.overflow='';}
function abrirHoja(tipo,datos={}){
  asegurarHoja();
  hoja={tipo,llave:llave(),enviando:false,error:'',...datos};
  pintarHoja();
  $('presSheet').classList.remove('hidden');$('presBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';
  setTimeout(()=>$('presSheet').querySelector('select,input,textarea')?.focus(),60);
}
function pintarHoja(){
  const b=$('presBody');if(!b||!hoja)return;
  const nombre=[ultimo?.player?.first_name,ultimo?.player?.last_name].filter(Boolean).join(' ');
  const cab=(t,sub)=>`<header class="pres-head"><div><h2 id="presTitle">${esc(t)}</h2><p>${esc(sub)}</p></div><button type="button" class="pres-close" data-pres-cerrar aria-label="Cerrar">×</button></header>`;
  const err=hoja.error?`<div class="pres-error" role="alert">${esc(hoja.error)}</div>`:'';
  const motivo=`<label>Motivo<textarea id="presMotivo" rows="2" maxlength="300" placeholder="Queda en el registro: por qué se hace">${esc(hoja.motivo||'')}</textarea></label>`;
  const boton=t=>`<button type="submit" class="pres-primary"${hoja.enviando?' disabled':''}>${hoja.enviando?'Un momento…':esc(t)}</button>`;
  let html='';
  if(hoja.tipo==='ajustar'){
    const cargos=cargosAbiertos();
    if(!cargos.length){html=cab('Ajustar saldo',nombre)+'<p class="pres-nota">No hay cargos con saldo pendiente.</p>';}
    else{
      const elegido=cargos.find(c=>c.id===hoja.charge)||cargos[0];hoja.charge=elegido.id;
      const monto=hoja.monto??elegido.saldo;
      html=cab('Ajustar saldo',nombre)+`<form id="presForm" class="pres-form">
        <label>Cargo<select id="presCargo">${cargos.map(c=>`<option value="${esc(c.id)}"${c.id===elegido.id?' selected':''}>${esc(c.texto)} · debe ${money.format(c.saldo)}</option>`).join('')}</select></label>
        <div class="pres-seg" role="radiogroup" aria-label="Tipo de ajuste">${TIPOS_AJUSTE.map(([v,l])=>`<button type="button" role="radio" aria-checked="${(hoja.ajuste||'discount')===v}" data-ajuste="${v}">${l}</button>`).join('')}</div>
        <label>Monto a quitar<input id="presMonto" type="number" inputmode="decimal" min="1" step="1" max="${elegido.saldo}" value="${esc(String(monto))}"></label>
        <p class="pres-nota">Debe ${money.format(elegido.saldo)} de este cargo. Después del ajuste quedaría en <b id="presQueda">${money.format(Math.max(0,elegido.saldo-Number(monto||0)))}</b>.</p>
        ${motivo}${err}${boton('Aplicar ajuste')}</form>`;
    }
  }else if(hoja.tipo==='cargo'){
    const hoy=new Date().toISOString().slice(0,10);
    html=cab('Agregar cargo',nombre)+`<form id="presForm" class="pres-form">
      <label>Concepto<input id="presConcepto" type="text" maxlength="120" placeholder="Ej. Torneo de Navidad" value="${esc(hoja.concepto||'')}"></label>
      <div class="pres-row"><label>Monto<input id="presMonto" type="number" inputmode="decimal" min="1" step="1" value="${esc(hoja.monto??'')}"></label><label>Fecha límite<input id="presFecha" type="date" value="${esc(hoja.fecha||hoy)}"></label></div>
      <p class="pres-nota">No genera recargo por atraso. Si tiene saldo a favor, se le aplica solo.</p>
      ${motivo}${err}${boton('Agregar cargo')}</form>`;
  }else if(hoja.tipo==='corregir'){
    const pago=(ultimo?.ledger||[]).find(m=>m.id===hoja.payment)||{};
    html=cab('Corregir pago',`${fmtDate(pago.date)} · ${money.format(Math.abs(Number(pago.amount||0)))}`)+`<form id="presForm" class="pres-form">
      <p class="pres-nota">El pago se revierte y lo que cubría vuelve a quedar pendiente. Sale de la caja del día. Si el dinero sí entró pero se capturó mal, vuelve a registrarlo bien en Taquilla.</p>
      ${motivo}${err}${boton('Revertir este pago')}</form>`;
  }else if(hoja.tipo==='favor'){
    const favor=Number(ultimo?.summary?.credit_available||0);
    html=cab('Aplicar saldo a favor',nombre)+`<form id="presForm" class="pres-form">
      <p class="pres-nota">Tiene ${money.format(favor)} a favor. Se aplica a sus cargos pendientes, del más antiguo al más nuevo.</p>
      ${err}${boton('Aplicar saldo a favor')}</form>`;
  }
  b.innerHTML=html;
  b.querySelector('[data-pres-cerrar]')?.addEventListener('click',()=>{if(!hoja?.enviando)cerrarHoja();});
  b.querySelector('#presCargo')?.addEventListener('change',e=>{guardaCampos();hoja.charge=e.target.value;hoja.monto=undefined;pintarHoja();});
  b.querySelectorAll('[data-ajuste]').forEach(x=>x.addEventListener('click',()=>{guardaCampos();hoja.ajuste=x.dataset.ajuste;pintarHoja();}));
  b.querySelector('#presMonto')?.addEventListener('input',e=>{const q=$('presQueda');if(q){const c=cargosAbiertos().find(c=>c.id===hoja.charge);if(c)q.textContent=money.format(Math.max(0,c.saldo-Number(e.target.value||0)));}});
  b.querySelector('#presForm')?.addEventListener('submit',enviarHoja);
}
function guardaCampos(){
  if(!hoja)return;
  if($('presMotivo'))hoja.motivo=$('presMotivo').value;
  if($('presMonto'))hoja.monto=$('presMonto').value;
  if($('presConcepto'))hoja.concepto=$('presConcepto').value;
  if($('presFecha'))hoja.fecha=$('presFecha').value;
}
const ERRORES={
  'Adjustment exceeds outstanding balance':'No se puede quitar más de lo que se debe de ese cargo.',
  'Adjustment reason required':'Escribe el motivo (al menos 5 letras).',
  'Charge has no outstanding balance':'Ese cargo ya no tiene saldo pendiente.',
  'Amount must be greater than zero':'El monto debe ser mayor a cero.'
};
const amable=e=>{const m=String(e?.message||e||'');return ERRORES[m]||m.replace(/^.*?:\s*/,'')||'No se pudo guardar. Intenta de nuevo.';};
async function enviarHoja(ev){
  ev.preventDefault();if(!hoja||hoja.enviando)return;
  guardaCampos();
  const motivo=String(hoja.motivo||'').trim(),monto=Number(hoja.monto);
  hoja.error='';
  if(hoja.tipo!=='favor'&&motivo.length<5){hoja.error='Escribe el motivo (al menos 5 letras): queda en el registro.';pintarHoja();return;}
  if((hoja.tipo==='ajustar'||hoja.tipo==='cargo')&&!(monto>0)){hoja.error='Escribe un monto mayor a cero.';pintarHoja();return;}
  if(hoja.tipo==='cargo'&&String(hoja.concepto||'').trim().length<3){hoja.error='Escribe el concepto del cargo.';pintarHoja();return;}
  hoja.enviando=true;pintarHoja();
  const org=ctx.organization_id;let aviso='';
  try{
    if(hoja.tipo==='ajustar'){
      await rpc('v2_presidency_adjust_charge',{organization_id:org,charge_id:hoja.charge,adjustment_type:hoja.ajuste||'discount',amount:monto,reason:motivo,idempotency_key:hoja.llave});
      aviso=`Ajuste aplicado: se quitaron ${money.format(monto)}.`;
    }else if(hoja.tipo==='cargo'){
      await rpc('v2_presidency_add_charge',{organization_id:org,player_id:playerId,concept:String(hoja.concepto).trim(),amount:monto,due_date:hoja.fecha||null,reason:motivo,idempotency_key:hoja.llave});
      aviso=`Cargo agregado: ${String(hoja.concepto).trim()} por ${money.format(monto)}.`;
    }else if(hoja.tipo==='corregir'){
      await rpc('v2_correct_tanner_payment',{organization_id:org,payment_id:hoja.payment,reason:motivo});
      aviso='Pago revertido. Lo que cubría volvió a quedar pendiente.';
    }else if(hoja.tipo==='favor'){
      const aplicado=await rpc('v2_apply_player_credit',{organization_id:org,player_id:playerId});
      aviso=Number(aplicado)>0?`Se aplicaron ${money.format(Number(aplicado))} del saldo a favor.`:'No había cargos donde aplicar el saldo a favor.';
    }
  }catch(e){hoja.enviando=false;hoja.error=amable(e);pintarHoja();return;}
  cerrarHoja();
  await render();
  avisar(aviso);
}
function avisar(t){
  if(!t)return;let el=$('presToast');
  if(!el){document.body.insertAdjacentHTML('beforeend','<div id="presToast" class="pres-toast" role="status"></div>');el=$('presToast');}
  el.textContent=t;el.classList.add('visible');clearTimeout(avisar.t);avisar.t=setTimeout(()=>el.classList.remove('visible'),3800);
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-pres]');if(!b||!ultimo?.canAdjust)return;
  const t=b.dataset.pres;
  if(t==='ajustar')abrirHoja('ajustar',{charge:b.dataset.charge||null});
  else if(t==='cargo')abrirHoja('cargo');
  else if(t==='corregir')abrirHoja('corregir',{payment:b.dataset.payment});
  else if(t==='favor')abrirHoja('favor');
});

await render();
