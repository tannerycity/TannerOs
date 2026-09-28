/* El registro entrega DOS documentos, y uno de ellos tiene candado.
 *
 * Lo que este humo protege no es que se vean bonitas: es que la tarjeta que la
 * familia va a subir a una historia de Instagram no lleve encima el folio, la
 * escuela ni la fecha de nacimiento de un menor, y que no se genere siquiera
 * si la familia no autorizó el uso de la imagen.
 *
 * Eso no se puede comprobar sin pintar la página: la decisión vive en el
 * canvas, y el candado en el flujo real del formulario.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ='/home/user/TannerOs';
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
         '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
  const f=path.join(RAIZ,p);if(!f.startsWith(RAIZ)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('no');return;}
  r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(4702,r));

const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const pg=await nav.newPage({viewport:{width:390,height:844}});
const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));
pg.on('console',m=>{const u=m.location()?.url||'';if(m.type()==='error'&&!/esm\.sh|favicon/.test(m.text()+u))errs.push('console: '+m.text());});
await pg.goto('http://127.0.0.1:4702/registro/',{waitUntil:'networkidle'});

let fallos=0,corridas=0;
const revisa=(nombre,ok,detalle)=>{corridas++;if(!ok){fallos++;console.error(` - ${nombre}${detalle?`\n   ${detalle}`:''}`);}};

const DATOS={
  firstName:'Mauricio', lastName:'Torres Avila', category:'Baby Tanner',
  folio:'TC-2026-00020', dateStr:'26 SEP 2026', birthDate:'2024-05-02',
  dominantFoot:'right', school:'Jardín Santa Fe'
};

/* ===== EL CANDADO ===== */
const sinPermiso=await pg.evaluate(async d=>{
  const {renderWelcomeCard}=await import('/welcome-card.js');
  try{ await renderWelcomeCard({...d,modo:'redes'}); return 'SE DIBUJO'; }
  catch(e){ return e.message; }
}, DATOS);
revisa('sin permiso de imagen, la tarjeta de redes NO se genera',
  /no autoriza/i.test(sinPermiso), sinPermiso);

const conPermisoFalso=await pg.evaluate(async d=>{
  const {renderWelcomeCard}=await import('/welcome-card.js');
  try{ await renderWelcomeCard({...d,imageConsent:false,modo:'redes'}); return 'SE DIBUJO'; }
  catch(e){ return 'bloqueado'; }
}, DATOS);
revisa('y un "no" explícito tampoco la genera', conPermisoFalso==='bloqueado', conPermisoFalso);

/* ===== QUE CADA DOCUMENTO LLEVE LO SUYO =====
 *
 * Se pregunta al dibujante QUE puso, no se miden rectangulos de pixeles: el
 * diseño se acomoda segun cuantos datos traiga el Tanner, y una prueba que
 * mira coordenadas fijas empieza a mentir en cuanto alguien mueve un renglon.
 */
const cred = await pg.evaluate(async d => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  return (await renderWelcomeCard(d)).dibujado;
}, DATOS);
const redes = await pg.evaluate(async d => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  return (await renderWelcomeCard({ ...d, imageConsent: true, modo: 'redes' })).dibujado;
}, DATOS);

// Edad, pie y escuela: los tres datos que el formulario capturaba y la ficha
// tiraba a la basura.
revisa('la credencial dibuja la franja con los datos del Tanner',
  cred.franja === 3, `renglones en la franja: ${cred.franja}`);
revisa('y trae su QR al expediente',
  typeof cred.qr === 'string' && cred.qr.includes('buscar=TC-2026-00020'), String(cred.qr));
revisa('con su letra chica de comprobante', cred.letraChica === true);
revisa('y su sello', cred.sello === true);

const sinExtras = await pg.evaluate(async d => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  const { dibujado } = await renderWelcomeCard({ firstName: d.firstName, lastName: d.lastName, category: d.category, folio: d.folio, dateStr: d.dateStr });
  return dibujado;
}, DATOS);
// Un renglon con una raya ocupa el mismo lugar que un dato y no sirve.
revisa('sin datos extra no se dibuja una franja vacía', sinExtras.franja === 0, String(sinExtras.franja));
revisa('pero el QR sigue ahí: el folio siempre existe', typeof sinExtras.qr === 'string');

/* ===== Y QUE LA DE REDES NO LLEVE LO QUE NO DEBE ===== */
// Un QR en una historia de Instagram llevaria a un extraño al expediente de
// un menor.
revisa('la tarjeta de redes NO lleva QR al expediente', redes.qr === null, String(redes.qr));
revisa('ni la franja con la escuela del niño', redes.franja === 0, String(redes.franja));
revisa('ni la letra chica de trámite', redes.letraChica === false);
revisa('ni el sello de "autenticado", que es lenguaje de comprobante', redes.sello === false);
// Y no es la misma tarjeta con menos: la foto manda.
revisa('en redes la foto ocupa todo el ancho, no es un recuadro de credencial',
  redes.foto.w > cred.foto.w * 2 && redes.foto.h > cred.foto.h * 2,
  `credencial ${cred.foto.w}x${cred.foto.h} · redes ${redes.foto.w}x${redes.foto.h}`);

/* ===== LA CREDENCIAL DE TEMPORADA =====
 *
 * Los datos son de un Tanner real del club, con su '20+1' de dorsal y su
 * 'Por definir' de posicion. Ahi es donde se ve si las reglas aguantan lo que
 * hay en la base, no lo que uno desearia que hubiera.
 */
const TANNER = {
  firstName:'Mikel', lastName:'Ramírez Soto', category:'Baby Tanner',
  code:'Tanner010', jerseyNumber:'5', position:'Mediocampista',
  birthDate:'2021-06-11', bloodType:'O+', school:'Colegio Léon',
  allergies:'Alergias a jarabe para gripa', modo:'tanner'
};
const tanner = await pg.evaluate(async d => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  return (await renderWelcomeCard(d)).dibujado;
}, TANNER);

// Cinco y no seis: este Tanner no tiene pie dominante capturado, como 38 de
// los 64 activos. El fixture es el registro real, no uno ideal.
revisa('la credencial del Tanner trae los cinco renglones que sí tiene',
  tanner.franja === 5, `renglones: ${tanner.franja}`);
// Lo que hace que esta credencial valga el dia que importa.
revisa('y el aviso médico, donde se ve',
  tanner.medico === 'Jarabe para gripa', String(tanner.medico));
revisa('con su QR al código del Tanner',
  typeof tanner.qr === 'string' && tanner.qr.includes('buscar=Tanner010'), String(tanner.qr));
// Se vio al renderizarla: el lema salia dos veces en la misma cara.
revisa('el lema del club NO se repite: ya está en el pie',
  tanner.bienvenida === false, String(tanner.bienvenida));

const tannerPelon = await pg.evaluate(async d => {
  const { renderWelcomeCard } = await import('/welcome-card.js');
  const { dibujado } = await renderWelcomeCard({
    firstName:'Luis Maximo', lastName:'Vargas Peña', category:'Baby Tanner',
    code:'Tanner050', jerseyNumber:'20+1', position:'Por definir',
    birthDate:'2022-02-03', modo:'tanner' });
  return dibujado;
}, TANNER);
// 20 de 64 Tanners tienen 'Por definir': un tercio de las credenciales
// llevaria un renglon que no dice nada.
revisa('"Por definir" no ocupa un renglón de la credencial',
  tannerPelon.franja === 2, `renglones: ${tannerPelon.franja}`);
revisa('y sin alergias capturadas no se dibuja un aviso vacío',
  tannerPelon.medico === null, String(tannerPelon.medico));

// Los tres documentos no se mezclan.
revisa('la del registro no lleva aviso médico: el prospecto no tiene expediente',
  cred.medico === null && redes.medico === null);

/* ===== El link que se pega ===== */
const meta=await pg.evaluate(()=>({
  titulo:document.querySelector('meta[property="og:title"]')?.content||null,
  imagen:document.querySelector('meta[property="og:image"]')?.content||null,
  tarjeta:document.querySelector('meta[name="twitter:card"]')?.content||null
}));
revisa('el registro se ve al pegarlo: trae título e imagen',
  !!meta.titulo && !!meta.imagen && meta.tarjeta==='summary_large_image', JSON.stringify(meta));
revisa('y la imagen del preview existe de verdad',
  (await pg.evaluate(async u=>{try{const r=await fetch(new URL(u).pathname);return r.ok;}catch{return false;}},meta.imagen)),
  meta.imagen);

revisa('sin errores de consola', errs.length===0, errs.join('\n   '));

await nav.close(); srv.close();
console.log(fallos
  ? `Credencial humo FAILED · ${fallos} de ${corridas}`
  : `Credencial humo OK · ${corridas} revisiones, incluidas la que impide que el folio llegue a Instagram y el aviso médico del Tanner`);
process.exit(fallos?1:0);
