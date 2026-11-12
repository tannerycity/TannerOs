/* La guía de cada Reto, a un toque (12/11/2026).
 *
 * Presidencia: "una i que si le picas te dé un tip... para que todos sepan de
 * qué estamos hablando: 1v1, enseñarle a encarar; gol, distintas formas de
 * rematar". El texto NO se inventó: es la lámina del club "Los 9 Retos Tanner"
 * (Metodología Tannery City, Lámina 02), tal cual: la pregunta en palabras del
 * niño, cómo lo resolvemos en tres pasos y ejemplos de ejercicios.
 *
 * Si Dirección guarda una guía propia en el catálogo (attrs.guia del concepto),
 * esa manda. Los mundos Baby no tienen lámina: no se les inventa una.
 */
export const GUIA_RETOS = {
  balon: { pregunta: '¿Puedo hacer lo que quiero con la pelota?', pasos: ['La conduzco', 'La paro y la paso', 'La uso con los dos pies'], ejercicios: 'Slalom, controles, pases, dominadas.' },
  '1v1': { pregunta: '¿Puedo ganarle al rival?', pasos: ['Lo encaro', 'Hago una finta', 'Lo supero o le quito la pelota'], ejercicios: 'Duelos 1v1, fintas, robos.' },
  jugar_juntos: { pregunta: '¿Puedo ayudarme con mis compañeros?', pasos: ['Doy apoyo', 'Me separo para dar espacio', 'Voy a buscar el gol'], ejercicios: 'Fondos, paredes, 2v1.' },
  cancha: { pregunta: '¿Sé dónde estoy y dónde hay espacio?', pasos: ['Levanto la cabeza', 'Busco espacio', 'Me muevo al lugar correcto'], ejercicios: 'Juegos de ubicación, ocupar espacios.' },
  ventaja: { pregunta: '¿Podemos poner la jugada a nuestro favor?', pasos: ['Veo la ventaja', 'La creo', 'La aprovecho'], ejercicios: '2v1, atraer y pasar.' },
  avanzar: { pregunta: '¿Podemos acercarnos al gol?', pasos: ['Conduzco', 'Paso', 'Cambio de camino'], ejercicios: 'Progresiones, superar líneas.' },
  gol: { pregunta: '¿Podemos terminar la jugada?', pasos: ['Remato', 'Defino con calma', 'Busco rebotes'], ejercicios: 'Finalizaciones, tiros, remates.' },
  defender: { pregunta: '¿Podemos proteger y recuperar?', pasos: ['Presiono', 'Acompaño', 'Protejo la portería'], ejercicios: '1v1 defensivo, coberturas, presión.' },
  reaccionar: { pregunta: '¿Qué hago cuando cambia la jugada?', pasos: ['Si la pierdo, reacciono', 'Si la gano, ataco', 'Si no puedo, me acomodo'], ejercicios: 'Transiciones, robo y salida.' }
};
// "¿Cómo usa un profe estos Retos?", de la misma lámina.
export const COMO_SE_USA = ['Elige 1 Reto principal.', 'Si quieres, agrega 1 Reto extra.', 'Escoge ejercicios que ayuden a resolverlo.', 'Termina jugando para ver si ya salió.'];
export const LEMA_RETOS = 'Primero lo entiende el niño. Después lo nombra el adulto.';

/* La guía de un concepto del catálogo: la del club (attrs.guia) o la lámina.
   Devuelve null si no hay nada que decir (mundos Baby, Retos de otro club). */
export function guiaDeReto(concepto) {
  if (!concepto) return null;
  const propia = concepto.attrs?.guia;
  if (propia && Array.isArray(propia.pasos) && propia.pasos.length) {
    return { pregunta: String(propia.pregunta || concepto.question || ''), pasos: propia.pasos.map(String).slice(0, 5), ejercicios: String(propia.ejercicios || '') };
  }
  if (concepto.kind !== 'reto') return null;
  return GUIA_RETOS[concepto.code] || null;
}
