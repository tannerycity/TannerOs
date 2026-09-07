import {supabase,bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,shellIcon} from '/v2/shell.js';

// El shell valida el módulo activo, pero un estado de cuenta lo abre tanto
// Cobranza como Jugadores. Se entra con 'inicio' (que el shell exceptúa) y el
// permiso real lo impone el RPC, que exige billing, players o accounting.
const boot=await bootstrapProtectedShell({active:'inicio',title:'Estado de cuenta'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const can=(code,write=false)=>moduleAccess(navigation,code,write);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const playerId=new URLSearchParams(location.search).get('id');

const CHARGE_LABEL={monthly_fee:'Mensualidad',late_fee:'Recargo',academy_fee:'Academia',uniform:'Uniforme',other:'Otro cargo'};
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
    const {data,error}=await supabase.storage.from(p.photo_bucket||'tanneros-private').createSignedUrl(path,3600);
    return error?'':(data?.signedUrl||'');
  }catch(e){return '';}
}

function headBlock(p,photoUrl){
  const face=photoUrl?`<img src="${esc(photoUrl)}" alt="">`:`<b aria-hidden="true">${esc(initials(p))}</b>`;
  const name=[p.first_name,p.last_name].filter(Boolean).join(' ');
  const chips=[];
  if(p.category)chips.push(`<span class="tan-chip">${esc(p.category)}</span>`);
  chips.push(`<span class="tan-chip" ${p.status!=='active'?'data-tone="off"':''}>${esc(STATUS_LABEL[p.status]||p.status||'')}</span>`);
  if(p.jersey_number)chips.push(`<span class="tan-chip">#${esc(p.jersey_number)}</span>`);
  const desde=p.enrolled_on||p.joined_at;
  if(desde)chips.push(`<span class="tan-chip">Desde ${esc(fmtDate(desde))}</span>`);
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
function ledgerBlock(data){
  const rows=(data.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted');
  if(!rows.length)return '';
  const html=rows.map(m=>{
    const monto=Number(m.amount||0),cargo=m.kind==='charge';
    const titulo=cargo?`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}`:'Pago recibido';
    const detalle=cargo
      ? `${fmtDate(m.date)}${m.charge_balance>0?` · quedan ${money.format(Number(m.charge_balance))}`:' · liquidado'}`
      : `${fmtDate(m.date)}${m.method?` · ${esc(m.method)}`:''}${m.reference?` · ${esc(m.reference)}`:''}`;
    return `<div class="tan-mov" data-kind="${cargo?'charge':'payment'}"><span class="tan-dot">${shellIcon(cargo?'ledger':'check')}</span><span class="tan-mov-body"><strong>${esc(titulo)}</strong><span>${detalle}</span></span><span class="tan-mov-nums"><b>${cargo?'+':'−'}${money.format(Math.abs(monto))}</b><span>${saldoTexto(Number(m.running_balance||0))}</span></span></div>`;
  }).join('');
  return `<section class="tan-section"><div class="tan-section-head"><h2>Movimientos</h2><span>${rows.length} en total</span></div><div class="tan-ledger">${html}</div></section>`;
}

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
  const p=data.player;
  const nombre=[p.first_name,p.last_name].filter(Boolean).join(' ');
  document.title=`${nombre} · Estado de cuenta`;
  const titulo=$('shellTitle');if(titulo)titulo.textContent=nombre;

  // Se pinta sin foto y la foto entra después: la URL firmada no debe retrasar
  // el dato, que es a lo que la persona vino.
  const paint=url=>{
    $('tannerBody').innerHTML=`${headBlock(p,url)}${balanceBlock(data)}${ledgerBlock(data)}<div class="tan-grid">${docsBlock(data)}${extrasBlock(data)}</div>`;
  };
  paint('');
  const saldo=Number(data.summary?.balance||0);
  setShellHealth(saldo>0?{state:'attention',label:`Debe ${money.format(saldo)}`}:{state:'ok',label:'Al corriente'});
  if(p.photo_thumb_path||p.photo_path){const url=await signPhoto(p);if(url)paint(url);}
}

await render();
