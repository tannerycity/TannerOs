/* El motor de recomendación y las reglas de "lista" de Formación. */
import fs from 'node:fs';
import { recomienda, bloquesDeSesion, nivelObjetivo, faltaParaLista, resumenSemana, pasosDeSemana, filtraAlbum, pasosDelFormador, colorDeMundo } from '../v2/formacion/motor.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
const lee = f => JSON.parse(fs.readFileSync(new URL(`../supabase/semillas/formacion/${f}`, import.meta.url), 'utf8')).tareas;
// El catálogo tal como lo devuelve v2_formation_catalog.
const tareas = [
  ...lee('banco-tanner-v1.0.json').map(t => ({ id: 't' + t.codigo, bank: 'tanner', code: t.codigo, name: t.nombre, primary: t.reto, level: t.nivel, stages: ['t6', 't8', 't10', 't12'], status: 'oficial' })),
  ...lee('banco-baby-v1.0.json').map(t => ({ id: 'b' + t.codigo, bank: 'baby', code: t.codigo, name: t.nombre, primary: t.mundo, level: null, stages: ['baby_3_4', 'baby_5_6'], status: 'oficial' }))
];

const r1 = recomienda({ tareas, etapa: 't6', reto: '1v1', bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2 });
revisa('máximo 3 recomendaciones', r1.length === 3, r1.length);
revisa('todas del Reto de la semana', r1.every(t => t.primary === '1v1'), JSON.stringify(r1.map(t => t.primary)));
revisa('la primera sesión empieza abajo en la escalera', r1[0].level === 'sin_rival', r1[0].level);
const r2 = recomienda({ tareas, etapa: 't6', reto: '1v1', bloque: { escalon: 1 }, indiceSesion: 1, totalSesiones: 2 });
revisa('la última sesión sube (con decisión o en juego)', ['con_decision', 'en_juego'].includes(r2[0].level), r2[0].level);
revisa('mismas entradas, misma salida', JSON.stringify(r1) === JSON.stringify(recomienda({ tareas, etapa: 't6', reto: '1v1', bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2 })));
const usada = recomienda({ tareas, etapa: 't6', reto: '1v1', bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2, usos: { t05: 3 } });
revisa('una tarea muy usada baja', usada[0].code !== '05', usada[0].code);
const sec = recomienda({ tareas, etapa: 't10', reto: 'gol', secundario: 'reaccionar', limite: 8 });
revisa('el secundario también entra, después del principal', sec.slice(0, 4).every(t => t.primary === 'gol') && sec.slice(4).every(t => t.primary === 'reaccionar'), JSON.stringify(sec.map(t => t.primary)));
const baby = recomienda({ tareas, etapa: 'baby_3_4', esBaby: true, reto: 'movimiento' });
revisa('Baby recomienda del Banco Baby, nunca de los 9 Retos', baby.length === 3 && baby.every(t => t.bank === 'baby' && t.primary === 'movimiento'), JSON.stringify(baby.map(t => t.bank + ':' + t.primary)));
revisa('una categoría T no recibe tareas Baby', recomienda({ tareas, etapa: 't6', reto: 'balon', limite: 10 }).every(t => t.bank === 'tanner'));
revisa('sin Reto propone del banco de su etapa', recomienda({ tareas, etapa: 't12' }).length === 3);

revisa('60 min: Calentar, Tarea, Jugar', bloquesDeSesion(60).map(b => b.key).join() === 'calentar,tarea,jugar');
revisa('90 min: dos tareas, la segunda un escalón arriba', bloquesDeSesion(90).map(b => b.key).join() === 'calentar,tarea1,tarea2,jugar' && bloquesDeSesion(90)[2].escalon === 1);
revisa('Baby: llegada, tarea y partiditos', bloquesDeSesion(60, true).map(b => b.key).join() === 'llegada,tarea,jugar');
revisa('se juega todos los días', [bloquesDeSesion(60), bloquesDeSesion(90), bloquesDeSesion(60, true)].every(b => b.some(x => x.juego)));
revisa('escalera con 3 sesiones', [0, 1, 2].map(i => nivelObjetivo(i, 3)).join() === 'sin_rival,con_rival,con_decision');

revisa('lista necesita Reto u objetivo y una tarea', faltaParaLista({}).length === 2 && faltaParaLista({ reto: '1v1', items: [{ taskId: 'x' }] }).length === 0);
revisa('un objetivo escrito sirve si no hay Reto', faltaParaLista({ objetivo: 'Perder el miedo al balón', items: [{ text: 'Partido' }] }).length === 0);
revisa('"3 sesiones · 2 listas · 1 pendiente"', JSON.stringify(resumenSemana([{ plan: { status: 'ready' } }, { plan: { status: 'ready' } }, { plan: null }])) === '{"total":3,"listas":2,"pendientes":1,"completa":false}');

// La Semana Tanner en 5 pasos (13/10/2026).
{
  const cats = [{ categoryId: 'a', week: { primary: 'gol', behavior: 'x', status: 'published' } }, { categoryId: 'b', week: null }];
  const st = pasosDeSemana(cats, {});
  revisa('5 pasos: falta el Reto de una categoría, va en el paso 2', st.pasos.length === 5 && st.actual === 2 && st.pasos[1].detalle === '1 de 2');
  const st2 = pasosDeSemana(cats, { b: { primary: '1v1', behavior: '' } });
  revisa('con todos los Retos, sigue decir qué queremos ver', st2.actual === 3 && st2.sinPublicar === 1);
  const st3 = pasosDeSemana(cats, { b: { primary: '1v1', behavior: 'y' } });
  revisa('con todo, falta revisar y publicar', st3.actual === 4);
  const st4 = pasosDeSemana([{ categoryId: 'a', week: { primary: 'gol', behavior: 'x', status: 'published' } }], {});
  revisa('todo publicado: semana lista', st4.actual === 6 && st4.publicadas === 1);
  const st5 = pasosDeSemana([{ categoryId: 'a', week: { primary: 'gol', behavior: 'x', status: 'published' } }], { a: { primary: 'gol', behavior: 'z' } });
  revisa('editar una publicada la regresa a "por revisar"', st5.sinPublicar === 1 && st5.actual === 4);
}
// Álbum de jugadas y pasos del Formador (13/10/2026).
{
  const T = [{ id: 'a', bank: 'tanner', primary: 'gol', level: 'en_juego', code: '02', name: 'Remate', buscamos: 'Definir' },
             { id: 'b', bank: 'tanner', primary: 'gol', level: 'sin_rival', code: '01', name: 'Tiro Ágil', buscamos: 'Golpear' },
             { id: 'c', bank: 'baby', primary: 'juego', level: null, code: '01', name: 'Pío', buscamos: 'Jugar' }];
  revisa('álbum: por banco y ordenado de nivel 1 a 4', filtraAlbum(T, { banco: 'tanner' }).map(t => t.id).join() === 'b,a');
  revisa('álbum: buscar sin acentos', filtraAlbum(T, { banco: 'tanner', busca: 'agil' }).length === 1);
  revisa('álbum: por nivel', filtraAlbum(T, { banco: 'tanner', nivel: 4 }).map(t => t.id).join() === 'a');
  revisa('álbum: cada mundo tiene su color', colorDeMundo('gol') !== colorDeMundo('1v1') && colorDeMundo('balon', 'baby') !== colorDeMundo('balon'));
  const st = pasosDelFormador([{ week: { primary: 'gol' }, plan: { status: 'ready', items: [{ block: 'tarea', taskId: 'x' }] } }, { week: null, plan: { items: [{ block: 'calentar', text: 'Calentar' }] } }]);
  revisa('formador: calentar solo no cuenta como jugada; sigue el paso 1', st.actual === 1 && st.pasos[1].detalle === '1 de 2 sesiones' && st.pasos[2].detalle === '1 de 2 listas');
}
console.log(fallos ? `Motor de Formación FAILED · ${fallos} de ${corridas}` : `Motor de Formación OK · ${corridas} revisiones: 3 recomendaciones, escalera, Baby aparte y reglas de lista`);
process.exit(fallos ? 1 : 0);
