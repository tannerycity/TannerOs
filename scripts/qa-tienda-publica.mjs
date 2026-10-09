// El catálogo de la tienda pública (pedido/catalogo.js), sin navegador.
//
// Lo que se protege:
//   1. Las categorías salen de los datos: kits primero, luego las conocidas en
//      su orden, y una categoría nueva ("calcomanias", "mascaras", o cualquier
//      otra) aparece sola con su nombre, sin tocar código.
//   2. Una categoría sin nada no sale (no hay pestañas vacías).
//   3. Las fotos: la tarjeta pide la miniatura, la ficha la completa, sin
//      repetir y por bucket; un producto sin foto no pide nada.
//   4. Un kit se ve con las fotos de sus piezas (hasta cuatro, sin repetir).
//   5. Precio de tarjeta: "Desde" el más bajo cuando hay niño y adulto.
//   6. Tallas en Niño / Adulto / Otras, cada una en su orden.
import { seccionesDeTienda, categoriaDe, etiquetaDe, fotosPorFirmar, fotosDeKit, precioDeTarjeta, gruposDeTallas }
  from '../pedido/catalogo.js';

const fallos = []; let n = 0;
const revisa = (ok, msg) => { n++; if (!ok) fallos.push(msg); };
const P = (id, category, extra = {}) => ({ id, name: id, category, price: 100, ...extra });

// 1 y 2
const sec = seccionesDeTienda({
  bundles: [{ id: 'k1', name: 'Kit Game' }],
  products: [P('calcetas', 'socks'), P('negro', 'jersey'), P('sticker', 'calcomanias'), P('hoodie', 'outerwear'),
             P('short', 'shorts'), P('mascara', 'Máscaras'), P('termo', 'Termos'), P('sincat', null, { name: 'Jersey Rosa' })]
});
revisa(JSON.stringify(sec.map(s => s.clave)) === JSON.stringify(['kits', 'jersey', 'shorts', 'outerwear', 'socks', 'mascaras', 'calcomanias', 'termos']),
  `orden de secciones: ${JSON.stringify(sec.map(s => s.clave))}`);
revisa(sec.find(s => s.clave === 'jersey').items.length === 2, 'un producto sin categoría pero llamado "Jersey" cae en Jerseys');
revisa(etiquetaDe('mascaras') === 'Máscaras' && etiquetaDe('calcomanias') === 'Calcomanías' && etiquetaDe('termos') === 'Termos', 'etiquetas con acento y las nuevas con mayúscula');
revisa(etiquetaDe('outerwear') === 'Chamarras' && etiquetaDe('socks') === 'Calcetas', 'nombres en español de las categorías guardadas en inglés');
revisa(!seccionesDeTienda({ products: [P('a', 'jersey')], bundles: [] }).some(s => s.clave === 'kits'), 'sin kits no hay pestaña de Kits');
revisa(categoriaDe({ category: 'Hoodie' }) === 'outerwear' && categoriaDe({ category: 'Accesorios' }) === 'accesorios', 'sinónimos de categoría');

// 3
const conFoto = P('a', 'jersey', { photoPath: 'o/a.webp', photoThumbPath: 'o/a-thumb.webp', photoBucket: 'tanneros-private' });
const otraIgual = P('b', 'jersey', { photoPath: 'o/a.webp', photoThumbPath: 'o/a-thumb.webp' });
const sinFoto = P('c', 'socks');
const tarjetas = fotosPorFirmar([conFoto, otraIgual, sinFoto]);
revisa(JSON.stringify(tarjetas) === JSON.stringify({ 'tanneros-private': ['o/a-thumb.webp'] }), `tarjetas piden miniatura, sin repetir: ${JSON.stringify(tarjetas)}`);
revisa(JSON.stringify(fotosPorFirmar([conFoto], { completas: true })) === JSON.stringify({ 'tanneros-private': ['o/a.webp'] }), 'la ficha pide la foto completa');
revisa(Object.keys(fotosPorFirmar([sinFoto])).length === 0, 'sin foto no se pide nada');

// 4
const kit = { pieces: [
  { name: 'Jersey A', photoThumbPath: 'o/a-thumb.webp' }, { name: 'Jersey A otra vez', photoThumbPath: 'o/a-thumb.webp' },
  { name: 'Calcetas' }, { name: 'B', photoThumbPath: 'o/b.webp' }, { name: 'C', photoThumbPath: 'o/c.webp' },
  { name: 'D', photoThumbPath: 'o/d.webp' }, { name: 'E', photoThumbPath: 'o/e.webp' }] };
const fk = fotosDeKit(kit);
revisa(fk.length === 4 && fk[0].ruta === 'o/a-thumb.webp' && fk[1].ruta === 'o/b.webp' && fk.every(f => f.bucket === 'tanneros-private'),
  `fotos del kit: ${JSON.stringify(fk)}`);
revisa(fotosDeKit({ pieces: [{ name: 'Sin foto' }] }).length === 0, 'kit sin fotos: nada (sale el escudo)');

// 5
revisa(JSON.stringify(precioDeTarjeta({ price_kid: 1299, price_adult: 1500 })) === '{"desde":true,"monto":1299}', 'kit con dos precios: desde el de niño');
revisa(JSON.stringify(precioDeTarjeta({ price_kid: 0, price_adult: 1500 })) === '{"desde":false,"monto":1500}', 'kit sólo adulto: sin "desde"');

// 6
const g = gruposDeTallas(['XL', '6', 'S', '16', 'Universal', '10']);
revisa(JSON.stringify(g) === JSON.stringify([{ etiqueta: 'Niño', tallas: ['6', '10', '16'] }, { etiqueta: 'Adulto', tallas: ['S', 'XL'] }, { etiqueta: 'Otras', tallas: ['Universal'] }]),
  `grupos de tallas: ${JSON.stringify(g)}`);
revisa(gruposDeTallas(['S', 'M'])[0].etiqueta === '', 'un solo grupo va sin título');

if (fallos.length) { console.error('Tienda pública QA FALLA:\n - ' + fallos.join('\n - ')); process.exit(1); }
console.log(`Tienda pública QA OK · ${n} casos: categorías que salen de los datos, fotos por firmar sin repetir y tallas Niño / Adulto`);
