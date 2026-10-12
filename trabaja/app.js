/* TRABAJA CON NOSOTROS (Presidencia, 12/10/2026).
 *
 * "Fichajes de entrenadores / formadores por medio de TannerOS: que los
 * profes se inscriban y manden su CV, porque por WhatsApp a veces se van."
 *
 * La convocatoria del club (puestos, requisitos, qué ofrece) sale de
 * v2_public_staff_call; la postulación entra por v2_public_apply_staff y el CV
 * (PDF o foto) se sube a su ruta y se liga con v2_public_attach_staff_cv. Si el
 * CV falla, la postulación ya quedó: se dice y se sigue.
 */
import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga, propagaClub } from '/v2/club-publico.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const CLUB_KEY = llaveDeLiga();
const BUCKET = 'tanneros-private', CV_MAX = 10 * 1024 * 1024, AVISO = '2026-08-19-v1';
const DISPONIBILIDAD = ['Lunes a jueves por la tarde', 'Sábados (partidos)', 'Fines de semana completos'];
const EXPERIENCIA = ['Sin experiencia todavía', 'Menos de 1 año', '1 a 2 años', '3 a 5 años', 'Más de 5 años'];
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rpc = async (n, p) => { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; };
const show = html => { $('loading').classList.add('hidden'); const c = $('content'); c.innerHTML = html; c.classList.remove('hidden'); };
function msg(t = '', tipo = 'error') { const e = $('formMessage'); if (!e) return; e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

// Lo que se manda: limpio y con lo mínimo obligatorio. Exportado para probarlo.
export function postulacionDelFormulario(f) {
  const telefono = String(f.phone || '').replace(/\D/g, '');
  const faltan = [];
  if (String(f.fullName || '').trim().length < 3) faltan.push('tu nombre completo');
  if (telefono.length < 10) faltan.push('tu WhatsApp (10 dígitos)');
  if (!(f.positions || []).length) faltan.push('al menos un puesto');
  if (!f.consent) faltan.push('aceptar el aviso de privacidad');
  const cv = f.cv || null;
  if (cv && cv.size > CV_MAX) faltan.push('un CV de menos de 10 MB');
  if (cv && !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(cv.type || '')) faltan.push('el CV en PDF o foto (JPG, PNG)');
  return { faltan, datos: {
    fullName: String(f.fullName || '').trim().replace(/\s+/g, ' '), phone: telefono, email: String(f.email || '').trim() || null,
    age: f.age ? Number(f.age) : null, city: String(f.city || '').trim() || null, positions: f.positions || [],
    experience: f.experience || null, studies: String(f.studies || '').trim() || null, availability: f.availability || [],
    about: String(f.about || '').trim() || null, consent: { dataAccepted: !!f.consent, privacyNoticeVersion: AVISO } } };
}
export const extensionDelCv = tipo => ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[tipo] || null);

function pinta(c) {
  $('clubName').textContent = String(c.club || '').toUpperCase();
  document.title = `Trabaja con nosotros · ${c.club}`;
  if (!c.open) { show(`<div class="empty-state"><h2>Por ahora no hay vacantes</h2><p class="muted">${esc(c.club)} no tiene la convocatoria abierta. Vuelve pronto.</p></div>`); return; }
  const chips = (lista, nombre) => lista.map((x, i) => `<label class="tj-chip"><input type="checkbox" name="${nombre}" value="${esc(x)}" id="${nombre}${i}"><span>${esc(x)}</span></label>`).join('');
  show(`
    <div class="tj-convocatoria">
      ${c.intro ? `<p class="tj-intro">${esc(c.intro)}</p>` : ''}
      <div class="tj-bloque"><h3>Buscamos</h3><ul>${c.positions.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      ${c.requirements?.length ? `<div class="tj-bloque"><h3>Lo que pedimos</h3><ul>${c.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${c.offer ? `<div class="tj-bloque tj-ofrece"><h3>Lo que ofrecemos</h3><p>${esc(c.offer)}</p></div>` : ''}
    </div>
    <h2>Postúlate</h2><p class="muted">Llénalo en 3 minutos. Te escribimos por WhatsApp.</p>
    <form id="tjForm" class="form-grid" novalidate>
      <label class="span-2">Nombre completo *<input id="tjNombre" maxlength="120" autocomplete="name" required></label>
      <label>WhatsApp *<input id="tjTel" inputmode="tel" maxlength="20" placeholder="477 123 4567" autocomplete="tel" required></label>
      <label>Correo<input id="tjCorreo" type="email" maxlength="254" autocomplete="email"></label>
      <label>Edad<input id="tjEdad" type="number" min="16" max="80" inputmode="numeric"></label>
      <label>Colonia o ciudad<input id="tjCiudad" maxlength="80"></label>
      <fieldset class="span-2 tj-grupo"><legend>¿Qué puesto te interesa? *</legend><div class="tj-chips">${chips(c.positions, 'tjPuesto')}</div></fieldset>
      <label>Experiencia con niños<select id="tjExp"><option value="">Elige…</option>${EXPERIENCIA.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label>Licencia, curso o carrera<input id="tjEstudios" maxlength="300" placeholder="Ej. Licencia C, Ciencias del Deporte"></label>
      <fieldset class="span-2 tj-grupo"><legend>¿Cuándo puedes?</legend><div class="tj-chips">${chips(DISPONIBILIDAD, 'tjDisp')}</div></fieldset>
      <label class="span-2">Cuéntanos de ti<textarea id="tjAcerca" maxlength="1200" placeholder="Dónde has entrenado, con qué edades, por qué te interesa…"></textarea></label>
      <label class="span-2 tj-cv">Tu CV (PDF o foto, opcional)<input id="tjCv" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><small>Si no tienes, cuéntanos tu experiencia arriba.</small></label>
      <label class="check span-2"><input id="tjAviso" type="checkbox"><span>Acepto que ${esc(c.club)} use mis datos para este proceso de selección, según su <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">aviso de privacidad</a>.</span></label>
      <div id="formMessage" class="message hidden span-2"></div>
      <button id="tjEnviar" class="primary span-2" type="submit">Enviar postulación</button>
    </form>`);
  propagaClub();
  $('tjForm').addEventListener('submit', envia);
}

let orgId = null;
async function subeCv(applicationId, archivo) {
  const ext = extensionDelCv(archivo.type);
  if (!orgId || !ext) throw new Error('CV');
  const path = `organizations/${orgId}/staff/${applicationId}/cv.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw error;
  return path;
}

async function envia(e) {
  e.preventDefault(); msg();
  const marcados = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  const { faltan, datos } = postulacionDelFormulario({ fullName: $('tjNombre').value, phone: $('tjTel').value, email: $('tjCorreo').value, age: $('tjEdad').value,
    city: $('tjCiudad').value, positions: marcados('tjPuesto'), experience: $('tjExp').value, studies: $('tjEstudios').value,
    availability: marcados('tjDisp'), about: $('tjAcerca').value, consent: $('tjAviso').checked, cv: $('tjCv').files?.[0] || null });
  if (faltan.length) { msg(`Falta ${faltan.join(', ')}.`); return; }
  const btn = $('tjEnviar'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const r = await rpc('v2_public_apply_staff', { club_key: CLUB_KEY, application: datos });
    let avisoCv = '';
    const cv = $('tjCv').files?.[0];
    if (cv && !r.duplicate) {
      try {
        const path = await subeCv(r.applicationId, cv);
        await rpc('v2_public_attach_staff_cv', { club_key: CLUB_KEY, application_id: r.applicationId, cv_path: path, cv_name: cv.name });
      } catch (_) { avisoCv = '<p class="muted">Tu postulación quedó, pero el CV no se pudo subir. Mándalo por WhatsApp cuando te escribamos.</p>'; }
    }
    show(`<div class="success"><div class="success-mark"><span class="tos-icon tos-icon-check" aria-hidden="true"></span></div><h2>¡Gracias, ${esc(datos.fullName.split(' ')[0])}!</h2>
      <p>Recibimos tu postulación. Te escribimos por WhatsApp al ${esc(datos.phone)} para los siguientes pasos.</p>${avisoCv}<div class="folio">${esc(r.folio)}</div></div>`);
  } catch (err) { msg(err.message || 'No se pudo enviar. Intenta de nuevo.'); btn.disabled = false; btn.textContent = 'Enviar postulación'; }
}

try {
  const [convocatoria, ctx] = await Promise.all([rpc('v2_public_staff_call', { club_key: CLUB_KEY }), rpc('v2_public_context', { club_key: CLUB_KEY })]);
  orgId = ctx?.organizationId || null;
  pinta(convocatoria);
} catch (_) {
  show('<div class="empty-state"><h2>No encontramos este club</h2><p class="muted">Revisa la liga que te compartieron.</p></div>');
}
