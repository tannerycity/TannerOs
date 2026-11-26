/* MÉTRICAS · PARA COBRAR (26/11/2026, fase 3).
 * Presidencia: "déjalo todo en una pantalla pero que no se vea amontonado,
 * que lleve una secuencia estilo Apple... deja nuestro centro de dinero".
 * Lo que vivía en Finanzas, dentro de Cobranza y en este orden:
 *   1. Quién debe: los vencidos de Tanners activos, lo más viejo primero, con
 *      Ver estado, WhatsApp (mensaje listo) y Cobrar. Se ven 5; el resto con
 *      "Ver los N". Los dados de baja con saldo van aparte (no se cobran: se
 *      ajustan con autorización).
 *   2. Estado de cuenta: buscar a cualquier Tanner y abrir su estado.
 *   3. Cargo a varios Tanners (sólo Presidencia).
 * Mismas reglas que tenía Finanzas: el corte de migración separa lo de meses
 * anteriores, y el WhatsApp nunca arma un número a medias (cobranza-whatsapp).
 * deudores() no toca la pantalla: se prueba con node. */
import { rpc, money, $, moduleAccess } from '/v2/shell.js';
import { preparaCobro, ligaDeCobro, faltaConfigurarElClub } from '/v2/cobranza-whatsapp.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (d) => { if (!d) return ''; const [a, m, dd] = String(d).slice(0, 10).split('-').map(Number); return dd + ' ' + MES[m - 1] + ' ' + a; };
const VISIBLES = 5;

// Vencidos por Tanner (activos), lo más viejo primero; y los dados de baja aparte.
export function deudores(receivables, hoyIso) {
  const vencidos = (receivables || []).filter((r) => { const d = r.due_date || r.billing_period; return d && String(d).slice(0, 10) < hoyIso && Number(r.balance_due || 0) > 0; });
  const esBaja = (r) => r.player_status && r.player_status !== 'active';
  const junta = (lista) => {
    const m = new Map();
    for (const r of lista) {
      const k = r.player_id || r.player_name, x = m.get(k) || { name: r.player_name, playerId: r.player_id || null, amount: 0, oldest: null, cargos: 0 };
      x.amount += Number(r.balance_due || 0); x.cargos += 1;
      const d = String(r.due_date || r.billing_period || '').slice(0, 10);
      if (d && (!x.oldest || d < x.oldest)) x.oldest = d;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => String(a.oldest || '9999').localeCompare(String(b.oldest || '9999')) || b.amount - a.amount);
  };
  return { activos: junta(vencidos.filter((r) => !esBaja(r))), bajas: junta(vencidos.filter(esBaja)) };
}

function pintaDeben(d, phoneMap, club) {
  const box = $('cobrarDeben');
  const cobros = new Map(d.activos.map((x) => [x, preparaCobro(x.playerId ? phoneMap[x.playerId] : '', club?.whatsapp || '')]));
  const aviso = faltaConfigurarElClub(club?.whatsapp || '', [...cobros.values()]);
  const listos = [...cobros.values()].filter((c) => c.estado === 'ok').length;
  $('cobrarDebenNota').textContent = d.activos.length ? d.activos.length + (d.activos.length === 1 ? ' Tanner' : ' Tanners') + ' con pagos vencidos · ' + listos + ' con WhatsApp listo' : '';
  if (!d.activos.length) { box.innerHTML = '<p class="cobrar-vacio">Sin pagos vencidos. Todo al corriente.</p>'; return; }
  const fila = (x, i) => {
    const c = cobros.get(x) || { estado: 'sin_telefono' };
    const ficha = x.playerId ? '/tanner/?id=' + encodeURIComponent(x.playerId) : '/jugadores/';
    const wa = c.estado === 'ok'
      ? '<a class="cobrar-btn wa" target="_blank" rel="noopener" href="' + esc(ligaDeCobro({ numero: c.numero, club: club?.name || '', tanner: x.name, monto: money.format(x.amount), desde: x.oldest || '' })) + '">WhatsApp</a>'
      : '<a class="cobrar-btn falta" href="' + esc(x.playerId ? '/jugadores/?player=' + encodeURIComponent(x.playerId) : '/jugadores/') + '" title="' + esc(c.estado === 'sin_telefono' ? 'No tiene teléfono registrado' : 'Su teléfono no trae lada de país') + '">' + (c.estado === 'sin_telefono' ? 'Falta teléfono' : 'Revisar teléfono') + '</a>';
    const cobra = x.playerId ? '<a class="cobrar-btn pri" href="/v2/taquilla/?action=cobrar&player=' + encodeURIComponent(x.playerId) + '&amount=' + Math.round(x.amount) + '&name=' + encodeURIComponent(x.name || '') + '">Cobrar</a>' : '';
    return '<li class="cobrar-fila" style="--i:' + Math.min(i, 12) + '"' + (i >= VISIBLES ? ' hidden' : '') + '>' +
      '<a class="cobrar-quien" href="' + esc(ficha) + '"><b>' + esc(x.name || 'Tanner') + '</b><small>' + (x.oldest ? 'Debe desde el ' + esc(fechaCorta(x.oldest)) : 'Saldo vencido') + ' · ' + x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos') + '</small></a>' +
      '<strong>' + money.format(x.amount) + '</strong><span class="cobrar-acciones">' + wa + cobra + '</span></li>';
  };
  box.innerHTML = (aviso ? '<p class="cobrar-aviso">' + (aviso === 'sin_whatsapp_del_club' ? 'Falta configurar el WhatsApp del club: sin él no se completan los teléfonos sin lada. <a href="/admin/club/">Configurarlo</a>' : 'Hay teléfonos cuya lada no se puede deducir. Revísalos en el expediente de cada Tanner.') + '</p>' : '') +
    '<ol class="cobrar-lista">' + d.activos.map(fila).join('') + '</ol>' +
    (d.activos.length > VISIBLES ? '<button type="button" class="cobrar-mas">Ver los ' + d.activos.length + '</button>' : '') +
    (d.bajas.length ? '<a class="cobrar-bajas" href="/contabilidad/#ajustes"><span><b>' + d.bajas.length + (d.bajas.length === 1 ? ' Tanner dado de baja con saldo' : ' Tanners dados de baja con saldo') + '</b><small>' + money.format(d.bajas.reduce((s, x) => s + x.amount, 0)) + ' · fuera de la cobranza. Se cancela con un ajuste autorizado.</small></span><em>Ajustar</em></a>' : '');
  box.querySelector('.cobrar-mas')?.addEventListener('click', (e) => { box.querySelectorAll('.cobrar-fila[hidden]').forEach((li) => { li.hidden = false; }); e.target.remove(); });
}

function pintaEstado(padron) {
  const input = $('cobrarEdoBusca'), lista = $('cobrarEdoLista');
  const pinta = () => {
    const q = norm(input.value).trim();
    if (q.length < 2) { lista.innerHTML = ''; return; }
    const hits = padron.filter((p) => norm(p.player_name).includes(q)).slice(0, 8);
    lista.innerHTML = hits.length ? hits.map((p) => '<a class="cobrar-edo-fila" href="/tanner/?id=' + encodeURIComponent(p.player_id) + '"><span><b>' + esc(p.player_name) + '</b><small>' + (p.last_payment_date ? 'Último pago: ' + esc(fechaCorta(p.last_payment_date)) : 'Sin pagos registrados') + '</small></span><em>Ver estado de cuenta</em></a>').join('') : '<p class="cobrar-vacio">Ningún Tanner con ese nombre.</p>';
  };
  input.addEventListener('input', pinta);
}

/* Lo monta Métricas dentro de Cobranza. false si la cuenta no cobra. */
export async function montaCobrar({ ctx, navigation }) {
  if (!moduleAccess(navigation, 'cobranza')) return false;
  const org = ctx.organization_id;
  const esPresidencia = Boolean(ctx.is_owner) || ctx.role === 'Presidencia';
  const puedeEstado = ctx.role !== 'Taquilla';
  const safe = (p, f) => p.catch(() => f);
  const [rec, idx, club, padron] = await Promise.all([
    safe(rpc('v2_open_receivables', { organization_id: org }), []),
    safe(rpc('v2_search_index', { organization_id: org }), []),
    safe(rpc('v2_club_config', { organization_id: org }), null),
    puedeEstado ? safe(rpc('v2_billing_players', { organization_id: org }), []) : [],
  ]);
  const phoneMap = {};
  (idx || []).forEach((p) => { if (p?.id && p.phones) phoneMap[p.id] = String(p.phones).split(' ')[0]; });
  const hoy = new Date().toISOString().slice(0, 10);
  $('secCobrar').hidden = false;
  pintaDeben(deudores(rec, hoy), phoneMap, club);
  $('cobrarEdo').hidden = !puedeEstado;
  if (puedeEstado) pintaEstado(Array.isArray(padron) ? padron : []);
  $('cobrarMasivo').hidden = !esPresidencia;
  if (esPresidencia) $('abrirCargoMasivo').addEventListener('click', () => import('/v2/cargo-masivo.js').then((m) => m.abrirCargoMasivo({ org })));
  return true;
}
