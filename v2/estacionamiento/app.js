import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth} from '/v2/shell.js';

// Padrón de gafetes. La cola de solicitudes va primero porque es lo único con
// una familia esperando del otro lado; el resto es consulta.
const boot=await bootstrapProtectedShell({active:'inicio',title:'Estacionamiento'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const puedeAutorizar=moduleAccess(navigation,'contabilidad',true)||moduleAccess(navigation,'cobranza',true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={data:null,filtro:'requested',busca:''};

const ESTADO={requested:'Solicitado',approved:'Autorizado',issued:'Entregado',
  rejected:'Rechazado',revoked:'Cancelado',lost:'Perdido',expired:'Vencido'};
const EVENTO={requested:'La familia lo solicitó',approved:'Autorizado y cobrado',issued:'Gafete entregado',
  rejected:'Solicitud rechazada',revoked:'Gafete cancelado',lost:'Reportado perdido',expired:'Vencido por temporada'};
const ACTOR={familia:'desde el portal',staff:'por el club',sistema:'automático'};

function fmtFecha(v){
  if(!v)return '';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v)
    :new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d);
}
function kpi(label,value,sub='',cls=''){
  return `<article class="tos-kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;
}

async function load(){
  try{state.data=await rpc('v2_parking_passes',{organization_id:ctx.organization_id,status_filter:null});}
  catch(error){
    $('parkBody').innerHTML=`<div class="tos-empty">${esc(String(error?.message||error))}</div>`;
    return;
  }
  render();
}

function render(){
  const d=state.data||{},passes=d.passes||[],s=d.summary||{};
  const q=state.busca.trim().toLowerCase();
  const vivos=['requested','approved','issued'];
  const filtrados=passes.filter(p=>{
    const porEstado=state.filtro==='todos'?true
      :state.filtro==='vigentes'?vivos.includes(p.status)
      :p.status===state.filtro;
    if(!porEstado)return false;
    if(!q)return true;
    return [p.plate,p.player,p.guardian,p.folio,p.vehicle].filter(Boolean)
      .some(v=>String(v).toLowerCase().includes(q));
  });

  const kpis=`<section class="tos-kpis park-kpis">${
    kpi('Por autorizar',s.requested||0,'Solicitudes de familias',Number(s.requested||0)>0?'attention':'')}${
    kpi('Por entregar',s.approved||0,'Autorizados sin recoger')}${
    kpi('Entregados',s.issued||0,`Temporada ${d.season||''}`)}${
    kpi('Por cobrar',money.format(Number(s.por_cobrar||0)),'De gafetes autorizados',Number(s.por_cobrar||0)>0?'danger':'')
  }</section>`;

  const chips=[['requested','Por autorizar'],['approved','Por entregar'],['issued','Entregados'],
               ['vigentes','Vigentes'],['todos','Todos']]
    .map(([k,l])=>`<button class="park-chip" type="button" data-f="${k}" aria-pressed="${state.filtro===k}">${l}</button>`).join('');

  const filas=filtrados.map(p=>{
    const saldo=Number(p.balance||0);
    const detalle=[p.category,p.guardian&&`tutor: ${p.guardian}`,p.vehicle,
      p.folio&&`folio ${p.folio}`,saldo>0&&`debe ${money.format(saldo)}`].filter(Boolean).join(' · ');
    const acciones=[];
    if(p.status==='requested'&&puedeAutorizar)
      acciones.push(`<button data-kind="go" data-approve="${esc(p.id)}" type="button">Autorizar ${money.format(Number(p.price||0))}</button>`,
                    `<button data-reject="${esc(p.id)}" type="button">Rechazar</button>`);
    if(p.status==='approved')acciones.push(`<button data-kind="go" data-issue="${esc(p.id)}" type="button">Entregar</button>`);
    if(p.status==='issued')acciones.push(`<button data-lost="${esc(p.id)}" type="button">Perdido</button>`,
                                         `<button data-revoke="${esc(p.id)}" type="button">Cancelar</button>`);
    acciones.push(`<button data-detail="${esc(p.id)}" type="button">Historial</button>`);
    return `<div class="park-row"><span class="park-plate">${esc(p.plate||'—')}</span><span class="park-body"><strong>${esc(p.player||'Tanner')}</strong><span>${esc(detalle)}</span></span><span class="park-actions"><span class="park-state" data-s="${esc(p.status)}">${esc(ESTADO[p.status]||p.status)}</span>${acciones.join('')}</span></div>`;
  }).join('');

  $('parkBody').innerHTML=`${kpis}<section class="tos-panel"><div class="tos-panel-head"><h2>Padrón de gafetes</h2><span class="tos-user-note">${filtrados.length} de ${passes.length}</span></div><div class="park-filters">${chips}<input id="parkSearch" class="park-search" type="search" placeholder="Buscar placa, Tanner, tutor o folio" value="${esc(state.busca)}"></div><div>${filas||'<div class="tos-empty">No hay gafetes con ese filtro.</div>'}</div></section>`;

  $('parkBody').querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{
    state.filtro=b.dataset.f;render();}));
  const buscador=$('parkSearch');
  buscador?.addEventListener('input',e=>{state.busca=e.target.value;render();
    const n=$('parkSearch');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}});
  $('parkBody').querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>aprobar(b.dataset.approve)));
  $('parkBody').querySelectorAll('[data-issue]').forEach(b=>b.addEventListener('click',()=>entregar(b.dataset.issue)));
  $('parkBody').querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>cerrar(b.dataset.reject,'rejected','Motivo del rechazo:')));
  $('parkBody').querySelectorAll('[data-lost]').forEach(b=>b.addEventListener('click',()=>cerrar(b.dataset.lost,'lost','¿Qué reportó la familia?')));
  $('parkBody').querySelectorAll('[data-revoke]').forEach(b=>b.addEventListener('click',()=>cerrar(b.dataset.revoke,'revoked','Motivo de la cancelación:')));
  $('parkBody').querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>verHistorial(b.dataset.detail)));

  setShellHealth(Number(s.requested||0)>0
    ? {state:'attention',label:`${s.requested} por autorizar`}
    : {state:'ok',label:'Sin solicitudes'});
}

async function aprobar(id){
  const folio=prompt('Folio del gafete (puedes dejarlo en blanco y ponerlo al entregarlo):','');
  if(folio===null)return;
  try{await rpc('v2_approve_parking',{organization_id:ctx.organization_id,pass_id:id,folio:folio||null});await load();}
  catch(error){alert(String(error?.message||error));}
}
async function entregar(id){
  const folio=prompt('Folio del gafete que estás entregando:','');
  if(folio===null)return;
  try{await rpc('v2_issue_parking',{organization_id:ctx.organization_id,pass_id:id,folio});await load();}
  catch(error){alert(String(error?.message||error));}
}
// Cerrar nunca cancela el cargo: condonar es una decisión aparte, y pasa por
// Contabilidad con su propia autorización.
async function cerrar(id,estado,pregunta){
  const motivo=prompt(pregunta,'');
  if(motivo===null||!motivo.trim())return;
  try{
    const r=await rpc('v2_close_parking',{organization_id:ctx.organization_id,pass_id:id,new_status:estado,reason:motivo.trim()});
    await load();
    if(r?.charge_pendiente)alert('Listo. El cargo del gafete sigue en su estado de cuenta: si vas a condonarlo, hazlo en Contabilidad › Ajustes.');
  }catch(error){alert(String(error?.message||error));}
}

function cerrarDrawer(){
  $('parkDrawer').classList.add('hidden');$('parkBackdrop').classList.add('hidden');
}
async function verHistorial(id){
  $('parkDrawerBody').innerHTML='<div class="tos-empty">Cargando…</div>';
  $('parkDrawer').classList.remove('hidden');$('parkBackdrop').classList.remove('hidden');
  let d;
  try{d=await rpc('v2_parking_pass_detail',{organization_id:ctx.organization_id,pass_id:id});}
  catch(error){$('parkDrawerBody').innerHTML=`<div class="tos-empty">${esc(String(error?.message||error))}</div>`;return;}
  $('parkDrawerTitle').textContent=d.plate||'Gafete';
  const saldo=Number(d.balance||0);
  const datos=[['Tanner',d.player],['Tutor',d.guardian],['Vehículo',d.vehicle],['Folio',d.folio],
    ['Temporada',d.season],['Vence',d.expires_on],['Estado',ESTADO[d.status]||d.status],
    ['Cobro',saldo>0?`${money.format(saldo)} pendiente`:'Cubierto'],['Motivo',d.close_reason]]
    .filter(([,v])=>v!=null&&v!=='')
    .map(([k,v])=>`<div class="tan-row"><span><strong>${esc(k)}</strong></span><span class="tan-state">${esc(String(v))}</span></div>`).join('');
  const eventos=(d.events||[]).map(e=>{
    const quien=[ACTOR[e.actor_kind]||e.actor_kind,e.actor].filter(Boolean).join(' · ');
    return `<div class="park-ev"><span class="park-ev-dot"></span><span><strong>${esc(EVENTO[e.event]||e.event)}</strong><span>${esc(fmtFecha(e.at))} · ${esc(quien)}${e.note?` · ${esc(e.note)}`:''}</span></span></div>`;
  }).join('');
  $('parkDrawerBody').innerHTML=`<div class="tan-rows">${datos}</div><h3 style="margin:20px 0 0;font-size:15px">Historial</h3><div class="park-log">${eventos||'<div class="tos-empty">Sin movimientos.</div>'}</div>`;
}

$('parkClose').addEventListener('click',cerrarDrawer);
$('parkBackdrop').addEventListener('click',cerrarDrawer);
await load();
