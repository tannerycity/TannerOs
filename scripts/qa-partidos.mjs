// Partidos: el criterio (v2/partidos/partido.js), sin navegador.
import assert from 'node:assert/strict';
import { TIPOS, TIEMPOS, jugo, siguienteTiempo, resultado, cuentaPorJugador, participaEnGoles,
         preparaPlantel, hojaParaGuardar, goleadores, juegaPoco, sinJugar } from '../v2/partidos/partido.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

prueba('los tipos de partido que juega el club', () => assert.deepEqual(TIPOS, ['Liga Fit León', 'Amistoso', 'Torneo', 'Copa']));

prueba('jugó = medio tiempo o más, o menos; no jugó y no llegó no cuentan', () => {
  assert.equal(jugo('medio'), true); assert.equal(jugo('poco'), true);
  assert.equal(jugo('no_jugo'), false); assert.equal(jugo('no_llego'), false);
  assert.equal(Object.keys(TIEMPOS).length, 4);
});

prueba('un toque: medio, poco, no jugó y regresa a medio', () => {
  assert.equal(siguienteTiempo('medio'), 'poco');
  assert.equal(siguienteTiempo('poco'), 'no_jugo');
  assert.equal(siguienteTiempo('no_jugo'), 'medio');
  assert.equal(siguienteTiempo('no_llego'), 'medio');
});

prueba('resultado G, E, P', () => {
  assert.equal(resultado(3, 1).letra, 'G');
  assert.equal(resultado(1, 1).letra, 'E');
  assert.equal(resultado(0, 2).letra, 'P');
});

prueba('goles y asistencias por jugador salen de la lista de goles', () => {
  const m = cuentaPorJugador([{ scorer: 'a', assist: 'b' }, { scorer: 'a' }, { scorer: null }]);
  assert.deepEqual(m.get('a'), { goles: 2, asist: 0 });
  assert.deepEqual(m.get('b'), { goles: 0, asist: 1 });
  assert.equal(participaEnGoles([{ scorer: 'a', assist: 'b' }], 'b'), true);
  assert.equal(participaEnGoles([{ scorer: 'a', assist: 'b' }], 'c'), false);
});

prueba('partido nuevo: todos convocados y con medio tiempo de entrada', () => {
  const p = preparaPlantel([{ playerId: 'a', called: false, tiempo: null }, { playerId: 'b' }], false);
  assert.ok(p.every(x => x.called && x.tiempo === 'medio'));
});

prueba('partido ya guardado: respeta lo que se capturó', () => {
  const p = preparaPlantel([{ playerId: 'a', called: true, tiempo: 'poco' }, { playerId: 'b', called: false, tiempo: null }], true);
  assert.deepEqual(p.map(x => [x.called, x.tiempo]), [[true, 'poco'], [false, 'medio']]);
});

prueba('la hoja que se guarda: marcador, goles y jugadores', () => {
  const h = hojaParaGuardar({
    partido: { id: 'm1', date: '2026-10-08', category: 'T10', opponent: 'Rival', tournament: 'Amistoso', venue: 'local' },
    plantel: [{ playerId: 'a', called: true, tiempo: 'medio', yellow: 1 }, { playerId: 'b', called: false, tiempo: 'no_llego' }],
    goles: [{ scorer: 'a', assist: null }, { scorer: null, assist: 'x' }], golesContra: -2, estado: 'completed'
  });
  assert.equal(h.status, 'completed');
  assert.equal(h.goalsAgainst, 0);
  assert.deepEqual(h.goals, [{ scorer: 'a', assist: null }, { scorer: null, assist: null }]);
  assert.deepEqual(h.players[1], { playerId: 'b', called: false, tiempo: 'medio', yellow: 0, red: 0 });
});

const J = [
  { name: 'Ana', goals: 3, assists: 0, played: 3, called: 3, noShow: 0, half: 3, categoryMatches: 3 },
  { name: 'Beto', goals: 1, assists: 2, played: 2, called: 3, noShow: 1, half: 0, categoryMatches: 3 },
  { name: 'Ciro', goals: 0, assists: 0, played: 0, called: 0, noShow: 0, half: 0, categoryMatches: 3 },
  { name: 'Dani', goals: 3, assists: 1, played: 2, called: 2, noShow: 0, half: 2, categoryMatches: 3 }
];
prueba('goleadores y asistidores, de más a menos', () => {
  assert.deepEqual(goleadores(J).map(j => j.name), ['Ana', 'Dani', 'Beto']);
  assert.deepEqual(goleadores(J, 'assists').map(j => j.name), ['Beto', 'Dani']);
});
prueba('juega poco: menos de la mitad de sus partidos con medio tiempo', () => {
  const l = juegaPoco(J);
  assert.deepEqual(l.map(j => j.name), ['Beto']);
  assert.equal(l[0].pctMedio, 0);
  assert.equal(l[0].llego, 2);
});
prueba('sin jugar: nunca entró en los partidos de su categoría', () => assert.deepEqual(sinJugar(J).map(j => j.name), ['Ciro']));

if (fallos) { console.error(`Partidos QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Partidos QA OK · ${corridas} casos: tiempos, un toque, resultado, goles por jugador, hoja y estadísticas`);
