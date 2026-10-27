/* El carrito que no se pierde y los guardados (27/10/2026).
 *
 * Lo que se protege: recargar o volver al día siguiente no borra el pedido,
 * pero tampoco regresa algo que la tienda ya no vende; la cantidad se
 * cambia desde la bolsita con el mismo tope que al agregar; y los
 * guardados son una lista corta, sin repetidos, de lo que sigue en venta.
 */
import { serializaCarrito, restauraCarrito, cambiaCantidadEnCarrito, cambiaCantidad, alternaGuardado, guardadosVivos } from '../pedido/carrito.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

const CAT = { products: [{ id: 'p1', name: 'Gorra' }, { id: 'p2', name: 'Jersey' }], bundles: [{ id: 'k1', name: 'Kit' }] };
const carrito = {
  a: { productId: 'p1', nombreProducto: 'Gorra', cantidad: 2, precioUnitario: 550, total: 1100 },
  b: { kind: 'bundle', bundleId: 'k1', nombreProducto: 'Kit', cantidad: 1, precioUnitario: 1500, total: 1500 },
  c: { productId: 'p9', nombreProducto: 'Ya no se vende', cantidad: 1, precioUnitario: 100, total: 100 },
};
const ahora = Date.UTC(2026, 9, 27);
const guardado = serializaCarrito(carrito, ahora);
const vuelta = restauraCarrito(guardado, CAT, ahora + 3600000);
revisa('al volver, el carrito regresa', vuelta.a?.cantidad === 2 && vuelta.b?.total === 1500);
revisa('pero sin lo que la tienda ya no vende', !vuelta.c, JSON.stringify(Object.keys(vuelta)));
revisa('un carrito de hace más de dos semanas no regresa', JSON.stringify(restauraCarrito(guardado, CAT, ahora + 15 * 86400000)) === '{}');
revisa('basura guardada no rompe la tienda', JSON.stringify(restauraCarrito('{no es json', CAT)) === '{}' && JSON.stringify(restauraCarrito(null, CAT)) === '{}');
revisa('una línea sin precio no regresa', !restauraCarrito(serializaCarrito({ x: { productId: 'p1', cantidad: 1, precioUnitario: 'x' } }, ahora), CAT, ahora).x);

let c = cambiaCantidadEnCarrito(vuelta, 'a', 1);
revisa('+ suma una y recalcula el total', c.a.cantidad === 3 && c.a.total === 1650);
c = cambiaCantidadEnCarrito(c, 'a', 50);
revisa('el + no pasa de 20', c.a.cantidad === 20 && c.a.total === 11000);
c = cambiaCantidadEnCarrito({ a: { ...carrito.a, cantidad: 1 } }, 'a', -1);
revisa('− en 1 lo quita del carrito', !c.a);
revisa('una llave que no existe no cambia nada', cambiaCantidadEnCarrito(vuelta, 'zz', 1) === vuelta);
revisa('el kit no cambia de cantidad (son las tallas de una persona)', !cambiaCantidad(carrito.b) && cambiaCantidad(carrito.a));

let g = alternaGuardado([], 'p:p1');
g = alternaGuardado(g, 'k:k1');
revisa('guardar pone lo nuevo primero', JSON.stringify(g) === '["k:k1","p:p1"]');
revisa('tocar otra vez lo quita', JSON.stringify(alternaGuardado(g, 'k:k1')) === '["p:p1"]');
revisa('máximo 40 guardados', alternaGuardado(Array.from({ length: 40 }, (_, i) => `p:${i}`), 'p:nuevo').length === 40);
revisa('lo guardado que ya no se vende no aparece', JSON.stringify(guardadosVivos(['p:p2', 'p:p9', 'k:k1'], CAT).map(x => x.tipo + x.item.id)) === '["pp2","kk1"]');
revisa('una lista dañada no rompe', guardadosVivos('x', CAT).length === 0 && alternaGuardado(null, 'p:p1').length === 1);

console.log(fallos ? `Carrito QA FAILED · ${fallos} de ${corridas}` : `Carrito QA OK · ${corridas} casos: el carrito que regresa, la cantidad desde la bolsita y los guardados`);
process.exit(fallos ? 1 : 0);
