/* Genera el INSERT de la carga inicial de Formación desde los JSON revisables
 * de supabase/semillas/formacion/. El texto de cada tarea viaja tal cual viene
 * del documento: aquí sólo se escapa para SQL.
 *
 * Uso: node scripts/formacion/sql-bancos.mjs <slug-del-club>  > seed.sql
 */
import fs from 'node:fs';

const dir = new URL('../../supabase/semillas/formacion/', import.meta.url);
const lee = f => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
const q = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const arr = a => `array[${(a || []).map(q).join(',')}]::text[]`;

// Baby por edad: una tarea 4–6 también sirve en Mini Baby, donde hay niños de 4.
export function etapasBaby(min, max) {
  const e = [];
  if (min <= 4) e.push('baby_3_4');
  if (max >= 5) e.push('baby_5_6');
  return e;
}
export const ETAPAS_TANNER = ['t6', 't8', 't10', 't12'];

export function sqlSemilla(slug) {
  const cat = lee('catalogo-v1.1.json'), bt = lee('banco-tanner-v1.0.json'), bb = lee('banco-baby-v1.0.json');
  const org = `(select id from public.organizations where slug=${q(slug)})`;
  const orden = {};
  const conceptos = cat.conceptos.map(c => {
    orden[c.kind] = (orden[c.kind] || 0) + 1;
    return `(${org},${q(c.kind)},${q(c.code)},${q(c.name)},${q(c.question)},${q(c.phrase)},${orden[c.kind]},${q(cat.version)},${q(JSON.stringify(c.attrs || {}))}::jsonb)`;
  });
  const tarea = (t, bank, version, fuente) => `(${org},${q(bank)},${q(t.codigo)},${q(version)},${q(t.nombre)},`
    + `${q(bank === 'tanner' ? t.reto : t.mundo)},${q(t.nivel || null)},`
    + `${t.edad_min ?? 'null'},${t.edad_max ?? 'null'},${arr(bank === 'tanner' ? ETAPAS_TANNER : etapasBaby(t.edad_min, t.edad_max))},`
    + `${q(t.buscamos)},${q(t.montaje)},${q(t.juega)},${arr(t.dile)},${q(t.observa)},${q(t.mas_facil)},${q(t.mas_dificil)},`
    + `${q(t.espacio)},${q(t.adapta)},${q(t.video)},'oficial',${q(fuente)})`;
  const tareas = [
    ...bt.tareas.map(t => tarea(t, 'tanner', bt.version, `Banco Tanner v${bt.version}`)),
    ...bb.tareas.map(t => tarea(t, 'baby', bb.version, `Banco Baby Tanners v${bb.version}`))
  ];
  return `insert into app.formation_concepts(organization_id,kind,code,name,question,phrase,sort_order,version,attrs) values\n${conceptos.join(',\n')}\non conflict(organization_id,kind,code) do nothing;\n\n`
    + `insert into app.training_tasks(organization_id,bank,code,version,name,primary_concept,level,age_min,age_max,stages,buscamos,montaje,juega,dile,observa,easier,harder,space_note,adapta,video_guide,status,source) values\n${tareas.join(',\n')}\non conflict(organization_id,bank,code,version) do nothing;\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(sqlSemilla(process.argv[2] || 'tannery-city-fc'));
