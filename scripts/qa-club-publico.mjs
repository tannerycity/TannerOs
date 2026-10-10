// Ligas públicas por club (v2/club-publico.js), sin navegador.
import assert from 'node:assert/strict';
import { LLAVE_POR_OMISION, clubDeLaLiga, llaveDeLiga, conClub, ligaPublica } from '../v2/club-publico.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

prueba('sin ?club= sigue siendo Tannery (QR viejos)', () => assert.equal(llaveDeLiga(''), LLAVE_POR_OMISION));
prueba('con ?club= manda el slug', () => assert.equal(llaveDeLiga('?club=Leon-Norte&program=x'), 'leon-norte'));
prueba('un club con basura no se usa', () => {
  assert.equal(clubDeLaLiga('?club=<script>'), '');
  assert.equal(clubDeLaLiga('?club=a'), '');
  assert.equal(llaveDeLiga('?club=%27or%201=1'), LLAVE_POR_OMISION);
});
prueba('conClub agrega el club a ligas propias', () => {
  assert.equal(conClub('/centro-tanner/', 'leon'), '/centro-tanner/?club=leon');
  assert.equal(conClub('/familias/?tab=tienda', 'leon'), '/familias/?tab=tienda&club=leon');
  assert.equal(conClub('/centro-tanner/p/x#a', 'leon'), '/centro-tanner/p/x?club=leon#a');
});
prueba('conClub no toca externas, anclas ni ligas sin club', () => {
  assert.equal(conClub('https://wa.me/52', 'leon'), 'https://wa.me/52');
  assert.equal(conClub('#arriba', 'leon'), '#arriba');
  assert.equal(conClub('//otro.com/x', 'leon'), '//otro.com/x');
  assert.equal(conClub('/centro-tanner/', ''), '/centro-tanner/');
});
prueba('la liga del staff lleva su club', () => {
  assert.equal(ligaPublica('/programas/', { organization_slug: 'leon-norte' }, { program: 'visoria 2014' }, 'https://app.x'),
    'https://app.x/programas/?club=leon-norte&program=visoria+2014');
  assert.equal(ligaPublica('/registro/jugadores/', { organization_slug: 'tannery-city-fc' }, {}, ''), '/registro/jugadores/?club=tannery-city-fc');
  assert.equal(ligaPublica('/academias/', null, {}, ''), '/academias/');
});

if (fallos) { console.error(`Ligas por club QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Ligas por club QA OK · ${corridas} casos: QR viejos, slug, basura, propagación y liga del staff`);
