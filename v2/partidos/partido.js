/* Partidos: el criterio, sin DOM (scripts/qa-partidos.mjs lo prueba).
 *
 * Presidencia (09/10/2026): quién jugó, quién asistió, quién metió gol, quién
 * dio asistencia, el marcador, contra quién y qué liga. "Jugó" no pide
 * minutos: medio tiempo o más / menos / no jugó / no llegó.
 */
export const TIPOS = ['Liga Fit León', 'Amistoso', 'Torneo', 'Copa'];

export const TIEMPOS = {
  medio: { etiqueta: 'Medio tiempo +', corta: 'Medio +', jugo: true },
  poco: { etiqueta: 'Menos de medio', corta: 'Poco', jugo: true },
  no_jugo: { etiqueta: 'No jugó', corta: 'No jugó', jugo: false },
  no_llego: { etiqueta: 'No llegó', corta: 'No llegó', jugo: false }
};
export const jugo = t => Boolean(TIEMPOS[t]?.jugo);

// Un toque: medio -> poco -> no jugó -> medio. "No llegó" va por "···".
export function siguienteTiempo(t) {
  if (t === 'medio') return 'poco';
  if (t === 'poco') return 'no_jugo';
  return 'medio';
}

export function resultado(gf, ga) {
  const a = Number(gf || 0), b = Number(ga || 0);
  if (a > b) return { letra: 'G', nivel: 'ok', texto: 'Ganamos' };
  if (a < b) return { letra: 'P', nivel: 'bajo', texto: 'Perdimos' };
  return { letra: 'E', nivel: 'atencion', texto: 'Empate' };
}

// Goles y asistencias de cada Tanner salen de la lista de goles.
export function cuentaPorJugador(goles) {
  const m = new Map();
  for (const g of goles || []) {
    if (g?.scorer) { const x = m.get(g.scorer) || { goles: 0, asist: 0 }; x.goles++; m.set(g.scorer, x); }
    if (g?.assist) { const x = m.get(g.assist) || { goles: 0, asist: 0 }; x.asist++; m.set(g.assist, x); }
  }
  return m;
}
export const participaEnGoles = (goles, id) => (goles || []).some(g => g?.scorer === id || g?.assist === id);

// La primera vez que se abre un partido sin convocatoria guardada, van todos
// y todos jugaron medio tiempo o más: el profe sólo toca las excepciones.
export function preparaPlantel(roster, guardado) {
  return (roster || []).map(p => guardado
    ? { ...p, called: Boolean(p.called), tiempo: p.called ? (p.tiempo || 'medio') : (p.tiempo || 'medio') }
    : { ...p, called: true, tiempo: 'medio' });
}

export function hojaParaGuardar({ partido, plantel, goles, golesContra, estado }) {
  return {
    id: partido.id || null,
    date: partido.date,
    category: partido.category,
    opponent: partido.opponent,
    tournament: partido.tournament || null,
    venue: partido.venue || null,
    status: estado || partido.status || 'scheduled',
    goalsAgainst: Math.max(0, Number(golesContra || 0)),
    goals: (goles || []).map(g => ({ scorer: g.scorer || null, assist: g.scorer ? (g.assist || null) : null })),
    players: (plantel || []).map(p => ({
      playerId: p.playerId, called: Boolean(p.called), tiempo: p.called ? (p.tiempo || 'medio') : 'medio',
      yellow: Number(p.yellow || 0), red: Number(p.red || 0)
    }))
  };
}

// === Estadísticas ===
export function goleadores(jugadores, campo = 'goals', n = 5) {
  return [...(jugadores || [])].filter(j => Number(j[campo]) > 0)
    .sort((a, b) => Number(b[campo]) - Number(a[campo]) || Number(b.played) - Number(a.played) || String(a.name).localeCompare(String(b.name), 'es'))
    .slice(0, n);
}

// Quién juega poco: de los partidos a los que fue, en cuántos jugó medio
// tiempo o más. Los que nunca fueron convocados salen aparte.
export function juegaPoco(jugadores) {
  return [...(jugadores || [])]
    .filter(j => Number(j.called) - Number(j.noShow) > 0)
    .map(j => ({ ...j, llego: Number(j.called) - Number(j.noShow), pctMedio: Math.round(100 * Number(j.half) / (Number(j.called) - Number(j.noShow))) }))
    .filter(j => j.pctMedio < 50)
    .sort((a, b) => a.pctMedio - b.pctMedio || String(a.name).localeCompare(String(b.name), 'es'));
}
export const sinJugar = jugadores => (jugadores || []).filter(j => Number(j.categoryMatches) > 0 && Number(j.played) === 0)
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
