/* La hoja de producción por modelo.
 *
 * El club arma sus pedidos al proveedor en un Excel con una pestaña por
 * jersey: la imagen del modelo al lado y un renglón por persona con nombre,
 * número, talla de playera y talla de short. Esto vigila que la hoja que
 * genera TannerOS diga lo mismo.
 *
 * Las piezas de los casos salen de una medición real contra producción (un
 * corte armado con los pedidos del club, en un bloque que se revierte): de
 * ahí salió que las categorías vienen en DOS convenciones conviviendo, que un
 * kit puede traer cuatro jerseys distintos, y que el short viaja sin nombre.
 */
import { hojaPorModelo, tipoDePieza, filaDeHoja, resumenDeTallas, nombreDeArchivoHoja }
  from '../v2/produccion/hoja.js';

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

/* ---- Qué es cada pieza ---- */
// Las dos convenciones que conviven de verdad en la base del club.
revisa('la categoría vieja "Jersey / Playera" es un jersey', tipoDePieza('Jersey / Playera') === 'jersey');
revisa('la categoría nueva "jersey" también', tipoDePieza('jersey') === 'jersey');
revisa('un conjunto cuenta como jersey', tipoDePieza('Conjunto') === 'jersey');
revisa('un uniforme también', tipoDePieza('Uniforme') === 'jersey');
revisa('shorts es short', tipoDePieza('shorts') === 'short');
revisa('socks son calcetas', tipoDePieza('socks') === 'calcetas');
revisa('"Calcetas" con mayúscula y acento también', tipoDePieza('Calcetas') === 'calcetas');
revisa('un hoodie no se disfraza de jersey', tipoDePieza('outerwear') === 'otra');
// Sin categoría no se adivina: es una pieza aparte, no un jersey por si acaso.
revisa('sin categoría no se inventa un tipo', tipoDePieza(null) === 'otra');
revisa('vacío tampoco', tipoDePieza('') === 'otra');

/* ---- El caso real: un kit con cuatro jerseys, dos shorts y dos calcetas ---- */
const KIT = 'kit-matias';
const corte = [
  { itemId:'i1', description:'Jersey "Black" Edition', productName:'Jersey "Black Edition"',
    categoria:'Jersey / Playera', talla:'12', nombrePers:'Matías', numero:'11', kitKey:KIT,
    kitName:'Kit Tanner - Completo', quantity:1 },
  { itemId:'i2', description:'Jersey "Lechuguilla" Edition', productName:'Jersey "Lechuguilla Edition"',
    categoria:'Jersey / Playera', talla:'14', nombrePers:'Matías', numero:'11', kitKey:KIT,
    kitName:'Kit Tanner - Completo', quantity:1 },
  { itemId:'i3', description:'Jersey "Pink Cantera" - Away Edition', productName:'Jersey "Pink Cantera" - Away Edition',
    categoria:'jersey', talla:'12', nombrePers:'Matías', numero:'11', kitKey:KIT,
    kitName:'Kit Tanner - Completo', quantity:1 },
  { itemId:'i4', description:'Jersey "Wet Blue" - Home Edition', productName:'Jersey "Wet Blue" - Home Edition',
    categoria:'jersey', talla:'14', nombrePers:'Matías', numero:'11', kitKey:KIT,
    kitName:'Kit Tanner - Completo', quantity:1 },
  // El short viaja sin nombre: el renglón no puede quedarse anónimo por eso.
  { itemId:'i5', description:'Short', productName:'Short', categoria:'shorts', talla:'14',
    nombrePers:null, numero:'11', kitKey:KIT, kitName:'Kit Tanner - Completo', quantity:1 },
  { itemId:'i6', description:'Par de calcetas', productName:'Par de calcetas', categoria:'socks',
    talla:'Universal', nombrePers:null, numero:null, kitKey:KIT, kitName:'Kit Tanner - Completo', quantity:1 },
  // Pieza suelta, fuera de kit: su propio modelo y su propio renglón.
  { itemId:'i7', description:'Jersey "Lechuguilla" Edition', productName:'Jersey "Lechuguilla Edition"',
    categoria:'Jersey / Playera', talla:'Mediana', nombrePers:'El Mister', numero:null,
    kitKey:null, kitName:null, quantity:1 }
];

const grupos = hojaPorModelo(corte);
const porModelo = Object.fromEntries(grupos.map(g => [g.modelo, g]));

revisa('sale una tabla por modelo de jersey, no una por pieza',
  grupos.length === 4, grupos.map(g => g.modelo).join(' | '));
revisa('las tablas salen ordenadas por nombre de modelo',
  grupos.map(g => g.modelo).join('|') ===
  ['Jersey "Black Edition"','Jersey "Lechuguilla Edition"','Jersey "Pink Cantera" - Away Edition','Jersey "Wet Blue" - Home Edition'].join('|'),
  grupos.map(g => g.modelo).join(' | '));

// El short y las calcetas NO encabezan tabla propia: acompañan al jersey.
revisa('el short no abre su propia tabla', !porModelo['Short']);
revisa('las calcetas tampoco', !porModelo['Par de calcetas']);

const lechu = porModelo['Jersey "Lechuguilla Edition"'];
revisa('el mismo modelo junta al del kit y al que lo pidió suelto',
  lechu.renglones.length === 2, JSON.stringify(lechu.renglones));

const matias = lechu.renglones.find(r => r.nombre === 'Matías');
revisa('la talla de la playera cae en su columna', matias?.tallaJersey === '14', JSON.stringify(matias));
revisa('la del short en la suya, aunque el short viniera sin nombre',
  matias?.tallaShort === '14', JSON.stringify(matias));
revisa('el número se conserva', matias?.numero === '11', JSON.stringify(matias));
revisa('las calcetas se dicen en comentarios, no en una columna inventada',
  /Par de calcetas Universal/.test(matias?.comentarios || ''), matias?.comentarios);

const mister = lechu.renglones.find(r => r.nombre === 'El Mister');
revisa('la pieza suelta no hereda el short del kit de al lado',
  mister?.tallaShort === null && mister?.tallaJersey === 'Mediana', JSON.stringify(mister));

// Cada jersey del kit es un renglón del MISMO Matías en su propia tabla.
revisa('cada modelo del kit trae su renglón con su talla',
  porModelo['Jersey "Black Edition"'].renglones[0].tallaJersey === '12'
  && porModelo['Jersey "Wet Blue" - Home Edition'].renglones[0].tallaJersey === '14',
  JSON.stringify(grupos.map(g => [g.modelo, g.renglones[0].tallaJersey])));

/* ---- Que el nombre no se pierda ni se duplique ---- */
revisa('el comentario no repite la misma pieza cuatro veces',
  (matias.comentarios.match(/Par de calcetas/g) || []).length === 1, matias.comentarios);

/* ---- Dos hijos, mismo kit, distinto dorsal ---- */
const hermanos = hojaPorModelo([
  { itemId:'h1', productName:'Jersey "Wet Blue" - Home Edition', categoria:'jersey', talla:'10',
    nombrePers:'Zamora', numero:'7', kitKey:'k1', kitName:'Kit', quantity:1 },
  { itemId:'h2', productName:'Short', categoria:'shorts', talla:'10',
    nombrePers:null, numero:'7', kitKey:'k1', kitName:'Kit', quantity:1 },
  { itemId:'h3', productName:'Jersey "Wet Blue" - Home Edition', categoria:'jersey', talla:'12',
    nombrePers:'Zamora', numero:'9', kitKey:'k1', kitName:'Kit', quantity:1 },
  { itemId:'h4', productName:'Short', categoria:'shorts', talla:'12',
    nombrePers:null, numero:'9', kitKey:'k1', kitName:'Kit', quantity:1 }
]);
revisa('dos hermanos con el mismo apellido no se funden en un renglón',
  hermanos[0].renglones.length === 2, JSON.stringify(hermanos[0].renglones));
revisa('y cada uno se queda con su talla',
  hermanos[0].renglones.every(r => r.tallaJersey === r.tallaShort),
  JSON.stringify(hermanos[0].renglones));

/* ---- El contador no puede contradecir al resumen ---- */
// El encabezado decía "1 pieza" encima de un resumen que listaba la playera
// Y el short. Quien lee el papel deja de creerle al primer número que no
// cuadra.
{
  const g = porModelo['Jersey "Wet Blue" - Home Edition'];
  const enResumen = resumenDeTallas(g).reduce((s, t) => s + t.cantidad, 0);
  revisa('el contador de piezas incluye lo que vino en el kit',
    g.piezas >= enResumen, `encabezado=${g.piezas} resumen=${enResumen}`);
}

/* ---- La fila, ya como papel ---- */
const fila = filaDeHoja(matias, 0);
revisa('la fila numera desde 1, no desde 0', fila.id === '1');
revisa('lo que falta sale como raya, no como hueco',
  filaDeHoja({ nombre:null, numero:null, tallaJersey:null, tallaShort:null, producto:null, comentarios:null }, 3).nombre === '—');
revisa('la columna STATUS va vacía: la llena el proveedor a mano', fila.status === '');

/* ---- El resumen de corte ---- */
const resumen = resumenDeTallas(porModelo['Jersey "Wet Blue" - Home Edition']);
revisa('el resumen dice cuántas piezas cortar por talla',
  resumen.some(r => r.etiqueta === 'playera 14' && r.cantidad === 1), JSON.stringify(resumen));
const resHermanos = resumenDeTallas(hermanos[0]);
revisa('el resumen suma las piezas de la misma talla',
  resHermanos.length === 4 && resHermanos.every(r => r.cantidad === 1), JSON.stringify(resHermanos));

/* ---- Casos de borde ---- */
revisa('un corte vacío no truena', hojaPorModelo([]).length === 0);
revisa('un corte sin argumentos tampoco', hojaPorModelo().length === 0);
const sinProducto = hojaPorModelo([{ itemId:'x', description:'Algo suelto', categoria:null, talla:'M', quantity:1 }]);
revisa('una pieza sin categoría no se cuela como jersey',
  sinProducto[0].renglones[0].tallaJersey === null, JSON.stringify(sinProducto));
revisa('pero sí aparece en la hoja, con su talla en comentarios',
  /Algo suelto M/.test(sinProducto[0].renglones[0].comentarios || ''), JSON.stringify(sinProducto));

revisa('el archivo se llama por el folio del corte',
  nombreDeArchivoHoja('PED-CORTE-01') === 'hoja-de-produccion-PED-CORTE-01.pdf');
revisa('un folio con caracteres raros no arma un nombre inválido',
  nombreDeArchivoHoja('A/B C#1') === 'hoja-de-produccion-A-B-C-1.pdf', nombreDeArchivoHoja('A/B C#1'));

console.log(fallos
  ? `Hoja de producción QA FAILED · ${fallos} de ${corridas}`
  : `Hoja de producción QA OK · ${corridas} casos, incluido el kit de cuatro jerseys que midió el club`);
process.exit(fallos ? 1 : 0);
