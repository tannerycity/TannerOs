import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);let ctx=null,canWrite=false,calendarItems=[],players=[],playersById={},items=[],filter='all',selectedDay='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=v=>String(v).padStart(2,'0'),dayKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const nameOf=p=>[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Tanner';
const initials=p=>nameOf(p).split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,t='',type='error'){const e=$(id);if(!e)return;e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
function monthValue(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
function monthBounds(){const [y,m]=$('month').value.split('-').map(Number);return {year:y,month:m,from:new Date(y,m-1,1),to:new Date(y,m,1)};}
function localIso(v){return v?new Date(v).toISOString():null;}
function friendly(e){const t=String(e?.message||e||'Error');const map={'Not authorized':'No tienes permiso para usar Calendario.','Event title required':'Escribe el título del evento.','Event date required':'Selecciona fecha y hora.','Invalid event type':'Tipo de evento inválido.','Invalid event status':'Estatus inválido.','Invalid audience':'Selecciona a quién avisar.','Title required':'Escribe el título del evento.'};return map[t]||t;}
function birthdayDate(birth,year){const parts=String(birth||'').slice(0,10).split('-').map(Number);if(parts.length<3)return null;const d=new Date(year,parts[1]-1,parts[2],12);if(d.getMonth()!==parts[1]-1)d.setDate(0);return d;}
function nextBirthday(p){const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());let next=birthdayDate(p.birth_date,now.getFullYear());if(next<today)next=birthdayDate(p.birth_date,now.getFullYear()+1);return {player:p,date:next,days:Math.round((next-today)/86400000)};}

// === Fotos protagonistas (mismo patrón que Jugadores: signed URLs por lote, bucket privado) ===
async function signPlayerPhotos(list){
  try{
    const byBucket={};
    (list||[]).forEach(p=>{if(p&&p.photo_path){const b=p.photo_bucket||'tanneros-private';(byBucket[b]=byBucket[b]||[]).push(p.photo_path);}});
    for(const b of Object.keys(byBucket)){
      const {data}=await supabase.storage.from(b).createSignedUrls(byBucket[b],3600);
      const map={};(data||[]).forEach(d=>{if(d&&d.signedUrl&&!d.error)map[d.path]=d.signedUrl;});
      (list||[]).forEach(p=>{if(p&&p.photo_path&&(p.photo_bucket||'tanneros-private')===b&&map[p.photo_path])p._photoUrl=map[p.photo_path];});
    }
  }catch(e){}
}
function avatarHtml(p,size){const url=p?._photoUrl;if(url)return `<span class="tanner-avatar ${size}" style="background-image:url('${url.replace(/'/g,'%27')}')"></span>`;return `<span class="tanner-avatar ${size} initials">${esc(initials(p))}</span>`;}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}
  ctx=rows[0];
  const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const mod=mods.find(m=>m.module_code==='calendar');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso al calendario.';show('deniedView');return;}
  canWrite=!!mod.can_write;
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';
  $('roleBadge').textContent=ctx.is_owner?'Presidencia':ctx.role;
  $('addEventButton').classList.toggle('hidden',!canWrite);
  $('month').value=monthValue();
  players=await rpc('v2_players',{organization_id:ctx.organization_id,status_filter:'active'})||[];
  playersById=Object.fromEntries(players.map(p=>[p.id,p]));
  await signPlayerPhotos(players);
  await load();
  show('view');
  if(new URLSearchParams(location.search).get('action')==='evento'&&canWrite)openEventModal();
}

async function load(){
  const {from,to}=monthBounds();
  const raw=await rpc('v2_calendar',{organization_id:ctx.organization_id,from_at:from.toISOString(),to_at:to.toISOString()});
  calendarItems=Array.isArray(raw)?raw:[];
  // v2_calendar ya es la única fuente de cumpleaños (misma fuente = cuadra siempre); aquí solo enriquecemos con foto/categoría del Tanner.
  items=calendarItems.map(x=>{
    if(x.source==='birthday'){
      const p=playersById[x.sourceId];
      if(p)return {...x,player:p,title:`Cumpleaños de ${nameOf(p)}`,detail:[p.category||'Tanner',x.detail].filter(Boolean).join(' · ')};
    }
    return x;
  }).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));
  selectedDay='';
  render();
}

function itemMeta(source){return ({session:{label:'Entrenamiento',icon:'tos-icon-ball'},match:{label:'Partido',icon:'tos-icon-trophy'},program:{label:'Programa',icon:'tos-icon-target'},event:{label:'Evento',icon:'tos-icon-pin'},birthday:{label:'Cumpleaños',icon:'tos-icon-cake'}})[source]||{label:'Actividad',icon:'tos-icon-calendar'};}
function visibleItems(){return items.filter(x=>(filter==='all'||x.source===filter||(filter==='event'&&x.source==='program'))&&(!selectedDay||dayKey(new Date(x.startsAt))===selectedDay));}
function render(){const {from}=monthBounds();$('monthTitle').textContent=from.toLocaleDateString('es-MX',{month:'long',year:'numeric'});renderSummary();renderSpotlight();renderMonthGrid();renderRail();}
function renderSummary(){const counts={birthday:0,session:0,match:0,event:0,program:0};items.forEach(x=>{if(x.source in counts)counts[x.source]++;});$('kpiBirthdays').textContent=counts.birthday;$('kpiSessions').textContent=counts.session;$('kpiMatches').textContent=counts.match;$('kpiEvents').textContent=counts.event+counts.program;}

function renderSpotlight(){
  const upcoming=players.filter(p=>p.birth_date).map(nextBirthday).sort((a,b)=>a.days-b.days).slice(0,8),today=upcoming.filter(x=>x.days===0),lead=today[0]||upcoming[0];
  $('birthdayLead').innerHTML=lead?`${avatarHtml(lead.player,'lg')}<div><span>${lead.days===0?'Cumpleaños de hoy':lead.days===1?'Mañana':'Próximo cumpleaños'}</span><strong>${esc(nameOf(lead.player))}</strong><small>${esc(lead.player.category||'Tanner')}${lead.days>1?` · En ${lead.days} días`:''}</small></div>`:'<div><strong>Completa las fechas de nacimiento</strong><small>Así podremos avisarte a quién felicitar.</small></div>';
  $('birthdayActions').classList.toggle('hidden',!lead);
  if(lead){$('openPlayer').href=`/v2/jugadores/?player=${encodeURIComponent(lead.player.id)}`;$('copyGreeting').dataset.name=nameOf(lead.player);}
  $('upcomingBirthdays').innerHTML=upcoming.slice(today.length?1:0).map(x=>`<a href="/v2/jugadores/?player=${encodeURIComponent(x.player.id)}">${avatarHtml(x.player,'sm')}<span><strong>${esc(nameOf(x.player))}</strong><small>${x.days===0?'Hoy':x.days===1?'Mañana':x.date.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</small></span></a>`).join('');
}

function renderMonthGrid(){const {year,month}=monthBounds(),first=new Date(year,month-1,1),days=new Date(year,month,0).getDate(),offset=(first.getDay()+6)%7,todayKey=dayKey(new Date()),box=$('monthGrid');box.innerHTML='';['L','M','M','J','V','S','D'].forEach(x=>{const h=document.createElement('span');h.className='weekday';h.textContent=x;box.appendChild(h);});for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.className='day blank';box.appendChild(blank);}for(let n=1;n<=days;n++){const d=new Date(year,month-1,n),key=dayKey(d),dayItems=items.filter(x=>dayKey(new Date(x.startsAt))===key),button=document.createElement('button');button.type='button';button.className=`day${key===todayKey?' today':''}${key===selectedDay?' selected':''}`;button.setAttribute('aria-label',`${n} de ${first.toLocaleDateString('es-MX',{month:'long'})}, ${dayItems.length} actividades`);button.innerHTML=`<b>${n}</b><span class="day-dots">${[...new Set(dayItems.map(x=>x.source))].slice(0,4).map(s=>`<i class="dot-${esc(s)}"></i>`).join('')}</span>`;button.onclick=()=>{selectedDay=selectedDay===key?'':key;renderMonthGrid();renderRail();};box.appendChild(button);}}

function renderRail(){
  const rows=visibleItems(),box=$('agendaRail');box.innerHTML='';
  $('empty').classList.toggle('hidden',rows.length>0);
  $('agendaTitle').textContent=selectedDay?new Date(`${selectedDay}T12:00:00`).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'}):'Lo que sigue este mes';
  rows.forEach(x=>{
    const d=new Date(x.startsAt),meta=itemMeta(x.source),photoUrl=x.source==='birthday'&&x.player&&x.player._photoUrl,dateLabel=d.toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}),when=x.allDay?'Todo el día':d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    const el=document.createElement(x.player?'a':'article');
    el.className=`rail-card source-${x.source}${photoUrl?' has-photo':''}`;
    if(x.player)el.href=`/v2/jugadores/?player=${encodeURIComponent(x.player.id)}`;
    if(photoUrl){
      el.style.backgroundImage=`url('${photoUrl.replace(/'/g,'%27')}')`;
      el.innerHTML=`<span class="rail-date on-photo">${esc(dateLabel)}</span><div class="rail-scrim"><strong>${esc(x.title||'Actividad')}</strong><span>${esc(x.detail||'')}</span></div>`;
    }else{
      el.innerHTML=`<div class="rail-icon"><span class="tos-icon ${meta.icon}" aria-hidden="true"></span><span class="source-chip">${esc(meta.label)}</span></div><span class="rail-date">${esc(dateLabel)}${x.allDay?'':' · '+esc(when)}</span><strong>${esc(x.title||'Actividad')}</strong>${x.location?`<span class="rail-loc">${esc(x.location)}</span>`:''}${x.detail?`<small>${esc(x.detail)}</small>`:''}`;
    }
    box.appendChild(el);
  });
}

function openEventModal(){$('eventModal').classList.remove('hidden');toggleAudienceFields();setTimeout(()=>$('eventTitle').focus(),30);}
function closeEventModal(){$('eventModal').classList.add('hidden');$('eventForm').reset();msg('eventMessage');toggleAudienceFields();}
function toggleAudienceFields(){const on=$('eventNotify').checked;$('audienceRow').classList.toggle('hidden',!on);const role=$('eventAudienceType').value==='role';$('eventAudienceRole').closest('label').classList.toggle('hidden',!role);}

async function saveEvent(e){
  e.preventDefault();msg('eventMessage');
  const btn=$('saveEvent');btn.disabled=true;
  try{
    const notify=$('eventNotify').checked,audienceType=notify?$('eventAudienceType').value:'club',audienceValue=(notify&&audienceType==='role')?($('eventAudienceRole').value||null):null;
    await rpc('v2_upsert_club_event_notify',{organization_id:ctx.organization_id,event_id:null,title:$('eventTitle').value.trim(),starts_at:localIso($('eventDate').value),event_type:$('eventType').value,location:$('eventLocation').value.trim()||null,status:$('eventStatus').value,rival:$('eventRival').value.trim()||null,jersey:$('eventJersey').value.trim()||null,notes:$('eventNotes').value.trim()||null,notify,audience_type:audienceType,audience_value:audienceValue});
    await load();
    closeEventModal();
    if(window.tosAlert)await window.tosAlert({kicker:'CALENDARIO',title:'Evento guardado',message:notify?'Se agregó a la agenda y se avisó al club.':'Se agregó a la agenda del club.'});
  }catch(err){msg('eventMessage',friendly(err));}
  finally{btn.disabled=false;}
}

function shiftMonth(delta){const [y,m]=$('month').value.split('-').map(Number);$('month').value=monthValue(new Date(y,m-1+delta,1));load();}

$('eventForm')?.addEventListener('submit',saveEvent);
$('month')?.addEventListener('change',load);
$('prevMonth')?.addEventListener('click',()=>shiftMonth(-1));
$('nextMonth')?.addEventListener('click',()=>shiftMonth(1));
$('todayButton')?.addEventListener('click',()=>{$('month').value=monthValue();load();});
$('addEventButton')?.addEventListener('click',openEventModal);
$('closeEventModal')?.addEventListener('click',closeEventModal);
$('eventModal')?.addEventListener('click',e=>{if(e.target.id==='eventModal')closeEventModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('eventModal').classList.contains('hidden'))closeEventModal();});
$('eventNotify')?.addEventListener('change',toggleAudienceFields);
$('eventAudienceType')?.addEventListener('change',toggleAudienceFields);
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;selectedDay='';document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderMonthGrid();renderRail();}));
$('copyGreeting')?.addEventListener('click',async e=>{const name=e.currentTarget.dataset.name||'Tanner',text=`Feliz cumpleaños, ${name}. Todo Tannery City te desea un gran día.`;await navigator.clipboard.writeText(text);e.currentTarget.textContent='Mensaje copiado';setTimeout(()=>e.currentTarget.textContent='Copiar felicitación',1800);});

boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});