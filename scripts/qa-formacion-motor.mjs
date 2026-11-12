/* El motor de recomendación y las reglas de "lista" de Formación. */
import fs from 'node:fs';
import { recomienda, bloquesDeSesion, nivelObjetivo, faltaParaLista, resumenSemana, pasosDeSemana, filtraAlbum, pasosDelFormador, colorDeMundo, recomiendaConPorque, verMas, semanaEnDias, fechaLocal, siguienteReto, planDelMes } from '../v2/formacion/motor.js';

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
// PROP-FC-002 (09/11/2026): por qué, Ver más que respeta el objetivo, calendario.
{
  const nombre = c => ({ '1v1': '1V1', gol: 'Gol', reaccionar: 'Reaccionar', movimiento: 'Movimiento' })[c] || c;
  const a = recomiendaConPorque({ tareas, etapa: 't6', reto: '1v1', bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2, nombre });
  revisa('2. tres opciones, las mismas que el motor de siempre', a.opciones.length === 3 && a.opciones.map(o => o.tarea.id).join() === r1.map(t => t.id).join());
  revisa('2. cada una dice por qué (Reto, nivel y uso)', a.opciones.every(o => o.porque[0] === 'Reto de la semana: 1V1' && o.porque.length >= 2), JSON.stringify(a.opciones[0].porque));
  revisa('2. con 3 válidas no hay aviso', a.aviso === '');
  revisa('2. la primera dice que toca su nivel', a.opciones[0].porque.includes('Toca Sin rival en esta sesión'), JSON.stringify(a.opciones[0].porque));
  const u = recomiendaConPorque({ tareas, etapa: 't6', reto: '1v1', usos: { t05: 1, t06: 1, t07: 1, t08: 1 }, nombre });
  revisa('2. dice cuando ya se usó esta semana', u.opciones.some(o => o.porque.includes('Ya la usaste 1 vez esta semana')));
  const pocas = recomiendaConPorque({ tareas: tareas.filter(t => t.primary !== '1v1' || t.code === '05'), etapa: 't6', reto: '1v1', nombre });
  revisa('2. si sólo hay 1 válida, muestra 1 y explica (no inventa)', pocas.opciones.length === 1 && /tiene 1 tarea del Reto 1V1/.test(pocas.aviso) && /Ver más/.test(pocas.aviso), pocas.aviso);
  const cupo = recomiendaConPorque({ tareas: [{ id: 'x', bank: 'tanner', code: '99', primary: '1v1', level: 'sin_rival', playersMin: 10, stages: [] }, { id: 'y', bank: 'tanner', code: '98', primary: '1v1', level: 'sin_rival', stages: [] }], reto: '1v1', jugadores: 6, nombre });
  revisa('2. jugadores filtra sólo si la ficha lo trae', cupo.opciones.map(o => o.tarea.id).join() === 'y' && /caben con 6 jugadores/.test(cupo.aviso), JSON.stringify(cupo));
  const vacio = recomiendaConPorque({ tareas, etapa: 't99', reto: '1v1', nombre });
  revisa('2. sin tareas de la etapa lo dice', vacio.opciones.length === 0 && /No hay tareas oficiales/.test(vacio.aviso));
  const bb = recomiendaConPorque({ tareas, etapa: 'baby_3_4', esBaby: true, reto: 'movimiento', nombre });
  revisa('2. Baby: dice Mundo, sin niveles de Reto', bb.opciones.length === 3 && bb.opciones.every(o => o.porque[0] === 'Mundo de la semana: Movimiento' && !o.porque.some(p => /Nivel|Toca/.test(p))), JSON.stringify(bb.opciones[0].porque));

  const vm = verMas({ tareas, etapa: 't10', reto: 'gol', secundario: 'reaccionar', excluir: ['t25'], nombre });
  revisa('2. Ver más: primero el Reto de la semana', vm[0].titulo === 'Del Reto Gol' && vm[0].tareas.every(t => t.primary === 'gol') && vm[0].tareas.length === 3, JSON.stringify(vm.map(g => g.titulo + ':' + g.tareas.length)));
  revisa('2. Ver más: no repite las ya mostradas', !vm.flatMap(g => g.tareas).some(t => t.id === 't25'));
  revisa('2. Ver más: luego el secundario, al final los demás', vm[1].tareas.every(t => t.primary === 'reaccionar') && vm[2].titulo === 'Otros' && vm.flatMap(g => g.tareas).length === 35);
  revisa('2. Ver más Baby: sólo Banco Baby', verMas({ tareas, etapa: 'baby_5_6', esBaby: true, reto: 'juego' }).flatMap(g => g.tareas).every(t => t.bank === 'baby'));

  revisa('1. hora local: 19:00 en León del lunes sigue siendo lunes', fechaLocal('2026-11-17T01:00:00Z') === '2026-11-16');
  const dias = semanaEnDias('2026-11-16', [{ sessionId: 'a', startsAt: '2026-11-17T01:00:00Z' }, { sessionId: 'b', startsAt: '2026-11-18T23:00:00Z' }, { sessionId: 'c', startsAt: '2026-11-18T15:00:00Z' }]);
  revisa('1. calendario: 7 días de lunes a domingo', dias.length === 7 && dias[0].fecha === '2026-11-16' && dias[6].fecha === '2026-11-22');
  revisa('1. calendario: cada sesión en su día local y en orden', dias[0].sesiones.map(s => s.sessionId).join() === 'a' && dias[2].sesiones.map(s => s.sessionId).join() === 'c,b', JSON.stringify(dias.map(d => d.sesiones.map(s => s.sessionId))));
  const ses = [{ sessionId: 'a', startsAt: '2026-11-17T01:00:00Z' }, { sessionId: 'b', startsAt: '2026-11-19T01:00:00Z' }];
  revisa('1. calendario y tarjetas son las mismas sesiones (ni una más, ni una menos)', semanaEnDias('2026-11-16', ses).flatMap(d => d.sesiones).length === ses.length);
  revisa('1. cambio de año 2026→2027 sin brincar días', semanaEnDias('2026-12-28', []).map(d => d.fecha).join() === '2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-03');
}
// PROP-FC-002 · Recursos: sólo etiquetas aprobadas, el Reto manda (09/11/2026).
{
  const nombre = c => ({ jugar_juntos: 'Jugar juntos', '1v1': '1V1' })[c] || c;
  const nombreRecurso = c => ({ conduccion: 'Conducción' })[c] || c;
  // El caso de prueba del mapa 04: JUGAR JUNTOS + CONDUCCIÓN.
  const conTags = tareas.map(t => ({ ...t, resources:
    t.code === '10' || t.code === '12' ? [{ code: 'conduccion', relevance: 'principal', status: 'aprobada' }]
    : t.code === '09' || t.code === '11' ? [{ code: 'conduccion', relevance: 'complementaria', status: 'aprobada' }]
    : t.code === '05' ? [{ code: 'conduccion', relevance: 'principal', status: 'sugerida' }] : [] }));
  const jj = recomiendaConPorque({ tareas: conTags, etapa: 't10', reto: 'jugar_juntos', recurso: 'conduccion', nombre, nombreRecurso });
  revisa('recurso: JUGAR JUNTOS + CONDUCCIÓN sube las principales', jj.opciones.slice(0, 2).every(o => ['10', '12'].includes(o.tarea.code)), JSON.stringify(jj.opciones.map(o => o.tarea.code)));
  revisa('recurso: dice si es principal o complementario', jj.opciones[0].porque.includes('Recurso principal: Conducción') && jj.opciones.some(o => o.porque.includes('Recurso complementario: Conducción')), JSON.stringify(jj.opciones.map(o => o.porque)));
  revisa('recurso: nunca trae tareas de otro Reto', jj.opciones.every(o => o.tarea.primary === 'jugar_juntos'));
  const solo = recomiendaConPorque({ tareas: conTags, etapa: 't10', reto: '1v1', recurso: 'conduccion', nombre, nombreRecurso });
  revisa('recurso: una etiqueta SUGERIDA no cuenta (falta aprobación de Dirección)', !solo.opciones.some(o => o.porque.some(p => /Recurso/.test(p))) && /Ninguna tiene aún el recurso Conducción aprobado/.test(solo.aviso), JSON.stringify(solo));
  revisa('recurso: sin recurso, el orden de siempre', JSON.stringify(recomiendaConPorque({ tareas: conTags, etapa: 't6', reto: '1v1', bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2 }).opciones.map(o => o.tarea.id)) === JSON.stringify(r1.map(t => t.id)));
}
{
  // Plan del mes y piloto automático (h90, 12/11/2026): el Reto que sigue.
  const R = ['balon', '1v1', 'jugar_juntos'];
  revisa('sigue: sin historia empieza por el primero', siguienteReto(R, null) === 'balon');
  revisa('sigue: después de uno va el siguiente', siguienteReto(R, 'balon') === '1v1');
  revisa('sigue: después del último vuelve al primero', siguienteReto(R, 'jugar_juntos') === 'balon');
  revisa('sigue: un código que ya no existe no truena', siguienteReto(R, 'viejo') === 'balon' && siguienteReto([], 'x') === null);
  const mes = planDelMes(R, [{ weekStart: 'a', primary: '1v1', status: 'published' }, { weekStart: 'b', primary: null }, { weekStart: 'c', primary: 'balon', status: 'draft' }, { weekStart: 'd', primary: null }]);
  revisa('mes: lo publicado se respeta y se marca', mes[0].primary === '1v1' && mes[0].publicada && !mes[0].propuesta);
  revisa('mes: lo vacío sigue la secuencia desde la semana anterior', mes[1].primary === 'jugar_juntos' && mes[1].propuesta && !mes[1].publicada);
  revisa('mes: un borrador se respeta pero no cuenta como publicado', mes[2].primary === 'balon' && !mes[2].publicada && !mes[2].propuesta);
  revisa('mes: y la que sigue parte del borrador', mes[3].primary === '1v1');
}
console.log(fallos ? `Motor de Formación FAILED · ${fallos} de ${corridas}` : `Motor de Formación OK · ${corridas} revisiones: 3 recomendaciones, escalera, Baby aparte y reglas de lista`);
process.exit(fallos ? 1 : 0);
