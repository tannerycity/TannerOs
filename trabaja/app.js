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
import { encodeAmbas, UPLOAD_CACHE_CONTROL } from '/v2/image-encode.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const CLUB_KEY = llaveDeLiga();
const BUCKET = 'tanneros-private', CV_MAX = 10 * 1024 * 1024, AVISO = '2026-10-12-v2';
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
  if (!f.photo) faltan.push('tu foto');
  else if (!/^image\//.test(f.photo.type || '')) faltan.push('una foto (JPG o PNG)');
  if (!f.antecedentes) faltan.push('aceptar lo de la carta de no antecedentes penales');
  if (!f.consent) faltan.push('aceptar el aviso de privacidad');
  const cv = f.cv || null;
  if (!cv) faltan.push('tu CV');
  if (cv && cv.size > CV_MAX) faltan.push('un CV de menos de 10 MB');
  if (cv && !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(cv.type || '')) faltan.push('el CV en PDF o foto (JPG, PNG)');
  return { faltan, datos: {
    fullName: String(f.fullName || '').trim().replace(/\s+/g, ' '), phone: telefono, email: String(f.email || '').trim() || null,
    age: f.age ? Number(f.age) : null, city: String(f.city || '').trim() || null, positions: f.positions || [],
    experience: f.experience || null, studies: String(f.studies || '').trim() || null, availability: f.availability || [],
    about: String(f.about || '').trim() || null, consent: { dataAccepted: !!f.consent, backgroundCheck: !!f.antecedentes, privacyNoticeVersion: AVISO } } };
}
export const extensionDelCv = tipo => ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[tipo] || null);

// Los "puestos" pueden traer la edad entre paréntesis: se separa para la tarjeta.
export function partePuesto(p) {
  const m = String(p || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { nombre: m[1], detalle: m[2] } : { nombre: String(p || ''), detalle: '' };
}
// "Contrato · bonos · uniformes" → una tarjeta por cosa.
export const listaDeOferta = t => String(t || '').split(/\s*[·•\n]\s*/).map(x => x.trim()).filter(Boolean);

let club = { nombre: '', slug: '', tannery: false, colores: {} };
const iniciales = n => String(n || '').split(/\s+/).filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FC';
const escudo = () => club.tannery ? '<img src="/brand/crest-gold.png" alt="">' : `<span class="un-iniciales">${esc(iniciales(club.nombre))}</span>`;
const hashtag = () => club.tannery ? '#WeAreTanners' : esc(club.nombre);

function pinta(c) {
  document.title = `Únete al staff · ${c.club}`;
  if (!c.open) {
    show(`<header class="un-hero"><div class="un-escudo">${escudo()}</div><p class="un-club">${esc(c.club)}</p>
      <h1 class="un-titulo">Por ahora <em>no hay vacantes</em></h1><p class="un-sub">La convocatoria de ${esc(c.club)} está cerrada. Vuelve pronto.</p></header>
      <div class="empty-state hidden"></div>`);
    return;
  }
  const chips = (lista, nombre) => lista.map((x, i) => `<label class="tj-chip"><input type="checkbox" name="${nombre}" value="${esc(x)}" id="${nombre}${i}"><span>${esc(x)}</span></label>`).join('');
  const oferta = listaDeOferta(c.offer);
  show(`
  <header class="un-hero">
    <div class="un-escudo">${escudo()}</div>
    <p class="un-club">${esc(c.club)}${club.tannery ? ' · León, Gto.' : ''}</p>
    <h1 class="un-titulo">¿Quieres formar <em>campeones?</em></h1>
    ${c.intro ? `<p class="un-sub">${esc(c.intro)}</p>` : ''}
    <a class="un-cta" href="#ficha">Postúlate ahora</a>
    <span class="un-cta-nota">3 minutos · Ten a la mano tu CV y una foto</span>
    <p class="un-hilo">Únete al staff</p>
  </header>
  <main class="un-main tj-convocatoria">
    <section class="un-sec"><p class="un-eyebrow">Convocatoria abierta</p><h2 class="un-h2">Buscamos</h2>
      <div class="un-posiciones">${c.positions.map((p, i) => { const x = partePuesto(p); return `<article class="un-pos"><b>${String(i + 1).padStart(2, '0')}</b><span>${esc(x.nombre)}${x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}</span></article>`; }).join('')}</div>
    </section>
    ${oferta.length ? `<section class="un-sec"><p class="un-eyebrow">Por qué ${esc(c.club)}</p><h2 class="un-h2">Lo que te ofrecemos</h2><ul class="un-ofrece">${oferta.map(o => `<li>${esc(o)}</li>`).join('')}</ul></section>` : ''}
    ${c.requirements?.length ? `<section class="un-sec"><p class="un-eyebrow">Tu perfil</p><h2 class="un-h2">Lo que buscamos en ti</h2><ul class="un-pide">${c.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}
    <section class="un-sec"><p class="un-eyebrow">Así de simple</p><h2 class="un-h2">El proceso</h2>
      <div class="un-proceso"><div class="un-paso"><b>Postúlate</b><small>3 minutos, con tu CV</small></div><div class="un-paso"><b>Te llamamos</b><small>Por WhatsApp</small></div>
      <div class="un-paso"><b>Entrevista</b><small>Conoces el club</small></div><div class="un-paso"><b>A la cancha</b><small>Prueba con un grupo</small></div></div>
    </section>
    <section class="un-sec un-ficha" id="ficha"><p class="un-eyebrow">Ficha de postulación</p><h2 class="un-h2">Tu ficha</h2><p class="un-ficha-sub">Lo que pongas aquí lo lee directamente quien contrata.</p>
    <form id="tjForm" novalidate>
      <div class="un-bloque"><h3><i>1</i>Tus datos</h3>
        <label class="span-2">Nombre completo *<input id="tjNombre" maxlength="120" autocomplete="name" required></label>
        <label>WhatsApp *<input id="tjTel" inputmode="tel" maxlength="20" placeholder="477 123 4567" autocomplete="tel" required></label>
        <label>Correo<input id="tjCorreo" type="email" maxlength="254" autocomplete="email"></label>
        <label>Edad<input id="tjEdad" type="number" min="16" max="80" inputmode="numeric"></label>
        <label>Colonia o ciudad<input id="tjCiudad" maxlength="80"></label>
      </div>
      <div class="un-bloque"><h3><i>2</i>Tu perfil</h3>
        <fieldset class="span-2 tj-grupo"><legend>¿Qué puesto te interesa? *</legend><div class="tj-chips">${chips(c.positions, 'tjPuesto')}</div></fieldset>
        <label>Experiencia con niños<select id="tjExp"><option value="">Elige…</option>${EXPERIENCIA.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label>Licencia, curso o carrera<input id="tjEstudios" maxlength="300" placeholder="Ej. Licencia C, Ciencias del Deporte"></label>
        <fieldset class="span-2 tj-grupo"><legend>¿Cuándo puedes?</legend><div class="tj-chips">${chips(DISPONIBILIDAD, 'tjDisp')}</div></fieldset>
        <label class="span-2">Cuéntanos de ti<textarea id="tjAcerca" maxlength="1200" placeholder="Dónde has entrenado, con qué edades y por qué quieres estar aquí…"></textarea></label>
      </div>
      <div class="un-bloque"><h3><i>3</i>Tu foto y tu CV</h3>
        <label class="span-2 un-foto" id="tjFotoCaja"><input id="tjFoto" type="file" accept="image/*"><span class="un-foto-marco" id="tjFotoVista" aria-hidden="true"></span><span><b id="tjFotoTexto">Sube tu foto *</b><small>De frente y con buena luz. Así te reconocemos en la entrevista.</small></span></label>
        <label class="span-2 un-cv" id="tjCvCaja"><input id="tjCv" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><span class="un-cv-icono" aria-hidden="true"></span><span><b id="tjCvTexto">Sube tu CV *</b><small>PDF o foto de tu CV.</small></span></label>
        <label class="un-check span-2 un-check-importante"><input id="tjAntecedentes" type="checkbox"><span><b>Importante:</b> entiendo que, si me contratan, debo presentar mi <b>carta de no antecedentes penales</b> antes de empezar. Trabajamos con niños.</span></label>
        <label class="un-check span-2"><input id="tjAviso" type="checkbox"><span>Acepto que ${esc(c.club)} use mis datos y mi foto para este proceso de selección, según su <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">aviso de privacidad</a> (sección 10).</span></label>
        <div id="formMessage" class="message hidden span-2" role="alert"></div>
        <button id="tjEnviar" class="un-cta un-enviar span-2" type="submit">Enviar mi ficha</button>
      </div>
    </form></section>
  </main>
  <footer class="un-pie"><b>${club.tannery ? 'Curtimos campeones del mundo' : esc(c.club)}</b>${club.tannery ? '#WeAreTanners · ' : ''}<a href="/aviso-de-privacidad/">Privacidad</a> · TannerOS</footer>`);
  propagaClub();
  $('tjForm').addEventListener('submit', envia);
  $('tjFoto').addEventListener('change', () => {
    const f = $('tjFoto').files?.[0];
    $('tjFotoTexto').textContent = f ? 'Foto lista' : 'Sube tu foto *';
    $('tjFotoCaja').classList.toggle('listo', !!f);
    $('tjFotoVista').style.backgroundImage = f ? `url("${URL.createObjectURL(f)}")` : '';
  });
  $('tjCv').addEventListener('change', () => {
    const f = $('tjCv').files?.[0];
    $('tjCvTexto').textContent = f ? f.name : 'Sube tu CV *';
    $('tjCvCaja').classList.toggle('listo', !!f);
  });
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

// La foto se achica en el celular antes de subir: grande (1200 px) para verla
// y miniatura (260 px) para las listas. Así el egress no se dispara.
function cargaImagen(archivo) {
  return new Promise((ok, mal) => { const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); }; img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('foto')); }; img.src = url; });
}
async function subeFoto(applicationId, archivo) {
  if (!orgId) throw new Error('foto');
  const { full, thumb } = await encodeAmbas(await cargaImagen(archivo));
  const base = `organizations/${orgId}/staff/${applicationId}/`;
  const path = `${base}foto.${full.ext}`, thumbPath = `${base}foto-thumb.${thumb.ext}`;
  const sube = (ruta, v) => supabase.storage.from(BUCKET).upload(ruta, v.blob, { contentType: v.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false });
  const [a, b] = await Promise.all([sube(path, full), sube(thumbPath, thumb)]);
  if (a.error) throw a.error;
  await rpc('v2_public_attach_staff_photo', { club_key: CLUB_KEY, application_id: applicationId, photo_path: path, photo_thumb_path: b.error ? null : thumbPath });
}

async function envia(e) {
  e.preventDefault(); msg();
  const marcados = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  const { faltan, datos } = postulacionDelFormulario({ fullName: $('tjNombre').value, phone: $('tjTel').value, email: $('tjCorreo').value, age: $('tjEdad').value,
    city: $('tjCiudad').value, positions: marcados('tjPuesto'), experience: $('tjExp').value, studies: $('tjEstudios').value,
    availability: marcados('tjDisp'), about: $('tjAcerca').value, consent: $('tjAviso').checked, antecedentes: $('tjAntecedentes').checked, cv: $('tjCv').files?.[0] || null, photo: $('tjFoto').files?.[0] || null });
  if (faltan.length) { msg(`Falta ${faltan.join(', ')}.`); return; }
  const btn = $('tjEnviar'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const r = await rpc('v2_public_apply_staff', { club_key: CLUB_KEY, application: datos });
    let avisoCv = '', avisoFoto = '';
    const foto = $('tjFoto').files?.[0];
    if (foto && !r.duplicate) {
      try { await subeFoto(r.applicationId, foto); }
      catch (_) { avisoFoto = 'Tu foto no se pudo subir; tráela a la entrevista. '; }
    }
    const cv = $('tjCv').files?.[0];
    if (cv && !r.duplicate) {
      try {
        const path = await subeCv(r.applicationId, cv);
        await rpc('v2_public_attach_staff_cv', { club_key: CLUB_KEY, application_id: r.applicationId, cv_path: path, cv_name: cv.name });
      } catch (_) { avisoCv = 'Tu postulación quedó, pero el CV no se pudo subir. Mándalo por WhatsApp cuando te escribamos.'; }
    }
    const primerNombre = datos.fullName.split(' ')[0];
    const fotoUrl = foto && !avisoFoto ? URL.createObjectURL(foto) : '';
    const liga = `${location.origin}/unete${club.slug ? `?club=${encodeURIComponent(club.slug)}` : ''}`;
    const comparte = `https://wa.me/?text=${encodeURIComponent(`Me postulé como formador en ${club.nombre}. Si te interesa, aquí está la convocatoria: ${liga}`)}`;
    show(`<section class="success">
      <h1 class="un-ok-titulo">Ficha <em>recibida</em></h1>
      <p class="un-ok-sub">Gracias, ${esc(primerNombre)}. Tu postulación ya está en manos de quien contrata en ${esc(club.nombre)}.</p>
      <article class="un-cred">
        <div class="un-cred-cab">${escudo()}<p>${esc(club.nombre)}</p><span class="un-cred-cinta">Solicitud de fichaje</span></div>
        <div class="un-cred-cuerpo">
          <div class="un-cred-quien">${fotoUrl ? `<img src="${esc(fotoUrl)}" alt="">` : ''}<div><p class="un-cred-et">Candidato</p><p class="un-cred-nombre">${esc(datos.fullName)}</p></div></div>
          <div><p class="un-cred-et">Posición</p><div class="un-cred-pos">${datos.positions.map(p => `<span>${esc(partePuesto(p).nombre)}</span>`).join('')}</div></div>
          <div class="un-cred-fila"><div><p class="un-cred-et">Folio</p><b class="folio">${esc(r.folio)}</b></div><div><p class="un-cred-et">WhatsApp</p><b>${esc(datos.phone)}</b></div></div>
        </div>
        <div class="un-cred-pie">${hashtag()}</div>
      </article>
      ${avisoCv || avisoFoto ? `<p class="un-ok-nota">${esc(avisoFoto + avisoCv)}</p>` : ''}
      <div class="un-sigue"><h3>Qué sigue</h3><ol><li>Revisamos tu ficha${cv && !avisoCv ? ' y tu CV' : ''}.</li><li>Te escribimos por WhatsApp al ${esc(datos.phone)}.</li><li>Entrevista y prueba en cancha.</li></ol></div>
      <a class="un-comparte" href="${esc(comparte)}" target="_blank" rel="noopener">¿Conoces a otro formador? Compártele la convocatoria</a>
      <p class="un-ok-hash">${club.tannery ? 'Curtimos campeones del mundo' : ''}</p>
    </section>`);
    scrollTo(0, 0);
  } catch (err) { msg(err.message || 'No se pudo enviar. Intenta de nuevo.'); btn.disabled = false; btn.textContent = 'Enviar postulación'; }
}

try {
  const [convocatoria, ctx] = await Promise.all([rpc('v2_public_staff_call', { club_key: CLUB_KEY }), rpc('v2_public_context', { club_key: CLUB_KEY })]);
  orgId = ctx?.organizationId || null;
  club = { nombre: convocatoria.club, slug: ctx?.slug || '', tannery: (ctx?.slug || '') === 'tannery-city-fc', colores: {} };
  // Otros clubes: sus colores en lugar del azul noche y dorado de Tannery.
  if (!club.tannery && orgId) {
    try {
      const b = await rpc('v2_public_branding_by_org', { organization_id: orgId });
      const col = b?.colors || {}, raiz = document.documentElement.style, hex = v => /^#[0-9a-f]{6}$/i.test(v || '');
      if (hex(col.primary)) raiz.setProperty('--club-1', col.primary);
      if (hex(col.secondary)) raiz.setProperty('--club-2', col.secondary);
      if (hex(col.accent)) raiz.setProperty('--club-acento', col.accent);
    } catch (_) { /* sin colores: se queda la paleta de base */ }
  }
  pinta(convocatoria);
} catch (_) {
  show('<header class="un-hero"><h1 class="un-titulo">No encontramos <em>este club</em></h1><p class="un-sub">Revisa la liga que te compartieron.</p></header><div class="empty-state hidden"></div>');
}
