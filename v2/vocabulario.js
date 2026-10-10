/* Cómo le dice el club a sus jugadores.
   La app nació en Tannery, donde a un jugador se le dice "Tanner": está en
   ~500 textos. Otro club dice "Jugador" (o "Halcón", o lo que elija en Marca y
   apariencia: branding.playerNoun). En vez de tocar cada texto, esta capa
   cambia la palabra en lo que se VE y en lo que SALE (WhatsApp, portapapeles,
   compartir). Si el club dice "Tanner", no hace nada.

   No toca: códigos como "Tanner010" ni "TannerOS" (no son la palabra sola),
   lo que la persona escribe (inputs, textareas) ni lo marcado con
   data-sin-vocabulario. */

const TANNERY = { singular: 'Tanner', plural: 'Tanners' };

export function vocabularioValido(v) {
  const ok = s => typeof s === 'string' && /^\p{L}[\p{L} ]{1,23}$/u.test(s.trim());
  return v && ok(v.singular) && ok(v.plural) ? { singular: v.singular.trim(), plural: v.plural.trim() } : null;
}

export function esDeTannery(v) {
  return !v || v.singular === TANNERY.singular;
}

const minus = s => s.charAt(0).toLocaleLowerCase('es-MX') + s.slice(1);
const mayus = s => s.charAt(0).toLocaleUpperCase('es-MX') + s.slice(1);

// "Buscar Tanner" -> "Buscar jugador"; "Tanners activos" -> "Jugadores activos";
// "TANNERS" -> "JUGADORES"; "Centro Tanner" -> "Centro del club".
export function traduce(texto, v) {
  if (!texto || esDeTannery(v) || !/Tanner|TANNER/.test(texto)) return texto;
  return String(texto)
    .replace(/\bCentro Tanner\b/g, 'Centro del club')
    .replace(/\bCENTRO TANNER\b/g, 'CENTRO DEL CLUB')
    .replace(/\bTANNERS\b/g, v.plural.toLocaleUpperCase('es-MX'))
    .replace(/\bTANNER\b/g, v.singular.toLocaleUpperCase('es-MX'))
    .replace(/\b(Tanners?)\b/g, (m, _p, i, s) => {
      const palabra = m === 'Tanners' ? v.plural : v.singular;
      // Mayúscula sólo al empezar el texto o una oración.
      const antes = s.slice(0, i);
      return /(^|[.!?¡¿:\n]\s*)$/.test(antes) || antes.trim() === '' ? mayus(palabra) : minus(palabra);
    });
}

const SALTA = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT', 'CODE']);
const ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt'];

function saltar(el) {
  return !el || SALTA.has(el.tagName) || el.isContentEditable || el.closest?.('[data-sin-vocabulario]');
}

export function aplicaEn(raiz, v) {
  if (esDeTannery(v) || !raiz) return;
  const doc = raiz.ownerDocument || raiz;
  if (raiz.nodeType === 3) { if (!saltar(raiz.parentElement)) { const t = traduce(raiz.nodeValue, v); if (t !== raiz.nodeValue) raiz.nodeValue = t; } return; }
  if (raiz.nodeType !== 1 && raiz.nodeType !== 9) return;
  const recorre = doc.createTreeWalker(raiz, 4);
  for (let n = recorre.nextNode(); n; n = recorre.nextNode()) {
    if (saltar(n.parentElement)) continue;
    const t = traduce(n.nodeValue, v);
    if (t !== n.nodeValue) n.nodeValue = t;
  }
  const els = raiz.nodeType === 1 ? [raiz, ...raiz.querySelectorAll('*')] : [...raiz.querySelectorAll('*')];
  for (const el of els) {
    if (el.closest?.('[data-sin-vocabulario]')) continue;
    for (const a of ATRIBUTOS) {
      const val = el.getAttribute?.(a);
      if (val && /Tanner|TANNER/.test(val)) { const t = traduce(val, v); if (t !== val) el.setAttribute(a, t); }
    }
  }
}

// El texto de una liga de WhatsApp (?text=) también.
export function traduceLiga(url, v) {
  if (esDeTannery(v) || !/wa\.me|whatsapp\.com/.test(String(url))) return url;
  try {
    const u = new URL(url, globalThis.location?.href);
    const t = u.searchParams.get('text');
    if (t) u.searchParams.set('text', traduce(t, v));
    return u.toString();
  } catch { return url; }
}

let activo = null;
export function instalaVocabulario(entrada, win = globalThis.window) {
  const v = vocabularioValido(entrada);
  if (!v || esDeTannery(v) || !win?.document) return false;
  const primera = !activo;
  activo = v;
  const doc = win.document;
  aplicaEn(doc.body || doc, v);
  doc.title = traduce(doc.title, v);
  if (!primera) return true;

  new win.MutationObserver(cambios => {
    for (const c of cambios) {
      if (c.type === 'characterData') aplicaEn(c.target, activo);
      else if (c.type === 'attributes') aplicaEn(c.target, activo);
      else c.addedNodes.forEach(n => aplicaEn(n, activo));
    }
  }).observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });

  // Lo que sale: ligas de WhatsApp, ventanas, portapapeles y compartir.
  doc.addEventListener('click', e => {
    const a = e.target?.closest?.('a[href]');
    if (a && /wa\.me|whatsapp\.com/.test(a.href)) a.href = traduceLiga(a.href, activo);
  }, true);
  const abre = win.open?.bind(win);
  if (abre) win.open = (url, ...resto) => abre(traduceLiga(url, activo), ...resto);
  const cb = win.navigator?.clipboard;
  if (cb?.writeText) { const escribe = cb.writeText.bind(cb); try { cb.writeText = t => escribe(traduce(String(t), activo)); } catch {} }
  const comparte = win.navigator?.share?.bind(win.navigator);
  if (comparte) { try { win.navigator.share = d => comparte({ ...d, ...(d?.text ? { text: traduce(d.text, activo) } : {}), ...(d?.title ? { title: traduce(d.title, activo) } : {}) }); } catch {} }
  return true;
}
