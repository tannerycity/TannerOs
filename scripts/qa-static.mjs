import fs from 'node:fs';
import path from 'node:path';

const errors=[];
const routeContract={
  '/club/':'v2/club/index.html',
  '/direccion/':'v2/direccion/index.html',
  '/finanzas/':'v2/finanzas/index.html',
  '/taquilla/':'v2/taquilla/index.html',
  '/jugadores/':'v2/jugadores/index.html',
  '/asistencia/':'v2/asistencia/index.html',
  '/convocatoria/':'v2/convocatoria/index.html',
  '/calendario/':'v2/calendario/index.html',
  '/academias/':'v2/academias/index.html',
  '/prospectos/':'v2/prospectos/index.html',
  '/scouting/':'v2/scouting/index.html',
  '/pedidos/':'v2/pedidos/index.html',
  '/utileria/':'v2/utileria/index.html',
  '/patrocinadores/':'v2/patrocinadores/index.html',
  '/contabilidad/':'v2/contabilidad/index.html',
  '/usuarios/':'v2/usuarios/index.html',
  '/admin/':'v2/admin/index.html',
  '/qa/':'v2/qa/index.html',
  '/modulos/':'v2/modulos/index.html',
  '/deportivo/':'v2/deportivo/index.html',
  '/porteros/':'v2/porteros/index.html',
  '/produccion/':'v2/produccion/index.html',
  '/operacion/programas/':'v2/programas/index.html',
  '/admin/auditoria/':'v2/admin/auditoria/index.html',
  '/admin/branding/':'v2/admin/branding/index.html',
  '/admin/club/':'v2/admin/club/index.html',
  '/admin/onboarding/':'v2/admin/onboarding/index.html'
};
const required=['index.html','v2/index.html','v2/app.js','v2/shell.js','v2/production.css','public-form.js','public-form.css','vercel.json',...Object.values(routeContract),'registro/index.html','registro/scouting/index.html','pedido/index.html','programas/index.html'];
for(const file of new Set(required))if(!fs.existsSync(file))errors.push(`Falta archivo crítico: ${file}`);

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});}
const htmlFiles=walk('v2').filter(f=>f.endsWith('index.html'));
for(const file of htmlFiles){const html=fs.readFileSync(file,'utf8');if(!/name=["']viewport["']/i.test(html))errors.push(`Sin viewport mobile-first: ${file}`);if(html.length<120)errors.push(`HTML sospechosamente pequeño: ${file}`);}

const clientFiles=['index.html',...walk('v2').filter(f=>/\.(js|html)$/i.test(f)),'public-form.js'];
for(const file of clientFiles){const text=fs.readFileSync(file,'utf8');if(/sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE/i.test(text))errors.push(`Posible secreto de backend expuesto: ${file}`);}

const rootHtml=fs.readFileSync('index.html','utf8'),aliasHtml=fs.readFileSync('v2/index.html','utf8');
if(rootHtml!==aliasHtml)errors.push('index.html y v2/index.html deben ser el mismo shell; /v2 es solo compatibilidad');
for(const [entry,html] of [['index.html',rootHtml],['v2/index.html',aliasHtml]]){
  const boots=(html.match(/\/v2\/app\.js/g)||[]).length;if(boots!==1)errors.push(`${entry} debe cargar app.js exactamente una vez; encontró ${boots}`);
  if(/auth-gate\.js/i.test(html.replace(/auth-gate\.css/ig,'')))errors.push(`${entry} todavía ejecuta auth-gate.js`);
  if(/branding-auto\.js/i.test(html))errors.push(`${entry} no debe ejecutar branding-auto en Inicio`);
  if(!/id=["']email["']/i.test(html)||!/id=["']password["']/i.test(html))errors.push(`${entry} no conserva el acceso canónico`);
  if(!/production\.css/i.test(html))errors.push(`${entry} no carga la capa UX de producción`);
  if((html.match(/id=["']shellNavBackdrop["']/g)||[]).length!==1)errors.push(`${entry} debe tener exactamente un backdrop móvil`);
}

const shell=fs.readFileSync('v2/shell.js','utf8'),home=fs.readFileSync('v2/app.js','utf8');
for(const file of [['v2/shell.js',shell],['v2/app.js',home]])if(/href\s*:\s*["']\/v2\//i.test(file[1]))errors.push(`Navegación visible legacy /v2 en ${file[0]}`);

const vercelRaw=fs.readFileSync('vercel.json','utf8');let vercel;
try{vercel=JSON.parse(vercelRaw);}catch(e){errors.push(`vercel.json inválido: ${e.message}`);vercel={redirects:[],rewrites:[]};}
const rewrites=vercel.rewrites||[],redirects=vercel.redirects||[];
for(const [route,destination] of Object.entries(routeContract)){
  const noSlash=route==='/'?'/':route.replace(/\/$/,'');
  const mapped=rewrites.some(r=>(r.source===route||r.source===noSlash)&&r.destination===`/${destination}`);
  if(!mapped)errors.push(`Ruta canónica sin rewrite explícito: ${route} -> /${destination}`);
}
for(const rule of redirects){if(String(rule.source||'').startsWith('/v2/')&&String(rule.source||'').includes(':path*'))errors.push(`Redirect legacy captura assets y puede provocar 404: ${rule.source}`);}
for(const header of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'])if(!vercelRaw.includes(header))errors.push(`Falta header de seguridad: ${header}`);

const qa=fs.readFileSync('v2/qa/index.html','utf8');for(const id of ['runSmoke','runCritical','runFull','resultRows','historyList'])if(!qa.includes(`id="${id}"`))errors.push(`QA Center incompleto: falta #${id}`);
const publicForm=fs.readFileSync('public-form.js','utf8');for(const route of ['/registro/porteros','/registro/jugadores','/registro/scouting','/pedido','/programas'])if(!publicForm.includes(route))errors.push(`public-form.js no reconoce ${route}`);

if(errors.length){console.error('\nTannerOS static QA FAILED');errors.forEach(e=>console.error(`- ${e}`));process.exit(1);}
console.log(`TannerOS static QA OK · ${htmlFiles.length} pantallas · ${Object.keys(routeContract).length} rutas canónicas verificadas · assets /v2 protegidos`);
