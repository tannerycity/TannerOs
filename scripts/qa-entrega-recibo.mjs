/* ENTREGA CON RECIBO (26/11/2026, h104): la parte sin DOM.
 *   · las piezas salen igual del pedido (attributes) que de la entrega guardada;
 *   · de entrada se lleva todo lo pendiente; lo que no llegó se queda pendiente;
 *   · el botón dice cuánto se lleva ("Entregar 4 piezas" / "Entregar 2 de 4");
 *   · no se entrega sin piezas, sin quién recoge o sin confirmar que lo revisó;
 *   · el WhatsApp va a quien compró, con lo que se llevó, lo pendiente y la garantía.
 */
import { piezaDe, piezasDe, totalPiezas, estadoDePiezas, seleccionInicial, resumen, textoBoton, piezasParaGuardar, faltaParaEntregar, textoWhatsApp, ligaWhatsApp, nombreArchivo, etiquetaRelacion, DIAS_GARANTIA, RELACIONES } from '../v2/pedidos/entrega.js';

const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });

const delPedido = { id: 'i1', description: 'Jersey "Wet Blue" - Home Edition', quantity: 1, attributes: { talla: '10', manga: 'larga', nombrePers: 'LEO', numero: '7' } };
const guardada = { itemId: 'i1', description: 'Jersey "Wet Blue" - Home Edition', quantity: 1, talla: '10', manga: 'larga', nombre: 'LEO', numero: '7' };
revisa('pieza del pedido: talla, manga y espalda', piezaDe(delPedido).detalle === 'Talla 10 · Manga larga · LEO #7', piezaDe(delPedido).detalle);
revisa('pieza guardada: igual que la del pedido', JSON.stringify(piezaDe(guardada)) === JSON.stringify(piezaDe(delPedido)));
revisa('sin nombre: "Pieza" y cantidad mínima 1', piezaDe({}).nombre === 'Pieza' && piezaDe({ quantity: 0 }).cantidad === 1);
revisa('total de piezas cuenta cantidades', totalPiezas([delPedido, { description: 'Calcetas', quantity: 2 }]) === 3);
revisa('sin lista no truena', piezasDe(null).length === 0 && estadoDePiezas(null).length === 0);

// El pedido de Leo: jersey, short y 2 calcetas. Ya se llevó el jersey en una entrega anterior.
const items = [
  { itemId: 'i1', description: 'Jersey', quantity: 1, talla: '10', delivered: 1, pending: 0 },
  { itemId: 'i2', description: 'Short', quantity: 1, talla: '10', delivered: 0, pending: 1 },
  { itemId: 'i3', description: 'Calcetas', quantity: 2, talla: 'Universal', delivered: 0, pending: 2 }
];
const est = estadoDePiezas(items), sel = seleccionInicial(est);
revisa('de entrada se lleva todo lo pendiente (no lo ya entregado)', JSON.stringify(sel) === '{"i2":1,"i3":2}', JSON.stringify(sel));
revisa('resumen: 3 pendientes, se lleva 3, ya se llevó 1', JSON.stringify(resumen(est, sel)) === '{"lleva":3,"pendientes":3,"queda":0,"yaSeLlevo":1}', JSON.stringify(resumen(est, sel)));
revisa('botón: todo lo pendiente', textoBoton(resumen(est, sel)) === 'Entregar 3 piezas');
const sinShort = { ...sel, i2: 0, i3: 1 };
revisa('no llegó el short y una calceta: "Entregar 1 de 3"', textoBoton(resumen(est, sinShort)) === 'Entregar 1 de 3' && resumen(est, sinShort).queda === 2);
revisa('nunca se lleva más de lo pendiente', resumen(est, { i3: 9 }).lleva === 2);
revisa('botón sin nada elegido', textoBoton(resumen(est, {})) === 'Elige qué se lleva');
revisa('una sola pieza: "Entregar 1 pieza"', textoBoton({ lleva: 1, pendientes: 1 }) === 'Entregar 1 pieza');
revisa('lo que se guarda: sólo lo que se lleva', JSON.stringify(piezasParaGuardar(sinShort)) === '[{"item_id":"i3","quantity":1}]');
revisa('sin h104 (sin delivered/pending): todo pendiente', estadoDePiezas([{ id: 'x', description: 'Gorra', quantity: 1 }])[0].pendientes === 1);

const base = { lleva: 2, quien: 'Ana Ávila', acepta: true };
revisa('con todo, se puede entregar', faltaParaEntregar(base) === '');
revisa('falta elegir piezas', /al menos una pieza/.test(faltaParaEntregar({ ...base, lleva: 0 })));
revisa('falta quién recoge', /quién lo recoge/.test(faltaParaEntregar({ ...base, quien: ' ' })));
revisa('falta confirmar que lo revisó', /revisó/.test(faltaParaEntregar({ ...base, acepta: false })));

const rec = { receiptFolio: 'E-PED-2026-00020-1', folio: 'PED-2026-00020', customerName: 'Abuelo Pérez', customerPhone: '+524779876543', playerName: 'Leo Ávila',
  receivedBy: 'Ana Ávila', relation: 'mama', items: [{ itemId: 'i3', description: 'Calcetas', quantity: 1, talla: 'Universal' }],
  pending: [{ itemId: 'i2', description: 'Short', quantity: 1, talla: '10' }, { itemId: 'i3', description: 'Calcetas', quantity: 1, talla: 'Universal' }],
  paid: 1450, total: 1450, deliveredAt: '2026-11-26T18:00:00Z' };
const t = textoWhatsApp(rec, 'Tannery City F.C.');
revisa('WhatsApp: saluda a quien compró por su nombre', /^Hola Abuelo,/.test(t));
revisa('WhatsApp: entrega parcial con su recibo y para quién', /Recibo E-PED-2026-00020-1 · Pedido PED-2026-00020/.test(t) && /Entrega parcial para Leo Ávila: 1 pieza\./.test(t));
revisa('WhatsApp: lo que se llevó y lo pendiente', /✓ Calcetas \(Talla Universal\)/.test(t) && /Queda pendiente \(te avisamos en cuanto llegue\):\n· Short \(Talla 10\)\n· Calcetas/.test(t));
revisa('WhatsApp: quién recibió y su relación', /Recibió: Ana Ávila \(mamá\)/.test(t));
revisa('WhatsApp: garantía de 5 días y lo estampado', new RegExp(`próximos ${DIAS_GARANTIA} días`).test(t) && /no tiene cambio/.test(t));
revisa('WhatsApp: entrega completa no habla de pendientes', /Entregado completo/.test(textoWhatsApp({ ...rec, pending: [] })) && !/pendiente/.test(textoWhatsApp({ ...rec, pending: [] })));
revisa('WhatsApp: hora de México', /26 de noviembre de 2026/.test(t) && /12:00/.test(t));
revisa('liga: teléfono de 10 dígitos lleva el 52', ligaWhatsApp('477 123 4567', 'x') === 'https://wa.me/524771234567?text=x' && ligaWhatsApp('+524779876543', 'x').startsWith('https://wa.me/524779876543?'));
revisa('liga: sin teléfono, nada', ligaWhatsApp('', 'x') === null);
revisa('archivo con el folio', nombreArchivo(rec) === 'Recibo-entrega-E-PED-2026-00020-1.png');
revisa('relaciones: cuatro, con nombre', etiquetaRelacion('papa') === 'Papá' && etiquetaRelacion('familiar') === 'Familiar' && etiquetaRelacion('x') === '' && RELACIONES.length === 4);

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nEntrega con recibo FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nEntrega con recibo OK · ${casos.length} casos: piezas, entrega por partes, botón, qué falta y WhatsApp`);
