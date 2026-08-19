import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const CLUB_KEY='1850TC1850';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
const path=location.pathname.replace(/\/+$/,'')||'/';

const registrationCampaigns={
  '/registro/porteros':{
    code:'captacion_porteros_2026',
    pageTitle:'Captación de Porteros',
    eyebrow:'CAPTACIÓN TANNERY CITY',
    heading:'Buscamos porteros',
    intro:'Registra al jugador para participar en nuestro proceso de captación de porteros. Administración se pondrá en contacto contigo.'
  },
  '/registro/jugadores':{
    code:'captacion_jugadores_2026',
    pageTitle:'Captación de Jugadores',
    eyebrow:'CAPTACIÓN TANNERY CITY',
    heading:'Buscamos jugadores',
    intro:'Registra al jugador para participar en nuestro proceso de captación. Administración se pondrá en contacto contigo.'
  }
};

function setTitle(t){$('pageTitle').textContent=t;document.title=`${t} · Tannery City`;}
function show(html){$('loading').classList.add('hidden');$('content').classList.remove('hidden');$('content').innerHTML=html;}
function msg(text,type='error'){const el=$('formMessage');if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function consent(){return `<label class="check"><input id="consent" type="checkbox" required><span>Autorizo el tratamiento de mis datos para fines administrativos y de contacto relacionados con Tannery City FC.</span></label>`;}

async function renderRegistro(campaign=null){
  setTitle(campaign?.pageTitle||'Inscripción');
  const eyebrow=campaign?.eyebrow||'ÚNETE A TANNERY CITY';
  const heading=campaign?.heading||'Registro de jugador';
  const intro=campaign?.intro||'Déjanos los datos del jugador y de su tutor. Administración se pondrá en contacto contigo.';
  show(`<div class="eyebrow">${eyebrow}</div><h2>${heading}</h2><p class="muted">${intro}</p><form id="regForm" class="form-grid"><label>Nombre<input id="firstName" required></label><label>Apellidos<input id="lastName" required></label><label>Fecha de nacimiento<input id="birthDate" type="date" required></label><label>Categoría de interés<select id="category"><option value="">Por definir</option><option>Baby Tanners</option><option>T6</option><option>T8</option><option>T10</option><option>T12</option></select></label><label>Nombre del tutor<input id="guardian" required></label><label>Teléfono<input id="phone" inputmode="tel" required></label><label>Correo<input id="email" type="email"></label><label>¿Cómo nos conociste?<select id="source"><option>Redes sociales</option><option>Recomendación</option><option>Evento</option><option>Cancha</option><option>Otro</option></select></label><div class="span-2">${consent()}</div><div id="formMessage" class="message hidden span-2"></div><button class="primary span-2" type="submit">Enviar registro</button></form>`);
  $('regForm').addEventListener('submit',async e=>{
    e.preventDefault();msg('');const btn=e.submitter;btn.disabled=true;
    try{
      const howHeard=$('source').value;
      await rpc('v2_public_register',{
        club_key:CLUB_KEY,
        first_name:$('firstName').value.trim(),
        last_name:$('lastName').value.trim(),
        birth_date:$('birthDate').value,
        phone:$('phone').value.trim(),
        email:$('email').value.trim()||null,
        guardian_name:$('guardian').value.trim(),
        category_interest:$('category').value||null,
        source_campaign:campaign?.code||howHeard,
        consent:{accepted:true,source:'public-web',campaign:campaign?.code||null,howHeard,at:new Date().toISOString()}
      });
      show(`<div class="success"><div class="success-mark">✓</div><h2>Registro recibido</h2><p>Gracias. Administración de Tannery City se pondrá en contacto contigo.</p></div>`);
    }catch(err){msg(err.message||'No se pudo enviar el registro.');btn.disabled=false;}
  });
}

async function renderPedido(){
  setTitle('Pedido Tanner');
  const products=await rpc('v2_public_products',{club_key:CLUB_KEY});
  const options=(products||[]).map(p=>`<option value="${p.id}">${p.name} · ${money.format(Number(p.price||0))}</option>`).join('');
  show(`<div class="eyebrow">TIENDA TANNER</div><h2>Levanta tu pedido</h2><p class="muted">Selecciona el producto y deja tus datos. Administración te contactará para confirmar pago, talla y entrega.</p><form id="orderForm" class="form-grid"><label>Nombre del jugador / cliente<input id="customerName" required></label><label>Teléfono<input id="customerPhone" required></label><label>Correo<input id="customerEmail" type="email"></label><label>Producto<select id="product" required><option value="">Selecciona un producto</option>${options}</select></label><label>Cantidad<input id="qty" type="number" min="1" value="1" required></label><label>Talla / detalle<input id="notes" placeholder="Ej. talla 10"></label><div class="span-2">${consent()}</div><div id="formMessage" class="message hidden span-2"></div><button class="primary span-2" type="submit">Confirmar pedido</button></form>`);
  $('orderForm').addEventListener('submit',async e=>{e.preventDefault();msg('');const btn=e.submitter;btn.disabled=true;try{const result=await rpc('v2_public_order',{club_key:CLUB_KEY,customer_name:$('customerName').value.trim(),customer_phone:$('customerPhone').value.trim(),customer_email:$('customerEmail').value.trim()||null,items:[{product_id:$('product').value,quantity:Number($('qty').value||1)}],notes:$('notes').value.trim()||null});show(`<div class="success"><div class="success-mark">✓</div><h2>Pedido recibido</h2><p>Tu pedido fue registrado correctamente.</p>${result?.folio?`<div class="folio">${result.folio}</div>`:''}</div>`);}catch(err){msg(err.message||'No se pudo enviar el pedido.');btn.disabled=false;}});
}

async function renderProgramas(){
  setTitle('Programas y Eventos');
  const programs=await rpc('v2_public_programs',{club_key:CLUB_KEY,program_slug:null});
  if(!programs?.length){show(`<div class="empty-state"><div class="eyebrow">PROGRAMAS</div><h2>No hay inscripciones abiertas</h2><p class="muted">Cuando publiquemos un curso, campamento o evento con registro abierto aparecerá aquí.</p></div>`);return;}
  const cards=programs.map(p=>`<article class="program-card"><div class="eyebrow">${p.type||'Programa'}</div><h3>${p.name}</h3><p>${p.description||''}</p><button class="secondary enroll" data-slug="${p.slug}">Inscribirme</button></article>`).join('');
  show(`<div class="eyebrow">PROGRAMAS</div><h2>Inscripciones abiertas</h2><div class="programs">${cards}</div><div id="programFormWrap"></div>`);
  document.querySelectorAll('.enroll').forEach(btn=>btn.addEventListener('click',()=>renderProgramForm(btn.dataset.slug,programs.find(p=>p.slug===btn.dataset.slug))));
}
function renderProgramForm(slug,p){
  $('programFormWrap').innerHTML=`<div class="subcard"><h3>${p?.name||'Programa'}</h3><form id="programForm" class="form-grid"><label>Nombre<input id="pfFirst" required></label><label>Apellidos<input id="pfLast" required></label><label>Fecha de nacimiento<input id="pfBirth" type="date" required></label><label>Teléfono<input id="pfPhone" required></label><label>Correo<input id="pfEmail" type="email"></label><div class="span-2">${consent()}</div><div id="formMessage" class="message hidden span-2"></div><button class="primary span-2" type="submit">Enviar inscripción</button></form></div>`;
  $('programForm').addEventListener('submit',async e=>{e.preventDefault();msg('');const btn=e.submitter;btn.disabled=true;try{await rpc('v2_public_program_enroll',{club_key:CLUB_KEY,program_slug:slug,first_name:$('pfFirst').value.trim(),last_name:$('pfLast').value.trim(),phone:$('pfPhone').value.trim(),email:$('pfEmail').value.trim()||null,birth_date:$('pfBirth').value,consent:{accepted:true,source:'public-web',at:new Date().toISOString()}});show(`<div class="success"><div class="success-mark">✓</div><h2>Inscripción recibida</h2><p>Gracias. Tu registro quedó guardado.</p></div>`);}catch(err){msg(err.message||'No se pudo enviar la inscripción.');btn.disabled=false;}});
}

try{
  if(path==='/registro'||registrationCampaigns[path])await renderRegistro(registrationCampaigns[path]||null);
  else if(path==='/pedido')await renderPedido();
  else if(path==='/programas')await renderProgramas();
  else show('<div class="empty-state"><h2>Ruta no disponible</h2></div>');
}catch(err){show(`<div class="empty-state"><h2>No pudimos cargar esta página</h2><p class="muted">${err.message||'Intenta nuevamente.'}</p></div>`);}
