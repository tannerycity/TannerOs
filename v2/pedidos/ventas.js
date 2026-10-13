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

export function pintaVentas(d, money) {
  if (!d) return '<p class="v-vacio">No se pudieron leer las ventas.</p>';
  const dias = d.byDay || [];
  const max = Math.max(1, ...dias.map(x => Number(x.total || 0)));
  const hoy = new Date().toISOString().slice(0, 10);
  const comp = textoComparacion(d.sold, d.previous?.sold);
  const sube = Number(d.sold || 0) >= Number(d.previous?.sold || 0);
  const barras = dias.map((x, i) => {
    const t = Number(x.total || 0);
    return `<div class="v-dia${x.date === hoy ? ' hoy' : ''}" title="${esc(corto(x.date))}: ${esc(money.format(t))}">`
      + `<span class="v-barra" style="height:${t ? Math.max(4, Math.round(t / max * 100)) : 0}%"></span><b>${DIAS[i]}</b></div>`;
  }).join('');
  const top = (d.top || []).length
    ? `<ol class="v-top">${d.top.map(t => `<li><span><b>${esc(t.name)}</b><small>${Number(t.units || 0)} ${t.kit ? (Number(t.units) === 1 ? 'kit' : 'kits') : (Number(t.units) === 1 ? 'pieza' : 'piezas')}</small></span><strong>${esc(money.format(Number(t.total || 0)))}</strong></li>`).join('')}</ol>`
    : '<p class="v-vacio">Todavía no hay ventas esta semana.</p>';
  const canales = (d.byChannel || []).length
    ? `<ul class="v-canales">${d.byChannel.map(c => `<li><span>${esc(nombreDeCanal(c.source))}<small>${Number(c.orders || 0)} pedido${Number(c.orders) === 1 ? '' : 's'}</small></span><strong>${esc(money.format(Number(c.total || 0)))}</strong></li>`).join('')}</ul>`
    : '';
  return `<div class="v-grande"><span>Vendido</span><strong id="vVendido">${esc(money.format(Number(d.sold || 0)))}</strong><small class="${sube ? 'sube' : 'baja'}">${esc(comp)}</small></div>
    <div class="v-datos">
      <div><span>Cobrado</span><b id="vCobrado">${esc(money.format(Number(d.collected || 0)))}</b></div>
      <div><span>Pedidos</span><b>${Number(d.orders || 0)}</b></div>
      <div><span>Ticket promedio</span><b>${esc(money.format(Number(d.avgTicket || 0)))}</b></div>
    </div>
    <div class="v-dias" aria-label="Ventas por día">${barras}</div>
    <h3>Lo que más se vende</h3>${top}
    ${canales ? `<h3>Por dónde entra</h3>${canales}` : ''}`;
}

let hoja = null;
export async function abreVentas({ rpc, organizationId, money, semana = null }) {
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
      if (b && hoja.dataset.inicio) abreVentas({ rpc, organizationId, money, semana: masDias(hoja.dataset.inicio, Number(b.dataset.semana)) });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hoja?.classList.add('hidden'); });
  }
  hoja.classList.remove('hidden');
  const cuerpo = hoja.querySelector('#vCuerpo');
  cuerpo.innerHTML = '<p class="v-vacio">Cargando…</p>';
  let d = null;
  try { d = await rpc('v2_store_weekly_sales', { organization_id: organizationId, week_start: semana }); }
  catch (e) { cuerpo.innerHTML = `<p class="v-vacio">${esc(e.message || 'No se pudieron leer las ventas.')}</p>`; return; }
  hoja.dataset.inicio = d?.weekStart || '';
  hoja.querySelector('#vRango').textContent = d ? `${corto(d.weekStart)} – ${corto(d.weekEnd)}` : '';
  // La semana que no ha llegado no se puede ver.
  hoja.querySelector('[data-semana="7"]').disabled = !d || masDias(d.weekStart, 7) > new Date().toISOString().slice(0, 10);
  cuerpo.innerHTML = pintaVentas(d, money);
}
