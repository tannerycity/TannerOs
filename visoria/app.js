/* VISORÍA PÚBLICA (29/10/2026, h53 · h54).
 *
 * Presidencia: "que cada menor cuente con una autorización válida, verificable
 * y auditable antes de entrar a una visoría". Paquete docs/visorias/ (00-03).
 *
 *   Portada        fechas, lugar, lugares que quedan y un botón.
 *   Tu hijo        foto, nombre, nacimiento, posición, pierna, escuela.
 *   Su familia     tutor y parentesco, WhatsApp, emergencia y quién recoge.
 *                  Aquí se APARTA el lugar (prospecto con folio y foto) y la
 *                  familia recibe su liga (#firmar=...).
 *   Salud          cuatro preguntas cortas; "prefiero decirlo en privado".
 *   Autorizaciones el aviso de seguro real, riesgos, documentos completos y
 *                  cada declaración por separado; fotos y evaluador con Sí/No
 *                  sin nada marcado de antemano.
 *   Firma          quién firma, firma con el dedo y "firmar". El servidor
 *                  valida todo; el PDF del expediente se genera después.
 *   Listo          estado real (expediente, verificar identidad), copia en
 *                  PDF, pase y quitar el permiso de fotos.
 *
 * Si el club todavía no aprueba los documentos (legal, operativa,
 * seguridad), la firma no abre: se aparta el lugar y la liga sirve después.
 * Nunca se muestra un texto legal sin aprobar.
 */
import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga } from '/v2/club-publico.js';
import { renderWelcomeCard } from '/welcome-card.js';
import { encodeVariant, FULL_MAX_BYTES, THUMB_MAX_SIDE, THUMB_MAX_BYTES, UPLOAD_CACHE_CONTROL } from '/v2/image-encode.js';
import { RIESGOS, PREGUNTAS_SALUD, PARENTESCOS, mensajeDeError, rellenaFirmante, faltaEnSalud, faltaEnDecisiones, trazoValido, estadoParaFamilia } from '/visoria/consentimiento.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false } });
const CLUB_KEY = llaveDeLiga();
const SLUG = new URLSearchParams(location.search).get('c') || 'visoria-noviembre-2026';
const PHOTO_BUCKET = 'tanneros-prospect-photos';
const WHATSAPP_CLUB = '524792651338';
const UI_VERSION = 'visoria-h54';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function rpc(n, p = {}) { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; }

let info = null, ctx = null, paso = '', foto = null, fotoUrl = '', enviando = false, resultado = null;
let liga = '', firmaCtx = null, pasos = [], llaveFirma = '', trazo = { puntos: 0, trazos: 0, minX: 1e9, minY: 1e9, maxX: 0, maxY: 0 };
const leidos = new Set();
const datos = {
  nino: { sex: '', type: 'player', position: '', foot: '' },
  tutor: { channel: '', relationship: '' }, emergencia: {}, recoge: '',
  salud: {}, decisiones: {}, firmante: { relationship: '' }
};

function edad(fecha) {
  if (!fecha) return null; const n = new Date(`${fecha}T12:00:00`), h = new Date();
  let a = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--; return a;
}
const chips = (campo, opciones, valor) => `<div class="vi-chips" role="radiogroup" data-campo="${campo}">${opciones.map(([v, t]) =>
  `<button type="button" role="radio" data-v="${esc(v)}" aria-checked="${valor === v}">${esc(t)}</button>`).join('')}</div>`;
// Lo obligatorio lleva su estrella dorada; lo opcional lo dice (29/10/2026).
const campo = (id, label, attrs = '', ayuda = '', opcional = /opcional|si la sabes/.test(label)) => `<label class="vi-campo${opcional ? ' opc' : ''}"><span>${label}</span><input id="${id}" ${attrs}>${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
const diez = v => String(v || '').replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');

function pinta(html) { $('cargando').classList.add('hidden'); const c = $('contenido'); c.classList.remove('hidden'); c.innerHTML = html; window.scrollTo({ top: 0, behavior: 'smooth' }); }
const NOMBRES = { nino: 'Tu hijo', familia: 'Su familia', salud: 'Salud', autoriza: 'Autorizaciones', firma: 'Firma' };
function barra() {
  const i = pasos.indexOf(paso) + 1;
  return `<header class="vi-tope"><img src="/brand/crest-gold.png" alt="" class="vi-tope-escudo"><div><small>VISORÍA ${new Date().getFullYear()}</small><b>Paso ${i} de ${pasos.length} · ${NOMBRES[paso]}</b></div></header>
    <div class="vi-barra" style="grid-template-columns:repeat(${pasos.length},1fr)" aria-hidden="true">${pasos.map((p, k) => `<i class="${k + 1 < i ? 'hecho' : k + 1 === i ? 'actual' : ''}"><span>${NOMBRES[p]}</span></i>`).join('')}</div>
    <p class="vi-leyenda"><i class="vi-req">*</i> Todo es obligatorio, salvo lo que dice <em>opcional</em>.</p>`;
}
function aviso(t) { const m = $('viAviso'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); if (t) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

/* ---------- Portada ----------
 * Que den ganas de inscribirlo "al mejor equipo del mundo": escudo dorado,
 * letra del club, fechas, lugar y los lugares que quedan, y un botón. */
function portada() {
  paso = '';
  const quedan = info.spotsLeft, cupo = info.capacity, ocupados = cupo ? cupo - quedan : 0;
  const lugar = info.location ? esc(info.location) : 'Te confirmamos el lugar por WhatsApp';
  const cerrado = !info.open;
  pinta(`<section class="vi-portada">
    <div class="vi-hero">
      <img src="/brand/crest-gold.png" alt="" class="vi-hero-escudo">
      <img src="/brand/wordmark-gold.png" alt="Tannery City" class="vi-hero-marca">
      <span class="vi-hero-filo" aria-hidden="true"></span>
      <p class="vi-pastilla">VISORÍA ${new Date().getFullYear()}</p>
      <h1>Buscamos al próximo Tanner</h1>
      <p class="vi-hero-sub">Dos días para mostrar lo que sabe frente a nuestros visores.</p>
    </div>
    <ul class="vi-datos">
      <li><span class="vi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span><div><b>Cuándo</b><span>${esc(info.datesLabel || 'Por confirmar')}</span></div></li>
      <li><span class="vi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.6"/></svg></span><div><b>Dónde</b><span>${lugar}</span></div></li>
      <li><span class="vi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12 12 20l-8-8V4h8z"/><circle cx="8" cy="8" r="1.5"/></svg></span><div><b>Costo</b><span>Sin costo</span></div></li>
      <li class="vi-dato-alerta"><span class="vi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><div><b>Calzado</b><span>Prohibidos los tachones. Usa multitacos o tenis deportivos.</span></div></li>
    </ul>
    ${cupo ? `<div class="vi-cupo"><div class="vi-cupo-cab"><b>${cerrado ? (info.closed ? 'Inscripciones cerradas' : 'Cupo lleno') : `Quedan ${quedan} de ${cupo} lugares`}</b><span>Cupo limitado</span></div><div class="vi-cupo-barra"><i style="width:${Math.min(100, Math.max(3, Math.round(ocupados / cupo * 100)))}%"></i></div></div>` : ''}
    ${cerrado
      ? `<a class="vi-boton" href="https://wa.me/${WHATSAPP_CLUB}?text=${encodeURIComponent('Hola, me interesa la visoría de Tannery City. ¿Me avisan si se abre un lugar?')}" target="_blank" rel="noopener">Avísame si se abre un lugar</a>`
      : info.signingOpen
        ? '<button type="button" class="vi-boton" data-empieza>Inscribir a mi hijo</button><p class="vi-pie">Toma 5 minutos: sus datos, salud, autorizaciones y tu firma. Ten a la mano una foto de tu hijo.</p>'
        : '<button type="button" class="vi-boton" data-empieza>Apartar su lugar</button><p class="vi-pie">Toma 2 minutos. Antes de la visoría te mandamos por WhatsApp la liga para firmar el consentimiento: sin él no puede entrar a la cancha.</p>'}
    <button type="button" class="vi-link" data-comparte>Compartir con otra familia</button>
    <footer class="vi-lema"><span>CURTIMOS CAMPEONES DEL MUNDO</span><b>#WeAreTanners</b></footer>
  </section>`);
}

/* ---------- Tu hijo ---------- */
function pasoNino() {
  paso = 'nino'; const n = datos.nino, cats = (ctx?.categories || []);
  pinta(`${barra()}<section class="vi-paso"><h2>El próximo Tanner</h2><p class="vi-intro">Cuéntanos de tu hijo. La foto nos ayuda a reconocerlo el día de la visoría.</p>
    <div class="vi-foto">
      <button type="button" class="vi-foto-circulo${fotoUrl ? ' con' : ''}" data-foto aria-label="Foto de tu hijo">${fotoUrl ? `<img src="${fotoUrl}" alt="Foto de tu hijo">` : '<span>+</span>'}</button>
      <div><b>Foto de tu hijo <i class="vi-req">*</i></b><small>De frente y con buena luz. Así lo reconocemos en la entrada.</small>
        <div class="vi-foto-acc"><button type="button" class="vi-mini" data-camara>Tomar foto</button><button type="button" class="vi-mini" data-galeria>Elegir de la galería</button></div></div>
      <input id="viCamara" class="hidden" type="file" accept="image/*" capture="environment"><input id="viGaleria" class="hidden" type="file" accept="image/*">
    </div>
    ${campo('viNombre', 'Nombre', `autocomplete="off" autocapitalize="words" maxlength="80" value="${esc(n.firstName || '')}"`)}
    ${campo('viApellidos', 'Apellidos', `autocomplete="off" autocapitalize="words" maxlength="100" value="${esc(n.lastName || '')}"`)}
    ${campo('viNacimiento', 'Fecha de nacimiento', `type="date" max="${new Date().toISOString().slice(0, 10)}" value="${esc(n.birthDate || '')}"`)}
    <div class="vi-grupo"><span>Es</span>${chips('sex', [['M', 'Niño'], ['F', 'Niña']], n.sex)}</div>
    ${cats.length ? `<label class="vi-campo opc"><span>Categoría <em>si la sabes</em></span><select id="viCategoria"><option value="">No sé</option>${cats.map(c => `<option${n.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
    <div class="vi-grupo"><span>¿Juega de portero?</span>${chips('type', [['player', 'No, de campo'], ['goalkeeper', 'Sí, portero']], n.type)}</div>
    <div class="vi-grupo opc${n.type === 'goalkeeper' ? ' hidden' : ''}" id="viPosicionGrupo"><span>Posición <em>opcional</em></span>${chips('position', [['Defensa', 'Defensa'], ['Medio', 'Medio'], ['Delantero', 'Delantero'], ['No sé', 'No sé']], n.position)}</div>
    <div class="vi-grupo"><span>Pierna buena</span>${chips('foot', [['right', 'Derecha'], ['left', 'Izquierda'], ['both', 'Las dos']], n.foot)}</div>
    ${campo('viEscuela', 'Escuela', `autocomplete="off" maxlength="120" value="${esc(n.school || '')}"`)}
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-sigue>Siguiente</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
  const elige = f => { if (!f) return; if (!String(f.type || '').startsWith('image/')) return aviso('Elige una foto.'); foto = f; if (fotoUrl) URL.revokeObjectURL(fotoUrl); fotoUrl = URL.createObjectURL(f); const c = document.querySelector('[data-foto]'); c.classList.add('con'); c.innerHTML = `<img src="${fotoUrl}" alt="Foto de tu hijo">`; aviso(''); };
  $('viCamara').onchange = () => elige($('viCamara').files?.[0]);
  $('viGaleria').onchange = () => elige($('viGaleria').files?.[0]);
}
function leeNino() {
  const n = datos.nino;
  n.firstName = $('viNombre').value.trim().replace(/\s+/g, ' '); n.lastName = $('viApellidos').value.trim().replace(/\s+/g, ' ');
  n.birthDate = $('viNacimiento').value; n.school = $('viEscuela').value.trim(); n.category = $('viCategoria')?.value || '';
  if (!foto) return 'Falta la foto de tu hijo.';
  if (n.firstName.length < 2) return 'Escribe el nombre de tu hijo.';
  if (n.lastName.length < 2) return 'Escribe sus apellidos.';
  const e = edad(n.birthDate); if (e === null || e < 3 || e > 20) return 'Revisa la fecha de nacimiento.';
  if (!n.sex) return 'Elige niño o niña.';
  if (!n.foot) return 'Elige su pierna buena.';
  if (n.school.length < 2) return 'Escribe su escuela.';
  if (n.type === 'goalkeeper') n.position = 'Portero';
  return '';
}

/* ---------- Su familia ---------- */
function pasoFamilia() {
  paso = 'familia'; const t = datos.tutor, em = datos.emergencia;
  pinta(`${barra()}<section class="vi-paso"><h2>Su familia</h2><p class="vi-intro">Por aquí te mandamos su pase y cualquier aviso.</p>
    ${campo('viTutor', 'Tu nombre completo', `autocomplete="name" autocapitalize="words" maxlength="120" value="${esc(t.name || '')}"`)}
    <div class="vi-grupo"><span>Eres su</span>${chips('relationship', PARENTESCOS, t.relationship)}</div>
    ${campo('viTel', 'Tu WhatsApp', `type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="477 123 4567" value="${esc(t.phone || '')}"`, 'Por aquí te mandamos el pase y los avisos.')}
    ${campo('viCorreo', 'Correo <em>opcional</em>', `type="email" autocomplete="email" maxlength="160" value="${esc(t.email || '')}"`)}
    <div class="vi-grupo"><span>¿Cómo te enteraste?</span>${chips('channel', [['Instagram', 'Instagram'], ['Facebook', 'Facebook'], ['WhatsApp', 'WhatsApp'], ['Recomendación', 'Recomendación'], ['Otro', 'Otro']], t.channel)}</div>
    <div id="viRefWrap" class="${t.channel === 'Recomendación' ? '' : 'hidden'}">${campo('viRef', '¿Quién te recomendó?', `maxlength="120" value="${esc(t.referral || '')}"`)}</div>
    <h3 class="vi-sub">Si algo pasa</h3>
    ${campo('viEmNombre', 'Otro contacto de emergencia', `autocomplete="off" maxlength="120" placeholder="Nombre" value="${esc(em.nombre || '')}"`, 'Alguien distinto a ti, por si no te localizamos.')}
    ${campo('viEmTel', 'Su teléfono', `type="tel" inputmode="tel" maxlength="16" placeholder="477 123 4567" value="${esc(em.telefono || '')}"`)}
    ${campo('viRecoge', '¿Quién más puede recogerlo? <em>opcional</em>', `maxlength="300" placeholder="Nombre y parentesco" value="${esc(datos.recoge || '')}"`)}
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-aparta>${info.signingOpen ? 'Siguiente' : 'Apartar su lugar'}</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
}
function leeFamilia() {
  const t = datos.tutor, em = datos.emergencia;
  t.name = $('viTutor').value.trim().replace(/\s+/g, ' '); t.phone = $('viTel').value.trim(); t.email = $('viCorreo').value.trim(); t.referral = $('viRef')?.value.trim() || '';
  em.nombre = $('viEmNombre').value.trim(); em.telefono = $('viEmTel').value.trim(); datos.recoge = $('viRecoge').value.trim();
  if (t.name.length < 5 || !/\S+\s+\S+/.test(t.name)) return 'Escribe tu nombre y apellido.';
  if (!t.relationship) return 'Dinos si eres su mamá, papá o tutor.';
  if (diez(t.phone).length !== 10) return 'Tu WhatsApp debe tener 10 dígitos.';
  if (t.email && !/^\S+@\S+\.\S+$/.test(t.email)) return 'Revisa el correo.';
  if (!t.channel) return 'Dinos cómo te enteraste.';
  if (t.channel === 'Recomendación' && t.referral.length < 2) return 'Dinos quién te recomendó.';
  if (em.nombre.length < 3) return 'Falta el otro contacto de emergencia.';
  if (diez(em.telefono).length !== 10) return 'El teléfono de emergencia debe tener 10 dígitos.';
  if (diez(em.telefono) === diez(t.phone)) return 'El contacto de emergencia debe ser otra persona, con otro teléfono.';
  return '';
}

async function preparaFoto(file) {
  const img = await new Promise((ok, mal) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No pudimos leer esa foto.')); }; i.src = u; });
  const full = await encodeVariant(img, 1000, .78, FULL_MAX_BYTES);
  let thumb = null; try { thumb = await encodeVariant(img, THUMB_MAX_SIDE, .75, THUMB_MAX_BYTES); } catch { thumb = null; }
  return { ...full, thumb };
}

/* Apartar: el niño, su familia y a quién llamar. Sin salud ni firma. */
async function aparta(btn) {
  if (enviando) return;
  const falta = leeFamilia(); if (falta) return aviso(falta);
  enviando = true; btn.disabled = true; btn.textContent = 'Guardando…'; aviso('');
  try {
    const n = datos.nino, t = datos.tutor;
    resultado = await rpc('v2_public_visoria_reserve', {
      club_key: CLUB_KEY, slug: SLUG,
      nino: { firstName: n.firstName, lastName: n.lastName, birthDate: n.birthDate, sex: n.sex, category: n.category || null, type: n.type, position: n.position || null, foot: n.foot, school: n.school },
      tutor: { name: t.name, phone: diez(t.phone), email: t.email || null, channel: t.channel, referral: t.referral || null, relationship: t.relationship },
      emergencia: { nombre: datos.emergencia.nombre, telefono: diez(datos.emergencia.telefono) }, recoge: datos.recoge || null });
    if (!resultado?.existing && foto) {
      btn.textContent = 'Subiendo la foto…';
      try {
        const f = await preparaFoto(foto), base = `organizations/${ctx.organizationId}/prospects/${resultado.id}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(`${base}/profile.${f.ext}`, f.blob, { contentType: f.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false });
        if (error) throw error;
        let thumb = null;
        if (f.thumb) { const r = `${base}/profile-thumb.${f.thumb.ext}`; const { error: e2 } = await supabase.storage.from(PHOTO_BUCKET).upload(r, f.thumb.blob, { contentType: f.thumb.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false }); if (!e2) thumb = r; }
        await rpc('v2_public_attach_prospect_photo', { club_key: CLUB_KEY, prospect_id: resultado.id, photo_path: `${base}/profile.${f.ext}`, photo_thumb_path: thumb });
      } catch { resultado.sinFoto = true; }
    }
    if (resultado.token) {
      liga = resultado.token;
      history.replaceState(null, '', `${location.pathname}${location.search}#firmar=${liga}`);
      firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga }).catch(() => null);
    }
    if (resultado.existing && !resultado.token) return yaEstaba();
    if (firmaCtx?.consent && !firmaCtx.consent.outdated) return listo();
    if (firmaCtx?.signingOpen) { datos.firmante = { name: t.name, relationship: t.relationship, phone: t.phone, email: t.email }; return pasoSalud(); }
    return apartado();
  } catch (e) { aviso(mensajeDeError(e)); btn.disabled = false; btn.textContent = info.signingOpen ? 'Siguiente' : 'Apartar su lugar'; }
  finally { enviando = false; }
}

/* Ya estaba inscrito pero desde otro WhatsApp: no se le da la liga a quien
 * sólo sabe el nombre del niño. */
function yaEstaba() {
  paso = '';
  pinta(`<section class="vi-pase"><div class="vi-pase-cab"><div class="vi-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <h1>${esc(datos.nino.firstName)} ya estaba inscrito</h1><p>Folio <b>${esc(resultado?.folio || '')}</b></p></div>
    <p class="vi-pie">Ya tenemos su lugar con otro WhatsApp. Si necesitas la liga para firmar, pídela al club desde ese número.</p>
    <a class="vi-boton verde" href="https://wa.me/${WHATSAPP_CLUB}?text=${encodeURIComponent(`Hola, necesito la liga de la visoría de ${datos.nino.firstName} ${datos.nino.lastName} (folio ${resultado?.folio || ''}).`)}" target="_blank" rel="noopener">Escribir al club</a>
    <footer class="vi-lema"><span>CURTIMOS CAMPEONES DEL MUNDO</span><b>#WeAreTanners</b></footer></section>`);
}

/* ---------- Salud ----------
 * docs/visorias/00 §B: breve y proporcional; "ninguna conocida" y "prefiero
 * informarlo en privado". No es un certificado médico. */
function pasoSalud() {
  paso = 'salud'; const s = datos.salud, nombre = esc(firmaCtx?.prospect?.firstName || datos.nino.firstName || 'tu hijo');
  pinta(`${barra()}<section class="vi-paso"><h2>Su salud</h2><p class="vi-intro">Para cuidar a ${nombre} en la cancha. Es un dato sensible: sólo lo ve el personal autorizado del club, nunca los visores ni otras familias.</p>
    ${PREGUNTAS_SALUD.map(q => `<div class="vi-pregunta" data-pregunta="${q.k}"><b>${esc(q.t)} <i class="vi-req">*</i></b>
      ${chips(`salud:${q.k}`, [['ninguna', 'Ninguna conocida'], ['si', 'Sí'], ['privado', 'Prefiero decirlo en privado']], s[q.k]?.respuesta || '')}
      <label class="vi-campo opc${s[q.k]?.respuesta === 'si' ? '' : ' hidden'}" data-detalle="${q.k}"><span>¿Cuál? Lo mínimo necesario</span><input id="viSalud_${q.k}" maxlength="300" value="${esc(s[q.k]?.detalle || '')}" placeholder="${esc(q.ej)}"></label></div>`).join('')}
    <p class="vi-nota">Contestar esto no sustituye una valoración médica. Si algo requiere revisión, el coordinador te contacta en privado antes de la visoría.</p>
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-sigue>Siguiente</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
}
function leeSalud() {
  for (const q of PREGUNTAS_SALUD) { if (datos.salud[q.k]?.respuesta === 'si') datos.salud[q.k].detalle = $(`viSalud_${q.k}`).value.trim(); }
  return faltaEnSalud(datos.salud);
}

/* ---------- Autorizaciones ---------- */
function documento(tipo) {
  const l = firmaCtx.legal, d = tipo === 'privacidad' ? l.privacy : l.consent;
  leidos.add(tipo);
  const texto = tipo === 'privacidad' ? d.body : rellenaFirmante(d.body, datos, firmaCtx.prospect);
  document.body.insertAdjacentHTML('beforeend', `<div id="viFondo" class="vi-fondo"></div><section id="viHoja" class="vi-hoja" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
    <header><div><small>${esc(d.version)}</small><b>${esc(d.title)}</b></div><button type="button" class="vi-cierra" data-cierra aria-label="Cerrar">×</button></header>
    <div class="vi-hoja-texto" tabindex="0">${esc(texto).replace(/\n/g, '<br>')}</div>
    <footer><button type="button" class="vi-boton claro" data-descarga="${tipo}">Descargar</button><button type="button" class="vi-boton" data-cierra>Listo, lo leí</button></footer></section>`);
  document.body.style.overflow = 'hidden';
  $('viHoja').querySelector('.vi-hoja-texto').focus();
}
function cierraDocumento() { $('viHoja')?.remove(); $('viFondo')?.remove(); document.body.style.overflow = ''; pintaLeidos(); }
function descargaDocumento(tipo) {
  const l = firmaCtx.legal, d = tipo === 'privacidad' ? l.privacy : l.consent;
  const texto = `${d.title}\n${d.version}\nHuella SHA-256: ${d.hash}\n\n${tipo === 'privacidad' ? d.body : rellenaFirmante(d.body, datos, firmaCtx.prospect)}\n`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  a.download = `${tipo === 'privacidad' ? 'aviso-de-privacidad' : 'consentimiento'}-visoria.txt`; document.body.appendChild(a); a.click(); a.remove();
}
function pintaLeidos() {
  document.querySelectorAll('[data-doc]').forEach(b => b.classList.toggle('leido', leidos.has(b.dataset.doc)));
}
function pasoAutoriza() {
  paso = 'autoriza'; const l = firmaCtx.legal, c = firmaCtx.campaign;
  const decl = l.declarations.filter(d => d.key !== 'guardian_authority');
  pinta(`${barra()}<section class="vi-paso"><h2>Autorizaciones</h2>
    <div class="vi-evento"><small>Consentimiento informado para visorías</small><b>${esc(c.title)}</b>
      <dl><div><dt>Organiza</dt><dd>${esc(l.organizer)}</dd></div><div><dt>Cuándo</dt><dd>${esc(l.schedule || c.datesLabel || '')}</dd></div>
      <div><dt>Dónde</dt><dd>${esc(c.location || '')}</dd></div>${l.evaluator ? `<div><dt>Evalúa también</dt><dd>${esc(l.evaluator)}</dd></div>` : ''}
      <div><dt>Coordina</dt><dd>${esc(l.coordinator || '')}</dd></div><div><dt>Versión</dt><dd>${esc(l.consent.version)}</dd></div></dl></div>
    ${l.insurance === 'sin_seguro_verificado'
      ? '<div class="vi-seguro" role="note"><b>IMPORTANTE: ESTA VISORÍA NO INCLUYE SEGURO MÉDICO NI DE ACCIDENTES PROPORCIONADO POR TANNERY CITY FC</b><span>Puedes valorar un seguro privado para actividades deportivas. Esto no cambia las obligaciones legales del club.</span></div>'
      : `<div class="vi-seguro con" role="note"><b>Seguro de este evento</b><span>${esc(l.insuranceDetail || '')}</span></div>`}
    <div class="vi-riesgos"><b>Riesgos propios del fútbol</b><ul>${RIESGOS.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <p>La visoría es una evaluación: no garantiza selección, contratación, beca ni vínculo con ningún club.</p></div>
    <div class="vi-docs"><button type="button" class="vi-doc-boton" data-doc="consentimiento"><b>Leer el consentimiento completo</b><span>${esc(l.consent.version)}</span></button>
      <button type="button" class="vi-doc-boton" data-doc="privacidad"><b>Leer el aviso de privacidad</b><span>${esc(l.privacy.version)}</span></button></div>
    <h3 class="vi-sub">Lo que autorizas</h3>
    ${decl.map(d => d.choice
      ? `<div class="vi-decision${d.key === 'media_publication' ? ' opc' : ''}" data-decision="${d.key}"><p>${esc(d.text)}${d.key === 'media_publication' ? ' <em>Opcional: decir que no no afecta su participación.</em>' : ''}</p>
          <div class="vi-chips" role="radiogroup" data-campo="decision:${d.key}"><button type="button" role="radio" data-v="si" aria-checked="${datos.decisiones[d.key]?.value === true}">Sí, autorizo</button><button type="button" role="radio" data-v="no" aria-checked="${datos.decisiones[d.key]?.value === false}">No autorizo</button></div></div>`
      : `<label class="vi-check vi-declara"><input type="checkbox" data-declara="${d.key}"${datos.decisiones[d.key]?.value ? ' checked' : ''}><span>${esc(d.text)} <i class="vi-req">*</i></span></label>`).join('')}
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-sigue>Siguiente</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
  pintaLeidos();
  document.querySelectorAll('[data-declara]').forEach(i => i.addEventListener('change', () => { datos.decisiones[i.dataset.declara] = { value: i.checked, at: new Date().toISOString() }; aviso(''); }));
}
function leeAutoriza() {
  if (!leidos.has('consentimiento')) return 'Abre y lee el consentimiento completo antes de firmar.';
  if (!leidos.has('privacidad')) return 'Abre y lee el aviso de privacidad antes de firmar.';
  return faltaEnDecisiones(firmaCtx.legal.declarations.filter(d => d.key !== 'guardian_authority'), datos.decisiones);
}

/* ---------- Firma ---------- */
function pasoFirma() {
  paso = 'firma'; const f = datos.firmante, em = Object.keys(datos.emergencia).length ? datos.emergencia : (firmaCtx.prospect.emergencia || {});
  const autoridad = firmaCtx.legal.declarations.find(d => d.key === 'guardian_authority');
  pinta(`${barra()}<section class="vi-paso"><h2>Firma y listo</h2><p class="vi-intro">Firma quien tiene la patria potestad o la tutela de ${esc(firmaCtx.prospect.firstName)}.</p>
    ${campo('viFirmante', 'Nombre completo de quien firma', `autocomplete="name" autocapitalize="words" maxlength="120" value="${esc(f.name || firmaCtx.prospect.guardian || '')}"`)}
    <div class="vi-grupo"><span>Eres su</span>${chips('firmante', PARENTESCOS, f.relationship || firmaCtx.prospect.relationship || '')}</div>
    <div id="viOtroWrap" class="${(f.relationship || '') === 'otro' ? '' : 'hidden'}">${campo('viOtro', '¿Qué parentesco o representación tienes?', `maxlength="120" value="${esc(f.relationshipDetail || '')}"`, 'El club revisará tus facultades antes de autorizarlo.')}</div>
    ${campo('viFirmaTel', 'Tu WhatsApp', `type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="477 123 4567" value="${esc(f.phone || '')}"`, 'Desde este número le mandas el pase al club: así verificamos que eres tú.')}
    ${campo('viFirmaCorreo', 'Correo <em>opcional</em>', `type="email" autocomplete="email" maxlength="160" value="${esc(f.email || '')}"`)}
    ${campo('viEmNombre', 'Otro contacto de emergencia', `maxlength="120" value="${esc(em.nombre || '')}"`)}
    ${campo('viEmTel', 'Su teléfono', `type="tel" inputmode="tel" maxlength="16" value="${esc(em.telefono || '')}"`)}
    ${campo('viRecoge', '¿Quién más puede recogerlo? <em>opcional</em>', `maxlength="300" value="${esc(datos.recoge || firmaCtx.prospect.recoge || '')}"`)}
    <div class="vi-firma"><div class="vi-firma-cab"><b>Firma aquí con tu dedo <i class="vi-req">*</i></b><button type="button" class="vi-mini" data-borra>Borrar</button></div>
      <canvas id="viLienzo" aria-label="Recuadro para firmar"></canvas><small class="vi-nota">Tu firma queda ligada a este documento y a esta versión; no sirve para otro.</small></div>
    <label class="vi-check vi-declara"><input id="viAutoridad" type="checkbox"${datos.decisiones.guardian_authority?.value ? ' checked' : ''}><span>${esc(autoridad?.text || 'Declaro estar legalmente facultado(a) para otorgar esta autorización.')} <i class="vi-req">*</i></span></label>
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-firma>Firmar el consentimiento</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
  $('viAutoridad').addEventListener('change', e => { datos.decisiones.guardian_authority = { value: e.target.checked, at: new Date().toISOString() }; aviso(''); });
  lienzo();
}
/* Lienzo nítido en pantallas de alta densidad: se dibuja en pixeles reales y
 * se cuenta el trazo (puntos y tamaño) para no aceptar un lienzo en blanco. */
function lienzo() {
  const c = $('viLienzo'), dpr = Math.min(3, window.devicePixelRatio || 1), ancho = c.getBoundingClientRect().width || 340, alto = ancho * 220 / 600;
  c.width = Math.round(ancho * dpr); c.height = Math.round(alto * dpr);
  const g = c.getContext('2d'); let dibujando = false, ultimo = null;
  const limpia = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(dpr, 0, 0, dpr, 0, 0); trazo = { puntos: 0, trazos: 0, minX: 1e9, minY: 1e9, maxX: 0, maxY: 0 }; };
  limpia(); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#07191e';
  const punto = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * ancho / r.width, y: (e.clientY - r.top) * alto / r.height }; };
  const cuenta = p => { trazo.puntos++; trazo.minX = Math.min(trazo.minX, p.x); trazo.maxX = Math.max(trazo.maxX, p.x); trazo.minY = Math.min(trazo.minY, p.y); trazo.maxY = Math.max(trazo.maxY, p.y); };
  c.addEventListener('pointerdown', e => { dibujando = true; ultimo = punto(e); trazo.trazos++; cuenta(ultimo); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', e => { if (!dibujando) return; const p = punto(e); g.beginPath(); g.moveTo(ultimo.x, ultimo.y); g.lineTo(p.x, p.y); g.stroke(); ultimo = p; cuenta(p); e.preventDefault(); });
  const fin = () => { dibujando = false; ultimo = null; };
  c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
  document.querySelector('[data-borra]').onclick = limpia;
}
function leeFirma() {
  const f = datos.firmante;
  f.name = $('viFirmante').value.trim().replace(/\s+/g, ' '); f.phone = $('viFirmaTel').value.trim(); f.email = $('viFirmaCorreo').value.trim();
  f.relationshipDetail = $('viOtro')?.value.trim() || '';
  datos.emergencia = { nombre: $('viEmNombre').value.trim(), telefono: $('viEmTel').value.trim() }; datos.recoge = $('viRecoge').value.trim();
  if (f.name.length < 5 || !/\S+\s+\S+/.test(f.name)) return 'Escribe el nombre y apellido de quien firma.';
  if (!f.relationship) return 'Dinos si eres su mamá, papá, tutor legal u otro.';
  if (f.relationship === 'otro' && f.relationshipDetail.length < 3) return 'Dinos qué parentesco o representación tienes.';
  if (diez(f.phone).length !== 10) return 'Tu WhatsApp debe tener 10 dígitos.';
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return 'Revisa el correo.';
  if (datos.emergencia.nombre.length < 3 || diez(datos.emergencia.telefono).length !== 10) return 'Falta el otro contacto de emergencia (nombre y 10 dígitos).';
  if (diez(datos.emergencia.telefono) === diez(f.phone)) return 'El contacto de emergencia debe ser otra persona, con otro teléfono.';
  if (!trazoValido(trazo)) return 'Falta tu firma en el recuadro.';
  if (!datos.decisiones.guardian_authority?.value) return 'Marca que estás legalmente facultado(a) para autorizar.';
  return '';
}

async function firma(btn) {
  if (enviando) return;
  const falta = leeFirma(); if (falta) return aviso(falta);
  enviando = true; btn.disabled = true; btn.textContent = 'Firmando…'; aviso('');
  // Una llave por intento de firma: si el teléfono reintenta, no hay dos expedientes.
  if (!llaveFirma) llaveFirma = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '') + '-vis';
  const l = firmaCtx.legal, f = datos.firmante;
  const choices = {};
  for (const d of l.declarations) { const v = datos.decisiones[d.key]; if (v) choices[d.key] = { value: v.value, at: v.at }; }
  try {
    const r = await rpc('v2_public_visoria_sign', { club_key: CLUB_KEY, token: liga, payload: {
      idempotencyKey: llaveFirma, eventHash: l.eventHash, consentDocumentId: l.consent.id, privacyDocumentId: l.privacy.id,
      signer: { name: f.name, relationship: f.relationship, relationshipDetail: f.relationshipDetail || null, phone: diez(f.phone), email: f.email || null },
      emergencia: { nombre: datos.emergencia.nombre, telefono: diez(datos.emergencia.telefono) }, recoge: datos.recoge || null,
      salud: datos.salud, choices,
      firma: { imagen: $('viLienzo').toDataURL('image/png'), puntos: trazo.puntos, trazos: trazo.trazos,
               ancho: Math.round(trazo.maxX - trazo.minX), alto: Math.round(trazo.maxY - trazo.minY) },
      uiVersion: UI_VERSION, userAgent: navigator.userAgent.slice(0, 300), documentsOpened: [...leidos] } });
    if (r?.error) {
      if (/Document version changed/.test(r.error)) { firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga }); leidos.clear(); llaveFirma = ''; }
      throw new Error(r.error);
    }
    btn.textContent = 'Guardando tu expediente…';
    await expediente('build');
    firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga });
    datos.salud = {}; // lo sensible no se queda en la página
    listo();
  } catch (e) {
    if (/Document version changed/.test(String(e?.message))) pasoAutoriza();
    else { btn.disabled = false; btn.textContent = 'Firmar el consentimiento'; }
    aviso(mensajeDeError(e));
  } finally { enviando = false; }
}

/* El PDF lo genera el servidor. Si falla, la firma ya está guardada y se
 * reintenta: la página nunca dice "completo" sin el expediente. */
async function expediente(action) {
  const { data, error } = await supabase.functions.invoke('visoria-expediente', { body: { action, token: liga } });
  if (error || data?.error) throw new Error(data?.error || 'No se pudo generar el expediente.');
  return data;
}

/* ---------- Listo / estado ---------- */
function apartado() {
  paso = '';
  const n = datos.nino, r = resultado || {};
  pinta(`<section class="vi-pase">
    <div class="vi-pase-cab"><div class="vi-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h1>¡Lugar apartado para ${esc(n.firstName)}!</h1>
      <p>Folio <b>${esc(r.folio || '')}</b>${r.sinFoto ? ' · La foto no se subió: tráela el día de la visoría.' : ''}</p></div>
    <div class="vi-estado pendiente" role="status"><b>Falta firmar el consentimiento</b><span>El club está terminando los documentos de la visoría. Te mandamos esta misma liga por WhatsApp cuando se abra la firma. Sin consentimiento firmado no puede entrar a la cancha.</span></div>
    <button type="button" class="vi-boton claro" data-guarda-liga>Guardar mi liga para firmar</button>
    ${bloquePase()}
  </section>`);
  armaYMuestraPase();
}
function listo() {
  paso = '';
  const p = firmaCtx.prospect, k = firmaCtx.consent, est = estadoParaFamilia(firmaCtx);
  if (!datos.nino.firstName) Object.assign(datos.nino, { firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate, category: p.category, type: p.type, position: p.position, foot: p.foot });
  if (!resultado) resultado = { folio: p.folio };
  pinta(`<section class="vi-pase">
    <div class="vi-pase-cab"><div class="vi-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h1>${k ? `¡${esc(p.firstName)} está inscrito!` : `${esc(p.firstName)} tiene su lugar`}</h1><p>Folio <b>${esc(p.folio || '')}</b></p></div>
    <div class="vi-estado ${est.tono}" role="status"><b>${esc(est.titulo)}</b><span>${esc(est.texto)}</span></div>
    ${k && !k.hasCopy ? '<button type="button" class="vi-boton" data-reintenta>Generar mi expediente</button>' : ''}
    ${k?.hasCopy ? '<button type="button" class="vi-boton claro" data-copia>Descargar mi copia (PDF)</button>' : ''}
    ${!k && firmaCtx.signingOpen ? '<button type="button" class="vi-boton" data-a-firmar>Firmar el consentimiento</button>' : ''}
    ${k?.media ? '<button type="button" class="vi-link" data-quita-fotos>Ya no autorizo fotos ni video de mi hijo</button>' : ''}
    <button type="button" class="vi-link" data-guarda-liga>Guardar mi liga</button>
    ${bloquePase()}
  </section>`);
  armaYMuestraPase();
}
const bloquePase = () => `
    <div class="vi-pase-img" id="viPaseImg"><span class="vi-cargando-mini">Armando su pase…</span></div>
    <ol class="vi-pasos-finales">
      <li><b>Mándalo al WhatsApp de Tannery City</b><span>Desde tu número registrado: así confirmamos su lugar y verificamos que eres tú.</span></li>
      <li><b>Llévalo en tu celular</b><span>Sin hojas: lo escaneamos desde tu pantalla en la entrada. Llega 15 minutos antes con ropa deportiva y agua. <b>Prohibidos los tachones</b>: usa multitacos o tenis deportivos.</span></li>
    </ol>
    <button type="button" class="vi-boton verde" data-al-club><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z"/></svg>Mandar pase al WhatsApp de Tannery City</button>
    <p class="vi-pista">Elige WhatsApp y el chat de Tannery City · 479 265 1338</p>
    <button type="button" class="vi-boton claro" data-guarda>Guardar pase en mi celular</button>
    <button type="button" class="vi-link" data-otro>Inscribir a otro hijo</button>
    <footer class="vi-lema"><span>CURTIMOS CAMPEONES DEL MUNDO</span><b>#WeAreTanners</b></footer>`;

/* ---------- Pase ----------
 * Presidencia (29/10/2026): "un formato similar al que cuando se inscriben a
 * Tannery City... que lo deben compartir al WhatsApp de Tannery City... su
 * nombre en gigante, su categoría y años". Es la credencial del club en modo
 * visoría, con QR que en la puerta abre al niño en TannerOS. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaLarga = f => { const [a, m, d] = String(f || '').split('-').map(Number); return a ? `${d} ${MESES[m - 1]} ${a}` : ''; };
const PIERNA = { right: 'Derecha', left: 'Izquierda', both: 'Las dos' };
let pasePng = null;
const nombreDelPase = () => `pase-visoria-${(resultado?.folio || 'tannery').toLowerCase()}.png`;
function textoParaClub() {
  const n = datos.nino, r = resultado || {};
  return `Hola, Tannery City. Inscribí a ${n.firstName} ${n.lastName} a la ${info.title || 'visoría'}.\nFolio: ${r.folio || ''}\nNacimiento: ${fechaLarga(n.birthDate)} (${edad(n.birthDate)} años)${n.category ? `\nCategoría: ${n.category}` : ''}\nTe mando su pase.`;
}
async function armaPase() {
  const n = datos.nino, r = resultado || {}, e = edad(n.birthDate);
  const lugarCorto = String(info.location || '').split('·')[0].trim() || 'Por confirmar';
  const { blob } = await renderWelcomeCard({ modo: 'visoria', firstName: n.firstName, lastName: n.lastName, category: n.category || `Nacido en ${String(n.birthDate).slice(0, 4)}`,
    folio: r.folio, photoUrl: fotoUrl || null,
    filas: [{ etiqueta: 'Edad', valor: e !== null ? `${e} años` : '' }, { etiqueta: 'Nacimiento', valor: fechaLarga(n.birthDate) },
      { etiqueta: 'Posición', valor: n.type === 'goalkeeper' ? 'Portero' : (n.position && n.position !== 'No sé' ? n.position : 'Jugador') },
      { etiqueta: 'Pierna', valor: PIERNA[n.foot] || '' }, { etiqueta: 'Cuándo', valor: 'Vie 13 y Sáb 14 nov' }, { etiqueta: 'Dónde', valor: lugarCorto }] });
  return blob;
}
async function armaYMuestraPase() {
  const n = datos.nino, r = resultado || {};
  try {
    pasePng = await armaPase();
    $('viPaseImg').innerHTML = `<img src="${URL.createObjectURL(pasePng)}" alt="Pase de visoría de ${esc(`${n.firstName} ${n.lastName}`)}">`;
  } catch { $('viPaseImg').innerHTML = `<div class="vi-pase-respaldo"><small>PASE DE VISORÍA</small><b>${esc(`${n.firstName} ${n.lastName}`)}</b><span>Folio ${esc(r.folio || '')}</span></div>`; }
}
function guardaPase() {
  if (!pasePng) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(pasePng); a.download = nombreDelPase(); document.body.appendChild(a); a.click(); a.remove();
}
/* Al WhatsApp del club: en el teléfono se comparte la imagen (la familia elige
   el chat de Tannery City) y además se abre el chat con el texto listo. */
async function alClub() {
  const texto = textoParaClub();
  if (pasePng && navigator.canShare) {
    const archivo = new File([pasePng], nombreDelPase(), { type: 'image/png' });
    if (navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: texto }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
  }
  guardaPase();
  window.open(`https://wa.me/${WHATSAPP_CLUB}?text=${encodeURIComponent(`${texto}\n(Te adjunto la imagen del pase que se descargó.)`)}`, '_blank', 'noopener');
}
/* La liga es de la familia: sirve para firmar, descargar su copia y quitar
   el permiso de fotos. No se manda a nadie más. */
async function guardaLiga() {
  const url = `${location.origin}/visoria/${location.search}#firmar=${liga}`;
  try { if (navigator.share) { await navigator.share({ title: 'Mi liga de la visoría', url }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); aviso(''); alert('Liga copiada. Guárdala: sirve para firmar y descargar tu copia.'); } catch { prompt('Copia tu liga:', url); }
}

/* ---------- Navegación ---------- */
document.addEventListener('click', async e => {
  const t = e.target;
  const chip = t.closest('.vi-chips [data-v]');
  if (chip) {
    const g = chip.closest('.vi-chips'), k = g.dataset.campo, v = chip.dataset.v;
    g.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b === chip)));
    if (['sex', 'type', 'position', 'foot'].includes(k)) datos.nino[k] = v;
    if (k === 'type') $('viPosicionGrupo')?.classList.toggle('hidden', v === 'goalkeeper');
    if (k === 'channel') { datos.tutor.channel = v; $('viRefWrap')?.classList.toggle('hidden', v !== 'Recomendación'); }
    if (k === 'relationship') datos.tutor.relationship = v;
    if (k === 'firmante') { datos.firmante.relationship = v; $('viOtroWrap')?.classList.toggle('hidden', v !== 'otro'); }
    if (k.startsWith('salud:')) {
      const q = k.slice(6); datos.salud[q] = { ...(datos.salud[q] || {}), respuesta: v };
      document.querySelector(`[data-detalle="${q}"]`)?.classList.toggle('hidden', v !== 'si');
    }
    if (k.startsWith('decision:')) datos.decisiones[k.slice(9)] = { value: v === 'si', at: new Date().toISOString() };
    return;
  }
  if (t.closest('[data-cierra]') || t.id === 'viFondo') return cierraDocumento();
  const doc = t.closest('[data-doc]'); if (doc) return documento(doc.dataset.doc);
  const des = t.closest('[data-descarga]'); if (des) return descargaDocumento(des.dataset.descarga);
  if (t.closest('[data-empieza]')) { pasos = info.signingOpen ? ['nino', 'familia', 'salud', 'autoriza', 'firma'] : ['nino', 'familia']; return pasoNino(); }
  if (t.closest('[data-a-firmar]')) { pasos = ['salud', 'autoriza', 'firma']; return pasoSalud(); }
  if (t.closest('[data-foto],[data-camara]')) return $('viCamara')?.click();
  if (t.closest('[data-galeria]')) return $('viGaleria')?.click();
  if (t.closest('[data-atras]')) {
    if (paso === 'nino') leeNino(); if (paso === 'familia') leeFamilia(); if (paso === 'salud') leeSalud();
    const i = pasos.indexOf(paso);
    if (i <= 0) return firmaCtx && liga ? listo() : portada();
    return ({ nino: pasoNino, familia: pasoFamilia, salud: pasoSalud, autoriza: pasoAutoriza })[pasos[i - 1]]();
  }
  if (t.closest('[data-sigue]')) {
    const falta = paso === 'nino' ? leeNino() : paso === 'salud' ? leeSalud() : paso === 'autoriza' ? leeAutoriza() : '';
    if (falta) return aviso(falta);
    return ({ nino: pasoFamilia, salud: pasoAutoriza, autoriza: pasoFirma })[paso]();
  }
  const ap = t.closest('[data-aparta]'); if (ap) return aparta(ap);
  const fi = t.closest('[data-firma]'); if (fi) return firma(fi);
  const re = t.closest('[data-reintenta]');
  if (re) {
    re.disabled = true; re.textContent = 'Generando…';
    try { await expediente('build'); firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga }); listo(); }
    catch { re.disabled = false; re.textContent = 'Generar mi expediente'; alert('No se pudo todavía. Tu firma ya quedó guardada; inténtalo en un momento.'); }
    return;
  }
  const co = t.closest('[data-copia]');
  if (co) {
    co.disabled = true;
    try { const r = await expediente('copy'); if (r?.url) location.href = r.url; } catch { alert('No se pudo descargar ahora. Inténtalo de nuevo.'); }
    co.disabled = false; return;
  }
  if (t.closest('[data-quita-fotos]')) {
    if (!confirm('Dejaremos de usar fotos y video de tu hijo en lo que publiquemos desde hoy. ¿Confirmas?')) return;
    try { await rpc('v2_public_visoria_media_revoke', { club_key: CLUB_KEY, token: liga }); firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga }); listo(); }
    catch { alert('No se pudo guardar. Inténtalo de nuevo.'); }
    return;
  }
  if (t.closest('[data-guarda-liga]')) return guardaLiga();
  if (t.closest('[data-al-club]')) return alClub();
  if (t.closest('[data-guarda]')) return guardaPase();
  if (t.closest('[data-otro]')) {
    pasePng = null; datos.nino = { sex: '', type: 'player', position: '', foot: '' }; datos.salud = {}; datos.decisiones = {}; foto = null;
    if (fotoUrl) URL.revokeObjectURL(fotoUrl); fotoUrl = ''; resultado = null; liga = ''; firmaCtx = null; llaveFirma = ''; leidos.clear();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    await recarga(); if (!info.open) return portada(); pasos = info.signingOpen ? ['nino', 'familia', 'salud', 'autoriza', 'firma'] : ['nino', 'familia']; return pasoNino();
  }
  if (t.closest('[data-comparte]')) {
    const url = `${location.origin}/visoria`, txt = `${info.title || 'Visoría'} de Tannery City · ${info.datesLabel || ''}. Sin costo, cupo limitado.`;
    try { if (navigator.share) { await navigator.share({ title: info.title, text: txt, url }); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${txt} ${url}`)}`, '_blank', 'noopener');
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('viHoja')) cierraDocumento(); });

async function recarga() { info = await rpc('v2_public_visoria', { club_key: CLUB_KEY, slug: SLUG }); }
async function arranca() {
  try {
    [info, ctx] = await Promise.all([rpc('v2_public_visoria', { club_key: CLUB_KEY, slug: SLUG }), rpc('v2_public_context', { club_key: CLUB_KEY }).catch(() => ({}))]);
    document.title = `${info.title || 'Visoría'} · Tannery City`;
    liga = (location.hash.match(/firmar=([0-9a-f]{48})/) || [])[1] || '';
    if (!liga) return portada();
    try { firmaCtx = await rpc('v2_public_visoria_sign_context', { club_key: CLUB_KEY, token: liga }); }
    catch {
      liga = ''; history.replaceState(null, '', `${location.pathname}${location.search}`);
      portada(); return;
    }
    const k = firmaCtx.consent;
    if (!k || k.outdated) {
      if (firmaCtx.signingOpen) { pasos = ['salud', 'autoriza', 'firma']; datos.firmante = { name: firmaCtx.prospect.guardian || '', relationship: firmaCtx.prospect.relationship && firmaCtx.prospect.relationship !== 'sin_dato' ? firmaCtx.prospect.relationship : '' }; return pasoSalud(); }
    }
    listo();
  } catch {
    pinta(`<section class="vi-portada"><div class="vi-escudo" aria-hidden="true">T</div><h1>Visoría</h1><p class="vi-pie">No pudimos abrir la visoría. Revisa tu conexión o escríbenos por WhatsApp.</p>
      <a class="vi-boton" href="https://wa.me/${WHATSAPP_CLUB}" target="_blank" rel="noopener">Escribir por WhatsApp</a></section>`);
  }
}
arranca();
