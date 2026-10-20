import {bootstrapProtectedShell,rpc,$,moduleAccess,setShellHealth} from '/v2/shell.js';
import {indicacionesDeTexto,problemaConIndicaciones} from '/v2/indicaciones.js';
const boot=await bootstrapProtectedShell({active:'admin',title:'Configuración del club'});if(!boot)throw new Error('No access');
const {ctx,navigation}=boot,org=ctx.organization_id,canWrite=moduleAccess(navigation,'admin',true);let current=null;
function msg(text='',type='error'){const el=$('orgMessage');el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
function populate(data){current=data;$('orgNameInput').value=data.name||'';$('legalNameInput').value=data.legalName||'';$('timezoneInput').value=data.timezone||'America/Mexico_City';$('localeInput').value=data.locale||'es-MX';$('currencyInput').value=data.currency||'MXN';$('orgSlug').textContent=data.slug||'—';$('planName').textContent=data.plan?.name||'Sin plan';$('planMeta').textContent=[data.plan?.code,data.plan?.provider].filter(Boolean).join(' · ')||'Sin proveedor';$('planStatus').textContent=data.plan?.status||'sin suscripción';$('saveOrg').disabled=!canWrite;if(!canWrite){$('saveOrg').textContent='Solo lectura';[...$('orgForm').elements].forEach(el=>{if(el.id!=='saveOrg')el.disabled=true;});}setShellHealth({state:data.plan?.status==='active'?'ok':'attention',label:data.plan?.status==='active'?'Plan activo':'Revisar suscripción'});}
async function load(){populate(await rpc('v2_organization_settings',{organization_id:org}));}
$('orgForm').addEventListener('submit',async e=>{e.preventDefault();if(!canWrite)return;const btn=$('saveOrg');btn.disabled=true;msg();try{const currency=$('currencyInput').value.trim().toUpperCase();const locale=$('localeInput').value.trim(),timezone=$('timezoneInput').value.trim(),name=$('orgNameInput').value.trim();if(name.length<2)throw new Error('Captura el nombre del club.');if(!/^[A-Z]{3}$/.test(currency))throw new Error('Escribe la moneda con tres letras, por ejemplo MXN.');if(!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale))throw new Error('Usa un formato regional como es-MX.');if(!timezone)throw new Error('Captura una zona horaria válida.');await rpc('v2_update_organization_settings',{organization_id:org,name,legal_name:$('legalNameInput').value.trim()||null,timezone,locale,currency});await load();msg('Configuración guardada con trazabilidad.','success');}catch(err){msg(err.message||'No se pudo guardar.');}finally{btn.disabled=!canWrite;}});await load();
// Contacto y llaves. Va por v2_club_config y no por v2_organization_settings
// porque estos dos datos los tiene que poder leer tambien quien no administra:
// la edge function que arma las contrasenas y el portal de familias.
function clubMsg(text='',type='error'){const el=$('clubMessage');el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
function muestraEjemplo(){const p=($('prefixInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')||'TC').slice(0,6);$('prefixSample').textContent=`${p}\u2026${p}00`;}
async function cargaClub(){
  const cfg=await rpc('v2_club_config',{organization_id:org});
  $('whatsappInput').value=cfg?.whatsapp||'';
  $('prefixInput').value=cfg?.passwordPrefix||'';
  $('storeUrlInput').value=cfg?.storeUrl||'';
  muestraEjemplo();
  $('saveClub').disabled=!canWrite;
  if(!canWrite){$('saveClub').textContent='Solo lectura';[...$('clubForm').elements].forEach(el=>{if(el.id!=='saveClub')el.disabled=true;});}
}
$('prefixInput').addEventListener('input',muestraEjemplo);
$('clubForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canWrite)return;
  const btn=$('saveClub');btn.disabled=true;clubMsg();
  try{
    const whatsapp=$('whatsappInput').value.replace(/\D/g,'');
    const prefijo=$('prefixInput').value.trim().toUpperCase();
    // wa.me exige lada de pais: un numero de 10 digitos abre una conversacion
    // vacia y la familia cree que aviso al club.
    if(whatsapp&&whatsapp.length===10)throw new Error('Falta la lada de país. Para México escribe 52 y luego los 10 dígitos.');
    if(whatsapp&&(whatsapp.length<11||whatsapp.length>15))throw new Error('El WhatsApp necesita entre 11 y 15 números, con lada de país.');
    if(prefijo&&!/^[A-Z0-9]{2,6}$/.test(prefijo))throw new Error('El prefijo va de 2 a 6 letras o números, por ejemplo TC.');
    const tienda=$('storeUrlInput').value.trim();
    if(tienda&&!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(tienda))throw new Error('La liga de la tienda debe empezar con https:// y traer un dominio válido.');
    await rpc('v2_update_club_config',{organization_id:org,whatsapp:whatsapp||null,password_prefix:prefijo||null,store_url:tienda||null});
    await cargaClub();
    clubMsg('Contacto y llaves guardados.','success');
  }catch(err){clubMsg(err.message||'No se pudo guardar.');}
  finally{btn.disabled=!canWrite;}
});
await cargaClub();

// Datos para que te paguen: banco, CLABE y titular. Los usan los mensajes de
// cobro y la tienda (paymentInstructions). La CLABE se valida aquí (dígito
// verificador) y otra vez en el servidor.
export function clabeValida(v){const d=String(v||'').replace(/\D/g,'');if(d.length!==18)return false;const w=[3,7,1];let s=0;for(let i=0;i<17;i++)s+=(Number(d[i])*w[i%3])%10;return (10-(s%10))%10===Number(d[17]);}
function payMsg(text='',type='error'){const el=$('payMessage');el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function cargaPago(){
  const cfg=await rpc('v2_club_config',{organization_id:org});const pi=cfg?.paymentInstructions||{};
  $('payBank').value=pi.transfer?.bank||'';$('payClabe').value=pi.transfer?.clabe||'';$('payHolder').value=pi.transfer?.holder||'';
  const metodos=new Set(pi.methods||[]);document.querySelectorAll('.pay-metodos input').forEach(c=>{c.checked=metodos.has(c.value);});
  if(!canWrite){[...$('payForm').elements].forEach(el=>{el.disabled=true;});$('savePay').textContent='Solo lectura';}
}
$('payForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canWrite)return;payMsg();
  const clabe=$('payClabe').value.replace(/\D/g,''),bank=$('payBank').value.trim(),holder=$('payHolder').value.trim();
  const methods=[...document.querySelectorAll('.pay-metodos input:checked')].map(c=>c.value);
  if(clabe&&!clabeValida(clabe)){payMsg('Esa CLABE no es válida: revisa los 18 dígitos.');return;}
  if(clabe&&(!bank||!holder)){payMsg('Con la CLABE van el banco y el titular de la cuenta.');return;}
  const btn=$('savePay');btn.disabled=true;
  try{await rpc('v2_update_payment_info',{organization_id:org,info:{bank,clabe,holder,methods}});await cargaPago();payMsg('Datos de pago guardados.','success');}
  catch(err){payMsg(err.message||'No se pudo guardar.');}
  finally{btn.disabled=!canWrite;}
});
await cargaPago();

// Indicaciones al registrarse (s4): lo que la familia lee al terminar su
// registro (uniforme, calzado…). Una por renglón; el servidor guarda hasta 6.
function notesMsg(text='',type='error'){const el=$('notesMessage');el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function cargaIndicaciones(){
  const notas=await rpc('v2_registration_notes',{organization_id:org});
  $('notesInput').value=(Array.isArray(notas)?notas:[]).join('\n');
  if(!canWrite){$('notesInput').disabled=true;$('saveNotes').disabled=true;$('saveNotes').textContent='Solo lectura';}
}
$('notesForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canWrite)return;notesMsg();
  const notas=indicacionesDeTexto($('notesInput').value),problema=problemaConIndicaciones(notas);
  if(problema){notesMsg(problema);return;}
  const btn=$('saveNotes');btn.disabled=true;
  try{await rpc('v2_update_registration_notes',{organization_id:org,notes:notas});await cargaIndicaciones();notesMsg('Indicaciones guardadas. Ya salen al terminar el registro.','success');}
  catch(err){notesMsg(err.message||'No se pudo guardar.');}
  finally{btn.disabled=!canWrite;}
});
try{await cargaIndicaciones();}catch(_){}

// Costos públicos (h22-h23, 20/10/2026): "¿dónde puedo editar los costos?"
// y "como opción 1, opción 2: cuántos días y el costo". Categorías con sus
// opciones y paquetes, todo con + Agregar. Lo que se guarda sale en /costos
// al momento. El precio por clase sólo se muestra: mensualidad ÷ 4 ÷ días.
let costos=null;
const escC=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pesoC=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
function costosMsg(text='',type='error'){const el=$('costosMessage');el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
function porClaseTxt(o){const d=Number(o.dias),m=Number(o.mensualidad);return Number.isInteger(d)&&d>0&&String(o.mensualidad).trim()!==''&&m>=0?`= ${pesoC(Math.round(m/(d*4)))} por clase`:'';}
function pintaCostos(){
  const c=costos,ro=!canWrite?' disabled':'';
  $('costosCats').innerHTML=c.categorias.map((cat,i)=>`<fieldset class="costos-grupo costos-cat" data-cat="${i}"><legend>Categoría ${i+1}</legend>
    <label>Nombre<input data-f="nombre" maxlength="60" value="${escC(cat.nombre)}" placeholder="Tanners"${ro}></label>
    <label>Edades<input data-f="edades" maxlength="60" value="${escC(cat.edades)}" placeholder="De 6 a 12 años"${ro}></label>
    <label>Inscripción<input data-f="inscripcion" type="number" inputmode="numeric" min="0" step="1" value="${escC(cat.inscripcion)}" placeholder="1000"${ro}></label>
    <div class="costos-ops">${cat.opciones.map((o,j)=>`<div class="costos-op" data-op="${j}"><span class="costos-op-n">Opción ${j+1}</span>
      <label>Días por semana<input data-o="dias" type="number" inputmode="numeric" min="1" max="7" step="1" value="${escC(o.dias)}"${ro}></label>
      <label>Precio al mes<input data-o="mensualidad" type="number" inputmode="numeric" min="0" step="1" value="${escC(o.mensualidad)}"${ro}></label>
      <small class="costos-clase" data-clase>${porClaseTxt(o)}</small>
      ${canWrite&&cat.opciones.length>1?`<button type="button" class="costos-quita" data-quita-op="${j}" aria-label="Quitar opción ${j+1}">Quitar</button>`:''}</div>`).join('')}</div>
    ${canWrite?`<div class="costos-fila"><button type="button" class="costos-add" data-add-op>+ Agregar opción</button>${c.categorias.length>1?'<button type="button" class="costos-quita" data-quita-cat>Quitar categoría</button>':''}</div>`:''}
  </fieldset>`).join('');
  $('costosPaqs').innerHTML=c.paquetes.lista.map((x,k)=>`<div class="costos-paq" data-paq="${k}">
    <label class="costos-paq-nombre">Nombre<input data-p="nombre" maxlength="60" value="${escC(x.nombre)}" placeholder="2 Tanners"${ro}></label>
    ${c.categorias.map((cat,i)=>`<label class="costos-paq-n">${escC(cat.nombre||`Categoría ${i+1}`)}<input data-pc="${i}" type="number" inputmode="numeric" min="0" max="5" step="1" value="${escC(x.cantidades[i]??'')}" placeholder="0"${ro}></label>`).join('')}
    <label>Precio al mes<input data-p="mensualidad" type="number" inputmode="numeric" min="0" step="1" value="${escC(x.mensualidad)}"${ro}></label>
    ${canWrite?`<button type="button" class="costos-quita" data-quita-paq aria-label="Quitar paquete ${k+1}">Quitar</button>`:''}</div>`).join('')||'<p class="org-muted">Sin paquetes.</p>';
  $('cIncluye').value=c.incluye;$('cPaqOk').checked=!!c.paquetes.confirmado;
  if(!canWrite){['costosAddCat','costosAddPaq','cIncluye','cPaqOk'].forEach(id=>{$(id).disabled=true;});$('saveCostos').disabled=true;$('saveCostos').textContent='Solo lectura';}
}
$('costosForm').addEventListener('input',e=>{
  const t=e.target,cat=t.closest('[data-cat]'),op=t.closest('[data-op]'),paq=t.closest('[data-paq]');
  if(t.id==='cIncluye'){costos.incluye=t.value;return;}
  if(t.id==='cPaqOk'){costos.paquetes.confirmado=t.checked;return;}
  if(op&&t.dataset.o){const o=costos.categorias[+cat.dataset.cat].opciones[+op.dataset.op];o[t.dataset.o]=t.value;op.querySelector('[data-clase]').textContent=porClaseTxt(o);return;}
  if(cat&&t.dataset.f){costos.categorias[+cat.dataset.cat][t.dataset.f]=t.value;
    if(t.dataset.f==='nombre')document.querySelectorAll(`[data-pc="${cat.dataset.cat}"]`).forEach(inp=>{inp.parentElement.firstChild.textContent=t.value||`Categoría ${+cat.dataset.cat+1}`;});return;}
  if(paq){const x=costos.paquetes.lista[+paq.dataset.paq];if(t.dataset.p)x[t.dataset.p]=t.value;else if(t.dataset.pc!=null)x.cantidades[t.dataset.pc]=t.value;}
});
$('costosForm').addEventListener('change',e=>{if(e.target.id==='cPaqOk')costos.paquetes.confirmado=e.target.checked;});
$('costosForm').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.type==='submit'||!canWrite)return;
  const cat=b.closest('[data-cat]'),i=cat?+cat.dataset.cat:-1;
  if(b.id==='costosAddCat'){if(costos.categorias.length>=8){costosMsg('Hasta 8 categorías.');return;}costos.categorias.push({nombre:'',edades:'',inscripcion:'',opciones:[{dias:'',mensualidad:''}]});}
  else if(b.id==='costosAddPaq'){if(costos.paquetes.lista.length>=12){costosMsg('Hasta 12 paquetes.');return;}costos.paquetes.lista.push({nombre:'',cantidades:{},mensualidad:''});}
  else if(b.hasAttribute('data-add-op')){if(costos.categorias[i].opciones.length>=6){costosMsg('Hasta 6 opciones por categoría.');return;}costos.categorias[i].opciones.push({dias:'',mensualidad:''});}
  else if(b.dataset.quitaOp!=null)costos.categorias[i].opciones.splice(+b.dataset.quitaOp,1);
  else if(b.hasAttribute('data-quita-cat')){
    costos.categorias.splice(i,1);
    // Los paquetes cuentan por posición de categoría: se recorren las que siguen.
    costos.paquetes.lista.forEach(x=>{const n={};for(const [k,v] of Object.entries(x.cantidades)){if(+k<i)n[k]=v;else if(+k>i)n[+k-1]=v;}x.cantidades=n;});
  }
  else if(b.hasAttribute('data-quita-paq'))costos.paquetes.lista.splice(+b.closest('[data-paq]').dataset.paq,1);
  else return;
  costosMsg();pintaCostos();
});
async function cargaCostos(){
  const [{TARIFAS,aplicaPrecios},guardados]=await Promise.all([import('/costos/tarifas.js'),rpc('v2_public_prices',{organization_id:org})]);
  const t=aplicaPrecios(TARIFAS,guardados);
  costos={categorias:t.categorias.map(c=>({clave:c.clave,nombre:c.nombre,edades:c.edades,inscripcion:String(c.inscripcion),opciones:c.opciones.map(o=>({dias:String(o.dias),mensualidad:String(o.mensualidad)}))})),
    paquetes:{confirmado:!!t.paquetes.confirmado,lista:t.paquetes.lista.map(x=>({nombre:x.nombre,mensualidad:String(x.mensualidad),
      cantidades:Object.fromEntries(Object.entries(x.cantidades).map(([k,n])=>[t.categorias.findIndex(c=>c.clave===k),String(n)]).filter(([i])=>i>=0))}))},
    incluye:t.incluyeInscripcion};
  pintaCostos();
}
$('costosForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canWrite)return;costosMsg();
  const {preciosDelFormulario}=await import('/costos/tarifas.js');
  const r=preciosDelFormulario(costos);if(r.error){costosMsg(r.error);return;}
  const btn=$('saveCostos');btn.disabled=true;
  try{await rpc('v2_update_public_prices',{organization_id:org,prices:r.precios});await cargaCostos();costosMsg('Costos guardados. Ya salen en /costos.','success');}
  catch(err){costosMsg(err.message||'No se pudo guardar.');}
  finally{btn.disabled=!canWrite;}
});
try{await cargaCostos();}catch(_){costosMsg('No se pudieron cargar los costos. Recarga la página.');}
if(location.hash==='#costos')$('costos')?.scrollIntoView({block:'start'});
if(location.hash==='#cobro')$('cobro')?.scrollIntoView({block:'start'});
if(location.hash==='#indicaciones')$('indicaciones')?.scrollIntoView({block:'start'});

