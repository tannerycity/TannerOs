/* PORTAL DE LA PLATAFORMA (Presidencia, 10/10/2026).
 *
 * "Cuando lo vaya a vender como SaaS, necesito entrar a un portal para dar de
 * alta un club y configurarlo fácil."
 *
 *   · Tablero: los clubes con su plan, jugadores, usuarios y si el dueño ya
 *     entró; el ingreso mensual estimado y los planes de venta.
 *   · Alta en 5 pasos: identidad (nombre y colores), plan, categorías con su
 *     mensualidad, cobro y dueño. El servidor crea todo en una transacción
 *     (v2_provision_club, l3) y el dueño recibe un WhatsApp para entrar.
 *   · El nombre del producto todavía no está decidido: se cambia aquí.
 *   · Club demo para vender (y3): un club con datos de ejemplo para enseñarlo
 *     sin tocar los de Tannery. No cuenta en clubes, jugadores ni ingreso.
 *
 * Sólo el administrador de plataforma entra (v2_am_i_platform_admin).
 */
import { bootstrapProtectedShell, rpc, $, setShellHealth } from '/v2/shell.js';
import { ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { PASOS, CATEGORIAS_SUGERIDAS, slugDe, faltantes, datosParaAlta, mensajeBienvenida } from '/v2/admin/clubes/alta.js';
import { ingresoMensual, usoDelPlan } from '/v2/admin/plan.js';

const boot = await bootstrapProtectedShell({ active: 'admin', title: 'Portal' });
if (!boot) throw new Error('No access');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);
const cuando = v => {
  if (!v) return 'Sin actividad';
  const dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return dias <= 0 ? 'Activo hoy' : dias === 1 ? 'Activo ayer' : `Activo hace ${dias} días`;
};
const ERRORES = { 'Not authorized': 'Tu cuenta no puede dar de alta clubes.' };
const amable = e => ERRORES[e?.message] || e?.message || 'No se pudo completar.';
function msg(id, t = '', tipo = 'error') { const e = $(id); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }
const iniciales = n => String(n || '').split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FC';

let tablero = null;

async function carga() {
  if (!(await rpc('v2_am_i_platform_admin'))) {
    $('pfDenied').classList.remove('hidden'); setShellHealth({ state: 'attention', label: 'Sin permiso' }); return;
  }
  tablero = await rpc('v2_platform_board');
  $('pf').classList.remove('hidden');
  pinta();
  await cargaCobros();
}

// === Cobros a clubes (j4–n4) ===
// El día 1 se emite la mensualidad; vence el 5; del 6 lleva recargo; el día de
// solo lectura el staff del club ya no guarda. Aquí se registra el pago.
let cobros = null;
const ddmm = iso => { const [, m, d] = String(iso || '').slice(0, 10).split('-'); return d && m ? `${d}/${m}` : ''; };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
function estadoDelCobro(c) {
  if (c.status === 'paid') return { clase: 'ok', texto: `Pagado ${ddmm(c.paidAt)}` };
  if (c.readOnly) return { clase: 'bloqueo', texto: 'Solo lectura' };
  if (Number(c.lateFeeMxn) > 0) return { clase: 'tarde', texto: `Con recargo · solo lectura el ${ddmm(c.readOnlyDate)}` };
  return { clase: 'aviso', texto: hoyLocal() === String(c.dueDate) ? 'Vence hoy' : `Vence el ${ddmm(c.dueDate)}` };
}
async function cargaCobros() {
  try { cobros = await rpc('v2_platform_invoices'); } catch (e) { cobros = null; msg('pfMensaje', amable(e)); return; }
  pintaCobros();
}
function pintaCobros() {
  const cfg = cobros?.settings || {}, lista = cobros?.invoices || [];
  $('pfCobroReglas').textContent = `Vence el día ${cfg.dueDay ?? 5}; después lleva ${dinero(cfg.lateFeeMxn ?? 100)} de recargo; desde el día ${cfg.readOnlyDay ?? 15} sin pago, el club queda en solo lectura.`
    + (cfg.clabe ? '' : ' Falta tu CLABE: los clubes no sabrán a dónde pagar.');
  const pendiente = lista.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.total || 0), 0);
  $('pfCobrosTitulo').textContent = pendiente ? `Cobros a clubes · ${dinero(pendiente)} por cobrar` : 'Cobros a clubes';
  $('pfCobros').innerHTML = lista.map(c => {
    const e = estadoDelCobro(c), mes = MESES[Number(String(c.period).slice(5, 7)) - 1] || '';
    return `<article class="pf-cobro pf-cobro-${e.clase}" data-id="${esc(c.id)}">
      <div><strong>${esc(c.club)}</strong><small>${esc(mes)} ${esc(String(c.period).slice(0, 4))}${Number(c.lateFeeMxn) > 0 ? ` · incluye ${dinero(c.lateFeeMxn)} de recargo` : ''}</small></div>
      <b>${dinero(c.total)}</b><span class="pf-cobro-estado">${esc(e.texto)}</span>
      ${c.status === 'pending' ? `<button type="button" class="pf-sec" data-pagar="${esc(c.id)}">Registrar pago</button>` : ''}
    </article>`;
  }).join('') || '<p class="clubes-muted">Todavía no hay cobros. Se emiten el día 1 de cada mes a los clubes que pagan (no a Tannery ni a las demos).</p>';
}
$('pfCobros').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-pagar]'); if (!b) return;
  const c = (cobros?.invoices || []).find(x => x.id === b.dataset.pagar); if (!c) return;
  const ref = window.prompt(`Pago de ${c.club}: ${dinero(c.total)}. Referencia o folio (opcional)`, '');
  if (ref === null) return;
  const perdona = Number(c.lateFeeMxn) > 0 && window.confirm(`¿Perdonar el recargo de ${dinero(c.lateFeeMxn)}? Aceptar = sí, Cancelar = cobrarlo.`);
  b.disabled = true;
  try {
    const r = await rpc('v2_record_club_payment', { invoice_id: c.id, method: 'Transferencia', reference: ref, waive_late_fee: perdona });
    msg('pfMensaje', `Pago de ${c.club} registrado: ${dinero(r?.total)}.${r?.readOnly ? ' Todavía debe otro mes y sigue en solo lectura.' : ''}`, 'success');
    await cargaCobros();
  } catch (e) { msg('pfMensaje', amable(e)); b.disabled = false; }
});
$('pfCobroAjustes').addEventListener('click', () => {
  const f = $('pfCobroForm'), cfg = cobros?.settings || {};
  if (f.classList.toggle('hidden')) return;
  $('cbBanco').value = cfg.bank || ''; $('cbClabe').value = cfg.clabe || ''; $('cbTitular').value = cfg.holder || '';
  $('cbVence').value = cfg.dueDay ?? 5; $('cbRecargo').value = cfg.lateFeeMxn ?? 100; $('cbSoloLectura').value = cfg.readOnlyDay ?? 15;
});
$('pfCobroForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const clabe = $('cbClabe').value.replace(/\D/g, '');
  if (clabe && clabe.length !== 18) { msg('pfMensaje', 'La CLABE lleva 18 dígitos.'); return; }
  if (Number($('cbSoloLectura').value) <= Number($('cbVence').value)) { msg('pfMensaje', 'El día de solo lectura va después del vencimiento.'); return; }
  try {
    const v = await rpc('v2_update_platform_billing', { settings: { bank: $('cbBanco').value, clabe, holder: $('cbTitular').value,
      dueDay: Number($('cbVence').value), lateFeeMxn: Number($('cbRecargo').value), readOnlyDay: Number($('cbSoloLectura').value) } });
    cobros = { ...(cobros || {}), settings: v || cobros?.settings }; pintaCobros();
    $('pfCobroForm').classList.add('hidden'); msg('pfMensaje', 'Datos de cobro guardados.', 'success');
  } catch (e) { msg('pfMensaje', amable(e)); }
});

function pinta() {
  const t = tablero, clubes = t.clubs || [];
  const reales = clubes.filter(c => !c.demo);
  $('pfProducto').textContent = t.product?.name || 'TannerOS';
  $('pfLema').textContent = t.product?.tagline || '';
  $('kClubes').textContent = reales.length;
  $('kJugadores').textContent = reales.reduce((s, c) => s + Number(c.players || 0), 0);
  $('kIngreso').textContent = dinero(ingresoMensual(reales, t.plans));
  $('kPendientes').textContent = reales.filter(c => c.ownerPending).length;
  const planDe = new Map((t.plans || []).map(pl => [pl.code, pl]));
  $('pfClubes').innerHTML = clubes.map(c => {
    const p = c.colors?.primary || '#012A3A', s = c.colors?.secondary || '#087D8E';
    const uso = usoDelPlan(c.players, planDe.get(c.planCode));
    const jugadores = uso.max == null ? `<b>${uso.activos}</b> jugadores`
      : `<b class="${uso.extra ? 'pf-extra' : uso.cerca ? 'pf-cerca' : ''}">${uso.activos}/${uso.max}</b> jugadores${uso.extra ? ` · +${uso.extra} extra (${dinero(uso.extraMxn)})` : ''}`;
    const docs = Number(c.docsPending || 0);
    return `<article class="pf-club${c.demo ? ' pf-club-demo' : ''}">
      <span class="pf-escudo" style="background:linear-gradient(150deg,${esc(p)},${esc(s)})">${esc(iniciales(c.name))}</span>
      <div class="pf-club-txt"><strong>${esc(c.name)}${c.demo ? '<em class="pf-demo">Demo</em>' : ''}</strong><small>${esc([c.city, `/${c.slug}`].filter(Boolean).join(' · '))}</small>
        <span class="pf-club-datos">${jugadores} · <b>${Number(c.users || 0)}</b> usuarios · <b>${Number(c.categories || 0)}</b> categorías</span>
        ${docs ? `<span class="pf-pend">${docs === 1 ? '1 documento' : `${docs} documentos`} por completar (domicilio y contacto del aviso de privacidad)</span>` : ''}
        ${c.ownerPending ? `<span class="pf-pend">Dueño sin entrar: ${esc(c.ownerPending)}</span>` : `<span class="pf-act">${esc(cuando(c.lastActivity))}</span>`}
      </div>
      <span class="pf-plan pf-plan-${esc(c.planCode || 'x')}">${esc(c.plan || 'Sin plan')}${c.founder ? '<i>Fundador</i>' : ''}</span>
    </article>`;
  }).join('') || '<p class="clubes-muted">Todavía no hay clubes.</p>';
  $('pfPlanes').innerHTML = (t.plans || []).map(p => `<article class="pf-plancard pf-plan-${esc(p.code)}">
    <strong>${esc(p.name)}</strong><b>${dinero(p.priceMxn)}<small>/mes</small></b>
    <span>${p.maxPlayers ? `Hasta ${Number(p.maxPlayers)} jugadores` : 'Jugadores ilimitados'} · ${Number(p.modules)} módulos</span>
    <p>${esc(p.description || '')}</p></article>`).join('');
  setShellHealth({ state: 'ok', label: `${reales.length} club${reales.length === 1 ? '' : 'es'}` });
}

// === Nombre del producto ===
$('pfRenombrar').addEventListener('click', async () => {
  const actual = tablero?.product || {};
  const nombre = window.prompt('¿Cómo se llama el producto? (se puede cambiar después)', actual.name || 'TannerOS');
  if (nombre === null) return;
  const lema = window.prompt('Frase corta (opcional)', actual.tagline || '');
  try {
    await rpc('v2_set_product_name', { name: nombre, tagline: lema });
    tablero = await rpc('v2_platform_board'); pinta();
    msg('pfMensaje', `El producto ahora se llama ${tablero.product?.name}.`, 'success');
  } catch (e) { msg('pfMensaje', amable(e)); }
});

// === Club demo para vender ===
const correoValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
$('pfDemo').addEventListener('click', async () => {
  const correo = window.prompt('¿Con qué correo entras a la demo? Quedarás como dueño del club demo.', '');
  if (correo === null) return;
  const limpio = correo.trim().toLowerCase();
  if (!correoValido(limpio)) { msg('pfMensaje', 'Escribe un correo válido.'); return; }
  const btn = $('pfDemo'); btn.disabled = true; btn.textContent = 'Creando demo…';
  try {
    const r = await rpc('v2_create_demo_club', { owner_email: limpio });
    tablero = await rpc('v2_platform_board'); pinta();
    const n = r?.datos?.jugadores;
    msg('pfMensaje', `Listo: ${r.name}${n ? ` con ${n} jugadores de ejemplo` : ''}. Entra con ${limpio} en ${location.origin}/?club=${r.slug}`, 'success');
  } catch (e) { msg('pfMensaje', amable(e)); }
  finally { btn.disabled = false; btn.textContent = 'Crear demo'; }
});

// === Alta en 5 pasos ===
let paso = 0, d = null;
const nuevo = () => ({ name: '', slug: '', slugTocado: false, city: '', colors: { primary: '#0B3D5C', secondary: '#1F9D8B', accent: '#C6AC5C' },
  planCode: 'cantera', founder: false, cuotaBase: '', categories: [], chargeDay: 1, dueDay: 5, lateFee: 100, owner: { name: '', email: '', phone: '' } });

function abreAlta() { d = nuevo(); paso = 0; $('azFondo').classList.remove('hidden'); document.body.style.overflow = 'hidden'; pintaPaso(); }
function cierraAlta(forzar) {
  if (!forzar && d?.name && !window.confirm('¿Salir sin crear el club?')) return;
  $('azFondo').classList.add('hidden'); document.body.style.overflow = ''; d = null;
}

function pintaPaso() {
  msg('azMsg');
  const final = paso === PASOS.length;
  $('azPasoTxt').textContent = final ? 'Revisa y crea' : `Paso ${paso + 1} de ${PASOS.length}`;
  $('azTitulo').textContent = final ? 'Resumen' : PASOS[paso];
  $('azPasos').innerHTML = PASOS.map((p, i) => `<li class="${i < paso ? 'hecho' : i === paso ? 'actual' : ''}">${esc(p)}</li>`).join('');
  $('azAtras').classList.toggle('invisible', paso === 0);
  $('azSig').textContent = final ? 'Crear club' : paso === PASOS.length - 1 ? 'Revisar' : 'Siguiente';
  const c = $('azCuerpo');
  if (paso === 0) {
    c.innerHTML = `
      <label class="az-campo">Nombre del club<input id="aNombre" maxlength="80" value="${esc(d.name)}" placeholder="Ej. Club Atlético León Norte" autocomplete="off"></label>
      <label class="az-campo">Identificador<span class="az-slug">/<input id="aSlug" maxlength="50" value="${esc(d.slug)}"></span><small>Va en sus ligas públicas y no se cambia después.</small></label>
      <label class="az-campo">Ciudad<input id="aCiudad" maxlength="60" value="${esc(d.city)}" placeholder="León, Gto."></label>
      <div class="az-colores">
        <label>Color principal<input type="color" id="aC1" value="${esc(d.colors.primary)}"></label>
        <label>Color secundario<input type="color" id="aC2" value="${esc(d.colors.secondary)}"></label>
        <label>Acento<input type="color" id="aC3" value="${esc(d.colors.accent)}"></label>
      </div>
      <div id="aVista" class="az-vista"></div>`;
    const vista = () => { $('aVista').innerHTML = `<span class="pf-escudo" style="background:linear-gradient(150deg,${esc(d.colors.primary)},${esc(d.colors.secondary)})">${esc(iniciales(d.name))}</span><div><strong>${esc(d.name || 'Tu club')}</strong><small style="color:${esc(d.colors.accent)}">Así se verá en su app</small></div>`; $('aVista').style.background = d.colors.primary; };
    $('aNombre').addEventListener('input', e => { d.name = e.target.value; if (!d.slugTocado) { d.slug = slugDe(d.name); $('aSlug').value = d.slug; } vista(); });
    $('aSlug').addEventListener('input', e => { d.slugTocado = true; d.slug = slugDe(e.target.value); });
    $('aSlug').addEventListener('blur', e => { e.target.value = d.slug; });
    $('aCiudad').addEventListener('input', e => { d.city = e.target.value; });
    [['aC1', 'primary'], ['aC2', 'secondary'], ['aC3', 'accent']].forEach(([id, k]) => $(id).addEventListener('input', e => { d.colors[k] = e.target.value; vista(); }));
    vista(); setTimeout(() => $('aNombre').focus(), 50);
  } else if (paso === 1) {
    c.innerHTML = `<div class="az-planes">${(tablero.plans || []).map(p => `<button type="button" class="az-plan${d.planCode === p.code ? ' activo' : ''}" data-plan="${esc(p.code)}">
        <strong>${esc(p.name)}</strong><b>${dinero(p.priceMxn)}<small>/mes</small></b>
        <span>${p.maxPlayers ? `Hasta ${Number(p.maxPlayers)} jugadores` : 'Jugadores ilimitados'}</span><p>${esc(p.description || '')}</p></button>`).join('')}</div>
      <label class="az-check"><input type="checkbox" id="aFundador"${d.founder ? ' checked' : ''}> <span><b>Club fundador</b> · 50% de descuento el primer año, a cambio de feedback y un testimonio</span></label>`;
    c.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => { d.planCode = b.dataset.plan; pintaPaso(); }));
    $('aFundador').addEventListener('change', e => { d.founder = e.target.checked; });
  } else if (paso === 2) {
    const tiene = n => d.categories.some(x => x.name.toLowerCase() === n.toLowerCase());
    c.innerHTML = `
      <label class="az-campo">Mensualidad general<span class="az-pesos">$<input id="aCuota" type="number" min="0" inputmode="numeric" value="${esc(d.cuotaBase)}" placeholder="500"></span><small>Se pone a cada categoría nueva; luego puedes ajustar cada una.</small></label>
      <p class="az-et">Toca las categorías que tiene el club</p>
      <div class="az-chips">${CATEGORIAS_SUGERIDAS.map(n => `<button type="button" data-cat="${esc(n)}" class="${tiene(n) ? 'activo' : ''}">${esc(n)}</button>`).join('')}</div>
      <div class="az-otra"><input id="aOtraCat" maxlength="40" placeholder="Otra categoría (ej. T10)"><button type="button" id="aAgregaCat" class="pf-sec">Agregar</button></div>
      <div id="aCats" class="az-cats"></div>`;
    const lista = () => {
      $('aCats').innerHTML = d.categories.map((x, i) => `<div class="az-cat"><strong>${esc(x.name)}</strong><span class="az-pesos">$<input type="number" min="0" data-cuota="${i}" value="${esc(x.monthlyFee ?? '')}" placeholder="—"></span><button type="button" data-quita="${i}" aria-label="Quitar ${esc(x.name)}">&times;</button></div>`).join('') || '<p class="clubes-muted">Sin categorías todavía.</p>';
      $('aCats').querySelectorAll('[data-cuota]').forEach(inp => inp.addEventListener('input', e => { d.categories[Number(e.target.dataset.cuota)].monthlyFee = e.target.value; }));
      $('aCats').querySelectorAll('[data-quita]').forEach(b => b.addEventListener('click', () => { d.categories.splice(Number(b.dataset.quita), 1); pintaPaso(); }));
    };
    const agrega = n => { n = String(n || '').trim(); if (!n || tiene(n)) return; d.categories.push({ name: n, monthlyFee: d.cuotaBase }); };
    c.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      const n = b.dataset.cat;
      if (tiene(n)) d.categories = d.categories.filter(x => x.name.toLowerCase() !== n.toLowerCase()); else agrega(n);
      pintaPaso();
    }));
    $('aAgregaCat').addEventListener('click', () => { agrega($('aOtraCat').value); pintaPaso(); });
    $('aOtraCat').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agrega(e.target.value); pintaPaso(); } });
    $('aCuota').addEventListener('change', e => { const v = e.target.value; d.categories.forEach(x => { if (x.monthlyFee === '' || x.monthlyFee == null || x.monthlyFee === d.cuotaBase) x.monthlyFee = v; }); d.cuotaBase = v; lista(); });
    lista();
  } else if (paso === 3) {
    c.innerHTML = `
      <div class="az-tres">
        <label class="az-campo">Día de cobro<input id="aCobro" type="number" min="1" max="28" value="${esc(d.chargeDay)}"><small>Cuándo se genera la mensualidad</small></label>
        <label class="az-campo">Día de vencimiento<input id="aVence" type="number" min="1" max="28" value="${esc(d.dueDay)}"><small>Después de este día, recargo</small></label>
        <label class="az-campo">Recargo<span class="az-pesos">$<input id="aRecargo" type="number" min="0" value="${esc(d.lateFee)}"></span><small>Por pago tardío</small></label>
      </div>
      <p class="az-nota">Los datos de la cuenta para transferencias los pone el club después en Configuración del club.</p>`;
    $('aCobro').addEventListener('input', e => { d.chargeDay = e.target.value; });
    $('aVence').addEventListener('input', e => { d.dueDay = e.target.value; });
    $('aRecargo').addEventListener('input', e => { d.lateFee = e.target.value; });
  } else if (paso === 4) {
    c.innerHTML = `
      <label class="az-campo">Nombre del dueño<input id="aDueno" maxlength="80" value="${esc(d.owner.name)}" placeholder="Quién preside el club" autocomplete="off"></label>
      <label class="az-campo">Correo<input id="aCorreo" type="email" maxlength="120" value="${esc(d.owner.email)}" placeholder="dueño@club.com" autocomplete="off"><small>Con este correo crea su cuenta y entra como Presidencia.</small></label>
      <label class="az-campo">WhatsApp<input id="aTel" inputmode="tel" maxlength="20" value="${esc(d.owner.phone)}" placeholder="477 123 4567"><small>Para mandarle su bienvenida.</small></label>`;
    $('aDueno').addEventListener('input', e => { d.owner.name = e.target.value; });
    $('aCorreo').addEventListener('input', e => { d.owner.email = e.target.value; });
    $('aTel').addEventListener('input', e => { d.owner.phone = e.target.value; });
  } else {
    const plan = (tablero.plans || []).find(p => p.code === d.planCode);
    c.innerHTML = `<div class="az-resumen">
      <div class="az-vista" style="background:${esc(d.colors.primary)}"><span class="pf-escudo" style="background:linear-gradient(150deg,${esc(d.colors.primary)},${esc(d.colors.secondary)})">${esc(iniciales(d.name))}</span><div><strong>${esc(d.name)}</strong><small style="color:${esc(d.colors.accent)}">/${esc(d.slug)}${d.city ? ` · ${esc(d.city)}` : ''}</small></div></div>
      <dl>
        <dt>Plan</dt><dd>${esc(plan?.name || d.planCode)} · ${dinero(plan?.priceMxn)}/mes${d.founder ? ' · Fundador (50% el primer año)' : ''}</dd>
        <dt>Categorías</dt><dd>${d.categories.map(x => `${esc(x.name)}${x.monthlyFee !== '' && x.monthlyFee != null ? ` (${dinero(x.monthlyFee)})` : ''}`).join(', ')}</dd>
        <dt>Cobro</dt><dd>Día ${esc(d.chargeDay)} · vence el ${esc(d.dueDay)} · recargo ${dinero(d.lateFee)}</dd>
        <dt>Dueño</dt><dd>${esc(d.owner.name)} · ${esc(d.owner.email.trim().toLowerCase())}${d.owner.phone ? ` · ${esc(d.owner.phone)}` : ''}</dd>
      </dl>
      <p class="az-nota">El identificador <b>/${esc(d.slug)}</b> no se cambia después.</p></div>`;
  }
}

async function siguiente() {
  if (paso < PASOS.length) {
    const f = faltantes(paso, d);
    if (f.length) { msg('azMsg', f.join(' ')); return; }
    paso++; pintaPaso(); return;
  }
  const btn = $('azSig'); btn.disabled = true; btn.textContent = 'Creando…';
  try {
    const r = await rpc('v2_provision_club', { club: datosParaAlta(d) });
    listo(r);
    tablero = await rpc('v2_platform_board'); pinta();
  } catch (e) { msg('azMsg', amable(e)); btn.disabled = false; btn.textContent = 'Crear club'; }
}

function listo(r) {
  const producto = tablero?.product?.name || 'TannerOS';
  const texto = mensajeBienvenida({ club: r.name, dueno: r.ownerName, correo: r.ownerEmail, producto, url: `${location.origin}/?club=${encodeURIComponent(r.slug)}&alta=1` });
  const wa = ligaWhatsApp(r.ownerPhone, texto);
  $('azPasoTxt').textContent = 'Listo';
  $('azTitulo').textContent = `${r.name} quedó creado`;
  $('azPasos').innerHTML = PASOS.map(p => `<li class="hecho">${esc(p)}</li>`).join('');
  $('azCuerpo').innerHTML = `<div class="az-listo">
      <p>Plan <b>${esc(((tablero.plans || []).find(p => p.code === r.plan) || {}).name || r.plan)}</b> · ${Number(r.categories)} categorías · el dueño entra con <b>${esc(r.ownerEmail)}</b>.</p>
      <p class="az-et">Mándale su bienvenida</p>
      <pre id="aBienvenida">${esc(texto)}</pre>
      <div class="az-listo-btns">${wa ? `<a class="pf-cta" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}<button type="button" id="aCopiar" class="pf-sec">Copiar mensaje</button></div>
      <p class="az-nota">Lo que sigue lo hace el dueño desde su app: escudo, profes, jugadores y datos bancarios.</p></div>`;
  $('aCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(texto); $('aCopiar').textContent = 'Copiado'; } catch { $('aCopiar').textContent = 'Selecciona y copia'; } });
  $('azAtras').classList.add('invisible');
  $('azSig').disabled = false; $('azSig').textContent = 'Terminar';
  paso = -1; d = null;
}

$('pfAlta').addEventListener('click', abreAlta);
$('azCerrar').addEventListener('click', () => cierraAlta(paso === -1));
$('azAtras').addEventListener('click', () => { if (paso > 0) { paso--; pintaPaso(); } });
$('azSig').addEventListener('click', () => { if (paso === -1) { cierraAlta(true); return; } siguiente(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('azFondo').classList.contains('hidden')) cierraAlta(paso === -1); });

try { await carga(); } catch (e) { msg('pfMensaje', amable(e)); setShellHealth({ state: 'attention', label: 'Error' }); }
