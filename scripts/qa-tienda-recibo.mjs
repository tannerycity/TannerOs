/* Lo puro del recibo Tanner (29/10/2026): guardar, buscar y textos.
 *   - Se guarda el último primero, sin repetir folio y con tope.
 *   - Lo guardado no lleva teléfono ni correo.
 *   - Lo que se lee del teléfono, si viene roto, no tumba la tienda.
 *   - El mensaje para uno mismo lleva folio, total, CLABE y la liga. */
import { lineasDeRecibo, reciboDe, guardaRecibo, buscaRecibo, leeRecibos, textoParaMi, MAX_RECIBOS, primerNombre } from '../pedido/recibo.js';

let fallas = 0, n = 0;
const revisa = (t, ok) => { n++; if (!ok) { fallas++; console.error(`MAL ${t}`); } };

const lineas = lineasDeRecibo({
  a: { kind: 'product', nombreProducto: 'Jersey Wet Blue', talla: '10', manga: 'Larga', personalizationName: 'LEO', numero: '7', cantidad: 2, precioUnitario: 650 },
  b: { kind: 'bundle', nombreProducto: 'Kit temporada', tier: 'Niño', cantidad: 1, precioUnitario: 1800 } });
revisa('renglones con talla, manga, nombre y número', lineas[0].detalle === 'Talla 10 · Manga larga · LEO #7' && lineas[0].importe === 1300 && lineas[0].cantidad === 2);
revisa('el kit dice para quién', lineas[1].detalle === 'Kit niño' && lineas[1].importe === 1800);

const r = reciboDe({ folio: 'PED-1', id: 'o1', total: 3100, discount: 0, customer_phone: '4771234567' }, { nombre: 'Ana Sofía Ávila', lineas, ahora: new Date('2026-10-29T20:00:00Z') });
revisa('se guarda el nombre, sin teléfono; saluda por el primero', r.nombre === 'Ana Sofía Ávila' && primerNombre(r) === 'Ana' && !JSON.stringify(r).includes('4771234567'));
let lista = [];
for (let i = 0; i < MAX_RECIBOS + 3; i++) lista = guardaRecibo(lista, { ...r, folio: `PED-${i}` });
lista = guardaRecibo(lista, { ...r, folio: 'PED-5', total: 1 });
revisa('el último primero, sin repetir y con tope', lista.length === MAX_RECIBOS && lista[0].folio === 'PED-5' && lista.filter(x => x.folio === 'PED-5').length === 1);
revisa('se encuentra por folio', buscaRecibo(lista, 'PED-5')?.total === 1 && buscaRecibo(lista, 'NO') === null);
revisa('lo roto no tumba la tienda', leeRecibos('{x') .length === 0 && leeRecibos('{"a":1}').length === 0 && leeRecibos(null).length === 0);
const t = textoParaMi({ recibo: r, pago: { filas: [['CLABE', '167210000079567650'], ['Referencia', 'PED-1']] }, liga: 'https://x/#/recibo/PED-1', club: 'Tannery City F.C.' });
revisa('el mensaje para uno mismo', /Folio: PED-1/.test(t) && /\$3,100/.test(t) && /CLABE: 167210000079567650/.test(t) && /#\/recibo\/PED-1/.test(t));

console.log(fallas ? `Tienda recibo (puro): ${fallas} de ${n} fallaron` : `Tienda recibo (puro) OK · ${n} revisiones`);
process.exit(fallas ? 1 : 0);
