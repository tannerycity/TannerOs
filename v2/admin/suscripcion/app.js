/* MI PLAN de la academia (Mi Club FC, 23/11/2026).
 *
 * Registro -> academia -> elegir plan -> complementos -> resumen con IVA ->
 * autorizar en Mercado Pago (si hay costo) -> confirmacion por el webhook.
 *
 *   · El navegador solo manda CODIGOS. "Revisar total" pide la cotizacion al
 *     servidor (v2_saas_quote) y eso es lo que se ensena y lo que se cobra.
 *   · Semilla sin complementos se activa sin tarjeta.
 *   · Volver de Mercado Pago no activa nada: el pago se confirma por el aviso.
 *   · Datos fiscales, pagos con comprobante interno, solicitud de CFDI y
 *     exportar los datos de la academia.
 * Todo pasa por v2_saas_* (supabase/pendientes/saas_comercial_v1.sql);
 * mientras no se aplique, la pantalla dice "pendiente de activar".
 */
import { bootstrapProtectedShell, rpc, $, moduleAccess, setShellHealth, supabase } from '/v2/shell.js';
import { pesos, cotiza, anualDesdeMensual } from '/v2/saas/precios.js';
import { textoSuscripcion, textoCupo, opcionesDePlan, revisaFiscal, textoConfirmacion, REGIMENES, USOS_CFDI } from '/v2/admin/suscripcion/logica.js';

const boot = await bootstrapProtectedShell({ active: 'admin', title: 'Mi plan' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot, org = ctx.organization_id, puedeEditar = moduleAccess(navigation, 'admin', true);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (t = '', tipo = 'error') => { const e = $('spMsg'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); };
const amable = e => ({ 'Not authorized': 'Tu cuenta no puede hacer esto. Pídelo a Presidencia.' }[e?.message] || e?.message || 'No se pudo completar.');
const fecha = iso => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };
const ESTADO_PAGO = { approved: 'Aprobado', pending: 'Pendiente', in_process: 'En proceso', rejected: 'Rechazado', cancelled: 'Cancelado', refunded: 'Reembolsado', charged_back: 'Contracargo' };
const ESTADO_CFDI = { pending_integration: 'Factura solicitada (en preparación)', requested: 'Factura en proceso', stamped: 'Factura emitida', cancelled: 'Factura cancelada', error: 'Factura con error' };

let datos = null, catalogo = null, ciclo = 'monthly', plan = null, cotizacion = null;

async function invoca(body) {
  const { data, error } = await supabase.functions.invoke('saas-suscripcion', { body: { organizationId: org, ...body } });
  if (error) { let m = error.message; try { m = (await error.context?.json())?.error || m; } catch {} throw new Error(m); }
  if (data?.ok === false) throw new Error(data.error || 'No se pudo completar.');
  return data;
}

async function carga() {
  try {
    [datos, catalogo] = await Promise.all([rpc('v2_saas_my_subscription', { organization_id: org }), rpc('v2_saas_public_catalog')]);
  } catch (e) {
    if (/does not exist|Could not find the function|schema cache/i.test(e?.message || '')) { $('spPendiente').classList.remove('hidden'); setShellHealth({ state: 'attention', label: 'Pendiente' }); return; }
    msg(amable(e)); return;
  }
  if (datos.interno) { $('spInterno').classList.remove('hidden'); setShellHealth({ state: 'ok', label: 'Plan interno' }); return; }
  $('sp').classList.remove('hidden');
  if (new URLSearchParams(location.search).get('suscripcion') === 'revisar' && datos.pendiente)
    msg('Estamos confirmando tu pago con Mercado Pago. Tu plan se activa en cuanto el pago quede aprobado; puedes cerrar esta pantalla.', 'success');
  pinta();
}

const nombrePlan = c => catalogo?.planes?.find(p => p.codigo === c)?.nombre || c;

function pinta() {
  const sub = datos.suscripcion ? { ...datos.suscripcion, planNombre: nombrePlan(datos.suscripcion.plan) } : null;
  const t = textoSuscripcion(sub);
  $('spEstado').dataset.tono = t.tono; $('spEstadoTitulo').textContent = t.titulo; $('spEstadoDetalle').textContent = t.detalle;
  $('spComplementos').innerHTML = (sub?.complementos || []).map(c => `<li>${esc(catalogo?.complementos?.find(x => x.codigo === c.codigo)?.nombre || c.codigo)}${c.cubiertoPor ? ` <small class="clubes-muted">incluido en ${esc(c.cubiertoPor)}</small>` : ''}</li>`).join('');
  setShellHealth({ state: t.tono === 'ok' ? 'ok' : 'attention', label: t.tono === 'ok' ? 'Plan al día' : 'Revisar plan' });

  const pend = datos.pendiente;
  $('spPagarPendiente').classList.toggle('hidden', !(pend?.pagar && puedeEditar));
  if (pend?.pagar) $('spPagarPendiente').href = pend.pagar;
  $('spCancelar').classList.toggle('hidden', !(puedeEditar && sub && ['active', 'past_due', 'grace_period'].includes(sub.estado) && !sub.cancelaAlFinal));

  const cupo = textoCupo(datos.cupo, catalogo);
  $('spCupo').classList.toggle('hidden', !cupo); if (cupo) { $('spCupo').textContent = cupo.texto; $('spCupo').dataset.tono = cupo.tono; }

  $('spSinCatalogo').classList.toggle('hidden', Boolean(catalogo));
  $('spElegir').classList.toggle('hidden', !(catalogo && puedeEditar));
  if (catalogo && puedeEditar) pintaSelector();
  pintaFiscal(); pintaPagos();
}

function pintaSelector() {
  const activos = datos.cupo?.activos ?? 0;
  $('spAhorro').textContent = `ahorra ${catalogo.descuentoAnualBp / 100} %`;
  $('spActivos').textContent = `Tienes ${activos} jugadores activos. Precios antes de IVA; el total con impuestos aparece al revisar.`;
  document.querySelectorAll('[data-ciclo]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.ciclo === ciclo)));
  const ops = opcionesDePlan(catalogo, activos);
  if (!plan || !ops.find(p => p.codigo === plan && p.elegible)) plan = (ops.find(p => p.recomendado && p.elegible) || ops.find(p => p.elegible))?.codigo || null;
  $('spPlanes').innerHTML = ops.map(p => {
    const precio = p.cotizar ? 'Cotización' : p.mensual === 0 ? 'Gratis' : pesos(ciclo === 'annual' ? anualDesdeMensual(p.mensual, catalogo.descuentoAnualBp) : p.mensual);
    return `<button type="button" class="sp-plan" role="radio" data-plan="${esc(p.codigo)}" aria-checked="${p.codigo === plan}" ${p.elegible ? '' : 'disabled'}>
      <strong>${esc(p.nombre)}</strong><b>${precio}</b><small>${p.max == null ? `${p.min}+ jugadores` : `Hasta ${p.max} jugadores`}${p.cotizar || p.mensual === 0 ? '' : ciclo === 'annual' ? ' · al año' : ' · al mes'}</small>
      ${p.recomendado ? '<em>Te corresponde</em>' : ''}${p.motivo ? `<small>${esc(p.motivo)}</small>` : ''}</button>`;
  }).join('');
  const elegidos = new Set([...document.querySelectorAll('#spAddons input:checked')].map(i => i.value));
  $('spAddons').innerHTML = catalogo.complementos.filter(c => c.vendible).map(c => `<label class="sp-addon"><input type="checkbox" value="${esc(c.codigo)}" ${elegidos.has(c.codigo) ? 'checked' : ''}>
    <span><b>${esc(c.nombre)}</b> · ${pesos(ciclo === 'annual' ? anualDesdeMensual(c.mensual, catalogo.descuentoAnualBp) : c.mensual)}${ciclo === 'annual' ? '/año' : '/mes'}
    <small>${esc(c.descripcion || '')}${c.costosExternos ? ` ${esc(c.costosExternos)}` : ''}</small></span></label>`).join('') || '<p class="clubes-muted">Pronto habrá complementos disponibles.</p>';
  previa();
}

const complementos = () => [...document.querySelectorAll('#spAddons input:checked')].map(i => i.value);

// Vista previa local (instantanea). Lo que cuenta es la del servidor.
function previa() {
  cotizacion = null; $('spContratar').disabled = true;
  if (!plan) { $('spResumen').innerHTML = ''; return; }
  const q = cotiza(catalogo, { plan, ciclo, complementos: complementos(), activos: datos.cupo?.activos ?? 0 });
  $('spResumen').innerHTML = q.ok ? `<p>Estimado: ${pesos(q.total)} con IVA ${ciclo === 'annual' ? 'al año' : 'al mes'}. Toca "Revisar total" para confirmarlo con cupón y becas.</p>` : `<p>${esc(q.error)}</p>`;
}

function pintaResumen(q) {
  if (!q.ok) { $('spResumen').innerHTML = `<p>${esc(q.error)}</p>`; return; }
  const fila = (t, v, clase = '') => `<tr class="${clase}"><td>${t}</td><td>${v}</td></tr>`;
  $('spResumen').innerHTML = `<table>${q.lineas.map(l => fila(`${esc(l.nombre)}${l.cubiertoPor ? ` <small class="clubes-muted">incluido en el paquete</small>` : ''}`, pesos(l.bruto))).join('')}
    ${q.descuentoAnual ? fila('Descuento anual', `−${pesos(q.descuentoAnual)}`) : ''}${q.descuentoCupon ? fila('Cupón', `−${pesos(q.descuentoCupon)}`) : ''}
    ${q.descuentoBeca ? fila('Beca de software', `−${pesos(q.descuentoBeca)}`) : ''}${fila('Subtotal sin IVA', pesos(q.base))}
    ${fila(`IVA (${q.ivaBp / 100} %)`, pesos(q.iva))}${fila(`Total ${q.ciclo === 'annual' ? 'al año' : 'al mes'}`, pesos(q.total), 'sp-total')}</table>
    <p>${esc(textoConfirmacion(q, { inicia: datos.suscripcion && datos.suscripcion.estado !== 'free' ? datos.suscripcion.periodoFin : null }))}</p>`;
}

$('spPlanes').addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (!b || b.disabled) return; plan = b.dataset.plan; pintaSelector(); });
$('spAddons').addEventListener('change', previa);
$('spCupon').addEventListener('input', previa);
document.querySelectorAll('[data-ciclo]').forEach(b => b.addEventListener('click', () => { ciclo = b.dataset.ciclo; pintaSelector(); }));

$('spRevisar').addEventListener('click', async () => {
  msg(); $('spRevisar').disabled = true;
  try {
    cotizacion = await rpc('v2_saas_quote', { organization_id: org, tier: plan, cycle: ciclo, addons: complementos(), coupon: $('spCupon').value.trim() || null });
    pintaResumen(cotizacion); $('spContratar').disabled = !cotizacion?.ok;
    $('spContratar').textContent = cotizacion?.ok && !cotizacion.requierePago ? 'Activar sin tarjeta' : 'Contratar';
  } catch (e) { msg(amable(e)); } finally { $('spRevisar').disabled = false; }
});

$('spContratar').addEventListener('click', async () => {
  if (!cotizacion?.ok) return;
  const ok = await window.tosConfirm({ kicker: 'MI CLUB FC', title: cotizacion.requierePago ? `Contratar ${nombrePlan(cotizacion.plan)}` : 'Activar Semilla 20',
    message: textoConfirmacion(cotizacion, { inicia: datos.suscripcion && datos.suscripcion.estado !== 'free' ? datos.suscripcion.periodoFin : null }),
    confirmText: cotizacion.requierePago ? 'Ir a Mercado Pago' : 'Activar' });
  if (!ok) return;
  $('spContratar').disabled = true; msg();
  try {
    const r = await invoca({ action: 'checkout', tier: cotizacion.plan, cycle: cotizacion.ciclo, addons: complementos(), coupon: $('spCupon').value.trim() || null });
    if (r.pagar) { location.assign(r.pagar); return; }
    msg('Listo: Semilla 20 activa.', 'success'); await carga();
  } catch (e) { msg(amable(e)); $('spContratar').disabled = false; }
});

$('spCancelar').addEventListener('click', async () => {
  const s = datos.suscripcion;
  const motivo = await window.tosPrompt({ kicker: 'CANCELAR RENOVACIÓN', title: '¿Seguro?',
    message: `Conservas todo hasta el ${fecha(s.periodoFin)}. Después sigues con lo básico de Semilla y tus datos. ¿Nos cuentas por qué? (opcional)`,
    placeholder: 'Ej. Cerramos la temporada', confirmText: 'Cancelar renovación', maxlength: 200 });
  if (motivo === null) return;
  try { await invoca({ action: 'cancel', reason: motivo || null }); msg('Renovación cancelada.', 'success'); await carga(); } catch (e) { msg(amable(e)); }
});

function pintaFiscal() {
  const f = $('spFiscal'), d = datos.fiscal || {};
  $('spRegimen').innerHTML = '<option value="">Elige…</option>' + REGIMENES.map(([c, n]) => `<option value="${c}">${c} · ${esc(n)}</option>`).join('');
  $('spUso').innerHTML = '<option value="">Elige…</option>' + USOS_CFDI.map(([c, n]) => `<option value="${c}">${c} · ${esc(n)}</option>`).join('');
  f.rfc.value = d.rfc || ''; f.razonSocial.value = d.razonSocial || ''; f.regimen.value = d.regimen || ''; f.cp.value = d.cp || '';
  f.usoCfdi.value = d.usoCfdi || 'G03'; f.correo.value = d.correo || '';
  [...f.elements].forEach(el => { el.disabled = !puedeEditar; });
}
$('spFiscal').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, r = revisaFiscal({ rfc: f.rfc.value, razonSocial: f.razonSocial.value, regimen: f.regimen.value, cp: f.cp.value.trim(), usoCfdi: f.usoCfdi.value, correo: f.correo.value.trim() });
  if (!r.ok) { msg(r.error); return; }
  try { await rpc('v2_saas_set_fiscal_profile', { organization_id: org, profile: r.datos }); msg('Datos fiscales guardados.', 'success'); datos = await rpc('v2_saas_my_subscription', { organization_id: org }); pinta(); }
  catch (err) { msg(amable(err)); }
});

function pintaPagos() {
  const pagos = datos.pagos || [];
  $('spPagos').innerHTML = pagos.map(p => `<div class="sp-pago"><span><b>Comprobante ${esc(p.folio)}</b><small> ${fecha(p.aprobado)} · ${ESTADO_PAGO[p.estado] || esc(p.estado)}</small>
      <small>${p.cfdi ? esc(ESTADO_CFDI[p.cfdi] || p.cfdi) : ''}</small></span><b>${pesos(p.monto)}</b>
      ${p.estado === 'approved' && !p.cfdi && puedeEditar ? `<button type="button" class="pf-sec" data-factura="${esc(p.folio)}">Solicitar factura</button>` : ''}</div>`).join('')
    || '<p class="clubes-muted">Todavía no hay pagos.</p>';
}
$('spPagos').addEventListener('click', async e => {
  const b = e.target.closest('[data-factura]'); if (!b) return;
  if (!datos.fiscal) { msg('Primero guarda tus datos fiscales.'); return; }
  b.disabled = true;
  try { await rpc('v2_saas_request_invoice', { organization_id: org, receipt_folio: Number(b.dataset.factura) }); msg('Factura solicitada. Te avisaremos cuando esté emitida.', 'success'); datos = await rpc('v2_saas_my_subscription', { organization_id: org }); pintaPagos(); }
  catch (err) { msg(amable(err)); b.disabled = false; }
});

$('spExportar').addEventListener('click', async () => {
  $('spExportar').disabled = true; msg();
  try {
    const x = await rpc('v2_saas_export_my_data', { organization_id: org });
    const url = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `mi-club-fc-${x.academia?.slug || 'academia'}-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    msg('Listo: se descargó el archivo con los datos de tu academia.', 'success');
  } catch (e) { msg(e?.message === 'Not authorized' ? 'Solo Presidencia o el dueño del club pueden descargar los datos.' : amable(e)); }
  finally { $('spExportar').disabled = false; }
});

await carga();
