import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth} from '/v2/shell.js';

// Padrón de gafetes. La cola de solicitudes va primero porque es lo único con
// una familia esperando del otro lado; el resto es consulta.
const boot=await bootstrapProtectedShell({active:'estacionamiento',title:'Estacionamiento'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const puedeAutorizar=moduleAccess(navigation,'estacionamiento',true)||moduleAccess(navigation,'contabilidad',true)||moduleAccess(navigation,'cobranza',true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={data:null,filtro:'requested',busca:'',tanners:null,alta:false};
const TIPO={tanner:'Tanner Pass',vip:'VIP'};
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
// Hoja para el de la caseta: se imprime lo mismo que estás viendo, agrupado
// por tipo de pase y ordenado por placa, que es lo único que él puede checar
// desde la ventanilla.
function hojaImpresa(lista,etiqueta,season){
  const hoy=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());
  const grupos=Object.keys(TIPO).map(t=>[t,lista.filter(p=>(p.pass_type||'tanner')===t)
    .sort((a,b)=>String(a.plate||'').localeCompare(String(b.plate||''),'es'))]).filter(([,f])=>f.length);
  const bloques=grupos.map(([t,f])=>`<h2>${esc(TIPO[t])} <small>${f.length} ${f.length===1?'gafete':'gafetes'}</small></h2><table class="park-print-table"><thead><tr><th>Placas</th><th>Vehículo</th><th>Portador</th><th>Folio</th><th>Estado</th></tr></thead><tbody>${
    f.map(p=>`<tr><td class="pp-plate">${esc(p.plate||'—')}</td><td>${esc(p.vehicle||'—')}</td><td>${esc(p.player||'—')}${p.category?`<small> · ${esc(p.category)}</small>`:''}${p.guardian?`<br><small>tutor: ${esc(p.guardian)}</small>`:''}</td><td>${esc(p.folio||'—')}</td><td>${esc(ESTADO[p.status]||p.status||'')}${p.is_courtesy?' · cortesía':''}</td></tr>`).join('')
  }</tbody></table>`).join('');
  return `<header class="park-print-head"><div><strong>Tannery City · Gafetes de estacionamiento</strong><small>${esc(etiqueta)}${season?` · temporada ${esc(String(season))}`:''}</small></div><div class="park-print-meta"><small>${esc(hoy)}</small><small>${lista.length} ${lista.length===1?'gafete':'gafetes'} en la lista</small></div></header>${
    bloques||'<p class="park-print-empty">No hay gafetes en esta lista.</p>'
  }<footer class="park-print-foot">El gafete es personal e intransferible: solo entra el vehículo con estas placas. Si las placas no coinciden con la lista, no se autoriza el acceso.</footer>`;
}
function kpi(label,value,sub='',cls='',filter=''){
  return `<button class="tos-kpi park-kpi ${cls}" type="button" data-kpi-filter="${esc(filter)}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}<i>Ver detalle ›</i></button>`;
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
      :state.filtro==='cancelados'?['rejected','revoked','lost','expired'].includes(p.status)
      :state.filtro==='por_cobrar'?Number(p.balance||0)>0
      :state.filtro==='cortesias'?p.is_courtesy
      :p.status===state.filtro;
    if(!porEstado)return false;
    if(!q)return true;
    return [p.plate,p.player,p.guardian,p.folio,p.vehicle].filter(Boolean)
      .some(v=>String(v).toLowerCase().includes(q));
  });

  const kpis=`<section class="tos-kpis park-kpis">${
    kpi('Por autorizar',s.requested||0,'Solicitudes de familias',Number(s.requested||0)>0?'attention':'','requested')}${
    kpi('Por entregar',s.approved||0,'Autorizados sin recoger','','approved')}${
    kpi('Entregados',s.issued||0,`Temporada ${d.season||''}`,'','issued')}${
    kpi('Por cobrar',money.format(Number(s.por_cobrar||0)),'Toca para ver quién debe',Number(s.por_cobrar||0)>0?'danger':'','por_cobrar')}${
    kpi('Cortesías',s.cortesias||0,`${money.format(Number(s.cortesia_valor||0))} no cobrados`,'','cortesias')
  }</section>`;

  const chips=[['requested','Por autorizar'],['approved','Por entregar'],['issued','Entregados'],
               ['vigentes','Vigentes'],['cancelados','Cancelados'],['todos','Todos']]
    .map(([k,l])=>`<button class="park-chip" type="button" data-f="${k}" aria-pressed="${state.filtro===k}">${l}</button>`).join('');

  const precio=t=>Number((d.prices||{})[t||'tanner']??d.price??0);

  const filas=filtrados.map(p=>{
    const saldo=Number(p.balance||0);
    const detalle=[p.holder_kind!=='familia'&&PORTADOR[p.holder_kind],p.category,
      p.guardian&&`tutor: ${p.guardian}`,p.vehicle,p.folio&&`folio ${p.folio}`,
      p.is_courtesy&&p.courtesy_reason?`cortesía: ${p.courtesy_reason}`:null,
      saldo>0&&`debe ${money.format(saldo)}`].filter(Boolean).join(' · ');
    const acciones=[];
    const eligeTipo=p.status==='requested'&&puedeAutorizar;
    if(eligeTipo)
      acciones.push(`<select class="park-type-pick" data-typefor="${esc(p.id)}" aria-label="Tipo de pase">${Object.entries(TIPO).map(([k,l])=>`<option value="${k}"${(p.pass_type||'tanner')===k?' selected':''}>${l}</option>`).join('')}</select>`,`<button data-kind="go" data-approve="${esc(p.id)}" type="button">Autorizar ${money.format(precio(p.pass_type))}</button>`,
                    `<button data-courtesy="${esc(p.id)}" type="button">Cortesía</button>`,
                    `<button data-reject="${esc(p.id)}" type="button">Rechazar</button>`);
    if(p.status==='approved')acciones.push(`<button data-kind="go" data-issue="${esc(p.id)}" type="button">Entregar</button>`);
    if(p.status==='issued')acciones.push(`<button data-lost="${esc(p.id)}" type="button">Perdido</button>`,
                                         `<button data-revoke="${esc(p.id)}" type="button">Cancelar</button>`);
    const playerId=p.player_id||p.playerId;
    if(saldo>0&&playerId)acciones.push(`<a class="park-cash-link" href="/taquilla/?action=cobrar&amp;player=${encodeURIComponent(playerId)}&amp;amount=${encodeURIComponent(saldo)}&amp;name=${encodeURIComponent(p.player||'Tanner')}">Cobrar en Taquilla</a>`);
    acciones.push(`<button data-detail="${esc(p.id)}" type="button">Ver detalle</button>`);
    const badge=eligeTipo?'':`<span class="park-type" data-t="${esc(p.pass_type||'tanner')}">${esc(TIPO[p.pass_type]||TIPO.tanner)}</span>`;
    return `<div class="park-row"><span class="park-plate">${esc(p.plate||'—')}</span><span class="park-body"><strong>${esc(p.player||'Tanner')}</strong><span>${esc(detalle)}</span></span><span class="park-actions">${badge}${p.is_courtesy?'<span class="park-state" data-s="courtesy">Cortesía</span>':''}<span class="park-state" data-s="${esc(p.status)}">${esc(ESTADO[p.status]||p.status)}</span>${acciones.join('')}</span></div>`;
  }).join('');

  const alta=state.alta?`<section class="tos-panel" style="margin-top:14px"><div class="tos-panel-head"><h2>Nuevo gafete</h2><span class="tos-user-note">Para quien no entra al portal</span></div><form id="parkNew" class="park-form"><nav class="park-stepper" aria-label="Alta en tres pasos"><b class="on">1 Persona</b><b>2 Gafete</b><b>3 Confirmar</b></nav><section class="park-new-step" data-new-step="1"><label>Para<select id="nkind">${Object.entries(PORTADOR).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><label id="nplayerWrap">Tanner<select id="nplayer" data-smart-search data-search-placeholder="Escribe el nombre del Tanner"></select></label><label id="nnameWrap" hidden>Nombre<input id="nname" maxlength="80" placeholder="Carlos Méndez"></label><label id="nphoneWrap" hidden><span>Teléfono <span class="tos-user-note">(opcional)</span></span><input id="nphone" maxlength="20" inputmode="tel"></label><button class="primary park-next" type="button" data-next-step="2">Continuar</button></section><section class="park-new-step" data-new-step="2" hidden><label>Tipo de pase<select id="ntype">${Object.entries(TIPO).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><label>Placas<input id="nplate" maxlength="15" placeholder="ABC-123-X" required></label><label><span>Vehículo <span class="tos-user-note">(opcional)</span></span><input id="nvehicle" maxlength="60" placeholder="Tsuru blanco"></label><span class="park-step-actions"><button class="secondary" type="button" data-prev-step="1">Atrás</button><button class="primary" type="button" data-next-step="3">Continuar</button></span></section><section class="park-new-step" data-new-step="3" hidden><div class="park-confirm-copy"><strong>Todo listo</strong><span>Revisa si se cobra o es cortesía. El folio se asigna automáticamente.</span></div><label class="park-check"><input id="ncourtesy" type="checkbox"> Sin costo (cortesía)</label><label id="nreasonWrap" hidden>Motivo de la cortesía<input id="nreason" maxlength="120" placeholder="Entrenador de U13"></label><span class="park-step-actions"><button class="secondary" type="button" data-prev-step="2">Atrás</button><button class="primary" type="submit">Asignar gafete</button></span><div id="nmsg" class="inline-message hidden"></div></section></form></section>`:'';

  $('parkBody').innerHTML=`${kpis}<section class="tos-panel"><div class="tos-panel-head"><h2>Padrón de gafetes</h2><span class="park-head-actions"><button id="parkPrintBtn" class="secondary mini" type="button">Imprimir / PDF</button><button id="parkToggleNew" class="secondary mini" type="button">${state.alta?'Cerrar':'Nuevo gafete'}</button></span></div><div class="park-filters">${chips}<input id="parkSearch" class="park-search" type="search" placeholder="Buscar placa, Tanner, tutor o folio" value="${esc(state.busca)}"></div><div>${filas||'<div class="tos-empty">No hay gafetes con ese filtro.</div>'}</div></section>${alta}`;

  const etiqueta=({requested:'Por autorizar',approved:'Por entregar',issued:'Entregados',
    vigentes:'Vigentes',cancelados:'Cancelados',por_cobrar:'Por cobrar',cortesias:'Cortesías',todos:'Todos'})[state.filtro]||'Gafetes';
  $('parkPrint').innerHTML=hojaImpresa(filtrados,state.busca?`${etiqueta} · filtro "${state.busca}"`:etiqueta,d.season);
  $('parkPrintBtn')?.addEventListener('click',()=>window.print());

  $('parkBody').querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{
    state.filtro=b.dataset.f;render();}));
  $('parkBody').querySelectorAll('[data-kpi-filter]').forEach(b=>b.addEventListener('click',()=>{
    state.filtro=b.dataset.kpiFilter;state.busca='';render();document.querySelector('.park-filters')?.scrollIntoView({behavior:'smooth',block:'start'});}));
  const buscador=$('parkSearch');
  buscador?.addEventListener('input',e=>{state.busca=e.target.value;render();
    const n=$('parkSearch');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}});
  $('parkBody').querySelectorAll('.park-type-pick').forEach(sel=>sel.addEventListener('change',()=>{
    const b=$('parkBody').querySelector(`[data-approve="${sel.dataset.typefor}"]`);
    if(b)b.textContent=`Autorizar ${money.format(precio(sel.value))}`;
  }));
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
  const goStep=step=>{document.querySelectorAll('[data-new-step]').forEach(panel=>panel.hidden=Number(panel.dataset.newStep)!==step);document.querySelectorAll('.park-stepper b').forEach((item,index)=>item.classList.toggle('on',index<step));};
  document.querySelectorAll('[data-next-step]').forEach(button=>button.addEventListener('click',()=>{const next=Number(button.dataset.nextStep);if(next===2&&kind.value==='familia'&&!$('nplayer').value){$('nplayer').focus();return;}if(next===2&&kind.value!=='familia'&&!$('nname').value.trim()){$('nname').focus();return;}if(next===3&&!$('nplate').value.trim()){$('nplate').reportValidity();return;}goStep(next);}));
  document.querySelectorAll('[data-prev-step]').forEach(button=>button.addEventListener('click',()=>goStep(Number(button.dataset.prevStep))));
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
        vehicle:$('nvehicle').value||null, pass_type:$('ntype').value,
        courtesy:$('ncourtesy').checked, courtesy_reason:$('nreason').value||null});
      state.alta=false;state.filtro='requested';await load();
    }catch(error){
      box.textContent=String(error?.message||error);box.dataset.type='error';box.classList.remove('hidden');
    }
  });
}

// El tipo que quedó elegido en la fila. Si el selector no está (otro estado),
// va null y el backend respeta el que ya traía el gafete.
const tipoElegido=id=>document.querySelector(`[data-typefor="${id}"]`)?.value||null;

// El nombre de quien lleva el gafete: para que el diálogo diga de quién habla
// en lugar de preguntar en abstracto.
const portadorDe=id=>(state.data?.passes||[]).find(p=>p.id===id)?.player||'este gafete';
const folioDe=id=>(state.data?.passes||[]).find(p=>p.id===id)?.folio||'';

// Cortesía: regalar el lugar siempre pide motivo, y queda con nombre y fecha
// en la bitácora.
async function darCortesia(id){
  const motivo=await tosPrompt({kicker:'ESTACIONAMIENTO',title:'Gafete sin costo',
    message:`${portadorDe(id)} no pagará este gafete.`,
    hint:'Queda registrado con tu nombre y la fecha.',
    placeholder:'Es staff, patrocinador, acuerdo con la familia…',
    required:true,requiredText:'Escribe por qué se da sin costo.',maxlength:120,
    confirmText:'Dar sin costo'});
  if(motivo===null)return;
  // El folio ya no se teclea: lo asigna el sistema, consecutivo por tipo.
  try{
    const r=await rpc('v2_approve_parking',{organization_id:ctx.organization_id,pass_id:id,
      folio:null,courtesy:true,courtesy_reason:motivo,pass_type:tipoElegido(id)});
    await load();
    if(r?.folio)await tosAlert({kicker:'ESTACIONAMIENTO',title:`Gafete ${r.folio}`,
      message:'Autorizado sin costo. Ese es el folio que le corresponde.'});
  }catch(error){await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo autorizar',message:String(error?.message||error)});}
}

async function aprobar(id){
  const tipo=tipoElegido(id);
  const ok=await tosConfirm({kicker:'ESTACIONAMIENTO',title:'¿Autorizar este gafete?',
    message:`Gafete ${tipo==='vip'?'VIP':'Tanner'} de ${portadorDe(id)}. Se le carga a su estado de cuenta y el folio se asigna solo.`,
    confirmText:'Autorizar y cobrar'});
  if(!ok)return;
  try{
    const r=await rpc('v2_approve_parking',{organization_id:ctx.organization_id,pass_id:id,folio:null,courtesy:false,courtesy_reason:null,pass_type:tipo});
    await load();
    if(r?.folio)await tosAlert({kicker:'ESTACIONAMIENTO',title:`Gafete ${r.folio}`,
      message:'Autorizado. Ese es el folio que le corresponde.'});
  }
  catch(error){await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo autorizar',message:String(error?.message||error)});}
}
async function entregar(id){
  const folio=folioDe(id);
  const ok=await tosConfirm({kicker:'ESTACIONAMIENTO',
    title:folio?`¿Entregar el gafete ${folio}?`:'¿Entregar este gafete?',
    message:`Es el de ${portadorDe(id)}. Confirma cuando ya lo tenga en la mano.`,
    confirmText:'Sí, ya lo entregué'});
  if(!ok)return;
  try{await rpc('v2_issue_parking',{organization_id:ctx.organization_id,pass_id:id,folio:null});await load();}
  catch(error){await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo entregar',message:String(error?.message||error)});}
}
// Cerrar nunca cancela el cargo: condonar es una decisión aparte, y pasa por
// Contabilidad con su propia autorización.
async function cerrar(id,estado,pregunta){
  const motivo=await tosPrompt({kicker:'ESTACIONAMIENTO',title:pregunta,
    message:`Gafete de ${portadorDe(id)}.`,
    hint:'Queda registrado con tu nombre y la fecha.',
    required:true,requiredText:'Escribe el motivo.',maxlength:200,
    confirmText:'Confirmar',danger:estado!=='lost'});
  if(motivo===null)return;
  try{
    const r=await rpc('v2_close_parking',{organization_id:ctx.organization_id,pass_id:id,new_status:estado,reason:motivo});
    await load();
    if(r?.charge_pendiente)await tosAlert({kicker:'ESTACIONAMIENTO',title:'Listo, pero ojo con el cargo',
      message:'El cargo del gafete sigue en su estado de cuenta. Si lo vas a condonar, hazlo en Contabilidad › Ajustes.'});
  }catch(error){await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo cerrar',message:String(error?.message||error)});}
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
  $('parkDrawerTitle').textContent='Detalle del gafete';
  const saldo=Number(d.balance||0);
  const datos=[['Tanner',d.player],['Tutor',d.guardian],['Vehículo',d.vehicle],['Folio',d.folio],
    ['Temporada',d.season],['Vence',d.expires_on],['Estado',ESTADO[d.status]||d.status],
    ['Cobro',saldo>0?`${money.format(saldo)} pendiente`:'Cubierto'],['Motivo',d.close_reason]]
    .filter(([,v])=>v!=null&&v!=='')
    .map(([k,v])=>`<div class="park-fact"><span>${esc(k)}</span><strong>${esc(String(v))}</strong></div>`).join('');
  const eventos=(d.events||[]).map(e=>{
    const quien=[ACTOR[e.actor_kind]||e.actor_kind,e.actor].filter(Boolean).join(' · ');
    return `<div class="park-ev"><span class="park-ev-dot"></span><span><strong>${esc(EVENTO[e.event]||e.event)}</strong><span>${esc(fmtFecha(e.at))} · ${esc(quien)}${e.note?` · ${esc(e.note)}`:''}</span></span></div>`;
  }).join('');
  const playerId=d.player_id||d.playerId,terminal=['rejected','revoked','lost','expired'].includes(d.status);
  const cobrar=saldo>0&&playerId?`<a class="primary park-drawer-action" href="/taquilla/?action=cobrar&amp;player=${encodeURIComponent(playerId)}&amp;amount=${encodeURIComponent(saldo)}&amp;name=${encodeURIComponent(d.player||'Tanner')}">Cobrar ${esc(money.format(saldo))} en Taquilla</a>`:'';
  const eliminar=ctx.role==='Presidencia'&&terminal?`<button class="park-delete" type="button" data-delete-pass="${esc(id)}">Eliminar registro definitivamente</button>`:'';
  $('parkDrawerBody').innerHTML=`<section class="park-detail-hero"><span class="park-detail-plate">${esc(d.plate||'Sin placas')}</span><div><strong>${esc(d.player||PORTADOR[d.holder_kind]||'Titular del gafete')}</strong><small>${esc([d.category,d.guardian&&`Tutor: ${d.guardian}`].filter(Boolean).join(' · ')||'Datos del gafete')}</small></div><span class="park-state" data-s="${esc(d.status)}">${esc(ESTADO[d.status]||d.status)}</span></section>${cobrar}<section class="park-detail-section"><h3>Datos del gafete</h3><div class="park-facts">${datos}</div></section><section class="park-detail-section"><h3>Historial</h3><div class="park-log">${eventos||'<div class="tos-empty">Sin movimientos.</div>'}</div></section>${eliminar}`;
  $('parkDrawerBody').querySelector('[data-delete-pass]')?.addEventListener('click',()=>eliminarRegistro(id,d));
}

async function eliminarRegistro(id,pass){
  const ok=await tosConfirm({kicker:'SOLO PRESIDENCIA',title:'¿Eliminar este registro?',message:`${pass.player||'Este gafete'} · ${pass.plate||'sin placas'}. Se eliminará también su historial. Esta acción no se puede deshacer.`,confirmText:'Eliminar definitivamente',danger:true});
  if(!ok)return;
  try{await rpc('v2_delete_parking_pass',{organization_id:ctx.organization_id,pass_id:id});cerrarDrawer();await load();await tosAlert({kicker:'ESTACIONAMIENTO',title:'Registro eliminado',message:'El gafete y su historial ya no aparecen en el padrón.'});}
  catch(error){const raw=String(error?.message||error),message=/Could not find the function|schema cache/i.test(raw)?'La actualización segura de base de datos todavía no llegó a producción. No se eliminó nada; el equipo técnico debe desplegar la migración pendiente.':/related records/i.test(raw)?'Este gafete tiene movimientos relacionados que deben conservarse. Cancela o ajusta primero esos movimientos.':raw;await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo eliminar',message});}
}

$('parkClose').addEventListener('click',cerrarDrawer);
$('parkBackdrop').addEventListener('click',cerrarDrawer);
await load();
