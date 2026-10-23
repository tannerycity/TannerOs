/* ACTIVO TANNER CON FOTO DESDE EL ALTA (23/10/2026) en Chromium.
 *
 * Presidencia: "en los activos Tanner tenemos foto, que sea igual que las
 * otras, que se comprima". La foto sólo salía al editar un activo ya creado.
 * Se monta Patrocinios con un Supabase falso y se revisa:
 *   1. "Agregar activo" ya trae el campo de foto.
 *   2. La foto elegida se ve antes de guardar y no sube nada todavía.
 *   3. Al guardar se crea el activo y se suben la foto y su miniatura,
 *      comprimidas (JPEG/WebP, no el archivo original), con la ruta del activo.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/patrocinadores/') p = '/v2/patrocinadores/index.html'; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const FAKE = `
  window.__rpc=[];window.__subidas=[];
  export function createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u-mich'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:b=>({upload:async(p,blob,o)=>{window.__subidas.push({b,p,size:blob.size,type:o?.contentType});return{data:{path:p},error:null};},
      remove:async()=>({data:null,error:null}),createSignedUrls:async ps=>({data:ps.map(p=>({path:p,signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='})),error:null}),
      createSignedUrl:async()=>({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='},error:null})})},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia',is_owner:true}]);
      if(n==='v2_my_modules')return ok([{module_code:'sponsors',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_sponsor_admin')return ok({sponsors:[],agreements:[],assets:[],items:[],payments:[]});
      if(n==='v2_upsert_sponsor_asset_admin')return ok('a-nuevo');
      if(n==='v2_set_sponsor_asset_photo')return ok({id:'a-nuevo',photoBucket:'tanneros-private',photoPath:p.photo_path,photoThumbPath:p.thumb_path});
      return ok(null);}}}`;
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };

const pg = await nav.newPage({ viewport:{ width:390, height:860 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(/^https?:\/\/(?!127)/, r => r.abort());
await pg.route('**/v2/supabase-client.js', r => r.fulfill({ contentType:'text/javascript', body:FAKE }));
await pg.route('**/v2/branding-auto.js', r => r.fulfill({ contentType:'text/javascript', body:'' }));
await pg.goto(`${BASE}/patrocinadores/`, { waitUntil:'networkidle' });
await pg.waitForSelector('#view:not(.hidden)', { timeout:8000 });
await pg.evaluate(() => document.getElementById('newAssetButton').click());
await pg.waitForSelector('#assetModal:not(.hidden)', { timeout:4000 });
revisa('1. al agregar un activo ya se puede poner foto', await pg.isVisible('#assetPhotoSection') && await pg.isVisible('#assetPhotoAction'));

// Una foto "de celular": grande y pesada, para ver que se comprime.
const png = await pg.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
  const x = c.getContext('2d'); for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${i % 360},70%,50%)`; x.fillRect(Math.random() * 3000, Math.random() * 2000, 40, 40); }
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return Array.from(new Uint8Array(await b.arrayBuffer()));
});
await pg.setInputFiles('#assetPhotoInput', { name:'lona.png', mimeType:'image/png', buffer:Buffer.from(png) });
await pg.waitForTimeout(200);
revisa('2. la foto se ve antes de guardar', (await pg.$$('#assetPhotoBox img')).length === 1);
revisa('2. y todavía no se sube nada', (await pg.evaluate(() => window.__subidas.length)) === 0);

await pg.fill('#assetName', 'Lona en la cancha 1');
await pg.click('#saveAsset');
await pg.waitForFunction(() => window.__rpc.some(r => r.n === 'v2_set_sponsor_asset_photo'), null, { timeout:8000 }).catch(() => {});
const sub = await pg.evaluate(() => window.__subidas);
const alta = await pg.evaluate(() => window.__rpc.find(r => r.n === 'v2_upsert_sponsor_asset_admin')?.p);
const foto = await pg.evaluate(() => window.__rpc.find(r => r.n === 'v2_set_sponsor_asset_photo')?.p);
revisa('3. se crea el activo', alta?.name === 'Lona en la cancha 1' && alta?.asset_id === null, JSON.stringify(alta));
revisa('3. se suben foto y miniatura en la carpeta del activo', sub.length === 2 && sub.every(s => s.p.includes('/sponsors/assets/a-nuevo/')), JSON.stringify(sub));
revisa('3. comprimidas: no viaja el PNG original', sub.every(s => s.type !== 'image/png' && s.size < png.length), JSON.stringify(sub.map(s => [s.type, s.size])) + ' vs ' + png.length);
revisa('3. y la foto queda ligada al activo', foto?.asset_id === 'a-nuevo' && /-thumb\./.test(foto?.thumb_path || ''), JSON.stringify(foto));
await pg.waitForSelector('#assetModal', { state:'hidden', timeout:4000 }).catch(() => {});
revisa('3. la ventana se cierra al terminar', await pg.isHidden('#assetModal'), await pg.getAttribute('#assetModal', 'class') + ' · ' + await pg.textContent('#assetPhotoMessage'));
revisa('sin errores en la página', errs.length === 0, errs.join(' | '));

await nav.close(); srv.close();
if (fallos) { console.error(`Activo con foto humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Activo con foto humo OK · ${corridas} revisiones: foto desde el alta, comprimida y ligada al activo`);
