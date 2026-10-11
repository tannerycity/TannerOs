// ¿Cómo nos conocieron? (v2/prospectos/origen.js), sin navegador.
import assert from 'node:assert/strict';
import { porMedio, porRecomendador, recomendoA } from '../v2/prospectos/origen.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }
const R = (referral_name, extra = {}) => ({ source_channel: 'Recomendación', referral_name, ...extra });

prueba('el mismo nombre escrito distinto cuenta junto', () => {
  const g = porRecomendador([R('Michel Enriquez'), R('michel enriquez'), R(' Michel  Enríquez ')]);
  assert.equal(g.length, 1); assert.equal(g[0].total, 3);
});
prueba('un solo nombre se suma al completo si sólo hay uno que empiece así', () => {
  const g = porRecomendador([R('Michel'), R('Michel Enriquez'), R('Crespo')]);
  assert.deepEqual(g.map(x => [x.nombre, x.total]), [['Michel Enriquez', 2], ['Crespo', 1]]);
});
prueba('si hay dos completos que empiezan igual, no adivina', () => {
  const g = porRecomendador([R('Ana'), R('Ana López'), R('Ana Ruiz')]);
  assert.equal(g.length, 3);
});
prueba('recomendación sin nombre va al final como "Sin nombre"', () => {
  const g = porRecomendador([R(''), R(null), R('Crespo'), R('Crespo')]);
  assert.equal(g.at(-1).nombre, 'Sin nombre'); assert.equal(g.at(-1).total, 2); assert.equal(g[0].nombre, 'Crespo');
});
prueba('cuenta cuántos se ficharon', () => {
  const g = porRecomendador([R('Crespo', { status: 'converted' }), R('Crespo'), R('crespo', { status: 'converted' })]);
  assert.equal(g[0].fichados, 2);
});
prueba('un nombre en "Recomendó" cuenta aunque el medio diga "Otro"', () => {
  const g = porRecomendador([{ source_channel: 'Otro', referral_name: 'Emmanuel' }, { source_channel: 'Facebook' }]);
  assert.deepEqual(g.map(x => x.nombre), ['Emmanuel']);
});
prueba('por medio: de mayor a menor y vacío como "Sin dato"', () => {
  const g = porMedio([{ source_channel: 'Facebook' }, { source_channel: 'facebook ' }, { source_channel: 'Recomendación' }, {}]);
  assert.deepEqual(g.map(x => [x.nombre, x.total]), [['Facebook', 2], ['Recomendación', 1], ['Sin dato', 1]]);
});
prueba('filtrar la lista desde la barra respeta los nombres juntados', () => {
  const g = porRecomendador([R('Michel'), R('Michel Enriquez')])[0];
  assert.equal(recomendoA(R('michel'), g), true);
  assert.equal(recomendoA(R('Crespo'), g), false);
  const sin = porRecomendador([R('')])[0];
  assert.equal(recomendoA(R(''), sin), true); assert.equal(recomendoA({ source_channel: 'Facebook' }, sin), false);
});

if (fallos) { console.error(`Fichajes (origen) QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Fichajes (origen) QA OK · ${corridas} casos: nombres juntados, sin nombre, fichados y por medio`);
