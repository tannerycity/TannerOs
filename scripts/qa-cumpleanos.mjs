/* Cumpleaños del año (21/10/2026): Zul quiere la lista anual y mensual para
 * planear. Se prueba la lógica de v2/cumpleanos/cumpleanos.js sin pantalla:
 * los doce meses en orden de día, los filtros (jugadores, staff, categoría,
 * nombre sin acentos), el día de la semana y el CSV que abre en Excel. */
import assert from 'node:assert/strict';
import { MESES, filtra, porMes, categorias, diaTexto, queCumple, csv } from '../v2/cumpleanos/cumpleanos.js';

const GENTE = [
  { kind:'player', name:'Milán Beltrán', firstName:'Milán', detail:'T6', day:'2026-01-01', turns:7 },
  { kind:'player', name:'Ana Ruiz', firstName:'Ana', detail:'T10', day:'2026-10-21', turns:10 },
  { kind:'staff', name:'Zul', firstName:'Zul', detail:'Operaciones', day:'2026-10-04', turns:null },
  { kind:'player', name:'Leo, "el 7"', firstName:'Leo', detail:'T10', day:'2026-10-04', turns:9 }
];
let corridas = 0, fallos = 0;
const prueba = (n, f) => { corridas++; try { f(); } catch (e) { fallos++; console.error(` - ${n}: ${e.message}`); } };

prueba('doce meses', () => assert.equal(MESES.length, 12));
prueba('cada quien en su mes, en orden de día', () => {
  const m = porMes(GENTE);
  assert.deepEqual(m[0].map(p => p.firstName), ['Milán']);
  assert.deepEqual(m[9].map(p => p.firstName), ['Leo', 'Zul', 'Ana']);
  assert.equal(m.reduce((s, x) => s + x.length, 0), 4);
});
prueba('sólo jugadores, sólo staff', () => {
  assert.equal(filtra(GENTE, { quien:'player' }).length, 3);
  assert.deepEqual(filtra(GENTE, { quien:'staff' }).map(p => p.name), ['Zul']);
});
prueba('por categoría deja fuera al staff', () => assert.deepEqual(filtra(GENTE, { categoria:'T10' }).map(p => p.firstName), ['Ana', 'Leo']));
prueba('busca sin acentos', () => assert.deepEqual(filtra(GENTE, { q:'milan' }).map(p => p.firstName), ['Milán']));
prueba('categorías en orden natural', () => assert.deepEqual(categorias(GENTE), ['T6', 'T10']));
prueba('día de la semana', () => { assert.equal(diaTexto('2026-10-21'), 'Mié 21'); assert.equal(diaTexto('2026-01-01'), 'Jue 1'); });
prueba('qué cumple', () => { assert.equal(queCumple(GENTE[1]), 'T10 · cumple 10'); assert.equal(queCumple(GENTE[2]), 'Operaciones'); });
prueba('CSV para Excel: BOM, encabezado y comillas', () => {
  const t = csv(GENTE);
  assert.ok(t.startsWith('﻿Fecha,Día,Nombre'));
  assert.ok(t.includes('"Leo, ""el 7"""'));
  assert.ok(t.includes('2026-10-04,Dom 4,Zul,Staff,Operaciones,'));
});

console.log(fallos ? `Cumpleaños QA FAILED · ${fallos} de ${corridas}` : `Cumpleaños QA OK · ${corridas} casos: año por meses, filtros y Excel`);
process.exit(fallos ? 1 : 0);
