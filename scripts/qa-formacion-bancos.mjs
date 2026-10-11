/* La carga inicial de Formación: lo que dicen los documentos, completo y sin mezclar.
 *
 * Banco Tanner: 36 tareas, 9 Retos x 4 niveles, una por nivel en cada Reto.
 * Banco Baby: 24 tareas, 6 por mundo, sin Retos ni niveles (Baby no es un T6 pequeño).
 */
import fs from 'node:fs';
import { sqlSemilla, etapasBaby } from './formacion/sql-bancos.mjs';

const lee = f => JSON.parse(fs.readFileSync(new URL(`../supabase/semillas/formacion/${f}`, import.meta.url), 'utf8'));
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };

const cat = lee('catalogo-v1.1.json').conceptos, bt = lee('banco-tanner-v1.0.json').tareas, bb = lee('banco-baby-v1.0.json').tareas;
const de = k => cat.filter(c => c.kind === k).map(c => c.code);
const RETOS = de('reto'), NIVELES = de('nivel'), MUNDOS = de('mundo_baby');

revisa('exactamente 9 Retos: no existe un décimo', RETOS.length === 9, RETOS.join(','));
revisa('4 niveles, 4 mundos Baby, 8 Recursos, 4 Especialidades, 6 etapas',
  NIVELES.length === 4 && MUNDOS.length === 4 && de('recurso').length === 8 && de('especialidad').length === 4 && de('etapa').length === 6);
revisa('Banco Tanner: 36 tareas con códigos 01 a 36', bt.length === 36 && bt.every((t, i) => t.codigo === String(i + 1).padStart(2, '0')));
for (const r of RETOS) {
  const suyas = bt.filter(t => t.reto === r);
  revisa(`Reto ${r}: 4 tareas, una por nivel`, suyas.length === 4 && NIVELES.every(n => suyas.filter(t => t.nivel === n).length === 1), JSON.stringify(suyas.map(t => t.nivel)));
}
revisa('Banco Baby: 24 tareas, 6 por mundo', bb.length === 24 && MUNDOS.every(m => bb.filter(t => t.mundo === m).length === 6));
revisa('Baby no usa Retos ni niveles', bb.every(t => !t.reto && !t.nivel));
const obligatorios = ['nombre', 'buscamos', 'montaje', 'juega', 'observa', 'mas_facil', 'mas_dificil', 'video'];
const huecos = [...bt, ...bb].flatMap(t => obligatorios.filter(k => !String(t[k] || '').trim()).map(k => `${t.codigo}.${k}`));
revisa('ninguna tarea sin NOMBRE, BUSCAMOS, MONTAJE, JUEGA, OBSERVA, más fácil/difícil ni video', huecos.length === 0, huecos.join(' '));
revisa('toda tarea trae al menos una frase DILE', [...bt, ...bb].every(t => t.dile.length >= 1));
revisa('las frases de DILE vienen sin comillas', [...bt, ...bb].every(t => t.dile.every(f => !/[“”"]/.test(f))));
revisa('una tarea 4–6 años también sirve en Mini Baby; una 3–6 en las dos', JSON.stringify(etapasBaby(4, 6)) === '["baby_3_4","baby_5_6"]' && JSON.stringify(etapasBaby(3, 6)) === '["baby_3_4","baby_5_6"]');
const sql = sqlSemilla('club-qa');
revisa('el SQL carga 60 tareas y 35 conceptos', (sql.match(/'oficial'/g) || []).length === 60 && sql.split('\n').filter(l => l.startsWith("((select id from public.organizations where slug='club-qa'),'")).length >= 35);
revisa('el texto del documento llega intacto', sql.includes("'Haz que la pelota vaya donde tú quieres.'") && sql.includes('¿Ataco o Aseguro?'));

const mig = fs.readFileSync(new URL('../supabase/migrations/20261011211723_c4_formacion_carga_bancos_tannery.sql', import.meta.url), 'utf8');
revisa('la migración aplicada es exactamente lo que generan los JSON', mig.split('\n').slice(4).join('\n') === sqlSemilla('tannery-city-fc'));

console.log(fallos ? `Bancos de Formación FAILED · ${fallos} de ${corridas}` : `Bancos de Formación OK · ${corridas} revisiones: 9 Retos, 36 tareas Tanner, 24 Baby, nada vacío`);
process.exit(fallos ? 1 : 0);
