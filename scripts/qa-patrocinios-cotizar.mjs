/* Vender y cotizar (25/10/2026), sin navegador.
 * Presidencia: cotizar fácil, por categorías, con descuento de hasta 10%; lo
 * que pase de ahí lo autoriza Presidencia. Aquí se prueba la cuenta, las
 * categorías, qué se puede hacer en cada estado y el PDF con la inversión. */
import { CATEGORIAS, categoriaDe, filtraCatalogo, renglonDe, totales, accionesDe, filtraCotizaciones, mensajeWhatsApp, avisosDeCotizaciones } from '../v2/patrocinadores/cotizar.js';
import { datosDePropuesta } from '../v2/patrocinadores/propuesta.js';

let casos = 0, fallos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(' - ' + n + (d !== undefined ? '\n   ' + JSON.stringify(d) : '')); } };

ok('cinco categorías en orden de venta', CATEGORIAS.map(c => c.t).join() === 'Uniforme,Complejo,Redes y contenido,Eventos y transmisiones,Paquetes');
ok('contenido se junta con redes', categoriaDe({ category: 'content' }) === 'digital' && categoriaDe({ category: 'raro' }) === 'other');
const CAT = [
  { id: 'a1', name: 'Logo en pecho', category: 'uniforms', family: 'Uniforme', price: 20000, unit: 'temporada' },
  { id: 'a2', name: 'Reel patrocinado', category: 'digital', family: 'Contenido', channel: 'Instagram', price: 2500, unit: 'reel' },
  { id: 'a3', name: 'Lona frente Españita', category: 'park', family: 'Espacio físico', price: null },
  { id: 'a4', name: 'Video de presentación', category: 'content', family: 'Video', price: 3000 },
];
ok('filtra por categoría', filtraCatalogo(CAT, { categoria: 'digital' }).map(a => a.id).join() === 'a2,a4');
ok('busca sin acentos en familia y canal', filtraCatalogo(CAT, { q: 'espanita' }).map(a => a.id).join() === 'a3' && filtraCatalogo(CAT, { q: 'instagram' })[0]?.id === 'a2');
const r1 = renglonDe(CAT[0]), r2 = renglonDe(CAT[1], 4), r3 = renglonDe(CAT[2]);
ok('el renglón toma el precio del catálogo', r1.unitPrice === 20000 && r1.quantity === 1 && r2.quantity === 4 && !r1.sinPrecio);
ok('sin precio entra en 0 y se marca', r3.unitPrice === 0 && r3.sinPrecio === true);

const t5 = totales([r1, r2], { tipo: 'pct', valor: 5 });
ok('subtotal, 5% y total', t5.subtotal === 30000 && t5.descuento === 1500 && t5.total === 28500 && t5.pct === 5 && !t5.pideAutorizacion, t5);
const t10 = totales([r1, r2], { tipo: 'pct', valor: 10 });
ok('10% exacto no pide autorización', t10.pct === 10 && !t10.pideAutorizacion, t10);
const t15 = totales([r1, r2], { tipo: 'pct', valor: 15 });
ok('15% pide autorización', t15.pideAutorizacion && t15.total === 25500, t15);
const tm = totales([r1, r2], { tipo: 'amount', valor: 4000 });
ok('descuento en pesos se convierte a % para el tope', tm.descuento === 4000 && tm.pct === 13.33 && tm.pideAutorizacion, tm);
ok('el descuento nunca pasa del subtotal', totales([r2], { tipo: 'amount', valor: 999999 }).total === 0);
ok('sin descuento', totales([r1], {}).total === 20000);

const base = { id: 'q', folio: 'COT-2026-001', status: 'draft', approvalStatus: 'none' };
ok('borrador: enviar, editar, archivar', accionesDe(base).acciones.join() === 'enviar,editar,archivar');
ok('por autorizar: Zul sólo edita', accionesDe({ ...base, approvalStatus: 'pending' }).acciones.join() === 'editar' && accionesDe({ ...base, approvalStatus: 'pending' }).etiqueta === 'Por autorizar');
ok('por autorizar: Presidencia autoriza o no', accionesDe({ ...base, approvalStatus: 'pending' }, { esPresidencia: true }).acciones.join() === 'autorizar,noAutorizar,editar');
ok('enviada: aceptó, no aceptó, reenviar', accionesDe({ ...base, status: 'sent' }).acciones.join() === 'acepto,noAcepto,reenviar,editar');
ok('aceptada: sólo ver la marca', accionesDe({ ...base, status: 'accepted', approvalStatus: 'approved' }).acciones.join() === 'verMarca');
ok('sin permiso de escribir no hay acciones', accionesDe(base, { puedeEscribir: false }).acciones.length === 0);
const L = [{ ...base, id: 1 }, { ...base, id: 2, approvalStatus: 'pending' }, { ...base, id: 3, status: 'sent' }, { ...base, id: 4, status: 'accepted', approvalStatus: 'pending' }];
ok('filtro por autorizar', filtraCotizaciones(L, 'pending').map(c => c.id).join() === '2');
ok('borrador no repite las que esperan autorización', filtraCotizaciones(L, 'draft').map(c => c.id).join() === '1');

const cot = { folio: 'COT-2026-001', sponsorName: 'Ferretería', total: 28500, subtotal: 30000, discountAmount: 1500, validUntil: '2026-11-24',
  items: [{ assetId: 'a1', description: 'Logo en pecho', unitPrice: 20000, quantity: 1 }, { assetId: 'a2', description: 'Reel patrocinado', unitPrice: 2500, quantity: 4 }] };
ok('mensaje de WhatsApp con folio, total y descuento', /COT-2026-001/.test(mensajeWhatsApp(cot, 'Club')) && /\$28,500/.test(mensajeWhatsApp(cot, 'Club')) && /\$1,500 de descuento/.test(mensajeWhatsApp(cot, 'Club')));
const d = datosDePropuesta({ marca: 'Ferretería', activos: [{ ...CAT[0], priceStatus: 'propuesta' }, { ...CAT[1], priceStatus: 'aprobado' }], hoy: '2026-10-25', cotizacion: cot });
ok('con cotización cada espacio lleva su precio cotizado', d.activos[0].precio === '$20,000 por temporada' && d.activos[1].precio === '$10,000 (4 x $2,500)', d.activos.map(a => a.precio));
ok('la inversión trae subtotal, descuento, total y vigencia', d.inversion.subtotal === '$30,000' && d.inversion.descuento === '-$1,500' && d.inversion.total === '$28,500' && /24 de noviembre/.test(d.inversion.vigencia), d.inversion);
const sin = datosDePropuesta({ marca: 'X', activos: [{ ...CAT[0], priceStatus: 'propuesta' }], hoy: '2026-10-25' });
ok('sin cotización sigue la regla: precio sin aprobar dice A cotizar', sin.activos[0].precio === 'A cotizar' && sin.inversion === null);

const Q = [
  { id: 'a', folio: 'COT-1', sponsorName: 'A', status: 'sent', approvalStatus: 'none', sentAt: '2026-10-18', validUntil: '2026-11-30' },
  { id: 'b', folio: 'COT-2', sponsorName: 'B', status: 'sent', approvalStatus: 'none', sentAt: '2026-10-24', validUntil: '2026-10-27' },
  { id: 'c', folio: 'COT-3', sponsorName: 'C', status: 'sent', approvalStatus: 'none', sentAt: '2026-10-24', validUntil: '2026-11-30' },
  { id: 'd', folio: 'COT-4', sponsorName: 'D', status: 'draft', approvalStatus: 'pending', discountPct: 15 },
  { id: 'e', folio: 'COT-5', sponsorName: 'E', status: 'accepted', approvalStatus: 'none', sentAt: '2026-10-01' },
  { id: 'f', folio: 'COT-6', sponsorName: 'F', status: 'sent', approvalStatus: 'none', sentAt: '2026-10-01', validUntil: '2026-10-20' },
];
const av = avisosDeCotizaciones(Q, '2026-10-25');
ok('seguimiento: enviada hace 7 días sin respuesta', av.some(a => a.cotId === 'a' && /hace 7 días/.test(a.texto)), av);
ok('seguimiento: vence en 2 días es urgente', av.some(a => a.cotId === 'b' && a.nivel === 'alta' && /en 2 días/.test(a.texto)), av);
ok('seguimiento: recién enviada no molesta', !av.some(a => a.cotId === 'c'));
ok('seguimiento: aceptada no sale', !av.some(a => a.cotId === 'e'));
ok('seguimiento: vencida pide renovarla', av.some(a => a.cotId === 'f' && /venció/.test(a.texto)));
ok('el descuento por autorizar sólo le sale a Presidencia', !av.some(a => a.cotId === 'd') && avisosDeCotizaciones(Q, '2026-10-25', { esPresidencia: true }).some(a => a.cotId === 'd' && /15%/.test(a.texto)));

if (fallos) { console.error(`Cotizar QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Cotizar QA OK · ${casos} casos: categorías, carrito, tope de 10%, estados y PDF con inversión`);
