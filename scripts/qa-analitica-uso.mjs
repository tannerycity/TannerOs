/* Analítica de uso de TannerOS: lo puro (29/10/2026, docs/medicion).
 *   - GA4 de TannerOS, nunca el de Marketing.
 *   - Sólo staff: jamás Tanner ni familias.
 *   - Sólo módulos y funciones de catálogos cerrados; lo demás no sale.
 *   - Cada evento lleva únicamente sus parámetros permitidos; la "página" es
 *     una ruta sintética por módulo, nunca la URL real.
 *   - Sin navegador no truena. */
import { ID_USO, MODULOS, FUNCIONES, PARAMETROS, rolMedible, moduloValido, funcionValida, hostMedible, paginaDe, redondeaMs, limpiaEvento, iniciarUsoStaff, usaFuncion } from '../v2/analitica-uso.js';
import fs from 'node:fs';

let fallas = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallas++; console.error(`MAL ${t}${d ? ` · ${d}` : ''}`); } };

revisa('GA4 de TannerOS, distinto del de Marketing', ID_USO === 'G-KJN3NJS2YJ' && ID_USO !== 'G-H485DE37EF');
revisa('staff sí; Tanner, familias y desconocidos no', rolMedible('Presidencia') && rolMedible('Taquilla') && rolMedible('Miembro', true) && !rolMedible('Tanner') && !rolMedible('Familia') && !rolMedible(undefined));
revisa('sólo el dominio oficial', hostMedible('app.tannerycity.com') && !hostMedible('tanneros-git-x.vercel.app') && !hostMedible('localhost') && !hostMedible('tcp.tannerycity.com'));
const shell = fs.readFileSync(new URL('../v2/shell.js', import.meta.url), 'utf8');
const delMenu = [...shell.slice(shell.indexOf('export const navItems=['), shell.indexOf('];', shell.indexOf('export const navItems=['))).matchAll(/\{code:'([^']+)'/g)].map(m => m[1]);
revisa('el catálogo cubre cada módulo del menú', delMenu.length > 20 && delMenu.every(m => MODULOS.includes(m)), delMenu.filter(m => !MODULOS.includes(m)).join(','));
revisa('el catálogo de h55 es el mismo que el del navegador', (() => {
  const sql = fs.readFileSync(new URL('../supabase/pendientes/h55_uso_de_tanneros.sql', import.meta.url), 'utf8');
  const lista = [...sql.slice(sql.indexOf('select array['), sql.indexOf(']', sql.indexOf('select array['))).matchAll(/'([^']+)'/g)].map(m => m[1]);
  return lista.length === MODULOS.length && MODULOS.every(m => lista.includes(m));
})());
revisa('módulos y funciones fuera de catálogo no pasan', moduloValido('jugadores') && !moduloValido('jugadores/123') && !moduloValido('/club/') && funcionValida('cobro_registrado') && !funcionValida('cobro de Juan'));
revisa('catálogos sin datos dinámicos', MODULOS.every(m => /^[a-zA-Z_]+$/.test(m)) && FUNCIONES.every(f => /^[a-z_]+$/.test(f)));
revisa('la página es sintética por módulo', paginaDe('taquilla') === 'https://app.tannerycity.com/m/taquilla');
revisa('tiempos redondeados a 100 ms y con tope', redondeaMs(1234) === 1200 && redondeaMs(999999) === 60000 && redondeaMs(-5) === 0);

const e1 = limpiaEvento('tanner_module_opened', { module_name: 'club', user_id: 'u1', email: 'a@b.com', player_id: 'p1' });
revisa('sólo viajan los parámetros permitidos', JSON.stringify(e1) === '{"module_name":"club"}', JSON.stringify(e1));
revisa('un módulo inventado tumba el evento', limpiaEvento('tanner_module_opened', { module_name: 'Ana López' }) === null);
revisa('una función inventada tumba el evento', limpiaEvento('tanner_feature_used', { module_name: 'taquilla', feature: 'cobro a 4771234567' }) === null);
revisa('una URL real nunca es page_location', limpiaEvento('page_view', { page_location: 'https://app.tannerycity.com/jugadores/?id=123' }) === null
  && limpiaEvento('page_view', { page_location: 'https://app.tannerycity.com/m/jugadores' }).page_location.endsWith('/m/jugadores'));
revisa('errores por tipo, nunca el mensaje', JSON.stringify(limpiaEvento('tanner_error', { module_name: 'club', error_type: 'js', message: 'Juan no tiene saldo' })) === '{"module_name":"club","error_type":"js"}'
  && limpiaEvento('tanner_error', { module_name: 'club', error_type: 'Juan' }) === null);
revisa('un evento desconocido no sale', limpiaEvento('login', { method: 'x' }) === null);
revisa('ningún parámetro permitido suena a dato personal', Object.values(PARAMETROS).flat().every(k => !/name$|email|phone|tel|user|player|jugador|nombre|salud|monto|amount/i.test(k) || k === 'module_name'));
revisa('sin navegador: iniciar y medir no truenan', (() => { try { iniciarUsoStaff({ role: 'Presidencia', modulo: 'club' }); usaFuncion('busqueda'); return true; } catch { return false; } })());

console.log(fallas ? `Analítica de uso: ${fallas} de ${n} fallaron` : `Analítica de uso OK · ${n} revisiones: staff, catálogo cerrado y sólo parámetros permitidos`);
process.exit(fallas ? 1 : 0);
