// Genera el SQL de h76 (Recursos del Futbolista) desde
// supabase/semillas/formacion/recursos-v0.1.json (PROP-FC-002, mapa 04).
//
//   node scripts/formacion/sql-recursos.mjs tannery-city-fc            -> comprueba
//   node scripts/formacion/sql-recursos.mjs tannery-city-fc --imprime  -> lo escribe en pantalla
//
// h76 ya corrió en producción (09/11/2026): un archivo aplicado no se edita.
// Por eso, sin --imprime, este script sólo COMPRUEBA que la migración siga
// siendo exactamente lo que sale de la semilla.
//
// Sin reescribir: nombres y precauciones tal como vienen en la semilla.
// Idempotente: correrlo dos veces no duplica nada.
import fs from 'node:fs';

const slug = process.argv[2] || 'tannery-city-fc';
const raiz = new URL('../../', import.meta.url);
const sem = JSON.parse(fs.readFileSync(new URL('supabase/semillas/formacion/recursos-v0.1.json', raiz), 'utf8'));
const q = v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const js = o => `${q(JSON.stringify(o))}::jsonb`;
const org = `(select id from public.organizations where slug=${q(slug)})`;

const familias = sem.familias.map((f, i) => `(${org},'familia_recurso',${q(f.code)},${q(f.name)},null,${q(f.precaucion)},${i + 1},${q(sem.version)},${js({ retos: f.retos, transversal: !!f.transversal, estado: sem.estado, fuente: 'PROP-FC-002 · 04' })})`);
const recursos = sem.familias.flatMap(f => f.recursos.map(([code, name], i) =>
  `(${org},'recurso',${q(code)},${q(name)},null,null,${100 + i},${q(sem.version)},${js({ familia: f.code, estado: sem.estado })})`));
const tags = sem.sugerencias_por_tarea.tareas.map(t =>
  `select ${org}, tt.id, c.id, ${q(t.relevancia)}, 'sugerida', ${q('PROP-FC-002 · 04 · caso de prueba')}, ${q(t.por_que)}
     from app.training_tasks tt, app.formation_concepts c
    where tt.organization_id = ${org} and tt.bank = 'tanner' and tt.code = ${q(t.codigo)} and tt.status = 'oficial'
      and c.organization_id = ${org} and c.kind = 'recurso' and c.code = ${q(t.recurso)}`);

const cuerpo = fs.readFileSync(new URL('scripts/formacion/fc1-esquema.sql', raiz), 'utf8');
const salida = `${cuerpo}
-- ===== Semilla (generada: node scripts/formacion/sql-recursos.mjs ${slug}) =====
-- Fuente: ${sem.fuente}
insert into app.formation_concepts(organization_id,kind,code,name,question,phrase,sort_order,version,attrs) values
${familias.join(',\n')}
on conflict (organization_id, kind, code) do nothing;

-- Recursos: los nuevos entran; los de la Metodología v1.1 que ya existen
-- (mirar, perfilarse, engañar, temporizar, cambiar el ritmo) sólo ganan su
-- familia: no cambia su nombre, su versión ni su texto.
insert into app.formation_concepts(organization_id,kind,code,name,question,phrase,sort_order,version,attrs) values
${recursos.join(',\n')}
on conflict (organization_id, kind, code) do update
  set attrs = app.formation_concepts.attrs || jsonb_build_object('familia', excluded.attrs->>'familia'), updated_at = now()
  where not (app.formation_concepts.attrs ? 'familia');

-- Etiquetas: sólo las 4 que el mapa sugiere tarea por tarea, como SUGERIDAS.
insert into app.task_resource_tags(organization_id, task_id, resource_id, relevance, status, source, note)
${tags.join('\nunion all\n')}
on conflict (task_id, resource_id) do nothing;
`;
if (process.argv.includes('--imprime')) { process.stdout.write(salida); process.exit(0); }
const aplicada = fs.readFileSync(new URL('supabase/migrations/20261109124655_h76_recursos_del_futbolista.sql', raiz), 'utf8');
if (aplicada !== salida) { console.error('h76 ya no coincide con la semilla de recursos'); process.exit(1); }
console.log(`h76 coincide con la semilla: ${familias.length} familias, ${recursos.length} recursos, ${tags.length} sugerencias`);
