/* Indicaciones al registrarse (Presidencia, 12/10/2026).
 *
 * "Cuando se registren, que ahí les diga cómo venir: playera negra, short
 * negro, medias blancas, sin uniformes de otros equipos, y multitacos, no
 * tachones. Para que ya no haya que mandar doble información."
 *
 * Cada club escribe las suyas en Administración (s4); la pantalla de registro
 * terminado las muestra. Aquí sólo se limpian y se arma el bloque.
 */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Del cuadro de texto a la lista: una por renglón, sin vacíos.
export function indicacionesDeTexto(texto) {
  return String(texto || '').split('\n').map(x => x.trim()).filter(Boolean);
}

// Qué impide guardar: null si se puede.
export function problemaConIndicaciones(notas) {
  if (notas.length > 6) return 'Son hasta 6 indicaciones: junta o quita algunas.';
  if (notas.some(x => x.length > 240)) return 'Cada indicación lleva hasta 240 letras.';
  return null;
}

// El bloque que ve la familia al terminar su registro. Vacío si el club no puso nada.
export function bloqueDeIndicaciones(notas) {
  const lista = (Array.isArray(notas) ? notas : []).map(n => String(n ?? '').trim()).filter(Boolean);
  if (!lista.length) return '';
  return `<section class="reg-indicaciones" aria-labelledby="regIndTitulo"><h3 id="regIndTitulo">Para tu primer entrenamiento</h3><ul>${lista.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>`;
}
