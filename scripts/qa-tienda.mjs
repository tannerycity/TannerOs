/* Las reglas de comprar en el club.
 *
 * El caso que da nombre a este archivo es el primero: una talla que nadie
 * eligió no puede viajar como si alguien la hubiera elegido.
 */
import {
  tallaValida, tallasDe, tallaUnica, aceptaPersonalizacion, numeroValido,
  nombreValido, cantidadValida, preparaLinea, llaveDeLinea, agregaAlCarrito,
  quitaDelCarrito, totalDelCarrito, piezasDelCarrito, acomodaVitrina, ordenDeVitrina,
  ESCALA_NINOS, ESCALA_ADULTOS, ESCALA_CLUB, TALLA_UNICA,
  CATEGORIAS, categoriaCanonica, ordenaTallas
} from '../v2/tienda.js';
import { tipoDePieza } from '../v2/produccion/hoja.js';

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


/* ===== La escala del club =====
   Capturarla a mano, doce valores con coma y producto por producto, es donde
   se abandona: por eso la pantalla la ofrece de un toque. Y si la lista no es
   la que confirmó Presidencia, la tienda ofrece tallas que el club no vende. */
revisa('la escala de niños es la del club', ESCALA_NINOS.join(',') === '6,8,10,12,14,16');
revisa('la de adultos también', ESCALA_ADULTOS.join(',') === 'XS,S,M,L,XL,XXL');
revisa('y la escala completa son las doce', ESCALA_CLUB.length === 12);
revisa('sin repetidas', new Set(ESCALA_CLUB).size === 12);

// Alfabéticamente la 10 va antes que la 8 y la S antes que la XS. En una hoja
// de corte eso se lee mal y se corta peor.
revisa('las tallas se ordenan como las ordena el club, no el alfabeto',
  ordenaTallas(['M','8','XS','10','6']).join(',') === '6,8,10,M,XS'.replace('M,XS','XS,M'),
  ordenaTallas(['M','8','XS','10','6']).join(','));
revisa('una talla de fuera de la escala no se pierde: va al final',
  ordenaTallas(['Mediana','12']).join(',') === '12,Mediana', ordenaTallas(['Mediana','12']).join(','));
revisa('ordenar no muta la lista original', (() => {
  const o = ['M','6']; ordenaTallas(o); return o[0] === 'M';
})());

/* ===== EL AMARRE QUE IMPORTA =====

   La categoría no es una etiqueta decorativa: la hoja de producción la lee
   para saber si una pieza es playera, short o calcetas, y con eso decide en
   qué columna cae su talla. Si alguien agrega una categoría al formulario y
   la hoja no sabe leerla, la talla de esa prenda se va a COMENTARIOS y el
   proveedor corta a ojo.

   Por eso TODA categoría que se pueda tocar en el catálogo tiene que ser una
   que la hoja clasifique. Esta prueba une los dos archivos. */
const ESPERADO = { jersey:'jersey', shorts:'short', socks:'calcetas',
                   outerwear:'otra', pants:'otra' };
for (const c of CATEGORIAS) {
  revisa(`la hoja de producción sabe leer "${c.etiqueta}"`,
    tipoDePieza(c.valor) === ESPERADO[c.valor],
    `${c.valor} -> ${tipoDePieza(c.valor)}, se esperaba ${ESPERADO[c.valor]}`);
}
revisa('el catálogo ofrece las cinco categorías de PIEZA del club', CATEGORIAS.length === 5);
revisa('y ninguna repetida', new Set(CATEGORIAS.map(c => c.valor)).size === 5);
// Un kit no es una pieza: se arma en el panel de kits. Dos caminos para lo
// mismo es como nace un "producto" llamado Kit que ningún kit conoce.
revisa('"Kit" NO se ofrece como categoría de producto',
  !CATEGORIAS.some(c => c.valor === 'kit'), CATEGORIAS.map(c => c.valor).join(','));

/* ===== Abrir un producto viejo no lo manda a "Otro" =====
   En la base conviven cinco formas de escribir lo mismo, de la migración y de
   antes. Si al abrirlo no se le prende su botón, parece que no tuviera
   categoría y quien lo guarde se la cambia sin querer. */
revisa('"Jersey / Playera" de la migración se reconoce como jersey',
  categoriaCanonica('Jersey / Playera') === 'jersey');
revisa('"Jersey" con mayúscula también', categoriaCanonica('Jersey') === 'jersey');
revisa('"Conjunto" es un jersey, que es como lo corta el proveedor',
  categoriaCanonica('Conjunto') === 'jersey');
revisa('"Short" y "shorts" caen en el mismo',
  categoriaCanonica('Short') === 'shorts' && categoriaCanonica('shorts') === 'shorts');
revisa('"Calcetas" y "socks" también',
  categoriaCanonica('Calcetas') === 'socks' && categoriaCanonica('socks') === 'socks');
revisa('un hoodie es sudadera', categoriaCanonica('outerwear') === 'outerwear'
  && categoriaCanonica('Chamarra') === 'outerwear');
// Lo que no cuadra NO se fuerza: inventarle categoría a un producto raro es
// peor que dejarlo como lo escribieron.
revisa('lo que no cuadra no se fuerza a una categoría inventada',
  categoriaCanonica('Balón de entrenamiento') === null);
revisa('sin categoría devuelve nada, no una por si acaso',
  categoriaCanonica(null) === null && categoriaCanonica('') === null);
revisa('la talla única del club es Universal', TALLA_UNICA === 'Universal');

console.log(fallos
  ? `Tienda QA FAILED · ${fallos} de ${corridas}`
  : `Tienda QA OK · ${corridas} casos, incluido el jersey talla 6 y las categorías que la hoja debe saber leer`);
process.exit(fallos ? 1 : 0);
