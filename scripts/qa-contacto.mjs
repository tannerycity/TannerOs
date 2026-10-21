// El contacto del tutor se lee como lo dice la gente.
// Presidencia (21/10/2026) vio "guardian · +524779198191" en el estado de
// cuenta: 61 tutores migrados traían la relación en inglés.
import { relacion, telefonoBonito, telefonoWa } from '../v2/contacto.js';

const casos = [
  ['guardian → Tutor', relacion('guardian'), 'Tutor'],
  ['Guardian con mayúscula → Tutor', relacion(' Guardian '), 'Tutor'],
  ['Madre → Mamá', relacion('Madre'), 'Mamá'],
  ['father → Papá', relacion('father'), 'Papá'],
  ['lo que ya está bien no cambia', relacion('Mamá'), 'Mamá'],
  ['lo desconocido se capitaliza', relacion('padrino'), 'Padrino'],
  ['vacío queda vacío', relacion(null), ''],
  ['+52 y 10 dígitos se lee en 3-3-4', telefonoBonito('+524779198191'), '477 919 8191'],
  ['10 dígitos se lee en 3-3-4', telefonoBonito('4779198191'), '477 919 8191'],
  ['con espacios y guiones también', telefonoBonito('477-919 81 91'), '477 919 8191'],
  ['un número raro se deja como vino', telefonoBonito('12345'), '12345'],
  ['WhatsApp con lada si son 10 dígitos', telefonoWa('477 919 8191'), '524779198191'],
  ['WhatsApp no duplica la lada', telefonoWa('+524779198191'), '524779198191']
];
let fallas = 0;
for (const [n, got, want] of casos) {
  const ok = got === want;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${ok ? '' : ` · da ${JSON.stringify(got)}, se esperaba ${JSON.stringify(want)}`}`);
}
console.log(`\n${casos.length - fallas}/${casos.length} revisiones`);
process.exit(fallas ? 1 : 0);
