import {supabase,rpc,money,$,PUSH_PUBLIC_KEY,urlBase64ToUint8Array} from '/v2/shell.js';
import { pendientesDe, proximoEvento, cuandoEs, saludo, avisosSinLeer } from '/v2/familias/inicio.js';
import { instalaVocabulario } from '/v2/vocabulario.js';
import { llaveDeLiga } from '/v2/club-publico.js';
import { correoDeEntrada, tokenDeLiga, primeraPalabra, conEspacios } from '/v2/invitaciones/invitaciones.js';
import {getSignedPhotoUrl, getSignedPhotoUrls, clearPhotoCache} from '/v2/photo-cache.js';
// El mismo criterio que usa el staff, para que un papa y Presidencia nunca
// vean dos porcentajes distintos del mismo Tanner.
import {etiquetaDeEstado, estadoDeAsistencia} from '/v2/asistencia/estadisticas.js';
import {conOferta, kitConOferta, sugerenciasDeKit, textoSugerencia, quitaUnaPieza, preparaLinea, agregaAlCarrito, quitaDelCarrito, totalDelCarrito,
        piezasDelCarrito, acomodaVitrina, tallasDe, tallaUnica,
        aceptaPersonalizacion, preparaKit, ranurasDeKit, tiersDeKit,
        precioDeKit, llaveDeCarrito, ESCALA_NINOS, ESCALA_ADULTOS, armaRecompra, mesesDesde, conOpcionesDeKit, ranuraElegida, conRecargo,
        admiteVariasTallas, preparaLineasPorTalla, cambiaCantidadDeTalla} from '/v2/tienda.js';
/* El dibujo de la tienda ya no vive aqui: lo comparten esta pantalla y el link
   publico de compra. Ver el encabezado de /v2/vitrina.js. */
import {inicialesDe, filaDeTalla, tarjetaProducto as dibujaProducto,
        tarjetaKit as dibujaKit, lineaDelCarrito} from '/v2/vitrina.js';

// Portal de familias. No usa el shell del staff a propósito: un tutor no tiene
// módulos que navegar, y mezclar ambas superficies es como se filtran datos.
// Todo lo que se muestra viene de los RPC v2_portal_*, que resuelven al tutor
// por auth.uid() y nunca confían en un id que mande esta página.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CHARGE_LABEL={monthly_fee:'Mensualidad',late_fee:'Recargo',academy_fee:'Academia',uniform:'Uniforme',
  parking_pass:'Gafete',other:'Otro cargo'};
const chargeLabel=t=>CHARGE_LABEL[t]||'Cargo';
// De qué fue cada pago. El portal mostraba todos los cargos pero sólo los
// pagos de mensualidad: quien pagaba un uniforme veía el cargo y no su abono.
const PAY_LABEL={billing:'Mensualidad',commerce:'Tienda',registration:'Inscripción',program:'Academia',other:'Otro concepto'};
const payLabel=t=>PAY_LABEL[t]||'';
// Estado del pedido en español. Lo que guarda la tienda viene en inglés y un
// papá no tiene por qué leer "delivered" en su estado de cuenta.
const ORDER_LABEL={draft:'Por confirmar',pending:'Apartado',confirmed:'Confirmado',
  in_production:'En producción',ready:'Listo para recoger',delivered:'Entregado',
  cancelled:'Cancelado',paid:'Pagado'};
const orderLabel=t=>ORDER_LABEL[t]||'';
// ?tab=tienda abre directo en la Tienda: es a donde manda el link público de
// compra a la familia que ya tiene cuenta ("Ya soy familia Tanner").
// Fase 2 (18/10/2026): Inicio es la primera pantalla; Calendario y Gafete
// viven juntos en "Club". Las ligas viejas (?tab=calendario|gafete) siguen.
const TAB_PEDIDA=new URLSearchParams(location.search).get('tab');
const TAB_INICIAL=['inicio','cuenta','progreso','tienda','club'].includes(TAB_PEDIDA)?TAB_PEDIDA:['calendario','gafete'].includes(TAB_PEDIDA)?'club':'inicio';
const state={home:null,playerId:'',tab:TAB_INICIAL,clubSub:TAB_PEDIDA==='gafete'?'gafete':'calendario',avisos:null,statements:{},progress:{},paperwork:{},calendar:null,catalog:null,cart:{},parking:null,ultimoPedido:{},recompra:null};

function show(id){['loginView','passwordView','inviteView','appView'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,text='',type='error'){
  const box=$(id);if(!box)return;
  box.textContent=text;box.dataset.type=type;box.classList.toggle('hidden',!text);
}
function friendly(error){
  const raw=String(error?.message||error||'Ocurrió un error.');
  if(/invalid login credentials/i.test(raw))return 'Teléfono, correo o contraseña incorrectos. Si no la recuerdas, toca "¿Olvidaste tu contraseña?".';
  if(/portal access required/i.test(raw))return 'Tu cuenta todavía no está ligada a un Tanner. Avísale al club.';
  if(/not authorized/i.test(raw))return 'No tienes acceso a esa información.';
  if(/failed to fetch|network/i.test(raw))return 'No pudimos conectar. Revisa tu señal e intenta de nuevo.';
  return raw;
}
function fmtDate(v){
  if(!v)return '';
  const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
  return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(d);
}
function initials(p){
  return [p.first_name,p.last_name].filter(Boolean).map(s=>String(s).trim()[0]||'').join('').toUpperCase().slice(0,2)||'T';
}
function ageOf(value){
  if(!value)return null;
  const born=new Date(`${String(value).slice(0,10)}T12:00:00`);
  if(Number.isNaN(born.getTime()))return null;
  const today=new Date();let years=today.getFullYear()-born.getFullYear();
  if(today.getMonth()<born.getMonth()||(today.getMonth()===born.getMonth()&&today.getDate()<born.getDate()))years--;
  return Math.max(0,years);
}
const currentPlayer=()=>(state.home?.players||[]).find(p=>String(p.id)===String(state.playerId))||null;

// Contrato de egress (docs/MEDIA_EGRESS_ARCHITECTURE.md): un avatar sólo consume
// miniatura y nunca cae a la foto original. Sin miniatura van las iniciales.
// La firma pasa por el caché compartido para que el navegador reutilice bytes.
async function signPhoto(p){
  const path=p.photo_thumb_path;
  if(!path)return '';
  try{return await getSignedPhotoUrl(supabase,p.photo_bucket||'tanneros-private',path)||'';}
  catch(e){return '';}
}

/* ---------- Acceso ---------- */
/* Se entra con el teléfono (las cuentas nuevas, 18/10/2026), con el usuario
   que dio el club o con el correo. Ver correoDeEntrada en /v2/invitaciones. */
const loginEmail=correoDeEntrada;

/* Con qué correo vive la cuenta: el servidor lo dice sólo si la contraseña
   es correcta (v2_public_family_login, h17). Así entra con su teléfono o con
   su correo aunque la cuenta se haya creado con otro dato. Si no lo resuelve
   (contraseña mala, sin red, usuario viejo), se intenta como antes. */
async function correoDeLaCuenta(dato,password){
  try{
    const {data,error}=await supabase.rpc('v2_public_family_login',{identificador:dato,contrasena:password});
    if(!error&&data?.login)return data.login;
  }catch(_){}
  return loginEmail(dato);
}

async function handleLogin(event){
  event.preventDefault();msg('loginMessage');
  const password=$('password').value;
  const btn=$('loginSubmit');btn.disabled=true;btn.textContent='Entrando…';
  try{
    const email=await correoDeLaCuenta($('email').value,password);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw error;
    await boot();
  }catch(error){msg('loginMessage',friendly(error));}
  finally{btn.disabled=false;btn.textContent='Entrar';}
}

async function handlePassword(event){
  event.preventDefault();msg('passwordMessage');
  const a=$('newPassword').value,b=$('confirmPassword').value;
  if(a.length<8){msg('passwordMessage','Usa al menos 8 caracteres.');return;}
  if(a!==b){msg('passwordMessage','Las contraseñas no coinciden.');return;}
  const btn=$('passwordSubmit');btn.disabled=true;btn.textContent='Guardando…';
  // Sólo se lee si de verdad se le pidió: un campo oculto con valor viejo no
  // debe acabar guardándose como su correo.
  const pideCorreo=!$('contactEmailField')?.classList.contains('hidden');
  const correo=pideCorreo?($('contactEmail')?.value.trim()||''):'';
  if(correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){msg('passwordMessage','Revisa tu correo, parece incompleto.');btn.disabled=false;btn.textContent='Guardar y entrar';return;}
  try{
    const {error}=await supabase.auth.updateUser({password:a});
    if(error)throw error;
    // El correo es opcional: si falla, no se le cierra la puerta a la familia
    // por un dato de contacto.
    if(correo){
      try{await supabase.functions.invoke('staff-access',{body:{action:'save_my_contact_email',email:correo}});}
      catch(e){console.warn('correo de contacto',e);}
    }
    const {data,error:fnError}=await supabase.functions.invoke('staff-access',{body:{action:'complete_password_change'}});
    if(fnError)throw fnError;
    if(data?.error)throw new Error(data.error);
    await supabase.auth.refreshSession();
    await boot();
  }catch(error){msg('passwordMessage',friendly(error));btn.disabled=false;btn.textContent='Guardar y entrar';}
}

/* ---------- Cuenta ---------- */
// Botones de WhatsApp al club. El numero vive en Administracion > Configuracion
// del club y llega en v2_portal_home; si el club no lo capturo, el boton no se
// pinta en lugar de abrir una conversacion vacia.
function waHref(texto){
  const num=String(state.home?.organization?.whatsapp||'').replace(/\D/g,'');
  if(num.length<11)return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
const WA_ICON='<svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.6c-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1-1.4-1-2.7s.6-1.9.9-2.2c.3-.3.6-.4.8-.4h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2.1.4 0 .5l-.4.5c-.1.2-.2.3-.1.5.2.3.8 1.4 1.8 2.2 1.3 1 2.3 1.3 2.6 1.5.3.1.4.1.6-.1l.6-.7c.2-.3.4-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.8-.1 1.4Z"/></svg>';
function waBoton(texto,etiqueta){
  const href=waHref(texto);
  if(!href)return '';
  return `<a class="fam-wa" href="${esc(href)}" target="_blank" rel="noopener">${WA_ICON}${esc(etiqueta)}</a>`;
}
// El motor de cobranza escribe conceptos como "Monthly fee 2026-08" o
// "Mensualidad 2026-09": para esos manda la etiqueta bonita. Un concepto que no
// sigue ese molde lo escribió una persona y dice más que cualquier etiqueta.
const conceptoPropio=m=>{
  const c=String(m.concept||'').trim();
  if(!c||m.kind!=='charge')return '';
  return /^(monthly fee|mensualidad|recargo|academia|academy)\b/i.test(c)?'':c;
};
const nombreDe=p=>[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'mi Tanner';

function playerProfileBlock(p){
  const name=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Tanner';
  const age=ageOf(p.birth_date);
  const position=[p.position,p.dominant_foot&&`Pie ${p.dominant_foot}`].filter(Boolean).join(' · ')||'Perfil deportivo';
  const faltantes=[
    !p.birth_date&&'fecha de nacimiento',
    !p.joined_at&&'desde cuándo está en el club'
  ].filter(Boolean);
  return `<section class="fam-player-profile">
    <span class="fam-profile-photo" data-profile-photo="${esc(p.id)}">${p._photo?`<img src="${esc(p._photo)}" alt="Foto de ${esc(name)}">`:esc(initials(p))}</span>
    <span class="fam-profile-main"><small>MI TANNER</small><strong>${esc(name)}</strong><span>${esc([p.category,position].filter(Boolean).join(' · '))}</span></span>
    <span class="fam-profile-facts">
      <span><small>Nacimiento</small><b>${p.birth_date?`${fmtDate(p.birth_date)}${age!==null?` · ${age} años`:''}`:'Por registrar'}</b></span>
      <span><small>Número</small><b>${esc(p.jersey_number||'Por asignar')}</b></span>
      <span><small>En el club</small><b>${p.joined_at?`Desde ${fmtDate(p.joined_at)}`:'Por registrar'}</b></span>
    </span>
    ${faltantes.length?waBoton(
      `Hola, soy familia de ${name}. Les paso lo que falta en su expediente: ${faltantes.join(', ')}.`,
      'Mandarle mis datos al club'):''}
  </section>`;
}
function balanceBlock(st){
  const s=st.summary||{};
  const saldo=Number(s.balance||0),aFavor=Number(s.credit_available||0);
  const estado=saldo>0?'due':aFavor>0?'credit':'clear';
  const titulo=saldo>0?'Tu saldo pendiente':aFavor>0?'Tienes saldo a favor':'Estás al corriente';
  const cifra=money.format(saldo>0?saldo:aFavor);
  const sub=saldo>0
    ? (s.oldest_due?`Lo más antiguo desde el ${fmtDate(s.oldest_due)}`:'Puedes pagar en el club')
    : aFavor>0?'Se aplicará automáticamente a tu próximo cargo':'No tienes nada pendiente. ¡Gracias!';
  const partes=(s.by_type||[]).map(t=>
    `<div class="fam-chip-val"><span>${esc(chargeLabel(t.type))}</span><b>${money.format(Number(t.pending||0))}</b></div>`).join('');
  return `<section class="fam-balance" id="famSaldo" data-state="${estado}"><span>${titulo}</span><strong>${cifra}</strong><small>${esc(sub)}</small>${partes?`<div class="fam-split">${partes}</div>`:''}</section>`;
}

function monthsBlock(st){
  const hoy=new Date().toISOString().slice(0,10),meses=new Map();
  (st.ledger||[]).filter(m=>m.kind==='charge'&&m.period).forEach(m=>{
    const k=String(m.period).slice(0,7);
    const acc=meses.get(k)||{key:k,cargado:0,saldo:0,vence:''};
    acc.cargado+=Number(m.amount||0);acc.saldo+=Number(m.charge_balance||0);
    if(m.date&&String(m.date)>acc.vence)acc.vence=String(m.date).slice(0,10);
    meses.set(k,acc);
  });
  const filas=[...meses.values()].sort((a,b)=>b.key.localeCompare(a.key));
  if(!filas.length)return '';
  const nombre=k=>{const d=new Date(`${k}-01T12:00:00`);
    return Number.isNaN(d.getTime())?k:new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','');};
  const anio=String(new Date().getFullYear());
  const cards=filas.map(f=>{
    const debe=f.saldo>0.004,vencido=debe&&f.vence&&f.vence<hoy;
    const estado=!debe?'pagado':vencido?'vencido':'pendiente';
    return `<div class="fam-mes" data-state="${estado}"><span class="fam-mes-nom">${esc(nombre(f.key))}</span><b>${money.format(debe?f.saldo:f.cargado)}</b><span class="fam-mes-pie">${!debe?'Pagado':vencido?'Vencido':'Por vencer'}</span>${f.key.slice(0,4)!==anio?`<small>${esc(f.key.slice(0,4))}</small>`:''}</div>`;
  }).join('');
  const pend=filas.filter(f=>f.saldo>0.004).length;
  return `<section class="fam-card"><div class="fam-card-head"><h2>Por mes</h2><span>${pend?`debes ${pend} mes${pend===1?'':'es'}`:'todo pagado'}</span></div><div class="fam-meses">${cards}</div></section>`;
}

function ledgerBlock(st){
  const rows=(st.ledger||[]).filter(m=>m.kind!=='payment'||m.status==='posted');
  if(!rows.length)return '';
  const html=rows.map(m=>{
    const pago=m.kind==='payment',monto=Number(m.amount||0);
    // El pedido de la tienda suma como cargo: es algo que la familia debe o pagó.
    const titulo=pago
      ? `Pago recibido${payLabel(m.subtype)?` · ${payLabel(m.subtype)}`:''}`
      : m.kind==='order'
        ? `Pedido de la tienda${m.folio?` · ${m.folio}`:''}`
        // Un ajuste trae un concepto escrito por una persona ("Mensualidades
        // atrasadas anteriores a julio"). Eso explica mejor que "Otro cargo · jun".
        : conceptoPropio(m)||`${chargeLabel(m.subtype)}${m.period?` · ${fmtDate(m.period).replace(/^\d+ /,'')}`:''}`;
    const detalle=pago
      ? `${fmtDate(m.date)}${m.method?` · ${esc(m.method)}`:''}`
      : m.kind==='order'
        ? `${fmtDate(m.date)}${orderLabel(m.status)?` · ${orderLabel(m.status)}`:''}`
        : `${fmtDate(m.date)}${Number(m.charge_balance||0)>0?` · faltan ${money.format(Number(m.charge_balance))}`:' · liquidado'}`;
    return `<div class="fam-mov" data-kind="${pago?'payment':'charge'}"><span><strong>${esc(titulo)}</strong><span>${detalle}</span></span><b>${pago?'−':'+'}${money.format(Math.abs(monto))}</b></div>`;
  }).join('');
  // El saldo de arriba es el de mensualidades; aquí abajo va todo el dinero que
  // se movió. Sin esta línea un pago de tienda se lee como saldo a favor.
  // Y si el club hizo corte, se dice desde cuándo: la cuenta no empieza en cero
  // porque sí, empieza donde el club la abrió.
  const desde=st.summary?.since
    ? ` Tu cuenta en la app arranca el ${fmtDate(st.summary.since)}.`:'';
  return `<section class="fam-card"><div class="fam-card-head"><h2>Movimientos</h2><span>${rows.length}</span></div><p class="fam-muted" style="margin:0 0 4px;font-size:12px">Todo lo que se te ha cobrado y todo lo que has pagado, del concepto que sea.${esc(desde)}</p>${html}</section>`;
}

function docsBlock(st){
  const docs=st.documents||[];
  if(!docs.length)return '';
  const LABEL={birth_certificate:'Acta de nacimiento',curp:'CURP',studies:'Constancia de estudios'};
  const faltan=docs.filter(d=>!d.received);
  if(!faltan.length)return '';
  const nombres=faltan.map(d=>LABEL[d.type]||String(d.type).replace(/_/g,' '));
  const rows=nombres.map(n=>`<div class="fam-mov"><span><strong>${esc(n)}</strong></span></div>`).join('');
  const boton=waBoton(
    `Hola, soy familia de ${nombreDe(currentPlayer())}. Les mando ${nombres.join(' y ')}.`,
    nombres.length===1?'Mandar este documento al club':'Mandar estos documentos al club');
  return `<section class="fam-card" id="famDocs"><div class="fam-card-head"><h2>Documentos por entregar</h2><span>faltan ${faltan.length} de ${docs.length}</span></div>${rows}${boton}</section>`;
}

/* ---------- Papeles del club ---------- */
// El reglamento y el uso de imagen se firmaban en papel o no se firmaban. Aquí
// la familia lee el texto completo y acepta; queda la fecha y la versión.
/* El permiso de imagen no es un "leí y acepto": es una pregunta con dos
   respuestas válidas, y las dos hay que guardarlas.

   Si sólo hubiera botón de aceptar, a la familia que no quiere se le seguiría
   preguntando para siempre y el club nunca sabría si es un "no" o un "todavía
   no le preguntamos". Medido el 23 de septiembre: 55 de 63 Tanners están en esa
   segunda casilla, y 43 de ellos ya tienen foto cargada.

   Por eso sale en su propia tarjeta, arriba, con las dos respuestas a la misma
   altura: ninguna está empujada. Decir que no no afecta la inscripción y eso
   se dice con todas sus letras. */
function imagenBlock(pw){
  const img=pw?.image_consent;
  if(!img)return '';
  const doc=(pw?.consents||[]).find(d=>d.code==='uso_de_imagen');
  const decidido=img.status!=='sin_preguntar';
  const si=img.status==='autoriza';

  if(!decidido){
    return `<section class="fam-card fam-imagen pendiente" id="famFotos">
      <div class="fam-card-head"><h2>¿Podemos publicar sus fotos?</h2><span>falta tu respuesta</span></div>
      <p class="fam-doc-body">${esc(doc?.body||'El club usa fotos y video de los entrenamientos y partidos en sus redes, su página y su publicidad. Tú decides si tu hijo o hija puede aparecer.')}</p>
      <p class="fam-imagen-nota">Decir que no <b>no afecta su inscripción</b> ni nada de lo que el club le da. Puedes cambiar de opinión cuando quieras.</p>
      <div class="fam-imagen-botones">
        <button class="fam-btn" type="button" data-imagen="si">Sí, puede salir</button>
        <button class="fam-btn fam-btn-no" type="button" data-imagen="no">No, prefiero que no</button>
      </div>
    </section>`;
  }
  return `<section class="fam-card fam-imagen ${si?'si':'no'}" id="famFotos">
    <div class="fam-card-head"><h2>Fotos y publicidad</h2><span>${si?'autorizado':'no autorizado'}</span></div>
    <p class="fam-imagen-estado"><i aria-hidden="true">${si?'✓':'⦸'}</i>
      ${si?'Sí puede aparecer en las redes y la publicidad del club.':'No aparece en las redes ni en la publicidad del club.'}
      ${si&&img.decided_at?`<small>Desde el ${esc(fmtDate(img.decided_at))}</small>`:''}</p>
    <button class="fam-btn fam-btn-cambiar" type="button" data-imagen="${si?'no':'si'}">
      ${si?'Cambiar a que no salga':'Cambiar a que sí pueda salir'}</button>
  </section>`;
}

function consentsBlock(pw){
  // uso_de_imagen sale de esta lista: tiene su propia tarjeta con dos
  // respuestas. Dejarlo aquí además sería preguntar lo mismo dos veces, y por
  // el camino viejo sólo se podría contestar que sí.
  const docs=(pw?.consents||[]).filter(d=>d.code!=='uso_de_imagen');
  if(!docs.length)return '';
  const filas=docs.map(d=>{
    const firmado=!!d.accepted_at&&!d.outdated;
    const pie=firmado
      ? `Firmado el ${fmtDate(d.accepted_at)}`
      : d.outdated
        ? 'El club actualizó este documento. Vuelve a leerlo y fírmalo.'
        : (d.required?'Obligatorio para el club':'Opcional, tú decides');
    return `<details class="fam-doc"${firmado?'':' open'}>
      <summary><span><strong>${esc(d.title)}</strong><span>${esc(pie)}</span></span>
        <i class="fam-doc-mark" data-ok="${firmado?'1':'0'}" aria-hidden="true"></i></summary>
      <p class="fam-doc-body">${esc(d.body)}</p>
      ${firmado?'':`<button class="fam-btn fam-doc-sign" type="button" data-consent="${esc(d.code)}">Leí y acepto</button>`}
    </details>`;
  }).join('');
  // Un documento que el club cambió después de firmarlo también avisa, aunque
  // sea opcional: la familia firmó otro texto.
  const faltan=docs.filter(d=>d.required&&!d.accepted_at).length;
  const cambiados=docs.filter(d=>d.outdated).length;
  const nota=faltan?`falta${faltan===1?'':'n'} ${faltan} por firmar`
    :cambiados?`${cambiados} se actualiz${cambiados===1?'ó':'aron'}`
    :'todo en orden';
  return `<section class="fam-card" id="famPapeles"><div class="fam-card-head"><h2>Papeles del club</h2><span>${nota}</span></div>${filas}</section>`;
}

/* Tu acceso: con qué entra la familia (teléfono o correo) y cuánto dura la
   sesión. El correo es opcional; con él también entra (h17). */
function accesoBlock(){
  const g=state.home?.guardian||{};
  const tel=String(g.phone||'').replace(/\D/g,'').slice(-10);
  const correo=String(g.email||'').trim();
  const formas=[tel.length===10?`tu teléfono <strong>${esc(conEspacios(tel))}</strong>`:'',correo?`tu correo <strong>${esc(correo)}</strong>`:''].filter(Boolean).join(' o ');
  return `<section class="fam-card" id="famAcceso"><div class="fam-card-head"><h2>Tu acceso</h2><span>${correo?'teléfono y correo':'agrega tu correo'}</span></div>
    <p class="fam-acceso-txt">${formas?`Entras con ${formas}, y tu contraseña.`:'Entras con el usuario que te dio el club.'}</p>
    <form id="famCorreoForm" class="fam-acceso-form">
      <label for="famCorreo">${correo?'Cambiar mi correo':'Mi correo (opcional)'}</label>
      <span class="fam-acceso-fila"><input id="famCorreo" type="email" autocomplete="email" placeholder="tu@correo.com" value="${esc(correo)}"><button type="submit" class="fam-btn fam-btn-sm" id="famCorreoGuardar">Guardar</button></span>
      <small class="fam-hint">Con él también puedes entrar, y ahí te llegan recibos.</small>
      <div id="famCorreoMsg" class="fam-message hidden"></div>
    </form>
    <p class="fam-acceso-nota">Tu sesión se queda abierta en este celular hasta que toques <b>Salir</b>.</p></section>`;
}

function cableaAcceso(){
  $('famCorreoForm')?.addEventListener('submit',async e=>{
    e.preventDefault();msg('famCorreoMsg');
    const correo=$('famCorreo').value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){msg('famCorreoMsg','Revisa tu correo, parece incompleto.');return;}
    const btn=$('famCorreoGuardar');btn.disabled=true;btn.textContent='Guardando…';
    try{
      const r=await rpc('v2_save_my_contact_email',{email:correo});
      if(state.home?.guardian)state.home.guardian.email=r?.email||correo;
      await renderCuenta();
      msg('famCorreoMsg','Listo. Ya puedes entrar también con tu correo.','success');
    }catch(error){msg('famCorreoMsg',friendly(error));btn.disabled=false;btn.textContent='Guardar';}
  });
}

// La beca: o se ve la que ya tiene, o se pide explicando por qué.
function benefitBlock(pw){
  const b=pw?.benefit,r=pw?.benefit_request;
  if(b?.has){
    const cuanto=b.percentage?`${Number(b.percentage)}% de descuento`
      :b.amount?`${money.format(Number(b.amount))} de apoyo`:'Apoyo activo';
    return `<section class="fam-card"><div class="fam-card-head"><h2>Tu beca</h2><span>activa</span></div>
      <div class="fam-mov"><span><strong>${esc(cuanto)}</strong><span>${
        b.since?`Desde ${fmtDate(b.since)}`:''}${b.until?` · hasta ${fmtDate(b.until)}`:''}</span></span></div></section>`;
  }
  if(r&&r.status==='pending'){
    return `<section class="fam-card"><div class="fam-card-head"><h2>Tu beca</h2><span>en revisión</span></div>
      <div class="fam-mov"><span><strong>El club está revisando tu solicitud</strong><span>La mandaste el ${fmtDate(r.requested_at)}</span></span></div></section>`;
  }
  const previa=r&&r.status==='rejected'
    ? `<p class="fam-muted" style="margin:0 0 10px;font-size:12.5px">Tu solicitud anterior no procedió${r.note?`: ${esc(r.note)}`:'.'} Puedes volver a pedirla.</p>`:'';
  return `<section class="fam-card"><div class="fam-card-head"><h2>Beca</h2></div>${previa}
    <details class="fam-doc"><summary><span><strong>Solicitar una beca</strong><span>Cuéntanos tu situación y el club la revisa</span></span><i class="fam-doc-mark" data-ok="0" aria-hidden="true"></i></summary>
      <textarea id="benefitReason" class="fam-textarea" rows="4" maxlength="2000" placeholder="Cuéntanos por qué la necesitas. Entre más claro, mejor puede ayudarte el club."></textarea>
      <div id="benefitMessage" class="fam-message hidden"></div>
      <button id="benefitSend" class="fam-btn" type="button">Enviar solicitud</button>
    </details></section>`;
}

async function renderCuenta(){
  const p=currentPlayer();
  if(!p){$('famBody').innerHTML='<div class="fam-empty">Tu cuenta todavía no tiene un Tanner ligado. Avísale al club.</div>';return;}
  if(!state.statements[p.id]){
    $('famBody').innerHTML='<div class="fam-empty">Cargando tu estado de cuenta…</div>';
    try{state.statements[p.id]=await rpc('v2_portal_statement',{player_id:p.id});}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  // El papeleo no bloquea el saldo: si falla, la cuenta se ve igual.
  if(!state.paperwork[p.id]){
    try{state.paperwork[p.id]=await rpc('v2_portal_paperwork',{player_id:p.id});}
    catch(error){console.warn('papeleo',error);state.paperwork[p.id]={};}
  }
  const st=state.statements[p.id],pw=state.paperwork[p.id];
  $('famBody').innerHTML=`${playerProfileBlock(p)}${balanceBlock(st)}${monthsBlock(st)}${ledgerBlock(st)}${docsBlock(st)}${imagenBlock(pw)}${consentsBlock(pw)}${benefitBlock(pw)}${accesoBlock()}`;
  cableaTramites(p);cableaAcceso();
}

function cableaTramites(p){
  $('famBody').querySelectorAll('[data-consent]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;btn.textContent='Firmando…';
    try{
      await rpc('v2_portal_accept_consent',{player_id:p.id,code:btn.dataset.consent});
      delete state.paperwork[p.id];
      await renderCuenta();
    }catch(error){
      await tosAlert({kicker:'PAPELES',title:'No se pudo firmar',message:friendly(error)});
      btn.disabled=false;btn.textContent='Leí y acepto';
    }
  }));
  $('famBody').querySelectorAll('[data-imagen]').forEach(btn=>btn.addEventListener('click',async()=>{
    const autoriza=btn.dataset.imagen==='si';
    const antes=btn.textContent;
    btn.disabled=true;btn.textContent='Guardando…';
    try{
      await rpc('v2_portal_decide_image_consent',{player_id:p.id,authorize:autoriza});
      delete state.paperwork[p.id];
      await renderCuenta();
    }catch(error){
      await tosAlert({kicker:'FOTOS',title:'No se pudo guardar',message:friendly(error)});
      btn.disabled=false;btn.textContent=antes;
    }
  }));

  const enviar=$('benefitSend');
  if(enviar)enviar.addEventListener('click',async()=>{
    const motivo=$('benefitReason').value.trim();
    if(motivo.length<20){msg('benefitMessage','Cuéntanos un poco más: al menos 20 caracteres.');return;}
    enviar.disabled=true;enviar.textContent='Enviando…';
    try{
      await rpc('v2_portal_request_benefit',{player_id:p.id,reason:motivo});
      delete state.paperwork[p.id];
      await renderCuenta();
    }catch(error){
      msg('benefitMessage',friendly(error));
      enviar.disabled=false;enviar.textContent='Enviar solicitud';
    }
  });
}

/* ---------- Calendario ---------- */
async function renderCalendario(){
  if(!state.calendar){
    $('famBody').innerHTML='<div class="fam-empty">Cargando calendario…</div>';
    const desde=new Date(),hasta=new Date();hasta.setDate(hasta.getDate()+60);
    try{state.calendar=await rpc('v2_portal_calendar',{from_at:desde.toISOString(),to_at:hasta.toISOString()});}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const rows=state.calendar||[];
  // El cumpleaños no lleva hora: poner "9:00 a.m." haría creer que hay algo
  // agendado a esa hora. Los del equipo de su hijo se marcan.
  const fila=e=>{
    const d=new Date(e.starts_at);
    const cumple=e.kind==='birthday';
    const dia=new Intl.DateTimeFormat('es-MX',{day:'numeric'}).format(d);
    const mes=new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','');
    const hora=cumple?'':new Intl.DateTimeFormat('es-MX',{hour:'numeric',minute:'2-digit'}).format(d);
    const detalle=[hora,e.location,e.category].filter(Boolean).join(' · ');
    return `<div class="fam-ev" data-kind="${cumple?'birthday':'session'}"${cumple&&e.mine?' data-mine="1"':''}><span class="fam-ev-day"><b>${esc(dia)}</b><span>${esc(mes)}</span></span><span class="fam-ev-body"><strong>${cumple?'<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-2px;margin-right:4px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21h16"/><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M5 16c2 1.5 4 1.5 7 0s5-1.5 7 0"/><path d="M12 12V8"/><path d="M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5Z"/></svg>':''}${esc(e.title||'Actividad')}</strong><span>${esc(detalle)}</span></span></div>`;
  };
  const ordena=(a,b)=>new Date(a.starts_at)-new Date(b.starts_at);
  const sesiones=rows.filter(e=>e.kind!=='birthday').sort(ordena);
  const cumples=rows.filter(e=>e.kind==='birthday').sort(ordena);
  const bloque=(titulo,lista,vacio)=>lista.length
    ? `<section class="fam-card"><div class="fam-card-head"><h2>${titulo}</h2><span>${lista.length}</span></div>${lista.map(fila).join('')}</section>`
    : `<section class="fam-card"><div class="fam-card-head"><h2>${titulo}</h2></div><p class="fam-muted" style="margin:0;font-size:12.5px">${vacio}</p></section>`;
  $('famBody').innerHTML=
    bloque('Entrenamientos y eventos',sesiones,'El club todavía no publica las próximas fechas. Aquí te avisamos en cuanto las suba.')+
    (cumples.length?bloque('Cumpleaños Tanner',cumples,''):'');
}

/* ---------- Progreso ---------- */
// Las etiquetas del profe vienen en clave; aquí se traducen. "goalkeeper" es un
// objeto anidado con las áreas de portero y se aplana al mismo nivel.
const SCORE_LABEL={tecnica:'Técnica',valores:'Valores',intensidad:'Intensidad',
  mentalidad:'Mentalidad',inteligencia:'Inteligencia',
  manos:'Manos',pies:'Pies',aereo:'Juego aéreo',mando:'Mando',colocacion:'Colocación'};
function aplanaScores(scores){
  const out=[];
  Object.entries(scores||{}).forEach(([k,v])=>{
    if(v&&typeof v==='object'){
      Object.entries(v).forEach(([k2,v2])=>{if(Number(v2)>0)out.push([SCORE_LABEL[k2]||k2,Number(v2)]);});
    }else if(Number(v)>0)out.push([SCORE_LABEL[k]||k,Number(v)]);
  });
  return out;
}
function evaluacionBlock(ev){
  const filas=aplanaScores(ev.scores).map(([nombre,valor])=>
    `<div class="fam-score"><span>${esc(nombre)}</span><span class="fam-bar"><i style="width:${Math.min(100,valor*10)}%"></i></span><b>${valor.toFixed(0)}</b></div>`).join('');
  const meta=[ev.by&&`Por ${ev.by}`,ev.date&&fmtDate(ev.date)].filter(Boolean).join(' · ');
  const objetivo=(etiqueta,texto)=>texto?`<div class="fam-goal"><small>${etiqueta}</small><p>${esc(texto)}</p></div>`:'';
  return `<section class="fam-card"><div class="fam-card-head"><h2>Valoración</h2><span>${esc(meta)}</span></div>${
    filas||'<p class="fam-muted" style="margin:0;font-size:12.5px">Sin calificaciones capturadas.</p>'}${
    objetivo('OBJETIVO DEPORTIVO',ev.sports_objective)}${
    objetivo('OBJETIVO FORMATIVO',ev.formative_objective)}${
    objetivo('NOTAS DEL PROFE',ev.notes)}</section>`;
}
async function renderProgreso(){
  const p=currentPlayer();
  if(!p){$('famBody').innerHTML='<div class="fam-empty">Tu cuenta todavía no tiene un Tanner ligado. Avísale al club.</div>';return;}
  if(!state.progress[p.id]){
    $('famBody').innerHTML='<div class="fam-empty">Cargando cómo va tu Tanner…</div>';
    try{state.progress[p.id]=await rpc('v2_portal_progress',{player_id:p.id});}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const d=state.progress[p.id],a=d.attendance||{},nombre=nombreDe(p);
  const pct=a.percent==null?null:Number(a.percent);
  const hero=`<section class="fam-hero">
    <span class="fam-hero-photo" data-profile-photo="${esc(p.id)}">${p._photo?`<img src="${esc(p._photo)}" alt="Foto de ${esc(nombre)}">`:esc(initials(p))}</span>
    <h2>${esc(nombre)}</h2>
    <p>${esc([p.category,p.position,p.jersey_number&&`#${p.jersey_number}`].filter(Boolean).join(' · ')||'Tanner')}</p>
    <div class="fam-stats" style="width:100%">
      <div class="fam-stat" data-tone="${pct==null?'':pct>=80?'ok':'warn'}"><b>${pct==null?'—':`${pct}%`}</b><span>ASISTENCIA</span></div>
      <div class="fam-stat"><b>${Number(a.present||0)}</b><span>PRESENTE</span></div>
      <div class="fam-stat"><b>${Number(a.absent||0)}</b><span>FALTAS</span></div>
    </div>
  </section>`;
  // Antes decia solo "Asistió" o "Faltó": un retardo salia como falta y una
  // justificada tambien, sin decir que estaba justificada. El estado real de
  // la base tiene cuatro valores y la familia merece verlos.
  const recientes=(d.recent||[]).map(r=>{
    const et=etiquetaDeEstado(r.status);
    const tono=et.nivel==='ok'?'var(--fam-ok)':(et.nivel==='bajo'?'var(--fam-danger)':'var(--fam-warn, #8a6410)');
    return `<div class="fam-mov"><span><strong>${esc(r.title||'Entrenamiento')}</strong><span>${esc(fmtDate(r.date))}</span></span><b style="color:${tono}">${esc(et.texto)}</b></div>`;
  }).join('');
  const listaAsistencia=recientes
    ? `<section class="fam-card"><div class="fam-card-head"><h2>Últimos entrenamientos</h2><span>${(d.recent||[]).length}</span></div>${recientes}</section>`
    : `<section class="fam-card"><div class="fam-card-head"><h2>Últimos entrenamientos</h2></div><p class="fam-muted" style="margin:0;font-size:12.5px">Todavía no hay listas tomadas para tu Tanner.</p></section>`;
  const evs=d.evaluations||[];
  const valoraciones=evs.length?evs.map(evaluacionBlock).join('')
    : `<section class="fam-card"><div class="fam-card-head"><h2>Valoración</h2></div><p class="fam-muted" style="margin:0;font-size:12.5px">Sus profes todavía no capturan una valoración. Aquí la vas a ver en cuanto la hagan.</p></section>`;
  $('famBody').innerHTML=hero+'<div id="famStaff"></div>'+tarjetaDelMes(p)+valoraciones+listaAsistencia;
  cargarMesDeAsistencia(p);
  pintaStaffDelHijo(p);
  // La foto llega firmada aparte, igual que en Cuenta.
  if(!p._photo&&p.photo_thumb_path){
    const url=await signPhoto(p);
    if(url){p._photo=url;const box=document.querySelector(`[data-profile-photo="${CSS.escape(String(p.id))}"]`);
      if(box)box.innerHTML=`<img src="${esc(url)}" alt="Foto de ${esc(nombre)}">`;}
  }
}

/* Sus profes (13/10/2026, "que los papás vean cuál es su entrenador"): los
   formadores de su categoría y Dirección deportiva, con foto, nombre y puesto.
   Sin teléfono: así lo decidió Presidencia. */
async function pintaStaffDelHijo(p){
  const box=document.getElementById('famStaff');if(!box)return;
  if(!state.staff){try{state.staff=await rpc('v2_portal_staff')||[];}catch(e){state.staff=[];}}
  const cat=String(p.category||'').trim().toLowerCase();
  const suyos=(state.staff||[]).filter(s=>s.level==='direccion'||(s.categories||[]).some(c=>String(c).trim().toLowerCase()===cat))
    .sort((a,b)=>(a.level==='formador'?0:1)-(b.level==='formador'?0:1));
  if(!suyos.length||document.getElementById('famStaff')!==box)return;
  box.innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Sus profes</h2><span>${suyos.length}</span></div><div class="fam-staff">${suyos.map(s=>
    `<div class="fam-staff-p"><span class="fam-staff-cara" data-staff-foto="${esc(s.photoThumbPath||'')}">${esc(String(s.fullName||'').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span><span><strong>${esc(s.fullName)}</strong><small>${esc(s.title||'')}</small></span></div>`).join('')}</div></section>`;
  const rutas=suyos.map(s=>s.photoThumbPath).filter(Boolean);
  if(!rutas.length)return;
  try{const urls=await getSignedPhotoUrls(supabase,'tanneros-private',rutas)||{};
    box.querySelectorAll('[data-staff-foto]').forEach(el=>{const u=urls[el.dataset.staffFoto];if(u)el.innerHTML=`<img src="${esc(u)}" alt="">`;});}catch(e){/* se quedan las iniciales */}
}

/* ---------- Tienda ----------

   Comprar aquí tiene que costar lo mismo que en cualquier tienda del
   teléfono: elegir talla, tocar Agregar, tocar Apartar. Tres toques.

   Por eso no hay ventana de producto: todo vive en la tarjeta. Un modal
   agrega dos toques (abrir y cerrar) y en un teléfono tapa la pantalla justo
   cuando la familia quiere comparar dos jerseys.

   Las reglas de qué se puede agregar viven en /v2/tienda.js, sin DOM, para
   poder probarlas sin navegador y para que el mostrador de Taquilla y este
   portal no acaben con reglas distintas sobre la misma playera. */
function cartTotal(){ return totalDelCarrito(state.cart); }
function renderCartBar(){
  document.getElementById('famCart')?.remove();
  const n=piezasDelCarrito(state.cart);
  if(!n||state.tab!=='tienda')return;
  const bar=document.createElement('div');
  bar.id='famCart';bar.className='fam-cart';
  const p=currentPlayer();
  bar.innerHTML=`<span><strong>${money.format(cartTotal())}</strong>`
    +`<span>${n} artículo${n===1?'':'s'}${p?` · para ${esc(String(p.first_name||'').trim()||'tu Tanner')}`:''}</span></span>`
    +`<button id="famCheckout" type="button">Apartar</button>`;
  document.body.appendChild(bar);
  document.getElementById('famCheckout').addEventListener('click',checkout);
}
async function checkout(){
  const p=currentPlayer();
  if(!p){await tosAlert({kicker:'TIENDA',title:'Falta elegir a tu Tanner',message:'Selecciona de quién es el pedido antes de apartarlo.'});return;}
  const lineas=Object.values(state.cart);
  if(!lineas.length)return;
  /* Lo que se estampa viaja en el pedido, no en las notas.
   *
   * Antes el nombre y el numero de la espalda se metian como texto libre en
   * las notas, porque el RPC del portal no los aceptaba por separado. La hoja
   * de produccion lee 'nombrePers' y 'numero' de cada renglon: una familia
   * pedia el jersey con el nombre de su hijo, el club lo cobraba, y el
   * maquilador recibia una hoja sin nombre.
   *
   * Se manda el mismo formato de linea que usa el mostrador de Taquilla, para
   * que el club tenga UN solo formato de pedido y no dos. */
  const items=lineas.map(l=>l.kind==='bundle'
    ? {kind:'bundle',bundleId:l.bundleId,tier:l.tier,
       personalizationName:l.personalizationName||null,number:l.numero||null,sleeve:l.manga||null,
       pieces:(l.piezas||[]).map(p=>({productId:p.productId,talla:p.talla||null,...(p.manga?{sleeve:p.manga}:{})}))}
    : {kind:'product',productId:l.productId,quantity:l.cantidad,talla:l.talla||null,
       personalizationName:l.personalizationName||null,number:l.numero||null,sleeve:l.manga||null,
       // La llave vieja tambien, por si el despliegue de la base va detras.
       product_id:l.productId,size:l.talla||null});
  const notas=null;
  const btn=document.getElementById('famCheckout');btn.disabled=true;btn.textContent='Enviando…';
  try{
    const res=await rpc('v2_portal_place_order',{player_id:p.id,items,notes:notas});
    state.cart={};renderCartBar();
    $('famBody').insertAdjacentHTML('afterbegin',
      `<section class="fam-card"><div class="fam-card-head"><h2>Pedido apartado</h2><span>${esc(res.folio||'')}</span></div><div class="fam-mov"><span><strong>Lo tenemos registrado</strong><span>El club te confirma disponibilidad y forma de pago. Total ${money.format(Number(res.total||0))}.</span></span></div></section>`);
    renderTienda();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){await tosAlert({kicker:'TIENDA',title:'No se pudo apartar el pedido',message:friendly(error)});btn.disabled=false;btn.textContent='Apartar';}
}
// La vitrina es una colección: sólo miniaturas, firmadas por el caché compartido
// (docs/MEDIA_EGRESS_ARCHITECTURE.md). Un producto sin miniatura se queda con
// su recuadro en vez de arrastrar el original.
async function pintaFotos(rows){
  const porBucket={};
  rows.forEach(p=>{
    const path=p.photo_thumb_path;
    if(!path)return;
    const b=p.photo_bucket||'tanneros-private';
    (porBucket[b]=porBucket[b]||[]).push({id:p.id,path,name:p.name});
  });
  for(const b of Object.keys(porBucket)){
    try{
      const mapa=await getSignedPhotoUrls(supabase,b,porBucket[b].map(x=>x.path));
      porBucket[b].forEach(x=>{
        const url=mapa[x.path];if(!url)return;
        const box=document.querySelector(`[data-shot="${CSS.escape(String(x.id))}"]`);
        if(box)box.innerHTML=`<img src="${esc(url)}" alt="${esc(x.name||'Producto')}" loading="lazy">`;
      });
    }catch(e){console.warn('fotos de la tienda',e);}
  }
}
// Lo que la familia lleva elegido de ese producto, antes de agregarlo.
const eligiendo={};
// Lo que la familia lleva elegido de un kit, antes de agregarlo.
const eligiendoKit={};
/* Las iniciales de un producto sin foto.
   Taquilla ya lo resolvia asi y Familias dejaba un recuadro gris: dos tiendas
   del mismo club resolviendo distinto el mismo hueco, y la peor era la que ven
   las familias. */
/* inicialesDe, filaDeTalla, tarjetaProducto, tarjetaKit y lineaDelCarrito se
   mudaron a /v2/vitrina.js. Aqui se quedan solo las dos envolturas que les
   pasan lo que ESTA pantalla lleva elegido. */
const tarjetaProducto = p => dibujaProducto(p, eligiendo[p.id] || {});
const tarjetaKit = k => dibujaKit(k, eligiendoKit[k.id] || {});

async function renderTienda(){
  if(!state.catalog){
    $('famBody').innerHTML='<div class="fam-empty">Cargando tienda…</div>';
    try{state.catalog=await rpc('v2_portal_catalog');}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  /* El catalogo llega en dos formas.
   *
   * La de siempre era un arreglo pelon de productos. La nueva es
   * {products, bundles}, porque los kits viven en otra tabla y hasta hoy no
   * llegaban al portal. Se aceptan LAS DOS para que a quien tenga la pagina
   * abierta en el momento del despliegue no se le rompa la tienda. */
  const datos=state.catalog;
  // Ofertas (g5): el precio de oferta como precio, y el de antes para tacharlo.
  const conR=conRecargo({products:(Array.isArray(datos)?datos:(datos?.products||[])).map(conOferta),bundles:Array.isArray(datos)?[]:(datos?.bundles||[])},datos?.recargoMangaLarga);
  const productos=conR.products;
  const kits=conR.bundles.map(k=>conOpcionesDeKit(kitConOferta(k),productos));
  state.kitsVisibles=kits;
  const rows=acomodaVitrina(productos);
  // Comprar otra vez (13/10/2026): el último pedido de este Tanner.
  const jugador=currentPlayer();
  if(jugador&&!(jugador.id in state.ultimoPedido)){
    try{state.ultimoPedido[jugador.id]=await rpc('v2_portal_last_order',{player_id:jugador.id});}catch(e){state.ultimoPedido[jugador.id]=null;}
  }
  const ultimo=jugador?state.ultimoPedido[jugador.id]:null;
  const otraVez=armaRecompra(ultimo,productos,kits);
  const bloqueOtraVez=(ultimo&&otraVez.lineas.length)
    ? (()=>{const piezas=otraVez.lineas.reduce((n,l)=>n+(l.kind==='bundle'?1:Number(l.cantidad||1)),0);
        const total=totalDelCarrito(otraVez.lineas.reduce((c,l)=>agregaAlCarrito(c,l),{}));
        const meses=mesesDesde(ultimo.createdAt);
        const quePide=otraVez.lineas.slice(0,3).map(l=>[l.nombreProducto,l.talla||(l.piezas||[]).map(x=>x.talla).filter(Boolean)[0]].filter(Boolean).join(' · ')).join(', ');
        return `<section class="fam-card fam-otravez"><div class="fam-card-head"><h2>Comprar otra vez</h2><span>${piezas} pieza${piezas===1?'':'s'}</span></div>`
          +`<p class="fam-otravez-que">${esc(quePide)}${otraVez.lineas.length>3?'…':''}</p>`
          +(meses>=6?`<p class="fam-otravez-aviso">Tu último pedido fue hace ${meses} meses: revisa que la talla le siga quedando.</p>`:'')
          +(otraVez.faltan.length?`<p class="fam-otravez-aviso">${esc(otraVez.faltan.join(' · '))}</p>`:'')
          +`<button type="button" class="fam-otravez-btn" data-otravez>Pedir lo mismo · ${money.format(total)}</button></section>`;})()
    : '';
  if(!rows.length&&!kits.length){$('famBody').innerHTML='<div class="fam-empty">Todavía no hay productos publicados.</div>';return;}
  const tienda=String(state.home?.organization?.storeUrl||'');
  const irALaTienda=/^https:\/\//i.test(tienda)
    ? `<a class="fam-store" href="${esc(tienda)}" target="_blank" rel="noopener">Ver toda la tienda del club</a>`:'';
  const enCarrito=Object.entries(state.cart);
  const resumen=enCarrito.length
    ? `<section class="fam-card"><div class="fam-card-head"><h2>Tu pedido</h2><span>${piezasDelCarrito(state.cart)}</span></div>${enCarrito.map(([k,l])=>lineaDelCarrito(k,l)).join('')}${sugerenciasDeKit(state.cart,kits).map(x=>`<div class="fam-sugiere${x.diferencia<0?' ahorro':''}"><span>${esc(textoSugerencia(x,n=>money.format(n)))}</span><button type="button" data-convierte="${esc(x.llave)}" data-kit-id="${esc(x.kit.id)}">Convertir en kit</button></div>`).join('')}</section>`
    : '';
  // El kit primero y en grande: es lo que la familia viene a comprar. Las
  // piezas sueltas despues, para quien ya tiene el uniforme y le falta algo.
  const bloqueKits=kits.length
    ? `<div class="fam-kits">${kits.map(tarjetaKit).join('')}</div>`
    : '';
  const tituloPiezas=kits.length&&rows.length
    ? `<section class="fam-card"><div class="fam-card-head"><h2>O una pieza suelta</h2><span>${rows.length}</span></div></section>`
    : '';
  const cuenta=[kits.length?`${kits.length} kit${kits.length>1?'s':''}`:null,
                rows.length?`${rows.length} piezas`:null].filter(Boolean).join(' · ');
  $('famBody').innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Tienda del club</h2><span>${esc(cuenta)}</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">Aparta lo que necesites y el club te confirma disponibilidad y forma de pago.</p>${irALaTienda}</section>${resumen}${enCarrito.length?'':bloqueOtraVez}${bloqueKits}${tituloPiezas}<div class="fam-prods">${rows.map(tarjetaProducto).join('')}</div>`;
  pintaFotos(rows);
  const cuerpo=$('famBody');

  // Elegir talla: se marca y se vuelve a pintar sólo esa tarjeta no haría
  // falta, pero repintar entero mantiene el estado en un solo lugar y en
  // cuatro productos no se nota.
  // Abrir y cerrar el panel de tallas. Solo una tarjeta abierta a la vez: dos
  // paneles abiertos vuelven a llenar la pantalla de botones, que es justo lo
  // que se vino a quitar.
  cuerpo.querySelectorAll('[data-abre]').forEach(b=>b.addEventListener('click',()=>{
    const ref=b.dataset.abre;
    if(ref.includes('::')){
      const [kitId,ranura]=ref.split('::');
      const prev=eligiendoKit[kitId]||{};
      eligiendoKit[kitId]={...prev,abierto:prev.abierto===ranura?null:ranura,motivo:null};
    }else{
      const prev=eligiendo[ref]||{};
      // Cerrar los demas: el panel abierto es uno.
      Object.keys(eligiendo).forEach(k=>{if(k!==ref)eligiendo[k]={...eligiendo[k],abierto:false};});
      eligiendo[ref]={...prev,abierto:!prev.abierto,motivo:null};
    }
    renderTienda();
  }));

  // Kit Dúo: cuál jersey va en cada espacio a elegir. Si la talla que traía
  // no existe en el nuevo, se borra.
  cuerpo.querySelectorAll('[data-elige]').forEach(caja=>caja.addEventListener('click',e=>{
    const b=e.target.closest('[data-pid]');if(!b)return;
    const [kitId,ranura]=caja.dataset.elige.split('::');
    const prev=eligiendoKit[kitId]||{};
    const elegidos={...(prev.elegidos||{}),[ranura]:b.dataset.pid};
    const kit=(state.kitsVisibles||[]).find(x=>String(x.id)===kitId);
    const nueva=kit?ranuraElegida(ranurasDeKit(kit).find(x=>x.id===ranura),elegidos):null;
    const tallas={...(prev.tallas||{})};
    if(tallas[ranura]&&!(nueva?.tallas||[]).includes(tallas[ranura]))delete tallas[ranura];
    eligiendoKit[kitId]={...prev,elegidos,tallas,abierto:ranura,motivo:null};
    renderTienda();
  }));
  cuerpo.querySelectorAll('[data-tallas]').forEach(caja=>caja.addEventListener('click',e=>{
    const b=e.target.closest('.fam-talla');if(!b)return;
    const ref=caja.dataset.tallas, talla=b.dataset.talla;
    if(ref.includes('::')){
      const [kitId,ranura]=ref.split('::');
      const prev=eligiendoKit[kitId]||{};
      const tallas={...(prev.tallas||{})};
      if(tallas[ranura]===talla)delete tallas[ranura]; else tallas[ranura]=talla;
      // Al elegir se cierra el panel: la talla ya se ve en la linea, y dejarlo
      // abierto obliga a un toque mas para seguir.
      eligiendoKit[kitId]={...prev,tallas,abierto:null,motivo:null};
    }else{
      const prev=eligiendo[ref]||{};
      // Varias tallas: el panel se queda abierto para marcar otra.
      if(admiteVariasTallas(rows.find(x=>String(x.id)===String(ref))))eligiendo[ref]={...prev,cantidades:cambiaCantidadDeTalla(prev.cantidades,talla),abierto:true,motivo:null,recien:null};
      else eligiendo[ref]={...prev,talla:prev.talla===talla?null:talla,abierto:false,motivo:null,recien:null};
    }
    renderTienda();
  }));
  cuerpo.querySelectorAll('[data-vcant]').forEach(b=>b.addEventListener('click',()=>{
    const [id,talla,delta]=b.dataset.vcant.split('::');
    const prev=eligiendo[id]||{};
    eligiendo[id]={...prev,cantidades:cambiaCantidadDeTalla(prev.cantidades,talla,Number(delta)),motivo:null};
    renderTienda();
  }));

  // Adulto o niño: cambia el precio del kit.
  cuerpo.querySelectorAll('[data-tier]').forEach(caja=>caja.addEventListener('click',e=>{
    const b=e.target.closest('[data-quien]');if(!b)return;
    const id=caja.dataset.tier;
    eligiendoKit[id]={...(eligiendoKit[id]||{}),tier:b.dataset.quien,motivo:null};
    renderTienda();
  }));

  cuerpo.querySelectorAll('[data-knombre]').forEach(i=>i.addEventListener('input',e=>{
    const id=e.target.dataset.knombre;eligiendoKit[id]={...(eligiendoKit[id]||{}),nombre:e.target.value};
  }));
  // Manga: se marca y se repinta, igual que la talla.
  cuerpo.querySelectorAll('[data-pmanga],[data-kmanga],[data-kpmanga]').forEach(caja=>caja.addEventListener('click',e=>{
    const b=e.target.closest('[data-m]');if(!b)return;
    if(caja.dataset.kpmanga){const [id,r]=caja.dataset.kpmanga.split('::');const prev=eligiendoKit[id]||{};eligiendoKit[id]={...prev,mangas:{...(prev.mangas||{}),[r]:b.dataset.m}};}
    else if(caja.dataset.kmanga){const id=caja.dataset.kmanga;eligiendoKit[id]={...(eligiendoKit[id]||{}),manga:b.dataset.m};}
    else{const id=caja.dataset.pmanga;eligiendo[id]={...(eligiendo[id]||{}),manga:b.dataset.m};}
    renderTienda();
  }));
  cuerpo.querySelectorAll('[data-knumero]').forEach(i=>i.addEventListener('input',e=>{
    const id=e.target.dataset.knumero;eligiendoKit[id]={...(eligiendoKit[id]||{}),numero:e.target.value};
  }));

  // Comprar otra vez: todo al carrito de un toque; el papá revisa y aparta.
  cuerpo.querySelector('[data-otravez]')?.addEventListener('click',()=>{
    for(const l of otraVez.lineas)state.cart=agregaAlCarrito(state.cart,l);
    renderCartBar();renderTienda();window.scrollTo({top:0,behavior:'smooth'});
  });
  // ¿Lo conviertes en kit? Abre el kit ya lleno, en su tarjeta.
  cuerpo.querySelectorAll('[data-convierte]').forEach(b=>b.addEventListener('click',()=>{
    const x=sugerenciasDeKit(state.cart,kits).find(v=>v.llave===b.dataset.convierte&&String(v.kit.id)===b.dataset.kitId);if(!x)return;
    eligiendoKit[x.kit.id]={...x.opciones,tallas:{...x.opciones.tallas},reemplaza:x.llaves};
    renderTienda();
    document.querySelector(`[data-kitcard="${CSS.escape(String(x.kit.id))}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
  }));
  // Agregar el kit.
  cuerpo.querySelectorAll('[data-addkit]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.addkit;
    const kit=kits.find(k=>String(k.id)===String(id));
    const elec=eligiendoKit[id]||{};
    const r=preparaKit(kit,{tier:elec.tier,tallas:elec.tallas,elegidos:elec.elegidos,mangas:elec.mangas,nombre:elec.nombre,numero:elec.numero,manga:elec.manga});
    if(!r.ok){
      // El aviso se pinta en la tarjeta que se toco, no en una alerta encima:
      // una alerta tapa justo lo que hay que corregir.
      eligiendoKit[id]={...elec,motivo:r.motivo,abierto:r.falta&&r.falta!=='tier'&&r.falta!=='numero'?r.falta:elec.abierto};
      renderTienda();return;
    }
    // Convertir: el jersey suelto deja el carrito.
    for(const k of [].concat(elec.reemplaza||[]))if(state.cart[k])state.cart=quitaUnaPieza(state.cart,k);
    state.cart=agregaAlCarrito(state.cart,r.linea);
    eligiendoKit[id]={};
    renderCartBar();renderTienda();
  }));
  // Lo que se escribe se guarda al vuelo: si la familia toca Agregar sin
  // salir del campo, el nombre ya está.
  cuerpo.querySelectorAll('[data-pnombre]').forEach(i=>i.addEventListener('input',e=>{
    const id=e.target.dataset.pnombre;eligiendo[id]={...(eligiendo[id]||{}),nombre:e.target.value};
  }));
  cuerpo.querySelectorAll('[data-pnumero]').forEach(i=>i.addEventListener('input',e=>{
    const id=e.target.dataset.pnumero;eligiendo[id]={...(eligiendo[id]||{}),numero:e.target.value};
  }));
  cuerpo.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.add,prod=rows.find(x=>String(x.id)===String(id));
    if(!prod)return;
    if(admiteVariasTallas(prod)){
      const m=preparaLineasPorTalla(prod,eligiendo[id]||{});
      if(!m.ok){eligiendo[id]={...(eligiendo[id]||{}),motivo:m.motivo,abierto:true};renderTienda();return;}
      for(const l of m.lineas)state.cart=agregaAlCarrito(state.cart,l);
      eligiendo[id]={recien:`${m.piezas} ${m.piezas===1?'pieza':'piezas'} (${m.lineas.map(l=>`${l.cantidad>1?`${l.cantidad} `:''}${l.talla}`).join(', ')})`};
      renderTienda();
      return;
    }
    const r=preparaLinea(prod,eligiendo[id]||{});
    if(!r.ok){
      // El motivo se pinta en la tarjeta, junto al botón que se tocó, no en
      // una alerta que tapa lo que la familia estaba viendo.
      eligiendo[id]={...(eligiendo[id]||{}),motivo:r.motivo};
      renderTienda();
      return;
    }
    state.cart=agregaAlCarrito(state.cart,r.linea);
    const l=r.linea;
    eligiendo[id]={recien:[[l.personalizationName,l.numero].filter(Boolean).join(' '),l.talla&&`talla ${l.talla}`,l.manga==='larga'&&'manga larga'].filter(Boolean).join(' · ')||prod.name};
    renderTienda();
  }));
  cuerpo.querySelectorAll('[data-quita]').forEach(b=>b.addEventListener('click',()=>{
    state.cart=quitaDelCarrito(state.cart,b.dataset.quita);
    renderTienda();
  }));
  renderCartBar();
}

/* ---------- Gafete de estacionamiento ---------- */
const PASS_STATE={
  requested:{t:'En revisión',d:'El club está revisando tu solicitud.',tone:'pendiente'},
  approved:{t:'Autorizado',d:'Pasa a recogerlo al club.',tone:'pendiente'},
  issued:{t:'Vigente',d:'Ya lo tienes contigo.',tone:'pagado'},
  rejected:{t:'No autorizado',d:'',tone:'vencido'},
  revoked:{t:'Cancelado',d:'',tone:'vencido'},
  lost:{t:'Reportado perdido',d:'',tone:'vencido'},
  expired:{t:'Vencido',d:'Ya puedes solicitar el de la nueva temporada.',tone:'vencido'}
};
async function renderGafete(){
  if(!state.parking){
    $('famBody').innerHTML='<div class="fam-empty">Cargando…</div>';
    try{state.parking=await rpc('v2_portal_parking');}
    catch(error){$('famBody').innerHTML=`<div class="fam-empty">${esc(friendly(error))}</div>`;return;}
  }
  const {price,season,passes=[]}=state.parking;
  const vivos=passes.filter(p=>['requested','approved','issued'].includes(p.status));
  const cards=passes.map(p=>{
    const st=PASS_STATE[p.status]||{t:p.status,d:'',tone:''};
    const saldo=Number(p.balance||0);
    const detalle=[p.vehicle,p.player&&`de ${p.player}`,p.folio&&`folio ${p.folio}`]
      .filter(Boolean).join(' · ');
    const cobro=saldo>0?`<span class="fam-chip-val"><span>Por pagar</span><b>${money.format(saldo)}</b></span>`
      :p.status==='issued'||p.status==='approved'?'<span class="fam-chip-val"><span>Pago</span><b>Cubierto</b></span>':'';
    // El cargo del gafete se cobra en taquilla como cualquier otro; el botón
    // sólo le ahorra a la familia tener que explicar de qué se trata.
    const aviso=saldo>0?waBoton(
      `Hola, quiero pagar el gafete de estacionamiento${p.plate?` de las placas ${p.plate}`:''}${p.player?` (${p.player})`:''}: ${money.format(saldo)}.`,
      'Avisar que voy a pagarlo'):'';
    return `<article class="fam-card" style="margin-top:12px"><div class="fam-card-head"><h2>${esc(p.plate||'Sin placas')}</h2><span class="fam-pass-state" data-state="${st.tone}">${esc(st.t)}</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">${esc(detalle)}</p>${st.d?`<p class="fam-muted" style="margin:6px 0 0;font-size:12.5px">${esc(st.d)}</p>`:''}${p.close_reason?`<p class="fam-muted" style="margin:6px 0 0;font-size:12.5px">Motivo: ${esc(p.close_reason)}</p>`:''}<div class="fam-split">${cobro}<span class="fam-chip-val"><span>Temporada</span><b>${esc(String(p.season))}</b></span></div>${aviso}</article>`;
  }).join('');

  const form=`<article class="fam-card" style="margin-top:12px"><div class="fam-card-head"><h2>Solicitar un gafete</h2><span>${money.format(Number(price||0))}</span></div><p class="fam-muted" style="margin:0 0 12px;font-size:12.5px">Cada gafete cuesta ${money.format(Number(price||0))} por la temporada ${esc(String(season))} y se te carga a tu estado de cuenta. Un gafete por vehículo.</p><form id="gafeteForm" class="fam-pass-form"><label>Para<select id="gafetePlayer"></select></label><label>Placas<input id="gafetePlate" maxlength="15" placeholder="ABC-123-X" autocapitalize="characters" required></label><label>Vehículo <span class="fam-muted">(opcional)</span><input id="gafeteVehicle" maxlength="60" placeholder="Mazda 3 gris"></label><button id="gafeteSubmit" class="fam-btn" type="submit">Solicitar por ${money.format(Number(price||0))}</button><div id="gafeteMessage" class="fam-message hidden"></div></form></article>`;

  $('famBody').innerHTML=`<section class="fam-card"><div class="fam-card-head"><h2>Estacionamiento</h2><span>${vivos.length} vigente${vivos.length===1?'':'s'}</span></div><p class="fam-muted" style="margin:0;font-size:12.5px">Aquí solicitas y sigues tus gafetes. Puedes tener uno por cada vehículo.</p></section>${cards}${form}`;

  const sel=$('gafetePlayer');
  (state.home?.players||[]).forEach(p=>{
    const o=document.createElement('option');
    o.value=p.id;o.textContent=[p.first_name,p.last_name].filter(Boolean).join(' ');
    sel.appendChild(o);
  });
  if(state.playerId)sel.value=state.playerId;
  $('gafeteForm').addEventListener('submit',async e=>{
    e.preventDefault();msg('gafeteMessage');
    const btn=$('gafeteSubmit');btn.disabled=true;btn.textContent='Enviando…';
    try{
      await rpc('v2_portal_request_parking',{
        player_id:sel.value,plate:$('gafetePlate').value,vehicle:$('gafeteVehicle').value||null});
      state.parking=null;state.statements={};
      await renderGafete();
      msg('gafeteMessage','Listo, el club revisa tu solicitud.','success');
    }catch(error){
      msg('gafeteMessage',friendly(error));
      btn.disabled=false;btn.textContent=`Solicitar por ${money.format(Number(price||0))}`;
    }
  });
}

/* ---------- Marco ---------- */
async function renderTabs(){
  const players=state.home?.players||[];
  const box=$('playerTabs');
  box.classList.toggle('hidden',players.length<2);
  if(players.length<2){box.innerHTML='';return;}
  box.innerHTML=players.map(p=>{
    const debe=Number(p.balance||0)>0;
    return `<button class="fam-tab" role="tab" type="button" data-player="${esc(p.id)}" aria-selected="${String(p.id)===String(state.playerId)}"><span class="fam-tab-face">${p._photo?`<img src="${esc(p._photo)}" alt="">`:esc(initials(p))}</span>${esc(p.first_name||'Tanner')}${debe?'<span class="fam-tab-dot" aria-label="con saldo"></span>':''}</button>`;
  }).join('');
  box.querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>{
    state.playerId=b.dataset.player;renderTabs();paint();
  }));
}
function paint(){
  document.querySelectorAll('.fam-nav-item').forEach(b=>
    b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false'));
  document.getElementById('famCart')?.remove();
  if(state.tab==='inicio')return renderInicio();
  if(state.tab==='club')return renderClub();
  if(state.tab==='progreso')return renderProgreso();
  if(state.tab==='tienda')return renderTienda();
  return renderCuenta();
}
// Ir a una pestaña y, si se pide, a una sección de ella (los pendientes de Inicio).
async function irA(tab,ancla,playerId){
  if(playerId&&playerId!==state.playerId){state.playerId=playerId;renderTabs();}
  state.tab=tab;window.scrollTo(0,0);await paint();
  if(ancla){const el=document.getElementById(ancla);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('fam-resalta');setTimeout(()=>el.classList.remove('fam-resalta'),1800);}}
}

/* ---------- Inicio (fase 2, 18/10/2026) ----------
   "Tiene que ser bien fácil hacer todo." Lo primero: qué tiene que hacer la
   familia (pagar, firmar, la foto, documentos), los avisos del club, lo
   próximo y sus hijos. Cada pendiente lleva directo a donde se resuelve. */
async function cargaAvisos(){
  try{state.avisos=await rpc('v2_portal_avisos')||[];}catch(e){state.avisos=state.avisos||[];}
  pintaGloboAvisos();
  return state.avisos;
}
function pintaGloboAvisos(){
  const n=avisosSinLeer(state.avisos),b=document.querySelector('.fam-nav-item[data-tab="inicio"] .fam-nav-globo');
  if(b){b.textContent=String(n);b.classList.toggle('hidden',!n);}
}
async function renderInicio(){
  const players=state.home?.players||[];
  const body=$('famBody');
  if(!state.inicioListo)body.innerHTML='<div class="fam-empty">Cargando tu inicio…</div>';
  const desde=new Date(),hasta=new Date();hasta.setDate(hasta.getDate()+60);
  await Promise.all([
    state.avisos?Promise.resolve():cargaAvisos(),
    state.calendar?Promise.resolve():rpc('v2_portal_calendar',{from_at:desde.toISOString(),to_at:hasta.toISOString()}).then(r=>{state.calendar=r||[];}).catch(()=>{state.calendar=[];}),
    ...players.map(p=>state.statements[p.id]?null:rpc('v2_portal_statement',{player_id:p.id}).then(r=>{state.statements[p.id]=r;}).catch(()=>{})),
    ...players.map(p=>state.paperwork[p.id]?null:rpc('v2_portal_paperwork',{player_id:p.id}).then(r=>{state.paperwork[p.id]=r||{};}).catch(()=>{state.paperwork[p.id]={};}))
  ]);
  if(state.tab!=='inicio')return;
  state.inicioListo=true;
  const tutor=String(state.home?.guardian?.name||'').trim().split(/\s+/)[0];
  const pend=pendientesDe(players,state.statements,state.paperwork);
  const prox=proximoEvento(state.calendar);
  const avisos=state.avisos||[];
  const ICO={pago:'wallet',firma:'pen',fotos:'camera',docs:'doc'};
  const pendHtml=pend.length
    ? pend.map((x,i)=>`<button type="button" class="fam-pend" data-pend="${i}" data-tipo="${x.tipo}"><span class="fam-pend-ico" data-i="${ICO[x.tipo]}" aria-hidden="true"></span><span class="fam-pend-txt"><strong>${esc(x.titulo)}</strong>${x.monto?`<b>${money.format(x.monto)}</b>`:x.detalle?`<small>${esc(x.detalle)}</small>`:''}</span><span class="fam-pend-cta">${esc(x.accion)}</span></button>`).join('')
    : '<div class="fam-alldia"><span aria-hidden="true"></span><div><strong>Todo al día</strong><small>No tienes nada pendiente con el club. ¡Gracias!</small></div></div>';
  const avisosHtml=avisos.length
    ? avisos.slice(0,state.verTodosAvisos?30:3).map(a=>`<article class="fam-aviso-item${a.unread?' nuevo':''}"><header><strong>${esc(a.title)}</strong>${a.unread?'<span class="fam-nuevo">Nuevo</span>':''}</header>${a.body?`<p>${esc(a.body)}</p>`:''}<small>${esc([a.categoria&&`Para ${a.categoria}`,a.author,a.publishedAt&&new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(a.publishedAt)).replace('.','')].filter(Boolean).join(' · '))}</small></article>`).join('')
      +(avisos.length>3&&!state.verTodosAvisos?`<button type="button" class="fam-link fam-ver-todos" data-ver-avisos>Ver los ${avisos.length} avisos</button>`:'')
    : '<p class="fam-muted fam-sin">Cuando el club publique un aviso, aquí lo ves (y en tu celular si activas los avisos).</p>';
  const hijos=players.map(p=>`<button type="button" class="fam-hijo" data-hijo="${esc(p.id)}"><span class="fam-hijo-cara" data-profile-photo="${esc(p.id)}">${p._photo?`<img src="${esc(p._photo)}" alt="">`:esc(initials(p))}</span><span><strong>${esc(String(p.first_name||'').trim().split(/\s+/)[0]||'Tanner')}</strong><small>${esc([p.category,p.jersey_number&&`#${p.jersey_number}`].filter(Boolean).join(' · '))}</small></span><i aria-hidden="true">›</i></button>`).join('');
  body.innerHTML=`
    <section class="fam-inicio-hero">
      <p>${esc(saludo())}${tutor?`, ${esc(tutor)}`:''}</p>
      <h1>${esc(state.home?.organization?.name||'Tu club')}</h1>
      <div class="fam-hijos">${hijos}</div>
    </section>
    <div id="famPush"></div>
    <section class="fam-card fam-pendientes"><div class="fam-card-head"><h2>Pendientes</h2><span>${pend.length?`${pend.length} por hacer`:'al día'}</span></div>${pendHtml}</section>
    ${prox?`<section class="fam-card fam-prox"><div class="fam-card-head"><h2>Lo próximo</h2><button type="button" class="fam-link" data-ir-club>Ver calendario</button></div>
      <div class="fam-prox-ev"><span class="fam-prox-cuando">${esc(cuandoEs(prox.starts_at))}</span><strong>${esc(prox.title||'Entrenamiento')}</strong><small>${esc([prox.location,prox.category].filter(Boolean).join(' · '))}</small></div></section>`:''}
    <section class="fam-card fam-avisos" id="famAvisos"><div class="fam-card-head"><h2>Avisos del club</h2><span>${avisosSinLeer(avisos)?`${avisosSinLeer(avisos)} nuevo${avisosSinLeer(avisos)===1?'':'s'}`:''}</span></div>${avisosHtml}</section>`;
  body.querySelectorAll('[data-pend]').forEach(b=>b.addEventListener('click',()=>{const x=pend[Number(b.dataset.pend)];irA(x.tab,x.ancla,x.player);}));
  body.querySelectorAll('[data-hijo]').forEach(b=>b.addEventListener('click',()=>irA('progreso',null,b.dataset.hijo)));
  body.querySelector('[data-ir-club]')?.addEventListener('click',()=>{state.clubSub='calendario';irA('club');});
  body.querySelector('[data-ver-avisos]')?.addEventListener('click',()=>{state.verTodosAvisos=true;renderInicio();});
  pintaPush();
  // Vistos: el globo se apaga, pero en esta pantalla siguen marcados como nuevos.
  if(avisosSinLeer(avisos))rpc('v2_portal_avisos_vistos').then(()=>{state.avisos=avisos.map(a=>({...a,unread:false}));pintaGloboAvisos();}).catch(()=>{});
}

/* Avisos en el celular: se pide permiso sólo cuando la familia toca el botón.
   En iPhone sólo funcionan con la app agregada a la pantalla de inicio. */
async function suscripcionActual(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return null;
  const reg=await navigator.serviceWorker.getRegistration('/');
  return reg?await reg.pushManager.getSubscription():null;
}
async function pintaPush(){
  const box=$('famPush');if(!box)return;
  const soporta='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  if(!soporta&&!(ios&&!instalada)){box.innerHTML='';return;}
  if(soporta&&Notification.permission==='denied'){box.innerHTML='';return;}
  let ya=null;try{ya=await suscripcionActual();}catch(_){}
  if(ya){box.innerHTML='';return;}
  if(ios&&!instalada){
    box.innerHTML='<div class="fam-push"><span class="fam-push-ico" aria-hidden="true"></span><div><strong>Recibe los avisos en tu celular</strong><small>En iPhone, primero agrega la app a tu inicio: toca Compartir y luego "Agregar a inicio". Ábrela desde ahí y activa los avisos.</small></div></div>';
    return;
  }
  box.innerHTML='<div class="fam-push"><span class="fam-push-ico" aria-hidden="true"></span><div><strong>Recibe los avisos en tu celular</strong><small>Te avisamos de entrenamientos, partidos y pagos.</small></div><button type="button" data-push>Activar</button></div>';
  box.querySelector('[data-push]').addEventListener('click',async e=>{
    const btn=e.currentTarget;btn.disabled=true;btn.textContent='Activando…';
    try{
      const reg=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const permiso=await Notification.requestPermission();
      if(permiso!=='granted'){box.innerHTML='';return;}
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(PUSH_PUBLIC_KEY)});
      const j=sub.toJSON();
      await rpc('v2_portal_save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_user_agent:navigator.userAgent});
      box.innerHTML='<div class="fam-push listo"><span class="fam-push-ico" aria-hidden="true"></span><div><strong>Listo, avisos activados</strong><small>Te llegarán aunque no tengas el portal abierto.</small></div></div>';
    }catch(err){console.warn('avisos',err);btn.disabled=false;btn.textContent='Activar';}
  });
}

/* ---------- Club: calendario y estacionamiento ---------- */
async function renderClub(){
  if(state.clubSub==='gafete')await renderGafete(); else await renderCalendario();
  if(state.tab!=='club')return;
  $('famBody').insertAdjacentHTML('afterbegin',`<div class="fam-seg" role="tablist" aria-label="Club">
    <button type="button" role="tab" data-club="calendario" aria-selected="${state.clubSub==='calendario'}">Calendario</button>
    <button type="button" role="tab" data-club="gafete" aria-selected="${state.clubSub==='gafete'}">Estacionamiento</button></div>`);
  $('famBody').querySelectorAll('[data-club]').forEach(b=>b.addEventListener('click',()=>{state.clubSub=b.dataset.club;renderClub();}));
}

/* Sólo se cierra la sesión cuando el servidor dice que esta cuenta no es de
   una familia; un error de red o de tiempo no es motivo para sacarla. */
function esDeAcceso(error){
  const raw=String(error?.message||error||'');
  return /portal access required|not authorized|jwt|permission denied/i.test(raw);
}
function sinConexion(error){
  console.warn('portal sin conexión',error);
  show('appView');
  $('famBody').innerHTML=`<div class="fam-empty"><b>No pudimos conectar con el club.</b><p>Tu sesión sigue abierta. Revisa tu internet y vuelve a intentar.</p><button type="button" class="fam-btn" id="famReintentar">Reintentar</button></div>`;
  $('famReintentar')?.addEventListener('click',()=>location.reload());
}

async function boot(){
  if(TOKEN){await muestraInvitacion();return;}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){show('loginView');return;}
  const {data:{user}}=await supabase.auth.getUser();
  if(user?.app_metadata?.must_change_password){
    // Sólo se le pide a quien entró con usuario: quien entró con su correo ya lo dio.
    $('contactEmailField')?.classList.toggle('hidden',user?.app_metadata?.login_type!=='username');
    show('passwordView');return;
  }
  try{state.home=await rpc('v2_portal_home');instalaVocabulario(state.home?.organization?.playerNoun);}
  catch(error){
    // Sin señal o el servidor tardó: la sesión sigue buena. Antes se cerraba
    // aquí y la familia sentía que "se le salía"; ahora se reintenta.
    if(!esDeAcceso(error)){sinConexion(error);return;}
    // Una cuenta de staff que abre el portal por error no debe quedarse en blanco.
    show('loginView');msg('loginMessage',friendly(error));
    await clearPhotoCache();
    await supabase.auth.signOut().catch(()=>{});
    return;
  }
  show('appView');
  ofreceInstalar();
  if(state.tab!=='inicio')cargaAvisos();
  const org=state.home?.organization?.name;
  if(org)$('orgName').textContent=org;
  const players=state.home?.players||[];
  if(!state.playerId&&players.length)state.playerId=players[0].id;
  renderTabs();paint();
  // Las fotos entran después: el saldo es a lo que la familia vino.
  const conFoto=players.filter(p=>p.photo_thumb_path);
  if(conFoto.length){
    await Promise.all(conFoto.map(async p=>{p._photo=await signPhoto(p);}));
    renderTabs();
    const player=currentPlayer(),face=player&&document.querySelector(`[data-profile-photo="${CSS.escape(String(player.id))}"]`);
    if(face&&player._photo)face.innerHTML=`<img src="${esc(player._photo)}" alt="Foto de ${esc([player.first_name,player.last_name].filter(Boolean).join(' '))}">`;
  }
}

/* ---------- Entrar sin que nadie dicte contraseñas (18/10/2026) ----------
   El club manda por WhatsApp una liga personal (/familias/#i=<token>): la
   familia ve de quién es tutora, elige su contraseña y entra. Su usuario es su
   teléfono. La misma liga sirve para recuperar la contraseña. */
const TOKEN=tokenDeLiga(location.hash);
let clubPublico=null;
async function cargaClub(){
  if(clubPublico)return clubPublico;
  try{clubPublico=await rpc('v2_public_context',{club_key:llaveDeLiga()})||{};}catch(e){clubPublico={};}
  const nombre=clubPublico.organizationName||clubPublico.brand||'';
  document.querySelectorAll('[data-club]').forEach(el=>{if(nombre)el.textContent=nombre;});
  if(clubPublico.slug==='tannery-city-fc')document.querySelectorAll('[data-escudo]').forEach(el=>{el.innerHTML='<img src="/brand/crest-gold.png" alt="">';});
  return clubPublico;
}
const waClub=texto=>{const n=String(clubPublico?.whatsappNumber||'').replace(/\D/g,'');return n.length>=11?`https://wa.me/${n}?text=${encodeURIComponent(texto)}`:'';};
function pintaAyudaAcceso(){
  const tel=String($('email')?.value||'').trim();
  const pedir=waClub(`Hola, soy familia del club. Necesito mi liga para entrar al portal de familias.${tel?` Mi teléfono es ${tel}.`:''}`);
  const olvide=waClub(`Hola, olvidé mi contraseña del portal de familias.${tel?` Mi teléfono es ${tel}.`:''} ¿Me mandan una liga nueva?`);
  const a=$('pideLiga');if(a){a.href=pedir||'#';a.classList.toggle('hidden',!pedir);}
  const b=$('ayudaWa');if(b){b.href=olvide||'#';b.classList.toggle('hidden',!olvide);}
}
async function muestraInvitacion(){
  show('inviteView');
  const card=$('inviteCard');
  await cargaClub();
  let inv=null;
  try{inv=await rpc('v2_public_family_invite',{token:TOKEN});}catch(e){inv={valid:false,reason:'error'};}
  const escudo=clubPublico?.slug==='tannery-city-fc'?'<img src="/brand/crest-gold.png" alt="">':'<span class="fam-mark">T</span>';
  if(!inv?.valid){
    const usada=inv?.reason==='used';
    const pedir=waClub('Hola, mi liga del portal de familias ya no funciona. ¿Me mandan una nueva?');
    card.innerHTML=`<div class="fam-auth-escudo">${escudo}</div>
      <h1>${usada?'Esta liga ya se usó':'Esta liga ya no funciona'}</h1>
      <p class="fam-muted">${usada?'Si ya creaste tu contraseña, entra con tu teléfono y tu contraseña.':'Las ligas sirven una sola vez y duran 14 días. Pídele al club una nueva.'}</p>
      <button type="button" class="fam-btn" data-ir-entrar>Ir a entrar</button>
      ${pedir?`<a class="fam-wa" href="${esc(pedir)}" target="_blank" rel="noopener">Pedir una liga nueva</a>`:''}`;
    card.querySelector('[data-ir-entrar]').addEventListener('click',()=>{history.replaceState(null,'',location.pathname+location.search);location.reload();});
    return;
  }
  const nueva=inv.purpose!=='reset';
  const hijos=(inv.hijos||[]).map(h=>`<li><b>${esc(primeraPalabra(h.primerNombre))}</b><span>${esc(h.categoria||'')}</span></li>`).join('');
  card.innerHTML=`<div class="fam-auth-escudo">${escudo}</div>
    <p class="fam-auth-club">${esc(inv.club||'')}</p>
    <h1>Hola, ${esc(primeraPalabra(inv.primerNombre)||'familia')}</h1>
    <p class="fam-muted">${nueva?'Ya tienes tu lugar en el portal de familias.':'Elige una contraseña nueva para tu portal.'}</p>
    ${hijos?`<ul class="fam-inv-hijos">${hijos}</ul>`:''}
    <div class="fam-inv-usuario"><small>Tu usuario</small><b>${esc(conEspacios(inv.usuario||''))}</b><span>${/^\d{10}$/.test(inv.usuario||'')?'Es tu teléfono: con él entras siempre.':'Con él entras siempre.'}</span></div>
    <form id="inviteForm">
      <div class="fam-campo"><label for="invPass">${nueva?'Crea tu contraseña':'Contraseña nueva'}</label><span class="fam-pass"><input id="invPass" type="password" minlength="8" autocomplete="new-password" required><button type="button" class="fam-ver" data-ver="invPass" aria-label="Ver contraseña">Ver</button></span><small class="fam-hint">Al menos 8 caracteres.</small></div>
      <label>Escríbela otra vez<input id="invPass2" type="password" minlength="8" autocomplete="new-password" required></label>
      <input type="text" name="username" autocomplete="username" value="${esc(inv.usuario||'')}" hidden>
      <button id="invSubmit" class="fam-btn" type="submit">${nueva?'Crear contraseña y entrar':'Guardar y entrar'}</button>
      <div id="invMessage" class="fam-message hidden"></div>
    </form>`;
  $('inviteForm').addEventListener('submit',async e=>{
    e.preventDefault();msg('invMessage');
    const a=$('invPass').value,b=$('invPass2').value;
    if(a.length<8){msg('invMessage','Usa al menos 8 caracteres.');return;}
    if(a!==b){msg('invMessage','Las contraseñas no coinciden.');return;}
    const btn=$('invSubmit');btn.disabled=true;btn.textContent='Preparando tu portal…';
    try{
      const {data,error}=await supabase.functions.invoke('family-access',{body:{action:'claim',token:TOKEN,password:a}});
      if(error){let m='';try{m=(await error.context.json())?.error;}catch(_){}throw new Error(m||'No se pudo completar. Intenta de nuevo.');}
      if(!data?.ok)throw new Error(data?.error||'No se pudo completar. Intenta de nuevo.');
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      const {error:loginError}=await supabase.auth.signInWithPassword({email:data.login,password:a});
      if(loginError)throw loginError;
      history.replaceState(null,'',location.pathname+location.search);
      location.reload();
    }catch(error){msg('invMessage',friendly(error));btn.disabled=false;btn.textContent=nueva?'Crear contraseña y entrar':'Guardar y entrar';}
  });
}

/* Instalar como app: en Android sale el botón del sistema; en iPhone se
   explica (Compartir > Agregar a inicio). Se puede cerrar y no vuelve. */
let avisoInstalar=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();avisoInstalar=e;ofreceInstalar();});
function ofreceInstalar(){
  const box=$('famInstalar');if(!box||$('appView').classList.contains('hidden'))return;
  const instalada=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let cerrado=false;try{cerrado=localStorage.getItem('fam-instalar-cerrado')==='1';}catch(_){}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!/crios|fxios/i.test(navigator.userAgent);
  if(instalada||cerrado||(!avisoInstalar&&!ios)){box.classList.add('hidden');return;}
  box.innerHTML=`<div class="fam-instalar-in"><span class="fam-instalar-ico" aria-hidden="true"></span>
    <span><b>Tenla a un toque</b><small>${avisoInstalar?'Instálala en tu celular como una app.':'Toca Compartir y luego "Agregar a inicio".'}</small></span>
    ${avisoInstalar?'<button type="button" data-instalar>Instalar</button>':''}
    <button type="button" class="fam-instalar-x" data-instalar-no aria-label="Cerrar">&times;</button></div>`;
  box.classList.remove('hidden');
  box.querySelector('[data-instalar]')?.addEventListener('click',async()=>{try{await avisoInstalar.prompt();await avisoInstalar.userChoice;}catch(_){}avisoInstalar=null;box.classList.add('hidden');});
  box.querySelector('[data-instalar-no]').addEventListener('click',()=>{try{localStorage.setItem('fam-instalar-cerrado','1');}catch(_){}box.classList.add('hidden');});
}

document.addEventListener('click',e=>{
  const v=e.target.closest('[data-ver]');if(!v)return;
  const i=document.getElementById(v.dataset.ver);if(!i)return;
  const ver=i.type==='password';i.type=ver?'text':'password';v.textContent=ver?'Ocultar':'Ver';
});
$('olvide')?.addEventListener('click',()=>{pintaAyudaAcceso();$('ayudaAcceso').classList.toggle('hidden');});
$('email')?.addEventListener('change',pintaAyudaAcceso);
cargaClub().then(pintaAyudaAcceso);

$('loginForm')?.addEventListener('submit',handleLogin);
$('passwordForm')?.addEventListener('submit',handlePassword);
$('signOut')?.addEventListener('click',async()=>{await clearPhotoCache();await supabase.auth.signOut();location.reload();});
document.querySelectorAll('.fam-nav-item').forEach(b=>b.addEventListener('click',()=>{
  state.tab=b.dataset.tab;paint();
}));
await boot();


/* ---------- Asistencia del mes ----------
   v2_portal_progress ya daba un acumulado de por vida. Esto es la ventana del
   mes, que es lo que un papá pregunta de verdad: "¿cómo va este mes?".
   El RPC resuelve al tutor por auth.uid(); esta página nunca manda un id que
   no sea de sus propios hijos, y aunque lo mandara el backend lo rechaza. */
let mesAsistencia=0; // 0 = este mes, 1 = el pasado, 2 = el anterior

function tarjetaDelMes(p){
  return `<section class="fam-card" id="famMesCard">
    <div class="fam-card-head"><h2>Asistencia del mes</h2>
      <span id="famMesNav" class="fam-mes-nav">
        <button type="button" data-mes="prev" aria-label="Mes anterior">‹</button>
        <b id="famMesLabel">…</b>
        <button type="button" data-mes="next" aria-label="Mes siguiente">›</button>
      </span></div>
    <div id="famMesBody"><p class="fam-muted" style="margin:0;font-size:12.5px">Cargando…</p></div>
  </section>`;
}

function etiquetaMes(desfase){
  const d=new Date();
  d.setDate(1);
  d.setMonth(d.getMonth()-desfase);
  const t=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(d);
  return t.charAt(0).toUpperCase()+t.slice(1);
}

function rangoDelMes(desfase){
  const hoy=new Date();
  const ini=new Date(hoy.getFullYear(),hoy.getMonth()-desfase,1);
  const fin=new Date(hoy.getFullYear(),hoy.getMonth()-desfase+1,0);
  const iso=f=>`${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`;
  return {desde:iso(ini),hasta:iso(fin)};
}

async function cargarMesDeAsistencia(p){
  const label=$('famMesLabel'),body=$('famMesBody');
  if(!label||!body)return;
  label.textContent=etiquetaMes(mesAsistencia);
  $('famMesNav')?.querySelectorAll('[data-mes]').forEach(b=>{
    b.onclick=()=>{
      const siguiente=b.dataset.mes==='prev'?mesAsistencia+1:mesAsistencia-1;
      // Hasta 11 meses atrás y nunca al futuro.
      if(siguiente<0||siguiente>11)return;
      mesAsistencia=siguiente;
      cargarMesDeAsistencia(p);
    };
  });
  const r=rangoDelMes(mesAsistencia);
  body.innerHTML='<p class="fam-muted" style="margin:0;font-size:12.5px">Cargando…</p>';
  let d;
  try{ d=await rpc('v2_portal_attendance',{player_id:p.id,from_date:r.desde,to_date:r.hasta}); }
  catch(error){ body.innerHTML=`<p class="fam-muted" style="margin:0;font-size:12.5px">${esc(friendly(error))}</p>`; return; }

  const meta=Number(d?.goal||80);
  const est=estadoDeAsistencia(d?.pct,meta);
  const conRegistro=Number(d?.recorded||0);

  if(!conRegistro){
    body.innerHTML=`<p class="fam-muted" style="margin:0;font-size:12.5px">Todavía no hay listas tomadas en ${esc(etiquetaMes(mesAsistencia).toLowerCase())}.</p>`;
    return;
  }

  // El aviso de asistencia baja va en tono de apoyo, no de regaño: el club
  // quiere que el Tanner vuelva, no que la familia se sienta señalada.
  const aviso=d?.belowGoal
    ? `<div class="fam-aviso"><b>Va por debajo del ${meta}% que buscamos.</b>
       Si algo está complicando que venga a entrenar, escríbenos: casi siempre se puede acomodar.</div>`
    : '';

  const justificadas=Number(d?.excused||0);
  const retardos=Number(d?.late||0);

  const historial=(d?.history||[]).map(h=>{
    const et=etiquetaDeEstado(h.status);
    const tono=et.nivel==='ok'?'var(--fam-ok)':(et.nivel==='bajo'?'var(--fam-danger)':'var(--fam-warn, #8a6410)');
    return `<div class="fam-mov"><span><strong>${esc(fmtDate(h.date))}</strong><span>${esc(h.title||'Entrenamiento')}</span></span><b style="color:${tono}">${esc(et.texto)}</b></div>`;
  }).join('');

  body.innerHTML=`
    <div class="fam-stats" style="width:100%">
      <div class="fam-stat" data-tone="${est.nivel==='ok'?'ok':(est.nivel==='bajo'?'bad':'warn')}">
        <b>${d?.pct==null?'—':`${d.pct}%`}</b><span>ASISTENCIA</span></div>
      <div class="fam-stat"><b>${Number(d?.attended||0)}</b><span>ASISTIÓ</span></div>
      <div class="fam-stat"><b>${Number(d?.absences||0)}</b><span>FALTAS</span></div>
    </div>
    <p class="fam-muted" style="margin:10px 0 0;font-size:12px">
      ${esc(est.etiqueta)} · objetivo ${meta}% · sobre ${conRegistro} entrenamiento${conRegistro===1?'':'s'} con lista tomada${justificadas?` · ${justificadas} falta${justificadas===1?'':'s'} justificada${justificadas===1?'':'s'}`:''}${retardos?` · ${retardos} retardo${retardos===1?'':'s'}`:''}
    </p>
    ${aviso}
    ${historial?`<div style="margin-top:12px">${historial}</div>`:''}`;
}
