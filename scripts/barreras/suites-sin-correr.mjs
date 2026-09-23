// Ninguna suite se queda sin correr
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// Dos suites (qa-login-credencial y qa-utileria-baja) se perdieron de CI al
// resolver un conflicto entre dos PRs que tocaban el workflow. Siguieron en el
// repo, dejaron de correr, y CI siguio en verde: exactamente el fallo que esas
// suites existian para impedir.
//
// Y esta barrera se perdio a su vez, al resolver OTRO conflicto sobre este
// mismo archivo dos horas despues. El mecanismo de fondo —que el workflow las
// descubra solo— sobrevivio, asi que las suites siguieron corriendo; lo que
// desaparecio fue el vigilante. Dos veces seguidas por la misma via dice que
// el riesgo real de este archivo es la resolucion de conflictos, no el olvido.
//
// Ahora el workflow las descubre solas y esto vigila la unica grieta que
// queda: que alguien silencie una metiendola a la lista de exclusiones. El
// archivo obliga a escribir el motivo, y este contador obliga a que la lista
// no crezca sin que alguien lo note.
// El workflow tiene que seguir descubriendolas solo. Si alguien vuelve a
// escribir la lista a mano, esto lo caza antes de que se pierda otra.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  const suitesEnDisco = fs.readdirSync('scripts').filter(f => /^qa-.*\.mjs$/.test(f)).sort();
  const listaExclusiones = fs.readFileSync('scripts/qa-suites-excluidas.txt', 'utf8');
  const excluidas = listaExclusiones.split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  for (const nombre of excluidas) {
    if (!suitesEnDisco.includes(nombre)) errors.push(`Suites: se excluye "${nombre}", que ya no existe`);
  }
  const flujo = fs.readFileSync('.github/workflows/tanneros-qa.yml', 'utf8');
  if (!flujo.includes("find scripts -maxdepth 1 -name 'qa-*.mjs'"))
    errors.push('Suites: el workflow dejo de descubrirlas solo; una suite nueva podria no correr nunca');
  if (!flujo.includes('qa-suites-excluidas.txt'))
    errors.push('Suites: el workflow ya no lee la lista de exclusiones');

  // Sube a 9 por los cinco humos de navegador (asistencia, familias, montos,
  // conciliacion y evaluacion): necesitan Chromium y el job static-qa no lo
  // instala. Cada vez que este numero sube tiene que ser por una suite que SI
  // se corre a mano antes de subir, no por una que dejo de pasar.
  const MAX_EXCLUIDAS = 9;
  if (excluidas.length > MAX_EXCLUIDAS)
    errors.push(`Suites: hay ${excluidas.length} excluidas y el tope son ${MAX_EXCLUIDAS}. `
      + 'Excluir una suite es ocultarla: arregla lo que falla o sube el tope a proposito.');
  return errors;
}
