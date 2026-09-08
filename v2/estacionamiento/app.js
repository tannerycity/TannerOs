import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth} from '/v2/shell.js';

// Padrón de gafetes. La cola de solicitudes va primero porque es lo único con
// una familia esperando del otro lado; el resto es consulta.
const boot=await bootstrapProtectedShell({active:'estacionamiento',title:'Estacionamiento'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const puedeAutorizar=moduleAccess(navigation,'estacionamiento',true)||moduleAccess(navigation,'contabilidad',true)||moduleAccess(navigation,'cobranza',true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={data:null,filtro:'requested',busca:'',tanners:null,alta:false};
const PORTADOR={familia:'Familia',coach:'Profe',scout:'Visor',staff:'Staff',
  sponsor:'Patrocinador',vendor:'Proveedor',other:'Otro'};

const ESTADO={requested:'Solicitado',approved:'Autorizado',issued:'Entregado',
  rejected:'Rechazado',revoked:'Cancelado',lost:'Perdido',expired:'Vencido'};
const EVENTO={requested:'Solicitado',approved:'Autorizado y cobrado',courtesy:'Autorizado como cortesía',
  issued:'Gafete entregado',rejected:'Solicitud rechazada',revoked:'Gafete cancelado',
  lost:'Reportado perdido',expired:'Vencido por temporada'};
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
    kpi('Por cobrar',money.format(Number(s.por_cobrar||0)),'De gafetes autorizados',Number(s.por_cobrar||0)>0?'danger':'')}${
    kpi('Cortesías',s.cortesias||0,`${money.format(Number(s.cortesia_valor||0))} no cobrados`)
  }</section>`;

  const chips=[['requested','Por autorizar'],['approved','Por entregar'],['issued','Entregados'],
               ['vigentes','Vigentes'],['todos','Todos']]
    .map(([k,l])=>`<button class="park-chip" type="button" data-f="${k}" aria-pressed="${state.filtro===k}">${l}</button>`).join('');

  const filas=filtrados.map(p=>{
    const saldo=Number(p.balance||0);
    const detalle=[p.holder_kind!=='familia'&&PORTADOR[p.holder_kind],p.category,
      p.guardian&&`tutor: ${p.guardian}`,p.vehicle,p.folio&&`folio ${p.folio}`,
      p.is_courtesy&&p.courtesy_reason?`cortesía: ${p.courtesy_reason}`:null,
      saldo>0&&`debe ${money.format(saldo)}`].filter(Boolean).join(' · ');
    const acciones=[];
    if(p.status==='requested'&&puedeAutorizar)
      acciones.push(`<button data-kind="go" data-approve="${esc(p.id)}" type="button">Autorizar ${money.format(Number(d.price||0))}</button>`,
                    `<button data-courtesy="${esc(p.id)}" type="button">Cortesía</button>`,
                    `<button data-reject="${esc(p.id)}" type="button">Rechazar</button>`);
    if(p.status==='approved')acciones.push(`<button data-kind="go" data-issue="${esc(p.id)}" type="button">Entregar</button>`);
    if(p.status==='issued')acciones.push(`<button data-lost="${esc(p.id)}" type="button">Perdido</button>`,
                                         `<button data-revoke="${esc(p.id)}" type="button">Cancelar</button>`);
    acciones.push(`<button data-detail="${esc(p.id)}" type="button">Historial</button>`);
    return `<div class="park-row"><span class="park-plate">${esc(p.plate||'—')}</span><span class="park-body"><strong>${esc(p.player||'Tanner')}</strong><span>${esc(detalle)}</span></span><span class="park-actions">${p.is_courtesy?'<span class="park-state" data-s="courtesy">Cortesía</span>':''}<span class="park-state" data-s="${esc(p.status)}">${esc(ESTADO[p.status]||p.status)}</span>${acciones.join('')}</span></div>`;
  }).join('');

  const alta=state.alta?`<section class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Nuevo gafete</h2><span class="tos-user-note">Para quien no entra al portal</span></div><form id="parkNew" class="park-form"><label>Para<select id="nkind">${Object.entries(PORTADOR).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><label id="nplayerWrap">Tanner<select id="nplayer"></select></label><label id="nnameWrap" hidden>Nombre<input id="nname" maxlength="80" placeholder="Carlos Méndez"></label><label id="nphoneWrap" hidden><span>Teléfono <span class="tos-user-note">(opcional)</span></span><input id="nphone" maxlength="20" inputmode="tel"></label><label>Placas<input id="nplate" maxlength="15" placeholder="ABC-123-X" required></label><label><span>Vehículo <span class="tos-user-note">(opcional)</span></span><input id="nvehicle" maxlength="60" placeholder="Tsuru blanco"></label><label class="park-check"><input id="ncourtesy" type="checkbox"> Sin costo (cortesía)</label><label id="nreasonWrap" hidden>Motivo de la cortesía<input id="nreason" maxlength="120" placeholder="Entrenador de U13"></label><button class="primary" type="submit">Dar de alta</button><div id="nmsg" class="inline-message hidden"></div></form></section>`:'';

  $('parkBody').innerHTML=`${kpis}<section class="tos-panel"><div class="tos-panel-head"><h2>Padrón de gafetes</h2><button id="parkToggleNew" class="secondary mini" type="button">${state.alta?'Cerrar':'Nuevo gafete'}</button></div><div class="park-filters">${chips}<input id="parkSearch" class="park-search" type="search" placeholder="Buscar placa, Tanner, tutor o folio" value="${esc(state.busca)}"></div><div>${filas||'<div class="tos-empty">No hay gafetes con ese filtro.</div>'}</div></section>${alta}`;

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
  $('parkBody').querySelectorAll('[data-courtesy]').forEach(b=>b.addEventListener('click',()=>darCortesia(b.dataset.courtesy)));
  $('parkToggleNew')?.addEventListener('click',()=>{state.alta=!state.alta;render();if(state.alta)montarAlta();});
  if(state.alta)montarAlta();

  setShellHealth(Number(s.requested||0)>0
    ? {state:'attention',label:`${s.requested} por autorizar`}
    : {state:'ok',label:'Sin solicitudes'});
}


// Alta manual: el profe o el visor no entran al portal, así que el club los
// da de alta aquí. Nace como solicitud y se autoriza en el mismo flujo, para
// que ningún gafete se salte la bitácora.
async function montarAlta(){
  const kind=$('nkind');if(!kind)return;
  if(!state.tanners){
    try{state.tanners=await rpc('v2_players',{organization_id:ctx.organization_id,status_filter:'active'})||[];}
    catch(e){state.tanners=[];}
  }
  const sel=$('nplayer');
  if(sel&&!sel.options.length){
    state.tanners.forEach(p=>{
      const o=document.createElement('option');
      o.value=p.id;o.textContent=[p.first_name,p.last_name].filter(Boolean).join(' ')+(p.category?` · ${p.category}`:'');
      sel.appendChild(o);
    });
  }
  const sync=()=>{
    const esFamilia=kind.value==='familia';
    $('nplayerWrap').hidden=!esFamilia;
    $('nnameWrap').hidden=esFamilia;
    $('nphoneWrap').hidden=esFamilia;
    $('nreasonWrap').hidden=!$('ncourtesy').checked;
  };
  kind.addEventListener('change',sync);
  $('ncourtesy').addEventListener('change',sync);
  sync();
  $('parkNew').addEventListener('submit',async e=>{
    e.preventDefault();
    const box=$('nmsg');box.classList.add('hidden');
    const esFamilia=kind.value==='familia';
    try{
      await rpc('v2_create_parking',{
        organization_id:ctx.organization_id, holder_kind:kind.value, plate:$('nplate').value,
        player_id:esFamilia?$('nplayer').value:null,
        holder_name:esFamilia?null:$('nname').value,
        holder_phone:esFamilia?null:($('nphone').value||null),
        vehicle:$('nvehicle').value||null,
        courtesy:$('ncourtesy').checked, courtesy_reason:$('nreason').value||null});
      state.alta=false;state.filtro='requested';await load();
    }catch(error){
      box.textContent=String(error?.message||error);box.dataset.type='error';box.classList.remove('hidden');
    }
  });
}

// Cortesía: regalar el lugar siempre pide motivo, y queda con nombre y fecha
// en la bitácora.
async function darCortesia(id){
  const motivo=prompt('¿Por qué se da sin costo? (queda registrado)','');
  if(motivo===null||!motivo.trim())return;
  const folio=prompt('Folio del gafete (opcional):','');
  if(folio===null)return;
  try{
    await rpc('v2_approve_parking',{organization_id:ctx.organization_id,pass_id:id,
      folio:folio||null,courtesy:true,courtesy_reason:motivo.trim()});
    await load();
  }catch(error){alert(String(error?.message||error));}
}

async function aprobar(id){
  const folio=prompt('Folio del gafete (puedes dejarlo en blanco y ponerlo al entregarlo):','');
  if(folio===null)return;
  try{await rpc('v2_approve_parking',{organization_id:ctx.organization_id,pass_id:id,folio:folio||null,courtesy:false,courtesy_reason:null});await load();}
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
