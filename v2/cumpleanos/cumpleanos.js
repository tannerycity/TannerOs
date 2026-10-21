// Lo que se calcula de los cumpleaños, sin pantalla (se prueba con node).

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const sinAcentos = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mesDe = dia => Number(String(dia || '').slice(5, 7)) - 1;

export function filtra(gente, { quien = 'todos', categoria = '', q = '' } = {}) {
  const busca = sinAcentos(q).trim();
  return (gente || []).filter(p =>
    (quien === 'todos' || p.kind === quien)
    && (!categoria || (p.kind === 'player' && p.detail === categoria))
    && (!busca || sinAcentos(p.name).includes(busca)));
}

// Doce listas, en orden de día.
export function porMes(gente) {
  const meses = MESES.map(() => []);
  for (const p of gente || []) { const m = mesDe(p.day); if (m >= 0 && m < 12) meses[m].push(p); }
  for (const m of meses) m.sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.name).localeCompare(String(b.name), 'es'));
  return meses;
}

export function categorias(gente) {
  return [...new Set((gente || []).filter(p => p.kind === 'player').map(p => p.detail).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

// "Sáb 4" para el día; el año viene en la fecha.
export function diaTexto(dia) {
  const [y, m, d] = String(dia).slice(0, 10).split('-').map(Number);
  if (!y) return '';
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}

export function queCumple(p) {
  if (p.kind !== 'player' || p.turns == null) return p.detail || '';
  return `${p.detail} · cumple ${p.turns}`;
}

const celda = v => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function csv(gente) {
  const filas = [['Fecha', 'Día', 'Nombre', 'Tipo', 'Categoría o rol', 'Cumple']];
  for (const p of gente) filas.push([String(p.day).slice(0, 10), diaTexto(p.day), p.name, p.kind === 'player' ? 'Jugador' : 'Staff', p.detail, p.kind === 'player' ? p.turns : '']);
  return '﻿' + filas.map(f => f.map(celda).join(',')).join('\n');
}
