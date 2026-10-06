/* ===== Ficha Tanner, estilo Apple y modo Tannery City =====

   Pedido de Presidencia (06/10/2026): la ficha tenía toda la información
   abierta a la vez (la carta FIFA a media pantalla, cinco botones, permisos,
   pagos, perfil deportivo, apoyos y cinco secciones de formulario) y "te
   puedes llegar a perder". Este módulo NO cambia de dónde salen los datos ni
   cómo se guardan: reacomoda lo que app.js, documents.js y photos.js ya
   pintan, y agrega lo que faltaba a la vista.

     · Encabezado compacto: foto redonda (al tocarla abre la Carta Tanner),
       nombre, categoría y sólo los avisos que piden acción. Tocar el aviso
       del permiso de imagen abre el registro de permisos ahí mismo.
     · Acciones redondas: WhatsApp y llamar al tutor, Cobrar, Evaluar y "Más"
       (los botones de siempre, en una hoja).
     · Cuenta y tienda: cuántos meses debe, de cuáles, último pago y pedidos
       activos de la tienda (sólo quien ve dinero).
     · Perfil deportivo Tanner: asistencia 30 días, última evaluación,
       posición y objetivo.
     · Pestañas: Resumen · Deportivo · Pagos · Familia · Expediente. La que se
       abre primero depende del rol (profes: Deportivo).
     · Familia completa (hermanos en el club), línea de tiempo, beca visible y
       documentos con avance y aviso por WhatsApp. */
import { createClient } from '/v2/supabase-client.js';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pesos=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v||0));
const fecha=d=>d?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(d).slice(0,10)}T12:00:00`)):'';
const mesCorto=d=>{const t=new Intl.DateTimeFormat('es-MX',{month:'short'}).format(new Date(`${String(d).slice(0,10)}T12:00:00`)).replace('.','');return t[0].toUpperCase()+t.slice(1);};
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}

const ICON={
  wa:'<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z"/>',
  tel:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  cobrar:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1"/>',
  evaluar:'<path d="m4 12 4 4L20 4"/><path d="M20 12a8 8 0 1 1-4.2-7"/>',
  mas:'<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  cuenta:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 11h5"/>',
  bolsa:'<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  carta:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/>'
};
const svg=(n,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

let perms=null;
async function permisos(){
  if(perms)return perms;
  try{
    const rows=await rpc('v2_my_context');const ctx=rows?.[0]||null;
    const nav=ctx?await rpc('v2_my_navigation',{organization_id:ctx.organization_id}):[];
    const can=(c,w=false)=>Boolean((nav||[]).find(r=>r.module_code===c&&r.enabled&&(w?r.can_write:r.can_read)));
    perms={ctx,rol:ctx?.is_owner?'Presidencia':(ctx?.role||''),cobrar:can('taquilla',true)||can('cobranza',true),asistencia:can('asistencia')};
  }catch(e){perms={ctx:null,rol:'',cobrar:false,asistencia:false};}
  return perms;
}

// Estado de la ficha abierta.
let F=null;
const TABS=[['resumen','Resumen'],['deportivo','Deportivo'],['pagos','Pagos'],['familia','Familia'],['expediente','Expediente']];
const vista=()=>$('profileView');

function tutorPrincipal(){return (F?.guardians||[]).find(g=>g.isPrimary)||(F?.guardians||[])[0]||null;}
function telefono(g){const n=String(g?.phone||'').replace(/\D/g,'');return n.length===10?'52'+n:n;}
const nombre=p=>[p?.firstName,p?.lastName].filter(Boolean).join(' ');

function pintaTabs(){
  const nav=$('fichaTabs');if(!nav||!F)return;
  const lista=TABS.filter(([k])=>k!=='pagos'||F.canMoney);
  if(!lista.some(([k])=>k===F.tab))F.tab=lista[0][0];
  nav.innerHTML=lista.map(([k,l])=>`<button type="button" role="tab" aria-selected="${k===F.tab}" data-ficha-tab="${k}">${l}</button>`).join('');
  document.querySelectorAll('#profileView [data-ficha]').forEach(el=>{
    const en=el.dataset.ficha.split(/\s+/).includes(F.tab);
    el.classList.toggle('ficha-oculta',!en);
  });
}
function irA(tab,despues){
  if(!F)return;F.tab=tab;pintaTabs();
  const nav=$('fichaTabs');
  if(nav)nav.scrollIntoView({behavior:'smooth',block:'start'});
  if(despues)setTimeout(despues,250);
}

/* ---------- Encabezado ---------- */
function pintaAvatar(){
  const btn=$('fichaAvatar');if(!btn||!F)return;
  const img=$('photoBox')?.querySelector('img');
  const ini=[F.player.firstName,F.player.lastName].filter(Boolean).map(s=>String(s).trim()[0]||'').join('').toUpperCase().slice(0,2)||'T';
  vista()?.classList.toggle('ficha-sin-foto',!img?.src);
  btn.innerHTML=(img?.src?`<img src="${esc(img.src)}" alt="">`:`<span>${esc(ini)}</span>`)+`<i aria-hidden="true">${svg('carta',13)}</i>`;
}
function pintaChips(){
  const box=$('fichaChips');if(!box||!F)return;
  const chips=[];
  if(F.docs&&F.docs.faltan>0)chips.push(`<button type="button" class="ficha-chip alerta" data-ficha-ir="expediente">Falta${F.docs.faltan===1?'':'n'} ${F.docs.faltan} documento${F.docs.faltan===1?'':'s'}</button>`);
  if(F.hermanos?.length)chips.push(`<button type="button" class="ficha-chip" data-ficha-ir="familia">${F.hermanos.length} herman${F.hermanos.length===1?'o':'os'} en el club</button>`);
  box.innerHTML=chips.join('');
}
function pintaAcciones(){
  const box=$('fichaAcciones');if(!box||!F)return;
  const g=tutorPrincipal(),tel=telefono(g);
  const p=F.player,acc=[];
  const boton=(tipo,label,attrs,principal=false)=>`<${attrs.href?'a':'button'} class="ficha-accion${principal?' principal':''}" ${attrs.href?`href="${esc(attrs.href)}"${attrs.blank?' target="_blank" rel="noopener"':''}`:'type="button"'} ${attrs.extra||''}><span>${svg(tipo,22)}</span>${label}</${attrs.href?'a':'button'}>`;
  if(tel){
    const msg=encodeURIComponent(`Hola${g?.name?` ${String(g.name).split(' ')[0]}`:''}, le escribimos de Tannery City sobre ${p.firstName||'su Tanner'}.`);
    acc.push(boton('wa','WhatsApp',{href:`https://wa.me/${tel}?text=${msg}`,blank:true}));
    acc.push(boton('tel','Llamar',{href:`tel:+${tel}`}));
  }else{
    acc.push(`<span class="ficha-accion apagada" title="El tutor no tiene teléfono registrado"><span>${svg('wa',22)}</span>Sin teléfono</span>`);
  }
  if(F.puedeCobrar&&F.canMoney){
    const deuda=Math.round(Number(F.cuenta?.summary?.balance||0));
    acc.push(boton('cobrar','Cobrar',{href:`/taquilla/?action=cobrar&player=${encodeURIComponent(p.id)}${deuda>0?`&amount=${deuda}`:''}&name=${encodeURIComponent(nombre(p))}`},true));
  }
  if(F.canWrite)acc.push(boton('evaluar','Evaluar',{extra:'data-ficha-evaluar'},!(F.puedeCobrar&&F.canMoney)));
  acc.push(boton('mas','Más',{extra:'data-ficha-mas aria-haspopup="dialog"'}));
  box.innerHTML=acc.join('');
}

/* ---------- Carta Tanner (se abre al tocar la foto) ---------- */
function abrirCarta(){vista()?.classList.add('ficha-carta');const f=$('fichaCartaFondo');if(f)f.hidden=false;}
function cerrarCarta(){vista()?.classList.remove('ficha-carta');const f=$('fichaCartaFondo');if(f)f.hidden=true;}

/* ---------- "Más": los botones de siempre, en una hoja ---------- */
function asegurarMas(){
  if($('fichaMas'))return;
  const panel=$('profilePanel')||document.body;
  panel.insertAdjacentHTML('beforeend','<div id="fichaMasFondo" class="ficha-hoja-fondo" hidden></div><section id="fichaMas" class="ficha-hoja" role="dialog" aria-modal="true" aria-label="Más acciones" hidden><span class="ficha-hoja-grab" aria-hidden="true"></span><div id="fichaMasBody" class="ficha-mas-lista"></div><button type="button" class="ficha-mas-cerrar" data-ficha-cerrar-mas>Cerrar</button></section>');
  const viejas=document.querySelector('.profile-quick-actions');
  const body=$('fichaMasBody');
  body.insertAdjacentHTML('beforeend','<button type="button" class="ficha-mas-item" data-ficha-carta>Ver Carta Tanner</button><button type="button" class="ficha-mas-item" data-ficha-foto>Cambiar foto</button>');
  if(viejas){viejas.classList.add('ficha-mas-viejas');body.appendChild(viejas);}
  $('fichaMasFondo').addEventListener('click',cerrarMas);
}
function abrirMas(){
  asegurarMas();
  const foto=document.querySelector('[data-ficha-foto]');
  if(foto)foto.hidden=$('photoCardAction')?.classList.contains('hidden')??true;
  $('fichaMas').hidden=false;$('fichaMasFondo').hidden=false;
}
function cerrarMas(){if($('fichaMas'))$('fichaMas').hidden=true;if($('fichaMasFondo'))$('fichaMasFondo').hidden=true;}

/* ---------- Beca: franja dorada, muy visible ----------
   "Debe de ser muy visible" (Presidencia, 06/10/2026). Va justo debajo del
   nombre, antes que el dinero: quién la cubre, cuánto y hasta cuándo. */
function pintaBeca(){
  const box=$('fichaBeca');if(!box)return;
  const b=F?.beca;
  if(!b){box.hidden=true;box.innerHTML='';return;}
  box.innerHTML=`<span class="ficha-beca-ico">${svg('carta',20)}</span><span class="ficha-beca-txt"><strong>${esc(b.tipo)}${b.cuanto?` · ${esc(b.cuanto)}`:''}</strong><small>${b.quien?`Lo cubre ${esc(b.quien)}`:'Sin patrocinador registrado'}${b.hasta?` · hasta ${esc(fecha(b.hasta))}`:''}${b.pendiente?' · falta configurar cuánto cubre':''}</small></span>${svg('chevron',16)}`;
  box.hidden=false;
}

/* ---------- Cuenta y tienda ---------- */
function pintaCuenta(){
  const box=$('fichaCuenta');if(!box)return;
  if(!F?.canMoney||!F.cuenta){box.hidden=true;box.innerHTML='';return;}
  const d=F.cuenta,s=d.summary||{},hoy=new Date().toISOString().slice(0,10);
  const saldo=Number(s.balance||0);
  const mensual=(d.ledger||[]).filter(m=>m.kind==='charge'&&m.subtype==='monthly_fee'&&m.period);
  const porMes=new Map();
  mensual.forEach(m=>{const k=String(m.period).slice(0,7);const a=porMes.get(k)||{saldo:0,vence:m.date};a.saldo+=Number(m.charge_balance||0);porMes.set(k,a);});
  const meses=[...porMes.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-3);
  const debe=[...porMes.values()].filter(v=>v.saldo>0.004).length;
  const chips=meses.map(([k,v])=>{const estado=v.saldo<=0.004?'pagado':String(v.vence||'')<hoy?'vencido':'por vencer';
    return `<span class="ficha-mes ${estado.replace(' ','-')}">${esc(mesCorto(k+'-01'))} ${estado}</span>`;}).join('');
  const pago=(d.ledger||[]).find(m=>m.kind==='payment'&&m.status==='posted');
  const METODO={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta'};
  const titulo=saldo>0.004?(debe>0?`Debe ${debe} mes${debe===1?'':'es'}`:'Tiene saldo pendiente'):'Al corriente';
  const filaCuenta=`<button type="button" class="ficha-cuenta-fila ${saldo>0.004?'debe':'ok'}" data-ficha-ir="pagos">
    <span class="ficha-ico">${svg('cuenta')}</span>
    <span class="ficha-cuenta-txt"><span class="ficha-cuenta-top"><strong>${titulo}</strong>${saldo>0.004?`<b>${esc(pesos(saldo))}</b>`:''}</span>
    ${chips?`<span class="ficha-meses">${chips}</span>`:''}
    <small>${pago?`Último pago ${esc(fecha(pago.date))}${pago.method?` · ${esc(METODO[pago.method]||pago.method)}`:''}`:'Sin pagos registrados'}</small></span>
  </button>`;
  const activos=(d.orders||[]).filter(o=>!['delivered','cancelled','refunded'].includes(o.status));
  const ESTADO={pending_payment:'Pendiente de pago',partial_payment:'Pago parcial',paid:'Pagado',in_production:'En producción',ready:'Listo para entregar'};
  const filasPedido=activos.map(o=>{const falta=Number(o.total||0)-Number(o.paid||0);
    return `<a class="ficha-cuenta-fila" href="/pedidos/"><span class="ficha-ico oro">${svg('bolsa')}</span><span class="ficha-cuenta-txt"><strong>Pedido activo${o.folio?` · ${esc(o.folio)}`:''}</strong><small>${esc(ESTADO[o.status]||o.status||'')}${falta>0.004?` · faltan ${esc(pesos(falta))}`:' · pagado'}</small></span><span class="ficha-chev">${svg('chevron',16)}</span></a>`;}).join('');
  box.innerHTML=filaCuenta+filasPedido;box.hidden=false;
}

/* ---------- Perfil deportivo Tanner ---------- */
function pintaPerfil(){
  const box=$('fichaPerfil');if(!box||!F)return;
  const p=F.player;
  const evalTxt=$('evaluationDate')?.textContent?.trim()||'Sin evaluación';
  const sinEval=/Sin evaluación/i.test(evalTxt);
  const objetivo=$('evaluationObjectives')?.querySelector('div strong')?.textContent?.trim()||'';
  const asis=F.asistencia;
  const pos=[p.position||'Por definir',p.dominantFoot?({right:'Derecha',left:'Izquierda',both:'Ambas'}[p.dominantFoot]||p.dominantFoot):null].filter(Boolean).join(' · ');
  box.innerHTML=`<div class="ficha-perfil-head"><span>PERFIL DEPORTIVO TANNER</span>${F.canWrite?'<button type="button" data-ficha-evaluar>Evaluar</button>':''}</div>
    <div class="ficha-perfil-grid">
      <div><span>Asistencia 30 días</span><strong>${asis?.pct!=null?esc(`${Math.round(asis.pct)}%`):'—'}</strong><small>${asis?.pct!=null?esc(asis.texto):'Sin registros'}</small></div>
      <div><span>Última evaluación</span><strong class="${sinEval?'pend':''}">${sinEval?'Sin evaluar':esc(evalTxt.replace(/^Evaluación\s*/,''))}</strong><small>${sinEval?'Pendiente este ciclo':'Perfil Tanner'}</small></div>
      <div><span>Posición · pierna</span><strong class="chico">${esc(pos)}</strong></div>
      <div><span>Objetivo actual</span><strong class="chico">${objetivo?esc(objetivo):'Se define al evaluar'}</strong></div>
    </div>`;
}

/* ---------- Resumen: pendientes, hermanos e historia ---------- */
function pintaResumen(){
  const box=$('fichaResumen');if(!box||!F)return;
  const p=F.player,items=[];
  const img=p.imageConsent?null:(p.imageConsentAt||p.dataConsent?'La familia no autorizó su imagen':'Nunca se le preguntó');
  if(img)items.push({tono:'rojo',t:'Registrar permiso de imagen',d:img,attr:'data-ficha-permiso'});
  if(F.docs&&F.docs.faltan>0)items.push({tono:'rojo',t:`Falta${F.docs.faltan===1?'':'n'} ${F.docs.faltan} documento${F.docs.faltan===1?'':'s'}`,d:F.docs.nombres.join(', '),attr:'data-ficha-ir="expediente"'});
  const sinEval=/Sin evaluación/i.test($('evaluationDate')?.textContent||'Sin evaluación');
  if(sinEval)items.push({tono:'oro',t:'Evaluación del ciclo',d:'Todavía sin Perfil Tanner',attr:'data-ficha-ir="deportivo"'});
  const lista=items.length
    ?items.map(i=>`<button type="button" class="ficha-fila" ${i.attr}><i class="${i.tono}"></i><span><strong>${esc(i.t)}</strong><small>${esc(i.d)}</small></span>${svg('chevron',16)}</button>`).join('')
    :'<p class="ficha-vacio">Todo al día. Sin pendientes de expediente.</p>';
  const hermanos=F.hermanos?.length
    ?`<div class="ficha-card"><h3>FAMILIA EN EL CLUB</h3>${F.hermanos.map(h=>`<a class="ficha-fila" href="/jugadores/?player=${encodeURIComponent(h.id)}"><i class="teal"></i><span><strong>${esc(h.name)}</strong><small>${esc(h.category||'Sin categoría')}${h.status!=='active'?' · baja':''}</small></span>${svg('chevron',16)}</a>`).join('')}</div>`:'';
  box.innerHTML=`<div class="ficha-card"><h3>PENDIENTES</h3>${lista}</div>${hermanos}${pintaHistoria()}`;
}
const KIND={joined:'teal',category:'teal',evaluation:'oro',callup:'navy',consent:'teal',withdrawn:'rojo',benefit:'oro'};
function pintaHistoria(){
  const t=F?.historia||[];
  if(!t.length)return '';
  const filas=t.slice(0,12).map(e=>`<li><i class="${KIND[e.kind]||'teal'}"></i><span><strong>${esc(e.title)}</strong><small>${esc(fecha(e.date))}${e.detail?` · ${esc(e.detail)}`:''}</small></span></li>`).join('');
  return `<div class="ficha-card"><h3>SU HISTORIA EN EL CLUB</h3><ol class="ficha-linea">${filas}</ol></div>`;
}

/* ---------- Familia ---------- */
function pintaFamilia(){
  const box=$('fichaFamilia');if(!box||!F)return;
  const g=F.guardians||[];
  const tutores=g.map(t=>{const tel=telefono(t);return `<div class="ficha-fila fija"><i class="teal"></i><span><strong>${esc(t.name||'Tutor')}</strong><small>${esc([t.relationship,t.isPrimary?'principal':'',t.receivesBilling?'paga la mensualidad':''].filter(Boolean).join(' · '))}</small></span>${tel?`<a class="ficha-mini" href="https://wa.me/${tel}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(t.name||'tutor')}">${svg('wa',18)}</a><a class="ficha-mini" href="tel:+${tel}" aria-label="Llamar a ${esc(t.name||'tutor')}">${svg('tel',18)}</a>`:''}</div>`;}).join('');
  const hermanos=(F.hermanos||[]).map(h=>`<a class="ficha-fila" href="/jugadores/?player=${encodeURIComponent(h.id)}"><i class="oro"></i><span><strong>${esc(h.name)}</strong><small>${esc(h.category||'Sin categoría')}${h.status!=='active'?' · baja':''}</small></span>${svg('chevron',16)}</a>`).join('');
  box.innerHTML=`<div class="ficha-card"><h3>TUTORES</h3>${tutores||'<p class="ficha-vacio">Sin tutor registrado. Agrégalo abajo.</p>'}</div>
    <div class="ficha-card"><h3>HERMANOS EN EL CLUB</h3>${hermanos||'<p class="ficha-vacio">No tiene hermanos registrados en el club.</p>'}</div>`;
}

/* ---------- Documentos con avance y aviso ---------- */
function pintaDocs(){
  const box=$('docsProgreso');if(!box||!F?.docs)return;
  const {total,entregados,nombres}=F.docs;
  const g=tutorPrincipal(),tel=telefono(g);
  const msg=encodeURIComponent(`Hola, para completar el expediente de ${F.player.firstName||'su Tanner'} en Tannery City nos falta: ${nombres.join(', ')}. ¿Nos lo pueden compartir? Gracias.`);
  box.innerHTML=`<div class="docs-barra"><span style="width:${total?Math.round(entregados/total*100):0}%"></span></div>
    <div class="docs-linea"><strong>${entregados} de ${total} entregados</strong>${nombres.length&&tel?`<a class="docs-wa" href="https://wa.me/${tel}?text=${msg}" target="_blank" rel="noopener">${svg('wa',16)} Pedir por WhatsApp</a>`:''}</div>`;
  box.hidden=!total;
}

/* ---------- Permiso de imagen: tocar el aviso abre el registro ---------- */
function abrirPermisos(){
  const box=$('consentBox');if(!box)return;
  box.classList.remove('hidden');
  if(!box.querySelector('.consent-wa')){
    const g=tutorPrincipal(),tel=telefono(g);
    if(tel){
      const msg=encodeURIComponent(`Hola, en Tannery City queremos compartir fotos y videos de ${F?.player?.firstName||'su Tanner'} en redes del club. ¿Nos autoriza el uso de su imagen? Puede responder "Sí autorizo". Gracias.`);
      box.insertAdjacentHTML('afterbegin',`<a class="consent-wa" href="https://wa.me/${tel}?text=${msg}" target="_blank" rel="noopener">${svg('wa',16)} Pedir el permiso por WhatsApp</a>`);
    }
  }
  box.scrollIntoView({behavior:'smooth',block:'center'});
}

function pintaTodo(){pintaAvatar();pintaChips();pintaBeca();pintaAcciones();pintaCuenta();pintaPerfil();pintaTabs();pintaResumen();pintaFamilia();pintaDocs();}

/* ---------- Eventos de la ficha ---------- */
async function alAbrir(d){
  d=d||{};
  const mismo=F&&F.playerId===d.playerId;
  const pm=await permisos();
  const tabInicial=['Formadores','Academia'].includes(pm.rol)?'deportivo':'resumen';
  F={...(mismo?F:{}),playerId:d.playerId,player:d.player||{},guardians:d.guardians||[],canWrite:Boolean(d.canWrite),canMoney:Boolean(d.canMoney),
     puedeCobrar:pm.cobrar,org:d.organizationId,tab:mismo?F.tab:tabInicial};
  if(!mismo){cerrarCarta();cerrarMas();vista()?.classList.remove('ficha-foto-abierta');}
  asegurarMas();
  pintaTodo();
  // Lo que llegó mientras se revisaban permisos (pagos, becas, documentos,
  // deportivo) se aplica ya: si no, se perdía en la carrera.
  const av=window.__tannerAvisos||{};
  if(av['tanner-cuenta']?.playerId===d.playerId)alCuenta(av['tanner-cuenta']);
  if(av['tanner-benefits']?.playerId===d.playerId)alBecas(av['tanner-benefits']);
  if(av['tanner-docs']?.playerId===d.playerId)alDocs(av['tanner-docs']);
  if(av['tanner-sports']?.playerId===d.playerId){pintaPerfil();pintaResumen();}
  const id=d.playerId;
  rpc('v2_player_story',{organization_id:d.organizationId,player_id:id}).then(r=>{if(F?.playerId!==id)return;F.hermanos=r?.siblings||[];F.historia=r?.timeline||[];pintaChips();pintaResumen();pintaFamilia();}).catch(()=>{});
  if(pm.asistencia){
    const hasta=new Date(),desde=new Date(Date.now()-30*86400000),iso=x=>x.toISOString().slice(0,10);
    rpc('v2_attendance_player',{organization_id:d.organizationId,player_id:id,from_date:iso(desde),to_date:iso(hasta)}).then(a=>{
      if(F?.playerId!==id)return;
      const c=a?.current||{};
      F.asistencia=c.scheduled>0?{pct:c.pct,texto:`${c.attended||0} de ${c.scheduled} entrenamientos`}:null;pintaPerfil();
    }).catch(()=>{});
  }
}
function alCuenta(x){if(F&&x?.playerId===F.playerId){F.cuenta=x.data;pintaCuenta();pintaAcciones();}}
document.addEventListener('tanner-profile-opened',e=>alAbrir(e.detail));
document.addEventListener('tanner-cuenta',e=>alCuenta(e.detail));
document.addEventListener('tanner-sports',e=>{if(F&&e.detail?.playerId===F.playerId){pintaPerfil();pintaResumen();}});
function alDocs(x){
  if(!F||x?.playerId!==F.playerId)return;
  const rows=x.rows||[];
  const LBL={birth_certificate:'Acta de nacimiento',curp:'CURP',studies:'Constancia de estudios'};
  const faltan=rows.filter(r=>!r.received);
  F.docs={total:rows.length,entregados:rows.length-faltan.length,faltan:faltan.length,nombres:faltan.map(r=>LBL[r.type]||r.type)};
  pintaChips();pintaResumen();pintaDocs();
}
document.addEventListener('tanner-docs',e=>alDocs(e.detail));
const TIPO={scholarship_full:'Beca total',scholarship_partial:'Beca parcial'};
function alBecas(x){
  if(!F||x?.playerId!==F.playerId)return;
  const b=(x.benefits||[]).find(y=>y.active);
  if(!b){F.beca=null;pintaBeca();return;}
  F.beca={tipo:TIPO[b.type]||(String(b.type||'').startsWith('scholarship')?'Beca':'Apoyo'),
    cuanto:b.percentage!=null?`${Number(b.percentage)}% de la mensualidad`:b.fixedAmount!=null?`${pesos(b.fixedAmount)} al mes`:'',
    quien:b.sponsorName||b.fundingSource||'',hasta:b.endsOn||null,pendiente:Boolean(b.blocksBilling)};
  pintaBeca();
}
document.addEventListener('tanner-benefits',e=>alBecas(e.detail));
// La foto la pone photos.js en la carta; el avatar redondo la refleja.
const fotoObs=new MutationObserver(()=>{if(F)pintaAvatar();});
if($('photoBox'))fotoObs.observe($('photoBox'),{childList:true,subtree:true,attributes:true,attributeFilter:['src']});

document.addEventListener('click',e=>{
  const t=e.target.closest?.('[data-ficha-tab],[data-ficha-ir],[data-ficha-evaluar],[data-ficha-mas],[data-ficha-cerrar-mas],[data-ficha-carta],[data-ficha-foto],[data-ficha-permiso],#fichaAvatar,#fichaCartaFondo,#privacyBadges .profile-badge,.ficha-mas-viejas a[href^="#"]');
  if(!t||!F)return;
  if(t.matches('[data-ficha-tab]')){F.tab=t.dataset.fichaTab;pintaTabs();return;}
  if(t.matches('[data-ficha-ir]')){e.preventDefault();irA(t.dataset.fichaIr);return;}
  if(t.matches('[data-ficha-evaluar]')){e.preventDefault();cerrarMas();irA('deportivo',()=>$('openEvaluation')?.click());return;}
  if(t.matches('[data-ficha-mas]')){abrirMas();return;}
  if(t.matches('[data-ficha-cerrar-mas]')){cerrarMas();return;}
  if(t.matches('[data-ficha-carta],#fichaAvatar')){cerrarMas();abrirCarta();return;}
  if(t.matches('#fichaCartaFondo')){cerrarCarta();return;}
  if(t.matches('[data-ficha-foto]')){
    // Abre la caja de foto (tomarla con la cámara o elegir archivo) en lugar
    // de ir directo al archivo: en el iPad lo normal es tomarla ahí mismo.
    cerrarMas();vista()?.classList.add('ficha-foto-abierta');
    $('photoEditor')?.scrollIntoView({behavior:'smooth',block:'center'});return;
  }
  if(t.matches('[data-ficha-permiso]')){abrirPermisos();return;}
  if(t.matches('#privacyBadges .profile-badge')){if(t.id!=='consentToggle'&&$('consentBox'))abrirPermisos();return;}
  if(t.matches('.ficha-mas-viejas a[href^="#"]')){
    e.preventDefault();cerrarMas();
    irA(t.getAttribute('href')==='#sportsSnapshot'?'deportivo':'expediente');
  }
});
// Escape cierra primero lo de encima (carta u hoja). Va en captura y no se
// propaga: si no, el mismo Escape también cerraba toda la ficha.
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(vista()?.classList.contains('ficha-carta')){cerrarCarta();e.stopImmediatePropagation();}
  else if($('fichaMas')&&!$('fichaMas').hidden){cerrarMas();e.stopImmediatePropagation();}
},true);

// La ficha pudo abrirse (?player=) antes de que este módulo cargara.
if(window.__tannerAbierto)alAbrir(window.__tannerAbierto);
