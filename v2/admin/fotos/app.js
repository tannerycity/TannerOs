import {bootstrapProtectedShell,rpc,$,moduleAccess,setShellHealth} from '/v2/shell.js';
import {supabase} from '/v2/shell.js';
import { getRawSignedPhotoUrl, forgetPhoto } from '/v2/photo-cache.js';
import { rutaDeOriginal, rutaDeMiniatura, rutaValida, miniaturaValida } from '/v2/foto-rutas.js';
import {encodeVariant,THUMB_MAX_SIDE,THUMB_MAX_BYTES,FULL_MAX_SIDE,FULL_MAX_BYTES,UPLOAD_CACHE_CONTROL} from '/v2/image-encode.js';

// Mantenimiento de fotos del padrón.
//
// Dos cosas que antes eran dos herramientas y aquí son una sola pasada:
//
//   1. Generar la miniatura que falta. El contrato de egress
//      (docs/MEDIA_EGRESS_ARCHITECTURE.md) dice que una lista sólo consume
//      miniaturas; sin miniatura el Tanner sale con iniciales.
//   2. Reemplazar el original cuando es un PNG de 3 MB, la huella del defecto
//      que arregló el Bloque A. El archivo nuevo va a una ruta nueva y el
//      padrón apunta ahí; **el PNG viejo no se borra**, se reporta al final.
//
// Van juntas a propósito: cada foto se descarga UNA vez y sirve para las dos.
// Separarlas costaba descargar el padrón completo dos veces.
//
// Es la excepción deliberada a la regla 2 del contrato: sí descarga
// originales, porque es exactamente lo que hay que reducir, y sólo cuando una
// persona aprieta el botón sabiendo cuántos MB va a gastar.
const boot=await bootstrapProtectedShell({active:'admin',title:'Fotos del padrón'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot,org=ctx.organization_id;
const puedeEscribir=moduleAccess(navigation,'admin',true);
const BUCKET='tanneros-private';
const LOTE_POR_DEFECTO=10;
let pendientes=[],huerfanos=[],revisado=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kb=n=>`${Math.round(n/1024)} kB`;
const mb=n=>`${(n/1048576).toFixed(1)} MB`;
const carpetaDe=p=>String(p).slice(0,String(p).lastIndexOf('/'));
const nombreDe=p=>String(p).slice(String(p).lastIndexOf('/')+1);
const sinExtension=p=>String(p).replace(/\.[^./]+$/,'');

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
const nombreJugador=p=>p.player_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Tanner';

// --- Paso 1: revisar. Sólo metadata, ni un byte de imagen. -------------------
//
// `list()` devuelve el tipo real y el peso de cada objeto sin descargarlo, que
// es justo lo que hace falta para saber cuánto costaría el paso 2 ANTES de
// gastarlo. Sin esto habría que bajar las fotos para descubrir cuáles sobran.
async function metadataDe(jugadores){
  const carpetas=[...new Set(jugadores.map(p=>carpetaDe(p.photo_path)))];
  const porRuta=new Map();
  for(let i=0;i<carpetas.length;i+=8){
    const tanda=carpetas.slice(i,i+8);
    const respuestas=await Promise.all(tanda.map(c=>
      supabase.storage.from(BUCKET).list(c,{limit:100}).then(r=>[c,r]).catch(()=>[c,{data:null}])
    ));
    for(const [carpeta,{data}] of respuestas)
      for(const obj of data||[])
        porRuta.set(`${carpeta}/${obj.name}`,{
          tipo:obj.metadata?.mimetype||'',
          peso:Number(obj.metadata?.size)||0,
        });
  }
  return porRuta;
}

function clasifica(jugadores,meta){
  const conFoto=jugadores.filter(p=>p.photo_path);
  const lista=[];
  for(const p of conFoto){
    const info=meta.get(p.photo_path)||{tipo:'',peso:0};
    // Un PNG es la huella del defecto; un archivo por encima del techo nuevo
    // pesa de más aunque su tipo sea correcto.
    const originalPesado=info.tipo==='image/png'||info.peso>FULL_MAX_BYTES;
    const faltaMini=!p.photo_thumb_path;
    if(!originalPesado&&!faltaMini)continue;
    lista.push({...p,nombre:nombreJugador(p),peso:info.peso,tipo:info.tipo,originalPesado,faltaMini});
  }
  return {conFoto,lista};
}

function pinta(jugadores,meta){
  const {conFoto,lista}=clasifica(jugadores,meta);
  pendientes=lista;
  const sinMini=conFoto.filter(p=>!p.photo_thumb_path).length;
  const pesados=lista.filter(p=>p.originalPesado).length;
  const descarga=lista.reduce((s,p)=>s+p.peso,0);
  $('statConFoto').textContent=conFoto.length;
  $('statSinMini').textContent=sinMini;
  $('statPesadas').textContent=pesados;
  $('statSinMini').closest('article').dataset.tone=sinMini?'warn':'ok';
  $('statPesadas').closest('article').dataset.tone=pesados?'warn':'ok';
  const btn=$('thumbsRun'),lote=$('thumbsBatch'),loteCaja=$('thumbsBatch-wrap');
  if(!lista.length){
    $('thumbsHint').textContent='Todas las fotos del padrón tienen su miniatura y ninguna pesa de más. No hay nada que hacer aquí.';
    btn.disabled=true;btn.textContent='Todo al día';loteCaja.classList.add('hidden');
    setShellHealth({state:'ok',label:'Fotos al día'});
    return;
  }
  const partes=[];
  if(sinMini)partes.push(`<b>${sinMini}</b> se ${sinMini===1?'ve':'ven'} como iniciales en las listas`);
  if(pesados)partes.push(`<b>${pesados}</b> ${pesados===1?'guarda':'guardan'} un original más pesado de lo que debería`);
  $('thumbsHint').innerHTML=`${partes.join(' y ')}. Arreglarlas descarga cada foto <b>una sola vez</b>: `+
    `<b>${mb(descarga)}</b> en total si las haces todas de un jalón. Puedes hacerlo por lotes.`;
  loteCaja.classList.remove('hidden');
  lote.max=lista.length;
  if(!lote.value||Number(lote.value)>lista.length)lote.value=Math.min(LOTE_POR_DEFECTO,lista.length);
  actualizaBoton();
  setShellHealth({state:'attention',label:`${lista.length} fotos por arreglar`});
}

function actualizaBoton(){
  const btn=$('thumbsRun');
  if(!pendientes.length)return;
  const n=Math.max(1,Math.min(Number($('thumbsBatch').value)||1,pendientes.length));
  const costo=pendientes.slice(0,n).reduce((s,p)=>s+p.peso,0);
  btn.disabled=!puedeEscribir;
  btn.textContent=puedeEscribir?`Arreglar ${n} foto${n===1?'':'s'} · descarga ${mb(costo)}`:'Sólo lectura';
}

// --- Paso 2: procesar. Una descarga por foto, dos variantes. -----------------
async function procesa(){
  if(!pendientes.length)return;
  const btn=$('thumbsRun');btn.disabled=true;msg();
  $('thumbsLog').innerHTML='';huerfanos=[];
  $('thumbsHuerfanos').classList.add('hidden');
  const barra=$('thumbsBar'),fill=$('thumbsFill');
  barra.classList.remove('hidden');
  const total=Math.max(1,Math.min(Number($('thumbsBatch').value)||1,pendientes.length));
  const tanda=pendientes.slice(0,total);
  let listos=0,fallidos=0,bajados=0,subidos=0;
  for(let i=0;i<total;i++){
    const p=tanda[i];
    btn.textContent=`Procesando ${i+1} de ${total}…`;
    try{
      const bucket=p.photo_bucket||BUCKET;
      const url=await getRawSignedPhotoUrl(supabase,bucket,p.photo_path);
      if(!url)throw new Error('No se pudo firmar la foto');
      const respuesta=await fetch(url);
      if(!respuesta.ok)throw new Error(`No se pudo descargar (${respuesta.status})`);
      const original=await respuesta.blob();
      bajados+=original.size;
      // El caché de fotos no tiene por qué cargar con un original de 3 MB que
      // esta pantalla ya recodificó y nadie va a volver a mirar.
      forgetPhoto(bucket,p.photo_path);
      const img=await cargaImagen(original);
      const stamp=Date.now();
      const detalle=[];
      let rutaFoto=p.photo_path,rutaMini=p.photo_thumb_path;

      // El original sólo se reemplaza si de verdad sobra peso. Una foto que ya
      // es WebP y cabe en el techo se queda como está: recomprimirla sólo
      // perdería calidad.
      if(p.originalPesado){
        const grande=await encodeVariant(img,FULL_MAX_SIDE,0.82,FULL_MAX_BYTES);
        rutaFoto=rutaDeOriginal(p.photo_path,stamp,grande.ext);
        const {error}=await supabase.storage.from(bucket)
          .upload(rutaFoto,grande.blob,{contentType:grande.mime,cacheControl:UPLOAD_CACHE_CONTROL,upsert:false});
        if(error)throw error;
        subidos+=grande.blob.size;
        detalle.push(`original ${kb(original.size)} → ${kb(grande.blob.size)}`);
      }
      if(p.faltaMini||p.originalPesado){
        const mini=await encodeVariant(img,THUMB_MAX_SIDE,0.75,THUMB_MAX_BYTES);
        rutaMini=rutaDeMiniatura(rutaFoto,mini.ext);
        const {error}=await supabase.storage.from(bucket)
          .upload(rutaMini,mini.blob,{contentType:mini.mime,cacheControl:UPLOAD_CACHE_CONTROL,upsert:true});
        if(error)throw error;
        subidos+=mini.blob.size;
        detalle.push(`miniatura ${kb(mini.blob.size)}`);
      }

      // El padrón apunta a lo nuevo. Recién entonces el archivo viejo queda sin
      // uso — y se reporta, no se borra: borrar no es de esta herramienta.
      const idJugador=p.player_id||p.id;
      // La base valida el nombre y rechaza con "Invalid photo path". Se
      // comprueba aqui para que el aviso diga cual ruta y por que.
      if(!rutaValida(rutaFoto,org,idJugador))
        throw new Error(`La ruta del original no cumple el formato que pide el padrón: ${rutaFoto}`);
      if(rutaMini&&!miniaturaValida(rutaMini,org,idJugador))
        throw new Error(`La ruta de la miniatura no cumple el formato que pide el padrón: ${rutaMini}`);
      await rpc('v2_set_player_photo',{organization_id:org,player_id:idJugador,
        photo_path:rutaFoto,photo_thumb_path:rutaMini});
      if(rutaFoto!==p.photo_path)huerfanos.push(p.photo_path);
      if(p.photo_thumb_path&&rutaMini!==p.photo_thumb_path)huerfanos.push(p.photo_thumb_path);
      listos++;anota(p.nombre,detalle.join(' · ')||'sin cambios',true);
    }catch(e){
      fallidos++;anota(p.nombre,e.message||'Falló',false);
    }
    fill.style.width=`${Math.round(((i+1)/total)*100)}%`;
  }
  const resumen=`Descargados ${mb(bajados)}, subidos ${mb(subidos)}.`;
  if(fallidos)msg(`Listas ${listos} de ${total}. ${fallidos} no se pudieron: revisa el detalle y vuelve a intentar. ${resumen}`,'error');
  else msg(`Listas las ${listos} fotos. ${resumen}`,'success');
  pintaHuerfanos();
  await carga();
}

// Los archivos que quedaron sin uso se listan para que alguien decida qué hacer
// con ellos. Esta pantalla nunca borra nada de Storage.
function pintaHuerfanos(){
  const panel=$('thumbsHuerfanos');
  if(!huerfanos.length){panel.classList.add('hidden');return;}
  $('thumbsHuerfanosCount').textContent=huerfanos.length;
  $('thumbsHuerfanosList').value=huerfanos.join('\n');
  panel.classList.remove('hidden');
}

// `limpiar` en false es la revisión que corre sola al terminar de procesar: ahí
// el aviso del resultado tiene que sobrevivir, no borrarse solo.
async function revisa(limpiar=true){
  const btn=$('thumbsCheck');btn.disabled=true;btn.textContent='Revisando…';
  if(limpiar)msg();
  try{
    const jugadores=await rpc('v2_players',{organization_id:org,status_filter:null})||[];
    const conFoto=jugadores.filter(p=>p.photo_path);
    const meta=conFoto.length?await metadataDe(conFoto):new Map();
    revisado=true;
    pinta(jugadores,meta);
  }catch(e){
    $('thumbsHint').textContent='No pudimos revisar el padrón.';
    msg(e.message||'No se pudo revisar.');
  }finally{
    btn.disabled=false;btn.textContent='Volver a revisar';
  }
}

async function carga(){
  if(revisado)await revisa(false);
}

$('thumbsCheck').addEventListener('click',()=>revisa());
$('thumbsRun').addEventListener('click',procesa);
$('thumbsBatch').addEventListener('input',actualizaBoton);
