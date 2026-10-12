// Indicaciones al registrarse (Presidencia, 12/10/2026): lo que la familia
// lee al terminar su registro (uniforme, calzado…), escrito por cada club.
import { indicacionesDeTexto, problemaConIndicaciones, bloqueDeIndicaciones } from '../v2/indicaciones.js';
import fs from 'node:fs';

const revisiones = [];
const revisa = (n, ok, d = '') => revisiones.push({ n, ok, d });

const TANNERY = ['Uniforme de entrenamiento: playera negra, short negro y medias blancas. De preferencia, no traigas uniformes de otros equipos.',
  'Calzado: tenis multitacos. No se permiten tachones.'];
const b = bloqueDeIndicaciones(TANNERY);
revisa('el bloque trae las dos de Tannery, en orden', (b.match(/<li>/g) || []).length === 2 && b.indexOf('playera negra') < b.indexOf('multitacos'), b);
revisa('con su título', /Para tu primer entrenamiento/.test(b));
revisa('sin indicaciones no sale nada', bloqueDeIndicaciones([]) === '' && bloqueDeIndicaciones(null) === '' && bloqueDeIndicaciones(['  ', '']) === '');
revisa('lo que escribe el club no se vuelve HTML', !/<script>/.test(bloqueDeIndicaciones(['<script>x</script>'])) && /&lt;script&gt;/.test(bloqueDeIndicaciones(['<script>x</script>'])));
revisa('una por renglón, sin vacíos ni espacios', JSON.stringify(indicacionesDeTexto(' a \n\n b\n  \n')) === '["a","b"]');
revisa('hasta 6', problemaConIndicaciones(['1', '2', '3', '4', '5', '6']) === null && /hasta 6/.test(problemaConIndicaciones(['1', '2', '3', '4', '5', '6', '7'])));
revisa('hasta 240 letras cada una', problemaConIndicaciones(['x'.repeat(240)]) === null && /240/.test(problemaConIndicaciones(['x'.repeat(241)])));

const pf = fs.readFileSync(new URL('../public-form.js', import.meta.url), 'utf8');
const exito = pf.slice(pf.indexOf('async function showRegistrationSuccess'), pf.indexOf('async function showRegistrationSuccess') + 900);
revisa('la pantalla de registro terminado las muestra, antes de la credencial',
  /bloqueDeIndicaciones\(publicContext\?\.registrationNotes\)/.test(exito) && exito.indexOf('bloqueDeIndicaciones') < exito.indexOf('wc-wrap'));
const mig = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(f => /_s4_indicaciones_al_registrarse\.sql$/.test(f));
const sql = mig ? fs.readFileSync(new URL('../supabase/migrations/' + mig, import.meta.url), 'utf8') : '';
revisa('el contexto público las entrega y Tannery arranca con las suyas', /'registrationNotes', v_ind/.test(sql) && TANNERY.every(t => sql.includes(t)));

let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.n}${r.d ? ' :: ' + r.d : ''}`); }
if (mal) { console.error(`Indicaciones FAILED · ${mal} de ${revisiones.length}`); process.exit(1); }
console.log(`Indicaciones OK · ${revisiones.length} revisiones: bloque de registro, límites y lo de Tannery`);
