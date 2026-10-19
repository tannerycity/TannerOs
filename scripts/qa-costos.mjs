// Costos por tipo de cliente (v2/catalogo/costos.js), sin navegador.
// "Lo que más compran es el kit de niño… pero tú me das la utilidad del adulto."
// Los números son los reales del club (19/10/2026).
import assert from 'node:assert/strict';
import { margenDe, margenesDe, tipoDeLinea, mezclaDeVentas, margenPonderado, precioParaMargen } from '../v2/catalogo/costos.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }
const r1 = (x) => Math.round(x * 10) / 10;

prueba('jersey: de niño deja menos que de adulto con el mismo costo', () => {
  const m = margenesDe({ precioAdulto: 799, precioNino: 599, costo: 310 });
  assert.equal(r1(m.adulto.margen), 61.2); assert.equal(m.adulto.ganas, 489);
  assert.equal(r1(m.nino.margen), 48.2); assert.equal(m.nino.ganas, 289);
});
prueba('Kit Temporada: 50% de adulto, 30% de niño (la diferencia que no se veía)', () => {
  const m = margenesDe({ precioAdulto: 3500, precioNino: 2500, costo: 1740 });
  assert.equal(r1(m.adulto.margen), 50.3); assert.equal(r1(m.nino.margen), 30.4);
  assert.equal(m.adulto.ganas - m.nino.ganas, 1000);
});
prueba('un producto de un solo precio no inventa precio de niño', () => {
  const m = margenesDe({ precioAdulto: 200, precioNino: null, costo: 100 });
  assert.equal(m.nino, null); assert.equal(m.adulto.margen, 50);
});
prueba('sin costo no hay margen (no se adivina)', () => {
  assert.deepEqual(margenesDe({ precioAdulto: 799, precioNino: 599, costo: null }), { adulto: null, nino: null });
  assert.equal(margenDe(799, null), null); assert.equal(margenDe(0, 100), null);
});
prueba('el tipo de una pieza: lo que dice el kit, lo migrado o el precio cobrado', () => {
  assert.equal(tipoDeLinea({ attributes: { bundleTier: 'Niño' } }), 'nino');
  assert.equal(tipoDeLinea({ attributes: { bundleTier: 'Adulto' } }), 'adulto');
  assert.equal(tipoDeLinea({ attributes: { tipo: 'Niño' } }), 'nino');
  const jersey = { price: 799, priceKid: 599 };
  assert.equal(tipoDeLinea({ unitPrice: 599, attributes: {} }, jersey), 'nino');
  assert.equal(tipoDeLinea({ unitPrice: 799, attributes: {} }, jersey), 'adulto');
  assert.equal(tipoDeLinea({ unitPrice: 200, attributes: {} }, { price: 200 }), null);   // calcetas: un solo precio
});
prueba('la mezcla se mide en dinero y sólo con piezas de dos precios', () => {
  const porId = { j: { price: 799, priceKid: 599 }, c: { price: 200 } };
  const mz = mezclaDeVentas([
    { productId: 'x', unitPrice: 532.8, quantity: 2, attributes: { bundleTier: 'Niño' } },
    { productId: 'j', unitPrice: 799, quantity: 1, attributes: {} },
    { productId: 'c', unitPrice: 200, quantity: 3, attributes: {} }], porId);
  assert.equal(r1(mz.nino * 100), 57.1); assert.equal(mz.piezas, 3);
  assert.equal(mezclaDeVentas([]).nino, null);
});
prueba('el margen real pesa niño y adulto según lo que se vende', () => {
  const m = margenesDe({ precioAdulto: 1500, precioNino: 1299, costo: 770 });
  assert.equal(r1(margenPonderado(m, 0.8)), 42.3);
  assert.equal(margenPonderado(m, null), null);
  assert.equal(r1(margenPonderado(m, 1)), r1(m.nino.margen));
});
prueba('el precio que deja cierto margen', () => {
  assert.equal(precioParaMargen(1740, 40), 2900);
  assert.equal(precioParaMargen(1740, 35), 2677);
});

if (fallos) { console.error(`Costos QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Costos QA OK · ${corridas} casos: niño y adulto con el mismo costo, la mezcla real y el margen ponderado`);
