/* EL BOTÓN DE LA FOTO DEL TANNER DECÍA MENTIRAS.
 *
 * 52 de los 62 Tanners activos tienen foto guardada. En todos, el botón de la
 * tarjeta decía "Agregar foto" — nunca "Cambiar foto"— y el club lo leía como
 * "no se guardó". La foto estaba ahí.
 *
 * La causa: setControls hacía querySelector('span') sobre un botón cuyo PRIMER
 * span es el ícono.
 *
 *   <button id="photoCardAction">
 *     <span class="tos-icon tos-icon-camera"></span>   <- se agarraba éste
 *     <span>Agregar foto</span>                        <- el que se lee
 *   </button>
 *
 * .tos-icon es una caja de 1.15em pintada con una máscara CSS, así que el
 * texto que se le metía adentro no se veía. El mismo error estaba en setBusy:
 * el "Guardando…" tampoco aparecía nunca, así que quien subía una foto no
 * tenía ninguna señal de que estuviera pasando algo.
 *
 * Esta prueba usa el MARKUP REAL, recortado de index.html en el momento de
 * correr. Si alguien reordena los spans del botón, truena aquí y no en el
 * teléfono de alguien.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';

/* El markup real, no una copia que se va a quedar vieja. */
const indexHtml = fs.readFileSync(path.join(RAIZ, 'v2/jugadores/index.html'), 'utf8');
const recorta = (desde, hasta) => {
  const i = indexHtml.indexOf(desde);
  if (i < 0) throw new Error(`No se encontró en index.html: ${desde}`);
  const j = indexHtml.indexOf(hasta, i);
  if (j < 0) throw new Error(`No se encontró el cierre de: ${desde}`);
  return indexHtml.slice(i, j + hasta.length);
};
const areaFoto = recorta('<div class="tanner-card__photo-area">', '</div>\n    </div>');
const editorFoto = recorta('<div id="photoEditor"', '</div>\n    </div>');

const PAGINA = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">
<link rel="stylesheet" href="/icons.css"><link rel="stylesheet" href="/v2/jugadores/styles.css">
</head><body>${areaFoto}${editorFoto}
<script type="module" src="/v2/jugadores/photos.js"></script></body></html>`;

const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/banco/') { r.writeHead(200, { 'content-type':'text/html' }); r.end(PAGINA); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4708, r));

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });

await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/brand/crest-navy.png'},error:null}),
                        createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:'/brand/crest-navy.png'})),error:null}),
                        upload:async()=>({error:null}),remove:async()=>({error:null})})},
    rpc:async()=>({data:null,error:null})};}` }));

await pg.goto('http://127.0.0.1:4708/banco/', { waitUntil:'networkidle' });

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

const abre = (player, canWrite = true) => pg.evaluate(d => {
  document.dispatchEvent(new CustomEvent('tanner-profile-opened', { detail: d }));
  const b = document.getElementById('photoCardAction');
  const icono = b.querySelector('.tos-icon');
  const texto = b.querySelector('span:not(.tos-icon)');
  return {
    // Lo que una persona LEE en el botón, no lo que dice un span cualquiera.
    loQueSeLee: texto?.textContent.trim(),
    // El ícono tiene que seguir siendo un ícono: si se le escribe texto
    // adentro, deja de serlo.
    iconoIntacto: icono?.textContent === '',
    botonVisible: !b.classList.contains('hidden'),
    editorVisible: !document.getElementById('photoEditor').classList.contains('hidden')
  };
}, { playerId:'t1', organizationId:'o1', canWrite, player });

/* ===== EL TANNER QUE SÍ TIENE FOTO ===== */
const conFoto = await abre({
  firstName:'Bruno', lastName:'Ezquerra Castellanos',
  photoPath:'organizations/o1/players/t1/profile-1790727516944.jpg',
  photoThumbPath:'organizations/o1/players/t1/profile-1790727516944-thumb.jpg',
  photoBucket:'tanneros-private'
});
// Éste es el bug que el club vio: 52 de 62 Tanners tienen foto y el botón
// decía "Agregar foto" en todos.
revisa('con foto guardada, el botón dice "Cambiar foto"',
  conFoto.loQueSeLee === 'Cambiar foto', `dice: "${conFoto.loQueSeLee}"`);
revisa('y el ícono de la cámara sigue siendo un ícono, no un renglón de texto',
  conFoto.iconoIntacto === true);

/* ===== EL QUE NO TIENE ===== */
const sinFoto = await abre({ firstName:'Luis', lastName:'Vargas Peña' });
revisa('sin foto, el botón dice "Agregar foto"',
  sinFoto.loQueSeLee === 'Agregar foto', `dice: "${sinFoto.loQueSeLee}"`);
revisa('el ícono sigue intacto también aquí', sinFoto.iconoIntacto === true);

/* ===== LA FOTO ANTERIOR, EN FORMATO VIEJO ===== */
const legacy = await abre({ firstName:'Ana', lastName:'Díaz', legacyPhotoData:'data:image/png;base64,AAAA' });
revisa('una foto en el formato viejo también cuenta como foto',
  legacy.loQueSeLee === 'Cambiar foto', `dice: "${legacy.loQueSeLee}"`);

/* ===== QUIEN NO PUEDE ESCRIBIR NO VE NADA DE ESTO ===== */
const soloLectura = await abre({ firstName:'Bruno', photoPath:'x.jpg' }, false);
revisa('un rol de sólo lectura no ve el botón de la tarjeta',
  soloLectura.botonVisible === false);
revisa('ni el editor de foto', soloLectura.editorVisible === false);

/* ===== HAY POR DÓNDE TOMAR LA FOTO CON LA CÁMARA ===== */
const entradas = await pg.evaluate(() => ({
  camara: document.getElementById('playerPhotoCamera')?.getAttribute('capture') || null,
  hayBotonCamara: !!document.getElementById('takePlayerPhoto'),
  hayBotonArchivo: !!document.getElementById('choosePlayerPhoto'),
  // El de la tarjeta abre el selector de archivos, que en iPhone ofrece
  // "Tomar foto" dentro de su propia hoja.
  aceptaImagenes: document.getElementById('playerPhotoUpload')?.getAttribute('accept')
}));
revisa('existe una entrada que abre la cámara directo',
  entradas.hayBotonCamara && entradas.camara !== null, JSON.stringify(entradas));
revisa('y otra para elegir un archivo', entradas.hayBotonArchivo);
revisa('el selector de la tarjeta acepta imágenes',
  entradas.aceptaImagenes === 'image/*', String(entradas.aceptaImagenes));

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));

await nav.close(); srv.close();
console.log(fallos
  ? `Ficha foto humo FAILED · ${fallos} de ${corridas}`
  : `Ficha foto humo OK · ${corridas} revisiones, incluida la etiqueta que se escribía dentro del ícono`);
process.exit(fallos ? 1 : 0);
