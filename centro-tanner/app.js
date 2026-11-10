import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga, conClub, propagaClub } from '/v2/club-publico.js';
import { instalaVocabulario } from '/v2/vocabulario.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
// De qué club es este Centro: ?club=<slug>; sin él, Tannery (v2/club-publico.js).
const CLUB_KEY = llaveDeLiga();
let clubNombre = '';
const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  inscripcion: 'Inscripción y reingreso', mensualidades: 'Mensualidades y pagos', becas: 'Becas y beneficios',
  entrenamientos: 'Entrenamientos', asistencia: 'Asistencia', partidos: 'Partidos y torneos',
  uniformes: 'Uniformes', baby_tanners: 'Baby Tanners', jugadores: 'Jugadores y categorías',
  familias: 'Familias', conducta: 'Conducta', seguridad: 'Seguridad', salud: 'Salud y lesiones',
  tanner_os: 'Tanner OS', estacionamiento: 'Estacionamiento', tannery_city_park: 'Tannery City Park',
  privacidad: 'Privacidad e imagen', faq: 'Preguntas frecuentes'
};
const DOC_LABELS = { reglamento: 'Reglamento', privacidad: 'Aviso de privacidad', uso_de_imagen: 'Uso de fotos y video', visoria: 'Términos para visorías' };
let becasNombre = 'Becas Tannery City';
// "Nuestra Historia / Tano el Tanner" es contenido de marca exclusivo de
// Tannery City (mascota, escudo, origen) — los demás clubes que usan este
// mismo Centro Tanner blanco no deben verlo, igual que "Becas Tannery City".
let esTanneryCity = true;
const THEME_GROUPS = [
  { label: 'Pagos', categories: ['mensualidades', 'becas'] },
  { label: 'Entrenamientos y fútbol', categories: ['entrenamientos', 'asistencia', 'partidos', 'jugadores', 'baby_tanners'] },
  { label: 'Uniformes', categories: ['uniformes'] },
  { label: 'Familias', categories: ['familias', 'inscripcion'] },
  // 05/11/2026: Conducta (32 políticas, la categoría más grande) y Privacidad
  // no tenían tarjeta — solo se llegaba por buscador o por liga de otra política.
  { label: 'Conducta y convivencia', categories: ['conducta'] },
  { label: 'Seguridad y salud', categories: ['seguridad', 'salud'] },
  { label: 'Privacidad e imagen', categories: ['privacidad'] },
  { label: 'Tannery City Park', categories: ['tannery_city_park', 'estacionamiento'] }
];
// 10/11/2026, Mich: "hazlo más interactivo, estilo Apple... que sea fácil
// para los papás encontrarlo". "Nuestra historia" pasó de una sola página
// larga a un hub con tarjetas grandes — cada tema es su propia página, con
// "sigue explorando" al final para que se siga picando. El texto completo de
// cada tema sale en HISTORIA_BODIES; esto solo es el índice/metadata (usado
// también por el buscador, que antes no encontraba nada de esto).
const HISTORIA_TOPICS = [
  { slug: 'tano', icon: 'glove', kicker: 'NUESTRA MASCOTA', title: 'Tano el Tanner', desc: 'El portero luchador que es la cara de Tannery City', keywords: ['tano', 'mascota', 'portero', 'luchador', 'carbajal'] },
  { slug: 'raices', icon: 'calendar', kicker: 'DESDE 1850', title: 'Nuestras raíces', desc: 'El lema que define a León y cómo "curtimos" mejores personas', keywords: ['raices', 'historia', '1850', 'leon', 'tenerias', 'lema fundador'] },
  { slug: 'origen', icon: 'target', kicker: 'NUESTRO ADN DE FORMACIÓN', title: 'El origen de Tannery City', desc: 'La fórmula de 6 países detrás de cómo formamos', keywords: ['origen', 'formacion', 'paises', 'holanda', 'espana', 'pachuca', 'italia', 'inglaterra', 'formar entender proyectar'] },
  { slug: 'escudo', icon: 'trophy', kicker: 'CADA PARTE CUENTA ALGO', title: 'Nuestro escudo', desc: 'Qué significa cada parte de nuestro monograma', keywords: ['escudo', 'monograma', 'corona', 'cuero', 'logo'] },
  { slug: 'valores', icon: 'check', kicker: 'LO QUE NOS DEFINE', title: 'Nuestros valores', desc: 'Los 6 valores dentro y fuera de la cancha', keywords: ['valores', 'resiliencia', 'energia', 'unidad', 'curtibrother', 'bajio'] },
  { slug: 'canchas', icon: 'pin', kicker: 'TRADICIÓN TANNER', title: 'Nuestras canchas', desc: 'Por qué llevan el nombre de alguien', keywords: ['cancha', 'canchas', 'lechuguilla', 'chavicos', 'placa', 'enriquez'] },
  { slug: 'adn', icon: 'ball', kicker: 'FÚTBOL CURTIDO', title: 'Nuestro ADN de juego', desc: 'El estilo que enseñamos desde la formación', keywords: ['adn', 'futbol curtido', 'tiki tanner', 'estilo de juego', 'metodologia', 'joga bonito'] },
  { slug: 'lema', icon: 'bell', kicker: 'LO QUE NOS UNE', title: 'Nuestro lema', desc: '"To our City, to our Family, to our Tanners"', keywords: ['lema', 'slogan', 'to our city', 'familia', 'tanners'] }
];
function normalizar(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// El hub en sí ("Nuestra historia") no es un HISTORIA_TOPICS — por eso buscar
// justo la palabra "Historia" no encontraba nada (10/11/2026, screenshot de Mich).
const HISTORIA_HUB_ENTRY = { title: 'Nuestra historia', desc: 'El origen de Tannery City, nuestro escudo, nuestros valores y la tradición de nombrar nuestras canchas.', href: '/centro-tanner/historia', keywords: ['historia', 'nuestra historia', 'tano el tanner', 'quien es tano'] };

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Políticas como TC-132 remiten a un reglamento externo (TCP) por su liga; el
// contenido oficial se escapa a texto plano, así que sin esto la URL se ve
// pero no se puede tocar. Corre SOBRE texto ya escapado: no abre huecos de HTML.
function linkify(escaped) { return escaped.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`); }
// La respuesta corta suele ser literalmente la primera frase del contenido
// oficial (05/11/2026, "el botón no sirve, repite lo que ya leí"). Si el
// contenido completo empieza igual que la respuesta corta, al desplegar solo
// se muestra lo que sigue — lo nuevo, no lo que ya viste arriba.
function restoSinRepetir(shortAnswer, officialContent) {
  const corto = String(shortAnswer ?? '').trim();
  const completo = String(officialContent ?? '').trim();
  if (corto && completo.toLowerCase().startsWith(corto.toLowerCase())) {
    const resto = completo.slice(corto.length).trim();
    if (resto) return resto;
  }
  return completo;
}
function fmtDate(v) { if (!v) return ''; const d = new Date(`${String(v).slice(0, 10)}T12:00:00`); if (Number.isNaN(d.getTime())) return ''; return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
async function rpc(name, params = {}) { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; }
function setMeta(title, description) {
  document.title = `${title} · Centro Tanner`;
  $('ctTitle').textContent = `${title} · Centro Tanner`;
  $('ctOgTitle').setAttribute('content', `${title} · Centro Tanner`);
  if (description) { $('ctOgDescription').setAttribute('content', description); const m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute('content', description); }
  $('ctCanonical').setAttribute('href', `https://app.tannerycity.com${location.pathname}`);
}
function render(html) { $('ctContent').innerHTML = html; window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); }
function injectFaqSchema(items) {
  document.getElementById('ctFaqSchema')?.remove();
  if (!items?.length) return;
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ctFaqSchema';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) });
  document.head.appendChild(s);
}
function crumb(parts) { return `<nav class="ct-breadcrumb">${parts.map((p, i) => i < parts.length - 1 ? `<a href="${p.href}">${esc(p.label)}</a> / ` : esc(p.label)).join('')}</nav>`; }

async function renderHome() {
  setMeta('Centro Tanner', `Todo lo que necesitas saber sobre ${clubNombre}: reglamento, pagos, becas, seguridad y preguntas frecuentes.`);
  render(`
    <section class="ct-hero">
      <div class="ct-hero-eyebrow">${esc(clubNombre.toUpperCase())}</div>
      <h1>Centro Tanner</h1>
      <p>Todo lo que necesitas saber sobre ${esc(clubNombre)}.</p>
    </section>
    <a class="bk-banner" href="/centro-tanner/becas">
      <div><span class="bk-banner-eyebrow">MÉRITO + NECESIDAD + COMUNIDAD</span><strong>${esc(becasNombre)}</strong><p>Queremos que el talento, la disciplina y las ganas de crecer encuentren oportunidades.</p></div>
      <span class="bk-banner-cta">Descubre qué apoyo podría aplicar para ti →</span>
    </a>
    ${esTanneryCity ? `<a class="bk-banner hs-banner" href="/centro-tanner/historia">
      <div><span class="bk-banner-eyebrow">DE LA TENERÍA A LA PORTERÍA</span><strong>¿Quién es Tano el Tanner?</strong><p>El origen de Tannery City, nuestro escudo, nuestros valores y la tradición de nombrar nuestras canchas.</p></div>
      <span class="bk-banner-cta">Conoce nuestra historia →</span>
    </a>` : ''}
    <section class="ct-section" id="ctFaqSection"><h2 class="ct-section-title">Preguntas frecuentes</h2><div id="ctFaqList" class="ct-faq-list"><div class="ct-loading">Cargando…</div></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Explorar por tema</h2><div id="ctThemeGrid" class="ct-theme-grid"></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Documentos oficiales</h2><div id="ctDocList" class="ct-doc-list"><div class="ct-loading">Cargando…</div></div></section>
    <p class="ct-updated" id="ctUpdated"></p>
  `);
  $('ctThemeGrid').innerHTML = THEME_GROUPS.map((g) => `<a class="ct-theme-card" href="/centro-tanner/tema/${encodeURIComponent(g.categories[0])}" data-group='${esc(JSON.stringify(g.categories))}'>
      <div class="ct-theme-icon"><span class="tos-icon tos-icon-target" aria-hidden="true"></span></div>
      <div class="ct-theme-name">${esc(g.label)}</div>
    </a>`).join('');
  document.querySelectorAll('.ct-theme-grid a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const cats = JSON.parse(a.dataset.group);
    history.pushState({}, '', conClub(`/centro-tanner/tema/${cats.join(',')}`));
    route();
  }));

  try {
    const home = await rpc('v2_public_centro_tanner_home', { club_key: CLUB_KEY });
    const faqs = home?.featuredFaqs || [];
    $('ctFaqList').innerHTML = faqs.length ? faqs.map((f) => `<details class="ct-faq-item"><summary>${esc(f.question)}</summary><div class="ct-faq-body">${esc(f.answer)}${f.policySlug ? `<a class="ct-faq-link" href="/centro-tanner/p/${esc(f.policySlug)}">Ver política completa →</a>` : ''}</div></details>`).join('') : '<p class="ct-empty">Todavía no hay preguntas frecuentes publicadas.</p>';
    injectFaqSchema(faqs);
    const docs = home?.documents || [];
    $('ctDocList').innerHTML = docs.length ? docs.map((d) => `<a class="ct-doc-row" href="/centro-tanner/documento/${esc(d.code)}"><div><div class="ct-doc-name">${esc(d.title)} — versión vigente</div><div class="ct-doc-meta">Actualizado ${esc(fmtDate(d.updatedAt))}</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>`).join('') : '<p class="ct-empty">Sin documentos publicados.</p>';
    if (home?.lastUpdated) $('ctUpdated').innerHTML = `Última actualización: ${esc(fmtDate(home.lastUpdated))} · <a href="/centro-tanner/cambios">Ver historial de cambios →</a>`;
  } catch (err) {
    $('ctFaqList').innerHTML = `<p class="ct-empty">No pudimos cargar Centro Tanner. ${esc(err.message || '')}</p>`;
  }
}

function wireSearch() {
  const input = $('ctSearchInput'); const box = $('ctSearchResults');
  let timer = null; let seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      // 10/11/2026, Mich: buscó "Historia" y no salió nada — "Nuestra
      // historia" no vive en la base, así que el RPC nunca la iba a
      // encontrar. Estos resultados estáticos se mezclan siempre, incluso
      // si el RPC falla o no trae nada.
      const nq = normalizar(q);
      const coincide = (e) => e.keywords.some((k) => normalizar(k).includes(nq)) || normalizar(e.title).includes(nq) || normalizar(e.desc).includes(nq);
      const staticResults = esTanneryCity ? [
        ...(coincide(HISTORIA_HUB_ENTRY) ? [{ type: 'historia', title: HISTORIA_HUB_ENTRY.title, snippet: HISTORIA_HUB_ENTRY.desc, href: HISTORIA_HUB_ENTRY.href }] : []),
        ...HISTORIA_TOPICS.filter(coincide).map((t) => ({ type: 'historia', title: t.title, snippet: t.desc, href: `/centro-tanner/historia/${t.slug}` })),
      ].slice(0, 5) : [];
      let results = [];
      try { results = (await rpc('v2_public_centro_tanner_search', { club_key: CLUB_KEY, q })) || []; }
      catch { results = []; }
      if (mySeq !== seq) return;
      const combined = [...staticResults, ...results];
      box.classList.remove('hidden');
      if (!combined.length) { box.innerHTML = `<div class="ct-search-empty">No encontramos nada para “${esc(q)}”. Intenta con otra palabra.</div>`; return; }
      box.innerHTML = combined.map((r) => {
        const href = r.href || (r.type === 'document' ? `/centro-tanner/documento/${esc(r.slug)}` : r.type === 'policy' ? `/centro-tanner/p/${esc(r.slug)}` : (r.slug ? `/centro-tanner/p/${esc(r.slug)}` : `/centro-tanner/tema/${esc(r.category)}`));
        const kicker = r.type === 'historia' ? 'NUESTRA HISTORIA' : r.type === 'faq' ? 'PREGUNTA FRECUENTE' : r.type === 'document' ? 'DOCUMENTO' : (CATEGORY_LABELS[r.category] || 'POLÍTICA').toUpperCase();
        return `<a class="ct-result" href="${href}"><div class="ct-result-kicker">${esc(kicker)}</div><div class="ct-result-title">${esc(r.title)}</div><div class="ct-result-snippet">${esc(r.snippet || '')}</div></a>`;
      }).join('');
    }, 320);
  });
  // 09/11/2026, Mich: "se queda trabado" — al tocar un resultado, la caja
  // nunca se cerraba (el click cae DENTRO de box, así que el cierre por
  // "click afuera" de abajo lo ignoraba a propósito) y quedaba encimada
  // sobre la página a la que acabas de navegar.
  box.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    box.classList.add('hidden');
    input.value = '';
  });
  document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.classList.add('hidden'); });
}

async function renderTheme(categoriesParam) {
  const cats = categoriesParam.split(',').filter(Boolean);
  const label = THEME_GROUPS.find((g) => g.categories.join(',') === cats.join(','))?.label || CATEGORY_LABELS[cats[0]] || 'Tema';
  setMeta(label, `Políticas de ${clubNombre} sobre ${label.toLowerCase()}.`);
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label }])}<h1>${esc(label)}</h1><div id="ctThemeList" class="ct-doc-list"><div class="ct-loading">Cargando…</div></div>`);
  try {
    const lists = await Promise.all(cats.map((c) => rpc('v2_public_centro_tanner_category', { club_key: CLUB_KEY, category_code: c }).catch(() => [])));
    const all = lists.flat();
    const filas = (ps) => ps.map((p) => `<a class="ct-doc-row" href="/centro-tanner/p/${esc(p.slug)}"><div><div class="ct-doc-name">${esc(p.title)}</div><div class="ct-doc-meta">${esc(p.shortAnswer)}</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>`).join('');
    // Temas con varias categorías internas (ej. "Pagos" = mensualidades + becas)
    // se ven con subtítulo por categoría en vez de una sola lista larga; dentro
    // de cada una, lo que ya tiene preguntas frecuentes sale primero (faqCount).
    $('ctThemeList').innerHTML = !all.length ? '<p class="ct-empty">Aún no hay contenido publicado en este tema.</p>'
      : cats.length <= 1 ? filas(all)
      : cats.map((c) => {
          const ps = all.filter((p) => p.category === c);
          return ps.length ? `<h2 class="ct-subtema-title">${esc(CATEGORY_LABELS[c] || c)}</h2><div class="ct-doc-list ct-subtema-list">${filas(ps)}</div>` : '';
        }).join('');
  } catch { $('ctThemeList').innerHTML = '<p class="ct-empty">No pudimos cargar este tema.</p>'; }
}

// 09/11/2026, Mich: la política decía "Siguiente paso: SOLICITAR APOYO" pero
// no había ningún botón, y el único camino real (Portal de familia) exige
// sesión y un jugador ya inscrito — para Apoyo de Ingreso eso no tiene
// sentido, es para quien AÚN NO se inscribe. Este botón manda la solicitud
// sin sesión (v2_public_scholarship_request); el club la revisa y vincula.
const SOLICITUD_MODALIDAD_POR_SLUG = {
  'apoyo-de-ingreso': 'ingreso',
  'beca-de-apoyo-familiar': 'apoyo_familiar',
  'beca-academica': 'academica',
  'beca-lealtad-tanner': 'lealtad',
  curtibrother: 'curtibrother',
};
// 09/11/2026, Mich: "para que la solicitud proceda hay que pagar $200". Ojo:
// según TC-142 esa cuota NO aplica a Apoyo de Ingreso ni Curtibrother (ni a
// Deportiva/Tanner, que ya no llegan aquí por ser de nominación) — espejo de
// private.scholarship_modality_meta. Ahí es justo donde menos sentido tendría
// cobrar: es para quien no puede pagar ni para inscribirse.
const CUOTA_REQUERIDA = new Set(['apoyo_familiar', 'academica', 'lealtad']);
function solicitudApoyoHtml(modality, cuota) {
  const avisoCuota = CUOTA_REQUERIDA.has(modality)
    ? `<p class="bk-solicitud-cuota">Esta modalidad tiene una cuota administrativa de evaluación de $${esc(Math.round(Number(cuota) || 200))} MXN para que tu solicitud proceda — no es reembolsable y no garantiza aprobación. Te contactaremos para indicarte cómo cubrirla. <a href="/centro-tanner/p/cuota-de-evaluacion-de-beca">Ver detalles →</a></p>`
    : '';
  return `<div class="bk-solicitud-wrap">
    <button type="button" id="bkSolicitarBtn" class="bk-btn-primary">Solicitar apoyo →</button>
    <form id="bkSolicitudForm" class="bk-solicitud hidden">
      ${avisoCuota}
      <label>Tu nombre<input id="bsGuardian" required minlength="3" maxlength="120" placeholder="Nombre del papá, mamá o tutor"></label>
      <label>Tu WhatsApp<input id="bsPhone" type="tel" required placeholder="10 dígitos"></label>
      <label>Nombre de tu hijo(a)<input id="bsChild" required minlength="2" maxlength="120" placeholder="Nombre del jugador o futura jugadora"></label>
      <label>¿Ya está inscrito en ${esc(clubNombre || 'el club')}?
        <select id="bsChildStatus"><option value="sin_inscribir">Todavía no</option><option value="inscrito">Sí, ya está inscrito</option></select>
      </label>
      <label>Cuéntanos tu situación<textarea id="bsReason" required minlength="20" maxlength="2000" rows="4" placeholder="Al menos 20 caracteres — entre más contexto, más rápido podemos revisar tu caso"></textarea></label>
      <label class="bk-solicitud-check"><input type="checkbox" id="bsConsent" required> He leído el <a href="/centro-tanner/privacidad" target="_blank">Aviso de privacidad</a> y acepto que usen estos datos para revisar mi solicitud.</label>
      <button type="submit" class="bk-btn-primary">Enviar solicitud</button>
      <p id="bkSolicitudMsg" class="bk-solicitud-msg hidden"></p>
    </form>
  </div>`;
}
function wireSolicitudApoyo(modality) {
  const btn = $('bkSolicitarBtn'), form = $('bkSolicitudForm');
  if (!btn || !form) return;
  btn.addEventListener('click', () => { btn.classList.add('hidden'); form.classList.remove('hidden'); $('bsGuardian').focus(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('bkSolicitudMsg');
    msg.classList.remove('hidden'); msg.dataset.type = ''; msg.textContent = 'Enviando…';
    const submitBtn = form.querySelector('button[type="submit"]'); submitBtn.disabled = true;
    try {
      const r = await rpc('v2_public_scholarship_request', { club_key: CLUB_KEY, request: {
        guardianName: $('bsGuardian').value, phone: $('bsPhone').value, childName: $('bsChild').value,
        childStatus: $('bsChildStatus').value, modality, reason: $('bsReason').value,
        consent: { dataAccepted: $('bsConsent').checked },
      } });
      form.querySelectorAll('input,select,textarea,button').forEach((el) => (el.disabled = true));
      msg.dataset.type = 'success';
      msg.innerHTML = r.duplicate
        ? `Ya tenías una solicitud enviada (folio <b>${esc(r.folio)}</b>). El club te va a contestar por WhatsApp.`
        : `¡Listo! Tu folio es <b>${esc(r.folio)}</b>. El club va a revisar tu solicitud y te contacta por WhatsApp.`;
    } catch (err) {
      submitBtn.disabled = false;
      msg.dataset.type = 'error';
      msg.textContent = err.message || 'No pudimos enviar tu solicitud, intenta de nuevo.';
    }
  });
}
async function renderPolicy(slug) {
  render('<div class="ct-loading">Cargando…</div>');
  try {
    const p = await rpc('v2_public_centro_tanner_policy', { club_key: CLUB_KEY, policy_slug: slug });
    setMeta(p.title, p.shortAnswer);
    const catLabel = CATEGORY_LABELS[p.category] || p.category;
    const consentNote = p.requiresAcceptance && p.consentDocumentCode && DOC_LABELS[p.consentDocumentCode]
      ? `<p class="ct-consent-note">Esta política forma parte de <a href="/centro-tanner/documento/${esc(p.consentDocumentCode)}">${esc(DOC_LABELS[p.consentDocumentCode])}</a>, que firmas en tu Portal de familia.</p>` : '';
    const resto = restoSinRepetir(p.shortAnswer, p.officialContent);
    const hayMas = resto.length > 4;
    const toggle = hayMas
      ? `<button class="ct-policy-toggle" id="ctToggleFull" type="button">Ver más detalles →</button>
         <div id="ctFullContent" class="ct-policy-full hidden">${linkify(esc(resto))}</div>` : '';
    const modalidad = SOLICITUD_MODALIDAD_POR_SLUG[p.slug];
    const cuota = modalidad && CUOTA_REQUERIDA.has(modalidad) ? (await getBecasConfig()).applicationFee : null;
    render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { href: `/centro-tanner/tema/${esc(p.category)}`, label: catLabel }, { label: p.title }])}
      <article class="ct-policy-card">
        <div class="ct-policy-kicker">${esc(catLabel)}</div>
        <h1 class="ct-policy-title">${esc(p.title)}</h1>
        <p class="ct-policy-short">${esc(p.shortAnswer)}</p>
        ${toggle}
        <div class="ct-policy-meta"><span>Versión ${esc(p.version)}</span>${p.effectiveDate ? `<span>Vigente desde ${esc(fmtDate(p.effectiveDate))}</span>` : ''}${p.policyCode ? `<span>${esc(p.policyCode)}</span>` : ''}</div>
        ${consentNote}
        ${modalidad ? solicitudApoyoHtml(modalidad, cuota) : ''}
      </article>
      ${feedbackWidget('policy', p.id)}
      ${p.relatedFaqs?.length ? `<section class="ct-section"><h2 class="ct-section-title">Preguntas relacionadas</h2><div class="ct-faq-list">${p.relatedFaqs.map((f) => `<details class="ct-faq-item"><summary>${esc(f.question)}</summary><div class="ct-faq-body">${esc(f.answer)}</div></details>`).join('')}</div></section>` : ''}
    `);
    injectFaqSchema(p.relatedFaqs);
    if (hayMas) $('ctToggleFull').addEventListener('click', () => {
      const el = $('ctFullContent'); const open = !el.classList.contains('hidden');
      el.classList.toggle('hidden'); $('ctToggleFull').textContent = open ? 'Ver más detalles →' : 'Ocultar detalles ↑';
    });
    if (modalidad) wireSolicitudApoyo(modalidad);
    wireFeedback(p.id);
  } catch (err) { render(`<div class="ct-empty"><h1>No encontramos esta política</h1><p>${esc(err.message || '')}</p><a href="/centro-tanner/">Volver a Centro Tanner</a></div>`); }
}

function feedbackWidget(type, id) {
  if (!id) return '';
  return `<div class="ct-feedback" id="ctFeedback" data-type="${esc(type)}" data-id="${esc(id)}">
    <span class="ct-feedback-q">¿Te sirvió esta información?</span>
    <div class="ct-feedback-btns">
      <button type="button" data-helpful="1">Sí</button>
      <button type="button" data-helpful="0">No</button>
    </div>
  </div>`;
}
function wireFeedback(id) {
  const box = $('ctFeedback'); if (!box || !id) return;
  box.querySelectorAll('[data-helpful]').forEach((btn) => btn.addEventListener('click', async () => {
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await rpc('v2_public_centro_tanner_feedback', { club_key: CLUB_KEY, target_type: box.dataset.type, target_id: id, helpful: btn.dataset.helpful === '1' });
      box.innerHTML = '<span class="ct-feedback-thanks">¡Gracias por tu opinión!</span>';
    } catch { box.innerHTML = '<span class="ct-feedback-thanks">Gracias.</span>'; }
  }));
}

async function renderDocument(code) {
  render('<div class="ct-loading">Cargando…</div>');
  try {
    const d = await rpc('v2_public_centro_tanner_document', { club_key: CLUB_KEY, doc_code: code });
    setMeta(d.title, `Versión vigente de ${d.title} de ${clubNombre}.`);
    render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: d.title }])}
      <h1>${esc(d.title)}</h1>
      <p class="ct-doc-meta">Versión ${esc(d.version)} · Vigente desde ${esc(fmtDate(d.effectiveDate))}${d.organizationLegalName ? ` · ${esc(d.organizationLegalName)}` : ''}</p>
      <div class="ct-doc-body-card"><div class="ct-doc-body">${esc(d.body)}</div></div>
      ${d.history?.length ? `<p class="ct-updated"><a href="/centro-tanner/cambios">Ver historial de versiones →</a></p>` : ''}
    `);
  } catch (err) { render(`<div class="ct-empty"><h1>No encontramos este documento</h1><p>${esc(err.message || '')}</p><a href="/centro-tanner/">Volver a Centro Tanner</a></div>`); }
}

async function renderChangelog() {
  setMeta('Historial de cambios', `Historial de versiones del Reglamento, políticas y avisos de ${clubNombre}.`);
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: 'Cambios' }])}<h1>Historial de cambios</h1><div id="ctChanges"><div class="ct-loading">Cargando…</div></div>`);
  try {
    const changes = await rpc('v2_public_centro_tanner_changelog', { club_key: CLUB_KEY });
    $('ctChanges').innerHTML = changes?.length ? changes.map((c) => `<article class="ct-change-item"><div><span class="ct-change-version">${esc(c.versionLabel)}</span><span class="ct-change-date">${esc(fmtDate(c.effectiveDate))}</span></div><h2 class="ct-change-title">${esc(c.title)}</h2><p class="ct-change-desc">${esc(c.description)}</p></article>`).join('') : '<p class="ct-empty">Todavía no hay cambios publicados.</p>';
  } catch { $('ctChanges').innerHTML = '<p class="ct-empty">No pudimos cargar el historial.</p>'; }
}

// ---------------------------------------------------------------------------
// BECAS TANNERY CITY: home con tarjetas, wizard anti-confusión (una pregunta
// por pantalla, nunca "calificas", siempre un único CTA) y páginas de cada
// modalidad reutilizando el motor de políticas de arriba (misma fuente,
// cero contenido duplicado).
// ---------------------------------------------------------------------------
const BECAS_MODALIDADES = [
  { slug: 'apoyo-de-ingreso', titulo: 'Apoyo de Ingreso', frase: 'Soy nuevo y no puedo pagar completo', tag: 'Desde el día 1 · Sin cuota', accion: 'SOLICITAR APOYO' },
  { slug: 'beca-de-apoyo-familiar', titulo: 'Beca de Apoyo Familiar', frase: 'Ya estoy en el club y tengo problemas económicos', tag: '3+ meses · Cuota $200', accion: 'REVISAR REQUISITOS' },
  { slug: 'beca-academica', titulo: 'Beca Académica', frase: 'Tengo promedio de 9.0 o más', tag: '3+ meses · Cuota $200', accion: 'REVISAR BECA' },
  { slug: 'beca-deportiva', titulo: 'Beca Deportiva', frase: 'Destaco por mi rendimiento o potencial', tag: 'Por nominación interna', accion: 'CONOCER CÓMO FUNCIONA' },
  { slug: 'beca-tanner', titulo: 'Beca Tanner', frase: 'Represento los valores Tanner dentro y fuera de la cancha', tag: 'Por nominación interna', accion: 'CONOCER BECA TANNER' },
  { slug: 'beca-lealtad-tanner', titulo: 'Beca Lealtad Tanner', frase: 'Llevo 18 meses o más en el club', tag: '18 meses · Cuota $200', accion: 'VALIDAR ANTIGÜEDAD' },
  { slug: 'curtibrother', titulo: 'Curtibrother', frase: 'Conozco una empresa o persona que podría ayudar', tag: 'Sin cuota', accion: 'PRESENTAR POSIBLE PADRINO' }
];
let becasConfig = null;
async function getBecasConfig() {
  if (becasConfig) return becasConfig;
  try { becasConfig = await rpc('v2_public_scholarship_config', { club_key: CLUB_KEY }); }
  catch { becasConfig = { minPercentage: 10, applicationFee: 200 }; }
  return becasConfig;
}
function becasCard(m) {
  return `<a class="bk-card" href="/centro-tanner/p/${esc(m.slug)}">
    <span class="bk-card-badge">${esc(m.titulo[0])}</span>
    <span class="bk-card-body"><strong>${esc(m.titulo)}</strong><span class="bk-card-frase">“${esc(m.frase)}”</span><span class="bk-card-tag">${esc(m.tag)}</span></span>
    <span class="bk-card-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span>
  </a>`;
}
async function renderBecasHome() {
  setMeta(becasNombre, `Mérito + necesidad + comunidad. Descubre qué beca o apoyo podría aplicar para ti en ${clubNombre || 'el club'}.`);
  const cfg = await getBecasConfig();
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: 'Becas' }])}
    <section class="ct-hero bk-hero">
      <div class="ct-hero-eyebrow">MÉRITO + NECESIDAD + COMUNIDAD</div>
      <h1>${esc(becasNombre)}</h1>
      <p>Queremos que el talento, la disciplina y las ganas de crecer encuentren oportunidades.</p>
      <div class="bk-hero-ctas">
        <a class="bk-btn-primary" href="/centro-tanner/becas/wizard">DESCUBRE QUÉ APOYO PODRÍA APLICAR PARA TI</a>
        <a class="bk-btn-ghost" href="#bkGrid">Ver todas las becas</a>
      </div>
    </section>
    <div class="bk-disclaimer">IMPORTANTE: Las becas y apoyos de ${esc(becasNombre.replace(/^Becas\s*/, '') || 'el club')} no son automáticos ni permanentes. Cada solicitud o nominación es evaluada individualmente. El club determina la aprobación, porcentaje, duración, cobertura y condiciones de cada apoyo. Los apoyos pueden comenzar desde el ${esc(cfg.minPercentage)}%; el club determina el porcentaje final.</div>
    <section class="ct-section" id="bkGrid">
      <h2 class="ct-section-title">Las 7 modalidades</h2>
      <div class="bk-grid">${BECAS_MODALIDADES.map(becasCard).join('')}</div>
    </section>
    <section class="ct-section">
      <h2 class="ct-section-title">También puedes revisar</h2>
      <div class="ct-doc-list">
        <a class="ct-doc-row" href="/centro-tanner/p/tanner-por-tanner"><div><div class="ct-doc-name">Tanner por Tanner</div><div class="ct-doc-meta">Programa de comunidad y reciprocidad</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>
        <a class="ct-doc-row" href="/centro-tanner/p/cuota-de-evaluacion-de-beca"><div><div class="ct-doc-name">Cuota de evaluación de beca</div><div class="ct-doc-meta">Qué es, a qué aplica y cuándo se exenta</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>
      </div>
    </section>
  `);
}

const BK_PREGUNTAS = {
  ingreso: { q: '¿Tu Tanner acaba de ingresar?', opts: [{ t: 'Sí', to: 'ingresoApoyo' }, { t: 'No', to: 'antiguedad' }] },
  ingresoApoyo: { q: '¿Necesitas apoyo económico para poder comenzar?', opts: [{ t: 'Sí', to: { resultado: 'apoyo-de-ingreso' } }, { t: 'No', to: { info: true } }] },
  antiguedad: { q: '¿Lleva al menos 3 meses en el club?', opts: [{ t: 'No', to: { corto: true } }, { t: 'Sí', to: 'motivo' }] },
  motivo: { q: '¿El motivo principal es económico?', opts: [{ t: 'Sí', to: { resultado: 'beca-de-apoyo-familiar' } }, { t: 'No', to: 'promedio' }] },
  promedio: { q: '¿Tiene promedio escolar mínimo de 9.0?', opts: [{ t: 'Sí', to: { resultado: 'beca-academica', nota: 'Si además representa de forma extraordinaria los valores Tanner, podría ser nominado internamente para Beca Tanner.' } }, { t: 'No', to: 'lealtad' }] },
  lealtad: { q: '¿Lleva 18 meses continuos en el club?', opts: [{ t: 'Sí', to: { resultado: 'beca-lealtad-tanner' } }, { t: 'No', to: { nominacion: true } }] }
};
let wizardStack = [];
function wizardStart() { wizardStack = ['ingreso']; renderBecasWizardStep(); }
function wizardGo(to) { wizardStack.push(to); renderBecasWizardStep(); }
function wizardBack() { wizardStack.pop(); renderBecasWizardStep(); }
function wizardFrame(inner, { back = true } = {}) {
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { href: '/centro-tanner/becas', label: 'Becas' }, { label: 'Ayúdame a elegir' }])}
    <section class="bk-wizard">${inner}
      <div class="bk-wizard-foot">${back ? '<button type="button" class="bk-btn-ghost" id="bkBack">← Regresar</button>' : ''}<a class="bk-btn-ghost" href="/centro-tanner/becas">Ver todas las becas</a></div>
    </section>`);
  $('bkBack')?.addEventListener('click', wizardBack);
}
async function renderBecasWizardStep() {
  const step = wizardStack[wizardStack.length - 1];
  setMeta('Ayúdame a elegir', `Responde unas preguntas y descubre qué apoyo de ${clubNombre || 'el club'} podría aplicar para ti.`);
  if (!step) {
    // primera pantalla: elegir una frase o abrir el wizard guiado
    wizardFrame(`
      <h1>¿Cuál de estas frases se parece más a tu situación?</h1>
      <div class="bk-wizard-opts bk-wizard-opts-grid">
        ${BECAS_MODALIDADES.map((m, i) => `<button type="button" class="bk-wizard-opt" data-pick="${i}">${esc(m.frase)}</button>`).join('')}
        <button type="button" class="bk-wizard-opt bk-wizard-opt-muted" id="bkNoSe">No sé cuál aplica para mí</button>
      </div>`, { back: false });
    document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const m = BECAS_MODALIDADES[Number(b.dataset.pick)];
      if (m.slug === 'beca-deportiva' || m.slug === 'beca-tanner') return renderWizardResult({ nominacion: true, slugSugerido: m.slug });
      if (m.slug === 'curtibrother') return renderWizardResult({ resultado: 'curtibrother' });
      history.pushState({}, '', conClub(`/centro-tanner/p/${m.slug}`)); route();
    }));
    $('bkNoSe').addEventListener('click', wizardStart);
    return;
  }
  const node = BK_PREGUNTAS[step];
  if (!node) return renderWizardResult(step);
  wizardFrame(`
    <h1>${esc(node.q)}</h1>
    <div class="bk-wizard-opts">${node.opts.map((o, i) => `<button type="button" class="bk-wizard-opt" data-opt="${i}">${esc(o.t)}</button>`).join('')}</div>
  `, { back: wizardStack.length > 1 });
  document.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
    const dest = node.opts[Number(b.dataset.opt)].to;
    if (typeof dest === 'string') return wizardGo(dest);
    renderWizardResult(dest);
  }));
}
async function renderWizardResult(dest) {
  if (dest?.info) {
    wizardFrame(`<h1>Buenas noticias</h1><p class="bk-wizard-copy">Si no necesitas apoyo económico para comenzar, no hay ningún paso adicional por ahora. Si tu situación cambia, aquí vas a encontrar la opción que podría aplicar para ti.</p>
      <a class="bk-btn-primary" href="/centro-tanner/becas">VER TODAS LAS BECAS</a>`);
    return;
  }
  if (dest?.corto) {
    wizardFrame(`<h1>Por tu antigüedad, esto podría aplicar</h1>
      <div class="bk-grid">${becasCard(BECAS_MODALIDADES.find(m => m.slug === 'apoyo-de-ingreso'))}</div>
      <p class="bk-wizard-copy">Si tu caso es extraordinario, puedes contactar directamente a administración.</p>`);
    return;
  }
  if (dest?.nominacion) {
    const m = BECAS_MODALIDADES.find(x => x.slug === dest.slugSugerido) || BECAS_MODALIDADES.find(x => x.slug === 'beca-deportiva');
    wizardFrame(`<h1>Beca Deportiva y Beca Tanner son por nominación interna</h1>
      <p class="bk-wizard-copy">No necesitas solicitarlas. Las otorga el club por nominación del entrenador, Dirección Deportiva o Presidencia.</p>
      <div class="bk-grid">${becasCard(m)}</div>`);
    return;
  }
  const slug = dest?.resultado || dest;
  const m = BECAS_MODALIDADES.find((x) => x.slug === slug);
  wizardFrame(`
    <h1>Por tu situación, esta opción podría aplicar para ti</h1>
    <div class="bk-grid">${m ? becasCard(m) : ''}</div>
    ${dest?.nota ? `<p class="bk-wizard-copy">${esc(dest.nota)}</p>` : ''}
    <p class="bk-wizard-fineprint">La aprobación final depende de la evaluación de ${esc(clubNombre || 'el club')}.</p>
    <a class="bk-btn-primary" href="/centro-tanner/p/${esc(slug)}">VER REQUISITOS Y SIGUIENTE PASO</a>
  `);
}

// ---------------------------------------------------------------------------
// NUESTRA HISTORIA / TANO EL TANNER: contenido de marca (brandbook + mascota)
// para que cualquiera se pueda meter a investigar de dónde viene Tannery
// City. Es estático (no viene de la base de datos) porque no cambia según
// temporada; solo se muestra para el club Tannery City (ver esTanneryCity).
// ---------------------------------------------------------------------------
function historiaHubCard(t) {
  return `<a class="hs-hub-card" href="/centro-tanner/historia/${t.slug}">
    <span class="hs-hub-badge hs-hub-badge-${t.icon}"><span class="tos-icon tos-icon-${t.icon}" aria-hidden="true"></span></span>
    <span class="hs-hub-body"><span class="hs-hub-kicker">${esc(t.kicker)}</span><strong>${esc(t.title)}</strong><span class="hs-hub-desc">${esc(t.desc)}</span></span>
    <span class="hs-hub-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span>
  </a>`;
}
async function renderHistoriaHub() {
  setMeta('Nuestra historia', 'El origen de Tannery City, nuestro escudo, nuestros valores y la tradición de nombrar nuestras canchas.');
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: 'Nuestra historia' }])}
    <section class="ct-hero hs-hero">
      <div class="ct-hero-eyebrow">TANNERY CITY · DESDE 1850</div>
      <h1>¿Quién es Tano el Tanner?</h1>
      <p>Toda la historia detrás del escudo, los colores y los valores que nos forman — tócale a lo que quieras y métete a investigar.</p>
    </section>
    <section class="ct-section">
      <h2 class="ct-section-title">Explora</h2>
      <div class="hs-hub-grid">${HISTORIA_TOPICS.map(historiaHubCard).join('')}</div>
    </section>
  `);
}

// Cada tema es una página propia (crumb + tarjeta + "sigue explorando" hacia
// el siguiente) para que se sienta como algo que se recorre, no un solo
// documento larguísimo. El contenido de cada una vive en HISTORIA_BODIES.
const HISTORIA_BODIES = {
  tano: () => `
    <div class="hs-tano-grid">
      <div class="hs-tano-badge">T</div>
      <div class="hs-tano-body">
        <p>Tano es un portero luchador de León. Por la mañana va a la tenería, por la tarde juega fútbol y por la noche se sube al ring. Su nombre viene de Antonio, en homenaje a Antonio «La Tota» Carbajal.</p>
        <div class="hs-trait-grid">
          <div class="hs-trait"><strong>Juguetón</strong><span>Bromea, baila y canta con la afición.</span></div>
          <div class="hs-trait"><strong>Valiente</strong><span>Se avienta por cada balón, al 200%.</span></div>
          <div class="hs-trait"><strong>Compañero</strong><span>Anima a los niños y nunca regaña.</span></div>
          <div class="hs-trait"><strong>Leonés</strong><span>Cuero, guacamayas y lechuguilla.</span></div>
        </div>
        <div class="hs-quotes">
          <span class="hs-quote">“¡De la tenería a la portería!”</span>
          <span class="hs-quote">“¡Andamos al 200%!”</span>
          <span class="hs-quote">“¡Otra vez, Tanner!”</span>
          <span class="hs-quote">“Aquí nos curtimos jugando”</span>
          <span class="hs-quote">“¡Qué onda, Curtibrother!”</span>
          <span class="hs-quote">“El trabajo todo lo vence”</span>
        </div>
      </div>
    </div>`,
  raices: () => `
    <p style="margin:0;font-size:14.5px;line-height:1.65;color:#33403f">Nuestra historia comienza en <strong>1850</strong>, con el lema que define a León: <strong>“el trabajo todo lo vence”</strong>. Es una historia de hacer posible lo imposible — contada por el equipo, la afición y los deportistas. Una historia sobre la creación de las estrellas del mañana, y de cómo <strong>“curtimos”</strong> humanos que se convierten en <strong>mejores personas</strong>. No olvidamos nuestras raíces, porque nos recuerdan de dónde venimos.</p>
    <p style="margin:12px 0 0;font-size:14px;font-style:italic;color:var(--ct-teal);font-weight:700">To our city, to our family, to our Tanners.</p>`,
  origen: () => `
    <div class="hs-origin-grid">
      <div class="hs-origin-item"><span class="hs-origin-flag">Holanda</span><span class="hs-origin-word">Formar</span><span class="hs-origin-desc">Desarrollar al jugador por etapas. Primero crecer, luego competir.</span></div>
      <div class="hs-origin-item"><span class="hs-origin-flag">España</span><span class="hs-origin-word">Entender</span><span class="hs-origin-desc">Jugar pensando. Técnica, posición, relación y decisión.</span></div>
      <div class="hs-origin-item"><span class="hs-origin-flag">Pachuca, MX</span><span class="hs-origin-word">Proyectar</span><span class="hs-origin-desc">La formación debe abrir camino al alto rendimiento y al profesionalismo.</span></div>
      <div class="hs-origin-item"><span class="hs-origin-flag">Italia</span><span class="hs-origin-word">Representar</span><span class="hs-origin-desc">Identidad, detalle, presencia y orgullo por la camiseta.</span></div>
      <div class="hs-origin-item"><span class="hs-origin-flag">Inglaterra</span><span class="hs-origin-word">Competir</span><span class="hs-origin-desc">Energía, intensidad, ritmo y hambre de jugar.</span></div>
      <div class="hs-origin-item"><span class="hs-origin-flag">León</span><span class="hs-origin-word">Pertenecer</span><span class="hs-origin-desc">Ciudad, familia, barrio e identidad propia.</span></div>
    </div>
    <p class="hs-origin-sum">Formar + Entender + Proyectar + Representar + Competir + Pertenecer = Tannery City<br>Curtimos futbolistas. Formamos personas.</p>`,
  escudo: () => `
    <div class="hs-shield-grid">
      <div class="hs-shield-item"><strong>La corona de la bandera de León</strong><p>La parte superior de nuestro escudo se asemeja a una "corona mural", un tributo a la ciudad que nos vio nacer. Representa fortaleza, historia y grandeza.</p></div>
      <div class="hs-shield-item"><strong>Industria del calzado</strong><p>Nuestro escudo está formado por las partes sobrantes del cuero, lo mismo que los artesanos de León usan para dar forma al calzado, chamarras y otros productos que pusieron a nuestra ciudad en el mapa mundial.</p></div>
      <div class="hs-shield-item"><strong>Silueta del cuero</strong><p>Un homenaje a los curtidores que han dado vida a la ciudad de León. Es la piel de nuestra historia y compromiso con la excelencia.</p></div>
      <div class="hs-shield-item"><strong>Ascenso hacia la grandeza</strong><p>Las astas de las "T" ascienden desde la base y convergen en el travesaño, como dos caminos separados que gradualmente se encuentran: crecimiento constante, ambición y deseo de alcanzar nuevos desafíos.</p></div>
      <div class="hs-shield-item"><strong>Unión y reflejo</strong><p>Nuestro escudo es un monograma que comienza con dos letras "T" unidas, espejadas verticalmente: la unión de la tradición y la modernidad, herencia y evolución.</p></div>
    </div>`,
  valores: () => `
    <div class="hs-values-grid">
      <div class="hs-value"><strong>Resiliencia</strong><p>Los Tanners deben estar preparados para superar adversidades en el campo y fuera de él.</p></div>
      <div class="hs-value"><strong>Energía</strong><p>En Tannery City todo trata de energía: la de quien sale a trabajar por la mañana, la de marcar el gol de la victoria, la de la afición cantando nuestro himno, la que vemos en la ciudad todos los días. Esa energía es la que nos mueve.</p></div>
      <div class="hs-value"><strong>Unidad</strong><p>Ciudad, familia, Tanners y sponsors. Jugamos como una unidad, donde cada quien entiende su rol y contribuye al éxito colectivo. Cuando las cosas se ponen difíciles permanecemos unidos; cuando hay éxito, lo celebramos eufóricos.</p></div>
      <div class="hs-value"><strong>Pies en la tierra</strong><p>Trabajamos todos los días para ser los mejores, todos los días. Sabemos que podemos superar cualquier obstáculo, pero siempre con humildad deportiva. Cuando hagas las cosas bien, serás felicitado con el orgullo que mereces. Pero si algo no sale como debería, también seremos los primeros en decírtelo, porque solo con autocrítica podemos mejorar.</p></div>
      <div class="hs-value"><strong>Del Bajío para el mundo</strong><p>Confiamos y conocemos la calidad de los deportistas y personas en esta zona geográfica. Somos un puente para materializar tus sueños, solo tienes que estar dispuesto a pagar el precio.</p></div>
      <div class="hs-value"><strong>Curtibrother</strong><p>Tannery City pertenece a personas como tú y yo: a quien va a una maquila a trabajar, va a la escuela, viaja en "la oruga" para ir a entrenar, come una guacamaya o se toma una lechuguilla para el calor. Tannery City está en cada esquina de nuestra ciudad, porque de ahí saldrán los próximos campeones mundiales.</p></div>
    </div>
    <div class="hs-triangle-wrap">
      <div class="hs-triangle">
        <span class="hs-triangle-top">Mente</span>
        <span class="hs-triangle-bottom"><span>Cuerpo</span><span>Espíritu</span></span>
      </div>
    </div>`,
  canchas: () => `
    <p style="margin:0;font-size:14px;line-height:1.6;color:#33403f">En Tannery City, a nuestras canchas siempre les ponemos nombres en honor a alguien o a algo que representa nuestras raíces. Es nuestra manera de que la historia del club se siga contando cada vez que alguien juega en ellas.</p>
    <div class="hs-plaque">
      <div class="hs-plaque-title">Cancha “La Lechuguilla”</div>
      <p>Nombrada “La Lechuguilla” como homenaje a nuestras raíces, a la identidad del Bajío y al espíritu de nuestra ciudad.</p>
      <p>En Tannery City, La Lechuguilla representa origen, barrio, tradición y pertenencia. Es un símbolo de quienes trabajan, sueñan y construyen todos los días con humildad, carácter y pasión por el fútbol.</p>
      <p>Que esta cancha siga formando jugadores, familias y futuras generaciones que honren a León, a su historia y al amor por este juego.</p>
      <div class="hs-plaque-meta">Fundada el 20 de junio de 2026 · Nombrada por Tannery City y su comunidad</div>
    </div>
    <div class="hs-plaque">
      <div class="hs-plaque-title">Cancha “Chavicos” Enríquez</div>
      <p>En honor a Ricardo “Chavicos” Enríquez, por su invaluable contribución al desarrollo y fomento del fútbol en la ciudad de León, Guanajuato.</p>
      <p>Su pasión, entrega, éxitos y legado seguirán inspirando a las futuras generaciones de futbolistas.</p>
      <div class="hs-plaque-meta">Fundada el 15 de agosto de 2025 · Dedicada por Tannery City, Salvador “Chavicos” Enríquez y su familia</div>
    </div>`,
  adn: () => `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#33403f">Nuestro ADN combina la filosofía del "joga bonito" con un enfoque táctico y disciplinado, inspirado en las mejores academias del mundo pero arraigado en la cultura mexicana. Jugamos para la afición: por eso nuestro estilo es tribunero, le llamamos <strong>Fútbol Curtido / Tiki Tanner</strong>. Todavía estamos construyendo el camino para jugar siempre así — es justo por eso que enseñamos toda nuestra metodología desde la formación, para que este sea el estilo que se priorice en cada categoría.</p>
    <div class="hs-dna-list">
      <div class="hs-dna-item"><strong>Posesión y creatividad</strong><p>Priorizamos el control del balón con transiciones rápidas, movimientos inteligentes y desmarques constantes.</p></div>
      <div class="hs-dna-item"><strong>Presión alta y recuperación rápida</strong><p>Cuando no tenemos el balón, el objetivo es recuperarlo lo más rápido posible, cerrando líneas de pase.</p></div>
      <div class="hs-dna-item"><strong>Velocidad en las transiciones</strong><p>De defensa a ataque en pocos toques, con ataques directos y contundentes en el último tercio.</p></div>
      <div class="hs-dna-item"><strong>Flexibilidad táctica</strong><p>Adaptación a diferentes formaciones según el rival, siempre manteniendo una identidad ofensiva.</p></div>
    </div>`,
  lema: () => `
    <div class="hs-slogan">
      <div class="hs-slogan-en">“To our City, to our Family, to our Tanners.”</div>
      <div class="hs-slogan-es">Por la ciudad, por nuestra familia, por los Tanners.</div>
      <p class="hs-slogan-quote">“Recuerden todo lo que tuvimos que pasar para llegar a este momento y salgan a disfrutar, háganlo por la ciudad, por su familia y por los Tanners.”</p>
    </div>`
};
async function renderHistoriaTopic(slug) {
  const t = HISTORIA_TOPICS.find((x) => x.slug === slug);
  const body = HISTORIA_BODIES[slug];
  if (!t || !body) return render('<div class="ct-empty"><h1>No encontramos este tema</h1><a href="/centro-tanner/historia">Volver a Nuestra historia</a></div>');
  setMeta(t.title, t.desc);
  const idx = HISTORIA_TOPICS.indexOf(t);
  const next = HISTORIA_TOPICS[(idx + 1) % HISTORIA_TOPICS.length];
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { href: '/centro-tanner/historia', label: 'Nuestra historia' }, { label: t.title }])}
    <div class="ct-hero-eyebrow" style="margin-top:4px">${esc(t.kicker)}</div>
    <h1 class="ct-policy-title" style="margin:4px 0 0">${esc(t.title)}</h1>
    <section class="hs-card">${body()}</section>
    <a class="hs-next-strip" href="/centro-tanner/historia/${next.slug}">
      <span class="hs-next-label">Sigue explorando</span>
      <strong>${esc(next.title)} →</strong>
    </a>
  `);
}

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/centro-tanner';
  const parts = path.split('/').filter(Boolean); // ['centro-tanner', ...]
  const rest = parts.slice(1);
  if (rest.length === 0) return renderHome();
  if (rest[0] === 'becas' && rest[1] === 'wizard') { wizardStack = []; return renderBecasWizardStep(); }
  if (rest[0] === 'becas' && !rest[1]) return renderBecasHome();
  if (rest[0] === 'historia' && !esTanneryCity) return render('<div class="ct-empty"><h1>Página no disponible</h1><a href="/centro-tanner/">Volver a Centro Tanner</a></div>');
  if (rest[0] === 'historia' && rest[1]) return renderHistoriaTopic(decodeURIComponent(rest[1]));
  if (rest[0] === 'historia') return renderHistoriaHub();
  if (rest[0] === 'tema' && rest[1]) return renderTheme(decodeURIComponent(rest[1]));
  if (rest[0] === 'p' && rest[1]) return renderPolicy(decodeURIComponent(rest[1]));
  if (rest[0] === 'documento' && rest[1]) return renderDocument(decodeURIComponent(rest[1]));
  if (rest[0] === 'privacidad') return renderDocument('privacidad');
  if (rest[0] === 'cambios') return renderChangelog();
  render('<div class="ct-empty"><h1>Página no disponible</h1><a href="/centro-tanner/">Volver a Centro Tanner</a></div>');
}

// El club primero: su nombre va en títulos y textos. Las ligas internas se
// llevan ?club= para que navegar no regrese a nadie a Tannery.
try {
  const ctx = await rpc('v2_public_context', { club_key: CLUB_KEY });
  clubNombre = String(ctx?.brand || ctx?.organizationName || '').trim();
  instalaVocabulario(ctx?.playerNoun);
  // "Tannery City Park" es el complejo de Tannery; los demás clubes ven
  // "Instalaciones" para lo mismo. "Becas Tannery City" es el nombre del
  // programa de Tannery; los demás clubes ven "Becas <su club>".
  if (ctx?.slug && ctx.slug !== 'tannery-city-fc') {
    CATEGORY_LABELS.tannery_city_park = 'Instalaciones';
    THEME_GROUPS.forEach(g => { if (g.categories.includes('tannery_city_park')) g.label = 'Instalaciones'; });
    becasNombre = clubNombre ? `Becas ${clubNombre}` : 'Becas';
    esTanneryCity = false;
  }
} catch { clubNombre = ''; }
if (clubNombre) DOC_LABELS.reglamento = `Reglamento ${clubNombre}`;
new MutationObserver(() => propagaClub($('ctContent'))).observe($('ctContent'), { childList: true, subtree: true });
propagaClub();
wireSearch();
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/centro-tanner"]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (location.pathname !== a.getAttribute('href')) history.pushState({}, '', a.getAttribute('href'));
  route();
});
route();
