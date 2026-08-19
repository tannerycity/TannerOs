import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
});

const chargeLabels = {
  monthly_fee: 'Mensualidad',
  monthly_fee_sponsor: 'Mensualidad patrocinada',
  academy_fee: 'Academia',
  late_fee: 'Recargo',
  opening_balance: 'Saldo inicial'
};

const adjustmentLabels = {
  waiver: 'Exención',
  discount: 'Descuento',
  credit: 'Crédito',
  correction: 'Corrección'
};

const payerLabels = {
  guardian: 'Familia / tutor',
  sponsor: 'Patrocinador',
  player: 'Jugador',
  organization: 'Club',
  other: 'Otro'
};

const methodLabels = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro'
};

let ctx = null;
let pendingPlayerId = null;
let requestSeq = 0;
let refreshTimer = null;
let payerSummaryTimer = null;
let payerSummaryBusy = false;

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

async function ensureCtx() {
  if (ctx) return ctx;
  const rows = await rpc('v2_my_context');
  ctx = rows?.[0] || null;
  return ctx;
}

function payerBucket(type) {
  if (type === 'sponsor') return 'sponsor';
  if (type === 'organization') return 'organization';
  if (type === 'guardian' || type === 'player' || !type) return 'family';
  return 'other';
}

function ensurePayerSummaryShell() {
  let section = $('payerReceivablesSummary');
  if (section) return section;

  const baseKpis = document.querySelector('#appView > .kpis');
  if (!baseKpis) return null;

  section = document.createElement('section');
  section.id = 'payerReceivablesSummary';
  section.className = 'panel';
  section.innerHTML = `
    <div class="panel-head">
      <div>
        <div class="eyebrow">COBRANZA POR RESPONSABLE</div>
        <h2>Quién tiene saldo pendiente</h2>
        <p class="muted tiny">Separa lo que corresponde cobrar a familia, patrocinadores y otros responsables.</p>
      </div>
    </div>
    <div class="kpis">
      <article><span>Familia / tutor</span><strong id="payerFamilyDebt">—</strong><small id="payerFamilyMeta"></small></article>
      <article><span>Patrocinador</span><strong id="payerSponsorDebt">—</strong><small id="payerSponsorMeta"></small></article>
      <article><span>Club / otros</span><strong id="payerOtherDebt">—</strong><small id="payerOtherMeta"></small></article>
      <article><span>Cartera identificada</span><strong id="payerTotalDebt">—</strong><small id="payerTotalMeta"></small></article>
    </div>`;
  baseKpis.insertAdjacentElement('afterend', section);
  return section;
}

function setPayerCard(valueId, metaId, amount, rows) {
  const value = $(valueId);
  const meta = $(metaId);
  if (value) value.textContent = money.format(amount);
  if (meta) {
    const players = new Set(rows.map(row => row.player_id).filter(Boolean));
    meta.textContent = `${rows.length} cargo${rows.length === 1 ? '' : 's'} · ${players.size} Tanner${players.size === 1 ? '' : 's'}`;
  }
}

function renderPayerSummary(rows = []) {
  if (!ensurePayerSummaryShell()) return;
  const openRows = rows.filter(row => Number(row.balance_due || 0) > 0);
  const groups = {
    family: [],
    sponsor: [],
    organization: [],
    other: []
  };
  openRows.forEach(row => groups[payerBucket(row.payer_type)].push(row));

  const sum = list => list.reduce((total, row) => total + Number(row.balance_due || 0), 0);
  const familyAmount = sum(groups.family);
  const sponsorAmount = sum(groups.sponsor);
  const otherRows = [...groups.organization, ...groups.other];
  const otherAmount = sum(otherRows);
  const totalAmount = familyAmount + sponsorAmount + otherAmount;

  setPayerCard('payerFamilyDebt', 'payerFamilyMeta', familyAmount, groups.family);
  setPayerCard('payerSponsorDebt', 'payerSponsorMeta', sponsorAmount, groups.sponsor);
  setPayerCard('payerOtherDebt', 'payerOtherMeta', otherAmount, otherRows);
  setPayerCard('payerTotalDebt', 'payerTotalMeta', totalAmount, openRows);
}

async function refreshPayerSummary() {
  const app = $('appView');
  if (!app || app.classList.contains('hidden') || payerSummaryBusy) return;
  payerSummaryBusy = true;
  try {
    const c = await ensureCtx();
    if (!c) return;
    const rows = await rpc('v2_open_receivables', { organization_id: c.organization_id });
    renderPayerSummary(Array.isArray(rows) ? rows : []);
  } catch (error) {
    $('payerReceivablesSummary')?.remove();
    console.error('payer receivables summary', error);
  } finally {
    payerSummaryBusy = false;
  }
}

function schedulePayerSummaryRefresh() {
  clearTimeout(payerSummaryTimer);
  payerSummaryTimer = setTimeout(refreshPayerSummary, 50);
}

function wirePayerSummary() {
  const app = $('appView');
  if (app) {
    new MutationObserver(() => {
      if (!app.classList.contains('hidden')) schedulePayerSummaryRefresh();
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
  }

  const totalDebt = $('kpiTotalDebt');
  if (totalDebt) {
    new MutationObserver(schedulePayerSummaryRefresh)
      .observe(totalDebt, { childList: true, characterData: true, subtree: true });
  }

  schedulePayerSummaryRefresh();
}

function formatPeriod(value) {
  if (!value) return 'Sin periodo';
  const [year, month] = String(value).slice(0, 7).split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${names[Number(month) - 1] || month} ${year}`;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const raw = String(value);
  const date = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
}

function payerText(row, prefix) {
  const type = payerLabels[row?.payerType] || row?.payerType || 'Pagador';
  const name = row?.payerName ? ` · ${row.payerName}` : '';
  return `${prefix}: ${type}${name}`;
}

function buildLedgerItem(title, detail, amount, sign = '') {
  const item = document.createElement('div');
  item.className = 'ledger-item';
  item.dataset.payerEnhanced = 'true';

  const copy = document.createElement('div');
  const strong = document.createElement('strong');
  const small = document.createElement('small');
  const value = document.createElement('b');

  strong.textContent = title;
  small.textContent = detail;
  value.textContent = `${sign}${money.format(Number(amount || 0))}`;

  copy.append(strong, small);
  item.append(copy, value);
  return item;
}

function renderEmpty(el) {
  el.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'ledger-empty';
  empty.dataset.payerEnhanced = 'true';
  empty.textContent = 'Sin movimientos.';
  el.appendChild(empty);
}

function renderAdjustments(rows = []) {
  const section = $('adjustmentsSection');
  const box = $('drawerAdjustments');
  if (!section || !box) return;

  section.classList.toggle('hidden', !rows.length);
  box.innerHTML = '';

  rows.forEach(row => {
    const state = row.status === 'posted' ? 'Aplicado' : row.status;
    const detail = [
      row.reason || 'Sin motivo registrado',
      row.createdAt ? formatDate(row.createdAt) : null
    ].filter(Boolean).join(' · ');
    const sign = row.direction === 'increase' ? '+' : '−';

    box.appendChild(buildLedgerItem(
      `${adjustmentLabels[row.type] || row.type} · ${state}`,
      detail,
      row.amount,
      sign
    ));
  });
}

function renderCharges(rows = []) {
  const box = $('drawerCharges');
  if (!box) return;
  if (!rows.length) {
    renderEmpty(box);
    return;
  }

  box.innerHTML = '';
  rows.forEach(row => {
    const label = chargeLabels[row.type] || row.type || 'Cargo';
    const detail = [
      `${money.format(Number(row.allocated || 0))} aplicado`,
      `saldo ${money.format(Number(row.balance || 0))}`,
      payerText(row, 'Responsable')
    ].join(' · ');

    box.appendChild(buildLedgerItem(
      `${formatPeriod(row.period)} · ${label}`,
      detail,
      row.amount
    ));
  });
}

function renderPayments(rows = []) {
  const box = $('drawerPayments');
  if (!box) return;
  if (!rows.length) {
    renderEmpty(box);
    return;
  }

  box.innerHTML = '';
  rows.forEach(row => {
    const credit = Number(row.credit || 0);
    const detail = [
      `${money.format(Number(row.allocated || 0))} aplicado`,
      credit > 0 ? `${money.format(credit)} a favor` : null,
      payerText(row, 'Pagó')
    ].filter(Boolean).join(' · ');

    box.appendChild(buildLedgerItem(
      `${formatDate(row.date)} · ${methodLabels[row.method] || row.method || 'Pago'}`,
      detail,
      row.amount
    ));
  });
}

async function loadForPlayer(playerId) {
  if (!playerId) return;
  const seq = ++requestSeq;

  try {
    const c = await ensureCtx();
    if (!c) return;

    const account = await rpc('v2_player_account', {
      organization_id: c.organization_id,
      player_id: playerId
    });

    if (seq !== requestSeq || pendingPlayerId !== playerId) return;

    renderAdjustments(account?.adjustments || []);
    renderCharges(account?.charges || []);
    renderPayments(account?.payments || []);

    const balance = (account?.charges || []).reduce(
      (sum, charge) => sum + Number(charge.balance || 0),
      0
    );
    if ($('drawerBalance')) $('drawerBalance').textContent = money.format(balance);
  } catch (error) {
    console.error('financial account details', error);
  }
}

function rememberPlayerFromEvent(event) {
  const row = event.target.closest?.('.player-row');
  if (row?.dataset?.playerId) pendingPlayerId = row.dataset.playerId;
}

function contentsAreEnhanced(el) {
  if (!el?.children?.length) return false;
  return [...el.children].every(child => child.dataset?.payerEnhanced === 'true');
}

function scheduleRefresh() {
  const drawer = $('playerDrawer');
  if (!pendingPlayerId || !drawer || drawer.classList.contains('hidden')) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadForPlayer(pendingPlayerId), 0);
}

function wire() {
  document.addEventListener('click', rememberPlayerFromEvent);
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') &&
        event.target?.classList?.contains('player-row') &&
        event.target.dataset.playerId) {
      pendingPlayerId = event.target.dataset.playerId;
    }
  });

  const drawer = $('playerDrawer');
  if (drawer) {
    new MutationObserver(() => {
      if (!drawer.classList.contains('hidden')) scheduleRefresh();
    }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }

  ['drawerCharges', 'drawerPayments'].forEach(id => {
    const el = $(id);
    if (!el) return;
    new MutationObserver(() => {
      if (!contentsAreEnhanced(el)) scheduleRefresh();
    }).observe(el, { childList: true });
  });

  $('closeDrawer')?.addEventListener('click', () => {
    requestSeq += 1;
    renderAdjustments([]);
  });
  $('drawerBackdrop')?.addEventListener('click', () => {
    requestSeq += 1;
    renderAdjustments([]);
  });
}

wire();
wirePayerSummary();
