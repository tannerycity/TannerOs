import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);let ctx=null,players=[],categories=[],current=null,canWrite=false,canFamily=false,canStatus=false,sportsSeq=0;
const FAMILY_FIELDS=['firstName','lastName','birthDate','sex','school','bloodType','allergies','address','emergencyName','emergencyPhone','guardianName','guardianPhone','guardianEmail','guardianRelationship','canPickup','receivesBilling','notes'];
function applyFamilyLock(){FAMILY_FIELDS.forEach(id=>{const el=$(id);if(el)el.disabled=!canFamily;});}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}function msg(t='',type='error'){const e=$('profileMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}function nameOf(p){return [p.first_name,p.last_name].filter(Boolean).join(' ').trim();}
function setText(id,value){const node=$(id);if(node)node.textContent=value??'—';}
function positionCode(value){const label=String(value||'').toLocaleLowerCase('es-MX');if(/porter/.test(label))return'POR';if(/defen|central|lateral/.test(label))return'DEF';if(/medio|volante|contenci/.test(label))return'MED';if(/delanter|extremo|punta/.test(label))return'DEL';return value?String(value).slice(0,3).toUpperCase():'POS';}
function renderCardIdentity(p){const fullName=[p.firstName,p.lastName].filter(Boolean).join(' ').trim()||'Tanner',foot={right:'Derecha',left:'Izquierda',both:'Ambas',Derecha:'Derecha',Izquierda:'Izquierda',Ambas:'Ambas'}[p.dominantFoot]||p.dominantFoot||'Por definir',status=p.status==='active'?'ACTIVO':'BAJA';setText('cardName',fullName);setText('cardCode',p.code||'Sin código');setText('cardPosition',positionCode(p.position));setText('cardCategory',p.category||'Sin categoría');setText('cardJersey',p.jerseyNumber||'—');setText('cardFoot',`Pierna ${foot}`);setText('cardStatus',status);setText('quickPosition',p.position||'Por definir');setText('quickFoot',foot);setText('quickCategory',p.category||'Sin categoría');setText('quickJersey',p.jerseyNumber||'—');const card=$('tannerCard');if(card){card.dataset.status=p.status||'active';card.setAttribute('aria-label',`Carta deportiva de ${fullName}`);}}
function friendly(e){const s=String(e?.message||e||'Ocurrió un error.');if(/failed to fetch|networkerror|load failed|network request failed/i.test(s))return 'Se cortó la conexión con el servidor. No se guardó ningún cambio: revisa tu internet y vuelve a intentar.';if(/ux_players_active_category_jersey|duplicate key/i.test(s))return 'Ese dorsal ya está ocupado por otro Tanner activo en la categoría seleccionada.';const map={'Not authorized':'No tienes permiso para editar expedientes.','Player not found':'No encontramos ese Tanner.','Valid birth date required':'La fecha de nacimiento no es válida.','Invalid dominant foot':'Selecciona una pierna válida.','Invalid phone number':'Revisa el formato del teléfono.','Mexico phone must have exactly 10 digits':'Para México usa exactamente 10 dígitos.','Guardian phone required':'Captura un teléfono válido para el tutor.','Invalid guardian email':'El correo del tutor no es válido.','Effective date cannot precede current enrollment start':'La fecha del cambio no puede ser anterior al inicio de la categoría actual.','Only withdrawn players can be reactivated':'Este Tanner ya está activo.','Only withdrawn or inactive players can be reactivated':'Este Tanner ya está activo.','Only active players can be withdrawn':'Este Tanner ya está de baja.','Reactivation date required':'Indica la fecha de alta.','Withdrawal date required':'Indica la fecha de baja.','Withdrawal reason required':'Escribe el motivo de la baja.'};return map[s]||s;}
function renderStatusAction(p){const btn=$('toggleStatusBtn'),alt=$('withdrawInactiveBtn');if(!btn)return;if(!canStatus){btn.classList.add('hidden');alt?.classList.add('hidden');return;}btn.classList.remove('hidden');if(p.status!=='active'){btn.textContent='Dar de alta';btn.dataset.action='reactivate';btn.classList.remove('danger-mini');}else{btn.textContent='Dar de baja';btn.dataset.action='withdraw';btn.classList.add('danger-mini');}alt?.classList.toggle('hidden',p.status!=='inactive');}
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/v2';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),mod=mods.find(m=>m.module_code==='players');if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Jugadores.';show('deniedView');return;}canWrite=!!mod.can_write;
  const familyMod=mods.find(m=>m.module_code==='jugadores_familia');canFamily=!!(familyMod?.enabled&&familyMod?.can_write);
  const statusMod=mods.find(m=>m.module_code==='jugadores_estado');canStatus=!!(statusMod?.enabled&&statusMod?.can_write);
  applyFamilyLock();acotarFechaNacimiento();
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;$('saveProfile').disabled=!canWrite;$('categoryDate').value=today();[players,categories]=await Promise.all([rpc('v2_players',{organization_id:ctx.organization_id,status_filter:null}),rpc('v2_player_categories',{organization_id:ctx.organization_id})]);players=players||[];categories=categories||[];renderFiltros();renderCategories();renderList();signPlayerPhotos(players).then(()=>renderList());
  const canExport=ctx.is_owner||ctx.role==='Presidencia';const exportBtn=$('exportRoster');if(exportBtn){exportBtn.classList.toggle('hidden',!canExport);exportBtn.addEventListener('click',exportRosterCsv);}
  loadBajasPendientes();
  show('view');const requested=new URLSearchParams(location.search).get('player');if(requested&&players.some(p=>p.id===requested))await openProfile(requested);}
function renderCategories(){const s=$('categoryId');s.innerHTML='<option value="">Sin categoría</option>';categories.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;s.appendChild(o);});}
async function loadPlayers(){players=await rpc('v2_players',{organization_id:ctx.organization_id,status_filter:null})||[];renderFiltros();renderList();signPlayerPhotos(players).then(()=>renderList());}

// === Bajas reportadas desde la lista de asistencia ===
// El profe que toma lista es quien se entera de que un niño ya no viene, pero no
// tiene permiso de alta y baja. Su reporte aterriza aquí, que es donde sí se ejecuta.
let bajasPend=[];
async function loadBajasPendientes(){
  const box=$('bajasPendientes');if(!box)return;
  if(!canStatus){box.classList.add('hidden');return;}
  try{bajasPend=await rpc('v2_withdrawal_requests',{organization_id:ctx.organization_id})||[];}
  catch{bajasPend=[];}
  renderBajasPendientes();
}
function renderBajasPendientes(){
  const box=$('bajasPendientes');if(!box)return;
  if(!bajasPend.length){box.classList.add('hidden');box.innerHTML='';return;}
  const n=bajasPend.length;
  box.innerHTML=`<div class="bajas-head"><span class="eyebrow">REPORTADOS DESDE LA LISTA</span>`+
    `<strong>${n} Tanner${n>1?'s':''} que quizá ya no viene${n>1?'n':''}</strong>`+
    `<small>Nadie los dio de baja todavía: siguen cobrándose y apareciendo al tomar lista.</small></div>`+
    `<div class="bajas-list">${bajasPend.map(r=>`<article class="bajas-row"><div><strong>${esc(r.player_name||'Tanner')}</strong>`+
      `<small>${esc([r.player_code,r.category_name].filter(Boolean).join(' · '))}</small>`+
      `<em>“${esc(r.reason||'')}”</em>`+
      `<small class="bajas-meta">Reportó ${esc(r.requested_by||'staff')} · ${esc(fechaCorta(r.requested_at))}</small></div>`+
      `<div class="bajas-actions"><button type="button" class="primary mini" data-baja-ver="${esc(r.player_id)}">Revisar expediente</button>`+
      `<button type="button" class="secondary mini" data-baja-descartar="${esc(r.request_id)}">Sí viene</button></div></article>`).join('')}</div>`;
  box.classList.remove('hidden');
}
function fechaCorta(v){if(!v)return '';try{return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(v));}catch{return '';}}
async function descartarBaja(id){
  try{await rpc('v2_dismiss_withdrawal_request',{organization_id:ctx.organization_id,request_id:id,note:null});
    bajasPend=bajasPend.filter(r=>r.request_id!==id);renderBajasPendientes();
    msg('Reporte descartado. El Tanner se queda en la plantilla.','success');
  }catch(err){msg(friendly(err));}
}
document.addEventListener('click',e=>{
  const ver=e.target.closest?.('[data-baja-ver]');
  if(ver){openProfile(ver.dataset.bajaVer);document.getElementById('profilePanel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const quitar=e.target.closest?.('[data-baja-descartar]');
  if(quitar){descartarBaja(quitar.dataset.bajaDescartar);return;}
});

// === Filtros de expediente (solo Presidencia y Operaciones) ===
// Viven detrás de jugadores_estado: Formadores tiene Jugadores en solo lectura
// y no ese permiso, así que ni los filtros ni los conteos le aparecen.
const FILTROS=[
  {key:'nodocs',  label:'Sin documentos', tono:'danger', test:p=>Number(p.docs_missing||0)>0},
  {key:'beca',    label:'Becados',        tono:'',       test:p=>Boolean(p.benefit_active)},
  {key:'nocorreo',label:'Sin correo',     tono:'danger', test:p=>!p.has_guardian_email},
  {key:'nofoto',  label:'Sin foto',       tono:'',       test:p=>!p.photo_path},
  {key:'noconsent',label:'Consentimiento pendiente',tono:'danger',test:p=>!p.data_consent},
  {key:'noimagen', label:'Sin permiso de imagen',   tono:'',      test:p=>!p.image_consent}
];
// Desglose de becas: para dar seguimiento no basta saber que hay 20 becados,
// hay que poder ver de golpe cuántas son totales y cuántas las paga alguien más.
const BECAS=[
  {key:'scholarship_full',   label:'Beca total'},
  {key:'scholarship_partial',label:'Beca parcial'},
  {key:'sponsor_funded',     label:'Paga un patrocinador'},
  {key:'sibling_discount',   label:'Descuento por hermanos'}
];
function pasaEstado(p){
  const activo=p.status_value==='active';
  if(fStat==='active')return activo;
  if(fStat==='withdrawn')return !activo;
  if(fStat==='review')return Boolean(p.needs_review)&&activo;
  if(fStat.startsWith('beca:'))return activo&&p.benefit_active&&p.benefit_type===fStat.slice(5);
  const f=FILTROS.find(x=>x.key===fStat);
  if(f)return activo&&f.test(p);
  return true;
}
// Los filtros se combinan: "Sin documentos" + "Portero" + "Niñas" da las porteras sin papeles.
function pasaFiltro(p){return pasaEstado(p)&&pasaDemo(p)&&pasaPos(p);}
let fDemo='';
let fPos='';

// === Posición ===
// El catálogo real son cinco. Lo que traía el legacy ("Mediocampista", "Volante",
// "Extremo") no se reparte a mano: se junta en "Etiqueta vieja" para que se vea
// cuánto falta por depurar en lugar de esconderlo en una posición inventada.
const POS_CANON=['Portero','Defensa','Medio defensivo','Medio ofensivo','Delantero'];
const POS_SIN='Por definir';
function grupoPos(p){
  const v=String(p.player_position||'').trim();
  if(!v||v===POS_SIN)return 'none';
  if(POS_CANON.includes(v))return v;
  return 'legacy';
}
function pasaPos(p){return !fPos||grupoPos(p)===fPos;}
// === Cotas y listas del expediente ===
// El input nativo de fecha acepta años de hasta seis dígitos (19/08/999999).
// min y max lo acotan a un rango humano y el navegador bloquea el guardado.
function acotarFechaNacimiento(){
  const el=$('birthDate');if(!el)return;
  const hoy=new Date(),iso=d=>d.toISOString().slice(0,10);
  el.max=iso(hoy);
  el.min=iso(new Date(hoy.getFullYear()-100,hoy.getMonth(),hoy.getDate()));
  el.addEventListener('input',pistaEdad);
}
function pistaEdad(){
  const el=$('birthDate'),hint=$('birthHint');if(!el||!hint)return;
  const v=el.value;
  if(!v){hint.textContent='';hint.dataset.tone='';return;}
  const a=ageOf(v);
  if(a==null||a<0||a>100){hint.textContent='Esa fecha no puede ser: revisa el año.';hint.dataset.tone='bad';return;}
  hint.textContent=`${a} año${a===1?'':'s'}`;hint.dataset.tone='';
}
// Un <select> descarta en silencio un valor que no esté entre sus opciones.
// Los expedientes viejos traen posiciones que no están en la lista estándar.
function setSelectValue(id,value){
  const el=$(id);if(!el)return;
  const v=value==null?'':String(value);
  if(v&&![...el.options].some(o=>o.value===v)){
    const o=document.createElement('option');o.value=v;o.textContent=v+' (capturado antes)';el.appendChild(o);
  }
  el.value=v;
}
// === Posición: carrusel en vez de lista ===
// Las cinco que usa el club. Un valor viejo que no esté aquí (24 Tanners quedaron
// como "Mediocampista") NO se descarta: se muestra como chip aparte, marcado, para
// que se vea que hay que actualizarlo en vez de perderlo al guardar.
const POSICIONES=['Portero','Defensa','Medio defensivo','Medio ofensivo','Delantero'];
function setPosicion(value){
  const rail=$('positionRail'),input=$('position');if(!rail||!input)return;
  const v=(value==null?'':String(value)).trim();
  input.value=v;
  const opciones=POSICIONES.slice();
  const heredada=v&&!opciones.includes(v)?v:'';
  rail.innerHTML=[['','Por definir',false],...opciones.map(o=>[o,o,false]),...(heredada?[[heredada,heredada,true]]:[])]
    .map(([val,label,vieja])=>`<button type="button" class="pos-chip${val===v?' on':''}${vieja?' legacy':''}" `+
      `role="radio" aria-checked="${val===v}" data-pos="${esc(val)}"${canWrite?'':' disabled'}>`+
      `${esc(label)}${vieja?'<small>capturado antes</small>':''}</button>`).join('');
  // El carrusel desborda: si el elegido queda fuera de vista, al abrir la ficha
  // parecería que no hay ninguno seleccionado. Pasa siempre con el heredado, que va al final.
  const sel=rail.querySelector('.pos-chip.on');
  if(sel){
    const c=sel.getBoundingClientRect(),r=rail.getBoundingClientRect();
    if(c.left<r.left||c.right>r.right)rail.scrollLeft+=c.left-r.left-12;
  }
}
document.addEventListener('click',e=>{
  const chip=e.target.closest?.('#positionRail .pos-chip');
  if(chip&&!chip.disabled){setPosicion(chip.dataset.pos);}
});
function renderList(){const q=$('search').value.trim().toLocaleLowerCase('es-MX');const rows=players.filter(p=>{const stOk=pasaFiltro(p);if(!stOk)return false;if(fCat&&p.category!==fCat)return false;if(q&&!`${p.code||''} ${nameOf(p)} ${p.category||''} ${p.player_position||''} ${p.jersey_number||''}`.toLocaleLowerCase('es-MX').includes(q))return false;return true;});const box=$('playerList');box.innerHTML='';$('empty').classList.toggle('hidden',rows.length>0);const NOTAS={review:{t:'Esto no es documentación faltante.',d:'Son Tanners cuyo <b>cobro</b> quedó sin configurar.'},nodocs:{t:'Expediente incompleto de verdad.',d:'Les falta al menos un documento del checklist: acta, CURP o constancia de estudios.'},beca:{t:'Tanners con beca o apoyo activo.',d:'Alguien más cubre parte o toda su cuota. Revisa que el patrocinio esté configurado.'},nocorreo:{t:'Sin correo de tutor.',d:'Sin correo no se les puede dar acceso al portal de familias ni mandarles su estado de cuenta.'},nofoto:{t:'Sin foto en el expediente.',d:'La foto se usa en la credencial y para pasar lista más rápido.'}};const nota=NOTAS[fStat];if(nota&&rows.length){const motivos=fStat==='review'?[...new Set(rows.map(p=>p.review_reason).filter(Boolean))]:[];const fuentes=fStat==='beca'?[...new Set(rows.map(p=>p.benefit_source).filter(Boolean))]:[];const extra=motivos.length?motivos:fuentes;const el=document.createElement('div');el.className='review-note';el.innerHTML=`<strong>${nota.t}</strong><span>${nota.d}${extra.length?' '+(fStat==='beca'?'Fuentes:':'Motivo'+(extra.length>1?'s':'')+':'):''}</span>`+(extra.length?`<ul>${extra.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:'');box.appendChild(el);}const ORDER=['Baby Tanner','Mini Baby Tanner','T8','T10','T12'];const groups={};rows.forEach(p=>{const k=p.category||'Sin categoría';(groups[k]=groups[k]||[]).push(p);});let cats=Object.keys(groups).sort((a,b)=>{const ia=ORDER.indexOf(a),ib=ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);});cats.forEach(cat=>{const list=groups[cat].slice().sort((a,b)=>((parseInt(a.jersey_number,10)||999)-(parseInt(b.jersey_number,10)||999))||nameOf(a).localeCompare(nameOf(b)));const sec=document.createElement('section');sec.className='cat-section';const head=document.createElement('div');head.className='cat-head';head.innerHTML=`<h3>${esc(cat)} · ${list.length}</h3><button type="button" class="free-link" data-freecat="${esc(cat)}">Números libres</button>`;const grid=document.createElement('div');grid.className='jgrid';list.forEach(p=>{const full=nameOf(p)||'Sin nombre',initials=full.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();const b=document.createElement('button');b.type='button';b.dataset.playerId=p.id;b.className=`jcard${p._photoUrl?' has-photo':''}${current?.player?.id===p.id?' selected':''}`;const review=p.needs_review;if(review&&p.review_reason)b.title=p.review_reason;b.innerHTML=`${p._photoUrl?`<img class="jcard-photo" loading="lazy" decoding="async" alt="" src="${esc(p._photoUrl)}">`:''}<span class="jcard-cat">${esc(cat)}</span><span class="jcard-num">#${esc(p.jersey_number||'—')}</span><span class="jcard-dot${review?' review':' ok'}"></span>${p._photoUrl?'':`<span class="jcard-initials">${esc(initials)}</span>`}<span class="jcard-name">${esc(full)}</span>`;b.onclick=()=>openProfile(p.id);grid.appendChild(b);});sec.appendChild(head);sec.appendChild(grid);box.appendChild(sec);});}
let photoRenderSeq=0;
function legacyPhotoSource(value){const raw=String(value||'').trim();if(/^data:image\//i.test(raw)||/^https?:\/\//i.test(raw))return raw;return null;}
function drawPhoto(box,src,alt){box.innerHTML='';const img=document.createElement('img');img.src=src;img.alt=alt;img.decoding='async';box.appendChild(img);}
async function renderPhoto(p){const seq=++photoRenderSeq,box=$('photoBox'),alt=`Foto de ${p.firstName||'Tanner'}`;box.innerHTML='<span>Sin foto</span>';if(p.photoPath){try{const bucket=p.photoBucket||'tanneros-private';const {data,error}=await supabase.storage.from(bucket).createSignedUrl(p.photoPath,600);if(error||!data?.signedUrl)throw error;if(seq===photoRenderSeq)drawPhoto(box,data.signedUrl,alt);return;}catch{if(seq!==photoRenderSeq)return;}}const legacy=legacyPhotoSource(p.legacyPhotoData);if(legacy){drawPhoto(box,legacy,alt);return;}if(p.legacyPhotoData){box.innerHTML='<span class="previous-photo-note">Foto anterior<small>Vuelve a subirla</small></span>';}else if(p.photoPath){box.innerHTML='<span>Foto protegida</span>';}}
function fill(p,g,enrollment){$('firstName').value=p.firstName||'';$('lastName').value=p.lastName||'';$('birthDate').value=p.birthDate||'';pistaEdad();setPosicion(p.position);const foot={Derecha:'right',Izquierda:'left',Ambas:'both'}[p.dominantFoot]||p.dominantFoot||'';$('dominantFoot').value=foot;$('sex').value=p.sex||'';$('jerseyNumber').value=p.jerseyNumber||'';$('school').value=p.school||'';setSelectValue('bloodType',p.bloodType);$('allergies').value=p.allergies||'';$('address').value=p.address||'';$('emergencyName').value=p.emergencyContactName||'';$('emergencyPhone').value=p.emergencyContactPhone||'';$('notes').value=p.notes||'';$('categoryId').value=enrollment?.categoryId||'';$('categoryDate').value=today();$('categoryNotes').value='';$('guardianName').value=[g?.firstName,g?.lastName].filter(Boolean).join(' ').trim();$('guardianPhone').value=g?.phone||'';$('guardianEmail').value=g?.email||'';$('guardianRelationship').value=g?.relationship||g?.relationshipDefault||'';$('canPickup').checked=g?.canPickup??true;$('receivesBilling').checked=g?.receivesBilling??true;}
function renderOtherGuardians(rows,primary){const box=$('otherGuardians'),others=(rows||[]).filter(g=>g.id!==primary?.id);box.innerHTML=others.length?`<strong>Otros contactos vinculados</strong>${others.map(g=>`<span>${esc([g.firstName,g.lastName].filter(Boolean).join(' '))} · ${esc(g.phone||'Sin teléfono')} · ${esc(g.relationship||'Contacto')}</span>`).join('')}`:'';}
// La versión del aviso que se está firmando hoy. Tiene que ser la misma que
// muestra el formulario público (public-form.js), o el expediente diría que el
// tutor aceptó un texto distinto del que leyó.
const AVISO_VIGENTE='2026-08-19-v1';
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
const fechaConAnio=v=>{if(!v)return'';try{return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(v));}catch{return'';}};

// Los Tanners del legacy firmaron en papel: sin esto se quedarían marcados como
// pendientes para siempre. El botón registra lo que ya existe, no lo inventa,
// por eso pide con qué evidencia y lo manda a la bitácora.
function renderPrivacy(p){
  const box=$('privacyBadges');if(!box)return;
  const badge=(ok,siOk,siNo,fecha)=>`<span class="profile-badge ${ok?'ok':'pend'}">${esc(ok?siOk:siNo)}${ok&&fecha?` · ${esc(fechaConAnio(fecha))}`:''}</span>`;
  box.innerHTML=
    badge(p.dataConsent,'Datos autorizados','Consentimiento pendiente',p.dataConsentAt)+
    badge(p.imageConsent,'Imagen autorizada','Sin autorización publicitaria',p.imageConsentAt)+
    (p.privacyNoticeVersion?`<span class="profile-badge">Aviso ${esc(p.privacyNoticeVersion)}</span>`:'')+
    (canWrite?`<button type="button" class="profile-badge badge-action" id="consentToggle">${p.dataConsent&&p.imageConsent?'Editar permisos':'Registrar permisos'}</button>`:'')+
    `<div id="consentBox" class="consent-box hidden">
      <label class="check"><input type="checkbox" id="cData"${p.dataConsent?' checked':''}> Autoriza el tratamiento de sus datos</label>
      <label class="check"><input type="checkbox" id="cImage"${p.imageConsent?' checked':''}> Autoriza el uso de su imagen en redes y publicidad</label>
      <label class="consent-ev">¿Con qué evidencia?<input id="cEvidence" maxlength="160" placeholder="Carta firmada en oficina, WhatsApp del tutor…"></label>
      <small class="consent-note">Queda registrado con tu nombre, la fecha y el aviso ${esc(AVISO_VIGENTE)}. Solo hace falta al autorizar.</small>
      <div class="consent-actions"><button type="button" class="primary mini" id="cSave">Guardar</button><button type="button" class="secondary mini" id="cCancel">Cancelar</button></div>
      <div id="cMsg" class="inline-message hidden"></div>
    </div>`;
  $('consentToggle')?.addEventListener('click',()=>$('consentBox').classList.toggle('hidden'));
  $('cCancel')?.addEventListener('click',()=>$('consentBox').classList.add('hidden'));
  $('cSave')?.addEventListener('click',()=>guardarConsentimiento(p.id));
}
// === Beca y apoyos ===
// Hoy la beca vive escondida en la cuota base: el registro es solo una etiqueta y
// nadie puede responder de cuánto es ni por qué. Esto la saca a la superficie.
const TIPO_BECA={scholarship_full:'Beca total',scholarship_partial:'Beca parcial',
  sponsor_funded:'La paga un patrocinador',sibling_discount:'Descuento por hermanos'};
const TIPOS_EDITABLES=['scholarship_full','scholarship_partial','sibling_discount'];
// La nota que dejó la importación no es un motivo: la escribió el script, no una persona.
const esNotaDelLegacy=n=>!n||/^Imported as legacy context/.test(n);
let benefits=[];

async function loadBenefits(playerId){
  const box=$('benefitsList');
  $('addBenefit')?.classList.toggle('hidden',!canStatus);
  try{benefits=await rpc('v2_player_benefits',{organization_id:ctx.organization_id,player_id:playerId})||[];}
  catch(e){box.innerHTML=`<div class="mini-empty">${esc(friendly(e))}</div>`;return;}
  renderBenefits(playerId);
}
function montoBeca(b){
  if(b.fixedAmount!=null)return money.format(Number(b.fixedAmount));
  if(b.percentage!=null)return `${Number(b.percentage)}%`;
  return null;
}
function renderBenefits(playerId){
  const box=$('benefitsList');
  const vivos=benefits.filter(b=>b.active);
  if(!vivos.length){
    box.innerHTML='<div class="mini-empty">Este Tanner no tiene beca ni apoyo registrado.</div>';
    return;
  }
  box.innerHTML=vivos.map(b=>{
    const monto=montoBeca(b);
    const bloqueado=b.type==='sponsor_funded';
    const avisos=[
      b.blocksBilling?'<span class="ben-warn">Sin configurar en Contabilidad: mientras siga así no se le genera su mensualidad.</span>':'',
      !monto?'<span class="ben-gap">Falta anotar de cuánto es el apoyo.</span>':'',
      esNotaDelLegacy(b.notes)?'<span class="ben-gap">Falta el motivo: lo que dice hoy lo escribió la importación.</span>':''
    ].filter(Boolean).join('');
    const datos=[
      monto&&`<span><b>${esc(monto)}</b> de apoyo</span>`,
      b.sponsorName||b.fundingSource?`<span>Lo cubre ${esc(b.sponsorName||b.fundingSource)}</span>`:'',
      b.startsOn?`<span>Desde ${esc(fechaConAnio(b.startsOn))}</span>`:'',
      b.endsOn?`<span>Hasta ${esc(fechaConAnio(b.endsOn))}</span>`:'',
      b.legacyLabel?`<span class="ben-legacy">Venía como “${esc(b.legacyLabel)}”</span>`:''
    ].filter(Boolean).join('');
    const acciones=canStatus&&!bloqueado
      ? `<span class="ben-actions"><button type="button" class="secondary mini" data-benedit="${esc(b.id)}">Editar</button>`+
        `<button type="button" class="secondary mini" data-benend="${esc(b.id)}">Terminar</button></span>`
      : bloqueado?'<span class="ben-locked">Se edita en Contabilidad</span>':'';
    return `<article class="ben-row"><div class="ben-head"><strong>${esc(TIPO_BECA[b.type]||b.type)}</strong>${acciones}</div>`+
      (datos?`<div class="ben-facts">${datos}</div>`:'')+
      (esNotaDelLegacy(b.notes)?'':`<p class="ben-note">${esc(b.notes)}</p>`)+
      (avisos?`<div class="ben-avisos">${avisos}</div>`:'')+
      `</article>`;
  }).join('');
  box.querySelectorAll('[data-benedit]').forEach(b=>b.addEventListener('click',()=>formBeca(playerId,b.dataset.benedit)));
  box.querySelectorAll('[data-benend]').forEach(b=>b.addEventListener('click',()=>terminarBeca(playerId,b.dataset.benend)));
}
function formBeca(playerId,benefitId){
  const b=benefits.find(x=>x.id===benefitId)||{};
  const box=$('benefitsList');
  const opciones=TIPOS_EDITABLES.map(t=>`<option value="${t}"${b.type===t?' selected':''}>${esc(TIPO_BECA[t])}</option>`).join('');
  const nota=esNotaDelLegacy(b.notes)?'':b.notes;
  box.insertAdjacentHTML('afterbegin',`<form class="ben-form" id="benForm">
    <label>Tipo de apoyo<select id="benType">${opciones}</select></label>
    <label>Monto mensual <span class="tos-user-note">(o deja vacío y usa el %)</span><input id="benAmount" type="number" min="1" step="1" value="${b.fixedAmount??''}"></label>
    <label>Porcentaje<input id="benPct" type="number" min="1" max="100" step="1" value="${b.percentage??''}"></label>
    <label>¿Quién lo cubre? <span class="tos-user-note">(opcional)</span><input id="benSource" maxlength="120" value="${esc(b.fundingSource||'')}" placeholder="El club, un padrino…"></label>
    <label>Desde<input id="benStart" type="date" value="${esc(b.startsOn||'')}"></label>
    <label>Hasta <span class="tos-user-note">(opcional)</span><input id="benEnd" type="date" value="${esc(b.endsOn||'')}"></label>
    <label class="span-2">Motivo<input id="benNotes" maxlength="300" value="${esc(nota||'')}" placeholder="Por qué se le da y hasta cuándo se revisa" required></label>
    <small class="ben-hint span-2">Esto documenta el apoyo. No cambia lo que se le cobra: la cuota se ajusta en Contabilidad.</small>
    <div class="ben-form-actions span-2"><button type="submit" class="primary mini">Guardar apoyo</button>
      <button type="button" class="secondary mini" id="benCancel">Cancelar</button></div>
  </form>`);
  $('benCancel').addEventListener('click',()=>renderBenefits(playerId));
  $('benForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const box2=$('benefitMessage');box2.classList.add('hidden');
    const btn=e.target.querySelector('[type="submit"]');btn.disabled=true;
    try{
      benefits=await rpc('v2_save_player_benefit',{organization_id:ctx.organization_id,player_id:playerId,
        benefit_id:benefitId||null,benefit_type:$('benType').value,
        fixed_amount:$('benAmount').value?Number($('benAmount').value):null,
        percentage:$('benPct').value?Number($('benPct').value):null,
        funding_source:$('benSource').value.trim()||null,
        starts_on:$('benStart').value||null,ends_on:$('benEnd').value||null,
        notes:$('benNotes').value.trim()})||[];
      renderBenefits(playerId);
      await loadPlayers();
      msg('Apoyo registrado. Quedó en la bitácora con tu nombre y la fecha.','success');
    }catch(err){
      box2.textContent=friendly(err);box2.dataset.type='error';box2.classList.remove('hidden');
      btn.disabled=false;
    }
  });
}
async function terminarBeca(playerId,benefitId){
  const motivo=await tosPrompt({kicker:'BECAS',title:'¿Por qué termina el apoyo?',
    message:'El histórico se conserva: queda con fecha y motivo.',
    placeholder:'Cambió la situación de la familia, se acabó el patrocinio…',
    required:true,requiredText:'Escribe por qué termina.',maxlength:200,
    confirmText:'Terminar apoyo',danger:true});
  if(motivo===null)return;
  try{
    benefits=await rpc('v2_end_player_benefit',{organization_id:ctx.organization_id,player_id:playerId,
      benefit_id:benefitId,reason:motivo})||[];
    renderBenefits(playerId);
    await loadPlayers();
    msg('Apoyo terminado. El histórico se conserva.','success');
  }catch(err){msg(friendly(err));}
}

// === Padrón de becas ===
async function abrirPadronBecas(){
  $('scholarshipModal').classList.remove('hidden');
  $('schBody').innerHTML='<div class="mini-empty">Cargando padrón…</div>';
  let d;
  try{d=await rpc('v2_scholarships',{organization_id:ctx.organization_id});}
  catch(e){$('schBody').innerHTML=`<div class="mini-empty">${esc(friendly(e))}</div>`;return;}
  schRows=d?.rows||[];
  const s=d?.summary||{};
  const tarjeta=(n,l,alerta)=>`<article class="sch-kpi${alerta&&Number(n)>0?' alerta':''}"><strong>${esc(String(n??0))}</strong><span>${esc(l)}</span></article>`;
  $('schSummary').innerHTML=tarjeta(s.total,'Apoyos vivos')+
    tarjeta(s.sinMonto,'Sin monto anotado',true)+
    tarjeta(s.sinDocumentar,'Sin motivo escrito',true)+
    tarjeta(s.bloqueanCobro,'Frenan su mensualidad',true);
  if(!schRows.length){$('schBody').innerHTML='<div class="mini-empty">No hay apoyos activos.</div>';return;}
  const fila=r=>{
    const monto=r.fixedAmount!=null?money.format(Number(r.fixedAmount))
      :r.percentage!=null?`${Number(r.percentage)}%`:'<i class="sch-falta">falta</i>';
    const motivo=esNotaDelLegacy(r.notes)?'<i class="sch-falta">falta</i>':esc(r.notes);
    return `<tr${r.blocksBilling?' class="sch-alerta"':''}>`+
      `<td><b>${esc(r.player)}</b><small>${esc(r.code||'')}${r.category?' · '+esc(r.category):''}</small></td>`+
      `<td>${esc(TIPO_BECA[r.type]||r.type)}${r.legacyLabel?`<small>“${esc(r.legacyLabel)}”</small>`:''}</td>`+
      `<td>${monto}</td>`+
      `<td>${r.monthlyFee!=null?money.format(Number(r.monthlyFee)):'—'}</td>`+
      `<td>${esc(r.fundingSource||'—')}</td>`+
      `<td>${esc(r.startsOn?fechaConAnio(r.startsOn):'—')}</td>`+
      `<td class="sch-motivo">${motivo}</td></tr>`;
  };
  $('schBody').innerHTML=`<table class="sch-table"><thead><tr><th>Tanner</th><th>Tipo</th><th>Apoyo</th>`+
    `<th>Cuota que paga</th><th>Lo cubre</th><th>Desde</th><th>Motivo</th></tr></thead>`+
    `<tbody>${schRows.map(fila).join('')}</tbody></table>`+
    `<p class="sch-pie">La cuota que paga es la que hoy tiene configurada. El sistema no calcula cuánto absorbe el club porque no hay una tarifa de lista por categoría contra la cual comparar.</p>`;
}
let schRows=[];
function exportarBecasCsv(){
  const header=['Tanner','Código','Categoría','Tipo','Apoyo','Cuota que paga','Lo cubre','Desde','Hasta','Motivo'];
  const rows=schRows.map(r=>[r.player,r.code||'',r.category||'',TIPO_BECA[r.type]||r.type,
    r.fixedAmount!=null?r.fixedAmount:(r.percentage!=null?r.percentage+'%':''),
    r.monthlyFee??'',r.fundingSource||'',r.startsOn||'',r.endsOn||'',
    esNotaDelLegacy(r.notes)?'':r.notes]);
  const cell=v=>{const t=String(v??'');return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const csv='\ufeff'+[header,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=`tannery-city-becas-${today()}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

async function guardarConsentimiento(playerId){
  const btn=$('cSave'),box=$('cMsg');
  box.classList.add('hidden');btn.disabled=true;
  try{
    await rpc('v2_set_player_consent',{organization_id:ctx.organization_id,player_id:playerId,
      data_consent:$('cData').checked,image_consent:$('cImage').checked,
      notice_version:AVISO_VIGENTE,evidence:$('cEvidence').value.trim()||null});
    await loadPlayers();
    await openProfile(playerId);
    msg('Permisos registrados. Quedó en la bitácora con tu nombre y la fecha.','success');
  }catch(err){
    box.textContent=friendly(err);box.dataset.type='error';box.classList.remove('hidden');
    btn.disabled=false;
  }
}
function num(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function setCardScore(id,value){const n=num(value);setText(id,n==null?'—':String(Math.round(Math.max(0,Math.min(10,n))*10)));}
function setCardSports(scores={},average=null){setText('cardOverall',average==null?'—':String(Math.round(Math.max(0,Math.min(10,average))*10)));setCardScore('cardTechnique',scores.tecnica);setCardScore('cardGame',scores.inteligencia);setCardScore('cardBody',scores.intensidad);setCardScore('cardMentality',scores.mentalidad);setCardScore('cardValues',scores.valores);}
function setMetric(scoreId,barId,value){const n=num(value);$(scoreId).textContent=n==null?'—':`${n}/10`;$(`${barId}`)?.style.setProperty('width',`${Math.max(0,Math.min(10,n??0))*10}%`);}
function radarPoint(value,angle){const n=Math.max(0,Math.min(10,num(value)??0))/10,r=96*n,cx=130,cy=120,a=(angle-90)*Math.PI/180;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];}
function setRadar(scores){document.querySelectorAll('#sportsRadar line').forEach(line=>{line.setAttribute('x1','130');line.setAttribute('y1','120');});const values=[scores?.tecnica,scores?.inteligencia,scores?.intensidad],angles=[0,120,240],points=values.map((v,i)=>radarPoint(v,angles[i]));$('sportsRadarPolygon').setAttribute('points',points.map(p=>p.map(x=>x.toFixed(1)).join(',')).join(' '));points.forEach((p,i)=>{const dot=$(`radarPoint${i+1}`);dot.setAttribute('cx',p[0].toFixed(1));dot.setAttribute('cy',p[1].toFixed(1));});}
function formatEvalDate(value){if(!value)return'Sin fecha';try{return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(`${value}T12:00:00`));}catch{return value;}}
function renderGoalkeeper(scores){const box=$('goalkeeperMetrics'),g=scores?.goalkeeper||{},items=[['Manos',g.manos],['Colocación',g.colocacion],['Aéreo',g.aereo],['Pies',g.pies],['Mando',g.mando]].filter(([,v])=>num(v)!=null);box.classList.toggle('hidden',!items.length);box.innerHTML=items.length?`<div class="eyebrow">PORTERO</div><div>${items.map(([k,v])=>`<span><b>${esc(k)}</b> ${num(v)}/10</span>`).join('')}</div>`:'';}
function renderSports(data){const summary=data?.summary||{},latest=(data?.evaluations||[])[0]||null,s=latest?.scores||{},hasEval=!!latest,hasMatches=Number(summary.played||0)>0;$('sportsLoading').classList.add('hidden');$('sportsEmpty').classList.toggle('hidden',hasEval||hasMatches);$('sportsContent').classList.toggle('hidden',!hasEval&&!hasMatches);$('sportsPlayed').textContent=Number(summary.played||0);$('sportsMinutes').textContent=Number(summary.minutes||0);$('sportsGoals').textContent=Number(summary.goals||0);$('sportsAssists').textContent=Number(summary.assists||0);if(!hasEval){setCardSports({},null);$('evaluationAverage').textContent='—';$('evaluationDate').textContent='Sin evaluación';setRadar({});['Technique','Game','Body','Mentality','Values'].forEach(k=>{$(`score${k}`).textContent='—';$(`bar${k}`).style.width='0%';});$('goalkeeperMetrics').classList.add('hidden');$('evaluationObjectives').classList.add('hidden');return;}const vals=[s.tecnica,s.inteligencia,s.intensidad,s.mentalidad,s.valores].map(num).filter(v=>v!=null),avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;setCardSports(s,avg);$('evaluationAverage').textContent=avg==null?'—':`${avg.toFixed(1)}/10`;$('evaluationDate').textContent=`Evaluación ${formatEvalDate(latest.date||latest.evaluatedOn||latest.evaluated_on)}`;setMetric('scoreTechnique','barTechnique',s.tecnica);setMetric('scoreGame','barGame',s.inteligencia);setMetric('scoreBody','barBody',s.intensidad);setMetric('scoreMentality','barMentality',s.mentalidad);setMetric('scoreValues','barValues',s.valores);setRadar(s);renderGoalkeeper(s);const goals=[latest.sportsObjective?`<div><span>Objetivo deportivo</span><strong>${esc(latest.sportsObjective)}</strong></div>`:'',latest.formativeObjective?`<div><span>Objetivo formativo</span><strong>${esc(latest.formativeObjective)}</strong></div>`:''].filter(Boolean).join('');$('evaluationObjectives').classList.toggle('hidden',!goals);$('evaluationObjectives').innerHTML=goals;}
async function loadSports(playerId){const seq=++sportsSeq;setCardSports({},null);$('sportsLoading').textContent='Cargando lectura deportiva…';$('sportsLoading').classList.remove('hidden');$('sportsEmpty').classList.add('hidden');$('sportsContent').classList.add('hidden');$('openSports').href=`/v2/deportivo/?player=${encodeURIComponent(playerId)}`;try{const data=await rpc('v2_player_sports',{organization_id:ctx.organization_id,player_id:playerId});if(seq!==sportsSeq)return;renderSports(data);}catch(e){if(seq!==sportsSeq)return;$('sportsLoading').textContent='No pudimos cargar el perfil deportivo en este momento.';}}
async function openProfile(id){msg();current=await rpc('v2_player_profile',{organization_id:ctx.organization_id,player_id:id});const p=current.player,g=(current.guardians||[]).find(x=>x.isPrimary)||(current.guardians||[])[0]||null;$('profileEmpty').classList.add('hidden');$('profileView').classList.remove('hidden');$('profilePanel').classList.add('open');$('profileName').textContent=[p.firstName,p.lastName].filter(Boolean).join(' ');$('profileMeta').textContent=`${p.code||'Sin código'} · ${p.status==='active'?'Activo':'Baja'}${p.category?` · ${p.category}`:''}`;fill(p,g,current.activeEnrollment);renderCardIdentity(p);renderStatusAction(p);renderOtherGuardians(current.guardians,g);renderPrivacy(p);renderPhoto(p);renderList();loadSports(id);loadBenefits(id);document.dispatchEvent(new CustomEvent('tanner-profile-opened',{detail:{playerId:id,player:p,organizationId:ctx.organization_id,canWrite}}));}
async function save(e){e.preventDefault();if(!current||!canWrite)return;msg();const btn=$('saveProfile');btn.disabled=true;try{const p=current.player;current=await rpc('v2_save_player_profile',{organization_id:ctx.organization_id,player_id:p.id,first_name:$('firstName').value.trim(),last_name:$('lastName').value.trim(),birth_date:$('birthDate').value,player_position:$('position').value.trim()||null,dominant_foot:$('dominantFoot').value||null,sex:$('sex').value||null,jersey_number:$('jerseyNumber').value.trim()||null,school:$('school').value.trim()||null,blood_type:$('bloodType').value.trim()||null,allergies:$('allergies').value.trim()||null,address:$('address').value.trim()||null,emergency_contact_name:$('emergencyName').value.trim()||null,emergency_contact_phone:$('emergencyPhone').value.trim()||null,notes:$('notes').value.trim()||null,guardian_name:$('guardianName').value.trim()||null,guardian_phone:$('guardianPhone').value.trim()||null,guardian_email:$('guardianEmail').value.trim()||null,guardian_relationship:$('guardianRelationship').value.trim()||null,can_pickup:$('canPickup').checked,receives_billing:$('receivesBilling').checked,category_id:$('categoryId').value||null,category_effective_date:$('categoryDate').value||today(),category_notes:$('categoryNotes').value.trim()||null});await loadPlayers();await openProfile(p.id);msg('Expediente guardado. Los teléfonos nuevos quedaron normalizados y la categoría conserva historial.','success');}catch(err){msg(friendly(err));}finally{btn.disabled=!canWrite;}}
document.querySelector('[data-close-sch]')?.addEventListener('click',()=>$('scholarshipModal').classList.add('hidden'));
$('scholarshipModal')?.addEventListener('click',e=>{if(e.target.id==='scholarshipModal')$('scholarshipModal').classList.add('hidden');});
$('schExport')?.addEventListener('click',exportarBecasCsv);
$('addBenefit')?.addEventListener('click',()=>{if(current?.player?.id)formBeca(current.player.id,null);});
$('statusFilter').addEventListener('change',loadPlayers);$('search').addEventListener('input',renderList);$('profileForm').addEventListener('submit',save);boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});


// === Miniaturas en la lista (la foto completa se reserva para la ficha) ===
async function signPlayerPhotos(list){
  try{
    const byBucket={};
    (list||[]).forEach(p=>{const path=p&&p.photo_thumb_path;if(path){const b=p.photo_bucket||'tanneros-private';(byBucket[b]=byBucket[b]||[]).push(path);}});
    for(const b of Object.keys(byBucket)){
      const {data}=await supabase.storage.from(b).createSignedUrls(byBucket[b],3600);
      const map={};(data||[]).forEach(d=>{if(d&&d.signedUrl&&!d.error)map[d.path]=d.signedUrl;});
      (list||[]).forEach(p=>{const path=p&&p.photo_thumb_path;if(path&&(p.photo_bucket||'tanneros-private')===b&&map[path])p._photoUrl=map[path];});
    }
  }catch(e){}
}


// === Filtros por facetas ===
// Antes eran ocho tarjetas, los chips de categoría y el panel de demografía, todo
// al mismo tiempo: veinte botones compitiendo. Ahora se elige primero POR QUÉ estás
// mirando la plantilla y solo se despliegan los cortes de esa faceta.
let fCat='';
let facet='plantilla';
const CAT_ORDEN=['Baby Tanner','Mini Baby Tanner','T8','T10','T12'];
const FACETAS=[
  {key:'plantilla', label:'Plantilla'},
  {key:'expediente',label:'Expediente', gate:true},
  {key:'cancha',    label:'Cancha'},
  {key:'becas',     label:'Becas',      gate:true},
  {key:'perfil',    label:'Perfil'}
];

// El conteo de cada corte se calcula SIN ese corte aplicado: si no, al tocar
// "Porteros" todas las demás posiciones se irían a cero y se perdería la referencia.
function chip(activo,dato,label,n,extra=''){
  return `<button type="button" class="fchip${activo?' on':''}${extra}" data-filtro="${esc(dato)}"${n?'':' disabled'}>`+
    `<span>${esc(label)}</span><b>${n}</b></button>`;
}
function renderFacetTabs(){
  const box=$('facetTabs');if(!box)return;
  box.innerHTML=FACETAS.filter(f=>!f.gate||canStatus)
    .map(f=>`<button type="button" role="tab" class="facet-tab${facet===f.key?' on':''}" `+
      `aria-selected="${facet===f.key}" data-facet="${f.key}">${esc(f.label)}</button>`).join('');
}
function renderFacetBody(){
  const box=$('facetBody');if(!box)return;
  const todos=players||[];
  const activos=todos.filter(p=>p.status_value==='active');
  let html='';

  if(facet==='plantilla'){
    // Categorías: el corte se cuenta sobre el resto de filtros, sin la categoría misma.
    const scope=todos.filter(p=>pasaEstado(p)&&pasaDemo(p)&&pasaPos(p));
    const counts={};scope.forEach(p=>{const k=p.category||'Sin categoría';counts[k]=(counts[k]||0)+1;});
    const present=Object.keys(counts).sort((a,b)=>{const ia=CAT_ORDEN.indexOf(a),ib=CAT_ORDEN.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);});
    if(fCat&&!present.includes(fCat))fCat='';
    html=chip(fStat==='active',   'stat:active',   'Activos',activos.length)+
         chip(fStat==='withdrawn','stat:withdrawn','Bajas',  todos.length-activos.length)+
         `<span class="fchip-sep"></span>`+
         chip(!fCat,'cat:','Todas las categorías',scope.length)+
         present.map(c=>chip(fCat===c,'cat:'+c,c,counts[c])).join('');
  }

  if(facet==='expediente'){
    html=chip(fStat==='review','stat:review','Cobro por revisar',activos.filter(p=>p.needs_review).length,' danger')+
      FILTROS.filter(f=>f.key!=='beca')
        .map(f=>chip(fStat===f.key,'stat:'+f.key,f.label,activos.filter(f.test).length,f.tono?' '+f.tono:'')).join('');
  }

  if(facet==='cancha'){
    const scope=todos.filter(p=>pasaEstado(p)&&pasaDemo(p)&&(!fCat||p.category===fCat));
    const n=g=>scope.filter(p=>grupoPos(p)===g).length;
    html=chip(!fPos,'pos:','Todas',scope.length)+
         POS_CANON.map(v=>chip(fPos===v,'pos:'+v,v,n(v))).join('')+
         `<span class="fchip-sep"></span>`+
         chip(fPos==='none','pos:none','Por definir',n('none'))+
         chip(fPos==='legacy','pos:legacy','Etiqueta vieja',n('legacy'));
  }

  if(facet==='becas'){
    const conBeca=activos.filter(p=>p.benefit_active);
    html=chip(fStat==='beca','stat:beca','Todos los apoyos',conBeca.length)+
      BECAS.map(b=>chip(fStat==='beca:'+b.key,'stat:beca:'+b.key,b.label,
        conBeca.filter(p=>p.benefit_type===b.key).length)).join('')+
      `<span class="fchip-sep"></span><button type="button" class="fchip fchip-link" data-filtro="ir:padron"><span>Ver el padrón completo</span></button>`;
  }

  box.classList.toggle('is-perfil',facet==='perfil');
  box.innerHTML=facet==='perfil'?'':html;
  $('demographicsPanel').classList.toggle('hidden',facet!=='perfil');
  if(facet==='perfil')renderDemographics();
}
function renderFilterSummary(){
  const box=$('filterSummary');if(!box)return;
  const total=(players||[]).filter(p=>p.status_value==='active').length;
  const visibles=(players||[]).filter(p=>pasaFiltro(p)&&(!fCat||p.category===fCat)).length;
  const activos=[];
  if(fStat!=='active'){
    const f=FILTROS.find(x=>x.key===fStat);
    const b=fStat.startsWith('beca:')&&BECAS.find(x=>'beca:'+x.key===fStat);
    activos.push({tipo:'stat',label:fStat==='withdrawn'?'Bajas':fStat==='review'?'Cobro por revisar'
      :fStat==='beca'?'Con apoyo':b?b.label:f?f.label:fStat});
  }
  if(fCat)activos.push({tipo:'cat',label:fCat});
  if(fPos)activos.push({tipo:'pos',label:fPos==='none'?'Posición por definir':fPos==='legacy'?'Etiqueta vieja':fPos});
  if(fDemo)activos.push({tipo:'demo',label:fDemo==='sex:M'?'Niños':fDemo==='sex:F'?'Niñas'
    :fDemo==='sex:none'?'Sexo sin dato':'Edad '+fDemo.slice(4).replace('-','–')});
  if(!activos.length){box.innerHTML=`<span class="fsum-plain">${total} Tanner${total===1?'':'s'} en la plantilla</span>`;return;}
  box.innerHTML=`<span class="fsum-count">Viendo <b>${visibles}</b> de ${total}</span>`+
    activos.map(a=>`<button type="button" class="fsum-pill" data-quitar="${a.tipo}">${esc(a.label)} <i>×</i></button>`).join('')+
    `<button type="button" class="fsum-clear" data-quitar="todo">Limpiar todo</button>`;
}
function renderFiltros(){renderFacetTabs();renderFacetBody();renderFilterSummary();}
document.addEventListener('click',e=>{
  const tab=e.target.closest?.('.facet-tab');
  if(tab){facet=tab.dataset.facet;renderFiltros();return;}
  const fc=e.target.closest?.('#facetBody .fchip');
  if(fc&&!fc.disabled){
    const [tipo,...resto]=fc.dataset.filtro.split(':');
    const val=resto.join(':');
    if(tipo==='ir'){abrirPadronBecas();return;}
    if(tipo==='cat')fCat=val;
    if(tipo==='pos')fPos=(val&&val===fPos)?'':val;
    if(tipo==='stat')fStat=(val&&val===fStat&&val!=='active')?'active':val;
    renderFiltros();renderList();return;
  }
  const quitar=e.target.closest?.('[data-quitar]');
  if(quitar){
    const k=quitar.dataset.quitar;
    if(k==='stat'||k==='todo')fStat='active';
    if(k==='cat'||k==='todo')fCat='';
    if(k==='pos'||k==='todo')fPos='';
    if(k==='demo'||k==='todo')fDemo='';
    renderFiltros();renderList();return;
  }
  const demo=e.target.closest?.('[data-demo]');
  if(demo){const k=demo.dataset.demo||'';fDemo=(k&&k===fDemo)?'':k;renderFiltros();renderList();return;}
  const fl=e.target.closest?.('.free-link');
  if(fl){openFreeNums(fl.dataset.freecat);return;}
});


// === Popup elegir dorsal (libres/ocupados por categoría) ===
function openNumPicker(){
  const modal=$('numPicker'),grid=$('numGrid');if(!modal||!grid){return;}
  const cat=(categories.find(c=>c.id===$('categoryId').value)||{}).name||(current&&current.player&&current.player.category)||'';
  const curId=current&&current.player&&current.player.id;
  const taken={};
  (players||[]).forEach(p=>{if(p.category===cat&&p.id!==curId){const n=parseInt(p.jersey_number,10);if(!isNaN(n))taken[n]=nameOf(p);}});
  $('numPickerCat').textContent=(cat||'Sin categoría').toUpperCase();
  const cur=($('jerseyNumber').value||'').trim();let html='';
  for(let n=1;n<=30;n++){
    const who=taken[n],sel=String(n)===cur;
    if(who){const ini=who.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();html+=`<div class="num-cell taken" title="${esc(who)}">${n}<small>${esc(ini)}</small></div>`;}
    else{html+=`<button type="button" class="num-cell free${sel?' sel':''}" data-num="${n}">${n}</button>`;}
  }
  grid.innerHTML=html;modal.classList.remove('hidden');
}
function closeNumPicker(){$('numPicker').classList.add('hidden');}
document.addEventListener('click',e=>{
  if(e.target.closest?.('#pickJersey')){openNumPicker();return;}
  if(e.target.closest?.('[data-close-num]')||e.target.id==='numPicker'){closeNumPicker();return;}
  const cell=e.target.closest?.('.num-cell.free[data-num]');
  if(cell){$('jerseyNumber').value=cell.dataset.num;closeNumPicker();}
});


// === Stats como filtros (estilo legacy) ===
let fStat='active';
function ageOf(birthDate){if(!birthDate)return null;const b=new Date(birthDate+'T00:00:00');if(isNaN(b))return null;const now=new Date();let age=now.getFullYear()-b.getFullYear();const m=now.getMonth()-b.getMonth();if(m<0||(m===0&&now.getDate()<b.getDate()))age--;return age;}
// === Demografía navegable ===
// Cada dato del panel es un botón: al tocarlo, la lista de abajo se queda solo con
// esos Tanners. Antes eran cifras muertas — se veía "4 niñas" sin poder saber quiénes.
const EDADES=[[0,6,'≤6'],[7,8,'7-8'],[9,10,'9-10'],[11,12,'11-12'],[13,14,'13-14'],[15,99,'15+']];
function bucketDe(p){
  const a=ageOf(p.birth_date);
  if(a==null)return 'none';
  const b=EDADES.find(([lo,hi])=>a>=lo&&a<=hi);
  return b?`${b[0]}-${b[1]}`:'none';
}
function pasaDemo(p){
  if(!fDemo)return true;
  if(fDemo==='sex:M')return p.sex==='M';
  if(fDemo==='sex:F')return p.sex==='F';
  if(fDemo==='sex:none')return p.sex!=='M'&&p.sex!=='F';
  if(fDemo.startsWith('age:'))return bucketDe(p)===fDemo.slice(4);
  return true;
}
function renderDemographics(){
  const box=$('demographicsPanel');if(!box)return;
  // El panel se calcula SIN el filtro demográfico: si no, al tocar "Niñas" las
  // barras se recalcularían a 4 de 4 y se perdería la referencia.
  const scope=(players||[]).filter(p=>pasaEstado(p)&&(!fCat||p.category===fCat));
  if(!scope.length){box.classList.add('hidden');box.innerHTML='';return;}
  box.classList.remove('hidden');
  const ninos=scope.filter(p=>p.sex==='M').length,ninas=scope.filter(p=>p.sex==='F').length,sinDato=scope.length-ninos-ninas;
  const porBucket=EDADES.map(([lo,hi,label])=>({key:`${lo}-${hi}`,label,n:scope.filter(p=>bucketDe(p)===`${lo}-${hi}`).length}));
  const sinFecha=scope.filter(p=>bucketDe(p)==='none').length;
  if(sinFecha)porBucket.push({key:'none',label:'Sin fecha',n:sinFecha});
  const maxBucket=Math.max(1,...porBucket.map(b=>b.n));
  const sexBar=(label,n,color,key)=>{
    const pct=scope.length?Math.round(n/scope.length*100):0;
    return `<button type="button" class="demo-sex-row${fDemo===key?' on':''}" data-demo="${key}"${n?'':' disabled'}>`+
      `<span class="demo-sex-top"><span>${label}</span><b>${n} (${pct}%)</b></span>`+
      `<span class="demo-sex-track"><i style="width:${pct}%;background:${color}"></i></span></button>`;
  };
  const ageBars=porBucket.map(b=>`<button type="button" class="demo-age-col${fDemo==='age:'+b.key?' on':''}" data-demo="age:${b.key}"${b.n?'':' disabled'}>`+
    `<span class="demo-age-bar" style="height:${Math.round(b.n/maxBucket*54)+4}px"></span>`+
    `<small>${esc(b.label)}</small><b>${b.n}</b></button>`).join('');
  const limpiar=fDemo?`<button type="button" class="demo-clear" data-demo="">Quitar filtro ×</button>`:'';
  box.innerHTML=`<div class="demo-head"><strong>Demografía · ${scope.length} Tanner${scope.length===1?'':'s'}</strong>`+
    `<span>${fDemo?'Toca de nuevo para quitar el filtro':'Toca cualquier dato para ver quiénes son'}</span>${limpiar}</div>`+
    `<div class="demo-grid"><div class="demo-sex">${sexBar('Niños',ninos,'#087d8e','sex:M')}${sexBar('Niñas',ninas,'#c8ae62','sex:F')}${sinDato?sexBar('Sin dato',sinDato,'#c7cfcd','sex:none'):''}</div>`+
    `<div class="demo-ages"><span class="demo-ages-label">Por edad</span><div class="demo-age-row">${ageBars}</div></div></div>`;
}

function exportRosterCsv(){
  const rows=(players||[]).map(p=>{
    const age=ageOf(p.birth_date);
    const sexLabel=p.sex==='M'?'Niño':p.sex==='F'?'Niña':'';
    const statusLabel=p.status_value==='active'?'Activo':'Baja';
    return [nameOf(p),sexLabel,p.birth_date||'',age??'',p.category||'',statusLabel,p.jersey_number||'',p.code||''];
  });
  const header=['Nombre completo','Sexo','Fecha de nacimiento','Edad','Categoría','Estatus','Dorsal','Código'];
  const csvCell=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv='﻿'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`tannery-city-jugadores-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function openFreeNums(cat){
  const modal=$('numPicker'),grid=$('numGrid');if(!modal||!grid){return;}
  const taken={};
  (players||[]).forEach(p=>{if(p.category===cat){const n=parseInt(p.jersey_number,10);if(!isNaN(n))taken[n]=nameOf(p);}});
  $('numPickerCat').textContent=(cat||'').toUpperCase();
  const t=$('numPickerTitle');if(t)t.textContent='Números de la categoría';
  let html='';
  for(let n=1;n<=30;n++){const who=taken[n];if(who){const ini=who.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();html+=`<div class="num-cell taken" title="${esc(who)}">${n}<small>${esc(ini)}</small></div>`;}else{html+=`<div class="num-cell free">${n}</div>`;}}
  grid.innerHTML=html;modal.classList.remove('hidden');
}


// === Ficha como modal (lista full-width) ===
function closeProfile(){$('profilePanel')?.classList.remove('open');}
$('profileClose')?.addEventListener('click',closeProfile);
$('profilePanel')?.addEventListener('click',e=>{if(e.target.id==='profilePanel')closeProfile();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile();});


// === Dar de baja / Dar de alta ===
function openStatusModal(forceMode){
  const p=current?.player;if(!p||!canWrite)return;
  const willWithdraw=forceMode?forceMode==='withdraw':p.status==='active';
  const fullName=[p.firstName,p.lastName].filter(Boolean).join(' ').trim()||'este Tanner';
  $('statusModalEyebrow').textContent=willWithdraw?'BAJA':'ALTA';
  $('statusModalTitle').textContent=willWithdraw?`Dar de baja a ${fullName}`:`Dar de alta a ${fullName}`;
  $('statusDate').value=today();
  $('statusReason').value='';
  $('statusReasonWrap').classList.toggle('hidden',!willWithdraw);
  $('statusModalMessage').classList.add('hidden');
  const btn=$('statusModalConfirm');
  btn.textContent=willWithdraw?'Confirmar baja':'Confirmar alta';
  btn.dataset.mode=willWithdraw?'withdraw':'reactivate';
  $('statusModal').classList.remove('hidden');
}
function closeStatusModal(){$('statusModal')?.classList.add('hidden');}
async function confirmStatusChange(){
  const p=current?.player;if(!p)return;
  const btn=$('statusModalConfirm'),errBox=$('statusModalMessage'),mode=btn.dataset.mode,date=$('statusDate').value||today();
  errBox.classList.add('hidden');
  if(mode==='withdraw'){
    const reason=$('statusReason').value.trim();
    if(!reason){errBox.textContent='Escribe el motivo de la baja.';errBox.classList.remove('hidden');return;}
    btn.disabled=true;btn.textContent='Guardando…';
    try{
      await rpc('v2_withdraw_player',{organization_id:ctx.organization_id,player_id:p.id,withdrawn_at:date,reason});
      closeStatusModal();await loadPlayers();await loadBajasPendientes();await openProfile(p.id);
      msg('Tanner dado de baja correctamente.','success');
    }catch(err){errBox.textContent=friendly(err);errBox.classList.remove('hidden');}
    finally{btn.disabled=false;btn.textContent='Confirmar baja';}
  }else{
    btn.disabled=true;btn.textContent='Guardando…';
    try{
      await rpc('v2_reactivate_player',{organization_id:ctx.organization_id,player_id:p.id,reactivated_at:date});
      closeStatusModal();await loadPlayers();await openProfile(p.id);
      msg('Tanner dado de alta. Revisa su categoría y cuota en el expediente para completar el alta.','success');
    }catch(err){errBox.textContent=friendly(err);errBox.classList.remove('hidden');}
    finally{btn.disabled=false;btn.textContent='Confirmar alta';}
  }
}
document.addEventListener('click',e=>{
  if(e.target.closest?.('#toggleStatusBtn')){openStatusModal();return;}
  if(e.target.closest?.('#withdrawInactiveBtn')){openStatusModal('withdraw');return;}
  if(e.target.closest?.('[data-close-status]')||e.target.id==='statusModal'){closeStatusModal();return;}
  if(e.target.closest?.('#statusModalConfirm')){confirmStatusChange();return;}
});
