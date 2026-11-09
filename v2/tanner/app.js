import {supabase,bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,shellIcon} from '/v2/shell.js';
import { nombreDelClub } from '/v2/club.js';
import {getSignedPhotoUrl} from '/v2/photo-cache.js';
import {abrirCobro,folioTexto,esCuentaCompartida} from '/v2/cobro/hoja.js';
import {montaCobranza} from '/v2/tanner/cobranza.js';
import {relacion,telefonoBonito,telefonoWa} from '/v2/contacto.js';

// El shell valida el módulo activo, pero un estado de cuenta lo abre tanto
// Cobranza como Contabilidad. Se entra con 'inicio' (que el shell exceptúa) y
// el permiso real lo impone el RPC, que exige billing o accounting (desde n2).
const boot=await bootstrapProtectedShell({active:'inicio',title:'Estado de cuenta'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const playerId=new URLSearchParams(location.search).get('id');
// Lo que hace falta para cobrar aquí (cargos con id, pedidos, folios). Si no
// carga, la pantalla sigue siendo el estado de cuenta de siempre.
let cobro=null;
const puedeCobrar=()=>!!cobro?.canCollect;
const cobranza=montaCobranza({rpc,org:ctx.organization_id,playerId,money,esc,shellIcon,
  datos:()=>({estado:ultimo,cobro}),recarga:()=>render(),avisar:t=>avisar(t),club:()=>nombreDelClub(ctx)});

const CHARGE_LABEL={monthly_fee:'Mensualidad',late_fee:'Recargo',academy_fee:'Academia',registration:'Inscripción',uniform:'Uniforme',parking_pass:'Gafete',other:'Otro cargo'};
const DOC_LABEL={birth_certificate:'Acta de nacimiento',curp:'CURP',studies:'Constancia de estudios',photo:'Fotografía',id:'Identificación'};
const STATUS_LABEL={active:'Activo',withdrawn:'Baja',paused:'En pausa',archived:'Archivado'};
const chargeLabel=t=>CHARGE_LABEL[t]||'Cargo';
const METODO_PAGO={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',deposit:'Depósito',other:'Otro'};
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
  if(paq?.package)chips.push(`<span class="tan-chip" data-tone="paquete">${esc(paq.package.name)}</span>`);
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
  // Los cuadritos por concepto sólo cuando no hay tarjetero "Por mes": si no,
  // dicen dos veces lo mismo (04/11/2026).
  const hayMeses=(data.ledger||[]).some(m=>m.kind==='charge'&&m.period);
  const partes=hayMeses?'':(s.by_type||[]).map(t=>`<div class="tan-split-item"><span>${esc(chargeLabel(t.type))}</span><b>${money.format(Number(t.pending||0))}</b></div>`).join('');
  const sub=saldo>0
    ? `${(s.by_type||[]).length} concepto${(s.by_type||[]).length===1?'':'s'}${s.oldest_due?` · el más antiguo desde ${fmtDate(s.oldest_due)}`:''}`
    : aFavor>0?'Pagado por adelantado, se aplicará al próximo cargo':'Todo al corriente';

  // Arriba sólo lo que se hace todos los días: cobrar y escribirle a la
  // familia. Lo demás va en renglones, como Ajustes del iPhone (04/11/2026).
  const op=cobranza.opciones();
  const principales=[];
  if(puedeCobrar())principales.push(`<button type="button" class="tan-btn" data-kind="pay" data-cobrar="${saldo>0?'todo':''}">${saldo>0?`Cobrar ${money.format(saldo)}`:'Cobrar'}</button>`);
  if(op.whatsapp)principales.push('<button type="button" class="tan-btn" data-kind="wa" data-wa-menu>WhatsApp</button>');
  const filas=[];
  if(op.acuerdo)filas.push(fila({icono:'calendar',tono:'azul',titulo:'Acuerdo de pago',sub:'Pagos en partes con fechas',attrs:'data-acuerdo="nuevo"'}));
  if(data.canAdjust){
    filas.push(fila({icono:'settings',tono:'naranja',titulo:'Cambiar lo que debe',sub:'Subir, bajar o condonar un cargo',attrs:'data-pres="ajustar"'}));
    filas.push(fila({icono:'plus',tono:'morado',titulo:'Agregar cargo',sub:'Torneo, uniforme, viaje…',attrs:'data-pres="cargo"'}));
    if(saldo>0&&aFavor>0)filas.push(fila({icono:'wallet',tono:'verde',titulo:`Aplicar ${money.format(aFavor)} a favor`,sub:'A sus cargos, del más antiguo',attrs:'data-pres="favor"'}));
  }
  filas.push(fila({icono:'book',tono:'gris',titulo:'Enviar estado de cuenta',sub:'PDF para la familia',attrs:'data-enviar-edo'}));
  if(can('jugadores'))filas.push(fila({icono:'users',tono:'gris',titulo:'Ver ficha completa',sub:'Datos, fotos y documentos',href:`/jugadores/?player=${encodeURIComponent(p.id)}`}));

  // Explica de dónde sale un saldo que parece no cuadrar tras un cobro.
  const notas=[];
  if(aFavor>0&&saldo>0&&!data.canAdjust)notas.push({t:`${money.format(aFavor)} a favor sin aplicar`,d:'Hay un pago con saldo sobrante que todavía no cubre ningún cargo abierto.'});
  if(retenido>0)notas.push({t:`${money.format(retenido)} de crédito retenido`,d:'Pago migrado que requiere conciliación manual antes de aplicarse.'});
  const notasHtml=notas.map(n=>`<div class="tan-note"><span class="tan-dot" style="background:#d9e9ec;color:#0c5163">${shellIcon('wallet')}</span><span><strong>${esc(n.t)}</strong><span>${esc(n.d)}</span></span></div>`).join('');

  return `<section class="tan-balance" data-state="${state}"><div class="tan-balance-top"><span>${titulo}</span><strong>${cifra}</strong><small>${esc(sub)}</small>${partes?`<div class="tan-split">${partes}</div>`:''}${principales.length?`<div class="tan-actions">${principales.join('')}</div>`:''}${notasHtml}</div>${filas.length?`<div class="tan-lista">${filas.join('')}</div>`:''}</section>`;
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
    // Un mes que se debe se toca y abre el cobro con ese mes ya elegido.
    if(debe&&puedeCobrar())return `<button type="button" class="tan-mes" data-state="${estado}" data-cobrar="${esc(f.key)}" title="${esc(titulo)} · tocar para cobrar"><span class="tan-mes-nom">${esc(nombre(f.key))}</span><b>${cifra}</b><span class="tan-mes-pie">${pie}</span>${f.key.slice(0,4)!==String(new Date().getFullYear())?`<small>${esc(f.key.slice(0,4))}</small>`:''}</button>`;
    return `<div class="tan-mes" data-state="${estado}" title="${esc(titulo)}"><span class="tan-mes-nom">${esc(nombre(f.key))}</span><b>${cifra}</b><span class="tan-mes-pie">${pie}</span>${f.key.slice(0,4)!==String(new Date().getFullYear())?`<small>${esc(f.key.slice(0,4))}</small>`:''}</div>`;
  }).join('');
  const resumen=conSaldo.length
    ? `debe ${conSaldo.length} mes${conSaldo.length===1?'':'es'}`
    : 'sin meses pendientes';
  return `<section class="tan-section"><div class="tan-section-head"><h2>Por mes</h2><span>${esc(resumen)}</span></div><div class="tan-meses">${cards}</div></section>`;
}

// Un pago que se cobró junto con otros (inscripción + mensualidad...) lleva
// el folio del cobro: así se sabe que fue un solo dinero.
function folioDe(m){
  const t=cobro?.tickets?.[m.id||m.ref_id];
  if(!t)return '';
  return ` · Folio ${esc(folioTexto(t.folio))}${Number(t.parts)>1?` (${t.parts} partes)`:''}`;
}
// Un mes que no cuadra con la cuota casi siempre es proporcional: empezó a
// pagar a medio mes. Se dice ahí mismo ("$493 de Luis Reyes", 08/11/2026).
function proporcional(m,p){
  const ini=p?.billing_start;
  if(m.subtype!=='monthly_fee'||!m.period||!ini||Number(ini.slice(8,10))<=1)return '';
  if(String(m.period).slice(0,7)!==String(ini).slice(0,7))return '';
  const d=new Date(`${ini}T12:00:00`);
  return ` · proporcional: empezó el ${new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(d).replace('.','')}`;
}
function ledgerBlock(data){
  const rows=(data.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted');
  if(!rows.length)return '';
  const html=rows.map(m=>{
    const monto=Number(m.amount||0),cargo=m.kind==='charge';
    const titulo=cargo?`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}`:'Pago recibido';
    const detalle=cargo
      ? `${fmtDate(m.date)}${m.charge_balance>0?` · quedan ${money.format(Number(m.charge_balance))}`:' · liquidado'}${proporcional(m,data.player)}`
      : `${fmtDate(m.date)}${m.method?` · ${esc(METODO_PAGO[m.method]||m.method)}`:''}${m.reference&&m.reference!==METODO_PAGO[m.method]?` · ${esc(m.reference)}`:''}${folioDe(m)}`;
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
      :cargo?`<button type="button" class="tan-audit tan-pres" data-pres="ajustar" data-charge="${esc(id)}">Cambiar monto</button>`
      :`<button type="button" class="tan-audit tan-pres" data-pres="editar" data-payment="${esc(id)}">Editar</button>`;
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

/* ===== Cambios al saldo (sólo en pantalla) =====
   Quién ajustó qué, cuándo y por qué: descuentos, condonaciones, cargos que
   agregó Presidencia y pagos revertidos. Es información interna: NO va en el
   PDF que se le manda a la familia (pedido de Presidencia, 06/10/2026). */
let cambios=null,fotoActual='';
const TIPO_CAMBIO={discount:'Descuento',waiver:'Condonación',correction:'Corrección',late_fee_waiver:'Recargo perdonado',benefit:'Apoyo'};
function cambiosBlock(){
  if(!Array.isArray(cambios)||!cambios.length)return '';
  const fecha=v=>v?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)):'';
  const filas=cambios.map(c=>{
    const titulo=c.kind==='adjustment'?`${TIPO_CAMBIO[c.type]||'Ajuste'} · ${c.concept||chargeLabel(c.chargeType)}`
      :c.kind==='charge_added'?`Cargo agregado · ${c.concept||''}`
      :`Pago revertido${c.paymentDate?` del ${fmtDate(c.paymentDate)}`:''}`;
    const signo=c.kind==='charge_added'?'+':'−';
    return `<div class="tan-mov" data-kind="cambio"><span class="tan-dot">${shellIcon('settings')}</span><span class="tan-mov-body"><strong>${esc(titulo)}</strong><span>${esc(fecha(c.at))}${c.by?` · ${esc(c.by)}`:''}</span>${c.reason?`<span class="tan-motivo">“${esc(c.reason)}”</span>`:''}</span><span class="tan-mov-nums"><b>${signo}${money.format(Math.abs(Number(c.amount||0)))}</b></span></div>`;
  }).join('');
  return `<section class="tan-section tan-cambios"><div class="tan-section-head"><h2>Cambios al saldo</h2><span>Sólo interno · no sale en el PDF</span></div><div class="tan-ledger">${filas}</div></section>`;
}
async function cargaCambios(paint){
  try{cambios=await rpc('v2_player_change_history',{organization_id:ctx.organization_id,player_id:playerId});}catch(e){cambios=null;return;}
  if(Array.isArray(cambios)&&cambios.length)paint(fotoActual);
}

/* ===== Estado de cuenta para la familia: PDF y WhatsApp =====
   Lo que se le manda al papá: saldo, qué meses debe y sus movimientos. Nada
   interno (ni quién cobró, ni el historial de cambios, ni motivos). En el
   teléfono se comparte el PDF directo (WhatsApp, correo...) con la hoja de
   compartir del sistema; donde no se puede, se descarga y se abre WhatsApp
   con el resumen escrito. */
async function generaPdf(data){
  const {jsPDF}=await import('https://esm.sh/jspdf@2.5.2');
  const doc=new jsPDF({unit:'pt',format:'letter'});
  const ancho=doc.internal.pageSize.getWidth(),alto=doc.internal.pageSize.getHeight(),m=40;
  let y=m;
  const p=data.player||{},s=data.summary||{};
  const nombre=[p.first_name,p.last_name].filter(Boolean).join(' ');
  const pesos=v=>money.format(Number(v||0));
  const club=ctx.organization_name||'';
  const hoy=new Intl.DateTimeFormat('es-MX',{dateStyle:'long'}).format(new Date());
  const salto=n=>{if(y+n>alto-m-20){doc.addPage();y=m;}};
  doc.setFillColor(5,55,70);doc.rect(0,0,ancho,74,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Estado de cuenta',m,36);
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`${club} · ${hoy}`,m,54);
  y=104;doc.setTextColor(7,25,30);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(nombre,m,y);y+=15;
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(100,118,123);
  doc.text([p.category,p.code].filter(Boolean).join(' · ')||' ',m,y);y+=26;
  const saldo=Number(s.balance||0),favor=Number(s.credit_available||0);
  const cajas=[['Saldo pendiente',pesos(saldo)],['Total pagado',pesos(s.paid_total)],['Saldo a favor',pesos(favor)]];
  const w=(ancho-m*2-20)/3;
  cajas.forEach(([t,v],i)=>{const x=m+i*(w+10);doc.setFillColor(243,246,245);doc.roundedRect(x,y,w,48,6,6,'F');
    doc.setFontSize(8.5);doc.setTextColor(100,118,123);doc.text(t.toUpperCase(),x+10,y+16);
    doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(i===0&&saldo>0?170:7,i===0&&saldo>0?45:25,i===0&&saldo>0?30:30);doc.text(v,x+10,y+36);doc.setFont('helvetica','normal');});
  y+=70;
  // Meses con saldo
  const meses=new Map();
  (data.ledger||[]).filter(x=>x.kind==='charge'&&Number(x.charge_balance||0)>0).forEach(x=>{
    const k=x.subtype==='other'?(x.concept||'Otro cargo'):`${chargeLabel(x.subtype)} ${x.period?fmtDate(x.period).replace(/^\d+ /,''):''}`.trim();
    meses.set(k,(meses.get(k)||0)+Number(x.charge_balance));
  });
  if(meses.size){
    doc.setTextColor(7,25,30);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Pendiente de pago',m,y);y+=16;
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    for(const [k,v] of meses){salto(16);doc.text(k,m,y);doc.text(pesos(v),ancho-m,y,{align:'right'});y+=15;}
    y+=10;
  }
  // Movimientos
  salto(40);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(7,25,30);doc.text('Movimientos',m,y);y+=12;
  const cab=()=>{doc.setFillColor(238,242,241);doc.rect(m,y,ancho-m*2,18,'F');doc.setFontSize(8.5);doc.setTextColor(60,80,86);
    doc.text('FECHA',m+6,y+12);doc.text('CONCEPTO',m+90,y+12);doc.text('CARGO',ancho-m-150,y+12,{align:'right'});doc.text('PAGO',ancho-m-80,y+12,{align:'right'});doc.text('SALDO',ancho-m-6,y+12,{align:'right'});y+=26;doc.setTextColor(7,25,30);doc.setFont('helvetica','normal');doc.setFontSize(9.5);};
  doc.setFont('helvetica','bold');cab();
  const movs=(data.ledger||[]).filter(x=>x.kind!=='payment'||x.status==='posted');
  if(!movs.length){doc.text('Sin movimientos.',m+6,y);y+=14;}
  for(const x of movs){
    if(y>alto-m-30){doc.addPage();y=m;doc.setFont('helvetica','bold');cab();}
    const cargo=x.kind==='charge';
    const concepto=cargo?(x.subtype==='other'?(x.concept||'Otro cargo'):`${chargeLabel(x.subtype)}${x.period?` ${fmtDate(x.period).replace(/^\d+ /,'')}`:''}`):`Pago${x.method?` · ${({cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta'})[x.method]||x.method}`:''}`;
    const sc=Number(x.running_balance||0);
    doc.text(fmtDate(x.date),m+6,y);
    doc.text(doc.splitTextToSize(concepto,ancho-m*2-330)[0]||'',m+90,y);
    doc.text(cargo?pesos(Math.abs(x.amount)):'',ancho-m-150,y,{align:'right'});
    doc.text(cargo?'':pesos(Math.abs(x.amount)),ancho-m-80,y,{align:'right'});
    doc.text(sc<-0.004?`${pesos(-sc)} a favor`:pesos(sc),ancho-m-6,y,{align:'right'});
    y+=15;
  }
  salto(40);y+=16;doc.setFontSize(8.5);doc.setTextColor(120,135,140);
  doc.text(`Para cualquier aclaración, comunícate con ${club}. Documento informativo generado el ${hoy}.`,m,y);
  const archivo=`estado-de-cuenta-${nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'tanner'}.pdf`;
  return {doc,archivo};
}
function textoWhatsapp(data){
  const p=data.player||{},s=data.summary||{};
  const nombre=[p.first_name,p.last_name].filter(Boolean).join(' ');
  const saldo=Number(s.balance||0);
  const pendientes=(data.ledger||[]).filter(x=>x.kind==='charge'&&Number(x.charge_balance||0)>0)
    .map(x=>`• ${x.subtype==='other'?(x.concept||'Otro cargo'):`${chargeLabel(x.subtype)}${x.period?` ${fmtDate(x.period).replace(/^\d+ /,'')}`:''}`}: ${money.format(Number(x.charge_balance))}`);
  return saldo>0
    ?`Hola, le compartimos el estado de cuenta de ${nombre} en ${ctx.organization_name||'el club'}.\n\nSaldo pendiente: ${money.format(saldo)}\n${pendientes.join('\n')}\n\nCualquier duda, aquí estamos. Gracias.`
    :`Hola, le compartimos el estado de cuenta de ${nombre} en ${ctx.organization_name||'el club'}. Está al corriente. Gracias por su puntualidad.`;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-enviar-edo]');if(!b||!ultimo)return;
  const antes=b.textContent;b.disabled=true;b.textContent='Preparando…';
  try{
    const {doc,archivo}=await generaPdf(ultimo);
    const texto=textoWhatsapp(ultimo);
    const blob=doc.output('blob');
    const file=typeof File==='function'?new File([blob],archivo,{type:'application/pdf'}):null;
    if(file&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],text:texto,title:'Estado de cuenta'});}catch(err){if(err?.name!=='AbortError')throw err;}
    }else{
      doc.save(archivo);
      const tel=(ultimo.player?.guardians||[]).find(g=>g.phone)?.phone;
      const num=String(tel||'').replace(/\D/g,'');
      window.__ultimoEnvio={archivo,texto,num};
      if(num)window.open(`https://wa.me/${num.length===10?'52'+num:num}?text=${encodeURIComponent(texto)}`,'_blank','noopener');
      avisar(num?'PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.':'PDF descargado. Esta familia no tiene teléfono registrado.');
    }
  }catch(err){console.warn('estado de cuenta pdf',err);avisar('No se pudo generar el PDF. Revisa tu conexión e intenta de nuevo.');}
  finally{b.disabled=false;b.textContent=antes;}
});

function docsBlock(data){
  const docs=data.documents||[];
  if(!docs.length)return '';
  const ok=docs.filter(d=>d.received).length;
  const filas=docs.map(d=>fila({icono:d.received?'check':'list',tono:d.received?'verde':'gris',titulo:docLabel(d.type),
    sub:d.received&&d.received_at?`Entregado ${fmtDate(d.received_at)}`:'',accion:false,
    extra:`<span class="tan-state" data-ok="${d.received?1:0}">${d.received?'Entregado':'Pendiente'}</span>`}));
  return grupo(`Documentos · ${ok} de ${docs.length}`,filas);
}

/* ===== Renglones estilo Ajustes del iPhone (04/11/2026) =====
   Presidencia: "siento que ahorita todos los botones están así como
   aventados... que lleve un flujito". Cada cosa es un renglón: ícono, qué es,
   una línea que explica, y a la derecha el valor o la flecha. */
// Un teléfono no se parte en dos renglones.
const nb=t=>String(t||'').replace(/ /g,'\u00a0');
const flecha='<span class="tan-fila-flecha" aria-hidden="true">›</span>';
function fila({icono,tono='gris',titulo,sub='',valor='',attrs='',href='',accion=true,extra='',vacio=false}){
  const cuerpo=`<span class="tan-fila-ico" data-tono="${tono}">${shellIcon(icono)}</span><span class="tan-fila-txt"><strong>${esc(titulo)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</span>${valor?`<span class="tan-fila-valor"${vacio?' data-vacio':''}>${esc(valor)}</span>`:''}${extra}${accion&&!extra?flecha:''}`;
  if(href)return `<a class="tan-fila" href="${esc(href)}" ${attrs}>${cuerpo}</a>`;
  if(accion&&!extra)return `<button type="button" class="tan-fila" ${attrs}>${cuerpo}</button>`;
  return `<div class="tan-fila" ${attrs}>${cuerpo}</div>`;
}
function grupo(titulo,filas,{pie='',clase=''}={}){
  if(!filas.length)return '';
  return `<section class="tan-grupo ${clase}"><h2 class="tan-grupo-tit">${esc(titulo)}</h2><div class="tan-lista">${filas.join('')}</div>${pie?`<p class="tan-grupo-pie">${pie}</p>`:''}</section>`;
}
const esPresidencia=()=>ctx.role==='Presidencia'||!!ctx.is_owner;
const fichaUrl=()=>`/jugadores/?player=${encodeURIComponent(playerId)}`;

/* Premios por puntualidad (h64, Centro Tanner TC-146): mensualidad completa
   a más tardar el día 5. Enero-noviembre: 50% en diciembre (beca parcial
   entra, completa no). Enero-mayo: 20% en el kit de agosto (sin beca). */
function puntualidadFila(){
  if(!punt?.december)return null;
  const d=punt.december,k=punt.kit||{};
  if(d.state==='no_vigente')return fila({icono:'star',tono:'gris',titulo:'Premio por puntualidad',sub:'Empieza en enero de 2027: pagar a más tardar el día 5',accion:false});
  const dic={ganado:'Ganó 50% en diciembre',en_curso:`${d.onTime} de 11 meses a tiempo · va por 50% en diciembre`,perdido:'Diciembre: este año ya no, hubo un mes tarde',beca_completa:'Con beca completa no aplica'}[d.state]||'';
  const kit={ganado:'Kit de agosto: 20% ganado',en_curso:`Kit de agosto: ${k.onTime} de 5 a tiempo`,perdido:'Kit de agosto: ya no'}[k.state]||'';
  const bien=d.state==='ganado'||d.state==='en_curso';
  return fila({icono:'star',tono:bien?'verde':'gris',titulo:'Premio por puntualidad',sub:[dic,kit].filter(Boolean).join(' · '),valor:bien?`${d.onTime}/11`:'',accion:false});
}

// Qué tiene contratado: su cuota (se ajusta aquí mismo), academias y apoyos.
function planesBlock(data){
  const p=data.player||{},filas=[];
  if(p.base_monthly_fee!=null||p.is_exempt){
    const cuota=p.is_exempt?'Exento':`${money.format(Number(p.base_monthly_fee||0))}/mes`;
    const sub=p.billing_day?`Se carga el día ${p.billing_day} de cada mes`:'Cuota mensual del club';
    filas.push(esPresidencia()
      ?fila({icono:'wallet',tono:'azul',titulo:'Mensualidad',sub,valor:cuota,attrs:'data-cuota'})
      :fila({icono:'wallet',tono:'azul',titulo:'Mensualidad',sub,valor:cuota,accion:false}));
  }
  // Academias: las vigentes primero; una que ya terminó dice hasta cuándo.
  (data.academies||[]).slice().sort((x,y)=>(x.status==='active'?0:1)-(y.status==='active'?0:1)).forEach(a=>{
    const vigente=a.status==='active'&&!(a.ends_on&&String(a.ends_on).slice(0,10)<new Date().toISOString().slice(0,10));
    filas.push(fila({icono:'academy',tono:vigente?'morado':'gris',titulo:vigente?'Academia':'Academia (terminó)',
      sub:vigente?(a.starts_on?`Desde ${fmtDate(a.starts_on)}`:''):(a.ends_on?`Hasta ${fmtDate(a.ends_on)}`:'Ya no está inscrito'),
      valor:`${money.format(Number(a.fee||0))}/mes`,accion:false}));
  });
  (p.benefits||[]).forEach(b=>{
    const cubre=b.percentage?`${b.percentage}%`:b.fixed!=null?money.format(Number(b.fixed)):'';
    filas.push(fila({icono:'star',tono:'verde',titulo:b.source||b.label||'Beca o apoyo',sub:'Beca o apoyo',valor:cubre?`−${cubre}`:'',accion:false}));
  });
  {const pz=puntualidadFila();if(pz)filas.push(pz);}
  (data.orders||[]).forEach(o=>{
    const falta=Number(o.total||0)-Number(o.paid||0);
    filas.push(fila({icono:'bag',tono:'naranja',titulo:`Pedido ${o.folio||''}`.trim(),sub:falta>0?`Faltan ${money.format(falta)}`:'Pagado',valor:money.format(Number(o.total||0)),accion:false}));
  });
  (data.other_payments||[]).forEach(x=>filas.push(fila({icono:'moneyIn',tono:'gris',titulo:x.concept||'Otro pago',sub:fmtDate(x.date),valor:money.format(Number(x.amount||0)),accion:false})));
  if(!filas.length)return '';
  const pie=can('jugadores')?`Academias, becas y apoyos se cambian en la <a href="${esc(fichaUrl())}">ficha</a>.`:'';
  return grupo('Planes',filas,{pie});
}

/* ===== Paquete y becas (h62, 04/11/2026) =====
   Presidencia: "en enero vamos a tener 6 paquetes"; "que se sepa qué beca
   tienen y por qué motivo"; "las becas duran 3 meses y nosotros las tenemos
   que renovar". Un renglón dice el paquete y cuánto paga; debajo, cada beca
   con su motivo y cuándo vence. Se cambia con un toque. */
let paq=null,punt=null;
const MES=d=>d?new Intl.DateTimeFormat('es-MX',{month:'long'}).format(new Date(`${String(d).slice(0,7)}-01T12:00:00`)):'';
function detallePaquete(k){
  if(!k)return '';
  if(k.audience==='porteros')return k.trainsWithCategory?`${k.goalkeeperDays} con porteros + ${k.days-k.goalkeeperDays} con su categoría`:`${k.days} días con porteros`;
  return `${k.days} días con su categoría`;
}
const TIPO_BECA={scholarship_full:'Beca completa',scholarship_partial:'Beca parcial',sibling_discount:'Hermanos',sponsor_funded:'Patrocinio',custom:'Apoyo'};
const becaCompleta=b=>b.type==='scholarship_full'||b.calculation==='full_waiver'||Number(b.percentage)>=100;
function becaCuanto(b){
  if(becaCompleta(b))return '100%';
  if(b.percentage!=null)return `−${Number(b.percentage)}%`;
  if(b.fixed!=null&&Number(b.fixed)>0)return `−${money.format(Number(b.fixed))}`;
  return '';
}
// Lo mismo que calcula la base (private.package_discount), para enseñar en la
// hoja cuánto pagaría antes de guardar.
function descuentoBecas(precio){
  const bs=(paq?.benefits||[]).filter(b=>b.counts);
  if(!(precio>0))return 0;
  if(bs.some(becaCompleta))return precio;
  const d=bs.reduce((t,b)=>t+(b.percentage!=null?Math.round(precio*Number(b.percentage))/100:Number(b.fixed||0)),0);
  return Math.min(precio,Math.max(0,d));
}
function paqueteBlock(data){
  if(!paq?.hasPackages)return planesBlock(data);
  const filas=[],k=paq.package,editar=!!paq.canEdit;
  if(k){
    const sub=[detallePaquete(k),Number(paq.discount)>0?`${money.format(Number(paq.price))} − becas ${money.format(Number(paq.discount))}`:''].filter(Boolean).join(' · ');
    filas.push(fila({icono:k.audience==='porteros'?'shield':'users',tono:'azul',titulo:k.name,sub,valor:`${money.format(Number(paq.fee||0))}/mes`,attrs:editar?'data-paquete':'',accion:editar}));
  }else{
    const gk=paq.goalkeeperAcademy&&Number(paq.goalkeeperAcademy.fee)>0?` + porteros ${money.format(Number(paq.goalkeeperAcademy.fee))}`:'';
    filas.push(fila({icono:'wallet',tono:'naranja',titulo:'Sin paquete',sub:`Hoy paga ${money.format(Number(paq.fee||0))}/mes${gk}`,valor:editar?'Elegir':'',attrs:editar?'data-paquete':'',accion:editar}));
  }
  (paq.benefits||[]).forEach(b=>{
    const dias=b.daysLeft==null?null:Number(b.daysLeft);
    const vence=!b.endsOn?'Sin fecha de fin':dias<0?`Venció el ${fmtDate(b.endsOn)}`:dias===0?'Vence hoy':`Vence el ${fmtDate(b.endsOn)} · faltan ${dias} día${dias===1?'':'s'}`;
    const urge=dias!=null&&dias<=21;
    const renovar=paq.canRenew&&b.type!=='sponsor_funded'&&b.endsOn&&dias<=30
      ?`<button type="button" class="tan-pill" data-kind="renovar" data-renovar="${esc(b.id)}" data-fin="${esc(b.endsOn)}">Renovar</button>`:'';
    const cuanto=becaCuanto(b);
    filas.push(fila({icono:'star',tono:urge?'rojo':'verde',titulo:[TIPO_BECA[b.type]||'Beca',cuanto&&cuanto!=='100%'?cuanto:''].filter(Boolean).join(' '),
      sub:[b.reason,vence].filter(Boolean).join(' · '),accion:false,attrs:urge?'data-urge':'',
      extra:renovar||(cuanto?`<span class="tan-fila-valor">${esc(cuanto)}</span>`:'')}));
  });
  {const pz=puntualidadFila();if(pz)filas.push(pz);}
  // Lo demás que paga aparte: pedidos y otros pagos.
  (data.orders||[]).forEach(o=>{
    const falta=Number(o.total||0)-Number(o.paid||0);
    filas.push(fila({icono:'bag',tono:'naranja',titulo:`Pedido ${o.folio||''}`.trim(),sub:falta>0?`Faltan ${money.format(falta)}`:'Pagado',valor:money.format(Number(o.total||0)),accion:false}));
  });
  const prox=(paq.upcoming||[])[0];
  const pie=[paq.period&&k?`Cuenta así desde ${MES(paq.period)}.`:'',prox?`Desde ${MES(prox.from)} el paquete cuesta ${money.format(Number(prox.fee))}.`:'',
    (paq.benefits||[]).some(b=>b.daysLeft!=null&&b.daysLeft<=21&&b.type!=='sponsor_funded')?'Una beca que no se renueva deja de descontar el mes siguiente.':''].filter(Boolean).join(' ');
  return grupo('Paquete',filas,{pie:esc(pie)});
}

// Salud: lo que el coach necesita a la mano en una emergencia. Viene de la
// ficha (v2_player_profile, permiso de Jugadores); sin permiso, no se enseña.
let perfil=null;
function saludBlock(){
  const j=perfil?.player;if(!j)return '';
  const tel=telefonoWa(j.emergencyContactPhone);
  const llamar=tel?`<span class="tan-contacto-acciones"><a class="tan-pill" data-kind="wa" href="https://wa.me/${esc(tel)}" target="_blank" rel="noopener" aria-label="WhatsApp al contacto de emergencia">WhatsApp</a><a class="tan-pill" href="tel:+${esc(tel)}" aria-label="Llamar al contacto de emergencia">Llamar</a></span>`:'';
  const alergias=String(j.allergies||'').trim();
  if(!j.bloodType&&!alergias&&!j.emergencyContactName&&!j.emergencyContactPhone){
    const f=can('jugadores',true)
      ?fila({icono:'shield',tono:'gris',titulo:'Sin datos médicos',sub:'Sangre, alergias y contacto de emergencia',valor:'Capturar',href:fichaUrl()})
      :fila({icono:'shield',tono:'gris',titulo:'Sin datos médicos',accion:false});
    return grupo('Salud',[f]);
  }
  const filas=[
    fila({icono:'shield',tono:'rojo',titulo:'Tipo de sangre',valor:j.bloodType||'Sin capturar',vacio:!j.bloodType,accion:false}),
    fila({icono:'bug',tono:'naranja',titulo:'Alergias y condiciones',sub:alergias||'',valor:alergias?'':'Ninguna registrada',vacio:!alergias,accion:false,attrs:alergias?'data-alerta':''}),
    fila({icono:'users',tono:'verde',titulo:j.emergencyContactName||'Contacto de emergencia',sub:j.emergencyContactName?['Emergencia',nb(telefonoBonito(j.emergencyContactPhone))].filter(Boolean).join(' · '):'Sin capturar',accion:false,extra:llamar})
  ];
  return grupo('Salud',filas,{pie:can('jugadores',true)?`¿Algo cambió? <a href="${esc(fichaUrl())}">Edítalo en la ficha</a>.`:''});
}

// Familia: el tutor se lee como lo dice la gente ("Tutor · 477 919 8191") y
// se usa con un toque: WhatsApp o llamar.
function familiaBlock(data){
  const gs=data.player?.guardians||[];
  const filas=gs.map(g=>{
    const tel=telefonoWa(g.phone);
    const quien=[relacion(g.relationship),g.primary?'principal':''].filter(Boolean).join(' · '),fono=telefonoBonito(g.phone);
    const acciones=tel?`<span class="tan-contacto-acciones"><a class="tan-pill" data-kind="wa" href="https://wa.me/${esc(tel)}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(g.name||'tutor')}">WhatsApp</a><a class="tan-pill" href="tel:+${esc(tel)}" aria-label="Llamar a ${esc(g.name||'tutor')}">Llamar</a></span>`:'<span class="tan-fila-valor" data-vacio>Sin teléfono</span>';
    return fila({icono:'userCog',tono:'azul',titulo:g.name||'Tutor',sub:[quien,nb(fono)].filter(Boolean).join(' · '),accion:false,extra:acciones,attrs:'data-contacto'}).replace('class="tan-fila"','class="tan-fila tan-contacto"');
  });
  return grupo('Familia',filas);
}

async function render(){
  if(!playerId){$('tannerBody').innerHTML='<div class="tos-empty">Falta indicar el Tanner.</div>';return;}
  let data;
  try{
    [data,cobro,perfil,paq,punt]=await Promise.all([
      rpc('v2_player_account_statement',{organization_id:ctx.organization_id,player_id:playerId}),
      rpc('v2_player_collection',{organization_id:ctx.organization_id,player_id:playerId}).catch(()=>null),
      // Salud sale de la ficha: sólo quien puede ver Jugadores. Si falla, la
      // cuenta se ve igual, sin esa sección.
      can('jugadores')?rpc('v2_player_profile',{organization_id:ctx.organization_id,player_id:playerId}).catch(()=>null):null,
      // Paquete y becas (h62). Si no hay o falla, se ve la cuota como antes.
      rpc('v2_player_package',{organization_id:ctx.organization_id,player_id:playerId}).catch(()=>null),
      // Premios por puntualidad (h64). Si falla, simplemente no sale el renglón.
      rpc('v2_punctuality_status',{organization_id:ctx.organization_id,player_id:playerId}).catch(()=>null)
    ]);
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
    // Orden (04/11/2026): cuenta, lo que tiene contratado, salud y familia;
    // después el detalle (meses, seguimiento, movimientos, documentos).
    const movs=ledgerBlock(data)+cambiosBlock();
    const nMovs=(data.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted').length;
    const plegado=movs?`<details class="tan-plegable" id="detMovs"${movsAbierto?' open':''}><summary><span class="tan-fila-ico" data-tono="gris">${shellIcon('ledger')}</span><span class="tan-fila-txt"><strong>Movimientos</strong><small>${nMovs} cargo${nMovs===1?'':'s'} y pago${nMovs===1?'':'s'}${Array.isArray(cambios)&&cambios.length?' · cambios al saldo':''}</small></span>${flecha}</summary>${movs}</details>`:'';
    $('tannerBody').innerHTML=`${headBlock(p,url)}${balanceBlock(data)}${cobranza.acuerdoBlock()}${monthsBlock(data)}<div class="tan-grid">${paqueteBlock(data)}${saludBlock()}${familiaBlock(data)}</div>${cobranza.seguimientoBlock()}${plegado}${docsBlock(data)}`;
  };
  paint('');
  cargaCambios(paint,p);
  const saldo=Number(data.summary?.balance||0);
  setShellHealth(saldo>0?{state:'attention',label:`Debe ${money.format(saldo)}`}:{state:'ok',label:'Al corriente'});
  if(p.photo_thumb_path||p.photo_path){const url=await signPhoto(p);if(url){fotoActual=url;paint(url);}}
}

/* ===== Presidencia ajusta el saldo aquí mismo =====
   Pedido del club (06/10/2026): no ir hasta Taquilla o Contabilidad para
   corregir un saldo. Un saldo nunca se sobrescribe: cada acción es un
   movimiento con motivo y con el nombre de quien lo hizo.
     · Cambiar lo que debe (08/11/2026): se escribe cuánto debe quedar.
       Si sube, v2_set_charge_amount; si baja, descuento, condonación o
       corrección con v2_presidency_adjust_charge.
     · Agregar cargo: torneo, uniforme, etc. (v2_presidency_add_charge).
     · Editar pago (08/11/2026): fecha, método y referencia
       (v2_edit_payment); si con la fecha buena pagó a tiempo, el recargo se
       quita solo. Revertirlo sigue ahí, abajo (v2_correct_tanner_payment).
     · Aplicar saldo a favor (v2_apply_player_credit).
   La llave de idempotencia se crea al abrir la hoja y se reusa si se reintenta:
   un doble toque o una red lenta no duplican nada. */
let ultimo=null,hoja=null,movsAbierto=false;
// El plegado de movimientos se queda como lo dejaste aunque la pantalla se repinte.
document.addEventListener('toggle',e=>{if(e.target?.id==='detMovs')movsAbierto=e.target.open;},true);
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-cobrar]');if(!b||!ultimo)return;
  const p=ultimo.player||{};
  abrirCobro({rpc,org:ctx.organization_id,playerId,nombre:[p.first_name,p.last_name].filter(Boolean).join(' '),
    telefono:(p.guardians||[]).find(g=>g.phone)?.phone||'',nacimiento:p.birth_date,preseleccion:b.dataset.cobrar||null,
    quien:ctx.display_name||'',compartida:esCuentaCompartida(ctx),
    foto:{bucket:p.photo_bucket,path:p.photo_path,thumbPath:p.photo_thumb_path},
    alTerminar:()=>render()});
});
const llave=()=>(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`);
const TIPOS_AJUSTE=[['discount','Descuento'],['waiver','Condonación'],['correction','Corrección']];
function cargosAbiertos(){
  const todos=(ultimo?.ledger||[]).filter(m=>m.kind==='charge'&&m.id&&m.status!=='cancelled')
    .map(m=>{const saldo=Number(m.charge_balance||0),pagado=Number(m.allocated||0);
      return {id:m.id,saldo,pagado,neto:Math.round((saldo+pagado)*100)/100,texto:`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}${m.concept&&m.subtype==='other'?` · ${m.concept}`:''}`};});
  return [...todos.filter(c=>c.saldo>0),...todos.filter(c=>c.saldo<=0).slice(0,6)];
}
const METODOS_EDITAR=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta']];
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
    if(!cargos.length){html=cab('Cambiar lo que debe',nombre)+'<p class="pres-nota">Todavía no tiene cargos.</p>';}
    else{
      const elegido=cargos.find(c=>c.id===hoja.charge)||cargos[0];hoja.charge=elegido.id;
      const quede=hoja.monto??elegido.saldo;
      html=cab('Cambiar lo que debe',nombre)+`<form id="presForm" class="pres-form">
        <label>Cargo<select id="presCargo">${cargos.map(c=>`<option value="${esc(c.id)}"${c.id===elegido.id?' selected':''}>${esc(c.texto)} · ${c.saldo>0?`debe ${money.format(c.saldo)}`:'liquidado'}</option>`).join('')}</select></label>
        <div class="pres-cuota"><span>Cargo de ${money.format(elegido.neto)}${elegido.pagado>0?` · pagó ${money.format(elegido.pagado)}`:''}</span><b>Debe ${money.format(elegido.saldo)}</b></div>
        <label>¿Cuánto debe quedar debiendo?<input id="presMonto" type="number" inputmode="decimal" min="0" step="1" value="${esc(String(quede))}"></label>
        <div id="presCambio">${cambioHtml(elegido,quede)}</div>
        ${motivo}${err}${boton('Guardar')}</form>`;
    }
  }else if(hoja.tipo==='cargo'){
    const hoy=new Date().toISOString().slice(0,10);
    html=cab('Agregar cargo',nombre)+`<form id="presForm" class="pres-form">
      <label>Concepto<input id="presConcepto" type="text" maxlength="120" placeholder="Ej. Torneo de Navidad" value="${esc(hoja.concepto||'')}"></label>
      <div class="pres-row"><label>Monto<input id="presMonto" type="number" inputmode="decimal" min="1" step="1" value="${esc(hoja.monto??'')}"></label><label>Fecha límite<input id="presFecha" type="date" value="${esc(hoja.fecha||hoy)}"></label></div>
      <p class="pres-nota">No genera recargo por atraso. Si tiene saldo a favor, se le aplica solo.</p>
      ${motivo}${err}${boton('Agregar cargo')}</form>`;
  }else if(hoja.tipo==='editar'){
    const pago=(ultimo?.ledger||[]).find(m=>m.id===hoja.payment)||{};
    hoja.fecha??=String(pago.date||'').slice(0,10);hoja.metodo??=pago.method;
    hoja.referencia??=pago.reference&&pago.reference!==METODO_PAGO[pago.method]?pago.reference:'';
    const hoyL=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
    html=cab('Editar pago',`${money.format(Math.abs(Number(pago.amount||0)))} · ${METODO_PAGO[pago.method]||'pago'}`)+`<form id="presForm" class="pres-form">
      <label>¿Qué día pagó?<input id="presFecha" type="date" max="${hoyL}" value="${esc(hoja.fecha)}"></label>
      <div class="pres-seg" role="radiogroup" aria-label="Método">${METODOS_EDITAR.map(([v,l])=>`<button type="button" role="radio" aria-checked="${hoja.metodo===v}" data-metodo-ed="${v}">${l}</button>`).join('')}</div>
      <label>Referencia<input id="presRef" type="text" maxlength="80" placeholder="Opcional" value="${esc(hoja.referencia||'')}"></label>
      <p class="pres-nota">Si con la fecha buena pagó a tiempo, el recargo se quita solo. La fecha cambia en todo el cobro (mismo folio).</p>
      ${motivo}${err}${boton('Guardar cambios')}
      <button type="button" class="pres-link-peligro" data-revertir>Revertir este pago</button></form>`;
  }else if(hoja.tipo==='corregir'){
    const pago=(ultimo?.ledger||[]).find(m=>m.id===hoja.payment)||{};
    html=cab('Corregir pago',`${fmtDate(pago.date)} · ${money.format(Math.abs(Number(pago.amount||0)))}`)+`<form id="presForm" class="pres-form">
      <p class="pres-nota">El pago se revierte y lo que cubría vuelve a quedar pendiente. Sale de la caja del día. Si el dinero sí entró pero se capturó mal, vuelve a registrarlo bien en Taquilla.</p>
      ${motivo}${err}${boton('Revertir este pago')}</form>`;
  }else if(hoja.tipo==='paquete'){
    const ops=paq?.options||[];
    const elegido=ops.find(o=>o.code===hoja.codigo);
    const precio=elegido?Number(elegido.price):null,desc=precio!=null?descuentoBecas(precio):0;
    const resumen=elegido&&precio!=null
      ?`Pagará <b>${money.format(Math.max(0,precio-desc))}</b> al mes desde ${esc(MES(paq.period))}${desc>0?` (${money.format(precio)} − becas ${money.format(desc)})`:''}. Lo ya cobrado no cambia.`
      :'Elige un paquete.';
    html=cab('Paquete',nombre)+`<form id="presForm" class="pres-form">
      <div class="pq-opciones" role="radiogroup" aria-label="Paquete">${ops.map(o=>{
        const sin=o.price==null,act=o.code===hoja.codigo,es=paq?.package?.code===o.code;
        return `<button type="button" role="radio" class="pq-op" aria-checked="${act}" data-pq="${esc(o.code)}"${sin?' disabled':''}><span class="pq-radio" aria-hidden="true"></span><span class="pq-txt"><strong>${esc(o.name)}${es?' <em>actual</em>':''}</strong><small>${esc(sin?'Sin precio todavía':detallePaquete(o))}</small></span><span class="pq-precio">${sin?'—':`${money.format(Number(o.price))}`}</span></button>`;}).join('')}</div>
      <p class="pres-nota" id="pqResumen">${resumen}</p>
      <label>Motivo<textarea id="presMotivo" rows="2" maxlength="300" placeholder="Ej. Homologamos porteros a $800">${esc(hoja.motivo||'')}</textarea></label>
      ${err}${boton('Guardar paquete')}</form>`;
  }else if(hoja.tipo==='renovar'){
    const b=(paq?.benefits||[]).find(x=>x.id===hoja.beca)||{};
    const fin=b.endsOn?new Date(`${b.endsOn}T12:00:00`):new Date();
    const hoyD=new Date();const base=fin<hoyD?hoyD:new Date(fin.getTime()+864e5);
    const nuevoFin=new Date(base.getFullYear(),base.getMonth()+3,0);
    html=cab('Renovar beca',nombre)+`<form id="presForm" class="pres-form">
      <div class="pres-cuota"><span>${esc([TIPO_BECA[b.type]||'Beca',becaCuanto(b)].filter(Boolean).join(' '))}</span><b>3 meses</b></div>
      <p class="pres-nota">${b.reason?`“${esc(b.reason)}”. `:''}Hoy vence el ${esc(fmtDate(b.endsOn))}. Renovada, vence el <b>${esc(new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(nuevoFin))}</b> y sigue descontando sola.</p>
      ${err}${boton('Renovar 3 meses')}</form>`;
  }else if(hoja.tipo==='cuota'){
    const pl=ultimo?.player||{},actual=Number(pl.base_monthly_fee||0);
    const nueva=hoja.monto??actual;
    html=cab('Ajustar mensualidad',nombre)+`<form id="presForm" class="pres-form">
      <div class="pres-cuota"><span>Hoy paga</span><b>${pl.is_exempt?'Exento':money.format(actual)}</b></div>
      <label>Nueva mensualidad<input id="presMonto" type="number" inputmode="decimal" min="0" step="1" value="${esc(String(nueva))}"></label>
      <p class="pres-nota">Cuenta desde la próxima mensualidad. Lo que ya se cargó no cambia: para eso usa <b>Cambiar lo que debe</b>. Queda como su cuota personal, ya no la de su categoría.</p>
      <label>¿Por qué paga esto?<textarea id="presMotivo" rows="2" maxlength="300" placeholder="Ej. Hermanos: 10% de descuento acordado con Presidencia">${esc(hoja.motivo||'')}</textarea></label>
      ${err}${boton('Guardar mensualidad')}</form>`;
  }else if(hoja.tipo==='favor'){
    const favor=Number(ultimo?.summary?.credit_available||0);
    html=cab('Aplicar saldo a favor',nombre)+`<form id="presForm" class="pres-form">
      <p class="pres-nota">Tiene ${money.format(favor)} a favor. Se aplica a sus cargos pendientes, del más antiguo al más nuevo.</p>
      ${err}${boton('Aplicar saldo a favor')}</form>`;
  }
  b.innerHTML=html;
  b.querySelector('[data-pres-cerrar]')?.addEventListener('click',()=>{if(!hoja?.enviando)cerrarHoja();});
  b.querySelector('#presCargo')?.addEventListener('change',e=>{guardaCampos();hoja.charge=e.target.value;hoja.monto=undefined;pintarHoja();});
  b.querySelectorAll('[data-ajuste]').forEach(engancharAjuste);
  b.querySelector('#presMonto')?.addEventListener('input',e=>{const q=$('presCambio');if(q&&hoja.tipo==='ajustar'){const c=cargosAbiertos().find(c=>c.id===hoja.charge);if(c){hoja.monto=e.target.value;q.innerHTML=cambioHtml(c,e.target.value);q.querySelectorAll('[data-ajuste]').forEach(engancharAjuste);}}});
  b.querySelectorAll('[data-metodo-ed]').forEach(x=>x.addEventListener('click',()=>{guardaCampos();hoja.metodo=x.dataset.metodoEd;pintarHoja();}));
  b.querySelector('[data-revertir]')?.addEventListener('click',()=>{guardaCampos();hoja.tipo='corregir';hoja.error='';pintarHoja();});
  b.querySelectorAll('[data-pq]').forEach(x=>x.addEventListener('click',()=>{guardaCampos();hoja.codigo=x.dataset.pq;pintarHoja();}));
  b.querySelector('#presForm')?.addEventListener('submit',enviarHoja);
}
function engancharAjuste(x){x.addEventListener('click',()=>{guardaCampos();hoja.ajuste=x.dataset.ajuste;pintarHoja();});}
// Lo que pasa al guardar, dicho antes: sube el cargo, o se quita como
// descuento, condonación o corrección.
function cambioHtml(c,valor){
  const v=String(valor??'').trim()===''?NaN:Number(valor);
  if(!(v>=0))return '<p class="pres-nota">Escribe cuánto debe quedar (puede ser 0).</p>';
  const dif=Math.round((v-c.saldo)*100)/100;
  if(Math.abs(dif)<0.005)return '<p class="pres-nota">Escribe un monto distinto al que debe hoy.</p>';
  if(dif>0)return `<p class="pres-nota pres-sube">Sube <b>${money.format(dif)}</b>: el cargo queda en ${money.format(c.neto+dif)}.</p>`;
  return `<div class="pres-seg" role="radiogroup" aria-label="Cómo se quita">${TIPOS_AJUSTE.map(([k,l])=>`<button type="button" role="radio" aria-checked="${(hoja.ajuste||'discount')===k}" data-ajuste="${k}">${l}</button>`).join('')}</div>
    <p class="pres-nota">Se quitan <b>${money.format(-dif)}</b> y queda debiendo ${money.format(v)}.</p>`;
}
function guardaCampos(){
  if(!hoja)return;
  if($('presRef'))hoja.referencia=$('presRef').value;
  if($('presMotivo'))hoja.motivo=$('presMotivo').value;
  if($('presMonto'))hoja.monto=$('presMonto').value;
  if($('presConcepto'))hoja.concepto=$('presConcepto').value;
  if($('presFecha'))hoja.fecha=$('presFecha').value;
}
const ERRORES={
  'Adjustment exceeds outstanding balance':'No se puede quitar más de lo que se debe de ese cargo.',
  'Adjustment reason required':'Escribe el motivo (al menos 5 letras).',
  'Charge has no outstanding balance':'Ese cargo ya no tiene saldo pendiente.',
  'Amount must be greater than zero':'El monto debe ser mayor a cero.',
  'Not authorized':'No tienes permiso para hacer este cambio.',
  'Billing profile not found':'Este Tanner todavía no tiene cuota registrada. Dale de alta su cuota en Taquilla.'
};
// Sólo se quita un prefijo técnico ("Error: ..."); los mensajes del servidor
// ya vienen en español y pueden llevar dos puntos.
const amable=e=>{const m=String(e?.message||e||'');return ERRORES[m]||m.replace(/^(?:[A-Za-z]*Error|P\d{4})\b[^:]*:\s*/,'')||'No se pudo guardar. Intenta de nuevo.';};
async function enviarHoja(ev){
  ev.preventDefault();if(!hoja||hoja.enviando)return;
  guardaCampos();
  const motivo=String(hoja.motivo||'').trim(),monto=Number(hoja.monto);
  hoja.error='';
  if(hoja.tipo==='paquete'&&!hoja.codigo){hoja.error='Elige un paquete.';pintarHoja();return;}
  if(hoja.tipo==='paquete'&&hoja.codigo===paq?.package?.code){hoja.error='Ya tiene ese paquete.';pintarHoja();return;}
  if(hoja.tipo!=='favor'&&hoja.tipo!=='renovar'&&motivo.length<5){hoja.error='Escribe el motivo (al menos 5 letras): queda en el registro.';pintarHoja();return;}
  if(hoja.tipo==='cargo'&&!(monto>0)){hoja.error='Escribe un monto mayor a cero.';pintarHoja();return;}
  const cAj=hoja.tipo==='ajustar'?cargosAbiertos().find(c=>c.id===hoja.charge):null;
  if(hoja.tipo==='ajustar'&&!(String(hoja.monto??'').trim()!==''&&monto>=0)){hoja.error='Escribe cuánto debe quedar (puede ser 0).';pintarHoja();return;}
  if(hoja.tipo==='ajustar'&&cAj&&Math.abs(monto-cAj.saldo)<0.005){hoja.error='Es lo mismo que ya debe.';pintarHoja();return;}
  if(hoja.tipo==='editar'&&!hoja.fecha){hoja.error='Elige la fecha del pago.';pintarHoja();return;}
  if(hoja.tipo==='cuota'&&!(String(hoja.monto??'').trim()!==''&&monto>=0)){hoja.error='Escribe la nueva mensualidad (puede ser 0).';pintarHoja();return;}
  if(hoja.tipo==='cuota'&&monto===Number(ultimo?.player?.base_monthly_fee||0)&&!ultimo?.player?.is_exempt){hoja.error='Es la misma mensualidad que ya tiene.';pintarHoja();return;}
  if(hoja.tipo==='cargo'&&String(hoja.concepto||'').trim().length<3){hoja.error='Escribe el concepto del cargo.';pintarHoja();return;}
  hoja.enviando=true;pintarHoja();
  const org=ctx.organization_id;let aviso='';
  try{
    if(hoja.tipo==='ajustar'){
      const dif=Math.round((monto-cAj.saldo)*100)/100;
      if(dif>0){
        await rpc('v2_set_charge_amount',{organization_id:org,charge_id:hoja.charge,new_amount:Math.round((cAj.neto+dif)*100)/100,reason:motivo,idempotency_key:hoja.llave});
        aviso=`Listo: ahora debe ${money.format(monto)} de ese cargo (subió ${money.format(dif)}).`;
      }else{
        await rpc('v2_presidency_adjust_charge',{organization_id:org,charge_id:hoja.charge,adjustment_type:hoja.ajuste||'discount',amount:-dif,reason:motivo,idempotency_key:hoja.llave});
        aviso=`Listo: se quitaron ${money.format(-dif)}; debe ${money.format(monto)} de ese cargo.`;
      }
    }else if(hoja.tipo==='editar'){
      const r=await rpc('v2_edit_payment',{organization_id:org,payment_id:hoja.payment,payment_date:hoja.fecha,method:hoja.metodo||null,reference:String(hoja.referencia??''),reason:motivo});
      aviso=Number(r?.lateFeesAmount)>0?`Pago editado. Se quitó el recargo de ${money.format(Number(r.lateFeesAmount))}: pagó a tiempo.`:'Pago editado.';
    }else if(hoja.tipo==='cargo'){
      await rpc('v2_presidency_add_charge',{organization_id:org,player_id:playerId,concept:String(hoja.concepto).trim(),amount:monto,due_date:hoja.fecha||null,reason:motivo,idempotency_key:hoja.llave});
      aviso=`Cargo agregado: ${String(hoja.concepto).trim()} por ${money.format(monto)}.`;
    }else if(hoja.tipo==='corregir'){
      await rpc('v2_correct_tanner_payment',{organization_id:org,payment_id:hoja.payment,reason:motivo});
      aviso='Pago revertido. Lo que cubría volvió a quedar pendiente.';
    }else if(hoja.tipo==='paquete'){
      const r=await rpc('v2_set_player_package',{organization_id:org,player_id:playerId,package_code:hoja.codigo,reason:motivo});
      aviso=`Paquete guardado: ${r?.packageName||''}, ${money.format(Number(r?.fee||0))} al mes desde ${MES(r?.from)}.`;
    }else if(hoja.tipo==='renovar'){
      const r=await rpc('v2_renew_benefit',{organization_id:org,benefit_id:hoja.beca,reason:null});
      aviso=`Beca renovada hasta el ${fmtDate(r?.endsOn)}.`;
    }else if(hoja.tipo==='cuota'){
      // La nota es el "por qué paga lo que paga" que también ve Taquilla.
      await rpc('v2_set_player_fee_note',{organization_id:org,player_id:playerId,note:motivo,monthly_fee:monto});
      aviso=`Mensualidad guardada: ${money.format(monto)} al mes.`;
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
  else if(t==='editar')abrirHoja('editar',{payment:b.dataset.payment});
  else if(t==='favor')abrirHoja('favor');
});
document.addEventListener('click',e=>{
  if(!e.target.closest?.('[data-cuota]')||!ultimo||!esPresidencia())return;
  abrirHoja('cuota');
});
document.addEventListener('click',e=>{
  if(!e.target.closest?.('[data-paquete]')||!ultimo||!paq?.canEdit)return;
  abrirHoja('paquete',{codigo:paq.package?.code||null});
});
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-renovar]');if(!b||!ultimo||!paq?.canRenew)return;
  abrirHoja('renovar',{beca:b.dataset.renovar});
});

await render();
