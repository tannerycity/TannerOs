// Auditoría escapa lo que viene de la base (22/11/2026).
// actor_label es el nombre que cada quien escribe en su cuenta. Se pintaba
// tal cual en la tabla de Auditoría (la ve Presidencia): un nombre con código
// se ejecutaba al abrirla. Esto revisa, sin navegador, que cada campo de la
// fila pase por esc() y que esc() de verdad neutralice HTML.
import { readFileSync } from 'node:fs';

const src = readFileSync('v2/admin/auditoria/app.js', 'utf8');
let fallos = 0;
const revisa = (n, ok) => { if (!ok) { fallos++; console.error(` - ${n}`); } };

const campos = ['event_type', 'aggregate_type', 'aggregate_id', 'actor_label', 'actor_role', 'request_id'];
for (const c of campos) {
  const crudo = new RegExp(`\\$\\{r\\.${c}\\b(?!\\s*\\?)`);
  revisa(`${c} no se pinta crudo`, !crudo.test(src));
  revisa(`${c} pasa por esc()`, new RegExp(`esc\\(r\\.${c}\\b`).test(src));
}
const m = src.match(/const esc=(v=>.*?\}\[c\]\)\));/);
revisa('existe esc()', !!m);
if (m) {
  const esc = eval(m[1]);
  const sucio = '<img src=x onerror="alert(1)">';
  revisa('esc() neutraliza etiquetas y comillas', !/[<>"]/.test(esc(sucio)) && esc(sucio).includes('&lt;img'));
  revisa('esc() deja texto normal igual', esc('Zulema García') === 'Zulema García');
  revisa('esc() con vacío no truena', esc(null) === '' && esc(undefined) === '');
}
console.log(fallos ? `Auditoría escapa FAILED · ${fallos}` : 'Auditoría escapa OK · 15 revisiones: seis campos escapados, etiquetas, comillas, texto normal y vacíos');
process.exit(fallos ? 1 : 0);
