/* Pixel de Meta y etiqueta de Google (27/10/2026).
 *
 * Lo que se protege: solo se activan identificadores válidos y tras consentimiento; y cada evento de la tienda llega con el nombre y los datos
 * que Meta y Google esperan, en pesos mexicanos.
 */
import { hayIds, traduce, MEDICION, iniciaMedicion, mide, esDominioOficial, rutaDeTiendaSegura } from '../v2/medicion.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

revisa('ids oficiales preparados para tienda pública', MEDICION.metaPixelId === '1477125554314319' && MEDICION.googleTagId === 'G-KJN3NJS2YJ' && hayIds());
revisa('solo rutas de tienda sin URLs de expedientes', rutaDeTiendaSegura('/tienda/') && rutaDeTiendaSegura('/pedido/') && !rutaDeTiendaSegura('/familias/') && !rutaDeTiendaSegura('/jugadores/'));
revisa('solo el dominio oficial admite trackers', esDominioOficial('app.tannerycity.com') && !esDominioOficial('localhost') && !esDominioOficial('tanneros.vercel.app') && !esDominioOficial('tcp.tannerycity.com'));
revisa('un pixel de Meta son sólo números', hayIds({ metaPixelId: '123456789012345' }) && !hayIds({ metaPixelId: 'abc123' }));
revisa('la etiqueta de Google es G- o AW-', hayIds({ googleTagId: 'G-ABC123XYZ' }) && hayIds({ googleTagId: 'AW-123456789' }) && !hayIds({ googleTagId: 'UA-1234-1' }));
revisa('sin navegador ni ids, iniciar y medir no truenan', (() => { try { iniciaMedicion(); mide('ver', {}); return true; } catch { return false; } })());

const item = { id: 'p:1', nombre: 'Jersey Black', precio: 899, cantidad: 2 };
const ver = traduce('ver', { valor: 899, items: [item] });
revisa('se omiten nombres de productos personalizados', !JSON.stringify(ver).includes('Jersey Black') && ver.google[1].items[0].item_name === 'Producto');
revisa('ver producto: ViewContent y view_item en MXN', ver.meta[0] === 'ViewContent' && ver.meta[1].currency === 'MXN' && ver.google[0] === 'view_item' && ver.google[1].items[0].item_id === 'p:1');
const ag = traduce('agregar', { valor: 1798, items: [item] });
revisa('agregar: AddToCart y add_to_cart con el valor', ag.meta[0] === 'AddToCart' && ag.meta[1].value === 1798 && ag.google[0] === 'add_to_cart' && ag.google[1].items[0].quantity === 2);
const pg = traduce('pagar', { valor: 1798, items: [item] });
revisa('iniciar el pedido cuenta las piezas', pg.meta[0] === 'InitiateCheckout' && pg.meta[1].num_items === 2 && pg.google[0] === 'begin_checkout');
const cp = traduce('compra', { valor: 1618.2, folio: 'PED-2026-00012', items: [item] });
revisa('compra: Purchase con el total y el folio para Google', cp.meta[0] === 'Purchase' && cp.meta[1].value === 1618.2 && cp.google[1].transaction_id === 'PED-2026-00012');
revisa('guardar: AddToWishlist', traduce('guardar', { valor: 550, items: [item] }).meta[0] === 'AddToWishlist');
revisa('un evento desconocido no se manda', traduce('otro', {}) === null);
revisa('no viaja el nombre del cliente ni su teléfono', !JSON.stringify(cp).match(/telefono|phone|customer/i));

console.log(fallos ? `Medición QA FAILED · ${fallos} de ${corridas}` : `Medición QA OK · ${corridas} casos: IDs correctos y eventos con su nombre en Meta y Google`);
process.exit(fallos ? 1 : 0);
