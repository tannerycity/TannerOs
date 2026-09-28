/* El mostrador: levantar un pedido con la familia enfrente.
 *
 * Lo que este humo protege es el atajo, no el formulario. Quien cobra en
 * Taquilla tiene a la gente esperando, y la familia que está enfrente casi
 * siempre es la de un Tanner que ya está en el sistema —con su tutor, su
 * teléfono, su nombre y su dorsal—. Teclear todo eso otra vez cuesta tiempo
 * y acaba con el mismo papá escrito de tres formas.
 *
 * Tres cosas se vigilan:
 *   1. Que elegir al Tanner BASTE: el pedido se crea sin teclear cliente y
 *      viaja con su player_id, para que entre a su estado de cuenta.
 *   2. Que el nombre y el dorsal del jersey salgan de su expediente. Es
 *      donde se cuela el error de dedo, y una playera mal estampada no se
 *      devuelve.
 *   3. Que el cliente externo siga pudiendo comprar: el club también le
 *      vende a un abuelo o a un patrocinador.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const RAIZ='/home/user/TannerOs';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
  const f=path.join(RAIZ,p);if(!f.startsWith(RAIZ)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('no');return;}
  r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(4696,r));
const TALLAS=["6","8","10","12","14","16","XS","S","M","L","XL","XXL"];
const CAT={products:[{id:'p1',name:'Jersey "Wet Blue" - Home Edition',category:'jersey',price:699,active:true,archived:false,sizes:TALLAS,photoPath:null}],bundles:[]};
const JUG=[{id:'t1',first_name:'Dario',last_name:'Montalvo Díaz',category:'T10',jersey_number:7,status:'active'},
           {id:'t2',first_name:'Erick',last_name:'García Medina',category:'T10',jersey_number:null,status:'active'},
           {id:'t3',first_name:'Baja',last_name:'Ejemplo',category:'T8',status:'withdrawn'}];
const stub=`
 export function createClient(){return{
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
  rpc:async(n,p={})=>{
    window.__rpc=window.__rpc||[];window.__rpc.push({n,p});
    if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia',is_owner:true}],error:null};
    if(n==='v2_my_modules')return{data:[{module_code:'commerce',enabled:true,can_read:true,can_write:true}],error:null};
    if(n==='v2_catalog')return{data:${JSON.stringify(CAT)},error:null};
    if(n==='v2_players')return{data:${JSON.stringify(JUG)},error:null};
    if(n==='v2_create_internal_order')return{data:{id:'o-1',folio:'PED-2026-00002',total:699},error:null};
    return {data:[],error:null};}};}`;
const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const pg=await nav.newPage({viewport:{width:390,height:844}});
const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));
pg.on('console',m=>{const u=m.location()?.url||'';if(m.type()==='error'&&!/esm\.sh|favicon/.test(m.text()+u))errs.push('console: '+m.text());});
await pg.route('**/v2/supabase-client.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stub}));
await pg.route('**/v2/branding-auto.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
await pg.route('**/v2/photo-cache.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'export async function getSignedPhotoUrls(){return {};}\nexport async function getSignedPhotoUrl(){return null;}\nexport async function getRawSignedPhotoUrl(){return null;}\nexport function clearPhotoCache(){}\nexport function forgetPhoto(){}'}));
await pg.goto('http://127.0.0.1:4696/v2/captura/',{waitUntil:'networkidle'});
await pg.waitForSelector('#capPlayer',{timeout:8000});
let fallos=0,corridas=0;
const revisa=(nombre,ok,detalle)=>{corridas++;if(!ok){fallos++;console.error(` - ${nombre}${detalle?`\n   ${detalle}`:''}`);}};

const ops=await pg.$$eval('#capPlayer option',n=>n.map(o=>o.textContent.trim()));
// Un Tanner dado de baja no se le vende como si siguiera en el club.
revisa('el padrón ofrece sólo Tanners activos',
  ops.length===3 && !ops.some(o=>/Baja/.test(o)), ops.join(' | '));
revisa('los datos a mano arrancan escondidos: el atajo es el camino normal',
  await pg.isHidden('#capManual'));
// Elegir Tanner
await pg.selectOption('#capPlayer','t1');
await pg.waitForTimeout(250);
const ficha=(await pg.textContent('#capPlayerCard')).replace(/\s+/g,' ').trim();
revisa('al elegir al Tanner se ve quién es, con categoría y dorsal',
  /Dario Montalvo Díaz/.test(ficha) && /T10/.test(ficha) && /#7/.test(ficha), ficha);
revisa('y dice que el pedido entra a su estado de cuenta',
  /estado de cuenta/.test(ficha), ficha);
// Abrir el jersey: debe prellenar nombre y dorsal
await pg.click('.pick-card-foto');
await pg.waitForSelector('#pfTallas:not(.hidden)',{timeout:6000});
// El detalle que evita la pérdida: lo que se estampa no se teclea.
revisa('el jersey se propone con el nombre del Tanner',
  (await pg.inputValue('#pfName'))==='Dario Montalvo Díaz', await pg.inputValue('#pfName'));
revisa('y con su dorsal', (await pg.inputValue('#pfNumber'))==='7', await pg.inputValue('#pfNumber'));
await pg.click('.talla-chip[data-talla="12"]');
await pg.click('#pfAdd');
await pg.waitForTimeout(250);
await pg.evaluate(()=>document.getElementById('backdrop').click());
// Crear el pedido SIN teclear cliente
await pg.click('#createOrder');
await pg.waitForTimeout(500);
const llamadas=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_create_internal_order'));
revisa('elegir al Tanner BASTA: el pedido se crea sin teclear cliente',
  llamadas.length===1 && !llamadas[0]?.p?.customer_name, JSON.stringify(llamadas[0]?.p));
revisa('y viaja con su player_id, para que entre a su estado de cuenta',
  llamadas[0]?.p?.player_id==='t1', JSON.stringify(llamadas[0]?.p?.player_id));
revisa('sale la confirmación con su folio',
  await pg.isVisible('#confirmView') && /PED-/.test(await pg.textContent('#confirmFolio')));
// Cliente externo
await pg.click('#confirmNew');
await pg.waitForTimeout(300);
await pg.click('#capExterno');
await pg.waitForTimeout(200);
// El club también le vende a quien no es del club.
revisa('el cliente externo puede capturarse a mano',
  await pg.isVisible('#capManual') && await pg.isHidden('#capPlayer'));
await pg.click('#createOrder');
await pg.waitForTimeout(300);
revisa('pero sin nombre no se crea, y lo dice',
  /Captura el nombre/.test(await pg.textContent('#createMessage')),
  await pg.textContent('#createMessage'));
const desborde=await pg.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
revisa('no hay scroll horizontal en iPhone',!desborde);

await nav.close();srv.close();
if(errs.length){console.error('Errores de consola:');errs.forEach(e=>console.error('  '+e));}
console.log(fallos||errs.length
  ? `Humo Mostrador FAILED · ${fallos} de ${corridas}, ${errs.length} errores`
  : `Humo Mostrador OK · ${corridas} revisiones en Chromium a 390px, 0 errores`);
process.exit(fallos||errs.length?1:0);
