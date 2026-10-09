/* FOTOS AL TOMAR LISTA.
 *
 * Reporte (07/10/2026): "cuando los profes entran a tomar lista no pueden ver
 * las fotos de los jugadores". La pantalla decía "0 caras visibles · 16
 * expedientes necesitan miniatura": la auditoría de egress dejó la lista
 * pidiendo sólo miniaturas, pero v2_attendance_roster nunca las devolvió.
 *
 * Esta prueba abre /v2/asistencia/ REAL como profe, con un Supabase falso, y
 * revisa:
 *   · las miniaturas llegan por v2_attendance_roster_thumbs y se ven las caras;
 *   · el contador ya no dice "necesitan miniatura" cuando sí la tienen;
 *   · EGRESS: sólo se firman miniaturas, nunca la foto original;
 *   · si v2_attendance_roster_thumbs falla, la lista sale igual con iniciales.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4797, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d='') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre({ falla=false } = {}) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ falla }) => {
    const R = {
      v2_my_context:[{ organization_id:'o1', organization_name:'Tannery City FC', role:'Formadores', is_owner:false }],
      v2_my_modules:[{ module_code:'attendance', enabled:true, can_read:true, can_write:true }],
      v2_attendance_categories:[{ category_id:'c2', code:'T10', name:'T10', active_players:3, mine:true }],
      v2_attendance_sessions:[{ session_id:'s1', title:'Entrenamiento', category_name:'T10', starts_at:new Date().toISOString(), roster_count:3, present_count:0 }],
      // Como en producción: la lista trae la foto original pero NO la miniatura.
      v2_attendance_roster:[
        { player_id:'p1', code:'Tanner082', player_name:'Damián López Luna', photo_path:'org/players/p1/profile.webp', photo_bucket:'tanneros-private' },
        { player_id:'p2', code:'Tanner014', player_name:'Dario Montalvo Díaz', photo_path:'org/prospects/x/profile.webp', photo_bucket:'tanneros-prospect-photos' },
        { player_id:'p3', code:'Tanner099', player_name:'Sin Foto Tanner', photo_path:null, photo_bucket:null }
      ],
      v2_attendance_roster_thumbs:[
        { playerId:'p1', thumb:'org/players/p1/profile-thumb.webp', bucket:'tanneros-private' },
        { playerId:'p2', thumb:'org/prospects/x/profile-thumb.webp', bucket:'tanneros-prospect-photos' }
      ]
    };
    window.__firmadas = [];
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'profe'}}}}), getUser:async()=>({data:{user:{id:'profe'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async n => (falla && n==='v2_attendance_roster_thumbs') ? { data:null, error:{ message:'boom' } } : { data:R[n] ?? null, error:null },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { falla });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:[
    'export async function getSignedPhotoUrls(_s,b,paths){ const m={}; for(const x of paths){ window.__firmadas.push(b+":"+x); m[x]="/icon-512.png?"+encodeURIComponent(x); } return m; }',
    'export async function getSignedPhotoUrl(){ return null; }','export async function getRawSignedPhotoUrl(){ return null; }',
    'export function clearPhotoCache(){}','export function forgetPhoto(){}'].join('\n') }));
  await p.goto('http://127.0.0.1:4797/v2/asistencia/', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('.session-row', { timeout:8000 });
  await p.click('.session-row');
  await p.waitForSelector('#rosterList .roster-row', { timeout:6000 });
  await p.waitForTimeout(400);
  return p;
}

{
  const p = await abre();
  const caras = await p.$$eval('#rosterList .roster-row', r => r.map(x => (x.querySelector('.roster-avatar img') ? 'foto' : 'iniciales')));
  revisa('[caras] los 2 con miniatura salen con foto y el que no tiene, con iniciales', JSON.stringify(caras) === '["foto","foto","iniciales"]', JSON.stringify(caras));
  // Rediseño 09/10/2026: sin texto técnico; sólo un aviso de cuántos no tienen foto.
  const estado = (await p.innerText('#rosterPhotoStatus')).trim();
  revisa('[contador] sólo avisa del que de verdad no tiene foto', estado === '1 Tanner sin foto en su expediente', estado);
  const firmadas = await p.evaluate(() => window.__firmadas);
  revisa('[egress] sólo se firman miniaturas, nunca la foto original', firmadas.length === 2 && firmadas.every(x => /profile-thumb/.test(x)), JSON.stringify(firmadas));
  revisa('[almacén] cada miniatura se firma en su almacén (Fichajes o privado)', firmadas.includes('tanneros-prospect-photos:org/prospects/x/profile-thumb.webp') && firmadas.includes('tanneros-private:org/players/p1/profile-thumb.webp'), JSON.stringify(firmadas));
  await p.close();
}
{
  const p = await abre({ falla:true });
  const filas = await p.$$eval('#rosterList .roster-row', r => r.length);
  revisa('[falla] si las miniaturas no llegan, la lista sale igual', filas === 3, String(filas));
  revisa('[falla] y nada se firma', (await p.evaluate(() => window.__firmadas.length)) === 0);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Fotos en asistencia humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Fotos en asistencia humo OK · ${revisiones.length} revisiones: caras con miniatura, contador, egress y falla del servidor`);
