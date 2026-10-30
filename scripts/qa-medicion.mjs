/* Pixel de Meta y etiqueta de Google (27/10/2026).
 *
 * Lo que se protege: sin ids no hay nada (ni barra), los ids mal escritos no
 * encienden nada, y cada evento de la tienda llega con el nombre y los datos
 * que Meta y Google esperan, en pesos mexicanos.
 */
import { hayIds, traduce, MEDICION, iniciaMedicion, mide, paginaMedible } from '../v2/medicion.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

revisa('ids oficiales de la tienda: Meta y GA4 de TannerOS (no el de Marketing)', MEDICION.metaPixelId === '1477125554314319' && MEDICION.googleTagId === 'G-KJN3NJS2YJ' && hayIds());
const L = (x = {}) => ({ hostname: 'app.tannerycity.com', pathname: '/tienda/', search: '', hash: '', ...x });
revisa('se mide la tienda con sus rutas internas y ligas de campaña', paginaMedible(L()) && paginaMedible(L({ hash: '#/p/abc' })) && paginaMedible(L({ search: '?utm_source=instagram&codigo=CURTI' })) && paginaMedible(L({ pathname: '/tienda/gorras' })));
revisa('no se mide fuera del dominio oficial (previews, localhost, TCP)', !paginaMedible(L({ hostname: 'tanneros.vercel.app' })) && !paginaMedible(L({ hostname: 'localhost' })) && !paginaMedible(L({ hostname: 'tcp.tannerycity.com' })));
revisa('no se mide fuera de la tienda (staff, familias, visoría)', !paginaMedible(L({ pathname: '/familias/' })) && !paginaMedible(L({ pathname: '/club/' })) && !paginaMedible(L({ pathname: '/visoria/' })));
revisa('no se mide con tokens, recibos o parámetros desconocidos', !paginaMedible(L({ hash: '#/embajador/abc123' })) && !paginaMedible(L({ hash: '#/recibo/PED-1' })) && !paginaMedible(L({ search: '?pago=PED-1&estado=ok' })) && !paginaMedible(L({ search: '?telefono=477' })));
revisa('un pixel de Meta son sólo números', hayIds({ metaPixelId: '123456789012345' }) && !hayIds({ metaPixelId: 'abc123' }));
revisa('la etiqueta de Google es G- o AW-', hayIds({ googleTagId: 'G-ABC123XYZ' }) && hayIds({ googleTagId: 'AW-123456789' }) && !hayIds({ googleTagId: 'UA-1234-1' }));
revisa('sin navegador ni ids, iniciar y medir no truenan', (() => { try { iniciaMedicion(); mide('ver', {}); return true; } catch { return false; } })());

const item = { id: 'p:1', nombre: 'Jersey Black', precio: 899, cantidad: 2 };
const ver = traduce('ver', { valor: 899, items: [item] });
revisa('ver producto: ViewContent y view_item en MXN', ver.meta[0] === 'ViewContent' && ver.meta[1].currency === 'MXN' && ver.google[0] === 'view_item' && ver.google[1].items[0].item_id === 'p:1');
const ag = traduce('agregar', { valor: 1798, items: [item] });
revisa('agregar: AddToCart y add_to_cart con el valor', ag.meta[0] === 'AddToCart' && ag.meta[1].value === 1798 && ag.google[0] === 'add_to_cart' && ag.google[1].items[0].quantity === 2);
const pg = traduce('pagar', { valor: 1798, items: [item] });
revisa('iniciar el pedido cuenta las piezas', pg.meta[0] === 'InitiateCheckout' && pg.meta[1].num_items === 2 && pg.google[0] === 'begin_checkout');
const cp = traduce('compra', { valor: 1618.2, folio: 'PED-2026-00012', items: [item] });
revisa('levantar el pedido NO es purchase (aún no está pagado)', cp.meta[0] === 'OrderPlaced' && cp.meta[2] === true && cp.google[0] === 'store_order_placed' && cp.meta[1].value === 1618.2 && !JSON.stringify(cp).includes('purchase') && !JSON.stringify(cp).includes('Purchase'));
revisa('guardar: AddToWishlist', traduce('guardar', { valor: 550, items: [item] }).meta[0] === 'AddToWishlist');
revisa('un evento desconocido no se manda', traduce('otro', {}) === null);
revisa('no viaja el nombre del cliente ni su teléfono', !JSON.stringify(cp).match(/telefono|phone|customer/i));

console.log(fallos ? `Medición QA FAILED · ${fallos} de ${corridas}` : `Medición QA OK · ${corridas} casos: ids oficiales, sólo en la tienda pública, y cada evento con su nombre en Meta y Google`);
process.exit(fallos ? 1 : 0);
