// Portal de becados: el criterio (v2/becas/becas.js), sin navegador.
import assert from 'node:assert/strict';
import { META_BECA, tipoDe, cuantoCubre, cumplimiento, vencimiento, porVencer, debajoDeMeta, FILTROS, resumen, ordena }
  from '../v2/becas/becas.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

prueba('la meta de los becados es 90%', () => assert.equal(META_BECA, 90));

prueba('cada tipo de beca tiene nombre en español', () => {
  assert.equal(tipoDe('scholarship_full').etiqueta, 'Beca total');
  assert.equal(tipoDe('scholarship_partial').etiqueta, 'Beca parcial');
  assert.equal(tipoDe('sponsor_funded').etiqueta, 'Patrocinio');
  assert.equal(tipoDe('raro').etiqueta, 'Apoyo');
});

prueba('cuánto cubre: total, porcentaje, monto o falta anotar', () => {
  assert.equal(cuantoCubre({ calculation: 'full_waiver', percentage: null }), '100%');
  assert.equal(cuantoCubre({ calculation: 'informational', percentage: 50 }), '50%');
  assert.match(cuantoCubre({ calculation: 'fixed_amount', fixedAmount: 800 }), /\$800/);
  assert.equal(cuantoCubre({ calculation: 'informational', percentage: null, fixedAmount: null }), null);
});

prueba('sin listas no hay rojo: a quien nadie le pasó lista no se le culpa', () => {
  assert.equal(cumplimiento(null).nivel, 'sindato');
  assert.equal(debajoDeMeta({ pct: null }), false);
});

prueba('semáforo contra 90%', () => {
  assert.equal(cumplimiento(90).nivel, 'ok');
  assert.equal(cumplimiento(80).nivel, 'atencion');
  assert.equal(cumplimiento(66.7).nivel, 'bajo');
  assert.equal(debajoDeMeta({ pct: 89.9 }), true);
  assert.equal(debajoDeMeta({ pct: 90 }), false);
});

prueba('vencimientos: sin fecha, lejos, pronto, vencida', () => {
  assert.equal(vencimiento(null).texto, 'Sin fecha de fin');
  assert.equal(vencimiento(83).nivel, 'ok');
  assert.equal(vencimiento(45).nivel, 'atencion');
  assert.equal(vencimiento(12).nivel, 'bajo');
  assert.equal(vencimiento(1).texto, 'Vence en 1 día');
  assert.equal(vencimiento(-3).texto, 'Vencida');
  assert.equal(porVencer({ daysLeft: 60 }), true);
  assert.equal(porVencer({ daysLeft: 61 }), false);
  assert.equal(porVencer({ daysLeft: null }), false);
});

const FILAS = [
  { name: 'Zoe', type: 'scholarship_full', pct: 95, marked: 20, attended: 19, daysLeft: 200, notes: 'Talento' },
  { name: 'Ana', type: 'scholarship_partial', pct: 50, marked: 4, attended: 2, daysLeft: 300, notes: null },
  { name: 'Beto', type: 'scholarship_partial', pct: 33.3, marked: 3, attended: 1, daysLeft: null, notes: 'x' },
  { name: 'Ciro', type: 'sponsor_funded', pct: null, marked: 0, attended: 0, daysLeft: 20, notes: 'y' }
];

prueba('el resumen cuenta tipos, debajo de meta, por vencer y sin motivo', () => {
  const r = resumen(FILAS);
  assert.equal(r.total, 4);
  assert.equal(r.totales, 1);
  assert.equal(r.parciales, 2);
  assert.equal(r.patrocinio, 1);
  assert.equal(r.debajo, 2);
  assert.equal(r.vencen, 1);
  assert.equal(r.sinMotivo, 1);
  // 22 de 27 marcadas: el que no tiene listas no baja el promedio.
  assert.equal(r.pct, 81.5);
});

prueba('primero lo que hay que atender: el más bajo arriba, luego por vencer', () => {
  assert.deepEqual(ordena(FILAS).map(b => b.name), ['Beto', 'Ana', 'Ciro', 'Zoe']);
});

prueba('los filtros separan bien', () => {
  const f = clave => FILTROS.find(x => x.clave === clave);
  assert.deepEqual(FILAS.filter(f('debajo').pasa).map(b => b.name), ['Ana', 'Beto']);
  assert.deepEqual(FILAS.filter(f('vencen').pasa).map(b => b.name), ['Ciro']);
  assert.deepEqual(FILAS.filter(f('sponsor_funded').pasa).map(b => b.name), ['Ciro']);
  assert.equal(FILAS.filter(f('todos').pasa).length, 4);
});

if (fallos) { console.error(`Becas QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Becas QA OK · ${corridas} casos: tipos, cuánto cubre, semáforo contra 90%, vencimientos y orden`);
