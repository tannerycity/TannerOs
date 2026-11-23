/* Pagina publica de precios de Mi Club FC (23/11/2026).
 *
 * Los precios NO estan escritos aqui: salen del catalogo PUBLICADO en el
 * servidor (v2_saas_public_catalog). Mientras Presidencia no publique una
 * version aprobada, la funcion devuelve null y la pagina solo dice "muy
 * pronto": ningun precio se ve antes de su aprobacion final.
 */
import { createClient } from '/v2/supabase-client.js';
import { pesos, anualDesdeMensual } from '/v2/saas/precios.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let catalogo = null, ciclo = 'monthly';

function precioDe(mensual) {
  if (ciclo === 'annual') return { monto: anualDesdeMensual(mensual, catalogo.descuentoAnualBp), sufijo: '/año + IVA' };
  return { monto: mensual, sufijo: '/mes + IVA' };
}

function pinta() {
  const pct = catalogo.descuentoAnualBp / 100;
  $('ahorro').textContent = `ahorra ${pct.toLocaleString('es-MX')} %`;
  $('notaIva').textContent = `Precios en pesos mexicanos, antes de IVA (${(catalogo.ivaBp / 100).toLocaleString('es-MX')} %). Verás el total con impuestos antes de pagar.`;
  document.querySelectorAll('[data-gracia]').forEach(e => { e.textContent = catalogo.diasGracia; });
  document.querySelectorAll('[data-descuento]').forEach(e => { e.textContent = pct.toLocaleString('es-MX'); });
  document.querySelectorAll('[data-ciclo]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.ciclo === ciclo)));

  $('planes').innerHTML = catalogo.planes.map(p => {
    const rango = p.max == null ? `${p.min} jugadores o más` : p.min === 0 ? `Hasta ${p.max} jugadores activos` : `${p.min} a ${p.max} jugadores activos`;
    let precio;
    if (p.cotizar) precio = '<b class="mc-precio">Cotización</b>';
    else if (p.mensual === 0) precio = '<b class="mc-precio">Gratis</b><small>Sin tarjeta</small>';
    else { const x = precioDe(p.mensual); precio = `<b class="mc-precio">${pesos(x.monto)}</b><small>${x.sufijo}</small>`; }
    return `<article class="mc-plan${p.mensual === 0 ? ' mc-plan-semilla' : ''}">
      <h3>${esc(p.nombre)}</h3><p class="mc-rango">${esc(rango)}</p>${precio}
      <ul>${(p.funciones || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    </article>`;
  }).join('');

  $('complementos').innerHTML = catalogo.complementos.filter(c => c.vendible).map(c => {
    const x = precioDe(c.mensual);
    return `<article class="mc-comp"><div><h3>${esc(c.nombre)}</h3><p>${esc(c.descripcion || '')}</p>
      ${c.costosExternos ? `<small>${esc(c.costosExternos)}</small>` : ''}</div>
      <b>${pesos(x.monto)}<small>${x.sufijo}</small></b></article>`;
  }).join('') || '<p class="mc-nota">Pronto anunciaremos los complementos disponibles.</p>';
}

document.querySelectorAll('[data-ciclo]').forEach(b => b.addEventListener('click', () => { ciclo = b.dataset.ciclo; pinta(); }));

try {
  const { data, error } = await supabase.rpc('v2_saas_public_catalog');
  if (error) throw error;
  catalogo = data;
} catch { catalogo = null; }
$('cargando').classList.add('hidden');
if (!catalogo) $('pronto').classList.remove('hidden');
else { $('catalogo').classList.remove('hidden'); pinta(); }
