/* Paridad JS <-> SQL del motor de precios.
 *
 * La pantalla pinta con cotiza() (v2/saas/precios.js) y el servidor cobra con
 * private.saas_quote_core. Si alguna vez dicen cosas distintas, la familia...
 * no: la ACADEMIA veria un total y pagaria otro. Aqui se corren los mismos
 * casos en los dos y se exige el mismo resultado, centavo por centavo.
 *
 *   node supabase/tests/saas/paridad.mjs mcfc_saas_local
 */
import { execFileSync } from 'node:child_process';
import { cotiza } from '../../../v2/saas/precios.js';
import { CATALOGO_V1 } from '../../../scripts/saas-catalogo-v1.fixture.mjs';

const db = process.argv[2] || 'mcfc_saas_local';
const casos = [];
for (const plan of ['SEMILLA_20', 'FORMATIVO', 'ASCENSO', 'PRIMERA', 'ELITE', 'NO_EXISTE'])
  for (const ciclo of ['monthly', 'annual', 'semanal'])
    for (const complementos of [[], ['STORE'], ['PACK_CRECIMIENTO', 'SPONSORS'], ['SCOUTING', 'EVENTS', 'STORE'], ['MESSAGING'], ['X']])
      for (const activos of [0, 20, 21, 50, 51, 100, 101, 250, 251])
        casos.push({ plan, ciclo, complementos, activos });
casos.push({ plan: 'FORMATIVO', ciclo: 'monthly', complementos: ['STORE'], activos: 30, cupon: { porcentajeBp: 5000, aplicaA: 'plan' } });
casos.push({ plan: 'PRIMERA', ciclo: 'annual', complementos: ['STORE'], activos: 30, cupon: { porcentajeBp: 333, aplicaA: 'complementos' }, becaBp: 1234 });
casos.push({ plan: 'ASCENSO', ciclo: 'annual', complementos: ['SCOUTING'], activos: 60, cupon: { porcentajeBp: 1 }, becaBp: 9999 });
casos.push({ plan: 'ASCENSO', ciclo: 'monthly', complementos: [], activos: 60, cupon: { porcentajeBp: 20000 } });

const catalogo = JSON.stringify(CATALOGO_V1);
const lit = s => `'${String(s).replace(/'/g, "''")}'`;
const sql = casos.map((c, i) => `select ${i} i, private.saas_quote_core(${lit(catalogo)}::jsonb, ${lit(c.plan)}, ${lit(c.ciclo)}, ` +
  `array[${c.complementos.map(lit).join(',')}]::text[], ${c.activos}, ${c.cupon ? lit(JSON.stringify(c.cupon)) + '::jsonb' : 'null'}, ${c.becaBp || 0})::text q`).join(' union all ');
const salida = execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db], { input: `select q from (${sql}) x order by i;`, encoding: 'utf8', maxBuffer: 64 << 20 });
const filas = salida.trim().split('\n').map(l => JSON.parse(l));

// Lo que compara: todo menos sugerencias (solo pantalla). Errores: mismo codigo.
const forma = q => q.ok ? (({ sugerencias, ...r }) => r)(q) : { ok: false, codigo: q.codigo };
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
let fallos = 0;
casos.forEach((c, i) => {
  const js = JSON.stringify(canon(forma(cotiza(CATALOGO_V1, c)))), pg = JSON.stringify(canon(forma(filas[i])));
  if (js !== pg) { fallos++; if (fallos <= 5) console.error(` - caso ${JSON.stringify(c)}\n   js: ${js}\n   pg: ${pg}`); }
});
console.log(fallos ? `paridad: ${fallos} de ${casos.length} casos distintos` : `PARIDAD OK · ${casos.length} casos idénticos JS = SQL`);
if (fallos) process.exit(1);
