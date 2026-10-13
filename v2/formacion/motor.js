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

/* La Semana Tanner en 5 pasos (13/10/2026): qué paso sigue y cuánto falta.
   borr = cambios sin publicar por categoría. */
export function pasosDeSemana(cats = [], borr = {}) {
  const w = c => borr[c.categoryId] || c.week || null;
  const n = cats.length;
  const conReto = cats.filter(c => w(c)?.primary).length;
  const conConducta = cats.filter(c => String(w(c)?.behavior || '').trim()).length;
  const sinPublicar = cats.filter(c => w(c)?.primary && (borr[c.categoryId] || c.week?.status !== 'published')).length;
  const publicadas = cats.filter(c => c.week?.status === 'published' && !borr[c.categoryId]).length;
  const pasos = [
    { n: 1, titulo: 'Elige la semana', detalle: 'Con las flechas de arriba', hecho: true },
    { n: 2, titulo: 'Ponle Reto a cada categoría', detalle: `${conReto} de ${n}`, hecho: n > 0 && conReto === n },
    { n: 3, titulo: 'Di qué quieres ver en la cancha', detalle: `${conConducta} de ${n}`, hecho: n > 0 && conConducta === n },
    { n: 4, titulo: 'Revisa tu semana', detalle: sinPublicar ? `${sinPublicar} por revisar` : 'Todo revisado', hecho: n > 0 && conReto === n && !sinPublicar },
    { n: 5, titulo: 'Publica', detalle: publicadas === n && n ? 'Tus Formadores ya la ven' : `${publicadas} de ${n} publicadas`, hecho: n > 0 && publicadas === n }
  ];
  const actual = pasos.find(p => !p.hecho)?.n || 6;
  return { pasos, actual, n, conReto, sinPublicar, publicadas };
}


/* ---- Álbum de jugadas (13/10/2026) ----
   El Banco como un videojuego: cada Reto es un MUNDO con su color, la escalera
   es el NIVEL (1 Sin rival → 4 En juego) y cada tarea es una CARTA con su
   misión y su grito para los niños. */
export const MUNDOS = {
  balon: '#0a84ff', '1v1': '#ff453a', jugar_juntos: '#30d158', cancha: '#64d2ff', ventaja: '#bf5af2',
  avanzar: '#ff9f0a', gol: '#ffd60a', defender: '#5e5ce6', reaccionar: '#ff375f',
  // Baby
  movimiento: '#34c759', juego: '#ff9f0a', convivencia: '#af52de'
};
export const colorDeMundo = (code, bank) => (bank === 'baby' && code === 'balon') ? '#5ac8fa' : (MUNDOS[code] || '#8e8e93');
export const NIVEL_NUM = { sin_rival: 1, con_rival: 2, con_decision: 3, en_juego: 4 };
export function filtraAlbum(tareas = [], { banco = 'tanner', mundo = '', nivel = 0, busca = '' } = {}) {
  const q = String(busca || '').trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sinAcento = v => String(v || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return tareas.filter(t => t.bank === banco
    && (!mundo || t.primary === mundo)
    && (!nivel || NIVEL_NUM[t.level] === Number(nivel))
    && (!q || sinAcento(`${t.name} ${t.buscamos} ${t.juega} ${(t.dile || []).join(' ')}`).includes(q)))
    .sort((a, b) => String(a.primary).localeCompare(String(b.primary)) || (NIVEL_NUM[a.level] || 0) - (NIVEL_NUM[b.level] || 0) || String(a.code).localeCompare(String(b.code)));
}

/* Los pasos del Formador: mismo lenguaje que la Semana Tanner de Dirección. */
const BLOQUES_BASE = ['calentar', 'llegada', 'jugar'];
export function pasosDelFormador(sesiones = []) {
  const n = sesiones.length;
  const conReto = sesiones.filter(s => s.week?.primary || s.plan?.challenge || s.plan?.objective).length;
  const conJugada = sesiones.filter(s => (s.plan?.items || []).some(i => !BLOQUES_BASE.includes(i.block) && (i.taskId || String(i.text || '').trim()))).length;
  const listas = sesiones.filter(s => s.plan?.status === 'ready').length;
  const pasos = [
    { n: 1, titulo: 'Mira el Reto de la semana', detalle: conReto === n ? 'Ya lo tienes' : `${conReto} de ${n}`, hecho: n > 0 && conReto === n },
    { n: 2, titulo: 'Elige tus jugadas', detalle: `${conJugada} de ${n} sesiones`, hecho: n > 0 && conJugada === n },
    { n: 3, titulo: 'Confirma cada sesión', detalle: `${listas} de ${n} listas`, hecho: n > 0 && listas === n },
    { n: 4, titulo: 'Dala en cancha', detalle: 'Modo Cancha, el día', hecho: false, info: true },
    { n: 5, titulo: 'Cierra: ¿apareció?', detalle: 'Un toque al terminar', hecho: false, info: true }
  ];
  const actual = pasos.find(p => !p.hecho && !p.info)?.n || 4;
  return { pasos, actual, n, listas };
}
