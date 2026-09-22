// Los nombres de archivo de foto, contra el patrón que exige la base.
//
// Todos los casos salen de lo que realmente pasó: la pantalla subía
// "profile-<viejo>-opt<nuevo>.webp" y v2_set_player_photo la rechazaba con
// "Invalid photo path". Diez fotos, 27.8 MB descargados, cero guardadas,
// porque la validación ocurre DESPUÉS de subir.
import assert from 'node:assert/strict';
import { rutaDeOriginal, rutaDeMiniatura, rutaValida, miniaturaValida,
         PATRON_FOTO, PATRON_MINI, carpetaDeRuta, nombreDeRuta }
  from '../v2/foto-rutas.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

const ORG = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
const JUG = '5dc1557d-28b4-4413-93ac-e9a46e490ae4';
const VIEJA = `organizations/${ORG}/players/${JUG}/profile-1756000000000.webp`;
const SELLO = 1790102340964;   // 13 dígitos, como Date.now()

prueba('EL CASO: el nombre viejo con "-opt" era el que rechazaba la base', () => {
  const comoAntes = `organizations/${ORG}/players/${JUG}/profile-1756000000000-opt${SELLO}.webp`;
  assert.equal(rutaValida(comoAntes, ORG, JUG), false,
    'si esto pasara, la prueba no estaría cubriendo el bug');
});

prueba('el original recodificado ahora sí cumple', () => {
  const nueva = rutaDeOriginal(VIEJA, SELLO, 'webp');
  assert.equal(nueva, `organizations/${ORG}/players/${JUG}/profile-${SELLO}.webp`);
  assert.equal(rutaValida(nueva, ORG, JUG), true);
});

prueba('y su miniatura también', () => {
  const nueva = rutaDeOriginal(VIEJA, SELLO, 'webp');
  const mini = rutaDeMiniatura(nueva, 'webp');
  assert.equal(mini, `organizations/${ORG}/players/${JUG}/profile-${SELLO}-thumb.webp`);
  assert.equal(miniaturaValida(mini, ORG, JUG), true);
});

prueba('cuando el original NO se reemplaza, la miniatura cuelga del que ya estaba', () => {
  // Una foto que ya pesa bien pero no tiene miniatura: el original se queda.
  const mini = rutaDeMiniatura(VIEJA, 'webp');
  assert.equal(mini, `organizations/${ORG}/players/${JUG}/profile-1756000000000-thumb.webp`);
  assert.equal(miniaturaValida(mini, ORG, JUG), true);
});

prueba('el original nuevo no pisa al viejo', () => {
  assert.notEqual(rutaDeOriginal(VIEJA, SELLO, 'webp'), VIEJA);
});

prueba('se respeta la extensión que salga del recodificado', () => {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    assert.equal(rutaValida(rutaDeOriginal(VIEJA, SELLO, ext), ORG, JUG), true, ext);
    assert.equal(miniaturaValida(rutaDeMiniatura(rutaDeOriginal(VIEJA, SELLO, ext), ext), ORG, JUG), true, ext);
  }
});

prueba('la carpeta se conserva: otra carpeta la rechaza la base', () => {
  const nueva = rutaDeOriginal(VIEJA, SELLO, 'webp');
  assert.equal(carpetaDeRuta(nueva), `organizations/${ORG}/players/${JUG}`);
  assert.equal(rutaValida(nueva, ORG, 'otro-jugador'), false, 'la ruta trae el id del jugador');
  assert.equal(rutaValida(nueva, 'otra-org', JUG), false, 'y el de la organización');
});

prueba('un sello fuera de rango no pasa', () => {
  assert.equal(PATRON_FOTO.test('profile-123.webp'), false, 'menos de 10 dígitos');
  assert.equal(PATRON_FOTO.test(`profile-${'9'.repeat(17)}.webp`), false, 'más de 16');
  assert.equal(PATRON_FOTO.test('profile-1790102340964.webp'), true);
});

prueba('un sello de Date.now() real cae dentro del rango', () => {
  assert.equal(PATRON_FOTO.test(`profile-${Date.now()}.webp`), true);
});

prueba('la miniatura no se confunde con un original', () => {
  assert.equal(PATRON_MINI.test('profile-1790102340964.webp'), false);
  assert.equal(PATRON_FOTO.test('profile-1790102340964-thumb.webp'), false);
});

prueba('nada de rutas a medias', () => {
  assert.equal(rutaValida('', ORG, JUG), false);
  assert.equal(rutaValida(null, ORG, JUG), false);
  assert.equal(rutaValida(`organizations/${ORG}/players/profile-1790102340964.webp`, ORG, JUG), false,
    'le falta un nivel');
  assert.equal(nombreDeRuta(VIEJA), 'profile-1756000000000.webp');
});

if (fallos) { console.error(`Rutas de foto QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Rutas de foto QA OK · ${corridas} casos, incluido el "-opt" que rechazaba la base`);
