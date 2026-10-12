/* Motor de recomendación de la Metodología Tannery (MVP, determinista).
 *
 * Mismas entradas, misma salida: sin azar y sin IA. Devuelve como máximo 3
 * tareas por bloque; el Formador decide.
 *
 *   · Bloques: 60 min = Calentar, Tarea, Jugar; 90 min = Calentar, Tarea 1,
 *     Tarea 2 (escalón alto) y Jugar. Se juega todos los días.
 *   · Candidatas: tareas oficiales del banco correcto (Baby usa el Banco Baby
 *     y sus mundos, nunca los 9 Retos) y de la etapa de la categoría.
 *   · Puntos: Reto principal de la semana +3; secundario o relacionado +2;
 *     nivel que toca en la escalera de esa sesión +1; usada en las últimas
 *     semanas −1 por vez. Empate: la menos usada y luego el orden del banco.
 */

export const NIVELES = ['sin_rival', 'con_rival', 'con_decision', 'en_juego'];

export function bloquesDeSesion(minutos, esBaby = false) {
  if (esBaby) return [
    { key: 'llegada', nombre: 'Llegada activa' },
    { key: 'tarea', nombre: 'Tarea principal', principal: true },
    { key: 'jugar', nombre: 'Partiditos', juego: true }
  ];
  return Number(minutos) >= 75
    ? [{ key: 'calentar', nombre: 'Calentar' },
       { key: 'tarea1', nombre: 'Tarea 1', principal: true, escalon: 0 },
       { key: 'tarea2', nombre: 'Tarea 2', principal: true, escalon: 1 },
       { key: 'jugar', nombre: 'Jugar', juego: true }]
    : [{ key: 'calentar', nombre: 'Calentar' },
       { key: 'tarea', nombre: 'Tarea', principal: true, escalon: 0 },
       { key: 'jugar', nombre: 'Jugar', juego: true }];
}

// Qué nivel de la escalera toca: las primeras sesiones de la semana empiezan
// abajo (sin rival / con rival) y las últimas suben (con decisión / en juego).
export function nivelObjetivo(indiceSesion = 0, totalSesiones = 1, escalon = 0) {
  const total = Math.max(1, totalSesiones);
  const base = total === 1 ? 1 : Math.round((Math.min(indiceSesion, total - 1) / (total - 1)) * 2);
  return NIVELES[Math.min(3, base + escalon)];
}

export function recomienda({ tareas = [], etapa, esBaby = false, reto, secundario = null, bloque = {},
  indiceSesion = 0, totalSesiones = 1, usos = {}, limite = 3 } = {}) {
  const banco = esBaby ? 'baby' : 'tanner';
  const candidatas = tareas.filter(t => t.bank === banco && (t.status ?? 'oficial') === 'oficial'
    && (!etapa || !(t.stages || []).length || (t.stages || []).includes(etapa)));
  const nivel = esBaby ? null : nivelObjetivo(indiceSesion, totalSesiones, bloque.escalon || 0);
  const puntos = t => {
    let p = 0;
    if (reto && t.primary === reto) p += 3;
    else if ((secundario && t.primary === secundario) || (reto && (t.related || []).includes(reto))) p += 2;
    if (nivel && t.level === nivel) p += 1;
    p -= Number(usos[t.id] || 0);
    return p;
  };
  return candidatas
    .map(t => ({ t, p: puntos(t), u: Number(usos[t.id] || 0) }))
    .filter(x => !reto || x.t.primary === reto || x.t.primary === secundario || (x.t.related || []).includes(reto))
    .sort((a, b) => b.p - a.p || a.u - b.u || String(a.t.code).localeCompare(String(b.t.code)))
    .slice(0, limite)
    .map(x => x.t);
}

// Una sesión cuenta como LISTA con Reto u objetivo y al menos una tarea.
// (La misma regla la aplica el servidor; aquí sólo es para avisar antes.)
export function faltaParaLista({ reto, objetivo, items = [] } = {}) {
  const f = [];
  if (!reto && !String(objetivo || '').trim()) f.push('el Reto u objetivo');
  if (!items.some(i => i.taskId || String(i.text || '').trim())) f.push('al menos una tarea');
  return f;
}

// "3 sesiones · 2 listas · 1 pendiente"
export function resumenSemana(sesiones = []) {
  const total = sesiones.length, listas = sesiones.filter(s => s.plan?.status === 'ready').length;
  return { total, listas, pendientes: total - listas, completa: total > 0 && listas === total };
}
