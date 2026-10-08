/* ESTACIONAMIENTO EN TRES TOQUES.
 *
 * Pedido así (05/10/2026): "estilo Apple, como si fuera una app interna de
 * estacionamiento, fácil para alguien que no sabe de tecnología… que en 3
 * clicks puedas agregar / cobrar / dar un gafete". Lo usan todos los de
 * administración, en iPad y en teléfono. Regla: primero se paga y luego se
 * entrega; sin costo sólo con motivo (patrocinio, staff…).
 *
 * Esta prueba levanta la pantalla REAL y revisa:
 *   · que dar un gafete nuevo a la familia de un Tanner sean 3 toques
 *     (Nuevo gafete → elegir Tanner → Cobrar y entregar) y viaje en UN solo
 *     movimiento (v2_parking_express) con método, quién cobró y llave;
 *   · que al terminar se vea el folio en grande;
 *   · que "Sin costo" no deje entregar sin motivo;
 *   · que la solicitud del portal se cobre y entregue en 2 toques;
 *   · que la caseta diga de un vistazo si una placa tiene gafete o no;
 *   · que la lista enseñe el NOMBRE del portador (antes decía "Tanner");
 *   · que en teléfono no haya scroll horizontal y en iPad la hoja flote al
 *     centro.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4741, r));

const HOY = new Date().toISOString();
const PASES = [
  { id:'g1', folio:'TC001', status:'issued', season:2026, plate:'GTO-123-A', vehicle:'CR-V gris', holder:'Matías Campos Rizo',
    holder_kind:'familia', pass_type:'tanner', is_courtesy:false, player_id:'p1', category:'T10', guardian:'Julio Campos', balance:0, issued_at:HOY },
  { id:'g2', folio:null, status:'requested', season:2026, plate:'JAL-555-B', vehicle:null, holder:'Dario Montalvo Díaz',
    holder_kind:'familia', pass_type:'tanner', is_courtesy:false, player_id:'p2', category:'T10', guardian:'Alejandro Montalvo', balance:0 },
  { id:'g3', folio:'TC002', status:'revoked', season:2026, plate:'QRO-900-C', holder:'Staff QA', holder_kind:'staff',
    pass_type:'tanner', is_courtesy:true, courtesy_reason:'Staff', balance:0 }
];

const shell = `
  window.__rpc = [];
  export const supabase = {};
  export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
  export const $ = id => document.getElementById(id);
  export async function rpc(name, params={}){
    window.__rpc.push({name, params});
    if(name==='v2_parking_passes') return { season:2026, price:200, prices:{tanner:200,vip:200},
      summary:{requested:1,approved:0,issued:1,cortesias:0,cortesia_valor:0,por_cobrar:0}, passes:${JSON.stringify(PASES)} };
    if(name==='v2_players') return [{id:'p1',first_name:'Matías',last_name:'Campos Rizo',category:'T10'},
                                    {id:'p7',first_name:'Gisele',last_name:'Sanchez Velazquez',category:'Mini Baby Tanner'}];
    if(name==='v2_parking_express') return { ok:true, pass_id:'nuevo', folio:'TC007', courtesy:!!params.courtesy,
      paid: params.courtesy ? 0 : 200, method: params.courtesy ? null : params.method };
    return null;
  }
  export function moduleAccess(rows, code, write=false){ return code==='estacionamiento'; }
  export function setShellHealth(){}
  export async function bootstrapProtectedShell(){
    document.getElementById('sidebarName').textContent='Zul';
    return { ctx:{ organization_id:'o1', role:'Operaciones' }, navigation:[] };
  }
`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(viewport = { width:390, height:844 }) {
  const pg = await nav.newPage({ viewport, hasTouch:true, isMobile:viewport.width < 600 });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await pg.route('**/v2/shell.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:shell }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await pg.goto('http://127.0.0.1:4741/v2/estacionamiento/', { waitUntil:'networkidle' });
  await pg.waitForTimeout(300);
  let toques = 0;
  const toca = async sel => { toques++; await pg.click(sel); await pg.waitForTimeout(120); };
  return { pg, errs, toca, toques:() => toques };
}
const llamada = (pg, n) => pg.evaluate(n => window.__rpc.filter(c => c.name === n).map(c => c.params), n);

/* ===== FAMILIA DE UN TANNER, EN EL TELÉFONO: 3 TOQUES ===== */
{
  const { pg, errs, toca, toques } = await abre();
  revisa('abre en la Caseta', await pg.isVisible('#pkBusca') && await pg.isVisible('#pkNuevo'));
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  revisa('en teléfono no hay scroll horizontal', ancho <= 0, `sobran ${ancho}px`);
  const pend = await pg.$$eval('.pk-card', e => e.map(x => x.innerText));
  revisa('la Caseta enseña lo pendiente con el nombre del portador', pend.some(t => /Dario Montalvo/.test(t)), JSON.stringify(pend));
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png','-caseta.png') });

  await toca('#pkNuevo');                                    // 1
  revisa('la hoja sube', await pg.isVisible('#pkSheet'));
  const antes = await pg.textContent('#pkPay');
  revisa('el botón dice qué falta en lugar de fallar', /Elige al Tanner/.test(antes), antes);
  await pg.fill('#pkTannerBusca', 'gise');
  await toca('[data-tanner="p7"]');                          // 2
  revisa('elegido el Tanner, el cursor va a las placas', await pg.evaluate(() => document.activeElement?.id) === 'pkPlaca');
  await pg.fill('#pkPlaca', 'gto-777-z');
  const listo = await pg.textContent('#pkPay');
  revisa('Efectivo viene elegido y el botón dice cuánto', /Cobrar \$200(\.00)? y entregar/.test(listo), listo);
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png','-hoja.png') });
  await toca('#pkPay');                                      // 3
  await pg.waitForTimeout(250);
  revisa('dar el gafete fueron 3 toques', toques() === 3, `fueron ${toques()}`);
  const env = await llamada(pg, 'v2_parking_express');
  const p = env[0] || {};
  revisa('viaja en UN solo movimiento', env.length === 1, JSON.stringify(env));
  revisa('para el Tanner elegido, como familia', p.player_id === 'p7' && p.holder_kind === 'familia', JSON.stringify(p));
  revisa('con las placas en mayúsculas', p.plate === 'GTO-777-Z', p.plate);
  revisa('cobrado en efectivo, no cortesía', p.method === 'cash' && p.courtesy === false, JSON.stringify(p));
  revisa('con quién cobró', p.collected_by_name === 'Zul', p.collected_by_name);
  revisa('y una llave para no cobrar dos veces', String(p.idempotency_key || '').length >= 8, p.idempotency_key);
  const fin = await pg.textContent('#pkSheetBody');
  revisa('al terminar se ve el folio en grande', /TC007/.test(fin) && /Entrega el gafete/.test(fin), fin);
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png','-folio.png') });
  await pg.click('#pkListo');
  revisa('"Listo" cierra la hoja', !(await pg.isVisible('#pkSheet')));
  revisa('sin errores de consola (teléfono)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== SIN COSTO SÓLO CON MOTIVO; PERSONA QUE NO ES TANNER ===== */
{
  const { pg } = await abre();
  await pg.click('#pkNuevo');
  await pg.click('[data-quien="otro"]');
  await pg.click('[data-kind="sponsor"]');
  await pg.fill('#pkNombre', 'Llantas del Bajío');
  await pg.fill('#pkPlaca', 'GTO-100-P');
  await pg.click('[data-pago="free"]');
  revisa('"Sin costo" no deja entregar sin motivo', await pg.isDisabled('#pkPay'), await pg.textContent('#pkPay'));
  await pg.click('[data-motivo="Patrocinio"]');
  revisa('con motivo, ya deja', !(await pg.isDisabled('#pkPay')) && /Entregar gafete/.test(await pg.textContent('#pkPay')));
  await pg.click('#pkPay'); await pg.waitForTimeout(250);
  const p = (await llamada(pg, 'v2_parking_express'))[0] || {};
  revisa('el patrocinio viaja como cortesía con su motivo y sin método',
    p.courtesy === true && p.courtesy_reason === 'Patrocinio' && p.method === null && p.holder_kind === 'sponsor'
    && p.holder_name === 'Llantas del Bajío' && p.player_id === null, JSON.stringify(p));
  await pg.close();
}

/* ===== SOLICITUD DEL PORTAL: 2 TOQUES ===== */
{
  const { pg, toca, toques } = await abre();
  await toca('.pk-card [data-cobrar="g2"]');
  revisa('la hoja trae al portador y no pide placas', /Dario Montalvo/.test(await pg.textContent('#pkSheetBody')) && !(await pg.$('#pkPlaca')));
  await pg.click('[data-pago="transfer"]');
  await toca('#pkPay'); await pg.waitForTimeout(200);
  revisa('cobrar y entregar una solicitud fueron 2 toques (más el método)', toques() === 2, `fueron ${toques()}`);
  const p = (await llamada(pg, 'v2_parking_express'))[0] || {};
  revisa('usa la solicitud que ya existe', p.pass_id === 'g2' && p.plate === null && p.method === 'transfer', JSON.stringify(p));
  await pg.close();
}

/* ===== LA CASETA CHECA UNA PLACA ===== */
{
  const { pg } = await abre();
  await pg.fill('#pkBusca', 'gto123'); await pg.waitForTimeout(150);
  const hit = await pg.$$eval('.pk-card', e => e.map(x => ({ t:x.innerText, tono:x.dataset.tone })));
  revisa('una placa con gafete sale en verde, sin importar guiones', hit[0]?.tono === 'ok' && /Vigente/.test(hit[0]?.t), JSON.stringify(hit));
  await pg.fill('#pkBusca', 'zzz-999-x'); await pg.waitForTimeout(150);
  const no = await pg.textContent('.pk-nohit').catch(() => '');
  revisa('una placa sin gafete lo dice claro y ofrece darle uno', /no tiene gafete/.test(no) && /Darle gafete/.test(no), no);
  await pg.click('[data-nuevo-placa]');
  revisa('"Darle gafete" abre la hoja con esa placa ya escrita', await pg.inputValue('#pkPlaca') === 'ZZZ-999-X');
  await pg.close();
}

/* ===== PADRÓN: NOMBRES Y FILTROS ===== */
{
  const { pg } = await abre();
  await pg.click('[data-tab="padron"]');
  const filas = await pg.$$eval('.pk-card', e => e.map(x => x.innerText));
  revisa('el padrón enseña el nombre de quien porta el gafete', filas.some(t => /Matías Campos Rizo/.test(t)), JSON.stringify(filas));
  revisa('"Vigentes" no enseña los cancelados', !filas.some(t => /QRO-900-C/.test(t)), JSON.stringify(filas));
  await pg.click('[data-f="cancelados"]');
  revisa('"Cancelados" sí', (await pg.$$eval('.pk-card', e => e.map(x => x.innerText))).some(t => /QRO-900-C/.test(t)));
  await pg.close();
}

/* ===== iPAD ===== */
{
  const { pg, errs } = await abre({ width:1024, height:1366 });
  const cols = await pg.evaluate(() => getComputedStyle(document.querySelector('.pk-caseta')).gridTemplateColumns.split(' ').length);
  revisa('en iPad la caseta va a dos columnas', cols === 2, String(cols));
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png','-ipad-caseta.png') });
  await pg.click('#pkNuevo');
  const caja = await pg.$eval('#pkSheet', e => { const r = e.getBoundingClientRect(); return { x:r.x, w:r.width, top:r.top }; });
  revisa('en iPad la hoja flota al centro', caja.w <= 560 && Math.abs(caja.x + caja.w / 2 - 512) < 4 && caja.top > 40, JSON.stringify(caja));
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png','-ipad.png') });
  revisa('sin errores de consola (iPad)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos
  ? `Estacionamiento humo FAILED · ${fallos} de ${corridas}`
  : `Estacionamiento humo OK · ${corridas} revisiones: gafete nuevo en 3 toques, solicitud del portal en 2, cobro y entrega en un solo movimiento`);
process.exit(fallos ? 1 : 0);
