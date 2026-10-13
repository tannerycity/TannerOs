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
const RAIZ=path.resolve(new URL('..', import.meta.url).pathname);
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
  const f=path.join(RAIZ,p);if(!f.startsWith(RAIZ)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('no');return;}
  r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(4696,r));
const TALLAS=["6","8","10","12","14","16","XS","S","M","L","XL","XXL"];
const CAT={products:[{id:'p1',name:'Jersey "Wet Blue" - Home Edition',category:'jersey',price:699,active:true,archived:false,sizes:TALLAS,photoPath:null},
  {id:'p3',name:'Jersey "Pink Cantera" - Away Edition',category:'jersey',price:699,active:true,archived:false,sizes:TALLAS,photoPath:null}],
  // El Kit Training trae el mismo jersey: el mostrador ofrece convertirlo (13/10/2026).
  bundles:[{id:'b1',name:'Kit Training',active:true,archived:false,componentsResolved:true,priceAdult:1300,priceKid:1100,
    components:[{productId:'p1',name:'Jersey "Wet Blue" - Home Edition',qty:1},{productId:'p3',name:'Jersey "Pink Cantera" - Away Edition',qty:1},{productId:'p2',name:'Short Training',qty:1}]}]};
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
const nav=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
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
// Manga (13/10/2026): corta por omisión; aquí se pide larga.
revisa('el jersey ofrece manga, corta por omisión',
  (await pg.getAttribute('#pfManga [data-m="corta"]','aria-pressed'))==='true');
await pg.click('#pfManga [data-m="larga"]');
await pg.click('#pfAdd');
await pg.waitForTimeout(250);
if(process.env.SHOTS)await pg.screenshot({path:`${process.env.SHOTS}/mostrador2.png`});
await pg.evaluate(()=>document.getElementById('backdrop').click());
// ¿Lo conviertes en kit? Un jersey suelto lo pregunta.
const sug1=(await pg.textContent('.cart-sugiere').catch(()=>'')).replace(/\s+/g,' ');
revisa('el jersey suelto sugiere su kit con lo que incluye y cuánto más',
  /Kit Training/.test(sug1)&&/short training/.test(sug1)&&/\$1,100\.00/.test(sug1)&&/\$401\.00 más/.test(sug1),sug1);
// El segundo jersey del mismo kit, para la misma persona: es UN kit.
await pg.click('.pick-card-foto >> nth=1');
await pg.waitForSelector('#pfTallas:not(.hidden)',{timeout:6000});
await pg.click('.talla-chip[data-talla="12"]');
await pg.click('#pfAdd');
await pg.waitForTimeout(250);
await pg.evaluate(()=>document.getElementById('backdrop').click());
const sugs=await pg.$$eval('.cart-sugiere',xs=>xs.map(x=>x.textContent.replace(/\s+/g,' ')));
revisa('los dos jerseys se juntan en una sugerencia y dice cuánto se ahorra',
  sugs.length===1&&/Tus .*Wet Blue.* y .*Pink Cantera.* \+ short training = Kit Training/.test(sugs[0])&&/Te ahorras \$298\.00/.test(sugs[0]),JSON.stringify(sugs));
await pg.click('.cart-sugiere-btn');
await pg.waitForTimeout(200);
const tallasKit=await pg.$$eval('#bfPieces .bf-talla',xs=>xs.map(x=>x.value));
revisa('el kit abre con los dos jerseys y el short en talla 12, nombre y manga larga',
  JSON.stringify(tallasKit)==='["12","12","12"]'&&(await pg.inputValue('#bfName'))==='Dario Montalvo Díaz'&&(await pg.getAttribute('#bfManga [data-m="larga"]','aria-pressed'))==='true',JSON.stringify(tallasKit));
await pg.click('#bfAdd');
await pg.waitForTimeout(200);
await pg.evaluate(()=>document.getElementById('backdrop').click());
const renglones=await pg.$$eval('#cartList .cart-row span',xs=>xs.map(x=>x.textContent));
revisa('los dos jerseys sueltos se cambiaron por el kit',renglones.length===1&&/Kit Training \(Niño\)/.test(renglones[0])&&!(await pg.$('.cart-sugiere')),JSON.stringify(renglones));
// Crear el pedido SIN teclear cliente
await pg.click('#createOrder');
await pg.waitForTimeout(500);
const llamadas=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_create_internal_order'));
revisa('elegir al Tanner BASTA: el pedido se crea sin teclear cliente',
  llamadas.length===1 && !llamadas[0]?.p?.customer_name, JSON.stringify(llamadas[0]?.p));
revisa('el kit viaja con la manga larga',
  llamadas[0]?.p?.lines?.[0]?.kind==='bundle'&&llamadas[0]?.p?.lines?.[0]?.sleeve==='larga', JSON.stringify(llamadas[0]?.p?.lines));
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
