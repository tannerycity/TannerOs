/* Banco de ideas (22/10/2026): tablero tipo Notion para darle seguimiento.
 * Se prueba la lógica de v2/ideas/ideas.js sin pantalla: columnas, filtros
 * (mías, área, búsqueda sin acentos), orden al soltar una tarjeta entre dos,
 * fechas por vencer y avance de pendientes. */
import assert from 'node:assert/strict';
import { COLUMNAS, filtra, porColumna, posicionEntre, vence, progreso, tonoDeArea, iniciales } from '../v2/ideas/ideas.js';

let corridas = 0, fallos = 0;
const prueba = (n, f) => { corridas++; try { f(); } catch (e) { fallos++; console.error(` - ${n}: ${e.message}`); } };
const IDEAS = [
  { id: 'a', title: 'Jerseys navideños', area: 'Marketing', status: 'idea', position: 0, ownerId: 'mich', createdBy: 'zul' },
  { id: 'b', title: 'Campaña de patrocinios', area: 'Patrocinios', status: 'todo', position: 2, ownerId: 'zul', createdBy: 'mich' },
  { id: 'c', title: 'Torneo relámpago', area: 'Eventos', status: 'todo', position: 1, ownerId: null, createdBy: 'zul', notes: 'Pedir árbitros' },
  { id: 'd', title: 'Reel del partido', area: 'Redes', status: 'done', position: 0, ownerId: 'zul' }
];

prueba('cuatro columnas en orden', () => assert.deepEqual(COLUMNAS.map(c => c.t), ['Ideas', 'Por hacer', 'En proceso', 'Hecho']));
prueba('cada idea en su columna y en su orden', () => {
  const c = porColumna(IDEAS);
  assert.deepEqual(c.todo.map(i => i.id), ['c', 'b']);
  assert.equal(c.doing.length, 0); assert.equal(c.done.length, 1);
});
prueba('mías: las que tengo a cargo, o las que creé sin responsable', () => assert.deepEqual(filtra(IDEAS, { mias: true, me: 'zul' }).map(i => i.id), ['b', 'c', 'd']));
prueba('por área', () => assert.deepEqual(filtra(IDEAS, { area: 'Eventos' }).map(i => i.id), ['c']));
prueba('busca también en las notas, sin acentos', () => assert.deepEqual(filtra(IDEAS, { q: 'arbitros' }).map(i => i.id), ['c']));
prueba('soltar entre dos queda a la mitad; a la orilla, uno más allá', () => {
  assert.equal(posicionEntre(1, 2), 1.5); assert.equal(posicionEntre(null, 2), 1); assert.equal(posicionEntre(3, null), 4); assert.equal(posicionEntre(null, null), 0);
});
prueba('fechas: vencida, pronto, a tiempo; lo hecho no vence', () => {
  assert.equal(vence('2026-10-20', '2026-10-22', 'todo'), 'vencida');
  assert.equal(vence('2026-10-24', '2026-10-22', 'todo'), 'pronto');
  assert.equal(vence('2026-11-30', '2026-10-22', 'todo'), null);
  assert.equal(vence('2026-10-20', '2026-10-22', 'done'), null);
});
prueba('avance de pendientes', () => assert.deepEqual(progreso([{ done: true }, { done: false }, { done: true }]), { hechos: 2, total: 3 }));
prueba('cada área su color, siempre el mismo', () => { assert.equal(tonoDeArea('Marketing'), tonoDeArea('Marketing')); assert.notEqual(tonoDeArea('Marketing'), tonoDeArea('Redes')); });
prueba('iniciales del responsable', () => { assert.equal(iniciales('Zul García'), 'ZG'); assert.equal(iniciales(''), '·'); });

console.log(fallos ? `Ideas QA FAILED · ${fallos} de ${corridas}` : `Ideas QA OK · ${corridas} casos: columnas, filtros, orden al arrastrar, fechas y pendientes`);
process.exit(fallos ? 1 : 0);
