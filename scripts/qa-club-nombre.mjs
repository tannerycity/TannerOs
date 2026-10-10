// Nombre del club (v2/club.js), sin navegador.
import assert from 'node:assert/strict';
import { nombreDelClub, nombreCorto } from '../v2/club.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

prueba('sale del contexto', () => assert.equal(nombreDelClub({ organization_name: ' Club León Norte ' }), 'Club León Norte'));
prueba('sin contexto usa la marca aplicada', () => {
  globalThis.__tosBranding = { brand: 'Halcones FC' };
  assert.equal(nombreDelClub(null), 'Halcones FC');
  delete globalThis.__tosBranding;
});
prueba('sin nada no inventa un club', () => assert.equal(nombreDelClub({}), 'el club'));
prueba('nombre corto para el marcador', () => {
  assert.equal(nombreCorto({ organization_name: 'Tannery City FC' }), 'Tannery');
  assert.equal(nombreCorto({ organization_name: 'Club Atlético León' }), 'Atlético');
  assert.equal(nombreCorto({ organization_name: 'F.C. Halcones' }), 'Halcones');
  assert.ok(nombreCorto({ organization_name: 'Supercalifragilisticoespialidoso' }).length <= 14);
});

if (fallos) { console.error(`Nombre del club QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Nombre del club QA OK · ${corridas} casos: contexto, marca, sin datos y nombre corto`);
