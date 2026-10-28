/* BANNERS DE LA TIENDA (28/10/2026, h49): la parte sin DOM.
 *   · cada banner lleva a su pieza, kit o categoría; si ya no existe, a la portada;
 *   · sólo salen los que tienen foto y título;
 *   · en el Catálogo se dice a dónde lleva con su nombre.
 */
import { destinoDe, bannersParaTienda, textoDestino, CADA_MS } from '../pedido/banners.js';

const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });
const CAT = { products: [{ id: 'p1', name: 'Jersey "Black Edition"' }], bundles: [{ id: 'k1', name: 'Kit Dúo' }] };

revisa('pieza: abre su ficha', destinoDe({ targetKind: 'producto', targetValue: 'p1' }, CAT) === '#/p/p1');
revisa('kit: abre su ficha', destinoDe({ targetKind: 'kit', targetValue: 'k1' }, CAT) === '#/k/k1');
revisa('categoría: abre la categoría', destinoDe({ targetKind: 'categoria', targetValue: 'gorras' }, CAT) === '#/c/gorras');
revisa('tienda: la portada', destinoDe({ targetKind: 'tienda' }, CAT) === '#/');
revisa('una pieza que ya no se vende: a la portada, nunca a una ficha vacía', destinoDe({ targetKind: 'producto', targetValue: 'p9' }, CAT) === '#/');
revisa('una categoría inventada: a la portada', destinoDe({ targetKind: 'categoria', targetValue: 'x' }, CAT) === '#/');
const lista = bannersParaTienda([
  { id: 'a', title: 'Black Edition', imagePath: 'a.webp', targetKind: 'producto', targetValue: 'p1' },
  { id: 'b', title: 'Sin foto', imagePath: null },
  { id: 'c', title: '  ', imagePath: 'c.webp' },
  { id: 'd', title: 'Kits', imagePath: 'd.webp', targetKind: 'kit', targetValue: 'k1' }
], CAT);
revisa('sólo salen los que tienen foto y título, en su orden', lista.map(b => b.id).join() === 'a,d', lista.map(b => b.id).join());
revisa('cada uno con su destino resuelto', lista[0].href === '#/p/p1' && lista[1].href === '#/k/k1');
revisa('sin datos no truena', bannersParaTienda(null, CAT).length === 0);
revisa('Catálogo: el destino con su nombre', textoDestino({ targetKind: 'producto', targetValue: 'p1' }, CAT) === 'Jersey "Black Edition"' && textoDestino({ targetKind: 'categoria', targetValue: 'gorras' }, CAT) === 'Gorras' && textoDestino({}, CAT) === 'La tienda');
revisa('Catálogo: si la pieza ya no está, lo dice', textoDestino({ targetKind: 'kit', targetValue: 'k9' }, CAT) === 'Un kit que ya no está');
revisa('pasan cada 5 segundos', CADA_MS === 5000);

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nBanners de tienda FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nBanners de tienda OK · ${casos.length} casos: a dónde lleva cada banner, cuáles salen y cómo se dice en el Catálogo`);
