/* CARGO A VARIOS TANNERS (sólo Presidencia). Antes vivía en Finanzas; desde
 * el 26/11/2026 se abre desde Métricas > Cobranza > Para cobrar ("deja nuestro
 * centro de dinero"). Mismo flujo y misma base (v2_presidency_bulk_charge). */
import { rpc, money, $ } from '/v2/shell.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let org=null;
/* ===== Cargo a varios Tanners (sólo Presidencia) =====
   "Para cuando sean los torneos": un cargo con concepto, monto, fecha límite y
   motivo para toda una categoría (o varias) y se puede quitar a quien no va.
   Antes de guardar dice a cuántos y cuánto suma. Un lote reintentado no
   duplica a nadie (llave del lote + Tanner, en la base). */
let masivo=null;
const pesosHub=v=>money.format(Number(v||0));
export async function abrirCargoMasivo({ org: o }){
  org=o;
  if(!$('presSheet'))document.body.insertAdjacentHTML('beforeend','<div id="presBackdrop" class="pres-backdrop hidden"></div><section id="presSheet" class="pres-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="presTitle"><div class="pres-grab" aria-hidden="true"></div><div id="presBody"></div></section>');
  $('presBackdrop').onclick=()=>{if(!masivo?.enviando)cerrarMasivo();};
  masivo={cargando:true,llave:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`),cats:new Set(),fuera:new Set(),extra:new Set(),jugadores:[],concepto:'',monto:'',fecha:new Date().toISOString().slice(0,10),motivo:'',error:'',enviando:false};
  $('presSheet').classList.remove('hidden');$('presBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';
  pintaMasivo();
  try{const v=await rpc('v2_players',{organization_id:org,status_filter:'active'});masivo.jugadores=(Array.isArray(v)?v:[]).map(p=>({id:p.id,nombre:[p.first_name,p.last_name].filter(Boolean).join(' '),cat:p.category||'Sin categoría'})).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es-MX'));}
  catch(e){masivo.error='No se pudo cargar la lista de Tanners.';}
  masivo.cargando=false;pintaMasivo();
}
function cerrarMasivo(){masivo=null;$('presSheet')?.classList.add('hidden');$('presBackdrop')?.classList.add('hidden');document.body.style.overflow='';}
function elegidosMasivo(){
  if(!masivo)return [];
  return masivo.jugadores.filter(j=>(masivo.cats.has(j.cat)&&!masivo.fuera.has(j.id))||masivo.extra.has(j.id));
}
function guardaMasivo(){
  if(!masivo)return;
  for(const [id,k] of [['mConcepto','concepto'],['mMonto','monto'],['mFecha','fecha'],['mMotivo','motivo']])if($(id))masivo[k]=$(id).value;
}
function pintaMasivo(){
  const b=$('presBody');if(!b||!masivo)return;
  const cats=[...new Set(masivo.jugadores.map(j=>j.cat))].sort((a,b)=>a.localeCompare(b,'es-MX',{numeric:true}));
  const elegidos=elegidosMasivo(),monto=Number(masivo.monto||0);
  const enLista=masivo.jugadores.filter(j=>masivo.cats.has(j.cat)||masivo.extra.has(j.id));
  const resumen=elegidos.length&&monto>0?`Se cargarán ${pesosHub(monto)} a ${elegidos.length} Tanner${elegidos.length===1?'':'s'} = ${pesosHub(monto*elegidos.length)}`:'Elige categorías y escribe el monto.';
  b.innerHTML=`<header class="pres-head"><div><h2 id="presTitle">Cargo a varios Tanners</h2><p>Sólo Presidencia · queda registrado con tu nombre</p></div><button type="button" class="pres-close" id="mCerrar" aria-label="Cerrar">×</button></header>
  ${masivo.cargando?'<p class="pres-nota">Cargando Tanners…</p>':`<form id="mForm" class="pres-form">
    <label>Concepto<input id="mConcepto" type="text" maxlength="120" placeholder="Ej. Torneo de Navidad" value="${esc(masivo.concepto)}"></label>
    <div class="pres-row"><label>Monto por Tanner<input id="mMonto" type="number" inputmode="decimal" min="1" step="1" value="${esc(masivo.monto)}"></label><label>Fecha límite<input id="mFecha" type="date" value="${esc(masivo.fecha)}"></label></div>
    <div class="m-bloque"><span class="m-etq">Categorías</span><div class="m-chips">${cats.map(c=>`<button type="button" class="m-chip" aria-pressed="${masivo.cats.has(c)}" data-cat="${esc(c)}">${esc(c)} <small>${masivo.jugadores.filter(j=>j.cat===c).length}</small></button>`).join('')}</div></div>
    ${enLista.length?`<div class="m-bloque"><span class="m-etq">Tanners (${elegidos.length} de ${enLista.length}) · quita a quien no va</span><div class="m-lista">${enLista.map(j=>{const on=(masivo.cats.has(j.cat)&&!masivo.fuera.has(j.id))||masivo.extra.has(j.id);return `<label class="m-jug"><input type="checkbox" data-jug="${esc(j.id)}"${on?' checked':''}><span>${esc(j.nombre)}</span><small>${esc(j.cat)}</small></label>`;}).join('')}</div></div>`:''}
    <label>Motivo<textarea id="mMotivo" rows="2" maxlength="300" placeholder="Queda en el registro de cada Tanner">${esc(masivo.motivo)}</textarea></label>
    <p class="pres-nota m-resumen" id="mResumen">${esc(resumen)}</p>
    ${masivo.error?`<div class="pres-error" role="alert">${esc(masivo.error)}</div>`:''}
    <button type="submit" class="pres-primary"${masivo.enviando?' disabled':''}>${masivo.enviando?'Un momento…':'Agregar cargo'}</button></form>`}`;
  $('mCerrar').onclick=()=>{if(!masivo?.enviando)cerrarMasivo();};
  b.querySelectorAll('[data-cat]').forEach(x=>x.onclick=()=>{guardaMasivo();const c=x.dataset.cat;masivo.cats.has(c)?masivo.cats.delete(c):masivo.cats.add(c);pintaMasivo();});
  b.querySelectorAll('[data-jug]').forEach(x=>x.onchange=()=>{const j=masivo.jugadores.find(y=>y.id===x.dataset.jug);if(!j)return;
    if(masivo.cats.has(j.cat)){x.checked?masivo.fuera.delete(j.id):masivo.fuera.add(j.id);}else{x.checked?masivo.extra.add(j.id):masivo.extra.delete(j.id);}
    guardaMasivo();pintaMasivo();});
  $('mMonto')?.addEventListener('input',()=>{guardaMasivo();const el=elegidosMasivo(),m=Number(masivo.monto||0);$('mResumen').textContent=el.length&&m>0?`Se cargarán ${pesosHub(m)} a ${el.length} Tanner${el.length===1?'':'s'} = ${pesosHub(m*el.length)}`:'Elige categorías y escribe el monto.';});
  $('mForm')?.addEventListener('submit',enviaMasivo);
}
async function enviaMasivo(ev){
  ev.preventDefault();if(!masivo||masivo.enviando)return;
  guardaMasivo();masivo.error='';
  const ids=elegidosMasivo().map(j=>j.id),monto=Number(masivo.monto),concepto=String(masivo.concepto||'').trim(),motivo=String(masivo.motivo||'').trim();
  if(concepto.length<3)masivo.error='Escribe el concepto del cargo.';
  else if(!(monto>0))masivo.error='Escribe un monto mayor a cero.';
  else if(!ids.length)masivo.error='Elige al menos un Tanner.';
  else if(motivo.length<3)masivo.error='Escribe el motivo: queda en el registro.';
  if(masivo.error){pintaMasivo();return;}
  masivo.enviando=true;pintaMasivo();
  try{
    const r=await rpc('v2_presidency_bulk_charge',{organization_id:org,player_ids:ids,concept:concepto,amount:monto,due_date:masivo.fecha||null,reason:motivo,idempotency_key:masivo.llave});
    cerrarMasivo();
    avisoHub(`Listo: ${concepto} a ${r?.players??ids.length} Tanners por ${pesosHub(r?.total??monto*ids.length)}.`);
  }catch(e){masivo.enviando=false;masivo.error=String(e?.message||'No se pudo guardar. Intenta de nuevo.');pintaMasivo();}
}
function avisoHub(t){
  let el=$('presToast');
  if(!el){document.body.insertAdjacentHTML('beforeend','<div id="presToast" class="pres-toast" role="status"></div>');el=$('presToast');}
  el.textContent=t;el.classList.add('visible');clearTimeout(avisoHub.t);avisoHub.t=setTimeout(()=>el.classList.remove('visible'),4500);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&masivo&&!masivo.enviando)cerrarMasivo();});

