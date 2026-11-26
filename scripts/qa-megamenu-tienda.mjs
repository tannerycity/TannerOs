/* MEGA MENÚ DE LA TIENDA (25/11/2026): la parte sin DOM.
 *   · tres columnas (Uniforme, Ropa del club, Accesorios) sólo con lo que hay;
 *   · cada liga con icono, nombre, descripción y su categoría;
 *   · una categoría nueva del club cae en Accesorios con su nombre;
 *   · la tarjeta destacada: banner > kit con foto > pieza con foto > nada.
 */
import { columnasDelMenu, destacadoDelMenu, COLUMNAS_MENU } from '../pedido/megamenu.js';
import { seccionesDeTienda } from '../pedido/catalogo.js';

const casos = [];
const revisa = (n, ok, d = '') => casos.push({ n, ok, d });

const CAT = {
  bundles: [{ id: 'k1', name: 'Kit Local', pieces: [{ name: 'Jersey', photoThumbPath: 'j.webp' }] }],
  products: [
    { id: 'p1', name: 'Jersey Local', category: 'jersey', photoPath: 'p1.webp' },
    { id: 'p2', name: 'Gorra', category: 'gorras' },
    { id: 'p3', name: 'Sudadera', category: 'sudadera' },
    { id: 'p4', name: 'Bufanda', category: 'bufandas' }
  ]
};
const cols = columnasDelMenu(seccionesDeTienda(CAT));
revisa('tres columnas en su orden', cols.map(c => c.clave).join() === 'uniforme,ropa,accesorios', cols.map(c => c.clave).join());
revisa('Uniforme: kits y jerseys, sin shorts vacíos', cols[0].ligas.map(l => l.clave).join() === 'kits,jersey', cols[0].ligas.map(l => l.clave).join());
revisa('Ropa: la sudadera cae en Chamarras', cols[1].ligas[0]?.etiqueta === 'Chamarras');
revisa('Accesorios: gorras y la categoría nueva al final', cols[2].ligas.map(l => l.clave).join() === 'gorras,bufandas', cols[2].ligas.map(l => l.clave).join());
const g = cols[2].ligas[0];
revisa('cada liga con icono, descripción y destino', g.icono === 'gorra' && g.descripcion && g.href === '#/c/gorras');
revisa('categoría nueva: con su nombre y cuántas piezas', cols[2].ligas[1].etiqueta === 'Bufandas' && cols[2].ligas[1].descripcion === '1 pieza');
revisa('una columna vacía no sale', columnasDelMenu(seccionesDeTienda({ products: [{ id: 'x', category: 'gorras' }] })).map(c => c.clave).join() === 'accesorios');
revisa('sin catálogo no truena', columnasDelMenu(null).length === 0 && columnasDelMenu([]).length === 0);
revisa('las columnas son tres', COLUMNAS_MENU.length === 3);

const conBanner = destacadoDelMenu({ banners: [{ title: 'Black Edition', subtitle: 'Ya llegó', imagePath: 'b.webp', imageDesktopPath: 'bd.webp', targetKind: 'producto', targetValue: 'p1' }], catalogo: CAT });
revisa('destacado: el primer banner, con la foto de compu', conBanner?.tipo === 'banner' && conBanner.foto.ruta === 'bd.webp' && conBanner.href === '#/p/p1' && conBanner.cta === 'Comprar');
const conKit = destacadoDelMenu({ banners: [{ title: '', imagePath: 'x.webp' }], catalogo: CAT });
revisa('destacado: sin banner válido, el kit con foto', conKit?.tipo === 'kit' && conKit.href === '#/k/k1' && conKit.foto.ruta === 'j.webp');
const conPieza = destacadoDelMenu({ catalogo: { products: CAT.products } });
revisa('destacado: sin kit, la primera pieza con foto', conPieza?.tipo === 'producto' && conPieza.href === '#/p/p1');
revisa('destacado: sin fotos, no hay tarjeta', destacadoDelMenu({ catalogo: { products: [{ id: 'z', name: 'Z' }] } }) === null && destacadoDelMenu() === null);

const fallas = casos.filter(c => !c.ok);
for (const c of casos) console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.n}${c.ok ? '' : ` · ${c.d}`}`);
if (fallas.length) { console.error(`\nMega menú de tienda FALLÓ · ${fallas.length} de ${casos.length}`); process.exit(1); }
console.log(`\nMega menú de tienda OK · ${casos.length} casos: columnas, ligas y tarjeta destacada`);
