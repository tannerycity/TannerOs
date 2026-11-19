/* REGISTRAR A OTRO HIJO (19/11/2026, carga cognitiva fase 3).
 *
 * Presidencia: "¿cómo mejoramos la carga cognitiva de nuestra app?". Los
 * hermanos comparten papá, teléfono, correo y casi siempre escuela y cómo nos
 * conocieron. Después de registrar a un hijo, "Registrar a otro hijo" abre el
 * formulario con eso ya escrito.
 *
 * Esta prueba levanta el registro REAL (/registro/ + public-form.js) con un
 * Supabase falso y revisa:
 *   1. Registrar al primer hijo funciona y la pantalla de éxito trae el botón.
 *   2. El segundo formulario llega con papá, teléfono, correo, escuela, cómo
 *      nos conociste (y quién recomendó) y el apellido ya escritos.
 *   3. Lo del niño llega vacío: nombre, fecha, foto.
 *   4. Los permisos de privacidad e imagen NO se dan por aceptados: se
 *      vuelven a marcar por cada niño.
 *   5. El segundo registro se manda con los datos de la familia.
 *   6. Nada de la familia se guarda en el teléfono (localStorage ni
 *      sessionStorage).
 *   7. Categoría sugerida por la edad (h94): con la fecha de nacimiento se
 *      elige sola y lo dice; si la familia eligió otra a mano, no se toca.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const FAKE = `export function createClient(){
  return {
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(name,params)=>{(window.__llamadas=window.__llamadas||[]).push({name,params});
      if(name==='v2_public_context')return{data:{organizationId:'o1',organizationName:'Tannery City FC',categories:['T10','T12'],categoryAges:[{name:'T10',minAge:7,maxAge:10},{name:'T12',minAge:11,maxAge:12}],whatsappNumber:'524790000000'},error:null};
      if(name==='v2_public_register_enhanced'){const n=window.__llamadas.filter(l=>l.name===name).length;return{data:{id:'p'+n,folio:'TC-000'+n},error:null};}
      return{data:null,error:null};},
    storage:{from(){return{upload:async()=>({data:{},error:null}),createSignedUrls:async()=>({data:[]})}}},
    from(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})}};return q},
    channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}
  };
}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };

const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE }));
await pg.goto(`${BASE}/registro/`, { waitUntil: 'domcontentloaded' });
await pg.waitForSelector('#regForm', { timeout: 8000 });

const FOTO = path.join(RAIZ, 'icon-512.png');
// Fechas relativas a hoy: 8 años y 2 meses (T10) y 11 años y 2 meses (T12).
const hace = (anios) => { const d = new Date(); d.setFullYear(d.getFullYear() - anios); d.setMonth(d.getMonth() - 2); return d.toISOString().slice(0, 10); };
async function llenaNino(nombre, fecha) {
  await pg.setInputFiles('#photoUpload', FOTO);
  await pg.selectOption('#registrationType', 'player');
  await pg.fill('#firstName', nombre);
  await pg.fill('#birthDate', fecha);
  for (const id of ['#sex', '#purpose', '#dominantFoot']) await pg.selectOption(id, { index: 1 });
  await pg.check('#regDataConsent');
}

/* ---------- 1. Primer hijo ---------- */
await llenaNino('Mateo', hace(8));
const sug1 = await pg.evaluate(() => ({ cat: document.getElementById('category').value, nota: document.getElementById('categoriaSugerida')?.textContent || '', visible: !document.getElementById('categoriaSugerida')?.classList.contains('hidden') }));
revisa('7. con la fecha, la categoría se elige sola (8 años: T10) y lo dice', sug1.cat === 'T10' && sug1.visible && /Sugerida por su edad \(8 años\)/.test(sug1.nota), sug1);
await pg.selectOption('#category', 'T12');
await pg.fill('#birthDate', hace(9));
revisa('7. si la familia eligió otra a mano, cambiar la fecha no se la mueve', (await pg.inputValue('#category')) === 'T12');
await pg.selectOption('#category', '');
await pg.fill('#birthDate', hace(8));
revisa('7. con la categoría vacía, la vuelve a sugerir', (await pg.inputValue('#category')) === 'T10');
await pg.fill('#lastName', 'Pérez Luna');
await pg.fill('#guardian', 'Laura Luna');
await pg.fill('#phone', '4771234567');
await pg.fill('#email', 'laura@example.com');
await pg.fill('#school', 'Colegio Miraflores');
await pg.selectOption('#source', 'Recomendación');
await pg.fill('#referralName', 'Familia Ruiz');
await pg.click('#regSubmit');
await pg.waitForSelector('#otroHijo', { timeout: 15000 }).catch(() => {});
revisa('1. el primer registro se manda', (await pg.evaluate(() => (window.__llamadas || []).filter(l => l.name === 'v2_public_register_enhanced').length)) === 1);
revisa('1. la pantalla de éxito trae "Registrar a otro hijo"', await pg.isVisible('#otroHijo'));
revisa('1. el botón mide lo que un dedo', await pg.$eval('#otroHijo', b => b.getBoundingClientRect().height >= 44).catch(() => false));

/* ---------- 2-4. El segundo formulario ---------- */
await pg.click('#otroHijo');
await pg.waitForSelector('#regForm', { timeout: 8000 });
await pg.waitForTimeout(300);
const v = await pg.evaluate(() => {
  const val = id => document.getElementById(id)?.value ?? null;
  return { guardian: val('guardian'), phone: val('phone'), email: val('email'), school: val('school'), source: val('source'), referral: val('referralName'),
    referralVisible: !document.getElementById('referralWrap')?.classList.contains('hidden'), lastName: val('lastName'),
    firstName: val('firstName'), birthDate: val('birthDate'), foto: !!document.querySelector('#photoPreview img'),
    datos: document.getElementById('regDataConsent')?.checked, imagen: document.getElementById('regImageConsent')?.checked,
    aviso: document.querySelector('.otro-hijo-aviso')?.textContent || '', foco: document.activeElement?.id };
});
revisa('2. papá o mamá ya escrito', v.guardian === 'Laura Luna', v);
revisa('2. teléfono ya escrito', String(v.phone).replace(/\D/g, '') === '4771234567', v.phone);
revisa('2. correo y escuela ya escritos', v.email === 'laura@example.com' && v.school === 'Colegio Miraflores', v);
revisa('2. cómo nos conociste y quién recomendó, ya escritos y visibles', v.source === 'Recomendación' && v.referral === 'Familia Ruiz' && v.referralVisible, v);
revisa('2. el apellido de los hermanos ya escrito (se puede cambiar)', v.lastName === 'Pérez Luna', v.lastName);
revisa('2. un aviso dice qué ya va escrito', /Ya escribimos tus datos/.test(v.aviso), v.aviso);
revisa('3. lo del niño llega vacío: nombre, fecha y foto', v.firstName === '' && v.birthDate === '' && !v.foto, v);
revisa('3. el cursor queda en el nombre del niño', v.foco === 'firstName', v.foco);
revisa('4. los permisos de privacidad e imagen se vuelven a aceptar', v.datos === false && v.imagen === false, v);

/* ---------- 5. Segundo hijo ---------- */
await llenaNino('Sofía', hace(11));
revisa('7. el segundo hijo trae su propia categoría por edad (11 años: T12)', (await pg.inputValue('#category')) === 'T12');
await pg.click('#regSubmit');
await pg.waitForSelector('#otroHijo', { timeout: 15000 }).catch(() => {});
const regs = await pg.evaluate(() => (window.__llamadas || []).filter(l => l.name === 'v2_public_register_enhanced').map(l => l.params));
const b = regs[1] || {};
revisa('5. el segundo registro se manda con la familia', regs.length === 2 && b.first_name === 'Sofía' && b.guardian_name === 'Laura Luna' && /4771234567/.test(b.phone || '') && b.email === 'laura@example.com' && b.school_name === 'Colegio Miraflores' && b.source_channel === 'Recomendación' && b.referral_name === 'Familia Ruiz' && b.last_name === 'Pérez Luna', b);
revisa('5. y con su propio permiso de privacidad', b.data_consent === true);
revisa('7. cada hijo se manda con su categoría', regs[0]?.category_interest === 'T10' && b.category_interest === 'T12', regs.map(r => r.category_interest));

/* ---------- 6. Nada en el teléfono ---------- */

const guardado = await pg.evaluate(() => { const t = []; for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) t.push(s.getItem(s.key(i))); return t.join(' '); });
revisa('6. nada de la familia queda guardado en el teléfono', !/Laura|4771234567|laura@example|Miraflores/.test(guardado), guardado.slice(0, 200));
revisa('sin errores de página', !errs.length, errs.join(' | '));

await browser.close(); srv.close();
console.log(fallos ? `Registro hermano FAILED · ${fallos} de ${corridas}` : `Registro hermano OK · ${corridas} revisiones: papá, teléfono, correo, escuela y origen ya escritos; lo del niño y los permisos, de nuevo; nada en el teléfono`);
process.exit(fallos ? 1 : 0);
