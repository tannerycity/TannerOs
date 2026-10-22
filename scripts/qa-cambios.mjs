/* Cambios (22/10/2026): la bitácora de correcciones que revisa Presidencia.
 * Se prueba cómo se lee cada cambio (v2/cambios/cambios.js): qué campos
 * cambiaron con su antes y después, cómo se ve el dinero y el método, qué se
 * enseña cuando no hay "después" (se borró o reembolsó) y a dónde lleva. */
import assert from 'node:assert/strict';
import { TIPOS, diferencias, valor, liga } from '../v2/cambios/cambios.js';

let corridas = 0, fallos = 0;
const prueba = (n, f) => { corridas++; try { f(); } catch (e) { fallos++; console.error(` - ${n}: ${e.message}`); } };

prueba('cada tipo tiene su nombre', () => {
  for (const k of ['order_item_edited', 'order_payment_corrected', 'tanner_payment_refunded', 'income_voided', 'payment_edited', 'order_deleted']) assert.ok(TIPOS[k], k);
});
prueba('la manga de corta a larga: sólo lo que cambió', () => {
  const d = diferencias({ talla:'10', manga:'corta', nombre:'JULIÁN', numero:'17', nota:null }, { talla:'10', manga:'larga', nombre:'JULIÁN', numero:'17', nota:null });
  assert.deepEqual(d, [{ campo:'Manga', antes:'corta', despues:'larga' }]);
});
prueba('dinero, método y número se leen bien', () => {
  assert.equal(valor('amount', 1299), '$1,299.00');
  assert.equal(valor('method', 'transfer'), 'Transferencia');
  assert.equal(valor('numero', '7'), '#7');
  assert.equal(valor('nota', null), '—');
});
prueba('un movimiento editado: monto y método', () => {
  const d = diferencias({ amount:500, method:'cash', concept:'Arbitraje' }, { amount:450, method:'transfer', concept:'Arbitraje' });
  assert.deepEqual(d.map(x => x.campo), ['Monto', 'Método']);
  assert.equal(d[0].antes, '$500.00'); assert.equal(d[0].despues, '$450.00');
});
prueba('sin después (borrado): enseña lo que había', () => {
  const d = diferencias({ amount:1000, method:'cash', player:'Ana Ruiz', folio:null }, null);
  assert.deepEqual(d.map(x => [x.campo, x.despues]), [['Monto', null], ['Método', null], ['Tanner', null]]);
});
prueba('lleva al pedido, o al Tanner si el pedido ya no existe', () => {
  assert.equal(liga({ kind:'order_item_edited', orderId:'o1', playerId:'p1' }), '/pedidos/?pedido=o1');
  assert.equal(liga({ kind:'order_deleted', orderId:'o1', playerId:'p1' }), '/tanner/?id=p1');
  assert.equal(liga({ kind:'income_voided' }), null);
});

console.log(fallos ? `Cambios QA FAILED · ${fallos} de ${corridas}` : `Cambios QA OK · ${corridas} casos: qué cambió, antes y después, y a dónde lleva`);
process.exit(fallos ? 1 : 0);
