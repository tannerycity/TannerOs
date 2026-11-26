/* A QUIÉN SE LE PAGÓ (25/11/2026, h102).
 * Presidencia: "que podamos escoger a quién se le está pagando... DT Brandon
 * Andrade y lo escogemos... que diga otro... agregar nuevo y que sea fácil".
 * El campo "A quién" de Taquilla y Contabilidad abre una hoja con el Staff y
 * los proveedores; también "Otro" (se escribe a mano) y "+ Agregar nuevo".
 * El egreso sigue guardando el nombre: el servidor lo liga con su
 * beneficiario (por nombre o alias), así que nada más cambia.
 * agrupa() y coincide() no dibujan: se prueban con node. */

const sinAcentos = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Los activos, por grupo y en orden alfabético; con búsqueda por nombre o alias.
export function agrupa(payees, q = '') {
  const busca = sinAcentos(q);
  const pasa = (p) => p.active !== false && (!busca || [p.name, ...(p.aliases || [])].some((n) => sinAcentos(n).includes(busca)));
  const orden = (a, b) => String(a.name).localeCompare(String(b.name), 'es');
  const vivos = (payees || []).filter(pasa);
  return { staff: vivos.filter((p) => p.kind === 'staff').sort(orden), proveedores: vivos.filter((p) => p.kind === 'proveedor').sort(orden) };
}

// Lo mismo que hace el servidor: ¿con quién se liga este texto?
export function coincide(payees, texto) {
  const t = sinAcentos(texto);
  if (!t) return null;
  const todos = (payees || []).filter((p) => sinAcentos(p.name) === t || (p.aliases || []).some((a) => sinAcentos(a) === t));
  return todos.sort((a, b) => (b.active !== false) - (a.active !== false))[0] || null;
}

let datos = null, cargando = null;
export async function cargaBeneficiarios(rpc, org, { fresco = false } = {}) {
  if (datos && !fresco) return datos;
  if (cargando && !fresco) return cargando;
  cargando = rpc('v2_expense_payees', { organization_id: org })
    .then((d) => (datos = { payees: Array.isArray(d?.payees) ? d.payees : [], staffSinAlta: Array.isArray(d?.staffSinAlta) ? d.staffSinAlta : [] }))
    .catch(() => (datos = { payees: [], staffSinAlta: [] }))
    .finally(() => { cargando = null; });
  return cargando;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERRORES = { 'Payee already exists': 'Ya está en la lista.', 'Payee needs a name': 'Escribe el nombre.', 'Not authorized': 'Tu cuenta no puede agregar a la lista.' };

function estilos() {
  if (document.getElementById('benefEstilos')) return;
  const s = document.createElement('style');
  s.id = 'benefEstilos';
  s.textContent = `
.benef-fondo{position:fixed;inset:0;z-index:9997;background:rgba(7,25,30,.45);display:flex;align-items:flex-end;justify-content:center}
.benef-hoja{width:100%;max-width:520px;max-height:86vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;font:inherit;color:#10252b}
@media (min-width:700px){.benef-fondo{align-items:center}.benef-hoja{border-radius:22px}}
.benef-hoja h3{margin:0 0 4px;font-size:19px}
.benef-hoja .benef-sub{margin:0 0 12px;color:#5f7076;font-size:13px}
.benef-buscar{width:100%;box-sizing:border-box;min-height:44px;border-radius:12px;border:1px solid #d6dfdd;padding:0 12px;font:inherit;font-size:15px;margin-bottom:10px}
.benef-grupo{margin:12px 0 6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5f7076}
.benef-lista{display:grid;gap:6px}
.benef-op{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:46px;padding:10px 12px;border-radius:12px;border:1px solid #e4ebe9;background:#f7f9f8;font:inherit;font-size:15px;text-align:left;cursor:pointer;color:#10252b}
.benef-op[aria-pressed="true"]{border-color:#0b3d4a;background:#e3f1f3;font-weight:700}
.benef-op small{color:#7a8a8e;font-size:12px}
.benef-acc{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.benef-acc button,.benef-nuevo button{min-height:46px;border-radius:12px;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
.benef-sec{border:1px solid #d6dfdd;background:#fff;color:#0b3d4a}
.benef-pri{border:0;background:#0b3d4a;color:#fff}
.benef-nuevo[hidden]{display:none}
.benef-nuevo{display:grid;gap:10px;margin-top:12px;padding:12px;border-radius:14px;background:#f7f9f8}
.benef-tipo{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.benef-tipo button{min-height:40px;border-radius:10px;border:1px solid #d6dfdd;background:#fff;color:#31525c}
.benef-tipo button[aria-pressed="true"]{border-color:#0b3d4a;background:#0b3d4a;color:#fff}
.benef-chips{display:flex;flex-wrap:wrap;gap:6px}
.benef-chips button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #d6dfdd;background:#fff;color:#0b3d4a;font-size:13px;font-weight:700}
.benef-msg{color:#a53c2f;font-size:13px;font-weight:700}
.benef-ligado{display:block;margin-top:4px;font-size:12px;color:#5f7076}`;
  document.head.appendChild(s);
}

/* Conecta un campo de texto con la hoja. El campo sigue siendo el que manda
   el nombre; "Otro" lo deja escribir a mano. */
export function pegaSelector(input, { rpc, org, puedeAgregar = true, alCambiar = null } = {}) {
  if (!input || input.dataset.benef === '1') return;
  input.dataset.benef = '1';
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');
  input.placeholder = 'Toca para escoger';
  estilos();
  const nota = document.createElement('small');
  nota.className = 'benef-ligado';
  input.insertAdjacentElement('afterend', nota);
  const pintaNota = async () => {
    const d = await cargaBeneficiarios(rpc, org);
    const p = coincide(d.payees, input.value);
    nota.textContent = !input.value.trim() ? '' : p ? (p.kind === 'staff' ? 'Staff' : 'Proveedor') + (p.name !== input.value.trim() ? ' · ' + p.name : '') : 'Otro';
  };
  const pon = (nombre, libre = false) => {
    input.value = nombre; input.dataset.libre = libre ? '1' : '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    pintaNota(); alCambiar?.(nombre);
  };
  const abre = async (e) => {
    if (input.dataset.libre === '1') return;
    e?.preventDefault(); input.blur();
    const d = await cargaBeneficiarios(rpc, org);
    hoja(d);
  };
  input.addEventListener('click', abre);
  input.addEventListener('focus', abre);
  input.addEventListener('keydown', (e) => { if (input.dataset.libre !== '1' && (e.key === 'Enter' || e.key === ' ')) abre(e); });
  input.addEventListener('blur', pintaNota);
  pintaNota();

  function hoja(d) {
    const fondo = document.createElement('div');
    fondo.className = 'benef-fondo';
    fondo.innerHTML = '<div class="benef-hoja" role="dialog" aria-modal="true" aria-labelledby="benefTitulo"><h3 id="benefTitulo">¿A quién se le pagó?</h3>' +
      '<p class="benef-sub">Escoge de la lista. Si no está, agrégalo.</p>' +
      '<input class="benef-buscar" type="search" placeholder="Buscar" aria-label="Buscar"><div class="benef-cuerpo"></div>' +
      '<div class="benef-acc"><button type="button" class="benef-sec" data-otro>Otro (escribirlo)</button>' +
      (puedeAgregar ? '<button type="button" class="benef-pri" data-nuevo>+ Agregar nuevo</button>' : '<button type="button" class="benef-sec" data-cerrar>Cerrar</button>') + '</div>' +
      '<div class="benef-nuevo" hidden></div></div>';
    document.body.appendChild(fondo);
    const cierra = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') cierra(); };
    document.addEventListener('keydown', tecla);
    const cuerpo = fondo.querySelector('.benef-cuerpo'), buscar = fondo.querySelector('.benef-buscar');
    const actual = coincide(d.payees, input.value);
    const lista = () => {
      const g = agrupa(d.payees, buscar.value);
      const op = (p) => '<button type="button" class="benef-op" data-pon="' + esc(p.name) + '" aria-pressed="' + (actual?.id === p.id) + '"><span>' + esc(p.name) + '</span></button>';
      cuerpo.innerHTML = (g.staff.length ? '<div class="benef-grupo">Staff</div><div class="benef-lista">' + g.staff.map(op).join('') + '</div>' : '') +
        (g.proveedores.length ? '<div class="benef-grupo">Proveedores</div><div class="benef-lista">' + g.proveedores.map(op).join('') + '</div>' : '') +
        (!g.staff.length && !g.proveedores.length ? '<p class="benef-sub">No está en la lista. Agrégalo o usa "Otro".</p>' : '');
    };
    lista();
    buscar.addEventListener('input', lista);
    fondo.addEventListener('click', async (e) => {
      if (e.target === fondo || e.target.closest('[data-cerrar]')) return cierra();
      const b = e.target.closest('[data-pon]');
      if (b) { pon(b.dataset.pon); return cierra(); }
      if (e.target.closest('[data-otro]')) { cierra(); input.dataset.libre = '1'; input.placeholder = 'Escribe a quién'; input.focus(); input.select(); return; }
      if (e.target.closest('[data-nuevo]')) return nuevo(fondo.querySelector('.benef-nuevo'), buscar.value, cierra);
    });
  }

  function nuevo(caja, texto, cierra) {
    let tipo = 'staff';
    const d = datos || { staffSinAlta: [] };
    caja.hidden = false;
    caja.innerHTML = '<strong>Agregar a la lista</strong>' +
      (d.staffSinAlta.length ? '<div><div class="benef-grupo">De tu Staff</div><div class="benef-chips">' +
        d.staffSinAlta.map((s) => '<button type="button" data-staff="' + esc(s.id) + '">' + esc(s.name) + '</button>').join('') + '</div></div>' : '') +
      '<div class="benef-tipo" role="group" aria-label="Tipo"><button type="button" data-tipo="staff" aria-pressed="true">Staff</button><button type="button" data-tipo="proveedor" aria-pressed="false">Proveedor</button></div>' +
      '<input class="benef-buscar" maxlength="120" placeholder="Nombre (ej. DT Juan Pérez o Imprenta del Centro)" value="' + esc(texto) + '">' +
      '<div class="benef-msg" hidden></div><button type="button" class="benef-pri" data-guardar>Guardar y escoger</button>';
    const nombre = caja.querySelector('input'), aviso = caja.querySelector('.benef-msg');
    nombre.focus();
    const guarda = async (params) => {
      aviso.hidden = true;
      try {
        const r = await rpc('v2_save_expense_payee', { organization_id: org, payee_id: null, active: true, ...params });
        await cargaBeneficiarios(rpc, org, { fresco: true });
        pon(r?.name || params.name); cierra();
      } catch (err) { aviso.textContent = ERRORES[String(err?.message || '')] || 'No se pudo guardar.'; aviso.hidden = false; }
    };
    caja.onclick = (e) => {
      e.stopPropagation();
      const t = e.target.closest('[data-tipo]');
      if (t) { tipo = t.dataset.tipo; caja.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return; }
      const s = e.target.closest('[data-staff]');
      if (s) return guarda({ name: null, kind: 'staff', staff_member_id: s.dataset.staff });
      if (e.target.closest('[data-guardar]')) {
        if (nombre.value.trim().length < 2) { aviso.textContent = 'Escribe el nombre.'; aviso.hidden = false; return; }
        return guarda({ name: nombre.value.trim(), kind: tipo, staff_member_id: null });
      }
    };
  }
}
