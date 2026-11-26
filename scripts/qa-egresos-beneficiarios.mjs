/* A quién se le paga y las gráficas del dinero (25/11/2026, h102), sin navegador.
 * Presidencia: "que podamos escoger a quién se le está pagando... y así para
 * que las gráficas salgan más chidas". Se prueba la lista (grupos, búsqueda,
 * ligar por nombre o alias igual que el servidor) y las cuentas de las
 * gráficas (periodos, barras, nómina por mes y uniformes). */
import { agrupa, coincide } from '../v2/beneficiarios.js';
import { rangoDe, barras, tablaNomina, etiquetaMes, filtraTipo, uniformes, semanasDePago, lunesDe } from '../v2/contabilidad/graficas/graficas.js';

let casos = 0, fallos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(' - ' + n + (d !== undefined ? '\n   ' + JSON.stringify(d) : '')); } };

const P = [
  { id: 'b', name: 'Brandon Andrade', kind: 'staff', active: true, aliases: ['Brandon', 'DT Brandon', 'Profe Brandon'] },
  { id: 'c', name: 'Checo Martínez', kind: 'staff', active: true, aliases: ['DT Checo', 'DT Checo Martinez'] },
  { id: 'm', name: 'Maxi Ponce', kind: 'staff', active: false, aliases: ['DT Maxi Ponce'] },
  { id: 't', name: 'Tremor', kind: 'proveedor', active: true, aliases: [] },
  { id: 'i', name: 'Compras por internet', kind: 'proveedor', active: true, aliases: ['Mercadolibre', 'Amazon'] },
];
const g = agrupa(P);
ok('Staff y proveedores por separado, en orden', g.staff.map((p) => p.id).join() === 'b,c' && g.proveedores.map((p) => p.id).join() === 'i,t', g);
ok('quien está de baja no sale para escoger', !g.staff.some((p) => p.id === 'm'));
ok('busca sin acentos', agrupa(P, 'martinez').staff[0]?.id === 'c');
ok('busca por alias', agrupa(P, 'amazon').proveedores[0]?.id === 'i' && agrupa(P, 'dt brandon').staff[0]?.id === 'b');
ok('sin coincidencias, listas vacías', !agrupa(P, 'zzz').staff.length && !agrupa(P, 'zzz').proveedores.length);
ok('liga por nombre exacto', coincide(P, 'Tremor')?.id === 't');
ok('liga por alias, sin importar mayúsculas ni acentos', coincide(P, 'dt checo martínez')?.id === 'c' && coincide(P, 'PROFE BRANDON')?.id === 'b');
ok('el de baja también se liga (sus pagos viejos)', coincide(P, 'DT Maxi Ponce')?.id === 'm');
ok('lo que no está es Otro', coincide(P, 'Juan') === null && coincide(P, '') === null && coincide(P, '   ') === null);
ok('un pedazo de nombre no liga (evita confundir)', coincide(P, 'Bran') === null);

// Periodos
ok('este mes', JSON.stringify(rangoDe('mes', '2026-11-25')) === '{"desde":"2026-11-01","hasta":"2026-11-25"}');
ok('3 meses cuenta el mes actual', rangoDe('tres', '2026-11-25').desde === '2026-09-01');
ok('3 meses cruza el año', rangoDe('tres', '2026-02-10').desde === '2025-12-01');
ok('este año', rangoDe('anio', '2026-11-25').desde === '2026-01-01');
ok('todo', rangoDe('todo', '2026-11-25').desde === null);

// Barras
const b = barras([{ name: 'A', total: 100 }, { name: 'B', total: 50 }, { name: 'C', total: 0 }, { name: 'D', total: '25' }]);
ok('ordenadas de mayor a menor, sin ceros', b.filas.map((x) => x.name).join() === 'A,B,D', b);
ok('el ancho va contra el mayor', b.filas[0].pct === 100 && b.filas[1].pct === 50 && b.filas[2].pct === 25);
ok('la suma', b.suma === 175);
const muchas = barras(Array.from({ length: 15 }, (_, i) => ({ name: 'P' + i, total: 100 - i })));
ok('más de 12: el resto en una línea', muchas.filas.length === 12 && muchas.resto?.n === 3 && muchas.resto.total === 88 + 87 + 86);
ok('una muy chica se ve (mínimo 2%)', barras([{ name: 'A', total: 10000 }, { name: 'B', total: 1 }]).filas[1].pct === 2);
ok('sin datos', barras([]).filas.length === 0 && barras(null).suma === 0);

// Nómina por mes
const t = tablaNomina([{ name: 'Brandon', mes: '2026-10', total: 800 }, { name: 'Checo', mes: '2026-09', total: 350 }, { name: 'Brandon', mes: '2026-09', total: 450 }, { name: 'Brandon', mes: '2026-10', total: 100 }]);
ok('meses en orden', t.meses.join() === '2026-09,2026-10');
ok('una fila por persona, la de más pago primero', t.filas.map((f) => f.name).join() === 'Brandon,Checo' && t.filas[0].total === 1350);
ok('suma lo del mismo mes', t.filas[0].valores['2026-10'] === 900 && t.filas[1].valores['2026-10'] === undefined);
ok('etiqueta del mes', etiquetaMes('2026-09') === 'Sep 26');

// Filtro y uniformes
const L = [{ kind: 'staff' }, { kind: 'proveedor' }, { kind: 'otro' }];
ok('filtro por tipo', filtraTipo(L, 'staff').length === 1 && filtraTipo(L, 'todos').length === 3);
const u = uniformes({ entro: 81915, pagadoProveedor: 40060 });
ok('uniformes: lo que queda y el % pagado', u.queda === 41855 && u.pctPagado === 49, u);
ok('uniformes sin ventas no divide entre cero', uniformes({ entro: 0, pagadoProveedor: 500 }).pctPagado === null);

// Semana por semana (fecha de pago y semanas sin pago).
ok('semanas: el lunes de cualquier día', lunesDe('2026-11-25') === '2026-11-23' && lunesDe('2026-11-29') === '2026-11-23' && lunesDe('2026-11-23') === '2026-11-23');
const sp = semanasDePago([{ fecha: '2026-10-01', monto: 400 }, { fecha: '2026-10-08', monto: 400 }, { fecha: '2026-10-09', monto: 400 }, { fecha: '2026-10-22', monto: 400 }], { desde: '2026-10-01', hasta: '2026-10-31', hoy: '2026-11-25' });
ok('semanas: de la primera semana pagada al fin del periodo', sp.semanas.length === 5 && sp.semanas[0].lunes === '2026-09-28', sp.semanas.map((s) => s.lunes));
ok('semanas: detecta las que no tienen pago', JSON.stringify(sp.faltan.map((s) => s.lunes)) === '["2026-10-12","2026-10-26"]', sp.faltan);
ok('semanas: detecta dos pagos en una semana', sp.dobles.length === 1 && sp.dobles[0].total === 800);
const sc = semanasDePago([{ fecha: '2026-11-03', monto: 1 }], { desde: '2026-01-01', hasta: '2026-12-31', hoy: '2026-11-25' });
ok('semanas: no pasa de hoy y la semana en curso no cuenta como faltante', sc.semanas.length === 4 && sc.semanas.at(-1).enCurso && sc.faltan.length === 2);
ok('semanas: sin pagos no hay semanas', semanasDePago([], {}).semanas.length === 0);

if (fallos) { console.error(`Egresos y gráficas QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Egresos y gráficas QA OK · ${casos} casos: lista de a quién se le paga, ligar por alias, periodos, barras, nómina, uniformes y semana por semana`);
