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
revisa('"Black Edition" se pinta negra', negra.cuerpo === '#141414', JSON.stringify(negra));
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
const malo = mockupJersey({ nombre: '<img src=x onerror=alert(1)>' });
revisa('lo que se escribe no se cuela como HTML', !/<img/.test(malo) && /&lt;IMG/.test(malo));

console.log(fallos ? `Playera vista previa FAILED · ${fallos} de ${corridas}` : `Playera vista previa OK · ${corridas} revisiones`);
process.exit(fallos ? 1 : 0);
