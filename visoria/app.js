/* VISORÍA PÚBLICA (29/10/2026, h53).
 *
 * Presidencia: "voy a hacer una visoría, quiero que todos se me registren en
 * TannerOS... que sea muy fácil para todos con sus fotos... que firmen
 * consentimientos". Viernes 13 y sábado 14 de noviembre, sin costo, 30 lugares.
 *
 *   Portada   fechas, lugar, lugares que quedan y un botón.
 *   Paso 1    el niño: foto, nombre, fecha de nacimiento, posición, pierna.
 *   Paso 2    papá o mamá: WhatsApp, cómo se enteró, emergencia y salud.
 *   Paso 3    firmar: términos de la visoría, uso de imagen y firma con el dedo.
 *   Pase      folio para mostrar en la puerta y compartir por WhatsApp.
 *
 * El registro es el de siempre (prospecto con folio y foto): así el club le da
 * seguimiento en Fichajes y los visores lo ven en Visorías.
 */
import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga } from '/v2/club-publico.js';
import { renderWelcomeCard } from '/welcome-card.js';
import { encodeVariant, FULL_MAX_BYTES, THUMB_MAX_SIDE, THUMB_MAX_BYTES, UPLOAD_CACHE_CONTROL } from '/v2/image-encode.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false } });
const CLUB_KEY = llaveDeLiga();
const SLUG = new URLSearchParams(location.search).get('c') || 'visoria-noviembre-2026';
const PHOTO_BUCKET = 'tanneros-prospect-photos';
const PRIVACY_NOTICE_VERSION = '2026-08-19-v1';
const WHATSAPP_CLUB = '524792651338';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function rpc(n, p = {}) { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; }

let info = null, ctx = null, paso = 0, foto = null, fotoUrl = '', enviando = false, resultado = null, firmado = false;
const datos = { nino: { sex: '', type: 'player', position: '', foot: '' }, tutor: { channel: '' }, salud: { seguro: '' }, emergencia: {}, imagen: true };

const ERRORES = {
  'Campaign full': 'Ya se llenaron los lugares. Escríbenos por WhatsApp y te avisamos si se libera uno.',
  'Campaign closed': 'Las inscripciones ya cerraron.',
  'Signature required': 'Falta tu firma.',
  'Signer name required': 'Escribe el nombre de quien firma.',
  'Emergency contact required': 'Falta el contacto de emergencia.',
  'Phone required': 'Revisa el WhatsApp: 10 dígitos.',
  'School required': 'Escribe la escuela.',
  'Guardian required': 'Escribe el nombre de papá, mamá o tutor.',
  'Birth date required': 'Falta la fecha de nacimiento.',
  'Invalid birth date': 'Revisa la fecha de nacimiento.'
};
const mensajeDe = e => { const m = String(e?.message || e || ''); const k = Object.keys(ERRORES).find(x => m.includes(x)); return k ? ERRORES[k] : 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.'; };

function edad(fecha) {
  if (!fecha) return null; const n = new Date(`${fecha}T12:00:00`), h = new Date();
  let a = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--; return a;
}
const chips = (campo, opciones, valor) => `<div class="vi-chips" role="radiogroup" data-campo="${campo}">${opciones.map(([v, t]) =>
  `<button type="button" role="radio" data-v="${esc(v)}" aria-checked="${valor === v}">${esc(t)}</button>`).join('')}</div>`;
// Lo obligatorio lleva su estrella dorada; lo opcional lo dice (29/10/2026).
const campo = (id, label, attrs = '', ayuda = '', opcional = /opcional|si la sabes/.test(label)) => `<label class="vi-campo${opcional ? ' opc' : ''}"><span>${label}</span><input id="${id}" ${attrs}>${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
const PASOS = ['Tu hijo', 'Su familia', 'Firmar'];

function pinta(html) { $('cargando').classList.add('hidden'); const c = $('contenido'); c.classList.remove('hidden'); c.innerHTML = html; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function barra() {
  return `<header class="vi-tope"><img src="/brand/crest-gold.png" alt="" class="vi-tope-escudo"><div><small>VISORÍA ${new Date().getFullYear()}</small><b>Paso ${paso} de 3 · ${PASOS[paso - 1]}</b></div></header>
    <div class="vi-barra" aria-hidden="true">${[1, 2, 3].map(n => `<i class="${n < paso ? 'hecho' : n === paso ? 'actual' : ''}"><span>${PASOS[n - 1]}</span></i>`).join('')}</div>
    <p class="vi-leyenda"><i class="vi-req">*</i> Todo es obligatorio, salvo lo que dice <em>opcional</em>.</p>`;
}
function aviso(t) { const m = $('viAviso'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); if (t) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

/* ---------- Portada ----------
 * Que den ganas de inscribirlo "al mejor equipo del mundo": escudo dorado,
 * letra del club, fechas, lugar y los lugares que quedan, y un botón. */
function portada() {
  paso = 0;
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
      <li class="vi-aviso"><span class="vi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><div><b>Calzado</b><span>Prohibidos los tachones. Usa multitacos o tenis deportivos.</span></div></li>
    </ul>
    ${cupo ? `<div class="vi-cupo"><div class="vi-cupo-cab"><b>${cerrado ? (info.closed ? 'Inscripciones cerradas' : 'Cupo lleno') : `Quedan ${quedan} de ${cupo} lugares`}</b><span>Cupo limitado</span></div><div class="vi-cupo-barra"><i style="width:${Math.min(100, Math.max(3, Math.round(ocupados / cupo * 100)))}%"></i></div></div>` : ''}
    ${cerrado
      ? `<a class="vi-boton" href="https://wa.me/${WHATSAPP_CLUB}?text=${encodeURIComponent('Hola, me interesa la visoría de Tannery City. ¿Me avisan si se abre un lugar?')}" target="_blank" rel="noopener">Avísame si se abre un lugar</a>`
      : '<button type="button" class="vi-boton" data-empieza>Inscribir a mi hijo</button><p class="vi-pie">Toma 2 minutos. Ten a la mano una foto de tu hijo.</p>'}
    <button type="button" class="vi-link" data-comparte>Compartir con otra familia</button>
    <footer class="vi-lema"><span>CURTIMOS CAMPEONES DEL MUNDO</span><b>#WeAreTanners</b></footer>
  </section>`);
}

/* ---------- Paso 1: el niño ---------- */
function pasoNino() {
  paso = 1; const n = datos.nino, cats = (ctx?.categories || []);
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

/* ---------- Paso 2: papá o mamá ---------- */
function pasoTutor() {
  paso = 2; const t = datos.tutor, s = datos.salud, em = datos.emergencia;
  pinta(`${barra()}<section class="vi-paso"><h2>Su familia</h2><p class="vi-intro">Por aquí te mandamos su pase y cualquier aviso.</p>
    ${campo('viTutor', 'Tu nombre', `autocomplete="name" autocapitalize="words" maxlength="120" value="${esc(t.name || '')}"`)}
    ${campo('viTel', 'Tu WhatsApp', `type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="477 123 4567" value="${esc(t.phone || '')}"`, 'Por aquí te mandamos el pase y los avisos.')}
    ${campo('viCorreo', 'Correo <em>opcional</em>', `type="email" autocomplete="email" maxlength="160" value="${esc(t.email || '')}"`)}
    <div class="vi-grupo"><span>¿Cómo te enteraste?</span>${chips('channel', [['Instagram', 'Instagram'], ['Facebook', 'Facebook'], ['WhatsApp', 'WhatsApp'], ['Recomendación', 'Recomendación'], ['Otro', 'Otro']], t.channel)}</div>
    <div id="viRefWrap" class="${t.channel === 'Recomendación' ? '' : 'hidden'}">${campo('viRef', '¿Quién te recomendó?', `maxlength="120" value="${esc(t.referral || '')}"`)}</div>
    <h3 class="vi-sub">Si algo pasa</h3>
    ${campo('viEmNombre', 'Contacto de emergencia', `autocomplete="off" maxlength="120" placeholder="Nombre" value="${esc(em.nombre || '')}"`)}
    ${campo('viEmTel', 'Su teléfono', `type="tel" inputmode="tel" maxlength="16" placeholder="477 123 4567" value="${esc(em.telefono || '')}"`)}
    <h3 class="vi-sub">Salud <em>opcional</em></h3>
    ${campo('viAlergias', 'Alergias', `maxlength="300" placeholder="Ninguna" value="${esc(s.alergias || '')}"`, '', true)}
    ${campo('viLesiones', 'Lesiones o condiciones', `maxlength="300" placeholder="Ninguna" value="${esc(s.lesiones || '')}"`, '', true)}
    ${campo('viMedicamentos', 'Medicamentos', `maxlength="300" placeholder="Ninguno" value="${esc(s.medicamentos || '')}"`, '', true)}
    <div class="vi-grupo opc"><span>Seguro médico <em>opcional</em></span>${chips('seguro', [['IMSS', 'IMSS'], ['ISSSTE', 'ISSSTE'], ['Privado', 'Privado'], ['Ninguno', 'Ninguno']], s.seguro)}</div>
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-sigue>Siguiente</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
}
const diez = v => String(v || '').replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');
function leeTutor() {
  const t = datos.tutor, s = datos.salud, em = datos.emergencia;
  t.name = $('viTutor').value.trim(); t.phone = $('viTel').value.trim(); t.email = $('viCorreo').value.trim(); t.referral = $('viRef')?.value.trim() || '';
  em.nombre = $('viEmNombre').value.trim(); em.telefono = $('viEmTel').value.trim();
  s.alergias = $('viAlergias').value.trim(); s.lesiones = $('viLesiones').value.trim(); s.medicamentos = $('viMedicamentos').value.trim();
  if (t.name.length < 2) return 'Escribe tu nombre.';
  if (diez(t.phone).length !== 10) return 'Tu WhatsApp debe tener 10 dígitos.';
  if (t.email && !/^\S+@\S+\.\S+$/.test(t.email)) return 'Revisa el correo.';
  if (!t.channel) return 'Dinos cómo te enteraste.';
  if (t.channel === 'Recomendación' && t.referral.length < 2) return 'Dinos quién te recomendó.';
  if (em.nombre.length < 3) return 'Falta el contacto de emergencia.';
  if (diez(em.telefono).length !== 10) return 'El teléfono de emergencia debe tener 10 dígitos.';
  return '';
}

/* ---------- Paso 3: firmar ---------- */
function pasoFirma() {
  paso = 3; firmado = false; const doc = info.documents || {}, vis = doc.visoria, img = doc.uso_de_imagen;
  pinta(`${barra()}<section class="vi-paso"><h2>Firma y listo</h2><p class="vi-intro">Lee los términos, decide sobre las fotos y firma con tu dedo.</p>
    <div class="vi-doc"><b>${esc(vis?.title || 'Términos para visorías')}</b><div class="vi-doc-texto" tabindex="0">${esc(vis?.body || 'Autorizo que mi hijo participe en la visoría.').replace(/\n/g, '<br>')}</div></div>
    <label class="vi-switch"><span><b>${esc(img?.title || 'Uso de fotos y video')}</b><small>Fotos y video de la visoría para redes del club. Puedes decir que no.</small></span><input id="viImagen" type="checkbox" role="switch"${datos.imagen ? ' checked' : ''}><i aria-hidden="true"></i></label>
    ${img?.body ? `<details class="vi-detalle"><summary>Leer uso de fotos y video</summary><p>${esc(img.body).replace(/\n/g, '<br>')}</p></details>` : ''}
    <div class="vi-firma"><div class="vi-firma-cab"><b>Firma aquí con tu dedo <i class="vi-req">*</i></b><button type="button" class="vi-mini" data-borra>Borrar</button></div>
      <canvas id="viLienzo" width="600" height="220" aria-label="Recuadro para firmar"></canvas></div>
    ${campo('viFirmante', 'Nombre de quien firma', `autocomplete="name" autocapitalize="words" maxlength="120" value="${esc(datos.tutor.name || '')}"`)}
    <label class="vi-check"><input id="viAcepto" type="checkbox" aria-required="true"><span>Soy madre, padre o tutor de ${esc(datos.nino.firstName || 'mi hijo')}, acepto los términos de la visoría y el <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">aviso de privacidad</a>.</span></label>
    <div id="viAviso" class="vi-aviso hidden" role="alert"></div>
    <button type="button" class="vi-boton" data-inscribe>Inscribir a ${esc(datos.nino.firstName || 'mi hijo')}</button>
    <button type="button" class="vi-link" data-atras>Atrás</button></section>`);
  lienzo();
}
function lienzo() {
  const c = $('viLienzo'), g = c.getContext('2d'); let dibujando = false, ultimo = null;
  const limpia = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); firmado = false; };
  limpia(); g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#07191e';
  const punto = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', e => { dibujando = true; ultimo = punto(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', e => { if (!dibujando) return; const p = punto(e); g.beginPath(); g.moveTo(ultimo.x, ultimo.y); g.lineTo(p.x, p.y); g.stroke(); ultimo = p; firmado = true; e.preventDefault(); });
  const fin = () => { dibujando = false; ultimo = null; };
  c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
  document.querySelector('[data-borra]').onclick = limpia;
}

async function preparaFoto(file) {
  const img = await new Promise((ok, mal) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No pudimos leer esa foto.')); }; i.src = u; });
  const full = await encodeVariant(img, 1000, .78, FULL_MAX_BYTES);
  let thumb = null; try { thumb = await encodeVariant(img, THUMB_MAX_SIDE, .75, THUMB_MAX_BYTES); } catch { thumb = null; }
  return { ...full, thumb };
}

async function inscribe(btn) {
  if (enviando) return;
  const firmante = $('viFirmante').value.trim();
  if (!firmado) return aviso('Falta tu firma en el recuadro.');
  if (firmante.length < 5) return aviso('Escribe el nombre completo de quien firma.');
  if (!$('viAcepto').checked) return aviso('Marca que aceptas los términos.');
  datos.imagen = $('viImagen').checked;
  enviando = true; btn.disabled = true; btn.textContent = 'Inscribiendo…'; aviso('');
  try {
    const n = datos.nino, t = datos.tutor;
    resultado = await rpc('v2_public_visoria_register', {
      club_key: CLUB_KEY, slug: SLUG,
      nino: { firstName: n.firstName, lastName: n.lastName, birthDate: n.birthDate, sex: n.sex, category: n.category || null, type: n.type, position: n.position || null, foot: n.foot, school: n.school },
      tutor: { name: t.name, phone: diez(t.phone), email: t.email || null, channel: t.channel, referral: t.referral || null },
      salud: datos.salud, emergencia: { nombre: datos.emergencia.nombre, telefono: diez(datos.emergencia.telefono) },
      firma: { nombre: firmante, imagen: $('viLienzo').toDataURL('image/png'), acepta: true },
      privacy_notice_version: PRIVACY_NOTICE_VERSION, image_consent: datos.imagen });
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
    pase();
  } catch (e) { aviso(mensajeDe(e)); btn.disabled = false; btn.textContent = `Inscribir a ${datos.nino.firstName || 'mi hijo'}`; }
  finally { enviando = false; }
}

/* ---------- Pase ----------
 * Presidencia (29/10/2026): "un formato similar al que cuando se inscriben a
 * Tannery City... que lo deben compartir al WhatsApp de Tannery City... que lo
 * tengan que imprimir para saber quién es... su nombre en gigante, su
 * categoría y años". Es la credencial del club en modo visoría, con QR que
 * en la puerta abre al niño en TannerOS. */
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
async function pase() {
  paso = 4; const n = datos.nino, r = resultado || {};
  pinta(`<section class="vi-pase">
    <div class="vi-pase-cab"><div class="vi-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h1>${r.existing ? `${esc(n.firstName)} ya estaba inscrito` : `¡${esc(n.firstName)} está inscrito!`}</h1>
      <p>Folio <b>${esc(r.folio || '')}</b>${r.sinFoto ? ' · La foto no se subió: tráela el día de la visoría.' : ''}</p></div>
    <div class="vi-pase-img" id="viPaseImg"><span class="vi-cargando-mini">Armando su pase…</span></div>
    <ol class="vi-pasos-finales">
      <li><b>Mándalo al WhatsApp de Tannery City</b><span>Así confirmamos su lugar.</span></li>
      <li><b>Imprímelo y llévalo</b><span>Lo escaneamos en la entrada. Llega 15 minutos antes con ropa deportiva y agua. <b>Prohibidos los tachones</b>: usa multitacos o tenis deportivos.</span></li>
    </ol>
    <button type="button" class="vi-boton verde" data-al-club><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z"/></svg>Mandar pase al WhatsApp de Tannery City</button>
    <p class="vi-pista">Elige WhatsApp y el chat de Tannery City · 479 265 1338</p>
    <button type="button" class="vi-boton claro" data-imprime>Imprimir pase</button>
    <button type="button" class="vi-link" data-guarda>Guardar imagen del pase</button>
    <button type="button" class="vi-link" data-otro>Inscribir a otro hijo</button>
    <footer class="vi-lema"><span>CURTIMOS CAMPEONES DEL MUNDO</span><b>#WeAreTanners</b></footer>
  </section>`);
  try {
    pasePng = await armaPase();
    const url = URL.createObjectURL(pasePng);
    $('viPaseImg').innerHTML = `<img src="${url}" alt="Pase de visoría de ${esc(`${n.firstName} ${n.lastName}`)}">`;
    $('viImprime').innerHTML = `<img src="${url}" alt="">`;
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
    if (k === 'seguro') datos.salud.seguro = v;
    return;
  }
  if (t.closest('[data-empieza]')) return pasoNino();
  if (t.closest('[data-foto],[data-camara]')) return $('viCamara')?.click();
  if (t.closest('[data-galeria]')) return $('viGaleria')?.click();
  if (t.closest('[data-atras]')) { if (paso === 1) leeNinoSinValidar(); if (paso === 2) leeTutor(); return [portada, portada, pasoNino, pasoTutor][paso](); }
  if (t.closest('[data-sigue]')) { const falta = paso === 1 ? leeNino() : leeTutor(); if (falta) return aviso(falta); return paso === 1 ? pasoTutor() : pasoFirma(); }
  const ins = t.closest('[data-inscribe]'); if (ins) return inscribe(ins);
  if (t.closest('[data-al-club]')) return alClub();
  if (t.closest('[data-imprime]')) { if (pasePng) window.print(); return; }
  if (t.closest('[data-guarda]')) return guardaPase();
  if (t.closest('[data-otro]')) { pasePng = null; datos.nino = { sex: '', type: 'player', position: '', foot: '' }; foto = null; if (fotoUrl) URL.revokeObjectURL(fotoUrl); fotoUrl = ''; resultado = null; await recarga(); return info.open ? pasoNino() : portada(); }
  if (t.closest('[data-comparte]')) {
    const url = `${location.origin}/visoria`, txt = `${info.title || 'Visoría'} de Tannery City · ${info.datesLabel || ''}. Sin costo, cupo limitado.`;
    try { if (navigator.share) { await navigator.share({ title: info.title, text: txt, url }); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${txt} ${url}`)}`, '_blank', 'noopener');
  }
});
function leeNinoSinValidar() { leeNino(); }

async function recarga() { info = await rpc('v2_public_visoria', { club_key: CLUB_KEY, slug: SLUG }); }
async function arranca() {
  try {
    [info, ctx] = await Promise.all([rpc('v2_public_visoria', { club_key: CLUB_KEY, slug: SLUG }), rpc('v2_public_context', { club_key: CLUB_KEY }).catch(() => ({}))]);
    document.title = `${info.title || 'Visoría'} · Tannery City`;
    portada();
  } catch {
    pinta(`<section class="vi-portada"><div class="vi-escudo" aria-hidden="true">T</div><h1>Visoría</h1><p class="vi-pie">No pudimos abrir la visoría. Revisa tu conexión o escríbenos por WhatsApp.</p>
      <a class="vi-boton" href="https://wa.me/${WHATSAPP_CLUB}" target="_blank" rel="noopener">Escribir por WhatsApp</a></section>`);
  }
}
arranca();
