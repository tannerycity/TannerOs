// Cobranza sencilla (08/11/2026, h66): las cuentas y los textos, sin pantalla.
// Se prueban solos en scripts/qa-cobranza-sencilla.mjs.

const MES = new Intl.DateTimeFormat('es-MX', { month: 'long' });

// El resumen del mes: % cobrado y las cuatro cifras.
export function resumenCobranza(t) {
  if (!t) return null;
  const esperado = Number(t.expected || 0), cobrado = Number(t.collected || 0);
  const mes = t.month ? MES.format(new Date(`${String(t.month).slice(0, 10)}T12:00:00`)) : 'este mes';
  return {
    mes,
    esperado, cobrado,
    porVencer: Number(t.upcoming || 0),
    atrasado: Number(t.overdue || 0),
    pct: esperado > 0 ? Math.round((100 * cobrado) / esperado) : 0,
  };
}

// Filtros: Todos / Atrasados / Por vencer / Al día / Con acuerdo, y buscar.
// Atrasados primero (lo más viejo arriba), luego por vencer y al día.
export function filtraCobranza(players, { filtro = 'all', busca = '', norm = s => String(s || '').toLowerCase(), acuerdos = new Map() } = {}) {
  const orden = { atrasado: 0, por_vencer: 1, al_dia: 2 };
  return (players || [])
    .filter(p => !busca || norm(p.name).includes(busca) || norm(p.guardian).includes(busca))
    .filter(p => filtro === 'all' ? true : filtro === 'agreement' ? acuerdos.has(p.playerId) : p.state === filtro)
    .sort((a, b) => (orden[a.state] - orden[b.state])
      || String(a.oldestDue || '9999').localeCompare(String(b.oldestDue || '9999'))
      || String(a.name || '').localeCompare(String(b.name || ''), 'es-MX'));
}

// Una línea que dice lo que importa de cada familia.
export function textoEstado(p, fecha, money) {
  const f = d => (d ? fecha(d) : '');
  if (p.state === 'atrasado') {
    return `Debe ${money.format(Number(p.overdue || 0))}${p.oldestDue ? ` desde el ${f(p.oldestDue)}` : ''}${p.guardian ? ` · ${p.guardian}` : ''}`;
  }
  if (p.state === 'por_vencer') {
    return `${money.format(Number(p.upcoming || 0))} vence el ${f(p.nextDue)}${p.guardian ? ` · ${p.guardian}` : ''}`;
  }
  return p.lastPayment ? `Al día · último pago ${f(p.lastPayment)}` : 'Al día';
}
