/* CUMPLEAÑOS (21/10/2026).
 *
 * Zul: "una lista anual y mensual de todos los cumpleaños que tenemos
 * registrados para hacer una planeación". El año en doce meses con su cuenta;
 * un mes abre su lista por día. Filtra jugadores o staff y categoría, busca,
 * exporta a Excel e imprime. Lo decide el servidor (v2_birthdays_year): lo ve
 * el staff, no las cuentas de familia.
 */
import { createClient } from '/v2/supabase-client.js';
import { MESES, filtra, porMes, categorias, diaTexto, queCumple, csv } from '/v2/cumpleanos/cumpleanos.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

let ctx = null, datos = null, anio = Number(params.get('anio')) || new Date().getFullYear();
let mes = params.has('mes') ? Number(params.get('mes')) - 1 : null, quien = 'todos', categoria = '', q = '';

async function rpc(name, args) { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; }
function muestra(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }

function guardaUrl() {
  const u = new URL(location.href);
  u.searchParams.set('anio', anio);
  if (mes == null) u.searchParams.delete('mes'); else u.searchParams.set('mes', mes + 1);
  history.replaceState(null, '', u);
}

function pinta() {
  const gente = filtra(datos?.people, { quien, categoria, q }), meses = porMes(gente);
  const hoy = String(datos?.today || '').slice(0, 10), mesHoy = Number(hoy.slice(5, 7)) - 1, esteAnio = Number(hoy.slice(0, 4)) === anio;
  $('cuAnio').textContent = anio;
  const jug = gente.filter(p => p.kind === 'player').length;
  $('cuResumen').textContent = `${gente.length} ${gente.length === 1 ? 'cumpleaños' : 'cumpleaños'} · ${jug} de jugadores y ${gente.length - jug} del staff`;
  $('cuVacio').classList.toggle('hidden', gente.length > 0);
  $('cuMeses').classList.toggle('hidden', mes != null);
  $('cuVolver').classList.toggle('hidden', mes == null);
  $('cuMes').classList.toggle('hidden', mes == null);
  if (mes == null) {
    $('cuMeses').innerHTML = MESES.map((nombre, i) => {
      const lista = meses[i], primeros = lista.slice(0, 3).map(p => esc(p.firstName || p.name)).join(', ');
      return `<button type="button" class="cu-mes-carta${esteAnio && i === mesHoy ? ' es-hoy' : ''}" data-mes="${i}">
        <span class="cu-mes-nombre">${nombre}</span><b>${lista.length}</b>
        <small>${lista.length ? `${primeros}${lista.length > 3 ? ` y ${lista.length - 3} más` : ''}` : 'Nadie'}</small></button>`;
    }).join('');
  } else {
    const lista = meses[mes];
    $('cuMes').innerHTML = `<h2>${MESES[mes]} ${anio} <span>${lista.length}</span></h2>`
      + (lista.length ? `<ul class="cu-lista">${lista.map(p => {
        const d = String(p.day).slice(0, 10), pasado = esteAnio && d < hoy;
        return `<li class="${d === hoy ? 'es-hoy' : ''}${pasado ? ' ya-paso' : ''}"><span class="cu-dia">${esc(diaTexto(d))}</span>
          <span class="cu-quien"><b>${esc(p.name)}</b><small>${esc(queCumple(p))}</small></span>
          <span class="cu-tipo" data-kind="${esc(p.kind)}">${p.kind === 'player' ? 'Jugador' : 'Staff'}</span>${d === hoy ? '<em>Hoy</em>' : ''}</li>`;
      }).join('')}</ul>` : '<p class="cu-vacio">Nadie cumple este mes.</p>');
  }
  const f = datos?.missing || {}, faltan = Number(f.staff || 0) + Number(f.players || 0);
  $('cuFaltan').classList.toggle('hidden', !faltan);
  if (faltan) $('cuFaltan').textContent = `Faltan ${[f.players ? `${f.players} jugador${f.players === 1 ? '' : 'es'}` : '', f.staff ? `${f.staff} del staff` : ''].filter(Boolean).join(' y ')} sin fecha de nacimiento: no salen aquí.`;
  guardaUrl();
}

async function carga() {
  $('cuResumen').textContent = 'Cargando…';
  try { datos = (await rpc('v2_birthdays_year', { organization_id: ctx.organization_id, year: anio })) || { people: [], missing: {} }; }
  catch (e) { if (/Not authorized/i.test(e.message || '')) { muestra('deniedView'); return; } datos = { people: [], missing: {} }; $('cuResumen').textContent = 'No se pudieron cargar los cumpleaños.'; }
  const sel = $('cuCategoria'), antes = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' + categorias(datos.people).map(c => `<option>${esc(c)}</option>`).join('');
  sel.value = antes; categoria = sel.value;
  pinta();
}

function descarga() {
  const gente = filtra(datos?.people, { quien, categoria, q }), lista = mes == null ? gente : porMes(gente)[mes];
  const blob = new Blob([csv(lista)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `cumpleanos-${anio}${mes == null ? '' : `-${String(mes + 1).padStart(2, '0')}`}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function cablea() {
  $('cuAnioMenos').addEventListener('click', () => { anio--; carga(); });
  $('cuAnioMas').addEventListener('click', () => { anio++; carga(); });
  $('cuQuien').addEventListener('click', e => {
    const b = e.target.closest('[data-quien]'); if (!b) return; quien = b.dataset.quien;
    $('cuQuien').querySelectorAll('[data-quien]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('cuCategoria').classList.toggle('hidden', quien === 'staff'); if (quien === 'staff') { categoria = ''; $('cuCategoria').value = ''; }
    pinta();
  });
  $('cuCategoria').addEventListener('change', e => { categoria = e.target.value; pinta(); });
  $('cuBuscar').addEventListener('input', e => { q = e.target.value; pinta(); });
  $('cuMeses').addEventListener('click', e => { const b = e.target.closest('[data-mes]'); if (!b) return; mes = Number(b.dataset.mes); pinta(); scrollTo({ top: 0 }); });
  $('cuAlAnio').addEventListener('click', () => { mes = null; pinta(); });
  $('cuCsv').addEventListener('click', descarga);
  $('cuImprimir').addEventListener('click', () => print());
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const filas = await rpc('v2_my_context');
  if (!filas?.length) { location.href = '/'; return; }
  ctx = filas[0];
  $('orgName').textContent = ctx.organization_name || '';
  if (ctx.role === 'Tanner') { muestra('deniedView'); return; }
  cablea(); muestra('view'); await carga();
}
boot().catch(e => { console.error(e); $('deniedText').textContent = 'No se pudo abrir. Vuelve a intentar.'; muestra('deniedView'); });
