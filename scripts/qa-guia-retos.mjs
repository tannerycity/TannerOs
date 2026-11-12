/* La guía de cada Reto (12/11/2026): lo que sale al tocar la "i".
 * Sale de la lámina del club "Los 9 Retos Tanner"; aquí se cuida que estén los
 * nueve, cada uno con su pregunta, sus tres pasos y ejemplos, que Baby no
 * reciba la guía de un Reto por compartir código, y que la guía propia de
 * Dirección mande sobre la lámina. */
import { GUIA_RETOS, COMO_SE_USA, LEMA_RETOS, guiaDeReto } from '../v2/formacion/guia-retos.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
const NUEVE = ['balon', '1v1', 'jugar_juntos', 'cancha', 'ventaja', 'avanzar', 'gol', 'defender', 'reaccionar'];

revisa('están los 9 Retos y ninguno de más', JSON.stringify(Object.keys(GUIA_RETOS)) === JSON.stringify(NUEVE), Object.keys(GUIA_RETOS).join());
for (const c of NUEVE) {
  const g = GUIA_RETOS[c];
  revisa(`${c}: pregunta, tres pasos y ejemplos`, /^¿.+\?$/.test(g.pregunta) && g.pasos.length === 3 && g.pasos.every(p => p.trim().length > 3) && g.ejercicios.trim().length > 5, JSON.stringify(g));
}
revisa('1v1 habla de encarar y Gol de rematar', GUIA_RETOS['1v1'].pasos[0] === 'Lo encaro' && GUIA_RETOS.gol.pasos[0] === 'Remato');
revisa('cómo usa un profe los Retos: 4 pasos, y el lema', COMO_SE_USA.length === 4 && /Termina jugando/.test(COMO_SE_USA[3]) && /Primero lo entiende el niño/.test(LEMA_RETOS));
revisa('un Reto del catálogo trae su guía', guiaDeReto({ kind: 'reto', code: 'gol' })?.pasos.length === 3);
revisa('un mundo Baby con el mismo código NO recibe la guía del Reto', guiaDeReto({ kind: 'mundo_baby', code: 'balon', attrs: {} }) === null);
revisa('un Reto que la lámina no conoce no inventa nada', guiaDeReto({ kind: 'reto', code: 'otro' }) === null && guiaDeReto(null) === null);
const propia = guiaDeReto({ kind: 'mundo_baby', code: 'balon', question: '¿Juego con la pelota?', attrs: { guia: { pasos: ['La toco', 'La sigo'], ejercicios: 'Juegos libres.' } } });
revisa('la guía propia de Dirección manda, también en Baby', propia?.pasos.join() === 'La toco,La sigo' && propia.pregunta === '¿Juego con la pelota?' && propia.ejercicios === 'Juegos libres.', JSON.stringify(propia));

console.log(fallos ? `Guía de Retos FAILED · ${fallos} de ${corridas}` : `Guía de Retos OK · ${corridas} revisiones: los 9 Retos con pregunta, tres pasos y ejemplos; Baby aparte`);
process.exit(fallos ? 1 : 0);
