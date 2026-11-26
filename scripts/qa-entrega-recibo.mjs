/* ENTREGA CON RECIBO (26/11/2026, h104): la parte sin DOM.
 *   · las piezas salen igual del pedido (attributes) que de la entrega guardada;
 *   · no se entrega sin palomear todo, sin quién recoge, sin firma o sin aceptar;
 *   · la firma cabe en un path SVG corto que la base acepta;
 *   · el WhatsApp va a quien compró, con folio, piezas, quién recibió y la garantía.
 */
import { piezaDe, piezasDe, totalPiezas, faltaParaEntregar, trazoASvg, textoWhatsApp, ligaWhatsApp, nombreArchivo, etiquetaRelacion, DIAS_GARANTIA, RELACIONES } from '../v2/pedidos/entrega.js';

const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });

const delPedido = { description: 'Jersey "Wet Blue" - Home Edition', quantity: 1, attributes: { talla: '10', manga: 'larga', nombrePers: 'LEO', numero: '7' } };
const guardada = { description: 'Jersey "Wet Blue" - Home Edition', quantity: 1, talla: '10', manga: 'larga', nombre: 'LEO', numero: '7' };
revisa('pieza del pedido: talla, manga y espalda', piezaDe(delPedido).detalle === 'Talla 10 · Manga larga · LEO #7', piezaDe(delPedido).detalle);
revisa('pieza guardada: igual que la del pedido', JSON.stringify(piezaDe(guardada)) === JSON.stringify(piezaDe(delPedido)));
revisa('sin nombre: "Pieza" y cantidad mínima 1', piezaDe({}).nombre === 'Pieza' && piezaDe({ quantity: 0 }).cantidad === 1);
revisa('total de piezas cuenta cantidades', totalPiezas([delPedido, { description: 'Calcetas', quantity: 2 }]) === 3);
revisa('sin lista no truena', piezasDe(null).length === 0);

const base = { revisadas: 2, piezas: 2, quien: 'Ana Ávila', firma: 'M1 1 L2 2', acepta: true };
revisa('con todo, se puede entregar', faltaParaEntregar(base) === '');
revisa('falta palomear (y dice cuántas)', /2 piezas que faltan/.test(faltaParaEntregar({ ...base, revisadas: 0 })) && /pieza que falta/.test(faltaParaEntregar({ ...base, revisadas: 1 })));
revisa('falta quién recoge', /quién recoge/.test(faltaParaEntregar({ ...base, quien: ' ' })));
revisa('falta la firma', /firma/.test(faltaParaEntregar({ ...base, firma: '' })));
revisa('falta aceptar', /acepte/.test(faltaParaEntregar({ ...base, acepta: false })));

const svg = trazoASvg([[[10.4, 20.6], [30, 40], [50.2, 60]], [[100, 100]], []]);
revisa('firma en path SVG con enteros', svg === 'M10 21 L30 40 L50 60 M100 100 L101 100', svg);
revisa('el path pasa la regla de la base (h104)', /^[MLmlCcQqZz0-9 .,\-]*$/.test(svg));
revisa('sin trazos, firma vacía', trazoASvg([]) === '');

const rec = { receiptFolio: 'E-PED-2026-00020', folio: 'PED-2026-00020', customerName: 'Abuelo Pérez', customerPhone: '+524779876543', playerName: 'Leo Ávila',
  receivedBy: 'Ana Ávila', relation: 'mama', items: [delPedido, { description: 'Calcetas', quantity: 2 }], paid: 1450, total: 1450, deliveredAt: '2026-11-26T18:00:00Z' };
const t = textoWhatsApp(rec, 'Tannery City F.C.');
revisa('WhatsApp: saluda a quien compró por su nombre', /^Hola Abuelo,/.test(t));
revisa('WhatsApp: recibo, pedido, piezas y para quién', /Recibo E-PED-2026-00020 · Pedido PED-2026-00020/.test(t) && /3 piezas entregadas para Leo Ávila/.test(t));
revisa('WhatsApp: quién recibió y su relación', /Recibió: Ana Ávila \(mamá\)/.test(t));
revisa('WhatsApp: pagado y garantía de 5 días', /Pagado: \$1,450\.00/.test(t) && new RegExp(`próximos ${DIAS_GARANTIA} días`).test(t) && /no tiene cambio/.test(t));
revisa('WhatsApp: hora de México', /26 de noviembre de 2026/.test(t) && /12:00/.test(t), t.split('\n')[4]);
revisa('liga: teléfono de 10 dígitos lleva el 52', ligaWhatsApp('477 123 4567', 'x') === 'https://wa.me/524771234567?text=x' && ligaWhatsApp('+524779876543', 'x').startsWith('https://wa.me/524779876543?'));
revisa('liga: sin teléfono, nada', ligaWhatsApp('', 'x') === null);
revisa('archivo con el folio', nombreArchivo(rec) === 'Recibo-entrega-E-PED-2026-00020.png');
revisa('relaciones con nombre', etiquetaRelacion('papa') === 'Papá' && etiquetaRelacion('x') === '' && RELACIONES.length === 5);

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nEntrega con recibo FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nEntrega con recibo OK · ${casos.length} casos: piezas, qué falta para entregar, firma y WhatsApp`);
