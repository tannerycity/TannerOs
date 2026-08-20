import fs from 'node:fs';
import path from 'node:path';

const required=[
  'v2/index.html','v2/branding-auto.js','v2/qa/index.html','v2/qa/app.js','v2/qa/styles.css',
  'registro/index.html','pedido/index.html','programas/index.html','public-form.js','public-form.css','vercel.json'
];
const errors=[];
for(const file of required){if(!fs.existsSync(file))errors.push(`Falta archivo crítico: ${file}`);}

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});}
const htmlFiles=walk('v2').filter(f=>f.endsWith('index.html'));
for(const file of htmlFiles){const html=fs.readFileSync(file,'utf8');if(!/name=["']viewport["']/i.test(html))errors.push(`Sin viewport mobile-first: ${file}`);if(html.length<120)errors.push(`HTML sospechosamente pequeño: ${file}`);}

const clientFiles=[...walk('v2').filter(f=>/\.(js|html)$/i.test(f)),'public-form.js'];
for(const file of clientFiles){const text=fs.readFileSync(file,'utf8');if(/sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE/i.test(text))errors.push(`Posible secreto de backend expuesto: ${file}`);}

const qa=fs.readFileSync('v2/qa/index.html','utf8');
for(const id of ['runSmoke','runCritical','runFull','resultRows','historyList'])if(!qa.includes(`id="${id}"`))errors.push(`QA Center incompleto: falta #${id}`);

const publicForm=fs.readFileSync('public-form.js','utf8');
for(const route of ['/registro/porteros','/registro/jugadores','/pedido','/programas'])if(!publicForm.includes(route))errors.push(`public-form.js no reconoce ${route}`);

if(errors.length){console.error('\nTannerOS static QA FAILED');errors.forEach(e=>console.error(`- ${e}`));process.exit(1);}
console.log(`TannerOS static QA OK · ${htmlFiles.length} pantallas V2 revisadas`);
