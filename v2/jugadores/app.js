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
function friendly(e){const s=String(e?.message||e||'Ocurrió un error.');if(/ux_players_active_category_jersey|duplicate key/i.test(s))return 'Ese dorsal ya está ocupado por otro Tanner activo en la categoría seleccionada.';const map={'Not authorized':'No tienes permiso para editar expedientes.','Player not found':'No encontramos ese Tanner.','Valid birth date required':'La fecha de nacimiento no es válida.','Invalid dominant foot':'Selecciona una pierna válida.','Invalid phone number':'Revisa el formato del teléfono.','Mexico phone must have exactly 10 digits':'Para México usa exactamente 10 dígitos.','Guardian phone required':'Captura un teléfono válido para el tutor.','Invalid guardian email':'El correo del tutor no es válido.','Effective date cannot precede current enrollment start':'La fecha del cambio no puede ser anterior al inicio de la categoría actual.','Only withdrawn players can be reactivated':'Este Tanner ya está activo.','Only withdrawn or inactive players can be reactivated':'Este Tanner ya está activo.','Only active players can be withdrawn':'Este Tanner ya está de baja.','Reactivation date required':'Indica la fecha de alta.','Withdrawal date required':'Indica la fecha de baja.','Withdrawal reason required':'Escribe el motivo de la baja.'};return map[s]||s;}
function renderStatusAction(p){const btn=$('toggleStatusBtn');if(!btn)return;if(!canStatus){btn.classList.add('hidden');return;}btn.classList.remove('hidden');if(p.status!=='active'){btn.textContent='Dar de alta';btn.dataset.action='reactivate';btn.classList.remove('danger-mini');}else{btn.textContent='Dar de baja';btn.dataset.action='withdraw';btn.classList.add('danger-mini');}}
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/v2';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),mod=mods.find(m=>m.module_code==='players');if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Jugadores.';show('deniedView');return;}canWrite=!!mod.can_write;
  const familyMod=mods.find(m=>m.module_code==='jugadores_familia');canFamily=!!(familyMod?.enabled&&familyMod?.can_write);
  const statusMod=mods.find(m=>m.module_code==='jugadores_estado');canStatus=!!(statusMod?.enabled&&statusMod?.can_write);
  applyFamilyLock();
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;$('saveProfile').disabled=!canWrite;$('categoryDate').value=today();[players,categories]=await Promise.all([rpc('v2_players',{organization_id:ctx.organization_id,status_filter:null}),rpc('v2_player_categories',{organization_id:ctx.organization_id})]);players=players||[];categories=categories||[];renderStats();renderDemographics();buildCatChips();renderCategories();renderList();signPlayerPhotos(players).then(()=>renderList());
  const canExport=ctx.is_owner||ctx.role==='Presidencia';const exportBtn=$('exportRoster');if(exportBtn){exportBtn.classList.toggle('hidden',!canExport);exportBtn.addEventListener('click',exportRosterCsv);}
  show('view');const requested=new URLSearchParams(location.search).get('player');if(requested&&players.some(p=>p.id===requested))await openProfile(requested);}
function renderCategories(){const s=$('categoryId');s.innerHTML='<option value="">Sin categoría</option>';categories.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;s.appendChild(o);});}
async function loadPlayers(){players=await rpc('v2_players',{organization_id:ctx.organization_id,status_filter:null})||[];renderStats();renderDemographics();buildCatChips();renderList();signPlayerPhotos(players).then(()=>renderList());}
function renderList(){const q=$('search').value.trim().toLocaleLowerCase('es-MX');const rows=players.filter(p=>{const active=p.status_value==='active';const stOk=fStat==='active'?active:(fStat==='withdrawn'?!active:(fStat==='review'?(p.needs_review&&active):true));if(!stOk)return false;if(fCat&&p.category!==fCat)return false;if(q&&!`${p.code||''} ${nameOf(p)} ${p.category||''} ${p.player_position||''} ${p.jersey_number||''}`.toLocaleLowerCase('es-MX').includes(q))return false;return true;});const box=$('playerList');box.innerHTML='';$('empty').classList.toggle('hidden',rows.length>0);const ORDER=['Baby Tanner','Mini Baby Tanner','T8','T10','T12'];const groups={};rows.forEach(p=>{const k=p.category||'Sin categoría';(groups[k]=groups[k]||[]).push(p);});let cats=Object.keys(groups).sort((a,b)=>{const ia=ORDER.indexOf(a),ib=ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);});cats.forEach(cat=>{const list=groups[cat].slice().sort((a,b)=>((parseInt(a.jersey_number,10)||999)-(parseInt(b.jersey_number,10)||999))||nameOf(a).localeCompare(nameOf(b)));const sec=document.createElement('section');sec.className='cat-section';const head=document.createElement('div');head.className='cat-head';head.innerHTML=`<h3>${esc(cat)} · ${list.length}</h3><button type="button" class="free-link" data-freecat="${esc(cat)}">Números libres</button>`;const grid=document.createElement('div');grid.className='jgrid';list.forEach(p=>{const full=nameOf(p)||'Sin nombre',initials=full.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();const b=document.createElement('button');b.type='button';b.dataset.playerId=p.id;b.className=`jcard${p._photoUrl?' has-photo':''}${current?.player?.id===p.id?' selected':''}`;const review=p.needs_review;b.innerHTML=`${p._photoUrl?`<img class="jcard-photo" loading="lazy" decoding="async" alt="" src="${esc(p._photoUrl)}">`:''}<span class="jcard-cat">${esc(cat)}</span><span class="jcard-num">#${esc(p.jersey_number||'—')}</span><span class="jcard-dot${review?' review':' ok'}"></span>${p._photoUrl?'':`<span class="jcard-initials">${esc(initials)}</span>`}<span class="jcard-name">${esc(full)}</span>`;b.onclick=()=>openProfile(p.id);grid.appendChild(b);});sec.appendChild(head);sec.appendChild(grid);box.appendChild(sec);});}
let photoRenderSeq=0;
function legacyPhotoSource(value){const raw=String(value||'').trim();if(/^data:image\//i.test(raw)||/^https?:\/\//i.test(raw))return raw;return null;}
function drawPhoto(box,src,alt){box.innerHTML='';const img=document.createElement('img');img.src=src;img.alt=alt;img.decoding='async';box.appendChild(img);}
async function renderPhoto(p){const seq=++photoRenderSeq,box=$('photoBox'),alt=`Foto de ${p.firstName||'Tanner'}`;box.innerHTML='<span>Sin foto</span>';if(p.photoPath){try{const bucket=p.photoBucket||'tanneros-private';const {data,error}=await supabase.storage.from(bucket).createSignedUrl(p.photoPath,600);if(error||!data?.signedUrl)throw error;if(seq===photoRenderSeq)drawPhoto(box,data.signedUrl,alt);return;}catch{if(seq!==photoRenderSeq)return;}}const legacy=legacyPhotoSource(p.legacyPhotoData);if(legacy){drawPhoto(box,legacy,alt);return;}if(p.legacyPhotoData){box.innerHTML='<span class="previous-photo-note">Foto anterior<small>Vuelve a subirla</small></span>';}else if(p.photoPath){box.innerHTML='<span>Foto protegida</span>';}}
function fill(p,g,enrollment){$('firstName').value=p.firstName||'';$('lastName').value=p.lastName||'';$('birthDate').value=p.birthDate||'';$('position').value=p.position||'';const foot={Derecha:'right',Izquierda:'left',Ambas:'both'}[p.dominantFoot]||p.dominantFoot||'';$('dominantFoot').value=foot;$('sex').value=p.sex||'';$('jerseyNumber').value=p.jerseyNumber||'';$('school').value=p.school||'';$('bloodType').value=p.bloodType||'';$('allergies').value=p.allergies||'';$('address').value=p.address||'';$('emergencyName').value=p.emergencyContactName||'';$('emergencyPhone').value=p.emergencyContactPhone||'';$('notes').value=p.notes||'';$('categoryId').value=enrollment?.categoryId||'';$('categoryDate').value=today();$('categoryNotes').value='';$('guardianName').value=[g?.firstName,g?.lastName].filter(Boolean).join(' ').trim();$('guardianPhone').value=g?.phone||'';$('guardianEmail').value=g?.email||'';$('guardianRelationship').value=g?.relationship||g?.relationshipDefault||'';$('canPickup').checked=g?.canPickup??true;$('receivesBilling').checked=g?.receivesBilling??true;}
function renderOtherGuardians(rows,primary){const box=$('otherGuardians'),others=(rows||[]).filter(g=>g.id!==primary?.id);box.innerHTML=others.length?`<strong>Otros contactos vinculados</strong>${others.map(g=>`<span>${esc([g.firstName,g.lastName].filter(Boolean).join(' '))} · ${esc(g.phone||'Sin teléfono')} · ${esc(g.relationship||'Contacto')}</span>`).join('')}`:'';}
function renderPrivacy(p){const box=$('privacyBadges');box.innerHTML='';const badges=[p.dataConsent?'Datos autorizados':'Consentimiento pendiente',p.imageConsent?'Imagen autorizada':'Sin autorización publicitaria',p.privacyNoticeVersion?`Aviso ${p.privacyNoticeVersion}`:null].filter(Boolean);badges.forEach((x,i)=>{const s=document.createElement('span');s.textContent=x;s.className=`profile-badge ${i===0&&p.dataConsent?'ok':''}`;box.appendChild(s);});}
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
async function openProfile(id){msg();current=await rpc('v2_player_profile',{organization_id:ctx.organization_id,player_id:id});const p=current.player,g=(current.guardians||[]).find(x=>x.isPrimary)||(current.guardians||[])[0]||null;$('profileEmpty').classList.add('hidden');$('profileView').classList.remove('hidden');$('profilePanel').classList.add('open');$('profileName').textContent=[p.firstName,p.lastName].filter(Boolean).join(' ');$('profileMeta').textContent=`${p.code||'Sin código'} · ${p.status==='active'?'Activo':'Baja'}${p.category?` · ${p.category}`:''}`;fill(p,g,current.activeEnrollment);renderCardIdentity(p);renderStatusAction(p);renderOtherGuardians(current.guardians,g);renderPrivacy(p);renderPhoto(p);renderList();loadSports(id);document.dispatchEvent(new CustomEvent('tanner-profile-opened',{detail:{playerId:id,player:p,organizationId:ctx.organization_id,canWrite}}));}
async function save(e){e.preventDefault();if(!current||!canWrite)return;msg();const btn=$('saveProfile');btn.disabled=true;try{const p=current.player;current=await rpc('v2_save_player_profile',{organization_id:ctx.organization_id,player_id:p.id,first_name:$('firstName').value.trim(),last_name:$('lastName').value.trim(),birth_date:$('birthDate').value,player_position:$('position').value.trim()||null,dominant_foot:$('dominantFoot').value||null,sex:$('sex').value||null,jersey_number:$('jerseyNumber').value.trim()||null,school:$('school').value.trim()||null,blood_type:$('bloodType').value.trim()||null,allergies:$('allergies').value.trim()||null,address:$('address').value.trim()||null,emergency_contact_name:$('emergencyName').value.trim()||null,emergency_contact_phone:$('emergencyPhone').value.trim()||null,notes:$('notes').value.trim()||null,guardian_name:$('guardianName').value.trim()||null,guardian_phone:$('guardianPhone').value.trim()||null,guardian_email:$('guardianEmail').value.trim()||null,guardian_relationship:$('guardianRelationship').value.trim()||null,can_pickup:$('canPickup').checked,receives_billing:$('receivesBilling').checked,category_id:$('categoryId').value||null,category_effective_date:$('categoryDate').value||today(),category_notes:$('categoryNotes').value.trim()||null});await loadPlayers();await openProfile(p.id);msg('Expediente guardado. Los teléfonos nuevos quedaron normalizados y la categoría conserva historial.','success');}catch(err){msg(friendly(err));}finally{btn.disabled=!canWrite;}}
$('statusFilter').addEventListener('change',loadPlayers);$('search').addEventListener('input',renderList);$('profileForm').addEventListener('submit',save);boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});


// === Fotos protagonistas en la lista (URLs firmadas, 1 llamada por bucket) ===
async function signPlayerPhotos(list){
  try{
    const byBucket={};
    (list||[]).forEach(p=>{const path=p&&(p.photo_thumb_path||p.photo_path);if(path){const b=p.photo_bucket||'tanneros-private';(byBucket[b]=byBucket[b]||[]).push(path);}});
    for(const b of Object.keys(byBucket)){
      const {data}=await supabase.storage.from(b).createSignedUrls(byBucket[b],3600);
      const map={};(data||[]).forEach(d=>{if(d&&d.signedUrl&&!d.error)map[d.path]=d.signedUrl;});
      (list||[]).forEach(p=>{const path=p&&(p.photo_thumb_path||p.photo_path);if(path&&(p.photo_bucket||'tanneros-private')===b&&map[path])p._photoUrl=map[path];});
    }
  }catch(e){}
}


// === Filtros futboleros: chips de categoría + estado ===
let fCat='';
function buildCatChips(){
  const box=$('catChips');if(!box)return;
  const ORDER=['Baby Tanner','Mini Baby Tanner','T8','T10','T12'];
  const scope=(players||[]).filter(p=>{const active=p.status_value==='active';return fStat==='active'?active:(fStat==='withdrawn'?!active:(fStat==='review'?(p.needs_review&&active):true));});
  const counts={};scope.forEach(p=>{const k=p.category||'Sin categoría';counts[k]=(counts[k]||0)+1;});
  const present=Object.keys(counts).sort((a,b)=>{const ia=ORDER.indexOf(a),ib=ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);});
  if(fCat&&!present.includes(fCat))fCat='';
  const chips=[['','Todas',scope.length],...present.map(c=>[c,c,counts[c]])];
  box.innerHTML=chips.map(([v,l,n])=>`<button type="button" class="chip${v===fCat?' on':''}" data-cat="${esc(v)}">${esc(l)} · ${n}</button>`).join('');
}
document.addEventListener('click',e=>{
  const chip=e.target.closest?.('#catChips .chip');
  if(chip){fCat=chip.dataset.cat||'';buildCatChips();renderList();return;}
  const stat=e.target.closest?.('.stat-card');
  if(stat){const k=stat.dataset.stat;if(k==='cat'){fStat='active';fCat='';}else{fStat=k;}renderStats();buildCatChips();renderList();return;}
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
function renderStats(){
  const box=$('statCards');if(!box)return;
  const all=players||[];const active=all.filter(p=>p.status_value==='active');
  const jugadores=active.length;
  const categorias=new Set(active.map(p=>p.category).filter(Boolean)).size;
  const bajas=all.filter(p=>p.status_value!=='active').length;
  const exp=active.filter(p=>p.needs_review).length;
  const cards=[['active',jugadores,'Jugadores',''],['cat',categorias,'Categorías',''],['withdrawn',bajas,'Bajas',''],['review',exp,'Exp. incompleto','danger']];
  box.innerHTML=cards.map(([k,n,l,cls])=>`<button type="button" class="stat-card${cls?' '+cls:''}${(k!=='cat'&&fStat===k)?' on':''}" data-stat="${k}"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></button>`).join('');
}
function ageOf(birthDate){if(!birthDate)return null;const b=new Date(birthDate+'T00:00:00');if(isNaN(b))return null;const now=new Date();let age=now.getFullYear()-b.getFullYear();const m=now.getMonth()-b.getMonth();if(m<0||(m===0&&now.getDate()<b.getDate()))age--;return age;}
function renderDemographics(){
  const box=$('demographicsPanel');if(!box)return;
  const active=(players||[]).filter(p=>p.status_value==='active');
  if(!active.length){box.classList.add('hidden');box.innerHTML='';return;}
  box.classList.remove('hidden');
  const ninos=active.filter(p=>p.sex==='M').length,ninas=active.filter(p=>p.sex==='F').length,sinDato=active.length-ninos-ninas;
  const buckets=[[0,6,'≤6'],[7,8,'7-8'],[9,10,'9-10'],[11,12,'11-12'],[13,14,'13-14'],[15,99,'15+']];
  const ages=active.map(p=>ageOf(p.birth_date)).filter(a=>a!=null);
  const byBucket=buckets.map(([lo,hi,label])=>({label,n:ages.filter(a=>a>=lo&&a<=hi).length}));
  const maxBucket=Math.max(1,...byBucket.map(b=>b.n));
  const sexBar=(label,n,color)=>{const pct=active.length?Math.round(n/active.length*100):0;return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px"><span>${label}</span><b>${n} (${pct}%)</b></div><div style="height:8px;background:#eef1ee;border-radius:4px"><div style="height:8px;width:${pct}%;background:${color};border-radius:4px"></div></div></div>`;};
  const ageBars=byBucket.map(b=>`<div class="demo-age-col"><div class="demo-age-bar" style="height:${Math.round(b.n/maxBucket*54)+4}px"></div><small>${b.label}</small><b>${b.n}</b></div>`).join('');
  box.innerHTML=`<div class="demo-head"><strong>Demografía · ${active.length} activos</strong><span>Para seguros, patrocinios y reportes</span></div><div class="demo-grid"><div class="demo-sex">${sexBar('Niños',ninos,'#087d8e')}${sexBar('Niñas',ninas,'#c8ae62')}${sinDato?sexBar('Sin dato',sinDato,'#c7cfcd'):''}</div><div class="demo-ages"><span class="demo-ages-label">Por edad</span><div class="demo-age-row">${ageBars}</div></div></div>`;
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
function openStatusModal(){
  const p=current?.player;if(!p||!canWrite)return;
  const willWithdraw=p.status==='active';
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
      closeStatusModal();await loadPlayers();await openProfile(p.id);
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
  if(e.target.closest?.('[data-close-status]')||e.target.id==='statusModal'){closeStatusModal();return;}
  if(e.target.closest?.('#statusModalConfirm')){confirmStatusChange();return;}
});
