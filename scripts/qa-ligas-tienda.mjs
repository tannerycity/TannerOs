/* LIGAS FÁCILES DE LA TIENDA (28/10/2026).
 *
 * "Los links tienen que ser bien fáciles, memorables, que se sepa qué estás
 * comprando." Se revisa sin navegador:
 *   · cada pieza, kit y categoría tiene su liga /tienda/<nombre>;
 *   · al abrirla, la tienda sabe a qué ficha ir (y si no existe, a la portada);
 *   · la liga para Instagram o WhatsApp lleva sus etiquetas UTM;
 *   · la vista previa de WhatsApp lleva nombre, precio, descripción y foto.
 */
import { createRequire } from 'node:module';
import { slugify, slugDeProducto, slugDeKit, slugDeCategoria, rutaDeLiga, ligaDe } from '../pedido/ligas.js';

const require = createRequire(import.meta.url);
const vista = require('../api/vista-previa.js');
const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });

const CAT = {
  products: [
    { id: 'p1', name: 'Jersey "Black Edition"', slug: 'jersey-black-edition', price: 799, priceKid: 599, description: 'Una armadura.', photoBucket: 'b', photoPath: 'black.webp' },
    { id: 'p2', name: 'The Tanner Cap — Wet Blue', slug: 'the-tanner-cap-wet-blue', price: 550, photoBucket: 'b', photoPath: 'cap.webp' },
    { id: 'p3', name: 'Termo Tanner', slug: null, price: 300 }
  ],
  bundles: [{ id: 'k1', name: 'Kit Dúo', priceAdult: 1500, priceKid: 1299, components: [{ qty: 2, poolName: 'Jersey a elegir', photoBucket: 'b', photoThumbPath: 'duo.webp' }, { qty: 1, name: 'Short' }] }]
};

revisa('slug: sin comillas, acentos ni rayas largas', slugify('The Tanner Cap — Wet Blue') === 'the-tanner-cap-wet-blue' && slugify('Kit Dúo') === 'kit-duo', slugify('Kit Dúo'));
revisa('la pieza usa el nombre corto de la base', slugDeProducto(CAT.products[0]) === 'jersey-black-edition');
revisa('sin nombre corto en la base, sale de su nombre', slugDeProducto(CAT.products[2]) === 'termo-tanner');
revisa('el kit sale de su nombre', slugDeKit(CAT.bundles[0]) === 'kit-duo');
revisa('la categoría con su nombre de tienda', slugDeCategoria('gorras') === 'gorras' && slugDeCategoria('casual') === 'ropa-casual' && slugDeCategoria('jersey') === 'jerseys', slugDeCategoria('jersey'));

revisa('/tienda/the-tanner-cap-wet-blue abre la gorra', rutaDeLiga('/tienda/the-tanner-cap-wet-blue', CAT) === '#/p/p2');
revisa('/tienda/kit-duo abre el kit', rutaDeLiga('/tienda/kit-duo/', CAT) === '#/k/k1');
revisa('/tienda/gorras abre la categoría', rutaDeLiga('/tienda/gorras', CAT) === '#/c/gorras');
revisa('/tienda/jerseys también', rutaDeLiga('/tienda/jerseys', CAT) === '#/c/jersey');
revisa('escrita con mayúsculas o acentos, igual llega', rutaDeLiga('/tienda/Kit-D%C3%BAo', CAT) === '#/k/k1');
revisa('una liga que no existe no truena: portada', rutaDeLiga('/tienda/no-existe', CAT) === null && rutaDeLiga('/tienda/', CAT) === null);

const ig = new URL(ligaDe({ tipo: 'producto', item: CAT.products[1] }, { canal: 'instagram' }));
revisa('la liga es corta y dice qué es', ligaDe({ tipo: 'producto', item: CAT.products[1] }) === 'https://app.tannerycity.com/tienda/the-tanner-cap-wet-blue');
revisa('para Instagram lleva utm_source, medium y campaign', ig.pathname === '/tienda/the-tanner-cap-wet-blue' && ig.searchParams.get('utm_source') === 'instagram' && ig.searchParams.get('utm_medium') === 'social' && ig.searchParams.get('utm_campaign') === 'the-tanner-cap-wet-blue', ig.search);
revisa('otro club se lleva su ?club=', ligaDe({ tipo: 'kit', item: CAT.bundles[0] }, { club: 'leon-norte' }) === 'https://app.tannerycity.com/tienda/kit-duo?club=leon-norte');
revisa('la liga de categoría', ligaDe({ tipo: 'categoria', clave: 'gorras' }) === 'https://app.tannerycity.com/tienda/gorras');

const pieza = vista.buscaPieza(CAT, 'jersey-black-edition');
revisa('[vista previa] encuentra la pieza con su precio de niño', pieza?.nombre === 'Jersey "Black Edition"' && pieza.desde === 599 && pieza.foto === 'black.webp', JSON.stringify(pieza));
const kit = vista.buscaPieza(CAT, 'kit-duo');
revisa('[vista previa] el kit dice lo que incluye', /Incluye 2 Jersey a elegir, Short/.test(kit?.texto || ''), kit?.texto);
const html = vista.armaVistaProducto({ club: 'tannery-city-fc', nombreClub: 'Tannery City', pieza, slug: 'jersey-black-edition', imagen: 'https://img/black.webp', origen: 'https://app.tannerycity.com', tannery: true });
revisa('[vista previa] título con nombre y precio', /<meta property="og:title" content="Jersey &quot;Black Edition&quot; · desde \$599">/.test(html));
revisa('[vista previa] con la foto de la pieza', /og:image" content="https:\/\/img\/black\.webp"/.test(html) && /summary_large_image/.test(html));
revisa('[vista previa] apunta a la liga fácil', /og:url" content="https:\/\/app\.tannerycity\.com\/tienda\/jersey-black-edition"/.test(html));
const otro = vista.armaVistaProducto({ club: 'leon-norte', nombreClub: 'León Norte', pieza: null, categoria: 'Gorras', slug: 'gorras', imagen: null, origen: 'https://app.tannerycity.com', tannery: false });
revisa('[vista previa] categoría de otro club, con su club', /og:url" content="https:\/\/app\.tannerycity\.com\/tienda\/gorras\?club=leon-norte"/.test(otro) && /Gorras · Tienda León Norte/.test(otro));
revisa('[vista previa] nada se inyecta en el HTML', !/<script>alert/.test(vista.armaVistaProducto({ club: 'x', nombreClub: '<script>alert(1)</script>', pieza: null, categoria: 'Gorras', slug: 'gorras', origen: 'https://a', tannery: true })));

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nLigas de tienda FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nLigas de tienda OK · ${casos.length} casos: pieza, kit y categoría con liga fácil, UTM y vista previa con foto y precio`);
