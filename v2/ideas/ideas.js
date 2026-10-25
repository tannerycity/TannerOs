// El banco de ideas sin pantalla (se prueba con node): columnas, filtros,
// orden al arrastrar, fechas por vencer y avance de la lista de pendientes.

export const COLUMNAS = [
  { k: 'idea', t: 'Ideas', sub: 'Lo que se nos ocurre' },
  { k: 'todo', t: 'Por hacer', sub: 'Ya se decidió' },
  { k: 'doing', t: 'En proceso', sub: 'Alguien ya le está dando' },
  { k: 'done', t: 'Hecho', sub: 'Listo' }
];
export const AREAS = ['Marketing', 'Redes', 'Patrocinios', 'Tienda', 'Eventos', 'Club', 'Academia', 'Instalaciones'];
export const PRIORIDADES = [{ k: 'alta', t: 'Alta' }, { k: 'media', t: 'Media' }, { k: 'baja', t: 'Baja' }];

const sinAcentos = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtra(ideas, { q = '', mias = false, me = null, area = '' } = {}) {
  const busca = sinAcentos(q).trim();
  return (ideas || []).filter(i =>
    (!mias || i.ownerId === me || (!i.ownerId && i.createdBy === me))
    && (!area || i.area === area)
    && (!busca || sinAcentos(`${i.title} ${i.notes || ''} ${i.area || ''} ${i.ownerName || ''}`).includes(busca)));
}

// Cada columna en su orden (posición, luego la más nueva arriba).
export function porColumna(ideas) {
  const out = Object.fromEntries(COLUMNAS.map(c => [c.k, []]));
  for (const i of ideas || []) if (out[i.status]) out[i.status].push(i);
  for (const k of Object.keys(out)) out[k].sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return out;
}

// Dónde queda una tarjeta que se suelta entre dos: a la mitad, o a un lado.
export function posicionEntre(antes, despues) {
  const a = antes == null ? null : Number(antes), d = despues == null ? null : Number(despues);
  if (a == null && d == null) return 0;
  if (a == null) return d - 1;
  if (d == null) return a + 1;
  return (a + d) / 2;
}

// 'vencida' si ya pasó, 'pronto' si faltan 3 días o menos; lo hecho no vence.
export function vence(fecha, hoy, status) {
  if (!fecha || status === 'done') return null;
  const dias = Math.round((new Date(`${String(fecha).slice(0, 10)}T12:00:00`) - new Date(`${String(hoy).slice(0, 10)}T12:00:00`)) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias <= 3) return 'pronto';
  return null;
}

export function progreso(lista) {
  const l = Array.isArray(lista) ? lista : [];
  return { hechos: l.filter(x => x?.done).length, total: l.length };
}

// Un color fijo por área, para reconocerla de un vistazo.
const TONOS = ['#087d8e', '#9a6a12', '#3d4fa8', '#b13d34', '#1d7a46', '#7a3d9a', '#c25e00', '#4a6870'];
export function tonoDeArea(area) {
  const i = AREAS.indexOf(area);
  if (i >= 0) return TONOS[i % TONOS.length];
  let h = 0; for (const ch of String(area || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}

export const iniciales = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '·';

// Avisos en Inicio (25/10/2026, "sí hazlo"): lo que tengo a cargo y vence, y
// lo que alguien más me asignó y no he visto. "Visto" = estaba en la lista de
// ids que guardó el tablero la última vez que lo abrí.
export function avisosDeIdeas(ideas, me, hoy, vistas = []) {
  if (!me) return { vencidas: [], pronto: [], nuevas: [] };
  const mias = (ideas || []).filter(i => i.ownerId === me && i.status !== 'done' && i.status !== 'archived');
  const visto = new Set(vistas || []);
  return {
    vencidas: mias.filter(i => vence(i.dueDate, hoy, i.status) === 'vencida'),
    pronto: mias.filter(i => vence(i.dueDate, hoy, i.status) === 'pronto'),
    nuevas: mias.filter(i => i.createdBy !== me && !visto.has(i.id)),
  };
}
export const claveVistas = me => `tos-ideas-vistas:${me}`;
