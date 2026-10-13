/* Ventas de la semana (13/10/2026): "dale a comprar otra vez y a las ventas
   de la semana". Una hoja para Presidencia: cuánto se vendió y cuánto se
   cobró de lunes a domingo, contra la semana pasada, día por día, lo que más
   se vende y por dónde entra. Sin costos: eso vive en Catálogo › Costos. */
const CANALES = {
  internal_capture: 'Mostrador', portal_familias: 'Portal de familias',
  public_form: 'Tienda en línea', legacy_import: 'Histórico'
};
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = iso => new Date(`${iso}T12:00:00`);
const corto = iso => fecha(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const masDias = (iso, n) => { const d = fecha(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* "+40% vs. la semana pasada". Sin venta la semana pasada no hay porcentaje
   honesto que dar: se dice en palabras. */
export function textoComparacion(actual, antes) {
  const a = Number(actual || 0), b = Number(antes || 0);
  if (!b) return a ? 'La semana pasada no hubo ventas' : 'Sin ventas las dos semanas';
  const pct = Math.round((a - b) / b * 100);
  if (pct === 0) return 'Igual que la semana pasada';
  return `${pct > 0 ? '+' : ''}${pct}% vs. la semana pasada`;
}
export const nombreDeCanal = s => CANALES[s] || 'Otro';

export function pintaVentas(d, money, filtro = '') {
  if (!d) return '<p class="v-vacio">No se pudieron leer las ventas.</p>';
  const dias = d.byDay || [];
  const max = Math.max(1, ...dias.map(x => Number(x.total || 0)));
  const hoy = new Date().toISOString().slice(0, 10);
  const comp = textoComparacion(d.sold, d.previous?.sold);
  const sube = Number(d.sold || 0) >= Number(d.previous?.sold || 0);
  const barras = dias.map((x, i) => {
    const t = Number(x.total || 0);
    return `<button type="button" class="v-dia${x.date === hoy ? ' hoy' : ''}${filtro === `dia:${x.date}` ? ' activo' : ''}" data-filtro="dia:${esc(x.date)}" title="${esc(corto(x.date))}: ${esc(money.format(t))}" aria-label="${esc(corto(x.date))}: ${esc(money.format(t))}. Ver quién compró">`
      + `<span class="v-barra" style="height:${t ? Math.max(4, Math.round(t / max * 100)) : 0}%"></span><b>${DIAS[i]}</b></button>`;
  }).join('');
  const top = (d.top || []).length
    ? `<ol class="v-top">${d.top.map(t => `<li><button type="button" class="${filtro === `que:${t.name}` ? 'activo' : ''}" data-filtro="que:${esc(t.name)}"><span><b>${esc(t.name)}</b><small>${Number(t.units || 0)} ${t.kit ? (Number(t.units) === 1 ? 'kit' : 'kits') : (Number(t.units) === 1 ? 'pieza' : 'piezas')}</small></span><strong>${esc(money.format(Number(t.total || 0)))}</strong></button></li>`).join('')}</ol>`
    : '<p class="v-vacio">Todavía no hay ventas esta semana.</p>';
  const canales = (d.byChannel || []).length
    ? `<ul class="v-canales">${d.byChannel.map(c => `<li><button type="button" class="${filtro === `canal:${c.source}` ? 'activo' : ''}" data-filtro="canal:${esc(c.source)}"><span>${esc(nombreDeCanal(c.source))}<small>${Number(c.orders || 0)} pedido${Number(c.orders) === 1 ? '' : 's'}</small></span><strong>${esc(money.format(Number(c.total || 0)))}</strong></button></li>`).join('')}</ul>`
    : '';
  return `<div class="v-grande"><span>Vendido</span><strong id="vVendido">${esc(money.format(Number(d.sold || 0)))}</strong><small class="${sube ? 'sube' : 'baja'}">${esc(comp)}</small></div>
    <div class="v-datos">
      <div><span>Cobrado</span><b id="vCobrado">${esc(money.format(Number(d.collected || 0)))}</b></div>
      <div><span>Pedidos</span><b>${Number(d.orders || 0)}</b></div>
      <div><span>Ticket promedio</span><b>${esc(money.format(Number(d.avgTicket || 0)))}</b></div>
    </div>
    <div class="v-dias" aria-label="Ventas por día">${barras}</div>
    <p class="v-pista">Toca un día, un producto o un canal para ver quién compró.</p>
    <h3>Lo que más se vende</h3>${top}
    ${canales ? `<h3>Por dónde entra</h3>${canales}` : ''}
    ${pintaQuienCompro(d.sales || [], filtro, money)}`;
}

/* Quién compró y quién vendió (13/10/2026): "sepas quién compró y quién
   vendió, jugador, papá y vendedor". Lo que se toca arriba filtra la lista. */
const EN_LINEA = new Set(['portal_familias', 'public_form']);
export function filtraVentas(ventas, filtro) {
  const [tipo, ...resto] = String(filtro || '').split(':');
  const valor = resto.join(':');
  if (!tipo || !valor) return ventas;
  if (tipo === 'dia') return ventas.filter(v => v.date === valor);
  if (tipo === 'que') return ventas.filter(v => (v.items || []).includes(valor));
  if (tipo === 'canal') return ventas.filter(v => v.source === valor);
  return ventas;
}
export function tituloDeFiltro(filtro) {
  const [tipo, ...resto] = String(filtro || '').split(':');
  const valor = resto.join(':');
  if (tipo === 'dia' && valor) return fecha(valor).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  if (tipo === 'que' && valor) return valor;
  if (tipo === 'canal' && valor) return nombreDeCanal(valor);
  return 'Toda la semana';
}
export function quienVendio(v) {
  if (v.seller) return `Atendió: ${v.seller}`;
  return EN_LINEA.has(v.source) ? 'Lo pidió en línea' : 'Sin registrar quién atendió';
}
function pintaQuienCompro(ventas, filtro, money) {
  const lista = filtraVentas(ventas, filtro);
  const filas = lista.length
    ? lista.map(v => {
      const total = Number(v.total || 0), pagado = Number(v.paid || 0), debe = Math.max(0, total - pagado);
      const quien = v.player || v.buyer || 'Sin nombre';
      return `<li><button type="button" class="v-venta" data-pedido="${esc(v.id)}">
        <span class="v-venta-txt"><b>${esc(quien)}</b>
          ${v.player && v.buyer ? `<small>Papá o mamá: ${esc(v.buyer)}</small>` : ''}
          <small class="v-vendio">${esc(quienVendio(v))} · ${esc(nombreDeCanal(v.source))}</small>
          <small class="v-lleva">${esc((v.items || []).join(', '))}</small></span>
        <span class="v-venta-monto"><strong>${esc(money.format(total))}</strong>
          <em class="${debe > 0.005 ? 'debe' : 'pagado'}">${debe > 0.005 ? `Debe ${esc(money.format(debe))}` : 'Pagado'}</em>
          <small>${esc(v.folio || '')}</small></span></button></li>`;
    }).join('')
    : '<li class="v-vacio">No hubo ventas aquí.</li>';
  return `<section class="v-quien" id="vQuien"><div class="v-quien-cab"><h3>Quién compró · ${esc(tituloDeFiltro(filtro))}</h3>`
    + `${filtro ? '<button type="button" class="v-todas" data-filtro="">Ver toda la semana</button>' : ''}</div>`
    + `<ul class="v-ventas">${filas}</ul></section>`;
}

let hoja = null;
let ultimo = null, opciones = null;
export async function abreVentas({ rpc, organizationId, money, semana = null, alAbrirPedido = null }) {
  opciones = { rpc, organizationId, money, alAbrirPedido };
  if (!hoja) {
    hoja = document.createElement('div');
    hoja.innerHTML = `<div class="v-fondo" data-cierra></div><section class="v-hoja" role="dialog" aria-modal="true" aria-labelledby="vTitulo">
      <header><div><h2 id="vTitulo">Ventas de la semana</h2><p id="vRango" class="v-rango"></p></div><button type="button" class="v-cerrar" data-cierra aria-label="Cerrar">✕</button></header>
      <div class="v-nav"><button type="button" data-semana="-7">‹ Anterior</button><button type="button" data-semana="7">Siguiente ›</button></div>
      <div id="vCuerpo" aria-live="polite"></div></section>`;
    hoja.id = 'ventasHoja';
    document.body.appendChild(hoja);
    hoja.addEventListener('click', e => {
      if (e.target.closest('[data-cierra]')) { hoja.classList.add('hidden'); return; }
      const b = e.target.closest('[data-semana]');
      if (b && hoja.dataset.inicio) { abreVentas({ ...opciones, semana: masDias(hoja.dataset.inicio, Number(b.dataset.semana)) }); return; }
      const f = e.target.closest('[data-filtro]');
      if (f && ultimo) {
        // Tocar otra vez lo mismo quita el filtro.
        const nuevo = hoja.dataset.filtroActivo === f.dataset.filtro ? '' : f.dataset.filtro;
        hoja.dataset.filtroActivo = nuevo;
        hoja.querySelector('#vCuerpo').innerHTML = pintaVentas(ultimo, opciones.money, nuevo);
        if (nuevo) hoja.querySelector('#vQuien')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const p = e.target.closest('[data-pedido]');
      if (p && opciones.alAbrirPedido) { hoja.classList.add('hidden'); opciones.alAbrirPedido(p.dataset.pedido); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hoja?.classList.add('hidden'); });
  }
  hoja.classList.remove('hidden');
  const cuerpo = hoja.querySelector('#vCuerpo');
  cuerpo.innerHTML = '<p class="v-vacio">Cargando…</p>';
  let d = null;
  try { d = await rpc('v2_store_weekly_sales', { organization_id: organizationId, week_start: semana }); }
  catch (e) { cuerpo.innerHTML = `<p class="v-vacio">${esc(e.message || 'No se pudieron leer las ventas.')}</p>`; return; }
  ultimo = d; hoja.dataset.filtroActivo = '';
  hoja.dataset.inicio = d?.weekStart || '';
  hoja.querySelector('#vRango').textContent = d ? `${corto(d.weekStart)} – ${corto(d.weekEnd)}` : '';
  // La semana que no ha llegado no se puede ver.
  hoja.querySelector('[data-semana="7"]').disabled = !d || masDias(d.weekStart, 7) > new Date().toISOString().slice(0, 10);
  cuerpo.innerHTML = pintaVentas(d, money);
}
