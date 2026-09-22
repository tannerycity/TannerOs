// Medición antes/después del Bloque A, en un navegador de verdad.
//
// NO forma parte de la verificación obligatoria: necesita `playwright-core` y
// un Chromium instalado, cosa que el repo no trae. Las tres verificaciones que
// sí son obligatorias (`qa-static`, `qa-image-encode`, `qa-photo-cache`) corren
// sin dependencias.
//
// Qué hace: levanta el repo en un servidor local, abre la misma foto sintética
// con el codificador VIEJO y con el NUEVO, cada uno con sus techos reales, y
// repite las dos corridas simulando un navegador SIN soporte WebP — que es
// donde está el defecto. Imprime el peso resultante de cada variante.
//
// Uso:  npm i playwright-core   &&   node scripts/qa-image-encode-browser.mjs
//
// El encoder viejo vive embebido aquí abajo a propósito: es la única forma de
// comparar contra un código que ya no existe en el árbol.

import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const PAGINA='<!doctype html><meta charset="utf-8"><title>medicion</title><body>listo</body>';
const VIEJO=`// El encoder TAL COMO ESTABA antes del bloque A (copiado de HEAD:v2/jugadores/photos.js)
function canvasBlob(canvas,type,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
export async function encodeVariant(img,maxSide,quality,maxBytes){
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
  return{blob,ext,mime:blob.type||(\`image/\${ext==='jpg'?'jpeg':ext}\`)};
}
`;
const s=http.createServer((q,r)=>{
  const u=decodeURIComponent(q.url.split('?')[0]);
  if(u==='/medicion/index.html'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(PAGINA);return;}
  if(u==='/medicion/viejo-encode.js'){r.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});r.end(VIEJO);return;}
  const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}
  r.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});fs.createReadStream(f).pipe(r);
});
await new Promise(r=>s.listen(4322,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// Los techos REALES de cada versión, no los del nuevo en ambas.
const AJUSTES={
  viejo:{url:'/medicion/viejo-encode.js',full:[1600,0.84,5*1024*1024],thumb:[260,0.75,180*1024]},
  nuevo:{url:'/v2/image-encode.js',   full:[1200,0.82,400*1024],  thumb:[260,0.75,40*1024]},
};
const filas=[];
for(const soportaWebp of [true,false]){
  for(const version of ['viejo','nuevo']){
    const c=await b.newContext();const p=await c.newPage();
    await p.addInitScript(sw=>{
      if(!sw){
        // Estándar HTML: ante un tipo no soportado se usa image/png y se IGNORA
        // la calidad. Así se comporta Safari sin WebP.
        const real=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(cb,type,q){
          if(type==='image/webp')return real.call(this,cb,'image/png');
          return real.call(this,cb,type,q);
        };
      }
    },soportaWebp);
    await p.goto('http://127.0.0.1:4322/medicion/index.html');
    const r=await p.evaluate(async cfg=>{
      const {encodeVariant}=await import(cfg.url);
      // Foto de celular sintética: fondo degradado (pasto/cielo), figuras y un
      // poco de grano. Se parece en compresibilidad a una foto real.
      const cv=document.createElement('canvas');cv.width=3024;cv.height=4032;
      const cx=cv.getContext('2d');
      const g=cx.createLinearGradient(0,0,0,cv.height);
      g.addColorStop(0,'#9fc7e8');g.addColorStop(.45,'#cfe0c2');g.addColorStop(1,'#3f6b34');
      cx.fillStyle=g;cx.fillRect(0,0,cv.width,cv.height);
      for(let i=0;i<180;i++){
        cx.fillStyle=`hsla(${(i*37)%360},55%,${35+(i%40)}%,.55)`;
        cx.beginPath();cx.arc(Math.random()*cv.width,Math.random()*cv.height,20+Math.random()*260,0,7);cx.fill();
      }
      const d=cx.getImageData(0,0,cv.width,cv.height);
      for(let i=0;i<d.data.length;i+=4){const n=(Math.random()*18-9)|0;
        d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}
      cx.putImageData(d,0,0);
      const bmp=new Image();
      await new Promise(res=>{bmp.onload=res;bmp.src=cv.toDataURL('image/jpeg',0.92);});
      const out={};
      for(const nombre of ['full','thumb']){
        const [lado,q,techo]=cfg[nombre];
        try{const v=await encodeVariant(bmp,lado,q,techo);
          out[nombre]={mime:v.mime,ext:v.ext,kb:Math.round(v.blob.size/1024)};
        }catch(e){out[nombre]={error:String(e.message||e)};}
      }
      return out;
    },{url:AJUSTES[version].url,full:AJUSTES[version].full,thumb:AJUSTES[version].thumb});
    filas.push({soportaWebp,version,...r});
    await c.close();
  }
}
await b.close();s.close();
const pinta=v=>v.error?`ERROR: ${v.error}`:`${v.mime.padEnd(10)} .${v.ext.padEnd(4)} ${String(v.kb).padStart(5)} kB`;
for(const f of filas){
  console.log(`\n${f.soportaWebp?'CON soporte WebP (Chrome, Safari 16+)':'SIN soporte WebP (Safari viejo — el de las mamás)'} · código ${f.version.toUpperCase()}`);
  console.log(`  grande: ${pinta(f.full)}`);
  console.log(`  mini  : ${pinta(f.thumb)}`);
}
const sum=f=>(f.full.kb||0)+(f.thumb.kb||0);
const sv=filas.find(f=>!f.soportaWebp&&f.version==='viejo'),sn=filas.find(f=>!f.soportaWebp&&f.version==='nuevo');
const cv2=filas.find(f=>f.soportaWebp&&f.version==='viejo'),cn=filas.find(f=>f.soportaWebp&&f.version==='nuevo');
console.log(`\nPor foto subida (grande+mini):`);
console.log(`  con WebP : ${sum(cv2)} kB -> ${sum(cn)} kB`);
console.log(`  sin WebP : ${sum(sv)} kB -> ${sum(sn)} kB  (${Math.round(100-sum(sn)*100/sum(sv))}% menos)`);
