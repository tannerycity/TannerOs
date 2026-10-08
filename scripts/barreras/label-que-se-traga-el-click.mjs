// Un <label> no puede envolver botones ni un radiogroup
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// EL DAÑO QUE EVITA, medido el 30 de septiembre de 2026:
//
// El carrusel de posiciones del Tanner vivia dentro de un <label>:
//
//   <label>Posicion
//     <div id="positionRail">…siete botones…</div>
//     <input id="position" type="hidden">
//   </label>
//
// Un <label> etiqueta UN control. Al tocar cualquier cosa dentro de el, el
// navegador reenvia la activacion al control del label. Ese reenvio llega como
// un SEGUNDO click —isTrusted:true, generado por el navegador— despues de que
// setPosicion ya reconstruyo el rail con innerHTML. El boton que se toco ya no
// existe, asi que el reenvio aterriza en el primer chip del rail nuevo: el
// vacio, "Por definir".
//
// Resultado: tocabas "Delantero", quedaba "Por definir", y al guardar se
// mandaba null. A TODOS los Tanners, no solo a los de migracion —en esos se
// noto porque el chip rojo "capturado antes" lo hacia evidente—.
//
// La segunda instancia era mas leve y tambien estaba: el boton "Ver libres"
// del dorsal vivia dentro del label de #jerseyNumber, asi que al tocarlo se
// abria el modal Y el teclado numerico detras.
//
// El humo de la pantalla (scripts/qa-humo-posicion.mjs) prueba el
// comportamiento. Esto es el candado barato que revisa TODAS las pantallas de
// golpe, para que la trampa no reaparezca en otra.
import fs from 'node:fs';
import path from 'node:path';

// Un <label ...> ... <button> o role="radiogroup" ... antes de su </label>.
const TRAMPA = /<label\b[^>]*>(?:(?!<\/label>).)*?(?:<button\b|role="radiogroup")/gis;

function html(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) html(p, salida);
    else if (e.name.endsWith('.html')) salida.push(p);
  }
  return salida;
}

export default function comprobar() {
  const errors = [];
  for (const archivo of html('.')) {
    const texto = fs.readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(TRAMPA)) {
      const linea = texto.slice(0, m.index).split('\n').length;
      const que = /role="radiogroup"/i.test(m[0]) ? 'un radiogroup' : 'un <button>';
      errors.push(
        `${archivo}:${linea}: un <label> envuelve ${que}. El navegador reenvía el click ` +
        `al control del label y se come lo que la persona acaba de elegir. ` +
        `Usa <div class="campo"> con un <span class="campo-etiqueta">, o un <label for="…"> ` +
        `que sólo cubra el control.`);
    }
  }
  return errors;
}
