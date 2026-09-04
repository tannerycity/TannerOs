import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);
const PHOTO_BUCKET='tanneros-private';
const MAX_BYTES=5*1024*1024;
const THUMB_MAX_SIDE=260;
const THUMB_MAX_BYTES=180*1024;
const $=id=>document.getElementById(id);
let active=null;
let busy=false;

function photoMsg(text='',type='error'){
  const box=$('photoMessage');
  if(!box)return;
  box.textContent=text;
  box.dataset.type=type;
  box.classList.toggle('hidden',!text);
}
function friendly(error){
  const message=String(error?.message||error||'No pudimos guardar la foto.');
  if(/row-level security|not authorized|permission denied/i.test(message))return'No tienes permiso para cambiar la foto de este Tanner.';
  if(/invalid photo path/i.test(message))return'La ruta de la foto no es válida. Vuelve a intentarlo.';
  if(/photo upload not found/i.test(message))return'La foto no terminó de subir. Vuelve a intentarlo.';
  if(/payload too large|maximum allowed size|too large/i.test(message))return'La foto es demasiado pesada. Prueba con otra imagen.';
  return message;
}
function hasPhoto(player){
  return Boolean(player?.photoPath||player?.legacyPhotoData);
}
function setControls(detail){
  const allowed=Boolean(detail?.canWrite);
  $('photoEditor')?.classList.toggle('hidden',!allowed);
  $('photoCardAction')?.classList.toggle('hidden',!allowed);
  const label=$('photoCardAction')?.querySelector('span');
  if(label)label.textContent=hasPhoto(detail?.player)?'Cambiar foto':'Agregar foto';
}
function setBusy(on,label=''){
  busy=on;
  ['photoCardAction','takePlayerPhoto','choosePlayerPhoto'].forEach(id=>{const el=$(id);if(el)el.disabled=on;});
  const cardLabel=$('photoCardAction')?.querySelector('span');
  if(cardLabel)cardLabel.textContent=on?(label||'Guardando…'):(hasPhoto(active?.player)?'Cambiar foto':'Agregar foto');
}
function drawPhoto(src,player){
  const box=$('photoBox');
  if(!box||!src)return;
  box.innerHTML='';
  const img=document.createElement('img');
  img.src=src;
  img.alt=`Foto de ${player?.firstName||'Tanner'}`;
  img.decoding='async';
  box.appendChild(img);
}
function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No pudimos leer esa foto. Prueba con JPG, PNG o WebP.'));};
    img.src=url;
  });
}
function canvasBlob(canvas,type,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
async function prepareVariant(img,maxSide,quality,maxBytes){
  const width=img.naturalWidth||img.width;
  const height=img.naturalHeight||img.height;
  const scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Tu navegador no pudo preparar la foto.');
  context.drawImage(img,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,'image/webp',quality);
  let ext='webp';
  if(!blob){
    blob=await canvasBlob(canvas,'image/jpeg',quality);
    ext='jpg';
  }
  if(blob&&blob.size>maxBytes){
    blob=await canvasBlob(canvas,'image/jpeg',Math.max(.5,quality-.16));
    ext='jpg';
  }
  if(!blob||blob.size>maxBytes)throw new Error('La foto es demasiado pesada. Prueba con una imagen más pequeña.');
  return{blob,ext,mime:blob.type||(`image/${ext==='jpg'?'jpeg':ext}`)};
}
async function preparePhoto(file){
  if(!file)throw new Error('Selecciona una foto.');
  if(file.type&&!String(file.type).startsWith('image/'))throw new Error('Selecciona una imagen válida.');
  const img=await loadImage(file);
  const width=img.naturalWidth||img.width;
  const height=img.naturalHeight||img.height;
  if(!width||!height)throw new Error('No pudimos leer el tamaño de esa foto.');
  // Foto completa para el perfil (hasta 1600px de lado) y una miniatura chica
  // aparte (hasta 260px) para la parrilla de la lista — así el roster no baja
  // el peso completo de cada foto solo para mostrar una tarjetita.
  const full=await prepareVariant(img,1600,.84,MAX_BYTES);
  const thumb=await prepareVariant(img,THUMB_MAX_SIDE,.75,THUMB_MAX_BYTES);
  return{full,thumb};
}
async function signedPhoto(player){
  if(!player?.photoPath)return null;
  const bucket=player.photoBucket||PHOTO_BUCKET;
  const {data,error}=await supabase.storage.from(bucket).createSignedUrl(player.photoPath,600);
  if(error)throw error;
  return data?.signedUrl||null;
}
async function uploadPhoto(file){
  if(busy||!active?.canWrite||!active?.playerId||!file)return;
  const snapshot={...active,player:{...active.player}};
  let uploadedPath=null;
  let uploadedThumbPath=null;
  let previewUrl=null;
  setBusy(true,'Preparando…');
  photoMsg('Preparando la foto…','success');
  try{
    previewUrl=URL.createObjectURL(file);
    drawPhoto(previewUrl,snapshot.player);
    const prepared=await preparePhoto(file);
    const stamp=Date.now();
    uploadedPath=`organizations/${snapshot.organizationId}/players/${snapshot.playerId}/profile-${stamp}.${prepared.full.ext}`;
    uploadedThumbPath=`organizations/${snapshot.organizationId}/players/${snapshot.playerId}/profile-${stamp}-thumb.${prepared.thumb.ext}`;
    setBusy(true,'Subiendo…');
    photoMsg('Subiendo la foto de forma segura…','success');
    const [{error:uploadError},{error:thumbUploadError}]=await Promise.all([
      supabase.storage.from(PHOTO_BUCKET).upload(uploadedPath,prepared.full.blob,{contentType:prepared.full.mime,cacheControl:'3600',upsert:false}),
      supabase.storage.from(PHOTO_BUCKET).upload(uploadedThumbPath,prepared.thumb.blob,{contentType:prepared.thumb.mime,cacheControl:'3600',upsert:false}),
    ]);
    if(uploadError||thumbUploadError){
      await Promise.all([
        supabase.storage.from(PHOTO_BUCKET).remove([uploadedPath]).catch(()=>{}),
        supabase.storage.from(PHOTO_BUCKET).remove([uploadedThumbPath]).catch(()=>{}),
      ]);
      throw uploadError||thumbUploadError;
    }
    const {data,error}=await supabase.rpc('v2_set_player_photo',{
      organization_id:snapshot.organizationId,
      player_id:snapshot.playerId,
      photo_path:uploadedPath,
      photo_thumb_path:uploadedThumbPath
    });
    if(error){
      await Promise.all([
        supabase.storage.from(PHOTO_BUCKET).remove([uploadedPath]).catch(()=>{}),
        supabase.storage.from(PHOTO_BUCKET).remove([uploadedThumbPath]).catch(()=>{}),
      ]);
      uploadedPath=null;
      uploadedThumbPath=null;
      throw error;
    }
    const saved=data?.player?data:{player:data};
    if(active?.playerId===snapshot.playerId){
      active.player=saved.player;
      const url=await signedPhoto(saved.player);
      if(url)drawPhoto(url,saved.player);
      setControls(active);
    }
    const expectedPrefix=`organizations/${snapshot.organizationId}/players/${snapshot.playerId}/`;
    const oldPath=snapshot.player?.photoPath;
    const oldBucket=snapshot.player?.photoBucket;
    if(oldBucket===PHOTO_BUCKET&&oldPath&&oldPath!==uploadedPath&&oldPath.startsWith(expectedPrefix)){
      await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    }
    const oldThumbPath=snapshot.player?.photoThumbPath;
    if(oldBucket===PHOTO_BUCKET&&oldThumbPath&&oldThumbPath!==uploadedThumbPath&&oldThumbPath.startsWith(expectedPrefix)){
      await supabase.storage.from(PHOTO_BUCKET).remove([oldThumbPath]);
    }
    document.dispatchEvent(new CustomEvent('tanner-photo-saved',{detail:{playerId:snapshot.playerId,player:saved.player}}));
    photoMsg('Foto actualizada correctamente.','success');
  }catch(error){
    if(active?.playerId===snapshot.playerId){
      try{
        const url=await signedPhoto(snapshot.player);
        if(url)drawPhoto(url,snapshot.player);
        else if(!hasPhoto(snapshot.player))$('photoBox').innerHTML='<span>Sin foto</span>';
      }catch{
        $('photoBox').innerHTML='<span>Foto protegida</span>';
      }
    }
    photoMsg(friendly(error));
  }finally{
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    setBusy(false);
  }
}

document.addEventListener('tanner-profile-opened',event=>{
  const detail=event.detail||{};
  active={
    playerId:detail.playerId,
    player:detail.player||{},
    organizationId:detail.organizationId,
    canWrite:Boolean(detail.canWrite)
  };
  photoMsg();
  setControls(active);
});
$('photoCardAction')?.addEventListener('click',()=>{if(!busy)$('playerPhotoUpload')?.click();});
$('takePlayerPhoto')?.addEventListener('click',()=>{if(!busy)$('playerPhotoCamera')?.click();});
$('choosePlayerPhoto')?.addEventListener('click',()=>{if(!busy)$('playerPhotoUpload')?.click();});
$('playerPhotoCamera')?.addEventListener('change',event=>{
  const input=event.currentTarget;
  uploadPhoto(input.files?.[0]).finally(()=>{input.value='';});
});
$('playerPhotoUpload')?.addEventListener('change',event=>{
  const input=event.currentTarget;
  uploadPhoto(input.files?.[0]).finally(()=>{input.value='';});
});
