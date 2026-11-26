/* FILTROS Y "TAMBIÉN TE PUEDE GUSTAR" DE LA TIENDA (25/11/2026): sin DOM.
 *   · colores por campo o por nombre; tallas y precio de lo que hay en la vista;
 *   · "o" dentro de un grupo, "y" entre grupos; chips que se quitan;
 *   · relacionados: lo que combina primero, nunca la misma pieza, máximo 4.
 */
import { coloresDe, opcionesDeFiltros, aplicaFiltros, chipsDe, quitaFiltro, ajustaRango, vacios, hayFiltros } from '../pedido/filtros.js';
import { relacionadosDe } from '../pedido/catalogo.js';

const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });
const P = (id, name, category, price, sizes, extra = {}) => ({ id, name, category, price, sizes, ...extra });
const prods = [
  P('p1', 'Jersey "Black Edition"', 'jersey', 799, ['8', 'M', 'L']),
  P('p2', 'Jersey "Pink Cantera"', 'jersey', 699, ['10', 'S', 'M']),
  P('p3', 'Short oficial', 'shorts', 349, ['M', 'L']),
  P('p4', 'Gorra', 'gorras', 399, ['Única'], { color: 'Negro' }),
  P('p5', 'Calcetas', 'socks', 149, ['M'])
];
const kits = [{ id: 'k1', name: 'Kit Lechuguilla', pieces: [] }];
const items = prods.map(item => ({ tipo: 'producto', item }));
const ACC = { precio: it => it.item.price, tallas: it => it.item.sizes };

revisa('color por nombre: Black Edition es negro', coloresDe(prods[0]).join() === 'negro');
revisa('color por nombre: Pink Cantera es rosa', coloresDe(prods[1]).join() === 'rosa');
revisa('color por campo manda sobre el nombre', coloresDe(prods[3]).join() === 'negro');
revisa('kit: Lechuguilla es verde', coloresDe(kits[0]).join() === 'verde');
revisa('sin color reconocible: ninguno', coloresDe(prods[2]).length === 0);

const op = opcionesDeFiltros(items, ACC);
revisa('tallas agrupadas Niño / Adulto / Otras', op.tallas.map(g => g.etiqueta).join() === 'Niño,Adulto,Otras', op.tallas.map(g => g.etiqueta).join());
revisa('sólo los colores que existen, en orden de la paleta', op.colores.map(c => c.clave).join() === 'negro,rosa', op.colores.map(c => c.clave).join());
revisa('rango redondeado a $50 hacia afuera', op.min === 100 && op.max === 800, `${op.min}-${op.max}`);

const nombres = f => aplicaFiltros(items, { ...vacios(), ...f }, ACC).map(x => x.item.id).join();
revisa('sin filtros: todo', nombres({}) === 'p1,p2,p3,p4,p5');
revisa('talla M o L', nombres({ tallas: ['M', 'L'] }) === 'p1,p2,p3,p5');
revisa('talla M y color negro', nombres({ tallas: ['M'], colores: ['negro'] }) === 'p1');
revisa('hasta $400', nombres({ max: 400 }) === 'p3,p4,p5');
revisa('de $350 a $700', nombres({ min: 350, max: 700 }) === 'p2,p4');

const f = { tallas: ['M'], colores: ['rosa'], min: 300, max: 700 };
const chips = chipsDe(f);
revisa('chips: talla, color y precio', chips.map(c => c.texto).join('|') === 'Talla M|Rosa|$300 – $700', chips.map(c => c.texto).join('|'));
revisa('chip de sólo máximo', chipsDe({ ...vacios(), max: 500 })[0]?.texto === 'Hasta $500');
const sinRosa = quitaFiltro(f, { tipo: 'color', valor: 'rosa' });
revisa('quitar un chip no toca lo demás ni los filtros de antes', sinRosa.colores.length === 0 && sinRosa.tallas.join() === 'M' && f.colores.join() === 'rosa');
revisa('quitar el precio quita mínimo y máximo', (x => x.min == null && x.max == null)(quitaFiltro(f, { tipo: 'precio' })));
revisa('rango completo no es filtro', !hayFiltros(ajustaRango(vacios(), 100, 800, op)));
revisa('rango al revés se acomoda', (x => x.min === 300 && x.max === 600)(ajustaRango(vacios(), 600, 300, op)));

const rel = relacionadosDe({ tipo: 'producto', item: prods[0] }, { products: prods, bundles: kits });
revisa('relacionados de un jersey: short, calcetas, kit, gorra', rel.map(x => x.item.id).join() === 'p3,p5,k1,p4', rel.map(x => x.item.id).join());
revisa('nunca la misma pieza y máximo 4', rel.length === 4 && !rel.some(x => x.item.id === 'p1'));
const relKit = relacionadosDe({ tipo: 'kit', item: kits[0] }, { products: prods, bundles: kits });
revisa('relacionados de un kit: sin el kit mismo', !relKit.some(x => x.tipo === 'kit') && relKit[0].item.id === 'p4');
revisa('sin catálogo no truena', relacionadosDe({}, {}).length === 0 && aplicaFiltros([], null, ACC).length === 0);

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nFiltros de tienda FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nFiltros de tienda OK · ${casos.length} casos: colores, tallas, precio, chips y relacionados`);
