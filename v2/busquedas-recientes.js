/* Búsquedas recientes en cada buscador de la app (05/11/2026).

   Presidencia: "que si buscaste algo se quede ahí guardado... busqué a tal
   niño y no me acordé quién era... que esté ahí como un buscador rápido".

   Cada buscador de cada pantalla (Jugadores, Taquilla, Partidos, Pedidos...)
   recuerda lo último que se buscó en él. Al tocar el buscador vacío salen
   esas búsquedas como botones; un toque la vuelve a buscar.

   Cuidados (son nombres de niños):
     · Se guarda por persona: la llave lleva club y usuario.
     · Sólo lo que se tecleó (máximo 6 por buscador, 30 días). No se guardan
       teléfonos ni resultados.
     · "Salir del vestidor" lo borra todo (shell.js).
   El buscador de arriba (shell) tiene sus propios recientes; aquí no se toca. */

export const PREFIJO = 'tos:recientes:';
export const MAX = 6;
export const DIAS = 30;
const MIN = 2;

export const normaliza = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function llave(org, usuario, pantalla, campo) {
  return `${PREFIJO}${org || 'sin-org'}:${usuario || 'sin-usuario'}:${pantalla || '/'}:${campo || 'buscar'}`;
}

/* Agrega lo buscado al frente. Sin repetidos (sin importar acentos ni
   mayúsculas) y sin dejar los pedazos que se tecleaban antes: si se buscó
   "Dam" y luego "Damián", queda "Damián". */
export function agrega(lista, texto, ahora = Date.now(), max = MAX) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const n = normaliza(t);
  const previa = vigentes(lista, ahora);
  // Un teléfono tecleado no se guarda: es dato de la familia, no un nombre.
  const soloTelefono = /^[\d\s+()-]+$/.test(t) && t.replace(/\D/g, '').length >= 7;
  if (n.length < MIN || soloTelefono) return previa.slice(0, max);
  const resto = previa.filter(x => { const m = normaliza(x.t); return m !== n && !n.startsWith(m); });
  return [{ t, en: ahora }, ...resto].slice(0, max);
}

export function vigentes(lista, ahora = Date.now(), dias = DIAS) {
  const limite = ahora - dias * 86400000;
  return (Array.isArray(lista) ? lista : []).filter(x => x && typeof x.t === 'string' && Number(x.en) >= limite);
}

export function borraTodo(storage) {
  try {
    const s = storage || globalThis.localStorage;
    if (!s) return 0;
    const llaves = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIJO)) llaves.push(k); }
    llaves.forEach(k => s.removeItem(k));
    return llaves.length;
  } catch (_) { return 0; }
}

// Qué cuenta como buscador de una pantalla.
const ES_BUSCADOR = 'input[type="search"], input[data-recientes], input[id*="search" i], input[id*="busca" i], input[placeholder^="Buscar"], input[placeholder^="Busca "]';
const esCandidato = el => el instanceof HTMLInputElement
  && el.matches(ES_BUSCADOR)
  && !el.matches('#shellSearch, [data-sin-recientes], [type="password"], [type="email"], [type="tel"], [type="date"], [type="number"]')
  && !el.closest('.tos-search-box');

const ICONO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

let estilos = false;
function ponEstilos(doc) {
  if (estilos || doc.getElementById('tosRecientesCss')) { estilos = true; return; }
  estilos = true;
  const st = doc.createElement('style');
  st.id = 'tosRecientesCss';
  st.textContent = `.tos-recientes{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 4px}
.tos-recientes[hidden]{display:none}
.tos-recientes>span{flex:1 0 100%;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7d8c91}
.tos-recientes button{display:inline-flex;align-items:center;gap:5px;min-height:34px;max-width:100%;padding:0 12px;border:1px solid #d6dfdd;border-radius:999px;background:#fff;color:#0d2730;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tos-recientes button svg{flex:0 0 auto;color:#7d8c91}
.tos-recientes button.tos-rec-borra{border:0;background:none;color:#056c7f;font-weight:800;padding:0 6px}`;
  doc.head.appendChild(st);
}

/* Conecta un buscador. Devuelve false si ya estaba conectado o no aplica. */
export function conecta(input, { org, usuario, storage, doc = input?.ownerDocument, pantalla = doc?.defaultView?.location?.pathname } = {}) {
  if (!esCandidato(input) || input.dataset.recientesListo) return false;
  input.dataset.recientesListo = '1';
  const s = storage || doc.defaultView.localStorage;
  const campo = input.id || input.name || input.getAttribute('placeholder') || 'buscar';
  const k = llave(org, usuario, pantalla, campo);
  const lee = () => { try { return vigentes(JSON.parse(s.getItem(k) || '[]')); } catch (_) { return []; } };
  const escribe = l => { try { if (l.length) s.setItem(k, JSON.stringify(l)); else s.removeItem(k); } catch (_) { /* modo privado */ } };
  const guarda = () => { const v = input.value; if (normaliza(v).length >= MIN) escribe(agrega(lee(), v)); };

  ponEstilos(doc);
  const caja = doc.createElement('div');
  caja.className = 'tos-recientes';
  caja.hidden = true;
  caja.setAttribute('aria-label', 'Búsquedas recientes');
  // Debajo del campo (o de su envoltura, para no romper su diseño).
  const ancla = input.closest('.tsearch, .tsearch-field, .tos-busca, label') || input;
  ancla.insertAdjacentElement('afterend', caja);

  const pinta = () => {
    const l = lee();
    const mostrar = l.length && !input.value.trim() && doc.activeElement === input;
    if (!mostrar) { caja.hidden = true; return; }
    caja.innerHTML = '<span>Recientes</span>';
    l.forEach(x => {
      const b = doc.createElement('button');
      b.type = 'button'; b.dataset.reciente = x.t; b.innerHTML = ICONO; b.append(x.t);
      caja.appendChild(b);
    });
    const borra = doc.createElement('button');
    borra.type = 'button'; borra.className = 'tos-rec-borra'; borra.textContent = 'Borrar';
    caja.appendChild(borra);
    caja.hidden = false;
  };

  // pointerdown + preventDefault: tocar un reciente no le quita el foco al
  // campo (si no, el blur escondería la lista antes del clic).
  caja.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  caja.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('tos-rec-borra')) { escribe([]); caja.hidden = true; input.focus(); return; }
    input.value = b.dataset.reciente;
    caja.hidden = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    escribe(agrega(lee(), input.value));
    input.focus();
  });

  let pausa = null;
  input.addEventListener('focus', pinta);
  input.addEventListener('input', () => {
    pinta();
    clearTimeout(pausa);
    // Se guarda cuando deja de teclear: así cuenta aunque no le dé Enter.
    pausa = setTimeout(guarda, 1500);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(pausa); guarda(); } });
  input.addEventListener('blur', () => { clearTimeout(pausa); guarda(); setTimeout(() => { if (doc.activeElement !== input) caja.hidden = true; }, 120); });
  input.addEventListener('search', () => pinta()); // la "x" nativa del campo
  return true;
}

/* Conecta todos los buscadores de la pantalla, también los que aparecen
   después (hojas, pestañas que se pintan al abrir). */
export function instala({ org, usuario, doc = globalThis.document, storage } = {}) {
  if (!doc?.body || doc.__tosRecientes) return;
  doc.__tosRecientes = true;
  const opciones = { org, usuario, doc, storage };
  const barre = raiz => {
    if (raiz instanceof HTMLInputElement) conecta(raiz, opciones);
    raiz.querySelectorAll?.('input').forEach(i => conecta(i, opciones));
  };
  barre(doc.body);
  new MutationObserver(cambios => {
    for (const c of cambios) c.addedNodes.forEach(n => { if (n.nodeType === 1) barre(n); });
  }).observe(doc.body, { childList: true, subtree: true });
}
