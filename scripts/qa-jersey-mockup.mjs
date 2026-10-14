/* La vista previa de la playera en la tienda.
 *
 * Lo que importa: el estampado se lee sobre la playera, un nombre largo no se
 * sale de la espalda y nada de lo que escribe la familia se cuela como HTML.
 */
import { coloresDePlayera, limpiaNombre, limpiaNumero, mockupJersey } from '../v2/jersey-mockup.js';

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

const club = coloresDePlayera({ primario: '#184159', acento: '#9A9169' });
revisa('la playera va en el color del club y el estampado en su acento', club.cuerpo === '#184159' && club.texto === '#9A9169', JSON.stringify(club));
const negra = coloresDePlayera({ nombreProducto: 'Jersey "Black Edition"', primario: '#184159', acento: '#9A9169' });
revisa('"Black Edition" se pinta negra', negra.cuerpo === '#1F1A19' && negra.estilo === 'black', JSON.stringify(negra));
const blanca = coloresDePlayera({ nombreProducto: 'Jersey Blanco', primario: '#184159', acento: '#F4E9C0' });
revisa('si el acento no se lee sobre blanco, el estampado va oscuro', blanca.cuerpo === '#F4F4F2' && blanca.texto === '#111111', JSON.stringify(blanca));
const roto = coloresDePlayera({ primario: 'rojo', acento: null });
revisa('colores inválidos caen en los de siempre', roto.cuerpo === '#012A3A' && roto.ribete === '#C6AC5C', JSON.stringify(roto));

revisa('el nombre va en mayúsculas, sin espacios de sobra, máx. 20', limpiaNombre('  maría   josé ') === 'MARÍA JOSÉ' && limpiaNombre('x'.repeat(30)).length === 20);
revisa('el número sólo dígitos, máx. 3', limpiaNumero('1a0') === '10' && limpiaNumero('12345') === '123');

const vacia = mockupJersey({});
revisa('sin datos enseña "TU NOMBRE" y "10" tenues', /TU NOMBRE/.test(vacia) && (vacia.match(/opacity="0.4"/g) || []).length === 2);
const larga = mockupJersey({ nombre: 'Maximiliano', numero: '7' });
revisa('un nombre largo se comprime a la espalda', /textLength="104"/.test(larga));
revisa('uno corto no se comprime', !/textLength/.test(mockupJersey({ nombre: 'Leo' })));
revisa('el número de 3 cifras baja de tamaño', /font-size="70"/.test(mockupJersey({ numero: '100' })));
// El Lechuguilla real (13/10/2026): rayas verde agua, escudo, "WE ARE TANNERS"
// y el estampado en verde militar.
const lech = coloresDePlayera({ nombreProducto: 'Jersey "Lechuguilla Edition"' });
const svgL = mockupJersey({ nombre: 'Gianluca', numero: '10', colores: lech });
revisa('el Lechuguilla sale con su diseño: rayas, escudo y "WE ARE TANNERS"', lech.estilo === 'lechuguilla' && /<pattern/.test(svgL) && /crest-navy\.png/.test(svgL) && /WE ARE TANNERS/.test(svgL));
revisa('y el nombre y número en verde militar', (svgL.match(/fill="#2F4A35"/g) || []).length >= 2);
// Pink Cantera, Wet Blue y Black Edition (13/10/2026), con su diseño y mangas.
for (const [prod, estilo, texto, marca] of [['Jersey "Pink Cantera"', 'pink', '#FFFFFF', /DISONANTE/], ['Jersey "Wet Blue" - Home Edition', 'wetblue', '#1F3A52', /PROYECTO/], ['Jersey "Black Edition"', 'black', '#C9A96E', /WE ARE TANNERS/]]) {
  const col = coloresDePlayera({ nombreProducto: prod });
  const svg = mockupJersey({ nombre: 'Leo', numero: '7', colores: col });
  revisa(`${prod} sale con su diseño y el estampado en ${texto}`, col.estilo === estilo && marca.test(svg) && (svg.match(new RegExp(`fill="${texto}"`, 'g')) || []).length >= 2, JSON.stringify(col));
}
// Manga larga (14/10/2026): en todos los diseños le sale el antebrazo y el
// puño baja a la muñeca; la corta queda como estaba.
for (const prod of ['Jersey "Lechuguilla Edition"', 'Jersey "Pink Cantera"', 'Jersey "Wet Blue" - Home Edition', 'Jersey "Black Edition"', 'Jersey entrenamiento']) {
  const col = coloresDePlayera({ nombreProducto: prod });
  const corta = mockupJersey({ nombre: 'Zul', numero: '12', colores: col });
  const largaM = mockupJersey({ nombre: 'Zul', numero: '12', colores: col, mangaLarga: true });
  revisa(`${prod}: manga larga con antebrazo y puño en la muñeca`, /data-mockup="manga-larga"/.test(largaM) && /M7 174 L28 176/.test(largaM) && !/M1 82 L30 94/.test(largaM) && /jersey-mockup larga/.test(largaM));
  revisa(`${prod}: la corta no cambia`, !/manga-larga/.test(corta) && (col.estilo === 'wetblue' || /M1 82 L30 94/.test(corta)));
  revisa(`${prod}: con manga larga sigue el nombre y el número`, /ZUL/.test(largaM) && />12</.test(largaM));
}
const lechL = mockupJersey({ colores: coloresDePlayera({ nombreProducto: 'Lechuguilla' }), mangaLarga: true });
revisa('la manga larga del Lechuguilla lleva sus rayas', /fill="url\(#jm\d+r\)"/.test(lechL.split('manga-larga')[1] || ''));
const malo = mockupJersey({ nombre: '<img src=x onerror=alert(1)>' });
revisa('lo que se escribe no se cuela como HTML', !/<img/.test(malo) && /&lt;IMG/.test(malo));

console.log(fallos ? `Playera vista previa FAILED · ${fallos} de ${corridas}` : `Playera vista previa OK · ${corridas} revisiones`);
process.exit(fallos ? 1 : 0);
