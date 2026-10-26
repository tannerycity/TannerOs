/* Las reglas de los códigos de la tienda (26/10/2026, h46).
 *
 * Lo que se protege: lo que la familia ve descontado es lo que cobra el
 * servidor (private.aplica_codigo), y el formulario de Catálogo dice el mismo
 * "no" que el servidor, con el mismo tope de 10% para quien no es Presidencia.
 */
import { normalizaCodigo, codigoValido, descuentoDeCodigo, textoAplicado, pesoDelCodigo, revisaCodigo,
  ligaDeCompra, ligaDelEmbajador, mensajeEmbajador } from '../v2/codigos.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

/* ---- Escribirlo ---- */
revisa('se escribe como sea y se lee en mayúsculas sin espacios', normalizaCodigo(' curti brother ') === 'CURTIBROTHER');
revisa('de 3 a 20 letras o números', codigoValido('ab1') && codigoValido('CURTIBROTHER') && !codigoValido('AB') && !codigoValido('X'.repeat(21)));
revisa('sin acentos ni signos', !codigoValido('NIÑO10') && !codigoValido('PARK-26'));

/* ---- Lo que descuenta (igual que el servidor) ---- */
const carrito = { a: { total: 1598, cantidad: 2, recargoPers: 100 }, b: { total: 550, cantidad: 1 } };
revisa('% sobre el total del carrito', descuentoDeCodigo({ ok: true, kind: 'descuento', discountType: 'pct', discountValue: 10 }, carrito) === 214.8);
revisa('$ fijo, nunca más que la compra', descuentoDeCodigo({ ok: true, kind: 'descuento', discountType: 'amount', discountValue: 5000 }, carrito) === 2148);
revisa('nombre y número gratis: lo que costó el estampado de cada pieza', descuentoDeCodigo({ ok: true, kind: 'personalizacion' }, carrito) === 200);
revisa('el regalo no descuenta: se agrega a $0', descuentoDeCodigo({ ok: true, kind: 'regalo' }, carrito) === 0);
revisa('un código que no pasó no descuenta', descuentoDeCodigo({ ok: false, motivo: 'x' }, carrito) === 0 && descuentoDeCodigo(null, carrito) === 0);
revisa('lo que dice la caja', textoAplicado({ ok: true, kind: 'descuento', label: '10% de descuento' }, 214.8, n => `$${n}`) === '10% de descuento: −$214.8');
revisa('nombre y número gratis sin estampado: dice qué hacer', /agrégale nombre/.test(textoAplicado({ ok: true, kind: 'personalizacion', label: 'x' }, 0)));
revisa('el regalo se dice por su nombre', textoAplicado({ ok: true, kind: 'regalo', giftName: 'The Tanner Cap' }, 0) === 'The Tanner Cap de regalo en tu pedido');

/* ---- El formulario: el mismo "no" que el servidor ---- */
const base = { code: 'CURTI10', kind: 'descuento', discountType: 'pct', discountValue: 10, minPurchase: 0, rewardPct: 5 };
revisa('10% lo guarda cualquiera que edita el catálogo', revisaCodigo(base) === null);
revisa('15% sólo Presidencia', /Presidencia/.test(revisaCodigo({ ...base, discountValue: 15 })) && revisaCodigo({ ...base, discountValue: 15 }, { esPresidencia: true }) === null);
revisa('$100 sin compra mínima pesa 100%: Presidencia', /Presidencia/.test(revisaCodigo({ ...base, discountType: 'amount', discountValue: 100 })));
revisa('$100 en compras desde $1,500 pesa 6.7%: pasa', revisaCodigo({ ...base, discountType: 'amount', discountValue: 100, minPurchase: 1500 }) === null);
revisa('el peso de un regalo es su precio entre la compra mínima', Math.round(pesoDelCodigo({ kind: 'regalo', minPurchase: 5500 }, 550)) === 10);
revisa('regalo de $550 desde $5,500: pasa', revisaCodigo({ code: 'GORRA', kind: 'regalo', giftProductId: 'g', minPurchase: 5500 }, { precioRegalo: 550 }) === null);
revisa('regalo con varias tallas: no', /talla única/.test(revisaCodigo({ code: 'GORRA', kind: 'regalo', giftProductId: 'g', minPurchase: 9000 }, { precioRegalo: 550, tallasRegalo: 3 })));
revisa('regalo sin elegir: lo pide', revisaCodigo({ code: 'GORRA', kind: 'regalo' }) === 'Elige el regalo.');
revisa('nombre y número gratis no tiene tope', revisaCodigo({ code: 'MINOMBRE', kind: 'personalizacion' }) === null);
revisa('premio arriba de 10%: Presidencia', /premio/.test(revisaCodigo({ ...base, rewardPct: 12 })) && revisaCodigo({ ...base, rewardPct: 12 }, { esPresidencia: true }) === null);
revisa('premio arriba de 30%: nadie', /0 a 30/.test(revisaCodigo({ ...base, rewardPct: 31 }, { esPresidencia: true })));
revisa('descuento de 0: lo pide', revisaCodigo({ ...base, discountValue: 0 }) === 'Escribe cuánto descuenta.');
revisa('más de 90%: no', /1 a 90/.test(revisaCodigo({ ...base, discountValue: 95 }, { esPresidencia: true })));
revisa('código con espacio se normaliza antes de revisar', revisaCodigo({ ...base, code: 'curti 10' }) === null);
revisa('fin antes del inicio: no', /después/.test(revisaCodigo({ ...base, startsOn: '2026-11-10', endsOn: '2026-11-01' })));

/* ---- Las ligas ---- */
revisa('la liga de compra lleva el código puesto', ligaDeCompra('https://tanneros.app/', 'curtibrother') === 'https://tanneros.app/tienda/?codigo=CURTIBROTHER');
revisa('y el club cuando no es Tannery', ligaDeCompra('https://x.app', 'A10', 'club-b') === 'https://x.app/tienda/?club=club-b&codigo=A10');
revisa('la liga del embajador va por su token', ligaDelEmbajador('https://x.app', 'abc123') === 'https://x.app/tienda/#/embajador/abc123');
const msj = mensajeEmbajador({ code: 'CURTIBROTHER', label: '10% de descuento', ambassadorName: 'Curti', rewardPct: 5 }, { compra: 'C', ventas: 'V', club: 'Tannery City' });
revisa('el mensaje al embajador trae su código, su premio y las dos ligas', /Hola Curti/.test(msj) && /CURTIBROTHER/.test(msj) && /ganas 5%/.test(msj) && /: C/.test(msj) && /: V/.test(msj), msj);
revisa('sin premio, no promete premio', !/ganas/.test(mensajeEmbajador({ code: 'A10', label: 'x', rewardPct: 0 }, { compra: 'C', ventas: 'V' })));

console.log(fallos ? `Códigos QA FAILED · ${fallos} de ${corridas}` : `Códigos QA OK · ${corridas} casos: lo que se descuenta, el tope de 10% y las ligas del embajador`);
process.exit(fallos ? 1 : 0);
