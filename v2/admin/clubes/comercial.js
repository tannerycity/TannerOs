/* MI CLUB FC · COMERCIAL (portal de la plataforma, 23/11/2026).
 *
 * Lo que el dueno del producto necesita para operar el SaaS:
 *   · Metricas: academias gratis y de pago, MRR/ARR sin IVA, pagos fallidos.
 *   · Semilla 20: el impacto del programa social (solo conteos, nunca datos
 *     de jugadores).
 *   · Catalogo versionado: aprobar, validar IVA, publicar (con la frase
 *     exacta), poner complementos a la venta solo si sus modulos estan listos.
 *   · Academias: plan, estado, renovacion; asignar un plan manual o una beca
 *     de software, siempre con motivo.
 *
 * Todo pasa por las funciones v2_saas_* (supabase/pendientes/
 * saas_comercial_v1.sql). Mientras esa migracion no se aplique, la seccion lo
 * dice y no hace nada.
 */
import { pesos, anualDesdeMensual } from '/v2/saas/precios.js';
import { demoPortal, AVISO_DEMO } from '/v2/saas/demo.js';

const ESTADOS = { free: 'Gratis', pending: 'Pendiente', active: 'Activa', past_due: 'Atrasada', grace_period: 'En gracia', cancelled: 'Cancelada', expired: 'Vencida', sin_plan: 'Sin plan' };
const TECNICO = { ready: 'Listo', review: 'En revisión', partial: 'Parcial', not_built: 'No existe', internal: 'Interno' };
const VERSION = { draft: 'Borrador', approved: 'Aprobada', published: 'Publicada', retired: 'Retirada' };

export async function montaComercial({ rpc, $, esc, aviso }) {
  const raiz = $('mcComercial');
  if (!raiz) return;
  let board, cat;
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  try {
    if (demo) ({ board, cat } = demoPortal());
    else [board, cat] = await Promise.all([rpc('v2_saas_admin_board'), rpc('v2_saas_admin_catalog')]);
  } catch (e) {
    const falta = /does not exist|Could not find the function|schema cache/i.test(e?.message || '');
    raiz.innerHTML = `<div class="pf-bloque-cab"><h2>Mi Club FC · Comercial</h2></div>
      <p class="clubes-muted">${falta ? 'Pendiente de activar: falta aplicar la migración del sistema comercial (docs/saas-comercial/04-despliegue.md).' : esc(e?.message || 'No se pudo cargar.')}</p>`;
    return;
  }
  const recarga = () => montaComercial({ rpc, $, esc, aviso });
  const hazlo = async (fn, ok) => { if (demo) { aviso('Demostración: en el portal real esta acción se guarda y queda en la bitácora.', 'info'); return; } try { await fn(); aviso(ok, 'ok'); await recarga(); } catch (e) { aviso(e?.message || 'No se pudo completar.'); } };
  const versiones = cat.versiones || [];
  const publicada = versiones.find(v => v.status === 'published');
  const vigentes = versiones.filter(v => v.status === 'approved' || v.status === 'published');
  const s = board.semilla || {};

  raiz.innerHTML = `
    <div class="pf-bloque-cab"><h2>Mi Club FC · Comercial</h2>
      <span class="mc-chip ${publicada ? 'mc-ok' : 'mc-aten'}">${publicada ? `Precios publicados · v${publicada.version}` : 'Precios sin publicar'}</span></div>
    ${demo ? `<p class="mc-alerta">${esc(AVISO_DEMO)} Academias ficticias.</p>` : ''}
    <section class="pf-kpis mc-kpis">
      <article><b>${board.academiasGratis}</b><span>Academias gratis</span></article>
      <article><b>${board.academiasPago}</b><span>Academias de pago</span></article>
      <article><b>${pesos(board.mrr, { decimales: false })}</b><span>MRR sin IVA</span></article>
      <article><b>${pesos(board.arr, { decimales: false })}</b><span>ARR sin IVA</span></article>
      <article><b>${pesos(board.mrrComplementos, { decimales: false })}</b><span>MRR de complementos</span></article>
      <article><b>${board.conversionGratisAPago}</b><span>Pasaron de gratis a pago</span></article>
      <article><b>${board.pagosFallidos30d}</b><span>Pagos fallidos (30 días)</span></article>
      <article><b>${board.cancelaciones30d}</b><span>Cancelaciones (30 días)</span></article>
    </section>
    ${board.eventosConError || board.montosNoCoinciden || board.atrasadas ? `<p class="mc-alerta">${[
      board.atrasadas ? `${board.atrasadas} academia(s) con pago atrasado o en gracia` : '',
      board.eventosConError ? `${board.eventosConError} aviso(s) de Mercado Pago con error` : '',
      board.montosNoCoinciden ? `${board.montosNoCoinciden} pago(s) cuyo monto no coincide con lo contratado` : ''].filter(Boolean).join(' · ')}</p>` : ''}

    <article class="mc-semilla">
      <div><p class="pf-eyebrow">Programa social · Semilla 20</p><h3>Los primeros 20 juegan gratis</h3></div>
      <dl><div><dt>Academias beneficiadas</dt><dd>${s.beneficiadas ?? 0}</dd></div><div><dt>Jugadores activos beneficiados</dt><dd>${s.jugadores ?? 0}</dd></div>
        <div><dt>Crecieron más allá de 20</dt><dd>${s.crecieron ?? 0}</dd></div><div><dt>Migraron a un plan de pago</dt><dd>${s.migraronAPago ?? 0}</dd></div>
        <div><dt>Becas de software vigentes</dt><dd>${s.becasVigentes ?? 0}</dd></div></dl>
    </article>

    <h3 class="mc-sub">Catálogo</h3>
    ${versiones.map(v => `
      <article class="mc-version" data-version="${v.version}">
        <header><strong>${esc(v.label)} · v${v.version}</strong><span class="mc-chip">${VERSION[v.status] || esc(v.status)}</span>
          <small>IVA ${(v.ivaBp / 100).toFixed(2)} %${v.ivaValidado ? ' validado' : ' sin validar'} · descuento anual ${(v.descuentoAnualBp / 100).toFixed(0)} % · gracia ${v.diasGracia} días</small></header>
        ${v.notas ? `<p class="clubes-muted">${esc(v.notas)}</p>` : ''}
        <div class="mc-tabla-envoltura"><table class="mc-tabla"><thead><tr><th>Plan</th><th>Jugadores activos</th><th>Mensual sin IVA</th><th>Anual sin IVA</th></tr></thead><tbody>
          ${(v.planes || []).map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.min}–${p.max ?? '∞'}</td>
            <td>${p.cotizar ? 'Cotización' : pesos(p.mensual)}</td><td>${p.cotizar ? 'Cotización' : pesos(anualDesdeMensual(p.mensual, v.descuentoAnualBp))}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="mc-tabla-envoltura"><table class="mc-tabla"><thead><tr><th>Complemento</th><th>Mensual sin IVA</th><th>Módulos</th><th>Venta</th><th></th></tr></thead><tbody>
          ${(v.complementos || []).map(c => `<tr><td>${esc(c.nombre)}${c.paquete ? `<small> incluye ${c.paquete.map(esc).join(', ')}</small>` : ''}${c.costosExternos ? `<small> ${esc(c.costosExternos)}</small>` : ''}</td>
            <td>${pesos(c.mensual)}</td><td>${c.paquete ? '—' : (c.modulos.length ? c.modulos.map(esc).join(', ') : 'Sin módulo propio')}</td>
            <td>${c.vendible ? '<span class="mc-chip mc-ok">Se vende</span>' : `<span class="mc-chip">${c.estadoComercial === 'for_sale' ? 'Módulo no listo' : c.estadoComercial === 'paused' ? 'Pausado' : 'No se vende'}</span>`}</td>
            <td>${v.status === 'retired' ? '' : c.estadoComercial === 'for_sale'
              ? `<button type="button" class="pf-sec" data-addon="${esc(c.codigo)}" data-estado="paused">Pausar</button>`
              : `<button type="button" class="pf-sec" data-addon="${esc(c.codigo)}" data-estado="for_sale">Poner a la venta</button>`}</td></tr>`).join('')}
        </tbody></table></div>
        <footer class="mc-acciones">
          ${v.status === 'draft' ? '<button type="button" class="pf-sec" data-accion="aprobar">Aprobar versión</button>' : ''}
          ${(v.status === 'draft' || v.status === 'approved') && !v.ivaValidado ? '<button type="button" class="pf-sec" data-accion="iva">Registrar validación del IVA</button>' : ''}
          ${v.status === 'approved' && v.ivaValidado ? '<button type="button" class="pf-cta" data-accion="publicar">Publicar precios</button>' : ''}
          ${v.status === 'approved' && !v.ivaValidado ? '<small class="clubes-muted">Para publicar falta registrar la validación del IVA.</small>' : ''}
          <button type="button" class="pf-sec" data-accion="copiar">Nueva versión a partir de esta</button>
        </footer>
      </article>`).join('')}

    <h3 class="mc-sub">Estado técnico de los módulos</h3>
    <p class="clubes-muted">Un complemento solo se vende si todos sus módulos están listos. Esto es independiente de si se vende.</p>
    <div class="mc-modulos">${(cat.modulos || []).map(m => `<span class="mc-chip ${m.tecnico === 'ready' ? 'mc-ok' : m.tecnico ? 'mc-aten' : ''}" title="${esc(m.notas || '')}">${esc(m.nombre)} · ${TECNICO[m.tecnico] || 'Sin revisar'}</span>`).join('')}</div>

    <h3 class="mc-sub">Academias</h3>
    <div class="mc-tabla-envoltura"><table class="mc-tabla"><thead><tr><th>Academia</th><th>Plan</th><th>Estado</th><th>Jugadores activos</th><th>Complementos</th><th>Renueva</th></tr></thead><tbody>
      ${(board.academias || []).map(a => `<tr><td>${esc(a.nombre)}${a.interno ? ' <small>plan interno</small>' : ''}${a.demo ? ' <small>demo</small>' : ''}</td>
        <td>${esc(a.plan || '—')}${a.ciclo ? ` <small>${a.ciclo === 'annual' ? 'anual' : 'mensual'}</small>` : ''}</td>
        <td>${ESTADOS[a.estado] || esc(a.estado)}${a.cancelaAlFinal ? ' <small>no renueva</small>' : ''}</td><td>${a.jugadores}</td>
        <td>${(a.complementos || []).map(esc).join(', ') || '—'}</td><td>${a.renueva ? esc(String(a.renueva).slice(0, 10)) : '—'}</td></tr>`).join('')}
    </tbody></table></div>

    <form id="mcAsignar" class="mc-form">
      <h3 class="mc-sub">Asignar plan manual (piloto, convenio o transferencia)</h3>
      <label>Academia<select name="org" required>${(board.academias || []).filter(a => !a.interno).map(a => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('')}</select></label>
      <label>Versión<select name="version" required>${vigentes.map(v => `<option value="${v.version}">v${v.version} · ${VERSION[v.status]}</option>`).join('')}</select></label>
      <label>Plan<select name="tier" required>${(vigentes[0]?.planes || []).filter(p => !p.cotizar).map(p => `<option value="${esc(p.codigo)}">${esc(p.nombre)}</option>`).join('')}</select></label>
      <label>Ciclo<select name="cycle"><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>
      <label>Complementos (códigos separados por coma)<input name="addons" placeholder="STORE, SCOUTING" autocomplete="off"></label>
      <label>Pagado hasta<input name="fin" type="date"></label>
      <label class="mc-ancho">Motivo<input name="motivo" required minlength="10" placeholder="Ej. Piloto de enero, pago por transferencia" autocomplete="off"></label>
      <button type="submit" class="pf-cta" ${vigentes.length ? '' : 'disabled title="Primero aprueba una versión del catálogo"'}>Asignar</button>
    </form>

    <form id="mcBeca" class="mc-form">
      <h3 class="mc-sub">Beca de software o extensión social</h3>
      <label>Academia<select name="org" required>${(board.academias || []).filter(a => !a.interno).map(a => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('')}</select></label>
      <label>Tipo<select name="kind"><option value="software_grant">Beca de software (%)</option><option value="discount">Descuento (%)</option><option value="grace_extension">Más días de gracia</option></select></label>
      <label>Porcentaje o días<input name="valor" type="number" min="1" max="365" required></label>
      <label>Vigente hasta<input name="hasta" type="date" required></label>
      <label class="mc-ancho">Motivo documentado<input name="motivo" required minlength="10" placeholder="Ej. Academia comunitaria en zona vulnerable" autocomplete="off"></label>
      <button type="submit" class="pf-cta">Otorgar</button>
    </form>`;

  raiz.querySelectorAll('.mc-version').forEach(art => {
    const version = Number(art.dataset.version);
    art.querySelectorAll('[data-addon]').forEach(b => b.addEventListener('click', () =>
      hazlo(() => rpc('v2_saas_admin_set_addon_status', { version, code: b.dataset.addon, status: b.dataset.estado }),
        b.dataset.estado === 'for_sale' ? 'Complemento a la venta.' : 'Complemento pausado.')));
    art.querySelector('[data-accion="aprobar"]')?.addEventListener('click', async () => {
      const ok = await window.tosConfirm({ kicker: `CATÁLOGO V${version}`, title: 'Aprobar esta versión',
        message: 'Aprobar congela sus importes: ya no se editan (un cambio será una versión nueva). Aprobar NO publica ni cobra.', confirmText: 'Aprobar' });
      if (ok) hazlo(() => rpc('v2_saas_admin_approve', { version, note: null }), 'Versión aprobada.');
    });
    art.querySelector('[data-accion="iva"]')?.addEventListener('click', async () => {
      const nota = await window.tosPrompt({ kicker: `CATÁLOGO V${version}`, title: 'Validación del IVA',
        message: 'Escribe quién validó la tasa de IVA y cómo (contador, fecha).', placeholder: 'Ej. C.P. Pérez, 28/11/2026, IVA 16% para servicios digitales', confirmText: 'Registrar', maxlength: 300 });
      if (nota) hazlo(() => rpc('v2_saas_admin_validate_vat', { version, note: nota }), 'Validación registrada.');
    });
    art.querySelector('[data-accion="publicar"]')?.addEventListener('click', async () => {
      const frase = `PUBLICAR PRECIOS V${version}`;
      const t = await window.tosPrompt({ kicker: 'PUBLICAR', title: 'Publicar precios',
        message: `Los precios se verán en /precios y las academias podrán contratar. Escribe ${frase} para confirmar.`, placeholder: frase, confirmText: 'Publicar', maxlength: 40 });
      if (t) hazlo(() => rpc('v2_saas_admin_publish', { version, confirm: t.trim(), effective_from: null }), 'Precios publicados.');
    });
    art.querySelector('[data-accion="copiar"]')?.addEventListener('click', () =>
      hazlo(() => rpc('v2_saas_admin_new_draft', { from_version: version, label: null }), 'Borrador creado.'));
  });

  $('mcAsignar')?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    hazlo(() => rpc('v2_saas_admin_assign', {
      organization_id: f.get('org'), version: Number(f.get('version')), tier: f.get('tier'), cycle: f.get('cycle'),
      addons: String(f.get('addons') || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
      period_end: f.get('fin') ? `${f.get('fin')}T23:59:59-06:00` : null, reason: String(f.get('motivo') || '')
    }), 'Plan asignado.');
  });
  $('mcBeca')?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), kind = String(f.get('kind')), valor = Number(f.get('valor'));
    if (kind !== 'grace_extension' && valor > 100) { aviso('El porcentaje va de 1 a 100.'); return; }
    hazlo(() => rpc('v2_saas_admin_grant', {
      organization_id: f.get('org'), kind, percent_off_bp: kind === 'grace_extension' ? null : valor * 100,
      extra_grace_days: kind === 'grace_extension' ? valor : null, ends_at: `${f.get('hasta')}T23:59:59-06:00`, reason: String(f.get('motivo') || '')
    }), 'Beca registrada.');
  });
}
