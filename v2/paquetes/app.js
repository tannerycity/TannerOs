/* Paquetes del club (h62, 04/11/2026).

   Presidencia: "que tenga un área de porteros... que le ponga clic y ver
   todos los que son porteros"; "en enero vamos a tener 6 paquetes"; "dejes
   listo porque en enero vamos a cambiarles costos de todo".

   Tres pestañas:
     · Porteros: todos (por posición, por paquete o inscritos con Alexis),
       con su paquete y su saldo. Los que no están en la academia, aparte.
     · Precios: los 6 paquetes con su precio de hoy y el que viene. Un precio
       de enero se captura hoy y el cobro de enero lo toma solo.
     · Asignar (Presidencia): ponerle paquete a todos de una vez. Los que
       quedan igual van juntos; los que cambiarían de monto se eligen uno por
       uno. Nada se aplica sin tocar "Aplicar". */
import {bootstrapProtectedShell,rpc,money,$,shellIcon,setShellHealth} from '/v2/shell.js';

const boot=await bootstrapProtectedShell({active:'inicio',title:'Paquetes'});
if(!boot)throw new Error('No access');
const {ctx}=boot;
const org=ctx.organization_id;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pesos=v=>money.format(Number(v||0));
const MES=d=>d?new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(new Date(`${String(d).slice(0,7)}-01T12:00:00`)):'';
const iniciales=n=>String(n||'').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'T';
const flecha='<span class="tan-fila-flecha" aria-hidden="true">›</span>';
const AUD={tanner:'Tanners',baby:'Baby Tanner y T6',porteros:'Porteros'};

let vista=new URLSearchParams(location.search).get('ver')||'porteros';
let porteros=null,catalogo=null,propuesta=null,elegidos=new Set(),hoja=null;

function detalle(k){
  if(k.audience==='porteros')return k.trainsWithCategory?`${k.goalkeeperDays} días con Alexis + ${k.days-k.goalkeeperDays} con su categoría`:`${k.days} días con Alexis (no entrena con su categoría)`;
  return `${k.days} días con su categoría`;
}
function fila({ico='users',tono='gris',titulo,sub='',valor='',href='',attrs='',extra='',accion=true,avatar=''}){
  const icono=avatar?`<span class="pq-avatar" aria-hidden="true">${esc(avatar)}</span>`:`<span class="tan-fila-ico" data-tono="${tono}">${shellIcon(ico)}</span>`;
  const cuerpo=`${icono}<span class="tan-fila-txt"><strong>${esc(titulo)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</span>${valor?`<span class="tan-fila-valor">${valor}</span>`:''}${extra}${accion&&!extra?flecha:''}`;
  if(href)return `<a class="tan-fila" href="${esc(href)}" ${attrs}>${cuerpo}</a>`;
  if(accion&&!extra)return `<button type="button" class="tan-fila" ${attrs}>${cuerpo}</button>`;
  return `<div class="tan-fila" ${attrs}>${cuerpo}</div>`;
}
const grupo=(t,filas,pie='')=>filas.length?`<section class="tan-grupo"><h2 class="tan-grupo-tit">${esc(t)}</h2><div class="tan-lista">${filas.join('')}</div>${pie?`<p class="tan-grupo-pie">${pie}</p>`:''}</section>`:'';

/* ---------- Porteros ---------- */
function vistaPorteros(){
  if(!porteros)return '<div class="tos-empty">Cargando porteros…</div>';
  if(!porteros.length)return '<div class="tos-empty">Todavía no hay porteros: márcalos como "Portero" en su ficha o ponles un paquete de porteros.</div>';
  const fil=g=>fila({avatar:iniciales(g.name),titulo:g.name,href:`/tanner/?id=${encodeURIComponent(g.id)}`,
    sub:[g.category,g.packageName||(g.inAcademy?'En la academia, sin paquete':'No está con Alexis')].filter(Boolean).join(' · '),
    valor:Number(g.balance)>0?`<b class="pq-debe">Debe ${esc(pesos(g.balance))}</b>`:'<span class="pq-ok">Al corriente</span>'});
  const con=porteros.filter(g=>g.inAcademy||g.package?.startsWith?.('porteros')),sin=porteros.filter(g=>!(g.inAcademy||g.package?.startsWith?.('porteros')));
  const debe=porteros.filter(g=>Number(g.balance)>0).length;
  return `<div class="pq-resumen"><div><b>${porteros.length}</b><span>portero${porteros.length===1?'':'s'}</span></div><div><b>${con.length}</b><span>con Alexis</span></div><div data-tono="${debe?'mal':''}"><b>${debe}</b><span>${debe===1?'debe':'deben'}</span></div></div>
    ${grupo(`Con Alexis · ${con.length}`,con.map(fil))}
    ${grupo(`Porteros sin academia · ${sin.length}`,sin.map(fil),sin.length?'Son porteros por posición, pero no entrenan con Alexis. Ofréceles <b>Porteros 4 días</b>: mismo precio que el club.':'')}`;
}

/* ---------- Precios ---------- */
function vistaPrecios(){
  if(!catalogo)return '<div class="tos-empty">Cargando precios…</div>';
  const ks=catalogo.packages||[];
  if(!ks.length)return '<div class="tos-empty">Este club todavía no tiene paquetes.</div>';
  const out=['tanner','baby','porteros'].map(a=>grupo(AUD[a],ks.filter(k=>k.audience===a).map(k=>{
    const prox=(k.upcoming||[])[0];
    const sub=[detalle(k),`${k.players} Tanner${k.players===1?'':'s'}`,prox?`Desde ${MES(prox.from)}: ${pesos(prox.fee)}`:''].filter(Boolean).join(' · ');
    return fila({ico:a==='porteros'?'shield':a==='baby'?'star':'users',tono:a==='porteros'?'azul':a==='baby'?'naranja':'verde',titulo:k.name,sub,
      valor:k.price==null?'<span class="pq-sin">Sin precio</span>':`${esc(pesos(k.price))}/mes`,attrs:catalogo.canEdit?`data-precio="${esc(k.code)}"`:'',accion:!!catalogo.canEdit});
  }))).join('');
  return out+`<p class="tan-grupo-pie pq-nota">${catalogo.canEdit?'Toca un paquete para ponerle precio nuevo desde el mes que tú digas. ':''}El precio nuevo cuenta desde el cobro de ese mes; lo ya cobrado no cambia. Las becas se descuentan solas del precio.</p>`;
}

/* ---------- Asignar ---------- */
const cambia=x=>x.fee!=null&&Math.abs(Number(x.fee)-Number(x.current||0))>0.004;
function vistaAsignar(){
  if(!catalogo?.canEdit)return '<div class="tos-empty">Sólo Presidencia asigna paquetes.</div>';
  if(!propuesta)return '<div class="tos-empty">Armando la propuesta…</div>';
  const pend=propuesta.filter(x=>!x.alreadySet);
  const igual=pend.filter(x=>!x.blocked&&!cambia(x)),cambian=pend.filter(x=>!x.blocked&&cambia(x)),no=pend.filter(x=>x.blocked),ya=propuesta.filter(x=>x.alreadySet);
  const filaIgual=x=>fila({avatar:iniciales(x.name),titulo:x.name,sub:`${x.category} · ${x.packageName}${Number(x.discount)>0?` − beca ${pesos(x.discount)}`:''}`,valor:`${esc(pesos(x.fee))}`,accion:false});
  const filaCambia=x=>{
    const sube=Number(x.fee)>Number(x.current||0),on=elegidos.has(x.playerId);
    return `<label class="tan-fila pq-check"><input type="checkbox" data-elige="${esc(x.playerId)}"${on?' checked':''}><span class="tan-fila-txt"><strong>${esc(x.name)}</strong><small>${esc(`${x.category} · ${x.packageName}${Number(x.discount)>0?` − beca ${pesos(x.discount)}`:''}`)}</small></span><span class="pq-cambio" data-sube="${sube?1:0}"><s>${esc(pesos(x.current))}</s> ${esc(pesos(x.fee))}</span></label>`;
  };
  const n=igual.length+elegidos.size;
  return `<p class="pq-intro">Cada Tanner queda en su paquete y sus becas se descuentan solas. <b>Cuenta desde el próximo cobro</b>; lo ya cobrado no cambia.</p>
    ${grupo(`Quedan igual · ${igual.length}`,igual.map(filaIgual),igual.length?'Pagan lo mismo que hoy: sólo quedan ordenados.':'')}
    ${grupo(`Cambiaría lo que pagan · ${cambian.length}`,cambian.map(filaCambia),cambian.length?'Pagan distinto al precio de su paquete y no tienen beca registrada que lo explique. Marca sólo los que sí deben cambiar; los demás se quedan como están hasta que les registres su beca.':'')}
    ${grupo(`No se pueden todavía · ${no.length}`,no.map(x=>fila({avatar:iniciales(x.name),titulo:x.name,sub:`${x.category||'Sin categoría'} · ${x.blocked}`,accion:false})))}
    ${ya.length?`<p class="tan-grupo-pie pq-nota">${ya.length} ya tienen paquete.</p>`:''}
    ${n?`<div class="pq-aplicar"><label>Motivo<textarea id="pqMotivo" rows="2" maxlength="300" placeholder="Ej. Paquetes 2026: ordenamos cuotas y becas"></textarea></label><div id="pqError" class="pres-error hidden" role="alert"></div><button type="button" class="pres-primary" id="pqAplicar">Poner paquete a ${n} Tanner${n===1?'':'s'}</button></div>`:''}`;
}

/* ---------- Pantalla ---------- */
function pinta(){
  const tabs=[['porteros','Porteros'],['precios','Precios']].concat(catalogo?.canEdit?[['asignar','Asignar']]:[]);
  // Mientras carga no se sabe si es Presidencia: no se le cambia la pestaña.
  if(catalogo&&!tabs.some(t=>t[0]===vista))vista='porteros';
  if(!catalogo&&vista==='asignar')tabs.push(['asignar','Asignar']);
  const cuerpo=vista==='porteros'?vistaPorteros():vista==='precios'?vistaPrecios():vistaAsignar();
  $('pqBody').innerHTML=`<div class="pres-seg pq-tabs" role="tablist" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map(([v,l])=>`<button type="button" role="tab" aria-checked="${v===vista}" aria-selected="${v===vista}" data-vista="${v}">${l}</button>`).join('')}</div><div class="pq-cuerpo">${cuerpo}</div>`;
}
async function carga(){
  const [p,c]=await Promise.all([rpc('v2_goalkeepers',{organization_id:org}).catch(()=>[]),rpc('v2_club_packages',{organization_id:org}).catch(()=>null)]);
  porteros=p||[];catalogo=c||{packages:[],canEdit:false};
  if(catalogo.canEdit&&vista==='asignar')await cargaPropuesta();
  const debe=porteros.filter(g=>Number(g.balance)>0).length;
  setShellHealth(debe?{state:'attention',label:`${debe} portero${debe===1?'':'s'} con saldo`}:{state:'ok',label:'Todo en orden'});
  pinta();
}
async function cargaPropuesta(){propuesta=await rpc('v2_package_proposal',{organization_id:org}).catch(()=>[]);}

document.addEventListener('click',async e=>{
  const t=e.target.closest?.('[data-vista]');if(!t)return;
  vista=t.dataset.vista;history.replaceState(null,'',`?ver=${vista}`);
  if(vista==='asignar'&&!propuesta){pinta();await cargaPropuesta();}
  pinta();
});
document.addEventListener('change',e=>{
  const c=e.target.closest?.('[data-elige]');if(!c)return;
  if(c.checked)elegidos.add(c.dataset.elige);else elegidos.delete(c.dataset.elige);
  const motivo=$('pqMotivo')?.value||'';pinta();if($('pqMotivo'))$('pqMotivo').value=motivo;
});
document.addEventListener('click',async e=>{
  const b=e.target.closest?.('#pqAplicar');if(!b)return;
  const motivo=String($('pqMotivo')?.value||'').trim(),err=$('pqError');
  if(motivo.length<5){err.textContent='Escribe el motivo (al menos 5 letras): queda en el registro de cada Tanner.';err.classList.remove('hidden');return;}
  const items=propuesta.filter(x=>!x.alreadySet&&!x.blocked&&(!cambia(x)||elegidos.has(x.playerId))).map(x=>({playerId:x.playerId,package:x.package}));
  b.disabled=true;b.textContent='Aplicando…';
  try{
    const r=await rpc('v2_apply_package_proposal',{organization_id:org,items,reason:motivo});
    elegidos.clear();propuesta=null;await carga();await cargaPropuesta();pinta();
    avisar(`Listo: ${r?.applied??items.length} Tanners con paquete. Cuenta desde el próximo cobro.`);
  }catch(x){b.disabled=false;b.textContent='Reintentar';err.textContent=String(x?.message||'No se pudo aplicar. Intenta de nuevo.').replace(/^.*?:\s*/,'');err.classList.remove('hidden');}
});

/* ---------- Hoja: precio nuevo ---------- */
function asegurarHoja(){
  if($('presSheet'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="presBackdrop" class="pres-backdrop hidden"></div><section id="presSheet" class="pres-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="presTitle"><div class="pres-grab" aria-hidden="true"></div><div id="presBody"></div></section>');
  $('presBackdrop').addEventListener('click',()=>{if(!hoja?.enviando)cerrar();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&hoja&&!hoja.enviando)cerrar();});
}
function cerrar(){hoja=null;$('presSheet')?.classList.add('hidden');$('presBackdrop')?.classList.add('hidden');document.body.style.overflow='';}
function meses(){
  const out=[],h=new Date();
  for(let i=1;i<=12;i++){const d=new Date(h.getFullYear(),h.getMonth()+i,1);out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);}
  return out;
}
function pintaHoja(){
  const k=(catalogo?.packages||[]).find(x=>x.code===hoja.code);if(!k)return;
  const ms=meses();if(!hoja.desde)hoja.desde=ms.find(m=>m.endsWith('-01-01'))||ms[0];
  $('presBody').innerHTML=`<header class="pres-head"><div><h2 id="presTitle">${esc(k.name)}</h2><p>${esc(detalle(k))}</p></div><button type="button" class="pres-close" data-cerrar aria-label="Cerrar">×</button></header>
    <form id="pqForm" class="pres-form">
      <div class="pres-cuota"><span>Hoy cuesta</span><b>${k.price==null?'Sin precio':esc(pesos(k.price))}</b></div>
      <div class="pres-row"><label>Precio nuevo<input id="pqPrecio" type="number" inputmode="decimal" min="0" step="1" value="${esc(hoja.precio??'')}" placeholder="$ al mes"></label>
      <label>Desde<select id="pqDesde">${ms.map(m=>`<option value="${m}"${m===hoja.desde?' selected':''}>${esc(MES(m))}</option>`).join('')}</select></label></div>
      <p class="pres-nota">Lo toman solos los ${k.players} Tanner${k.players===1?'':'s'} de este paquete desde el cobro de ese mes, menos sus becas. Lo ya cobrado no cambia.</p>
      <label>Nota (opcional)<input id="pqNota" type="text" maxlength="200" placeholder="Ej. Precios 2027" value="${esc(hoja.nota||'')}"></label>
      ${hoja.error?`<div class="pres-error" role="alert">${esc(hoja.error)}</div>`:''}
      <button type="submit" class="pres-primary"${hoja.enviando?' disabled':''}>${hoja.enviando?'Un momento…':'Guardar precio'}</button></form>`;
  $('presBody').querySelector('[data-cerrar]').addEventListener('click',()=>{if(!hoja?.enviando)cerrar();});
  $('pqForm').addEventListener('submit',guardaPrecio);
}
async function guardaPrecio(ev){
  ev.preventDefault();if(!hoja||hoja.enviando)return;
  hoja.precio=$('pqPrecio').value;hoja.desde=$('pqDesde').value;hoja.nota=$('pqNota').value;hoja.error='';
  const v=Number(hoja.precio);
  if(String(hoja.precio).trim()===''||!(v>=0)){hoja.error='Escribe el precio (puede ser 0).';pintaHoja();return;}
  hoja.enviando=true;pintaHoja();
  try{
    catalogo=await rpc('v2_set_package_price',{organization_id:org,package_code:hoja.code,monthly_fee:v,effective_from:hoja.desde,note:hoja.nota||null});
    const t=`${(catalogo.packages||[]).find(x=>x.code===hoja.code)?.name||'Paquete'}: ${pesos(v)} desde ${MES(hoja.desde)}.`;
    cerrar();propuesta=null;pinta();avisar(t);
  }catch(x){hoja.enviando=false;hoja.error=String(x?.message||'No se pudo guardar.').replace(/^.*?:\s*/,'');pintaHoja();}
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-precio]');if(!b||!catalogo?.canEdit)return;
  asegurarHoja();hoja={code:b.dataset.precio,enviando:false,error:''};pintaHoja();
  $('presSheet').classList.remove('hidden');$('presBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';
  setTimeout(()=>$('pqPrecio')?.focus(),60);
});
function avisar(t){
  let el=$('presToast');
  if(!el){document.body.insertAdjacentHTML('beforeend','<div id="presToast" class="pres-toast" role="status"></div>');el=$('presToast');}
  el.textContent=t;el.classList.add('visible');clearTimeout(avisar.t);avisar.t=setTimeout(()=>el.classList.remove('visible'),4200);
}

pinta();
await carga();
