/* Las reglas de comprar en el club.
 *
 * El caso que da nombre a este archivo es el primero: una talla que nadie
 * eligió no puede viajar como si alguien la hubiera elegido.
 */
import {
  tallaValida, tallasDe, tallaUnica, aceptaPersonalizacion, numeroValido,
  nombreValido, cantidadValida, preparaLinea, llaveDeLinea, agregaAlCarrito,
  quitaDelCarrito, totalDelCarrito, piezasDelCarrito, acomodaVitrina, ordenDeVitrina
} from '../v2/tienda.js';

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

const TALLAS = ['6','8','10','12','14','16','XS','S','M','L','XL','XXL'];
const JERSEY = { id:'p1', name:'Jersey "Wet Blue" - Home Edition', category:'jersey', price:699, sizes:TALLAS };
const CALCETAS = { id:'p2', name:'Par de calcetas', category:'socks', price:200, sizes:['Universal'] };
const SIN_TALLAS = { id:'p3', name:'Producto suelto', category:'otro', price:100, sizes:[] };

/* ===== EL BUG QUE ESTE ARCHIVO EXISTE PARA QUE NO VUELVA =====

   El portal de las familias ofrecía la talla en un <select>, y un <select>
   nace con su primera opción puesta. Mientras el catálogo no tuvo tallas no
   se notó: no había selector y la talla viajaba vacía.

   El día que se capturaron las doce tallas, ese <select> empezó a salir con
   "6". Un papá de un Tanner de catorce que tocara "Agregar" sin abrirlo
   pedía un jersey talla 6, y el pedido se veía normal —con su talla y todo—
   hasta que llegaba la caja del proveedor. */
revisa('una talla que nadie eligió no se convierte en la primera de la lista',
  tallaValida(JERSEY, '') === null && tallaValida(JERSEY, null) === null
  && tallaValida(JERSEY, undefined) === null);
revisa('y sin talla elegida NO deja agregar al carrito',
  preparaLinea(JERSEY, {}).ok === false, JSON.stringify(preparaLinea(JERSEY, {})));
revisa('el motivo se puede leer tal cual en pantalla',
  preparaLinea(JERSEY, {}).motivo === 'Elige la talla.');
revisa('y dice qué es lo que falta, para poder señalarlo',
  preparaLinea(JERSEY, {}).falta === 'talla');
// Lo contrario también importa: una talla que sí eligió tiene que pasar.
revisa('la talla elegida pasa tal cual', tallaValida(JERSEY, '14') === '14');
revisa('con espacios de más también', tallaValida(JERSEY, ' XL ') === 'XL');
// Y una talla inventada no se cuela: un pedido con talla "42" es basura.
revisa('una talla que no está en el catálogo no se acepta',
  tallaValida(JERSEY, '42') === null);
revisa('ni una talla de otro producto', tallaValida(JERSEY, 'Universal') === null);

/* ===== Talla única: no cobrar un clic que no informa ===== */
revisa('las calcetas Universal no obligan a elegir',
  tallaUnica(CALCETAS) === 'Universal');
revisa('y se agregan de un solo toque',
  preparaLinea(CALCETAS, {}).ok === true
  && preparaLinea(CALCETAS, {}).linea.talla === 'Universal');
revisa('un jersey con doce tallas sí obliga a elegir', tallaUnica(JERSEY) === null);

/* ===== Producto sin tallas capturadas ===== */
revisa('sin catálogo de tallas se acepta lo que escriban',
  tallaValida(SIN_TALLAS, 'Mediana') === 'Mediana');
revisa('y se puede agregar sin talla', preparaLinea(SIN_TALLAS, {}).ok === true);

/* ===== Personalización: sólo donde el club estampa ===== */
revisa('un jersey acepta nombre y número', aceptaPersonalizacion(JERSEY));
revisa('unas calcetas no', !aceptaPersonalizacion(CALCETAS));
revisa('un uniforme sí', aceptaPersonalizacion({category:'Conjunto', name:'Uniforme Home'}));
// El kit es el producto estrella del club y lleva jersey: si no acepta
// nombre, es el único que la familia no puede personalizar.
revisa('un kit acepta nombre y número, que es donde más se piden',
  aceptaPersonalizacion({category:'kit', name:'Kit Tanner Completo'}));
revisa('la categoría vieja "Jersey / Playera" también',
  aceptaPersonalizacion({category:'Jersey / Playera', name:'x'}));

revisa('el dorsal acepta de 1 a 3 dígitos',
  numeroValido('7') === '7' && numeroValido('43') === '43' && numeroValido('100') === '100');
revisa('y respeta el 007 si así lo piden', numeroValido('007') === '007');
revisa('pero no acepta letras ni cuatro dígitos',
  numeroValido('7A') === null && numeroValido('1234') === null);
// Un número mal escrito se dice, en vez de estamparse mal o perderse.
{
  const r = preparaLinea(JERSEY, { talla:'12', numero:'abc' });
  revisa('un número inválido no deja agregar, y lo explica',
    r.ok === false && /1 a 3 d/.test(r.motivo) && r.falta === 'numero', JSON.stringify(r));
}
revisa('el nombre se recorta a lo que cabe en una espalda',
  nombreValido('Maximiliano Alejandro de la Torre').length === 20);
revisa('y colapsa los espacios de más', nombreValido('  Juan   Pablo  ') === 'Juan Pablo');
revisa('en calcetas el nombre se ignora aunque lo manden',
  preparaLinea(CALCETAS, { nombre:'Pedro', numero:'9' }).linea.personalizationName === null);

/* ===== Cantidad ===== */
revisa('la cantidad mínima es 1', cantidadValida(0) === 1 && cantidadValida(-3) === 1);
revisa('lo que no es número cae en 1', cantidadValida('x') === 1 && cantidadValida(null) === 1);
revisa('y hay tope de 20', cantidadValida(9999) === 20);
revisa('2.7 no pide 2.7 playeras', cantidadValida(2.7) === 2);
revisa('el total multiplica bien',
  preparaLinea(JERSEY, { talla:'12', cantidad:3 }).linea.total === 699*3);

/* ===== El carrito ===== */
{
  const a = preparaLinea(JERSEY, { talla:'12', nombre:'Matías', numero:'11' }).linea;
  const b = preparaLinea(JERSEY, { talla:'14', nombre:'Matías', numero:'11' }).linea;
  const c = preparaLinea(JERSEY, { talla:'12', nombre:'Matías', numero:'9' }).linea;
  let carrito = agregaAlCarrito({}, a);
  carrito = agregaAlCarrito(carrito, b);
  // El proveedor corta por talla: dos tallas son dos renglones, no uno.
  revisa('dos tallas del mismo modelo son dos renglones',
    Object.keys(carrito).length === 2, JSON.stringify(Object.keys(carrito)));
  carrito = agregaAlCarrito(carrito, c);
  revisa('y dos hermanos con distinto dorsal también',
    Object.keys(carrito).length === 3);
  // Lo idéntico sí se junta.
  carrito = agregaAlCarrito(carrito, a);
  revisa('agregar lo mismo dos veces sube la cantidad, no duplica el renglón',
    Object.keys(carrito).length === 3 && carrito[llaveDeLinea(a)].cantidad === 2);
  revisa('y el total del renglón se recalcula',
    carrito[llaveDeLinea(a)].total === 699*2, JSON.stringify(carrito[llaveDeLinea(a)]));
  revisa('el total del carrito suma todo', totalDelCarrito(carrito) === 699*4);
  revisa('y las piezas se cuentan', piezasDelCarrito(carrito) === 4);
  const menos = quitaDelCarrito(carrito, llaveDeLinea(b));
  revisa('quitar un renglón no toca los demás',
    Object.keys(menos).length === 2 && totalDelCarrito(menos) === 699*3);
  revisa('quitar no muta el carrito original', Object.keys(carrito).length === 3);
}
revisa('un carrito vacío vale cero', totalDelCarrito({}) === 0 && piezasDelCarrito({}) === 0);
revisa('y uno inexistente no truena', totalDelCarrito(null) === 0 && piezasDelCarrito(undefined) === 0);

/* ===== La vitrina: el kit primero =====
   Un club no vende piezas: vende el uniforme. Un papá que acaba de inscribir
   a su hijo quiere lo que necesita para entrenar, no armarlo pieza por pieza. */
{
  const vitrina = acomodaVitrina([
    { name:'Par de calcetas', category:'socks' },
    { name:'Short', category:'shorts' },
    { name:'Kit Tanner Completo', category:'kit' },
    { name:'Jersey "Wet Blue"', category:'jersey' },
    { name:'Hoodie', category:'outerwear' }
  ]);
  revisa('el kit va primero', vitrina[0].name === 'Kit Tanner Completo',
    vitrina.map(x => x.name).join(' | '));
  revisa('luego el jersey, que es lo segundo que más se pide',
    vitrina[1].category === 'jersey', vitrina.map(x => x.category).join(' | '));
  revisa('y el hoodie hasta atrás',
    vitrina[vitrina.length-1].category === 'outerwear', vitrina.map(x => x.category).join(' | '));
}
revisa('una categoría desconocida no se pierde: va al final',
  ordenDeVitrina({category:'loquesea'}) >= ordenDeVitrina({category:'pants'}));
revisa('la vitrina vacía no truena', acomodaVitrina([]).length === 0 && acomodaVitrina().length === 0);
revisa('acomodar no muta la lista original', (() => {
  const orig = [{name:'B',category:'socks'},{name:'A',category:'kit'}];
  acomodaVitrina(orig);
  return orig[0].name === 'B';
})());

/* ===== Un producto que ya no existe ===== */
revisa('sin producto no se arma una línea fantasma',
  preparaLinea(null, {}).ok === false && preparaLinea({}, {}).ok === false);

console.log(fallos
  ? `Tienda QA FAILED · ${fallos} de ${corridas}`
  : `Tienda QA OK · ${corridas} casos, incluido el jersey talla 6 que nadie pidió`);
process.exit(fallos ? 1 : 0);
