// Una pantalla que pregunta "¿seguro?" tiene que cargar el cuadro que pregunta
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// EL DAÑO QUE EVITA, medido el 12 de noviembre de 2026:
//
// Presidencia: "no sirve el botón de borrar". En Staff, "Eliminar del staff"
// llamaba a window.tosConfirm?.(...) y la pagina nunca cargaba
// /v2/tos-dialog.js, que es quien define tosConfirm. Con el "?." la llamada
// devolvia undefined, el codigo lo leia como "dijo que no" y salia callado:
// ni cuadro, ni error, ni nada. El boton llevaba semanas sin funcionar.
//
// El humo de Staff no lo vio porque ponia su propio window.tosConfirm de
// mentira antes de tocar el boton.
//
// La regla: si el codigo de una pantalla usa tosConfirm, tosAlert o tosPrompt,
// su index.html carga /v2/tos-dialog.js.
import fs from 'node:fs';
import path from 'node:path';

const USA = /\btos(?:Confirm|Alert|Prompt)\b/;

function carpetas(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    salida.push(p); carpetas(p, salida);
  }
  return salida;
}

export default function comprobar() {
  const errors = [];
  for (const dir of carpetas('v2')) {
    const pagina = path.join(dir, 'index.html');
    if (!fs.existsSync(pagina)) continue;
    const html = fs.readFileSync(pagina, 'utf8');
    if (/\/v2\/tos-dialog\.js/.test(html)) continue;
    const quien = fs.readdirSync(dir).filter(f => f.endsWith('.js')).find(f => USA.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    if (USA.test(html) || quien) {
      errors.push(`${pagina}: ${quien ? path.join(dir, quien) : 'la página'} pide confirmación con tosConfirm/tosAlert/tosPrompt ` +
        `pero la página no carga /v2/tos-dialog.js. El botón no hace nada. Agrega <script src="/v2/tos-dialog.js"></script>.`);
    }
  }
  return errors;
}
