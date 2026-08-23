import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const root=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const ignored=new Set(['tcfc-panel-academia-v1.html','tcfc-manual-beta.html']);
const roots=['v2','pedido','programas','registro'];
const html=['index.html','public-form.html'];
const code=['public-form.js','pedido/app.js'];

function walk(dir){
  for(const name of readdirSync(dir)){
    const path=join(dir,name),rel=relative(root,path);
    if(statSync(path).isDirectory())walk(path);
    else if(path.endsWith('.html')&&!ignored.has(name))html.push(rel);
    else if(path.endsWith('.js'))code.push(rel);
  }
}
roots.forEach(dir=>walk(join(root,dir)));

const failures=[];
const visibleTerms=/(?:legacy|can[oó]nic|saas|\bv2(?:\.0)?\b|ledger|backend|pipeline|roster|slug|locale|go live|guardrails|tenant|constraints|commands|snapshot|funnel)/i;
const pictographs=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const requiredSelects=['enrollPlayer','fundingPlayer','playerSelect','statPlayer','evalPlayer','notePlayer','packagePlayer','sessionPlayer','collectPlayer'];

for(const file of [...new Set(html)]){
  const source=readFileSync(join(root,file),'utf8');
  const visible=source.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  if(visibleTerms.test(visible))failures.push(`${file}: contiene lenguaje técnico visible`);
  if(pictographs.test(source))failures.push(`${file}: contiene pictogramas de texto`);
  for(const asset of ['/icon.svg','/icons.css','/polish.css'])if(!source.includes(asset))failures.push(`${file}: falta ${asset}`);
}

for(const file of [...new Set(code)]){
  const source=readFileSync(join(root,file),'utf8');
  if(pictographs.test(source))failures.push(`${file}: contiene pictogramas de texto`);
}

const allHtml=[...new Set(html)].map(file=>readFileSync(join(root,file),'utf8')).join('\n');
for(const id of requiredSelects){
  const select=new RegExp(`<select[^>]*id=["']${id}["'][^>]*>`).exec(allHtml)?.[0]||'';
  if(!select.includes('data-smart-search'))failures.push(`${id}: no usa búsqueda inteligente`);
}

if(failures.length){
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`QA visual OK: ${new Set(html).size} pantallas, ${requiredSelects.length} selectores inteligentes, sin jerga técnica visible ni pictogramas de texto.`);
