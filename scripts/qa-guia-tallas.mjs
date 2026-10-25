/* Guía de tallas (25/10/2026), sin navegador: qué tablas se enseñan, la
 * talla por edad y que las medidas crezcan en orden (si alguien edita una
 * mal, aquí truena). */
import { GUIA_TALLAS, tablasPara, tallaPorEdad, CONSEJO_TALLA } from '../v2/guia-tallas.js';
let casos = 0, fallos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(' - ' + n + (d !== undefined ? '\n   ' + JSON.stringify(d) : '')); } };

const crece = (l) => l.every((f, i) => i === 0 || (f.pecho > l[i - 1].pecho && f.largo > l[i - 1].largo));
ok('las medidas de niño crecen talla por talla', crece(GUIA_TALLAS.nino));
ok('las medidas de adulto crecen talla por talla', crece(GUIA_TALLAS.adulto));
ok('la 16 de niño es más chica que la M de adulto', GUIA_TALLAS.nino.at(-1).pecho < GUIA_TALLAS.adulto.find(f => f.talla === 'M').pecho);
const jersey = tablasPara(['6', '8', '10', '12', '14', '16', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);
ok('un jersey con tallas de niño y adulto enseña las dos tablas', jersey.hay && jersey.nino.length === 6 && jersey.adulto.length === 6);
ok('sólo adulto enseña sólo adulto', tablasPara(['S', 'M', 'L']).nino.length === 0 && tablasPara(['S', 'M', 'L']).adulto.length === 3);
ok('talla única no lleva guía', !tablasPara(['Universal']).hay && !tablasPara([]).hay);
ok('acepta minúsculas', tablasPara(['s', 'm']).adulto.length === 2);
ok('talla por edad', tallaPorEdad(9) === '10' && tallaPorEdad(6) === '6' && tallaPorEdad(16) === '16' && tallaPorEdad(4) === '6' && tallaPorEdad(18) === 'adulto' && tallaPorEdad('x') === null);
ok('el consejo dice que lo estampado no tiene cambio', /no tiene cambio/.test(CONSEJO_TALLA) && /más grande/.test(CONSEJO_TALLA));

if (fallos) { console.error(`Guía de tallas QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Guía de tallas QA OK · ${casos} casos: tablas por prenda, medidas en orden y talla por edad`);
