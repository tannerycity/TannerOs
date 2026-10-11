import {bootstrapProtectedShell,rpc,$,moduleAccess,setShellHealth} from '/v2/shell.js';
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
if(location.hash==='#cobro')$('cobro')?.scrollIntoView({block:'start'});

