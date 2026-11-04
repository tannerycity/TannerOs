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
const THEME_GROUPS = [
  { label: 'Pagos', categories: ['mensualidades', 'becas'] },
  { label: 'Entrenamientos y fútbol', categories: ['entrenamientos', 'asistencia', 'partidos', 'jugadores', 'baby_tanners'] },
  { label: 'Uniformes', categories: ['uniformes'] },
  { label: 'Familias', categories: ['familias', 'inscripcion'] },
  { label: 'Seguridad y salud', categories: ['seguridad', 'salud'] },
  { label: 'Tannery City Park', categories: ['tannery_city_park', 'estacionamiento'] }
];

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
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
    <div class="ct-search">
      <div class="ct-search-box"><span class="tos-icon tos-icon-search" aria-hidden="true"></span>
        <input id="ctSearchInput" type="search" placeholder="¿Qué quieres saber?" autocomplete="off" aria-label="Buscar en Centro Tanner">
      </div>
      <div id="ctSearchResults" class="ct-search-results hidden"></div>
      <p class="ct-search-hint">Prueba: mensualidad, vacaciones, uniforme, beca, estacionamiento…</p>
    </div>
    <a class="bk-banner" href="/centro-tanner/becas">
      <div><span class="bk-banner-eyebrow">MÉRITO + NECESIDAD + COMUNIDAD</span><strong>Becas Tannery City</strong><p>Queremos que el talento, la disciplina y las ganas de crecer encuentren oportunidades.</p></div>
      <span class="bk-banner-cta">Descubre qué apoyo podría aplicar para ti →</span>
    </a>
    <section class="ct-section" id="ctFaqSection"><h2 class="ct-section-title">Preguntas frecuentes</h2><div id="ctFaqList" class="ct-faq-list"><div class="ct-loading">Cargando…</div></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Explorar por tema</h2><div id="ctThemeGrid" class="ct-theme-grid"></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Documentos oficiales</h2><div id="ctDocList" class="ct-doc-list"><div class="ct-loading">Cargando…</div></div></section>
    <p class="ct-updated" id="ctUpdated"></p>
  `);
  wireSearch();
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
      try {
        const results = await rpc('v2_public_centro_tanner_search', { club_key: CLUB_KEY, q });
        if (mySeq !== seq) return;
        box.classList.remove('hidden');
        if (!results?.length) { box.innerHTML = `<div class="ct-search-empty">No encontramos nada para “${esc(q)}”. Intenta con otra palabra.</div>`; return; }
        box.innerHTML = results.map((r) => {
          const href = r.type === 'document' ? `/centro-tanner/documento/${esc(r.slug)}` : r.type === 'policy' ? `/centro-tanner/p/${esc(r.slug)}` : (r.slug ? `/centro-tanner/p/${esc(r.slug)}` : `/centro-tanner/tema/${esc(r.category)}`);
          const kicker = r.type === 'faq' ? 'PREGUNTA FRECUENTE' : r.type === 'document' ? 'DOCUMENTO' : (CATEGORY_LABELS[r.category] || 'POLÍTICA').toUpperCase();
          return `<a class="ct-result" href="${href}"><div class="ct-result-kicker">${esc(kicker)}</div><div class="ct-result-title">${esc(r.title)}</div><div class="ct-result-snippet">${esc(r.snippet || '')}</div></a>`;
        }).join('');
      } catch { if (mySeq === seq) { box.classList.remove('hidden'); box.innerHTML = '<div class="ct-search-empty">No pudimos buscar en este momento.</div>'; } }
    }, 320);
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
    $('ctThemeList').innerHTML = all.length ? all.map((p) => `<a class="ct-doc-row" href="/centro-tanner/p/${esc(p.slug)}"><div><div class="ct-doc-name">${esc(p.title)}</div><div class="ct-doc-meta">${esc(p.shortAnswer)}</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>`).join('') : '<p class="ct-empty">Aún no hay contenido publicado en este tema.</p>';
  } catch { $('ctThemeList').innerHTML = '<p class="ct-empty">No pudimos cargar este tema.</p>'; }
}

async function renderPolicy(slug) {
  render('<div class="ct-loading">Cargando…</div>');
  try {
    const p = await rpc('v2_public_centro_tanner_policy', { club_key: CLUB_KEY, policy_slug: slug });
    setMeta(p.title, p.shortAnswer);
    const catLabel = CATEGORY_LABELS[p.category] || p.category;
    const consentNote = p.requiresAcceptance && p.consentDocumentCode && DOC_LABELS[p.consentDocumentCode]
      ? `<p class="ct-consent-note">Esta política forma parte de <a href="/centro-tanner/documento/${esc(p.consentDocumentCode)}">${esc(DOC_LABELS[p.consentDocumentCode])}</a>, que firmas en tu Portal de familia.</p>` : '';
    render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { href: `/centro-tanner/tema/${esc(p.category)}`, label: catLabel }, { label: p.title }])}
      <article class="ct-policy-card">
        <div class="ct-policy-kicker">${esc(catLabel)}</div>
        <h1 class="ct-policy-title">${esc(p.title)}</h1>
        <p class="ct-policy-short">${esc(p.shortAnswer)}</p>
        <button class="ct-policy-toggle" id="ctToggleFull" type="button">Ver política completa →</button>
        <div id="ctFullContent" class="ct-policy-full hidden">${esc(p.officialContent)}</div>
        <div class="ct-policy-meta"><span>Versión ${esc(p.version)}</span>${p.effectiveDate ? `<span>Vigente desde ${esc(fmtDate(p.effectiveDate))}</span>` : ''}${p.policyCode ? `<span>${esc(p.policyCode)}</span>` : ''}</div>
        ${consentNote}
      </article>
      ${feedbackWidget('policy', p.id)}
      ${p.relatedFaqs?.length ? `<section class="ct-section"><h2 class="ct-section-title">Preguntas relacionadas</h2><div class="ct-faq-list">${p.relatedFaqs.map((f) => `<details class="ct-faq-item"><summary>${esc(f.question)}</summary><div class="ct-faq-body">${esc(f.answer)}</div></details>`).join('')}</div></section>` : ''}
    `);
    injectFaqSchema(p.relatedFaqs);
    $('ctToggleFull').addEventListener('click', () => {
      const el = $('ctFullContent'); const open = !el.classList.contains('hidden');
      el.classList.toggle('hidden'); $('ctToggleFull').textContent = open ? 'Ver política completa →' : 'Ocultar política completa ↑';
    });
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
  setMeta('Becas Tannery City', 'Mérito + necesidad + comunidad. Descubre qué beca o apoyo podría aplicar para ti en Tannery City.');
  const cfg = await getBecasConfig();
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: 'Becas' }])}
    <section class="ct-hero bk-hero">
      <div class="ct-hero-eyebrow">MÉRITO + NECESIDAD + COMUNIDAD</div>
      <h1>Becas Tannery City</h1>
      <p>Queremos que el talento, la disciplina y las ganas de crecer encuentren oportunidades.</p>
      <div class="bk-hero-ctas">
        <a class="bk-btn-primary" href="/centro-tanner/becas/wizard">DESCUBRE QUÉ APOYO PODRÍA APLICAR PARA TI</a>
        <a class="bk-btn-ghost" href="#bkGrid">Ver todas las becas</a>
      </div>
    </section>
    <div class="bk-disclaimer">IMPORTANTE: Las becas y apoyos Tannery City no son automáticos ni permanentes. Cada solicitud o nominación es evaluada individualmente. Tannery City determina la aprobación, porcentaje, duración, cobertura y condiciones de cada apoyo. Los apoyos pueden comenzar desde el ${esc(cfg.minPercentage)}%; Tannery City determina el porcentaje final.</div>
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
  setMeta('Ayúdame a elegir', 'Responde unas preguntas y descubre qué apoyo de Tannery City podría aplicar para ti.');
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
    <p class="bk-wizard-fineprint">La aprobación final depende de la evaluación de Tannery City.</p>
    <a class="bk-btn-primary" href="/centro-tanner/p/${esc(slug)}">VER REQUISITOS Y SIGUIENTE PASO</a>
  `);
}

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/centro-tanner';
  const parts = path.split('/').filter(Boolean); // ['centro-tanner', ...]
  const rest = parts.slice(1);
  if (rest.length === 0) return renderHome();
  if (rest[0] === 'becas' && rest[1] === 'wizard') { wizardStack = []; return renderBecasWizardStep(); }
  if (rest[0] === 'becas' && !rest[1]) return renderBecasHome();
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
  // "Instalaciones" para lo mismo.
  if (ctx?.slug && ctx.slug !== 'tannery-city-fc') {
    CATEGORY_LABELS.tannery_city_park = 'Instalaciones';
    THEME_GROUPS.forEach(g => { if (g.categories.includes('tannery_city_park')) g.label = 'Instalaciones'; });
  }
} catch { clubNombre = ''; }
if (clubNombre) DOC_LABELS.reglamento = `Reglamento ${clubNombre}`;
new MutationObserver(() => propagaClub($('ctContent'))).observe($('ctContent'), { childList: true, subtree: true });
propagaClub();
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/centro-tanner"]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (location.pathname !== a.getAttribute('href')) history.pushState({}, '', a.getAttribute('href'));
  route();
});
route();
