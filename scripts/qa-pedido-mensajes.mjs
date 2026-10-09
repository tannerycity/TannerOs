// Los textos del pedido (v2/pedido-mensajes.js): lo que la familia lee para
// pagar y lo que se le manda por WhatsApp al confirmar.
//
// Lo que se protege:
//   1. La CLABE sale completa, sin espacios, y el folio va como referencia:
//      es lo que se usa para conciliar el depósito.
//   2. El mensaje dice quién lo manda (regla de Presidencia para todo mensaje
//      del club) y nombra cada pieza con su talla, nombre y número.
//   3. Los métodos que no son transferencia salen en una frase legible.
//   4. Sin datos de pago, el mensaje no inventa una cuenta.
//   5. Un celular de 10 dígitos abre WhatsApp con lada 52.
//   6. Ni un emoji: TannerOS no los usa en ningún texto.
import { datosDePago, mensajeConfirmacion, mensajeComprobante, ligaWhatsApp } from '../v2/pedido-mensajes.js';

const fallos = [];
let n = 0;
const revisa = (ok, msg) => { n++; if (!ok) fallos.push(msg); };

const INFO = {
  transfer: { bank: 'Banregio / Hey Banco', clabe: '1672 1000 0079 567650', holder: 'Proyecto Leyenda SA de CV' },
  methods: ['Transferencia', 'Efectivo', 'Tarjeta']
};
const PEDIDO = { folio: 'PED-2026-00031', customer_name: 'ana sofía ávila', customer_phone: '+52 477 123 4567', total: 1450 };
const PIEZAS = [
  { description: 'Jersey "Wet Blue" - Home Edition', quantity: 1, attributes: { talla: '10', nombrePers: 'LEO', numero: '7' } },
  { description: 'Par de calcetas', quantity: 2, attributes: { talla: 'Universal' } }
];

// 1
const pago = datosDePago(INFO, 'PED-2026-00031');
const fila = k => pago.filas.find(f => f[0] === k)?.[1];
revisa(fila('CLABE') === '167210000079567650', `CLABE sin espacios: ${fila('CLABE')}`);
revisa(fila('Referencia') === 'PED-2026-00031', 'el folio va como referencia');
revisa(fila('A nombre de') === 'Proyecto Leyenda SA de CV' && fila('Banco') === 'Banregio / Hey Banco', 'banco y titular');
revisa(!datosDePago(INFO, '').filas.some(f => f[0] === 'Referencia'), 'sin folio no hay referencia vacía');

// 2
const msg = mensajeConfirmacion({ order: PEDIDO, items: PIEZAS, info: INFO, club: 'Tannery City FC', yo: 'zulema garcía' });
revisa(msg.startsWith('Hola Ana, te saluda Zulema de Tannery City FC.'), `saludo y firma: ${msg.split('\n')[0]}`);
revisa(msg.includes('Recibimos tu pedido PED-2026-00031:'), 'nombra el folio');
revisa(msg.includes('- Jersey "Wet Blue" - Home Edition · talla 10 · LEO #7'), 'pieza con talla, nombre y número');
revisa(msg.includes('- 2 x Par de calcetas · talla Universal'), 'cantidad cuando es más de una');
revisa(/Total: \$1,450\.00/.test(msg), 'total en pesos');
revisa(msg.includes('CLABE: 167210000079567650') && msg.includes('Referencia: PED-2026-00031'), 'datos para pagar dentro del mensaje');
revisa(msg.includes('comprobante'), 'pide el comprobante');
const sinFirma = mensajeConfirmacion({ order: PEDIDO, items: [], info: INFO, club: 'Tannery City FC', yo: '' });
revisa(sinFirma.startsWith('Hola Ana, te escribimos de Tannery City FC.'), 'sin nombre del remitente, habla el club');

// 3
revisa(pago.otros === 'También aceptamos efectivo y tarjeta en Taquilla.', `otros métodos: ${pago.otros}`);
revisa(datosDePago({ methods: ['Transferencia', 'Efectivo'] }).otros === 'También aceptamos efectivo en Taquilla.', 'un solo método extra');
revisa(datosDePago({ methods: ['Transferencia'] }).otros === '', 'sólo transferencia: sin frase extra');

// 4
const sinCuenta = mensajeConfirmacion({ order: PEDIDO, items: PIEZAS, info: null, club: 'Tannery City FC', yo: 'Zul' });
revisa(!/CLABE|transferencia/i.test(sinCuenta), 'sin datos de pago no inventa una cuenta');
revisa(datosDePago(null, 'X').filas.length === 0, 'sin datos de pago no hay filas');

// 5
revisa(ligaWhatsApp('477 123 4567') === 'https://wa.me/524771234567', '10 dígitos llevan lada 52');
revisa(ligaWhatsApp('+52 477 123 4567') === 'https://wa.me/524771234567', 'con lada no se duplica');
revisa(ligaWhatsApp('') === null, 'sin teléfono no hay liga');
const liga = ligaWhatsApp('524792651338', mensajeComprobante({ folio: 'PED-1', total: 699, nombre: 'Ana Ávila' }));
revisa(decodeURIComponent(liga.split('?text=')[1]) === 'Hola, soy Ana Ávila. Te comparto el comprobante de pago de mi pedido PED-1 por $699.00.',
  `comprobante: ${decodeURIComponent(liga.split('?text=')[1] || '')}`);

// 6
const EMOJI = /\p{Extended_Pictographic}/u;
revisa(![msg, sinFirma, sinCuenta, mensajeComprobante({ folio: 'X', total: 1 })].some(t => EMOJI.test(t)), 'ningún mensaje lleva emojis');

if (fallos.length) { console.error('Mensajes de pedido QA FALLA:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log(`Mensajes de pedido QA OK · ${n} casos: CLABE completa con folio de referencia, firma de quien envía, y sin cuenta inventada`);
