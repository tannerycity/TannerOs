import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const CLUB_KEY = '1850TC1850';
const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  inscripcion: 'Inscripción y reingreso', mensualidades: 'Mensualidades y pagos', becas: 'Becas y beneficios',
  entrenamientos: 'Entrenamientos', asistencia: 'Asistencia', partidos: 'Partidos y torneos',
  uniformes: 'Uniformes', baby_tanners: 'Baby Tanners', jugadores: 'Jugadores y categorías',
  familias: 'Familias', conducta: 'Conducta', seguridad: 'Seguridad', salud: 'Salud y lesiones',
  tanner_os: 'Tanner OS', estacionamiento: 'Estacionamiento', tannery_city_park: 'Tannery City Park',
  privacidad: 'Privacidad e imagen', faq: 'Preguntas frecuentes'
};
const DOC_LABELS = { reglamento: 'Reglamento Tannery City', privacidad: 'Aviso de privacidad', uso_de_imagen: 'Uso de fotos y video', visoria: 'Términos para visorías' };
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
  setMeta('Centro Tanner', 'Todo lo que necesitas saber sobre Tannery City: reglamento, pagos, becas, seguridad y preguntas frecuentes.');
  render(`
    <section class="ct-hero">
      <div class="ct-hero-eyebrow">TANNERY CITY</div>
      <h1>Centro Tanner</h1>
      <p>Todo lo que necesitas saber sobre Tannery City.</p>
    </section>
    <div class="ct-search">
      <div class="ct-search-box"><span class="tos-icon tos-icon-search" aria-hidden="true"></span>
        <input id="ctSearchInput" type="search" placeholder="¿Qué quieres saber?" autocomplete="off" aria-label="Buscar en Centro Tanner">
      </div>
      <div id="ctSearchResults" class="ct-search-results hidden"></div>
      <p class="ct-search-hint">Prueba: mensualidad, vacaciones, uniforme, beca, estacionamiento…</p>
    </div>
    <section class="ct-section" id="ctFaqSection"><h2 class="ct-section-title">Preguntas frecuentes</h2><div id="ctFaqList" class="ct-faq-list"><div class="ct-loading">Cargando…</div></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Explorar por tema</h2><div id="ctThemeGrid" class="ct-theme-grid"></div></section>
    <section class="ct-section"><h2 class="ct-section-title">Documentos oficiales</h2><div id="ctDocList" class="ct-doc-list"><div class="ct-loading">Cargando…</div></div></section>
    <p class="ct-updated" id="ctUpdated"></p>
  `);
  wireSearch();
  $('ctThemeGrid').innerHTML = THEME_GROUPS.map((g) => `<a class="ct-theme-card" href="/centro-tanner/tema/${encodeURIComponent(g.categories[0])}/" data-group='${esc(JSON.stringify(g.categories))}'>
      <div class="ct-theme-icon"><span class="tos-icon tos-icon-target" aria-hidden="true"></span></div>
      <div class="ct-theme-name">${esc(g.label)}</div>
    </a>`).join('');
  document.querySelectorAll('.ct-theme-grid a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const cats = JSON.parse(a.dataset.group);
    history.pushState({}, '', `/centro-tanner/tema/${cats.join(',')}/`);
    route();
  }));

  try {
    const home = await rpc('v2_public_centro_tanner_home', { club_key: CLUB_KEY });
    const faqs = home?.featuredFaqs || [];
    $('ctFaqList').innerHTML = faqs.length ? faqs.map((f) => `<details class="ct-faq-item"><summary>${esc(f.question)}</summary><div class="ct-faq-body">${esc(f.answer)}${f.policySlug ? `<a class="ct-faq-link" href="/centro-tanner/p/${esc(f.policySlug)}/">Ver política completa →</a>` : ''}</div></details>`).join('') : '<p class="ct-empty">Todavía no hay preguntas frecuentes publicadas.</p>';
    injectFaqSchema(faqs);
    const docs = home?.documents || [];
    $('ctDocList').innerHTML = docs.length ? docs.map((d) => `<a class="ct-doc-row" href="/centro-tanner/documento/${esc(d.code)}/"><div><div class="ct-doc-name">${esc(d.title)} — versión vigente</div><div class="ct-doc-meta">Actualizado ${esc(fmtDate(d.updatedAt))}</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>`).join('') : '<p class="ct-empty">Sin documentos publicados.</p>';
    if (home?.lastUpdated) $('ctUpdated').innerHTML = `Última actualización: ${esc(fmtDate(home.lastUpdated))} · <a href="/centro-tanner/cambios/">Ver historial de cambios →</a>`;
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
          const href = r.type === 'document' ? `/centro-tanner/documento/${esc(r.slug)}/` : r.type === 'policy' ? `/centro-tanner/p/${esc(r.slug)}/` : (r.slug ? `/centro-tanner/p/${esc(r.slug)}/` : `/centro-tanner/tema/${esc(r.category)}/`);
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
  setMeta(label, `Políticas de Tannery City sobre ${label.toLowerCase()}.`);
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label }])}<h1>${esc(label)}</h1><div id="ctThemeList" class="ct-doc-list"><div class="ct-loading">Cargando…</div></div>`);
  try {
    const lists = await Promise.all(cats.map((c) => rpc('v2_public_centro_tanner_category', { club_key: CLUB_KEY, category_code: c }).catch(() => [])));
    const all = lists.flat();
    $('ctThemeList').innerHTML = all.length ? all.map((p) => `<a class="ct-doc-row" href="/centro-tanner/p/${esc(p.slug)}/"><div><div class="ct-doc-name">${esc(p.title)}</div><div class="ct-doc-meta">${esc(p.shortAnswer)}</div></div><span class="ct-doc-arrow tos-icon tos-icon-chevron" aria-hidden="true"></span></a>`).join('') : '<p class="ct-empty">Aún no hay contenido publicado en este tema.</p>';
  } catch { $('ctThemeList').innerHTML = '<p class="ct-empty">No pudimos cargar este tema.</p>'; }
}

async function renderPolicy(slug) {
  render('<div class="ct-loading">Cargando…</div>');
  try {
    const p = await rpc('v2_public_centro_tanner_policy', { club_key: CLUB_KEY, policy_slug: slug });
    setMeta(p.title, p.shortAnswer);
    const catLabel = CATEGORY_LABELS[p.category] || p.category;
    render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { href: `/centro-tanner/tema/${esc(p.category)}/`, label: catLabel }, { label: p.title }])}
      <article class="ct-policy-card">
        <div class="ct-policy-kicker">${esc(catLabel)}</div>
        <h1 class="ct-policy-title">${esc(p.title)}</h1>
        <p class="ct-policy-short">${esc(p.shortAnswer)}</p>
        <button class="ct-policy-toggle" id="ctToggleFull" type="button">Ver política completa →</button>
        <div id="ctFullContent" class="ct-policy-full hidden">${esc(p.officialContent)}</div>
        <div class="ct-policy-meta"><span>Versión ${esc(p.version)}</span>${p.effectiveDate ? `<span>Vigente desde ${esc(fmtDate(p.effectiveDate))}</span>` : ''}${p.policyCode ? `<span>${esc(p.policyCode)}</span>` : ''}</div>
      </article>
      ${p.relatedFaqs?.length ? `<section class="ct-section"><h2 class="ct-section-title">Preguntas relacionadas</h2><div class="ct-faq-list">${p.relatedFaqs.map((f) => `<details class="ct-faq-item"><summary>${esc(f.question)}</summary><div class="ct-faq-body">${esc(f.answer)}</div></details>`).join('')}</div></section>` : ''}
    `);
    injectFaqSchema(p.relatedFaqs);
    $('ctToggleFull').addEventListener('click', () => {
      const el = $('ctFullContent'); const open = !el.classList.contains('hidden');
      el.classList.toggle('hidden'); $('ctToggleFull').textContent = open ? 'Ver política completa →' : 'Ocultar política completa ↑';
    });
  } catch (err) { render(`<div class="ct-empty"><h1>No encontramos esta política</h1><p>${esc(err.message || '')}</p><a href="/centro-tanner/">Volver a Centro Tanner</a></div>`); }
}

async function renderDocument(code) {
  render('<div class="ct-loading">Cargando…</div>');
  try {
    const d = await rpc('v2_public_centro_tanner_document', { club_key: CLUB_KEY, doc_code: code });
    setMeta(d.title, `Versión vigente de ${d.title} de Tannery City.`);
    render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: d.title }])}
      <h1>${esc(d.title)}</h1>
      <p class="ct-doc-meta">Versión ${esc(d.version)} · Vigente desde ${esc(fmtDate(d.effectiveDate))}${d.organizationLegalName ? ` · ${esc(d.organizationLegalName)}` : ''}</p>
      <div class="ct-doc-body-card"><div class="ct-doc-body">${esc(d.body)}</div></div>
      ${d.history?.length ? `<p class="ct-updated"><a href="/centro-tanner/cambios/">Ver historial de versiones →</a></p>` : ''}
    `);
  } catch (err) { render(`<div class="ct-empty"><h1>No encontramos este documento</h1><p>${esc(err.message || '')}</p><a href="/centro-tanner/">Volver a Centro Tanner</a></div>`); }
}

async function renderChangelog() {
  setMeta('Historial de cambios', 'Historial de versiones del Reglamento, políticas y avisos de Tannery City.');
  render(`${crumb([{ href: '/centro-tanner/', label: 'Centro Tanner' }, { label: 'Cambios' }])}<h1>Historial de cambios</h1><div id="ctChanges"><div class="ct-loading">Cargando…</div></div>`);
  try {
    const changes = await rpc('v2_public_centro_tanner_changelog', { club_key: CLUB_KEY });
    $('ctChanges').innerHTML = changes?.length ? changes.map((c) => `<article class="ct-change-item"><div><span class="ct-change-version">${esc(c.versionLabel)}</span><span class="ct-change-date">${esc(fmtDate(c.effectiveDate))}</span></div><h2 class="ct-change-title">${esc(c.title)}</h2><p class="ct-change-desc">${esc(c.description)}</p></article>`).join('') : '<p class="ct-empty">Todavía no hay cambios publicados.</p>';
  } catch { $('ctChanges').innerHTML = '<p class="ct-empty">No pudimos cargar el historial.</p>'; }
}

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/centro-tanner';
  const parts = path.split('/').filter(Boolean); // ['centro-tanner', ...]
  const rest = parts.slice(1);
  if (rest.length === 0) return renderHome();
  if (rest[0] === 'tema' && rest[1]) return renderTheme(decodeURIComponent(rest[1]));
  if (rest[0] === 'p' && rest[1]) return renderPolicy(decodeURIComponent(rest[1]));
  if (rest[0] === 'documento' && rest[1]) return renderDocument(decodeURIComponent(rest[1]));
  if (rest[0] === 'privacidad') return renderDocument('privacidad');
  if (rest[0] === 'cambios') return renderChangelog();
  render('<div class="ct-empty"><h1>Página no disponible</h1><a href="/centro-tanner/">Volver a Centro Tanner</a></div>');
}

window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/centro-tanner"]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (location.pathname !== a.getAttribute('href')) history.pushState({}, '', a.getAttribute('href'));
  route();
});
route();
