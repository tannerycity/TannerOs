import {bootstrapProtectedShell,rpc,$,moduleAccess,setShellHealth} from '/v2/shell.js';
import {supabase} from '/v2/shell.js';
import {getSignedPhotoUrl} from '/v2/photo-cache.js';

// Mantenimiento de miniaturas.
//
// El contrato de egress (docs/MEDIA_EGRESS_ARCHITECTURE.md) dice que una lista
// sólo consume miniaturas y que sin miniatura van las iniciales. Las fotos
// cargadas antes de ese contrato no tienen una, así que sus Tanners
// desaparecieron de las listas. Esta pantalla las genera.
//
// Es la excepción deliberada a la regla 2: sí descarga los originales, porque
// es exactamente lo que hay que reducir, y sólo cuando una persona lo pide.
const boot=await bootstrapProtectedShell({active:'admin',title:'Miniaturas de fotos'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot,org=ctx.organization_id;
const puedeEscribir=moduleAccess(navigation,'admin',true);
const BUCKET='tanneros-private',LADO=260,MAX_BYTES=180*1024;
let pendientes=[];

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(texto='',tipo='error'){
  const el=$('thumbsMessage');el.textContent=texto;el.dataset.type=tipo;el.classList.toggle('hidden',!texto);
}
function anota(nombre,detalle,ok){
  $('thumbsLogPanel').classList.remove('hidden');
  const fila=document.createElement('div');fila.dataset.ok=ok?'1':'0';
  fila.innerHTML=`<span>${esc(nombre)}</span><b>${esc(detalle)}</b>`;
  $('thumbsLog').appendChild(fila);
}

function cargaImagen(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudo leer la imagen'));};
    img.src=url;
  });
}
const aBlob=(canvas,tipo,calidad)=>new Promise(r=>canvas.toBlob(r,tipo,calidad));
// Mismo tamaño y peso que genera el resto de la app, para que una miniatura
// vieja y una nueva se vean igual.
async function miniatura(img){
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  const escala=Math.min(1,LADO/Math.max(w,h));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*escala));canvas.height=Math.max(1,Math.round(h*escala));
  const cx=canvas.getContext('2d');
  if(!cx)throw new Error('El navegador no pudo preparar la miniatura');
  cx.drawImage(img,0,0,canvas.width,canvas.height);
  let blob=await aBlob(canvas,'image/webp',0.75),ext='webp';
  if(!blob){blob=await aBlob(canvas,'image/jpeg',0.75);ext='jpg';}
  if(blob&&blob.size>MAX_BYTES){blob=await aBlob(canvas,'image/jpeg',0.6);ext='jpg';}
  if(!blob)throw new Error('No se pudo comprimir la miniatura');
  return {blob,ext,mime:blob.type||(ext==='jpg'?'image/jpeg':'image/webp')};
}
const rutaThumb=(path,ext)=>`${String(path).replace(/\.[^./]+$/,'')}-thumb.${ext}`;

function pinta(jugadores){
  const conFoto=jugadores.filter(p=>p.photo_path);
  const conThumb=conFoto.filter(p=>p.photo_thumb_path);
  pendientes=conFoto.filter(p=>!p.photo_thumb_path);
  $('statConFoto').textContent=conFoto.length;
  $('statConThumb').textContent=conThumb.length;
  $('statFaltan').textContent=pendientes.length;
  $('statFaltan').closest('article').dataset.tone=pendientes.length?'warn':'ok';
  const btn=$('thumbsRun');
  if(!pendientes.length){
    $('thumbsHint').textContent='Todas las fotos del padrón ya tienen su miniatura. No hay nada que hacer aquí.';
    btn.disabled=true;btn.textContent='Todo al día';
    setShellHealth({state:'ok',label:'Fotos al día'});
    return;
  }
  $('thumbsHint').innerHTML=`Hay <b>${pendientes.length}</b> Tanners con foto que hoy se ven como iniciales en las listas. `+
    `Generar sus miniaturas descarga cada foto una sola vez; después las listas pesan unos <b>44 kB</b> por Tanner en vez de <b>2 MB</b>.`;
  btn.disabled=!puedeEscribir;
  btn.textContent=puedeEscribir?`Generar ${pendientes.length} miniatura${pendientes.length===1?'':'s'}`:'Sólo lectura';
  setShellHealth({state:'attention',label:`${pendientes.length} sin miniatura`});
}

async function procesa(){
  const btn=$('thumbsRun');btn.disabled=true;msg();
  $('thumbsLog').innerHTML='';
  const barra=$('thumbsBar'),fill=$('thumbsFill');
  barra.classList.remove('hidden');
  let listos=0,fallidos=0;
  const total=pendientes.length;
  for(let i=0;i<total;i++){
    const p=pendientes[i];
    const nombre=p.player_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Tanner';
    btn.textContent=`Procesando ${i+1} de ${total}…`;
    try{
      const bucket=p.photo_bucket||BUCKET;
      const url=await getSignedPhotoUrl(supabase,bucket,p.photo_path);
      if(!url)throw new Error('No se pudo firmar la foto');
      const respuesta=await fetch(url);
      if(!respuesta.ok)throw new Error(`No se pudo descargar (${respuesta.status})`);
      const mini=await miniatura(await cargaImagen(await respuesta.blob()));
      const destino=rutaThumb(p.photo_path,mini.ext);
      const {error}=await supabase.storage.from(bucket)
        .upload(destino,mini.blob,{contentType:mini.mime,cacheControl:'3600',upsert:true});
      if(error)throw error;
      await rpc('v2_set_player_photo',{organization_id:org,player_id:p.player_id||p.id,
        photo_path:p.photo_path,photo_thumb_path:destino});
      listos++;anota(nombre,`${Math.round(mini.blob.size/1024)} kB`,true);
    }catch(e){
      fallidos++;anota(nombre,e.message||'Falló',false);
    }
    fill.style.width=`${Math.round(((i+1)/total)*100)}%`;
  }
  if(fallidos)msg(`Listas ${listos} de ${total}. ${fallidos} no se pudieron: revisa el detalle y vuelve a intentar.`,'error');
  else msg(`Listas las ${listos} miniaturas. Las listas del club ya vuelven a mostrar sus fotos.`,'success');
  await carga();
}

async function carga(){
  try{
    const jugadores=await rpc('v2_players',{organization_id:org,status_filter:null})||[];
    pinta(jugadores);
  }catch(e){
    $('thumbsHint').textContent='No pudimos leer el padrón.';
    msg(e.message||'No se pudo cargar.');
  }
}

$('thumbsRun').addEventListener('click',procesa);
await carga();
