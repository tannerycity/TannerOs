// Cobranza dentro del estado de cuenta: acuerdo de pago, seguimiento y
// mensajes de WhatsApp listos.
//
// Pedido del club (21/10/2026): "que ahí mismo en esa pantalla podamos llegar
// a los acuerdos de pago, que la cobranza ahí sea rápida".
//   · Acuerdo: sólo Presidencia lo pacta (una fecha o en pagos). Mientras se
//     cumple no hay recargo; si se vence un pago queda incumplido.
//   · Seguimiento: llamadas, visitas y notas con quién y cuándo; los
//     WhatsApp que se mandan desde aquí quedan anotados solos.
// El estado del acuerdo lo calcula la base (lo que bajó el saldo desde que se
// pactó); aquí sólo se enseña.

const SEMANA = 7, QUINCENA = 15;
const FRECUENCIAS = [['semanal', 'Cada semana'], ['quincenal', 'Cada 15 días'], ['mensual', 'Cada mes']];
const TIPOS_NOTA = [['call', 'Llamada'], ['visit', 'En persona'], ['note', 'Nota']];
const ICONO_NOTA = { call: 'spark', visit: 'users', note: 'book', whatsapp: 'chat', agreement: 'calendar' };
const ESTADO = {
  active: { t: 'Acuerdo activo', tono: 'ok' },
  broken: { t: 'Acuerdo incumplido', tono: 'mal' },
  fulfilled: { t: 'Acuerdo cumplido', tono: 'bien' }
};
const ESTADO_PAGO = { paid: 'Pagado', late: 'Vencido', pending: 'Pendiente' };

const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fecha = iso => new Date(`${String(iso).slice(0, 10)}T12:00:00`);
const sumaDias = (iso, n) => { const d = fecha(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
const sumaMeses = (iso, n) => {
  const d = fecha(iso), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return isoLocal(d);
};
const conLada = t => { const n = String(t || '').replace(/\D/g, ''); return n.length === 10 ? `52${n}` : n; };
const llave = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

// Reparte un total en n pagos iguales; los centavos que sobran van al último.
export function repartePagos(total, n, primera, frecuencia) {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    due: frecuencia === 'mensual' ? sumaMeses(primera, i) : sumaDias(primera, i * (frecuencia === 'semanal' ? SEMANA : QUINCENA)),
    amount: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base
  }));
}

export function montaCobranza(api) {
  const { rpc, org, playerId, money, esc, shellIcon, datos, recarga, avisar, club } = api;
  const fechaCorta = iso => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(fecha(iso)).replace('.', '');
  const hace = iso => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  };
  const nombre = () => { const p = datos().estado?.player || {}; return [p.first_name, p.last_name].filter(Boolean).join(' '); };
  const telefono = () => (datos().estado?.player?.guardians || []).find(g => g.phone)?.phone || '';
  const saldo = () => Number(datos().estado?.summary?.balance || 0);
  const acuerdo = () => datos().cobro?.agreement || null;
  const vigente = () => ['active', 'broken'].includes(acuerdo()?.state);

  /* ---------- Mensajes de WhatsApp ---------- */
  function mensajes() {
    const a = acuerdo(), n = nombre(), c = club(), lista = [];
    if (saldo() > 0) lista.push({ clave: 'recordatorio', titulo: 'Recordatorio de pago',
      texto: `Hola, le recordamos que ${n} tiene un saldo pendiente de ${money.format(saldo())} en ${c}. Puede pagar en taquilla o por transferencia. ¡Gracias!` });
    if (a && vigente()) {
      const pagos = (a.installments || []).map(i => `• ${fechaCorta(i.due)}: ${money.format(Number(i.amount))}${i.state === 'paid' ? ' (pagado)' : ''}`).join('\n');
      lista.push({ clave: 'acuerdo', titulo: 'Confirmar el acuerdo',
        texto: `Hola, confirmamos el acuerdo de pago de ${n} en ${c}:\n${pagos}\nTotal: ${money.format(Number(a.total))}. Mientras se cumpla no se cobra recargo. ¡Gracias!` });
      if (a.next && a.state === 'active') lista.push({ clave: 'proximo', titulo: 'Avisar el próximo pago',
        texto: `Hola, le recordamos que el ${fechaCorta(a.next.due)} toca el pago de ${money.format(Number(a.next.amount))} del acuerdo de ${n}. ¡Gracias!` });
      if (a.next && a.state === 'broken') lista.push({ clave: 'incumplido', titulo: 'Pago del acuerdo vencido',
        texto: `Hola, el pago de ${money.format(Number(a.next.amount))} del ${fechaCorta(a.next.due)} del acuerdo de ${n} quedó pendiente. ¿Nos ayuda a ponerse al corriente? Al no cumplir el acuerdo vuelve a aplicar el recargo. ¡Gracias!` });
    }
    return lista;
  }
  // El mensaje sale por WhatsApp y queda anotado en el seguimiento.
  function mandaWhatsApp(m) {
    const tel = conLada(telefono()); if (!tel) return;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(m.texto)}`, '_blank', 'noopener');
    rpc('v2_add_collection_note', { organization_id: org, player_id: playerId, kind: 'whatsapp', body: `WhatsApp: ${m.titulo}` })
      .then(() => recarga()).catch(() => {});
  }

  /* ---------- Bloques de la pantalla ---------- */
  function acuerdoBlock() {
    const a = acuerdo(), co = datos().cobro;
    if (!a || !ESTADO[a.state]) return '';
    const e = ESTADO[a.state];
    const pct = Number(a.total) > 0 ? Math.min(100, Math.round((Number(a.paid) / Number(a.total)) * 100)) : 0;
    const pagos = (a.installments || []).map(i => `<li data-state="${esc(i.state)}"><span>${esc(fechaCorta(i.due))}</span><b>${money.format(Number(i.amount))}</b><small>${esc(a.state === 'fulfilled' ? 'Pagado' : ESTADO_PAGO[i.state] || '')}</small></li>`).join('');
    const sub = a.state === 'fulfilled' ? `Se cubrieron ${money.format(Number(a.total))}. ¡Al corriente!`
      : a.state === 'broken' ? `Se venció el pago de ${money.format(Number(a.next?.amount || 0))} del ${fechaCorta(a.next?.due)}. El recargo vuelve a aplicar.`
      : `Próximo pago: ${money.format(Number(a.next?.amount || 0))} el ${fechaCorta(a.next?.due)}. Sin recargo mientras cumpla.`;
    const acciones = [];
    if (telefono() && vigente()) acciones.push(`<button type="button" class="tan-btn" data-kind="wa" data-wa-clave="${a.state === 'broken' ? 'incumplido' : 'acuerdo'}">${a.state === 'broken' ? 'Avisar por WhatsApp' : 'Mandar por WhatsApp'}</button>`);
    if (co?.canAgree && vigente()) {
      acciones.push('<button type="button" class="tan-btn" data-kind="ghost" data-acuerdo="rehacer">Rehacer acuerdo</button>');
      acciones.push('<button type="button" class="tan-btn" data-kind="ghost" data-acuerdo="cancelar">Cancelar</button>');
    }
    return `<section class="tan-section tan-acuerdo" data-tono="${e.tono}"><div class="tan-section-head"><h2>${esc(e.t)}</h2><span>${money.format(Number(a.paid))} de ${money.format(Number(a.total))}</span></div>
      <div class="tan-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <p class="tan-acuerdo-sub">${esc(sub)}</p><ol class="tan-pagos">${pagos}</ol>
      ${a.note ? `<p class="tan-acuerdo-nota">${esc(a.note)}</p>` : ''}
      <small class="tan-acuerdo-quien">Pactado${a.createdBy ? ` por ${esc(a.createdBy)}` : ''} el ${esc(fechaCorta(a.createdAt))}${a.acknowledgedAt ? ` · la familia lo vio el ${esc(fechaCorta(a.acknowledgedAt))}` : ''}</small>
      ${acciones.length ? `<div class="tan-actions">${acciones.join('')}</div>` : ''}</section>`;
  }

  function seguimientoBlock() {
    const co = datos().cobro; if (!co) return '';
    const notas = co.notes || [];
    if (!co.canNote && !notas.length) return '';
    const form = co.canNote ? `<form class="tan-nota-form" data-nota-form>
      <div class="pres-seg" role="radiogroup" aria-label="Qué fue">${TIPOS_NOTA.map(([v, l], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-nota-tipo="${v}">${l}</button>`).join('')}</div>
      <div class="tan-nota-fila"><input type="text" maxlength="500" data-nota-texto placeholder="Ej. Llamé a la mamá, paga el viernes" aria-label="Qué pasó"><button type="submit" class="tan-btn" data-kind="pay">Anotar</button></div></form>` : '';
    const filas = notas.length ? notas.map(n => `<div class="tan-mov tan-nota" data-kind="${esc(n.kind)}"><span class="tan-dot">${shellIcon(ICONO_NOTA[n.kind] || 'book')}</span><span class="tan-mov-body"><strong>${esc(n.body)}</strong><span>${esc(n.by || 'Alguien del club')} · ${esc(hace(n.at))}</span></span></div>`).join('')
      : '<p class="tan-nota-vacia">Aún no hay seguimiento. Anota la primera llamada o visita.</p>';
    return `<section class="tan-section tan-seguimiento"><div class="tan-section-head"><h2>Seguimiento</h2><span>${notas.length ? `${notas.length} nota${notas.length === 1 ? '' : 's'}` : 'interno'}</span></div>${form}<div class="tan-ledger">${filas}</div></section>`;
  }

  // Botones extra de la tarjeta de saldo.
  function acciones() {
    const co = datos().cobro, out = [];
    if (telefono() && mensajes().length) out.push('<button type="button" class="tan-btn" data-kind="wa" data-wa-menu>WhatsApp</button>');
    if (co?.canAgree && saldo() > 0 && !vigente()) out.push('<button type="button" class="tan-btn" data-kind="ghost" data-acuerdo="nuevo">Acuerdo de pago</button>');
    return out;
  }

  /* ---------- Hoja (acuerdo, mensajes, cancelar) ---------- */
  let h = null;
  function asegura() {
    if (document.getElementById('cbSheet')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="cbBackdrop" class="pres-backdrop hidden"></div><section id="cbSheet" class="pres-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="cbTitle"><div class="pres-grab" aria-hidden="true"></div><div id="cbBody"></div></section>');
    document.getElementById('cbBackdrop').addEventListener('click', () => { if (!h?.enviando) cierra(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && h && !h.enviando) cierra(); });
    const b = document.getElementById('cbBody');
    b.addEventListener('click', clicHoja);
    b.addEventListener('input', escribeHoja);
    b.addEventListener('change', escribeHoja);
    b.addEventListener('submit', e => { e.preventDefault(); enviaHoja(); });
  }
  function abre(tipo, extra = {}) {
    asegura();
    h = { tipo, llave: llave(), enviando: false, error: '', ...extra };
    if (tipo === 'acuerdo') {
      const hoy = datos().cobro?.today || isoLocal(new Date());
      Object.assign(h, { modo: 'pagos', total: String(Math.round(saldo() * 100) / 100), n: 3, frecuencia: 'quincenal', primera: sumaDias(hoy, 7), nota: '', hoy });
      h.filas = repartePagos(num(h.total), h.n, h.primera, h.frecuencia);
    }
    pinta();
    document.getElementById('cbSheet').classList.remove('hidden');
    document.getElementById('cbBackdrop').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.querySelector('#cbBody input, #cbBody button[data-wa-clave]')?.focus(), 60);
  }
  function cierra() {
    h = null;
    document.getElementById('cbSheet')?.classList.add('hidden');
    document.getElementById('cbBackdrop')?.classList.add('hidden');
    document.body.style.overflow = '';
  }
  const cab = (t, sub) => `<header class="pres-head"><div><h2 id="cbTitle">${esc(t)}</h2><p>${esc(sub)}</p></div><button type="button" class="pres-close" data-cb-cerrar aria-label="Cerrar">×</button></header>`;
  function pinta() {
    const b = document.getElementById('cbBody'); if (!b || !h) return;
    const err = h.error ? `<div class="pres-error" role="alert">${esc(h.error)}</div>` : '';
    const boton = t => `<button type="submit" class="pres-primary"${h.enviando ? ' disabled' : ''}>${h.enviando ? 'Un momento…' : esc(t)}</button>`;
    if (h.tipo === 'whatsapp') {
      b.innerHTML = cab('Mandar por WhatsApp', nombre()) + `<div class="cb-mensajes">${mensajes().map(m => `<button type="button" class="cb-mensaje" data-wa-clave="${m.clave}"><strong>${esc(m.titulo)}</strong><span>${esc(m.texto)}</span></button>`).join('')}</div>
        <p class="pres-nota">Se abre WhatsApp con el mensaje listo y queda anotado en el seguimiento.</p>`;
    } else if (h.tipo === 'cancelar') {
      b.innerHTML = cab('Cancelar acuerdo', nombre()) + `<form class="pres-form"><p class="pres-nota">El saldo sigue igual y el recargo vuelve a aplicar como siempre.</p>
        <label>Motivo<textarea data-campo="motivo" rows="2" maxlength="300" placeholder="Queda en el seguimiento">${esc(h.motivo || '')}</textarea></label>${err}${boton('Cancelar el acuerdo')}</form>`;
    } else if (h.tipo === 'hecho') {
      const m = mensajes().find(x => x.clave === 'acuerdo');
      b.innerHTML = cab('Acuerdo guardado', nombre()) + `<div class="cobro-hecho"><p class="pres-nota">Mientras cumpla no se le cobra recargo. Si se vence un pago, el acuerdo queda incumplido y aquí se avisa.</p>
        ${m && telefono() ? '<button type="button" class="pres-primary cobro-wa" data-wa-clave="acuerdo">Mandárselo por WhatsApp</button>' : ''}
        <button type="button" class="cobro-listo" data-cb-cerrar>Listo</button></div>`;
    } else {
      const suma = h.filas.reduce((t, f) => t + num(f.amount), 0);
      const filas = h.filas.map((f, i) => `<div class="cb-fila"><span>${h.modo === 'fecha' ? 'Paga' : `Pago ${i + 1}`}</span>
        <input type="date" data-fila-fecha="${i}" value="${esc(f.due)}" min="${esc(h.hoy)}" aria-label="Fecha del pago ${i + 1}">
        <span class="cobro-peso"><input type="text" inputmode="decimal" data-fila-monto="${i}" value="${esc(String(f.amount))}" aria-label="Monto del pago ${i + 1}"></span></div>`).join('');
      const plan = h.modo === 'pagos' ? `<div class="cb-dos"><label>¿En cuántos pagos?<span class="cb-stepper"><button type="button" data-n="-1" aria-label="Menos pagos">−</button><b>${h.n}</b><button type="button" data-n="1" aria-label="Más pagos">+</button></span></label>
        <label>¿Cada cuándo?<select data-campo="frecuencia">${FRECUENCIAS.map(([v, l]) => `<option value="${v}"${v === h.frecuencia ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <label>Primer pago<input type="date" data-campo="primera" value="${esc(h.primera)}" min="${esc(h.hoy)}"></label>` : '';
      b.innerHTML = cab(h.rehacer ? 'Rehacer acuerdo' : 'Acuerdo de pago', `${nombre()} · debe ${money.format(saldo())}`) + `<form class="pres-form cb-form" novalidate>
        <div class="pres-seg cb-seg2" role="radiogroup" aria-label="Tipo de acuerdo"><button type="button" role="radio" aria-checked="${h.modo === 'fecha'}" data-modo="fecha">Paga en una fecha</button><button type="button" role="radio" aria-checked="${h.modo === 'pagos'}" data-modo="pagos">En pagos</button></div>
        <label>¿Cuánto cubre el acuerdo?<span class="cobro-peso"><input type="text" inputmode="decimal" data-campo="total" value="${esc(h.total)}"></span></label>
        ${plan}<div class="cb-filas">${filas}</div>
        <p class="pres-nota" id="cbSuma">Suman ${money.format(suma)}${Math.abs(suma - num(h.total)) > 0.004 ? ` · no cuadra con ${money.format(num(h.total))}` : ''}</p>
        <label><span>Nota <span class="cobro-opt">· opcional, la ve la familia</span></span><input type="text" data-campo="nota" maxlength="300" value="${esc(h.nota)}" placeholder="Ej. Paga en quincenas por el trabajo del papá"></label>
        <p class="pres-nota">Mientras cumpla no se cobra recargo. Si se vence un pago, queda incumplido y el recargo vuelve.</p>
        ${err}${boton(h.rehacer ? 'Guardar el nuevo acuerdo' : 'Guardar acuerdo')}</form>`;
    }
  }
  function regenera() { h.filas = h.modo === 'fecha' ? [{ due: h.primera, amount: num(h.total) }] : repartePagos(num(h.total), h.n, h.primera, h.frecuencia); }
  function clicHoja(e) {
    const t = e.target.closest('button'); if (!t || !h) return;
    if (t.matches('[data-cb-cerrar]')) { if (!h.enviando) cierra(); return; }
    if (h.enviando) return;
    if (t.dataset.waClave) { const m = mensajes().find(x => x.clave === t.dataset.waClave); if (m) { mandaWhatsApp(m); cierra(); } return; }
    if (t.dataset.modo) { h.modo = t.dataset.modo; regenera(); pinta(); return; }
    if (t.dataset.n) { h.n = Math.min(12, Math.max(2, h.n + Number(t.dataset.n))); regenera(); pinta(); }
  }
  function escribeHoja(e) {
    const x = e.target; if (!h) return;
    if (x.dataset.campo) {
      h[x.dataset.campo] = x.value;
      // El plan se rehace al soltar el campo, no a cada tecla (se perdería el cursor).
      if (e.type === 'change' && ['total', 'frecuencia', 'primera'].includes(x.dataset.campo)) { regenera(); pinta(); return; }
    } else if (x.dataset.filaFecha != null) h.filas[Number(x.dataset.filaFecha)].due = x.value;
    else if (x.dataset.filaMonto != null) h.filas[Number(x.dataset.filaMonto)].amount = x.value;
    const s = document.getElementById('cbSuma');
    if (s && h.filas) { const suma = h.filas.reduce((t, f) => t + num(f.amount), 0); s.textContent = `Suman ${money.format(suma)}${Math.abs(suma - num(h.total)) > 0.004 ? ` · no cuadra con ${money.format(num(h.total))}` : ''}`; }
  }
  function validaAcuerdo() {
    const total = num(h.total);
    if (!(total > 0)) return 'Escribe cuánto cubre el acuerdo.';
    if (total > saldo() + 0.004) return `Sólo debe ${money.format(saldo())}.`;
    let prev = '';
    for (const [i, f] of h.filas.entries()) {
      if (!f.due) return `Falta la fecha del pago ${i + 1}.`;
      if (f.due < h.hoy) return `El pago ${i + 1} no puede ser en una fecha que ya pasó.`;
      if (prev && f.due <= prev) return `Las fechas van en orden: el pago ${i + 1} va después del ${i}.`;
      if (!(num(f.amount) > 0)) return `Escribe el monto del pago ${i + 1}.`;
      prev = f.due;
    }
    const suma = h.filas.reduce((t, f) => t + num(f.amount), 0);
    if (Math.abs(suma - total) > 0.004) return `Los pagos suman ${money.format(suma)} y el acuerdo es de ${money.format(total)}.`;
    return '';
  }
  const amable = e => String(e?.message || e || '').replace(/^.*?:\s*/, '') || 'No se pudo guardar. Intenta de nuevo.';
  async function enviaHoja() {
    if (!h || h.enviando) return;
    if (h.tipo === 'acuerdo') {
      h.error = validaAcuerdo(); if (h.error) { pinta(); return; }
      h.enviando = true; pinta();
      try {
        await rpc('v2_create_payment_agreement', { organization_id: org, player_id: playerId,
          installments: h.filas.map(f => ({ due_date: f.due, amount: num(f.amount) })), note: h.nota.trim() || null,
          replace_open: !!h.rehacer, idempotency_key: h.llave });
      } catch (e) { h.enviando = false; h.error = amable(e); pinta(); return; }
      await recarga();
      h = { tipo: 'hecho', enviando: false }; pinta();
    } else if (h.tipo === 'cancelar') {
      if (String(h.motivo || '').trim().length < 5) { h.error = 'Escribe el motivo (al menos 5 letras).'; pinta(); return; }
      h.enviando = true; pinta();
      try { await rpc('v2_cancel_payment_agreement', { organization_id: org, agreement_id: acuerdo()?.id, reason: h.motivo.trim() }); }
      catch (e) { h.enviando = false; h.error = amable(e); pinta(); return; }
      cierra(); await recarga(); avisar('Acuerdo cancelado. El recargo vuelve a aplicar como siempre.');
    }
  }

  /* ---------- Clics en la pantalla ---------- */
  let tipoNota = 'call';
  document.addEventListener('click', e => {
    const t = e.target.closest?.('[data-acuerdo],[data-wa-menu],[data-wa-clave],[data-nota-tipo]');
    if (!t || t.closest('#cbBody')) return;
    if (t.dataset.notaTipo) {
      tipoNota = t.dataset.notaTipo;
      t.parentElement.querySelectorAll('[data-nota-tipo]').forEach(x => x.setAttribute('aria-checked', String(x === t)));
    } else if (t.hasAttribute('data-wa-menu')) abre('whatsapp');
    else if (t.dataset.waClave) { const m = mensajes().find(x => x.clave === t.dataset.waClave); if (m) mandaWhatsApp(m); }
    else if (t.dataset.acuerdo === 'nuevo') abre('acuerdo');
    else if (t.dataset.acuerdo === 'rehacer') abre('acuerdo', { rehacer: true });
    else if (t.dataset.acuerdo === 'cancelar') abre('cancelar');
  });
  document.addEventListener('submit', async e => {
    const f = e.target.closest?.('[data-nota-form]'); if (!f) return;
    e.preventDefault();
    const input = f.querySelector('[data-nota-texto]'), texto = input.value.trim();
    if (!texto) { input.focus(); return; }
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      await rpc('v2_add_collection_note', { organization_id: org, player_id: playerId, kind: tipoNota, body: texto });
      tipoNota = 'call'; await recarga(); avisar('Quedó anotado en el seguimiento.');
    } catch (err) { btn.disabled = false; avisar(amable(err)); }
  });

  return { acuerdoBlock, seguimientoBlock, acciones };
}
