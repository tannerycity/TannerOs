import fs from 'node:fs';
import path from 'node:path';

const required=[
  'index.html','v2/index.html','v2/app.js','v2/shell.js','v2/production.css','v2/qa/index.html','v2/qa/app.js','v2/qa/styles.css',
  'v2/jugadores/index.html','v2/asistencia/index.html','v2/finanzas/index.html','v2/taquilla/index.html','v2/contabilidad/index.html',
  'v2/prospectos/index.html','v2/scouting/index.html','v2/academias/index.html','v2/pedidos/index.html','v2/programas/index.html',
  'registro/index.html','registro/scouting/index.html','pedido/index.html','programas/index.html','public-form.js','public-form.css','vercel.json'
];
const errors=[];
for(const file of required){if(!fs.existsSync(file))errors.push(`Falta archivo crítico: ${file}`);}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});}

const htmlFiles=walk('v2').filter(f=>f.endsWith('index.html'));
for(const file of htmlFiles){
  const html=fs.readFileSync(file,'utf8');
  if(!/name=["']viewport["']/i.test(html))errors.push(`Sin viewport mobile-first: ${file}`);
  if(html.length<120)errors.push(`HTML sospechosamente pequeño: ${file}`);
}

const clientFiles=['index.html',...walk('v2').filter(f=>/\.(js|html)$/i.test(f)),'public-form.js'];
for(const file of clientFiles){
  const text=fs.readFileSync(file,'utf8');
  if(/sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE/i.test(text))errors.push(`Posible secreto de backend expuesto: ${file}`);
}

const rootHtml=fs.readFileSync('index.html','utf8');
const aliasHtml=fs.readFileSync('v2/index.html','utf8');
if(rootHtml!==aliasHtml)errors.push('index.html y v2/index.html deben ser el mismo shell; /v2 solo es compatibilidad invisible');
for(const [entry,html] of [['index.html',rootHtml],['v2/index.html',aliasHtml]]){
  const bootCount=(html.match(/\/v2\/app\.js/g)||[]).length;
  if(bootCount!==1)errors.push(`${entry} debe cargar app.js exactamente una vez; encontró ${bootCount}`);
  if(/auth-gate\.js/i.test(html.replace(/auth-gate\.css/ig,'')))errors.push(`${entry} todavía ejecuta auth-gate.js; debe existir un solo bootstrap`);
  if(/branding-auto\.js/i.test(html))errors.push(`${entry} no debe ejecutar branding-auto en Inicio`);
  if(!/id=["']email["']/i.test(html)||!/id=["']password["']/i.test(html))errors.push(`${entry} debe conservar los campos canónicos de acceso`);
  if(!/production\.css/i.test(html))errors.push(`${entry} no carga la capa UX de producción`);
  if((html.match(/id=["']shellNavBackdrop["']/g)||[]).length!==1)errors.push(`${entry} debe tener exactamente un backdrop de navegación móvil`);
}

for(const file of ['index.html','v2/index.html','v2/app.js','v2/shell.js']){
  const text=fs.readFileSync(file,'utf8');
  if(/href=["']\/v2\//i.test(text))errors.push(`Ruta interna /v2 visible en ${file}`);
}

const protectedApps=walk('v2').filter(f=>f.endsWith('/app.js')||f==='v2/app.js');
for(const file of protectedApps){
  const text=fs.readFileSync(file,'utf8');
  if(/location\.href\s*=\s*["']\/v2\/?["']/i.test(text)||/location\.replace\(\s*["']\/v2\/?["']/i.test(text)){
    errors.push(`Redirect legacy /v2 en ${file}; los módulos deben volver al acceso único /`);
  }
}

const qa=fs.readFileSync('v2/qa/index.html','utf8');
for(const id of ['runSmoke','runCritical','runFull','resultRows','historyList'])if(!qa.includes(`id="${id}"`))errors.push(`QA Center incompleto: falta #${id}`);

const publicForm=fs.readFileSync('public-form.js','utf8');
for(const route of ['/registro/porteros','/registro/jugadores','/registro/scouting','/pedido','/programas'])if(!publicForm.includes(route))errors.push(`public-form.js no reconoce ${route}`);

const vercel=fs.readFileSync('vercel.json','utf8');
for(const route of ['/v2','/jugadores','/asistencia','/finanzas','/taquilla','/prospectos','/scouting','/academias','/pedidos','/contabilidad'])if(!vercel.includes(route))errors.push(`vercel.json no cubre la ruta ${route}`);
for(const header of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'])if(!vercel.includes(header))errors.push(`Falta header de seguridad: ${header}`);

if(errors.length){console.error('\nTannerOS static QA FAILED');errors.forEach(e=>console.error(`- ${e}`));process.exit(1);}
console.log(`TannerOS static QA OK · ${htmlFiles.length} pantallas protegidas · shell único · rutas y seguridad verificadas`);
