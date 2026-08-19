import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const CLUB_KEY='1850TC1850';
const PHOTO_BUCKET='tanneros-prospect-photos';
const PRIVACY_NOTICE_VERSION='2026-08-19-v1';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
const path=location.pathname.replace(/\/+$/,'')||'/';
let publicContext=null;
let selectedPhotoFile=null;
let photoPreviewUrl=null;
let pendingProspectId=null;
let pendingPreparedPhoto=null;
let pendingUploadedPath=null;

const registrationCampaigns={
  '/registro/porteros':{
    code:'captacion_porteros_2026',
    registrationType:'goalkeeper',
    pageTitle:'Captación de Porteros',
    eyebrow:'CAPTACIÓN TANNERY CITY',
    heading:'Buscamos porteros',
    intro:'Llena los datos de tu hijo/a y el club te contactará para agendar su proceso de captación.'
  },
  '/registro/jugadores':{
    code:'captacion_jugadores_2026',
    registrationType:'player',
    pageTitle:'Captación de Jugadores',
    eyebrow:'CAPTACIÓN TANNERY CITY',
    heading:'Buscamos jugadores',
    intro:'Llena los datos de tu hijo/a y el club te contactará para agendar su proceso de captación.'
  }
};

function setTitle(t){$('pageTitle').textContent=t;document.title=`${t} · Tannery City`;}
function show(html){$('loading').classList.add('hidden');$('content').classList.remove('hidden');$('content').innerHTML=html;}
function msg(text,type='error'){const el=$('formMessage');if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
async function getPublicContext(){if(publicContext)return publicContext;publicContext=await rpc('v2_public_context',{club_key:CLUB_KEY});return publicContext;}
function acceptedAt(){return new Date().toISOString();}

function privacyBlock(prefix,{imageConsent=false}={}){
  return `<div class="privacy-box span-2">
    <details>
      <summary>Ver aviso de privacidad</summary>
      <p>Tannery City FC, domicilio Españita #1305, Col. Bugambilias, C.P. 37270, León, Guanajuato, usa los datos del menor y del tutor para su inscripción y control deportivo, administrativo y de cobranza; las fotografías, para control interno. El uso en redes, página web y publicidad es opcional. Puedes revocar tu consentimiento y ejercer tus derechos escribiendo a <strong>tannery.city.1850@gmail.com</strong>.</p>
    </details>
    <label class="check consent-line"><input id="${prefix}DataConsent" type="checkbox" required><span>Autorizo el tratamiento de los datos del menor para el control interno del club. <b>*</b></span></label>
    ${imageConsent?`<label class="check consent-line"><input id="${prefix}ImageConsent" type="checkbox"><span>Autorizo el uso de su imagen en redes, página web y publicidad del club. <small>(Opcional)</small></span></label>`:''}
    <div class="privacy-version">Aviso de privacidad ${PRIVACY_NOTICE_VERSION}</div>
  </div>`;
}

function photoField(){
  return `<div class="photo-field span-2">
    <div class="field-title">Foto del jugador <b>*</b></div>
    <div class="photo-row">
      <div id="photoPreview" class="photo-preview"><span>👤</span></div>
      <div class="photo-actions">
        <input id="photoCamera" class="hidden" type="file" accept="image/*" capture="environment">
        <input id="photoUpload" class="hidden" type="file" accept="image/*">
        <div class="photo-buttons"><button id="takePhoto" class="secondary" type="button">Tomar foto</button><button id="uploadPhoto" class="secondary" type="button">Subir foto</button><button id="removePhoto" class="ghost" type="button" disabled>Quitar</button></div>
        <small>Obligatoria. Nos permite reconocer a tu hijo/a el primer día. Se guarda solo en el club.</small>
      </div>
    </div>
  </div>`;
}

function wirePhotoField(){
  const camera=$('photoCamera'),upload=$('photoUpload');
  $('takePhoto').addEventListener('click',()=>camera.click());
  $('uploadPhoto').addEventListener('click',()=>upload.click());
  camera.addEventListener('change',()=>selectPhoto(camera.files?.[0]));
  upload.addEventListener('change',()=>selectPhoto(upload.files?.[0]));
  $('removePhoto').addEventListener('click',()=>selectPhoto(null));
}
function selectPhoto(file){
  selectedPhotoFile=file||null;
  pendingPreparedPhoto=null;pendingUploadedPath=null;
  const preview=$('photoPreview');
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null;}
  if(!file){preview.innerHTML='<span>👤</span>';preview.classList.remove('has-photo');$('removePhoto').disabled=true;return;}
  if(!String(file.type||'').startsWith('image/')){msg('Selecciona una imagen válida.');selectedPhotoFile=null;return;}
  photoPreviewUrl=URL.createObjectURL(file);
  preview.innerHTML=`<img src="${photoPreviewUrl}" alt="Foto seleccionada">`;
  preview.classList.add('has-photo');$('removePhoto').disabled=false;msg('');
}
function loadImage(file){return new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(u);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('No pudimos leer esa foto. Prueba con otra imagen.'))};img.src=u;});}
function canvasBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality));}
async function preparePhoto(file){
  if(!file)throw new Error('La foto del jugador es obligatoria.');
  const img=await loadImage(file);
  const maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,'image/webp',.82);let ext='webp';
  if(!blob){blob=await canvasBlob(canvas,'image/jpeg',.82);ext='jpg';}
  if(!blob)throw new Error('No pudimos preparar la foto. Prueba con otra imagen.');
  if(blob.size>5*1024*1024){blob=await canvasBlob(canvas,'image/jpeg',.68);ext='jpg';}
  if(!blob||blob.size>5*1024*1024)throw new Error('La foto es demasiado pesada. Prueba con una imagen más pequeña.');
  return {blob,ext,mime:blob.type||(`image/${ext==='jpg'?'jpeg':ext}`)};
}

function registrationForm(campaign){
  const eyebrow=campaign?.eyebrow||'ÚNETE A TANNERY CITY';
  const heading=campaign?.heading||'Inscripción Tanner';
  const intro=campaign?.intro||'Llena los datos de tu hijo/a y el club te contactará para agendar una clase muestra.';
  return `<div class="eyebrow">${eyebrow}</div><h2>${heading}</h2><p class="muted">${intro}</p>
    <form id="regForm" class="form-grid registration-form">
      ${photoField()}
      <label>Nombre del jugador *<input id="firstName" autocomplete="given-name" required></label>
      <label>Apellidos *<input id="lastName" autocomplete="family-name" required></label>
      <label>Fecha de nacimiento *<input id="birthDate" type="date" required></label>
      <label>Categoría de interés<select id="category"><option value="">Por definir</option><option>Baby Tanners</option><option>T6</option><option>T8</option><option>T10</option><option>T12</option></select></label>
      <label>¿A qué viene? *<select id="purpose" required><option value="">Elige una opción</option><option>Clase muestra</option><option>Visoría / captación</option><option>Inscripción a la academia</option><option>Información</option></select></label>
      <label>¿Con qué pierna patea? *<select id="dominantFoot" required><option value="">Elige una opción</option><option value="right">Derecha</option><option value="left">Izquierda</option><option value="both">Ambas</option></select></label>
      <label>Nombre del padre/madre/tutor *<input id="guardian" autocomplete="name" required></label>
      <label>Teléfono (WhatsApp) *<input id="phone" inputmode="tel" autocomplete="tel" placeholder="Ej. 4771234567" required></label>
      <label>Correo<input id="email" type="email" autocomplete="email"></label>
      <label>Escuela del niño/a *<input id="school" placeholder="Nombre de la escuela" required></label>
      <label>¿Cómo nos conociste? *<select id="source" required><option value="Redes sociales">Redes sociales</option><option value="Recomendación">Recomendación</option><option value="Evento">Evento</option><option value="Cancha">Cancha</option><option value="Escuela">Escuela</option><option value="Volante / QR">Volante / QR</option><option value="Otro">Otro</option></select></label>
      <label id="referralWrap" class="hidden">¿Quién te recomendó? *<input id="referralName" placeholder="Nombre de quien te recomendó"></label>
      <label class="span-2">Mensaje (opcional)<textarea id="publicMessage" rows="4" placeholder="Algo que debamos saber"></textarea></label>
      ${privacyBlock('reg',{imageConsent:true})}
      <div id="formMessage" class="message hidden span-2"></div>
      <button id="regSubmit" class="primary span-2" type="submit">Enviar inscripción</button>
    </form>`;
}

async function renderRegistro(campaign=null){
  setTitle(campaign?.pageTitle||'Inscripción Tanner');
  await getPublicContext();
  show(registrationForm(campaign));
  wirePhotoField();
  const source=$('source'),refWrap=$('referralWrap'),refInput=$('referralName');
  const toggleReferral=()=>{const on=source.value==='Recomendación';refWrap.classList.toggle('hidden',!on);refInput.required=on;if(!on)refInput.value='';};
  source.addEventListener('change',toggleReferral);toggleReferral();
  $('regForm').addEventListener('submit',async e=>{
    e.preventDefault();msg('');const btn=$('regSubmit');btn.disabled=true;
    try{
      if(!selectedPhotoFile&&!pendingPreparedPhoto)throw new Error('La foto del jugador es obligatoria.');
      if(!$('regDataConsent').checked)throw new Error('Necesitamos la autorización de tratamiento de datos para registrar al menor.');
      if(!pendingPreparedPhoto){btn.textContent='Preparando foto…';pendingPreparedPhoto=await preparePhoto(selectedPhotoFile);}
      if(!pendingProspectId){
        btn.textContent='Guardando registro…';
        pendingProspectId=await rpc('v2_public_register_enhanced',{
          club_key:CLUB_KEY,
          first_name:$('firstName').value.trim(),last_name:$('lastName').value.trim(),birth_date:$('birthDate').value,
          phone:$('phone').value.trim(),email:$('email').value.trim()||null,guardian_name:$('guardian').value.trim(),category_interest:$('category').value||null,
          source_campaign:campaign?.code||'registro_general_2026',source_channel:$('source').value,
          registration_type:campaign?.registrationType||'player',purpose:$('purpose').value,dominant_foot:$('dominantFoot').value,school_name:$('school').value.trim(),
          referral_name:$('referralName').value.trim()||null,public_message:$('publicMessage').value.trim()||null,
          privacy_notice_version:PRIVACY_NOTICE_VERSION,data_consent:true,image_consent:$('regImageConsent').checked
        });
      }
      if(!pendingUploadedPath){
        btn.textContent='Subiendo foto…';
        const ctx=await getPublicContext();
        pendingUploadedPath=`organizations/${ctx.organizationId}/prospects/${pendingProspectId}/profile.${pendingPreparedPhoto.ext}`;
        const {error}=await supabase.storage.from(PHOTO_BUCKET).upload(pendingUploadedPath,pendingPreparedPhoto.blob,{contentType:pendingPreparedPhoto.mime,cacheControl:'3600',upsert:false});
        if(error){pendingUploadedPath=null;throw error;}
      }
      btn.textContent='Finalizando…';
      await rpc('v2_public_attach_prospect_photo',{club_key:CLUB_KEY,prospect_id:pendingProspectId,photo_path:pendingUploadedPath});
      pendingProspectId=null;pendingPreparedPhoto=null;pendingUploadedPath=null;
      show(`<div class="success"><div class="success-mark">✓</div><h2>Registro recibido</h2><p>La información y la foto quedaron guardadas de forma segura. Administración de Tannery City se pondrá en contacto contigo.</p></div>`);
    }catch(err){
      const hasPending=Boolean(pendingProspectId);msg(hasPending?`Tus datos ya quedaron guardados. Falta completar la foto: ${err.message||'intenta nuevamente.'}`:(err.message||'No se pudo enviar el registro.'));
      btn.disabled=false;btn.textContent=hasPending?'Reintentar foto':'Enviar inscripción';
    }
  });
}

async function renderPedido(){
  setTitle('Pedido Tanner');
  const products=await rpc('v2_public_products',{club_key:CLUB_KEY});
  const options=(products||[]).map(p=>`<option value="${p.id}">${p.name} · ${money.format(Number(p.price||0))}</option>`).join('');
  show(`<div class="eyebrow">TIENDA TANNER</div><h2>Levanta tu pedido</h2><p class="muted">Selecciona el producto y deja tus datos. Administración te contactará para confirmar pago, talla y entrega.</p><form id="orderForm" class="form-grid"><label>Nombre del jugador / cliente<input id="customerName" required></label><label>Teléfono<input id="customerPhone" required></label><label>Correo<input id="customerEmail" type="email"></label><label>Producto<select id="product" required><option value="">Selecciona un producto</option>${options}</select></label><label>Cantidad<input id="qty" type="number" min="1" value="1" required></label><label>Talla / detalle<input id="notes" placeholder="Ej. talla 10"></label>${privacyBlock('order')}<div id="formMessage" class="message hidden span-2"></div><button class="primary span-2" type="submit">Confirmar pedido</button></form>`);
  $('orderForm').addEventListener('submit',async e=>{e.preventDefault();msg('');const btn=e.submitter;btn.disabled=true;try{const at=acceptedAt();const result=await rpc('v2_public_order_enhanced',{club_key:CLUB_KEY,customer_name:$('customerName').value.trim(),customer_phone:$('customerPhone').value.trim(),customer_email:$('customerEmail').value.trim()||null,items:[{product_id:$('product').value,quantity:Number($('qty').value||1)}],notes:$('notes').value.trim()||null,consent:{dataAccepted:true,privacyNoticeVersion:PRIVACY_NOTICE_VERSION,acceptedAt:at,source:'public-web'}});show(`<div class="success"><div class="success-mark">✓</div><h2>Pedido recibido</h2><p>Tu pedido fue registrado correctamente.</p>${result?.folio?`<div class="folio">${result.folio}</div>`:''}</div>`);}catch(err){msg(err.message||'No se pudo enviar el pedido.');btn.disabled=false;}});
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
  $('programFormWrap').innerHTML=`<div class="subcard"><h3>${p?.name||'Programa'}</h3><form id="programForm" class="form-grid"><label>Nombre<input id="pfFirst" required></label><label>Apellidos<input id="pfLast" required></label><label>Fecha de nacimiento<input id="pfBirth" type="date" required></label><label>Teléfono<input id="pfPhone" required></label><label>Correo<input id="pfEmail" type="email"></label>${privacyBlock('program',{imageConsent:true})}<div id="formMessage" class="message hidden span-2"></div><button class="primary span-2" type="submit">Enviar inscripción</button></form></div>`;
  $('programForm').addEventListener('submit',async e=>{e.preventDefault();msg('');const btn=e.submitter;btn.disabled=true;try{const at=acceptedAt();await rpc('v2_public_program_enroll',{club_key:CLUB_KEY,program_slug:slug,first_name:$('pfFirst').value.trim(),last_name:$('pfLast').value.trim(),phone:$('pfPhone').value.trim(),email:$('pfEmail').value.trim()||null,birth_date:$('pfBirth').value,consent:{dataAccepted:true,imageAccepted:$('programImageConsent').checked,privacyNoticeVersion:PRIVACY_NOTICE_VERSION,acceptedAt:at,source:'public-web'}});show(`<div class="success"><div class="success-mark">✓</div><h2>Inscripción recibida</h2><p>Gracias. Tu registro quedó guardado.</p></div>`);}catch(err){msg(err.message||'No se pudo enviar la inscripción.');btn.disabled=false;}});
}

try{
  if(path==='/registro'||registrationCampaigns[path])await renderRegistro(registrationCampaigns[path]||null);
  else if(path==='/pedido')await renderPedido();
  else if(path==='/programas')await renderProgramas();
  else show('<div class="empty-state"><h2>Ruta no disponible</h2></div>');
}catch(err){show(`<div class="empty-state"><h2>No pudimos cargar esta página</h2><p class="muted">${err.message||'Intenta nuevamente.'}</p></div>`);}
