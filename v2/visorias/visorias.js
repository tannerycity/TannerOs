/* Lo de la visoría que no toca la pantalla (29/10/2026): edades, conteos y
 * filtros. Sin DOM: se prueba con node. */
export const LIGA_PUBLICA = 'https://app.tannerycity.com/visoria';

export function edad(fecha, hoy = new Date()) {
  if (!fecha) return null;
  const n = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  let a = hoy.getFullYear() - n.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a;
}
export const anioDe = fecha => (fecha ? Number(String(fecha).slice(0, 4)) || null : null);

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Todos, los que llegaron o los que faltan; y lo que se escribe en el buscador. */
export function filtra(items = [], { ver = 'todos', busca = '' } = {}) {
  const q = normaliza(busca).trim();
  return items.filter(x => (ver === 'llegaron' ? !!x.arrivedAt : ver === 'faltan' ? !x.arrivedAt : true)
    && (!q || normaliza([x.firstName, x.lastName, x.folio, x.school, x.category].join(' ')).includes(q)));
}

/* Cuántos por año de nacimiento, de mayor a menor: "2014 · 6". */
export function porAnio(items = []) {
  const m = new Map();
  items.forEach(x => { const a = anioDe(x.birthDate); if (a) m.set(a, (m.get(a) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([anio, n]) => ({ anio, n }));
}

/* De dónde llegaron: Instagram, WhatsApp, Recomendación… */
export function porCanal(items = []) {
  const m = new Map();
  items.forEach(x => { const c = x.channel || 'Sin dato'; m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([canal, n]) => ({ canal, n }));
}

export const PIERNA = { right: 'Derecha', left: 'Izquierda', both: 'Las dos' };
export const DECISIONES = [
  { k: 'invite', t: 'Invitar a prueba', verdict: 'Invitar a prueba', interest: 'alto' },
  { k: 'follow', t: 'Volver a observar', verdict: 'Volver a observar', interest: 'medio' },
  { k: 'reject', t: 'No por ahora', verdict: 'No continuar', interest: 'bajo' }];

export function textoParaCompartir(c = {}) {
  return `${c.title || 'Visoría'}${c.datesLabel ? ` · ${c.datesLabel}` : ''}. Sin costo y con cupo limitado. Inscribe a tu hijo aquí: ${LIGA_PUBLICA}`;
}
