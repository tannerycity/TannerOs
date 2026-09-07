import {supabase,rpc,money,$} from '/v2/shell.js';

// Portal de familias. No usa el shell del staff a propósito: un tutor no tiene
// módulos que navegar, y mezclar ambas superficies es como se filtran datos.
// Todo lo que se muestra viene de los RPC v2_portal_*, que resuelven al tutor
// por auth.uid() y nunca confían en un id que mande esta página.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CHARGE_LABEL={monthly_fee:'Mensualidad',late_fee:'Recargo',academy_fee:'Academia',uniform:'Uniforme',parking_pass:'Gafete'};
const chargeLabel=t=>CHARGE_LABEL[t]||'Cargo';
const state={home:null,playerId:'',tab:'cuenta',statements:{},calendar:null,catalog:null,cart:{},parking:null};

function show(id){['loginView','passwordView','appView'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,text='',type='error'){
  const box=$(id);if(!box)return;
  box.textContent=text;box.dataset.type=type;box.classList.toggle('hidden',!text);
}
function friendly(error){
  const raw=String(error?.message||error||'Ocurrió un error.');
  if(/invalid login credentials/i.test(raw))return 'Correo o contraseña incorrectos.';
  if(/portal access required/i.test(raw))return 'Tu cuenta todavía no está ligada a un Tanner. Avísale al club.';
  if(/not authorized/i.test(raw))return 'No tienes acceso a esa información.';
  if(/failed to fetch|network/i.test(raw))return 'No pudimos conectar. Revisa tu señal e intenta de nuevo.';
  return raw;
}
function fmtDate(v){
  if(!v)return '';
  const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
  return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(d);
}
function initials(p){
  return [p.first_name,p.last_name].filter(Boolean).map(s=>String(s).trim()[0]||'').join('').toUpperCase().slice(0,2)||'T';
}
const currentPlayer=()=>(state.home?.players||[]).find(p=>String(p.id)===String(state.playerId))||null;

async function signPhoto(p){
  const path=p.photo_thumb_path||p.photo_path;
  if(!path)return '';
  try{
    const {data,error}=await supabase.storage.from(p.photo_bucket||'tanneros-private').createSignedUrl(path,3600);
    return error?'':(data?.signedUrl||'');
  }catch(e){return '';}
}

/* ---------- Acceso ---------- */
async function handleLogin(event){
  event.preventDefault();msg('loginMessage');
  const email=$('email').value.trim().toLowerCase(),password=$('password').value;
  const btn=$('loginSubmit');btn.disabled=true;btn.textContent='Entrando…';
  try{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw error;
    await boot();
  }catch(error){msg('loginMessage',friendly(error));}
  finally{btn.disabled=false;btn.textContent='Entrar';}
}

async function handlePassword(event){
  event.preventDefault();msg('passwordMessage');
  const a=$('newPassword').value,b=$('confirmPassword').value;
  if(a.length<10){msg('passwordMessage','Usa al menos 10 caracteres.');return;}
  if(a!==b){msg('passwordMessage','Las contraseñas no coinciden.');return;}
  const btn=$('passwordSubmit');btn.disabled=true;btn.textContent='Guardando…';
  try{
    const {error}=await supabase.auth.updateUser({password:a});
    if(error)throw error;
    const {data,error:fnError}=await supabase.functions.invoke('staff-access',{body:{action:'complete_password_change'}});
    if(fnError)throw fnError;
    if(data?.error)throw new Error(data.error);
    await supabase.auth.refreshSession();
    await boot();
  }catch(error){msg('passwordMessage',friendly(error));btn.disabled=false;btn.textContent='Guardar y entrar';}
}

/* ---------- Cuenta ---------- */
function balanceBlock(st){
  const s=st.summary||{};
  const saldo=Number(s.balance||0),aFavor=Number(s.credit_available||0);
  const estado=saldo>0?'due':aFavor>0?'credit':'clear';
  const titulo=saldo>0?'Tu saldo pendiente':aFavor>0?'Tienes saldo a favor':'Estás al corriente';
  const cifra=money.format(saldo>0?saldo:aFavor);
  const sub=saldo>0
    ? (s.oldest_due?`Lo más antiguo desde el ${fmtDate(s.oldest_due)}`:'Puedes pagar en el club')
    : aFavor>0?'Se aplicará automáticamente a tu próximo cargo':'No tienes nada pendiente. ¡Gracias!';
  const partes=(s.by_type||[]).map(t=>
    `<div class="fam-chip-val"><span>${esc(chargeLabel(t.type))}</span><b>${money.format(Number(t.pending||0))}</b></div>`).join('');
  return `<section class="fam-balance" data-state="${estado}"><span>${titulo}</span><strong>${cifra}</strong><small>${esc(sub)}</small>${partes?`<div class="fam-split">${partes}</div>`:''}</section>`;
}

function monthsBlock(st){
  const hoy=new Date().toISOString().slice(0,10),meses=new Map();
  (st.ledger||[]).filter(m=>m.kind==='charge'&&m.period).forEach(m=>{
    const k=String(m.period).slice(0,7);
    const acc=meses.get(k)||{key:k,cargado:0,saldo:0,vence:''};
    acc.cargado+=Number(m.amount||0);acc.saldo+=Number(m.charge_balance||0);
    if(m.date&&String(m.date)>acc.vence)acc.vence=String(m.date).slice(0,10);
    meses.set(k,acc);
  });
  const filas=[...meses.values()].sort((a,b)=>b.key.localeCompare(a.key));
  if(!filas.length)return '';
  const nombre=k=>{const d=new Date(`${k}-01T12:00:00`);
    return Number.isNaN(d.getTime())?k:new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','');};
  const anio=String(new Date().getFullYear());
  const cards=filas.map(f=>{
    const debe=f.saldo>0.004,vencido=debe&&f.vence&&f.vence<hoy;
    const estado=!debe?'pagado':vencido?'vencido':'pendiente';
    return `<div class="fam-mes" data-state="${estado}"><span class="fam-mes-nom">${esc(nombre(f.key))}</span><b>${money.format(debe?f.saldo:f.cargado)}</b><span class="fam-mes-pie">${!debe?'Pagado':vencido?'Vencido':'Por vencer'}</span>${f.key.slice(0,4)!==anio?`<small>${esc(f.key.slice(0,4))}</small>`:''}</div>`;
  }).join('');
  const pend=filas.filter(f=>f.saldo>0.004).length;
  return `<section class="fam-card"><div class="fam-card-head"><h2>Por mes</h2><span>${pend?`debes ${pend} mes${pend===1?'':'es'}`:'todo pagado'}</span></div><div class="fam-meses">${cards}</div></section>`;
}

function ledgerBlock(st){
  const rows=(st.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted');
  if(!rows.length)return '';
  const html=rows.map(m=>{
    const cargo=m.kind==='charge',monto=Number(m.amount||0);
    const titulo=cargo?`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}`:'Pago recibido';
    const detalle=cargo
      ? `${fmtDate(m.date)}${Number(m.charge_balance||0)>0?` · faltan ${money.format(Number(m.charge_balance))}`:' · liquidado'}`
      : `${fmtDate(m.date)}${m.method?` · ${esc(m.method)}`:''}`;
    return `<div class="fam-mov" data-kind="${cargo?'charge':'payment'}"><span><strong>${esc(titulo)}</strong><span>${detalle}</span></span><b>${cargo?'+':'−'}${money.format(Math.abs(monto))}</b></div>`;
  }).join('');
  return `<section class="fam-card"><div class="fam-card-head"><h2>Movimientos</h2><span>${rows.length}</span></div>${html}</section>`;
}

function docsBlock(st){
  const docs=st.documents||[];
  if(!docs.length)return '';
  const LABEL={birth_certificate:'Acta de nacimiento',curp:'CURP',studies:'Constancia de estudios'};
  const faltan=docs.filter(d=>!d.received);
  if(!faltan.length)return '';
  const rows=faltan.map(d=>`<div class="fam-mov"><span><strong>${esc(LABEL[d.type]||String(d.type).replace(/_/g,' '))}</strong></span></div>`).join('');
  return `<section class="fam-card"><div class="fam-card-head"><h2>Documentos por entregar</h2><span>faltan ${faltan.length} de ${docs.length}</span></div>${rows}</section>`;
}

async function renderCuenta(){
  const p=currentPlayer();
  if(!p){$('famBody').innerHTML='<div class="fam-empty">Tu cuenta todavía no tiene un Tanner ligado. Avísale al club.</div>';return;}
  if(!state.statements[p.id]){
    $('famBody').innerHTML='<div class="fam-empty">Cargando tu estado de cuenta…</div>';
    try{state.statements[p.id]=await rpc('v2_portal_statement',{player_id:p.id});}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const st=state.statements[p.id];
  $('famBody').innerHTML=`${balanceBlock(st)}${monthsBlock(st)}${ledgerBlock(st)}${docsBlock(st)}`;
}

/* ---------- Calendario ---------- */
async function renderCalendario(){
  if(!state.calendar){
    $('famBody').innerHTML='<div class="fam-empty">Cargando calendario…</div>';
    const desde=new Date(),hasta=new Date();hasta.setDate(hasta.getDate()+60);
    try{state.calendar=await rpc('v2_portal_calendar',{from_at:desde.toISOString(),to_at:hasta.toISOString()});}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const rows=state.calendar||[];
  if(!rows.length){
    $('famBody').innerHTML='<div class="fam-empty">Todavía no hay actividades programadas. Aquí te avisamos en cuanto el club publique el calendario.</div>';
    return;
  }
  const html=rows.map(e=>{
    const d=new Date(e.starts_at);
    const dia=new Intl.DateTimeFormat('es-MX',{day:'numeric'}).format(d);
    const mes=new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','');
    const hora=new Intl.DateTimeFormat('es-MX',{hour:'numeric',minute:'2-digit'}).format(d);
    const detalle=[hora,e.location,e.category].filter(Boolean).join(' · ');
    return `<div class="fam-ev"><span class="fam-ev-day"><b>${esc(dia)}</b><span>${esc(mes)}</span></span><span class="fam-ev-body"><strong>${esc(e.title||'Actividad')}</strong><span>${esc(detalle)}</span></span></div>`;
  }).join('');
  $('famBody').innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Próximas actividades</h2><span>${rows.length}</span></div>${html}</section>`;
}

/* ---------- Tienda ---------- */
function cartTotal(){
  return Object.values(state.cart).reduce((sum,it)=>sum+Number(it.price||0)*Number(it.quantity||0),0);
}
function renderCartBar(){
  document.getElementById('famCart')?.remove();
  const items=Object.values(state.cart);
  if(!items.length||state.tab!=='tienda')return;
  const n=items.reduce((s,i)=>s+i.quantity,0);
  const bar=document.createElement('div');
  bar.id='famCart';bar.className='fam-cart';
  bar.innerHTML=`<span><strong>${money.format(cartTotal())}</strong><span>${n} artículo${n===1?'':'s'}</span></span><button id="famCheckout" type="button">Apartar</button>`;
  document.body.appendChild(bar);
  document.getElementById('famCheckout').addEventListener('click',checkout);
}
async function checkout(){
  const p=currentPlayer();
  if(!p){alert('Elige primero a tu Tanner.');return;}
  const items=Object.values(state.cart).map(i=>({product_id:i.id,quantity:i.quantity,size:i.size||null}));
  if(!items.length)return;
  const btn=document.getElementById('famCheckout');btn.disabled=true;btn.textContent='Enviando…';
  try{
    const res=await rpc('v2_portal_place_order',{player_id:p.id,items,notes:null});
    state.cart={};renderCartBar();
    $('famBody').insertAdjacentHTML('afterbegin',
      `<section class="fam-card"><div class="fam-card-head"><h2>Pedido apartado</h2><span>${esc(res.folio||'')}</span></div><div class="fam-mov"><span><strong>Lo tenemos registrado</strong><span>El club te confirma disponibilidad y forma de pago. Total ${money.format(Number(res.total||0))}.</span></span></div></section>`);
    document.querySelectorAll('.fam-prod button').forEach(b=>{b.dataset.in='0';b.textContent='Agregar';});
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){alert(friendly(error));btn.disabled=false;btn.textContent='Apartar';}
}
async function renderTienda(){
  if(!state.catalog){
    $('famBody').innerHTML='<div class="fam-empty">Cargando tienda…</div>';
    try{state.catalog=await rpc('v2_portal_catalog');}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const rows=state.catalog||[];
  if(!rows.length){$('famBody').innerHTML='<div class="fam-empty">Todavía no hay productos publicados.</div>';return;}
  const cards=rows.map(p=>{
    const tallas=Array.isArray(p.sizes)?p.sizes:[];
    const sel=tallas.length
      ? `<select data-size="${esc(p.id)}" aria-label="Talla">${tallas.map(s=>`<option>${esc(s)}</option>`).join('')}</select>`:'';
    const enCarrito=state.cart[p.id]?'1':'0';
    return `<article class="fam-prod"><strong>${esc(p.name)}</strong><span class="fam-price">${money.format(Number(p.price||0))}</span>${p.description?`<p>${esc(p.description)}</p>`:''}${sel}<button type="button" data-add="${esc(p.id)}" data-in="${enCarrito}">${enCarrito==='1'?'Quitar':'Agregar'}</button></article>`;
  }).join('');
  $('famBody').innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Tienda del club</h2><span>${rows.length} productos</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">Aparta lo que necesites y el club te confirma disponibilidad y forma de pago.</p></section><div class="fam-prods">${cards}</div>`;
  $('famBody').querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.add,prod=rows.find(x=>String(x.id)===String(id));
    if(!prod)return;
    if(state.cart[id]){delete state.cart[id];btn.dataset.in='0';btn.textContent='Agregar';}
    else{
      const size=$('famBody').querySelector(`[data-size="${CSS.escape(id)}"]`)?.value||null;
      state.cart[id]={id,price:prod.price,quantity:1,size};btn.dataset.in='1';btn.textContent='Quitar';
    }
    renderCartBar();
  }));
  renderCartBar();
}


/* ---------- Gafete de estacionamiento ---------- */
const PASS_STATE={
  requested:{t:'En revisión',d:'El club está revisando tu solicitud.',tone:'pendiente'},
  approved:{t:'Autorizado',d:'Pasa a recogerlo al club.',tone:'pendiente'},
  issued:{t:'Vigente',d:'Ya lo tienes contigo.',tone:'pagado'},
  rejected:{t:'No autorizado',d:'',tone:'vencido'},
  revoked:{t:'Cancelado',d:'',tone:'vencido'},
  lost:{t:'Reportado perdido',d:'',tone:'vencido'},
  expired:{t:'Vencido',d:'Ya puedes solicitar el de la nueva temporada.',tone:'vencido'}
};
async function renderGafete(){
  if(!state.parking){
    $('famBody').innerHTML='<div class="fam-empty">Cargando…</div>';
    try{state.parking=await rpc('v2_portal_parking');}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const {price,season,passes=[]}=state.parking;
  const vivos=passes.filter(p=>['requested','approved','issued'].includes(p.status));
  const cards=passes.map(p=>{
    const st=PASS_STATE[p.status]||{t:p.status,d:'',tone:''};
    const saldo=Number(p.balance||0);
    const detalle=[p.vehicle,p.player&&`de ${p.player}`,p.folio&&`folio ${p.folio}`]
      .filter(Boolean).join(' · ');
    const cobro=saldo>0?`<span class="fam-chip-val"><span>Por pagar</span><b>${money.format(saldo)}</b></span>`
      :p.status==='issued'||p.status==='approved'?'<span class="fam-chip-val"><span>Pago</span><b>Cubierto</b></span>':'';
    return `<article class="fam-card" style="margin-top:12px"><div class="fam-card-head"><h2>${esc(p.plate||'Sin placas')}</h2><span class="fam-pass-state" data-state="${st.tone}">${esc(st.t)}</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">${esc(detalle)}</p>${st.d?`<p class="fam-muted" style="margin:6px 0 0;font-size:12.5px">${esc(st.d)}</p>`:''}${p.close_reason?`<p class="fam-muted" style="margin:6px 0 0;font-size:12.5px">Motivo: ${esc(p.close_reason)}</p>`:''}<div class="fam-split">${cobro}<span class="fam-chip-val"><span>Temporada</span><b>${esc(String(p.season))}</b></span></div></article>`;
  }).join('');

  const form=`<article class="fam-card" style="margin-top:12px"><div class="fam-card-head"><h2>Solicitar un gafete</h2><span>${money.format(Number(price||0))}</span></div><p class="fam-muted" style="margin:0 0 12px;font-size:12.5px">Cada gafete cuesta ${money.format(Number(price||0))} por la temporada ${esc(String(season))} y se te carga a tu estado de cuenta. Un gafete por vehículo.</p><form id="gafeteForm" class="fam-pass-form"><label>Para<select id="gafetePlayer"></select></label><label>Placas<input id="gafetePlate" maxlength="15" placeholder="ABC-123-X" autocapitalize="characters" required></label><label>Vehículo <span class="fam-muted">(opcional)</span><input id="gafeteVehicle" maxlength="60" placeholder="Mazda 3 gris"></label><button id="gafeteSubmit" class="fam-btn" type="submit">Solicitar por ${money.format(Number(price||0))}</button><div id="gafeteMessage" class="fam-message hidden"></div></form></article>`;

  $('famBody').innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Estacionamiento</h2><span>${vivos.length} vigente${vivos.length===1?'':'s'}</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">Aquí solicitas y sigues tus gafetes. Puedes tener uno por cada vehículo.</p></section>${cards}${form}`;

  const sel=$('gafetePlayer');
  (state.home?.players||[]).forEach(p=>{
    const o=document.createElement('option');
    o.value=p.id;o.textContent=[p.first_name,p.last_name].filter(Boolean).join(' ');
    sel.appendChild(o);
  });
  if(state.playerId)sel.value=state.playerId;
  $('gafeteForm').addEventListener('submit',async e=>{
    e.preventDefault();msg('gafeteMessage');
    const btn=$('gafeteSubmit');btn.disabled=true;btn.textContent='Enviando…';
    try{
      await rpc('v2_portal_request_parking',{
        player_id:sel.value,plate:$('gafetePlate').value,vehicle:$('gafeteVehicle').value||null});
      state.parking=null;state.statements={};
      await renderGafete();
      msg('gafeteMessage','Listo, el club revisa tu solicitud.','success');
    }catch(error){
      msg('gafeteMessage',friendly(error));
      btn.disabled=false;btn.textContent=`Solicitar por ${money.format(Number(price||0))}`;
    }
  });
}

/* ---------- Marco ---------- */
async function renderTabs(){
  const players=state.home?.players||[];
  const box=$('playerTabs');
  box.classList.toggle('hidden',players.length<2);
  if(players.length<2){box.innerHTML='';return;}
  box.innerHTML=players.map(p=>{
    const debe=Number(p.balance||0)>0;
    return `<button class="fam-tab" role="tab" type="button" data-player="${esc(p.id)}" aria-selected="${String(p.id)===String(state.playerId)}"><span class="fam-tab-face">${p._photo?`<img src="${esc(p._photo)}" alt="">`:esc(initials(p))}</span>${esc(p.first_name||'Tanner')}${debe?'<span class="fam-tab-dot" aria-label="con saldo"></span>':''}</button>`;
  }).join('');
  box.querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>{
    state.playerId=b.dataset.player;renderTabs();paint();
  }));
}
function paint(){
  document.querySelectorAll('.fam-nav-item').forEach(b=>
    b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false'));
  document.getElementById('famCart')?.remove();
  if(state.tab==='calendario')renderCalendario();
  else if(state.tab==='tienda')renderTienda();
  else if(state.tab==='gafete')renderGafete();
  else renderCuenta();
}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){show('loginView');return;}
  const {data:{user}}=await supabase.auth.getUser();
  if(user?.app_metadata?.must_change_password){show('passwordView');return;}
  try{state.home=await rpc('v2_portal_home');}
  catch(error){
    // Una cuenta de staff que abre el portal por error no debe quedarse en blanco.
    show('loginView');msg('loginMessage',friendly(error));
    await supabase.auth.signOut().catch(()=>{});
    return;
  }
  show('appView');
  const org=state.home?.organization?.name;
  if(org)$('orgName').textContent=org;
  const players=state.home?.players||[];
  if(!state.playerId&&players.length)state.playerId=players[0].id;
  renderTabs();paint();
  // Las fotos entran después: el saldo es a lo que la familia vino.
  const conFoto=players.filter(p=>p.photo_thumb_path||p.photo_path);
  if(conFoto.length){
    await Promise.all(conFoto.map(async p=>{p._photo=await signPhoto(p);}));
    renderTabs();
  }
}

$('loginForm')?.addEventListener('submit',handleLogin);
$('passwordForm')?.addEventListener('submit',handlePassword);
$('signOut')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});
document.querySelectorAll('.fam-nav-item').forEach(b=>b.addEventListener('click',()=>{
  state.tab=b.dataset.tab;paint();
}));
await boot();
