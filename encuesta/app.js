/* ENCUESTA DE EXPERIENCIA (Presidencia, 15/10/2026).
 *
 * "Que los papás Tanners y los que vinieron del Club León contesten cómo se
 * la pasaron: ambiente, instalaciones, estacionamiento, tienda, baños,
 * partido, actitud de los papás... y luego hacer gráficas y analizarlo."
 *
 * Pública y anónima. Sin ?e= es la encuesta de comunidad ("Experiencia
 * Tannery City", 15/10/2026: "en conjunto, comunidad, que pongan si son Baby
 * Tanner"): el papá Tanner marca la categoría de su hijo (las del club, de
 * v2_public_context) y todos marcan a qué vinieron. Cada evento puede tener
 * su propia liga: /encuesta/?e=slug (el slug se guarda como "survey"). Presidencia da de alta cada encuesta en
 * /encuestas/ con su nombre y el club visitante (v2_public_survey); &vs= en la
 * liga lo puede cambiar. Una encuesta cerrada ya no recibe respuestas.
 * La respuesta entra por v2_public_submit_survey; los resultados sólo los ve
 * Presidencia (v2_survey_results).
 */
import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga } from '/v2/club-publico.js';
import { TEMAS, ESCALA, VISITAS, ENCUESTA_COMUNIDAD } from '/v2/encuestas/encuestas.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const CLUB_KEY = llaveDeLiga();
const AVISO = '2026-10-12-v2';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rpc = async (n, p) => { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; };
const show = html => { $('loading').classList.add('hidden'); const c = $('content'); c.innerHTML = html; c.classList.remove('hidden'); };
function msg(t = '') { const e = $('formMessage'); if (!e) return; e.textContent = t; e.classList.toggle('hidden', !t); }

const params = new URLSearchParams(location.search);
export const slugDeEncuesta = v => (String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)) || 'general';
const ENCUESTA = params.get('e') ? slugDeEncuesta(params.get('e')) : ENCUESTA_COMUNIDAD;
let VISITANTE = String(params.get('vs') || '').trim().slice(0, 80);
let TITULO = '';

// Lo que se manda: limpio y con lo mínimo obligatorio. Exportado para probarlo.
export function respuestaDelFormulario(f) {
  const faltan = [];
  if (!['tanner', 'visitante', 'otro'].includes(f.respondent)) faltan.push('quién eres');
  const categories = f.respondent === 'tanner' ? [...new Set((f.categories || []).map(c => String(c).trim()).filter(Boolean))] : [];
  if (f.respondent === 'tanner' && f.pideCategoria && !categories.length) faltan.push('la categoría de tu hijo');
  const ratings = {};
  for (const { k } of TEMAS) { const v = Number(f.ratings?.[k]); if (v >= 1 && v <= 5) ratings[k] = v; }
  const nps = f.nps === '' || f.nps == null ? null : Number(f.nps);
  if (!Object.keys(ratings).length && nps == null) faltan.push('al menos una calificación');
  const tel = String(f.contactPhone || '').replace(/\D/g, '');
  if (f.contact && tel.length < 10) faltan.push('tu WhatsApp (10 dígitos)');
  return { faltan, datos: {
    survey: f.survey || 'general', respondent: f.respondent || null,
    club: f.respondent === 'visitante' ? (String(f.club || '').trim() || null) : null,
    categories, visit: (f.visit || []).filter(v => VISITAS.some(x => x.k === v)),
    ratings, nps, likes: String(f.likes || '').trim() || null, improve: String(f.improve || '').trim() || null,
    contactName: f.contact ? (String(f.contactName || '').trim() || null) : null, contactPhone: f.contact ? tel : null,
    consent: { contact: !!f.contact, privacyNoticeVersion: AVISO } } };
}

let club = { nombre: 'Tannery City', tannery: true, categorias: [] };
const escudo = () => club.tannery ? '<img src="/brand/crest-gold.png" alt="">' : '';

function pinta() {
  const quien = [
    { v: 'tanner', t: club.tannery ? 'Papá o mamá Tanner' : `Familia de ${esc(club.nombre)}`, s: 'Mi hijo juega aquí' },
    { v: 'visitante', t: 'Vengo con otro club', s: VISITANTE ? esc(VISITANTE) : 'Equipo visitante' },
    { v: 'otro', t: 'Otro', s: 'Invitado, aficionado, staff' }
  ];
  const fila = ({ k, t, opcional }) => `<fieldset class="en-tema" data-tema="${k}"><legend>${esc(t)}</legend>
    <div class="en-escala">${ESCALA.map((e, i) => `<label class="en-nota n${i + 1}"><input type="radio" name="r_${k}" value="${i + 1}"><b>${i + 1}</b><small>${e}</small></label>`).join('')}
    ${opcional ? `<label class="en-nota en-na"><input type="radio" name="r_${k}" value=""><b>—</b><small>No lo usé</small></label>` : ''}</div></fieldset>`;
  show(`
  <header class="en-hero">
    <div class="en-escudo">${escudo()}</div>
    <p class="en-club">${esc(club.nombre)}${TITULO ? ` · ${esc(TITULO)}` : ''}</p>
    <h1 class="en-titulo">¿Cómo te la <em>pasaste?</em></h1>
    <p class="en-sub">1 minuto. Es anónima. Lo que nos digas lo lee directamente la Presidencia del club.</p>
  </header>
  <main class="en-main">
  <form id="enForm" novalidate>
    <section class="en-sec"><p class="en-eyebrow">Paso 1</p><h2 class="en-h2">¿Quién eres?</h2>
      <div class="en-quien">${quien.map(q => `<label class="en-carta"><input type="radio" name="quien" value="${q.v}"><b>${q.t}</b><small>${q.s}</small></label>`).join('')}</div>
      ${club.categorias.length ? `<fieldset class="en-grupo hidden" id="enCatCaja"><legend>¿En qué categoría está tu hijo?</legend><p class="en-ayuda">Si tienes más de uno, marca todas.</p>
        <div class="en-chips">${club.categorias.map(c => `<label class="en-chip"><input type="checkbox" name="cat" value="${esc(c)}"><span>${esc(c)}</span></label>`).join('')}</div></fieldset>` : ''}
      <label class="en-campo hidden" id="enClubCaja">¿De qué club vienes?<input id="enClub" maxlength="80" value="${esc(VISITANTE)}" placeholder="Ej. el nombre de tu club"></label>
      <fieldset class="en-grupo"><legend>¿A qué viniste?</legend><p class="en-ayuda">Marca todo lo que aplique.</p>
        <div class="en-chips">${VISITAS.map(v => `<label class="en-chip"><input type="checkbox" name="visita" value="${v.k}"><span>${esc(v.t)}</span></label>`).join('')}</div></fieldset>
    </section>
    <section class="en-sec"><p class="en-eyebrow">Paso 2</p><h2 class="en-h2">Califica tu visita</h2>
      <p class="en-ayuda">De 1 (muy mal) a 5 (excelente). Si no usaste algo, márcalo.</p>
      <div class="en-temas">${TEMAS.map(fila).join('')}</div>
    </section>
    <section class="en-sec"><p class="en-eyebrow">Paso 3</p><h2 class="en-h2">¿Nos recomendarías?</h2>
      <p class="en-ayuda">¿Qué tan probable es que recomiendes ${esc(club.nombre)} a un amigo o familiar?</p>
      <div class="en-nps">${Array.from({ length: 11 }, (_, i) => `<label class="en-n ${i <= 6 ? 'bajo' : i <= 8 ? 'medio' : 'alto'}"><input type="radio" name="nps" value="${i}"><b>${i}</b></label>`).join('')}</div>
      <div class="en-nps-pie"><span>Nada probable</span><span>Muy probable</span></div>
    </section>
    <section class="en-sec"><p class="en-eyebrow">Paso 4</p><h2 class="en-h2">Cuéntanos</h2>
      <label class="en-campo">Lo que más te gustó<textarea id="enGusto" maxlength="600" placeholder="El ambiente, la cancha, la gente…"></textarea></label>
      <label class="en-campo">¿Qué mejorarías?<textarea id="enMejora" maxlength="600" placeholder="Sé directo, nos ayuda mucho."></textarea></label>
      <label class="en-check"><input id="enContacto" type="checkbox"><span>Quiero que me contacten sobre mi comentario (opcional)</span></label>
      <div class="en-contacto hidden" id="enContactoCaja">
        <label class="en-campo">Tu nombre<input id="enNombre" maxlength="80" autocomplete="name"></label>
        <label class="en-campo">WhatsApp<input id="enTel" inputmode="tel" maxlength="20" placeholder="477 123 4567" autocomplete="tel"></label>
        <p class="en-ayuda">Sólo para responderte, según nuestro <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">aviso de privacidad</a>.</p>
      </div>
      <div id="formMessage" class="en-msg hidden" role="alert"></div>
      <button id="enEnviar" class="en-cta" type="submit">Enviar encuesta</button>
    </section>
  </form>
  </main>
  <footer class="en-pie">${club.tannery ? '<b>Curtimos campeones del mundo</b>#WeAreTanners · ' : ''}<a href="/aviso-de-privacidad/">Privacidad</a> · TannerOS</footer>`);
  const form = $('enForm');
  form.addEventListener('change', e => {
    if (e.target.name === 'quien') {
      $('enClubCaja').classList.toggle('hidden', e.target.value !== 'visitante');
      $('enCatCaja')?.classList.toggle('hidden', e.target.value !== 'tanner');
    }
    if (e.target.id === 'enContacto') $('enContactoCaja').classList.toggle('hidden', !e.target.checked);
    if (e.target.name?.startsWith('r_')) e.target.closest('.en-tema').classList.add('listo');
  });
  form.addEventListener('submit', envia);
}

async function envia(e) {
  e.preventDefault(); msg();
  const val = n => document.querySelector(`input[name="${n}"]:checked`)?.value ?? '';
  const marcados = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  const ratings = Object.fromEntries(TEMAS.map(({ k }) => [k, val(`r_${k}`)]));
  const { faltan, datos } = respuestaDelFormulario({ survey: ENCUESTA, respondent: val('quien'), club: $('enClub').value, ratings,
    categories: marcados('cat'), pideCategoria: club.categorias.length > 0, visit: marcados('visita'), nps: val('nps'),
    likes: $('enGusto').value, improve: $('enMejora').value, contact: $('enContacto').checked, contactName: $('enNombre').value, contactPhone: $('enTel').value });
  if (faltan.length) { msg(`Falta ${faltan.join(' y ')}.`); return; }
  const btn = $('enEnviar'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    await rpc('v2_public_submit_survey', { club_key: CLUB_KEY, response: datos });
    show(`<section class="en-gracias">
      <div class="en-escudo">${escudo()}</div>
      <h1 class="en-titulo">¡Gracias por <em>contestar!</em></h1>
      <p class="en-sub">Tu opinión ya está con nosotros. Con esto mejoramos cada visita.</p>
      ${club.tannery ? '<p class="en-hash">#WeAreTanners</p>' : ''}
    </section>`);
    scrollTo(0, 0);
  } catch (err) { msg(err.message || 'No se pudo enviar. Intenta de nuevo.'); btn.disabled = false; btn.textContent = 'Enviar encuesta'; }
}

try {
  const ctx = await rpc('v2_public_context', { club_key: CLUB_KEY });
  club = { nombre: ctx?.organizationName || 'Tannery City', tannery: (ctx?.slug || '') === 'tannery-city-fc',
    categorias: (Array.isArray(ctx?.categories) ? ctx.categories : []).map(String).filter(Boolean).slice(0, 12) };
  document.title = `¿Cómo te la pasaste? · ${club.nombre}`;
  const info = await rpc('v2_public_survey', { club_key: CLUB_KEY, survey: ENCUESTA }).catch(() => null);
  if (info?.found) { TITULO = info.title || ''; VISITANTE = VISITANTE || String(info.visitorClub || ''); }
  if (info && info.open === false) {
    show(`<header class="en-hero"><div class="en-escudo">${escudo()}</div><p class="en-club">${esc(club.nombre)}${TITULO ? ` · ${esc(TITULO)}` : ''}</p>
      <h1 class="en-titulo">Esta encuesta <em>ya cerró</em></h1><p class="en-sub">Gracias por tu interés. Nos vemos en la cancha.</p></header>`);
  } else pinta();
} catch (_) {
  show('<header class="en-hero"><h1 class="en-titulo">No encontramos <em>este club</em></h1><p class="en-sub">Revisa la liga que te compartieron.</p></header>');
}
