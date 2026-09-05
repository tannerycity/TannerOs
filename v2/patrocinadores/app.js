import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const RELATIONSHIPS = {
  sponsorship: 'Patrocinio',
  commercial_alliance: 'Alianza comercial',
  exchange: 'Intercambio',
  benefit_agreement: 'Convenio / beneficio',
};
const STAGES = [
  ['radar', 'En radar'],
  ['contacted', 'Contactado'],
  ['talking', 'En plática'],
  ['agreement', 'Acuerdo'],
  ['closing', 'Por cerrar'],
  ['active', 'Activo'],
  ['paused', 'Pausado'],
  ['lost', 'No se cerró'],
  ['finished', 'Finalizado'],
];
const AGREEMENT_STATUSES = { draft: 'Borrador', active: 'Activo', completed: 'Finalizado', cancelled: 'Cancelado' };
const STAGE_PROBABILITY = { radar: 10, contacted: 25, talking: 40, agreement: 60, closing: 80, active: 100, paused: 15, lost: 0, finished: 100 };
const STALE_DAYS_THRESHOLD = 21;
const ASSET_CATEGORIES = {
  digital: 'Digital',
  park: 'Tannery City Park',
  uniforms: 'Uniformes',
  sports: 'Deportivo',
  content: 'Contenido',
  other: 'Otros',
};
const ASSET_AVAILABILITY = { available: 'Disponible', partial: 'Parcial', occupied: 'Ocupado' };
const MOVEMENT_TYPES = { call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', meeting: 'Reunión', note: 'Nota' };
const RECEIVE_TYPES = { money: 'Dinero', product: 'Producto', service: 'Servicio', discount: 'Descuento', benefit: 'Beneficio', other: 'Otro' };
const GIVE_TYPES = { advertising: 'Publicidad', banner: 'Lona', social: 'Redes sociales', jersey: 'Jersey', activation: 'Activación', tanner_asset: 'Activo Tanner', other: 'Otro' };
const BENEFICIARIES = { players: 'Jugadores', families: 'Familias', coaches: 'Entrenadores', staff: 'Staff', community: 'Comunidad Tanner' };

let ctx = null;
let canWrite = false;
let sponsors = [];
let agreements = [];
let assets = [];
let agreementItems = [];
let movements = [];
let itemEvidence = [];
let evidenceTargetItemId = null;
let billingPlayers = [];
let fundedPlayers = [];
const PHOTO_BUCKET = 'tanneros-private';
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
let selectedSponsorId = null;
let selectedStage = 'all';
let currentView = 'summary';
let drawerView = 'brand-summary';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

function show(id) {
  ['loadingView', 'deniedView', 'view'].forEach((viewId) => {
    $(viewId)?.classList.toggle('hidden', viewId !== id);
  });
}

function message(id, text = '', type = 'error') {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  element.dataset.type = type;
  element.classList.toggle('hidden', !text);
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function friendly(error) {
  const text = String(error?.message || error || 'No pudimos completar la acción.');
  const labels = {
    'Not authorized': 'No tienes permiso para realizar esta acción.',
    'Sponsor name required': 'Escribe el nombre de la marca.',
    'Invalid sponsor phone': 'El teléfono no tiene un formato válido.',
    'Invalid sponsor email': 'El email no tiene un formato válido.',
    'Invalid relationship type': 'Selecciona un tipo de relación válido.',
    'Invalid sponsor stage': 'Selecciona una etapa válida.',
    'Potential value cannot be negative': 'El valor potencial no puede ser negativo.',
    'Agreement end cannot precede start': 'La fecha final no puede ser anterior al inicio.',
    'Agreement value cannot be negative': 'El valor del acuerdo no puede ser negativo.',
    'Discount must be between 0 and 100': 'El descuento debe estar entre 0 y 100.',
    'Agreement item description required': 'Describe cada elemento del acuerdo.',
    'Asset name required': 'Escribe el nombre del Activo Tanner.',
    'Asset price cannot be negative': 'El precio de referencia no puede ser negativo.',
    'Movement result required': 'Escribe el resultado del movimiento.',
    'Invalid photo path': 'No pudimos validar la foto. Vuelve a intentarlo.',
    'Photo upload not found': 'La foto no terminó de subir. Vuelve a intentarlo.',
    'Asset not found': 'No encontramos ese Activo Tanner.',
    'Invalid evidence path': 'No pudimos validar la evidencia. Vuelve a intentarlo.',
    'Evidence upload not found': 'La evidencia no terminó de subir. Vuelve a intentarlo.',
    'Agreement item not found': 'No encontramos ese compromiso del acuerdo.',
    'Invalid phone number': 'El teléfono no es válido. Usa 10 dígitos, por ejemplo 477 274 6136.',
    'Mexico phone must have exactly 10 digits': 'El teléfono debe tener exactamente 10 dígitos, sin anteponer 1 ni la lada del país.',
    'US/Canada phone must have exactly 10 digits': 'El teléfono de EE.UU./Canadá debe tener exactamente 10 dígitos.',
    'Invalid Argentina phone number': 'El teléfono de Argentina no es válido.',
    'Financial configuration requires Presidencia or Contabilidad': 'Solo Presidencia o Contabilidad pueden configurar becas de patrocinio.',
    'Monthly total must be zero or greater': 'El monto mensual total no puede ser negativo.',
    'Funding mode must be fixed_amount or percentage': 'Selecciona una modalidad válida.',
    'Sponsor value must be zero or greater': 'El aporte del patrocinador no puede ser negativo.',
    'Sponsor amount cannot exceed monthly total': 'El aporte no puede ser mayor al monto mensual total.',
    'Sponsor percentage cannot exceed 100': 'El porcentaje no puede ser mayor a 100.',
    'Funding source required': 'Falta el nombre de la fuente de patrocinio.',
    'Benefit end cannot precede start': 'La fecha final no puede ser anterior al inicio.',
    'Player not found': 'No encontramos a ese Tanner.',
    'Billing profile not found': 'Ese Tanner no tiene un perfil de cobranza configurado.',
    'Sponsor benefit not found': 'No encontramos esa beca de patrocinio.',
  };
  return labels[text] || text;
}

function normalizeRelation(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (RELATIONSHIPS[raw]) return raw;
  if (raw.includes('alianza')) return 'commercial_alliance';
  if (raw.includes('intercambio')) return 'exchange';
  if (raw.includes('convenio') || raw.includes('beneficio')) return 'benefit_agreement';
  return 'sponsorship';
}

function normalizeStage(value, status) {
  const raw = String(value || '').trim().toLowerCase();
  const direct = STAGES.find(([code]) => code === raw);
  if (direct) return direct[0];
  if (raw.includes('radar')) return 'radar';
  if (raw.includes('contact')) return 'contacted';
  if (raw.includes('plática') || raw.includes('platica') || raw.includes('negocia')) return 'talking';
  if (raw.includes('por cerrar') || raw.includes('cierre')) return 'closing';
  if (raw.includes('acuerdo')) return 'agreement';
  if (raw.includes('pausa')) return 'paused';
  if (raw.includes('no se cerr') || raw.includes('perdid')) return 'lost';
  if (raw.includes('final')) return 'finished';
  if (raw.includes('activ') || status === 'active') return 'active';
  if (status === 'lost') return 'lost';
  if (status === 'inactive' || status === 'archived') return 'finished';
  return 'radar';
}

function stageLabel(value, status) {
  const normalized = normalizeStage(value, status);
  return STAGES.find(([code]) => code === normalized)?.[1] || 'En radar';
}

function statusFromStage(stage) {
  if (stage === 'radar') return 'prospect';
  if (stage === 'active') return 'active';
  if (stage === 'lost') return 'lost';
  if (stage === 'finished') return 'inactive';
  return 'negotiation';
}

function sponsorById(id) {
  return sponsors.find((sponsor) => sponsor.id === id);
}
function agreementsForSponsor(id) {
  return agreements.filter((agreement) => agreement.sponsorId === id);
}
function itemsForAgreement(id) {
  return agreementItems.filter((item) => item.agreementId === id);
}
function assetById(id) {
  return assets.find((asset) => asset.id === id);
}
function evidenceForItem(id) {
  return itemEvidence.filter((evidence) => evidence.itemId === id);
}
function toDateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}
function dateToIso(value) {
  return value ? new Date(value + 'T12:00:00').toISOString() : null;
}
function dateValue(value) {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function shortDate(value) {
  const date = dateValue(value);
  return date ? date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'Sin fecha';
}
function longDate(value) {
  const date = dateValue(value);
  return date ? date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha';
}
function dayDiff(value) {
  const date = dateValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}
function timingLabel(value, renewal = false) {
  const days = dayDiff(value);
  if (days === null) return 'Sin seguimiento';
  if (days < 0) return renewal ? 'Renovación vencida' : 'Atrasado';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return renewal ? 'Renovación en ' + days + ' días' : 'En ' + days + ' días';
}
function isOpenSponsor(sponsor) {
  return !['active', 'lost', 'finished'].includes(normalizeStage(sponsor.stage, sponsor.status));
}
function daysSince(value) {
  const date = dateValue(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}
function buildWhatsAppLink(sponsor, detail) {
  if (!sponsor?.phone) return null;
  const digits = String(sponsor.phone).replace(/\D/g, '');
  if (!digits) return null;
  const greeting = sponsor.contactName ? 'Hola ' + sponsor.contactName : 'Hola';
  const message = greeting + ', te escribo de Tannery City FC para dar seguimiento: ' + (detail || 'nuestra relación de patrocinio') + '.';
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}
function formatMxPhoneDisplay(digits) {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
function mxPhoneDisplayFromStored(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+52') && digits.length === 12) return formatMxPhoneDisplay(digits.slice(2));
  if (!raw.startsWith('+') && digits.length === 10) return formatMxPhoneDisplay(digits);
  return raw;
}
function bindPhoneMask(input) {
  input.addEventListener('input', () => {
    if (input.value.trim().startsWith('+')) return;
    const digits = input.value.replace(/\D/g, '').slice(0, 10);
    input.value = formatMxPhoneDisplay(digits);
  });
}
function toggleLostReasonField(stage) {
  const isLost = stage === 'lost';
  $('sponsorLostReasonField').classList.toggle('hidden', !isLost);
  $('sponsorLostReason').required = isLost;
}
function agreementProgress(agreementId) {
  const items = itemsForAgreement(agreementId);
  return { done: items.filter((item) => item.fulfilled).length, total: items.length };
}
function writeControls() {
  document.querySelectorAll('.write-only').forEach((element) => {
    element.classList.toggle('hidden', !canWrite);
  });
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = '/';
    return;
  }
  const rows = await rpc('v2_my_context');
  if (!rows?.length) {
    $('deniedText').textContent = 'Tu cuenta no tiene una organización activa.';
    show('deniedView');
    return;
  }
  ctx = rows[0];
  const modules = await rpc('v2_my_modules', { organization_id: ctx.organization_id });
  const moduleAccess = modules.find((item) => item.module_code === 'sponsors');
  if (!moduleAccess?.enabled || !moduleAccess?.can_read) {
    $('deniedText').textContent = 'Tu rol no tiene acceso a Patrocinios.';
    show('deniedView');
    return;
  }
  canWrite = Boolean(moduleAccess.can_write);
  $('orgName').textContent = ctx.organization_name || 'Tannery City FC';
  $('roleBadge').textContent = ctx.is_owner ? 'Presidencia' : ctx.role;
  writeControls();
  renderBeneficiaries();
  await load();
  show('view');
}

async function load() {
  const data = await rpc('v2_sponsor_admin', { organization_id: ctx.organization_id });
  sponsors = Array.isArray(data?.sponsors) ? data.sponsors : [];
  agreements = Array.isArray(data?.agreements) ? data.agreements : [];
  assets = Array.isArray(data?.assets) ? data.assets : [];
  agreementItems = Array.isArray(data?.agreementItems) ? data.agreementItems : [];
  movements = Array.isArray(data?.movements) ? data.movements : [];
  itemEvidence = Array.isArray(data?.itemEvidence) ? data.itemEvidence : [];
  render();
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa foto. Prueba con JPG, PNG o WebP.')); };
    img.src = url;
  });
}
function canvasBlobFrom(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
async function preparePhotoFile(file) {
  if (!file) throw new Error('Selecciona una foto.');
  if (file.type && !String(file.type).startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  const img = await loadImageFile(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('No pudimos leer el tamaño de esa foto.');
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no pudo preparar la foto.');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await canvasBlobFrom(canvas, 'image/webp', .84);
  let ext = 'webp';
  if (!blob) {
    blob = await canvasBlobFrom(canvas, 'image/jpeg', .84);
    ext = 'jpg';
  }
  if (blob && blob.size > PHOTO_MAX_BYTES) {
    blob = await canvasBlobFrom(canvas, 'image/jpeg', .68);
    ext = 'jpg';
  }
  if (!blob || blob.size > PHOTO_MAX_BYTES) throw new Error('La foto es demasiado pesada. Prueba con una imagen más pequeña.');
  return { blob, ext, mime: blob.type || ('image/' + (ext === 'jpg' ? 'jpeg' : ext)) };
}
async function signedUrl(bucket, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket || PHOTO_BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data?.signedUrl || null;
}

function hydrateAssetPhotos() {
  assets.filter((asset) => asset.photoPath).forEach(async (asset) => {
    try {
      const url = await signedUrl(asset.photoBucket, asset.photoPath);
      const box = document.querySelector('[data-photo-for="' + CSS.escape(asset.id) + '"]');
      if (url && box && !box.querySelector('img')) box.innerHTML = '<img src="' + url + '" alt="">';
    } catch { /* silent: thumbnail best-effort */ }
  });
}

function hydrateEvidenceThumbs() {
  itemEvidence.forEach(async (evidence) => {
    try {
      const url = await signedUrl(evidence.photoBucket, evidence.photoPath);
      const box = document.querySelector('[data-evidence-photo="' + CSS.escape(evidence.id) + '"]');
      if (url && box && !box.querySelector('img')) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        box.prepend(img);
      }
    } catch { /* silent: thumbnail best-effort */ }
  });
}

async function uploadAssetPhoto(file) {
  const assetId = $('assetId').value;
  if (!canWrite || !assetId || !file) return;
  message('assetPhotoMessage');
  $('assetPhotoMessage').textContent = 'Subiendo…';
  $('assetPhotoMessage').dataset.type = 'success';
  $('assetPhotoMessage').classList.remove('hidden');
  try {
    const prepared = await preparePhotoFile(file);
    const stamp = Date.now();
    const path = 'organizations/' + ctx.organization_id + '/sponsors/assets/' + assetId + '/photo-' + stamp + '.' + prepared.ext;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    let updated;
    try {
      updated = await rpc('v2_set_sponsor_asset_photo', { organization_id: ctx.organization_id, asset_id: assetId, photo_path: path });
    } catch (rpcError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      throw rpcError;
    }
    const previous = assetById(assetId);
    const oldPath = previous?.photoPath;
    const prefix = 'organizations/' + ctx.organization_id + '/sponsors/assets/' + assetId + '/';
    if (oldPath && oldPath !== path && oldPath.startsWith(prefix)) {
      await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    }
    await load();
    const url = await signedUrl(updated.photoBucket, updated.photoPath);
    if (url) $('assetPhotoBox').innerHTML = '<img src="' + url + '" alt="">';
    message('assetPhotoMessage', 'Foto actualizada.', 'success');
  } catch (error) {
    message('assetPhotoMessage', friendly(error));
  }
}

async function uploadItemEvidence(file) {
  const itemId = evidenceTargetItemId;
  evidenceTargetItemId = null;
  if (!canWrite || !itemId || !file) return;
  const item = agreementItems.find((candidate) => candidate.id === itemId);
  if (!item) return;
  try {
    const prepared = await preparePhotoFile(file);
    const stamp = Date.now();
    const path = 'organizations/' + ctx.organization_id + '/sponsors/agreements/' + item.agreementId + '/items/' + itemId + '/evidence-' + stamp + '.' + prepared.ext;
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    try {
      await rpc('v2_add_sponsor_item_evidence', { organization_id: ctx.organization_id, item_id: itemId, photo_path: path, note: null });
    } catch (rpcError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      throw rpcError;
    }
    await load();
  } catch (error) {
    alert(friendly(error));
  }
}

async function deleteEvidence(evidenceId, bucket, path) {
  if (!canWrite || !evidenceId) return;
  if (!confirm('¿Eliminar esta evidencia?')) return;
  try {
    await rpc('v2_delete_sponsor_item_evidence', { organization_id: ctx.organization_id, evidence_id: evidenceId });
    if (bucket && path) await supabase.storage.from(bucket).remove([path]);
    await load();
  } catch (error) {
    alert(friendly(error));
  }
}

function render() {
  renderKpis();
  renderSummary();
  renderRoute();
  renderBrands();
  renderAssets();
  if (selectedSponsorId && !$('brandDrawer').classList.contains('hidden')) renderBrandDrawer();
  writeControls();
}

function renderKpis() {
  const activeAgreements = agreements.filter((agreement) => agreement.status === 'active');
  const receivedValue = activeAgreements.reduce((total, agreement) => {
    const received = itemsForAgreement(agreement.id).filter((item) => item.direction === 'receive');
    return total + received.filter((item) => item.fulfilled).reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);
  }, 0);
  const renewals = activeAgreements.filter((agreement) => {
    const days = dayDiff(agreement.endsOn);
    return days !== null && days <= 45;
  });
  const weightedValue = sponsors.reduce((total, sponsor) => {
    const stage = normalizeStage(sponsor.stage, sponsor.status);
    if (stage === 'lost' || stage === 'finished') return total;
    const probability = STAGE_PROBABILITY[stage] ?? 0;
    return total + (Number(sponsor.potentialValue || 0) * probability / 100);
  }, 0);
  $('kpiActiveAgreements').textContent = activeAgreements.length;
  $('kpiReceivedValue').textContent = money.format(receivedValue);
  $('kpiPlaying').textContent = sponsors.filter(isOpenSponsor).length;
  $('kpiClosing').textContent = sponsors.filter((sponsor) => normalizeStage(sponsor.stage, sponsor.status) === 'closing').length;
  $('kpiRenewals').textContent = renewals.length;
  $('kpiWeighted').textContent = money.format(weightedValue);
}

function buildNextItems() {
  const next = [];
  sponsors.forEach((sponsor) => {
    const stage = normalizeStage(sponsor.stage, sponsor.status);
    if (['lost', 'finished'].includes(stage)) return;
    if (sponsor.nextAction && sponsor.nextActionAt) {
      next.push({
        sponsorId: sponsor.id,
        title: sponsor.name,
        detail: sponsor.nextAction,
        meta: timingLabel(sponsor.nextActionAt),
        date: dateValue(sponsor.nextActionAt)?.getTime() || Number.MAX_SAFE_INTEGER,
        urgent: (dayDiff(sponsor.nextActionAt) ?? 99) <= 0,
      });
    } else if (stage !== 'active') {
      next.push({
        sponsorId: sponsor.id,
        title: sponsor.name,
        detail: 'Sin seguimiento',
        meta: 'Define el próximo movimiento',
        date: Date.now() + 86400000,
        urgent: true,
      });
    }
  });
  agreements
    .filter((agreement) => agreement.status === 'active' && dayDiff(agreement.endsOn) !== null && dayDiff(agreement.endsOn) <= 60)
    .forEach((agreement) => {
      const sponsor = sponsorById(agreement.sponsorId);
      if (!sponsor) return;
      next.push({
        sponsorId: sponsor.id,
        title: sponsor.name,
        detail: 'Renovar acuerdo',
        meta: timingLabel(agreement.endsOn, true),
        date: dateValue(agreement.endsOn)?.getTime() || Number.MAX_SAFE_INTEGER,
        urgent: (dayDiff(agreement.endsOn) ?? 99) <= 15,
      });
    });
  return next.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.date - b.date).slice(0, 10);
}

function renderSummary() {
  const next = buildNextItems();
  $('nextCount').textContent = next.length;
  $('nextEmpty').classList.toggle('hidden', next.length > 0);
  $('nextList').innerHTML = next.map((item) => {
    const sponsor = sponsorById(item.sponsorId);
    const waLink = buildWhatsAppLink(sponsor, item.detail);
    return '<div class="next-item ' + (item.urgent ? 'urgent' : '') + '">' +
      '<button class="next-item-main" data-sponsor-id="' + esc(item.sponsorId) + '" type="button">' +
        '<span class="next-marker"></span>' +
        '<span class="next-copy"><strong>' + esc(item.title) + '</strong><span>' + esc(item.detail) + '</span></span>' +
        '<span class="next-time">' + esc(item.meta) + '</span>' +
      '</button>' +
      (waLink ? '<a class="next-wa-btn" href="' + esc(waLink) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
    '</div>';
  }).join('');
  bindSponsorOpeners($('nextList'));

  const activeIds = [...new Set(agreements.filter((agreement) => agreement.status === 'active').map((agreement) => agreement.sponsorId))];
  const activeSponsors = activeIds.map(sponsorById).filter(Boolean);
  $('activeEmpty').classList.toggle('hidden', activeSponsors.length > 0);
  $('activeList').innerHTML = activeSponsors.map((sponsor) => {
    const active = agreementsForSponsor(sponsor.id).filter((agreement) => agreement.status === 'active');
    const nearestEnd = active.map((agreement) => agreement.endsOn).filter(Boolean).sort()[0];
    return '<button class="compact-brand" data-sponsor-id="' + esc(sponsor.id) + '" type="button">' +
      '<span class="brand-monogram small-monogram">' + esc(String(sponsor.name || 'T').charAt(0).toUpperCase()) + '</span>' +
      '<span><strong>' + esc(sponsor.name) + '</strong><small>' + esc(RELATIONSHIPS[normalizeRelation(sponsor.relationshipType)]) + '</small></span>' +
      '<span class="compact-brand-meta">' + (nearestEnd ? 'Hasta ' + esc(shortDate(nearestEnd)) : active.length + ' activo(s)') + '</span>' +
    '</button>';
  }).join('');
  bindSponsorOpeners($('activeList'));
}

function renderRoute() {
  const stageOptions = [['all', 'Todas'], ...STAGES];
  $('stageRail').innerHTML = stageOptions.map(([code, label]) => {
    const count = code === 'all' ? sponsors.length : sponsors.filter((sponsor) => normalizeStage(sponsor.stage, sponsor.status) === code).length;
    return '<button class="' + (selectedStage === code ? 'active' : '') + '" data-stage="' + code + '" type="button"><span>' + esc(label) + '</span><b>' + count + '</b></button>';
  }).join('');
  $('stageRail').querySelectorAll('[data-stage]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedStage = button.dataset.stage;
      renderRoute();
    });
  });
  const filtered = selectedStage === 'all' ? sponsors : sponsors.filter((sponsor) => normalizeStage(sponsor.stage, sponsor.status) === selectedStage);
  $('routeResultCount').textContent = filtered.length + ' marca' + (filtered.length === 1 ? '' : 's');
  $('routeEmpty').classList.toggle('hidden', filtered.length > 0);
  $('routeList').innerHTML = filtered.map(brandCard).join('');
  bindSponsorOpeners($('routeList'));
}

function brandCard(sponsor) {
  const stage = normalizeStage(sponsor.stage, sponsor.status);
  const relation = normalizeRelation(sponsor.relationshipType);
  const next = sponsor.nextAction && sponsor.nextActionAt ? sponsor.nextAction + ' · ' + timingLabel(sponsor.nextActionAt) : 'Sin seguimiento';
  const staleDays = isOpenSponsor(sponsor) ? daysSince(sponsor.stageChangedAt) : null;
  const staleBadge = (staleDays !== null && staleDays >= STALE_DAYS_THRESHOLD) ? '<span class="stage-stale">' + staleDays + ' días sin avanzar</span>' : '';
  return '<button class="brand-card" data-sponsor-id="' + esc(sponsor.id) + '" type="button">' +
    '<span class="brand-card-top">' +
      '<span class="brand-monogram">' + esc(String(sponsor.name || 'T').charAt(0).toUpperCase()) + '</span>' +
      '<span class="brand-card-title"><strong>' + esc(sponsor.name || 'Marca') + '</strong><small>' + esc(RELATIONSHIPS[relation]) + '</small></span>' +
      '<span class="stage-cell"><span class="stage-chip stage-' + esc(stage) + '">' + esc(stageLabel(stage)) + '</span>' + staleBadge + '</span>' +
    '</span>' +
    '<span class="brand-card-next"><small>Próximo movimiento</small><strong class="' + (next === 'Sin seguimiento' ? 'missing' : '') + '">' + esc(next) + '</strong></span>' +
    '<span class="brand-card-foot"><span>' + (sponsor.contactName ? esc(sponsor.contactName) : 'Sin contacto') + '</span><b>' + (sponsor.potentialValue != null ? money.format(Number(sponsor.potentialValue)) : '—') + '</b></span>' +
  '</button>';
}

function renderBrands() {
  const term = $('brandSearch').value.trim().toLowerCase();
  const filtered = sponsors.filter((sponsor) => [
    sponsor.name,
    sponsor.contactName,
    sponsor.email,
    RELATIONSHIPS[normalizeRelation(sponsor.relationshipType)],
  ].some((value) => String(value || '').toLowerCase().includes(term)));
  $('brandEmpty').classList.toggle('hidden', filtered.length > 0);
  $('brandList').innerHTML = filtered.map(brandCard).join('');
  bindSponsorOpeners($('brandList'));
}

function renderAssets() {
  $('assetEmpty').classList.toggle('hidden', assets.length > 0);
  $('assetList').innerHTML = assets.map((asset) => (
    '<button class="asset-card" data-asset-id="' + esc(asset.id) + '" type="button">' +
      '<span class="asset-photo" data-photo-for="' + esc(asset.id) + '">' + (asset.photoPath ? '' : 'Sin foto') + '</span>' +
      '<span class="asset-category">' + esc(ASSET_CATEGORIES[asset.category] || asset.category || 'Otros') + '</span>' +
      '<strong>' + esc(asset.name) + '</strong>' +
      '<span class="asset-description">' + esc(asset.description || 'Sin descripción') + '</span>' +
      '<span class="asset-foot"><b>' + (asset.price != null ? money.format(Number(asset.price)) : 'Sin precio') + '</b>' +
      '<i class="availability ' + esc(asset.availability || 'available') + '">' + esc(ASSET_AVAILABILITY[asset.availability] || asset.availability || 'Disponible') + '</i></span>' +
    '</button>'
  )).join('');
  $('assetList').querySelectorAll('[data-asset-id]').forEach((button) => {
    button.addEventListener('click', () => openAssetForm(assetById(button.dataset.assetId)));
  });
  hydrateAssetPhotos();
}

function bindSponsorOpeners(container) {
  container.querySelectorAll('[data-sponsor-id]').forEach((button) => {
    button.addEventListener('click', () => openBrand(button.dataset.sponsorId));
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.module-nav [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  ['summary', 'route', 'brands', 'assets'].forEach((name) => {
    $(name + 'View').classList.toggle('hidden', name !== view);
  });
}

function openBrand(id) {
  if (!sponsorById(id)) return;
  selectedSponsorId = id;
  fundedPlayers = [];
  switchDrawerView('brand-summary');
  renderBrandDrawer();
  $('brandDrawer').classList.remove('hidden');
  $('brandDrawer').setAttribute('aria-hidden', 'false');
  $('brandDrawer').scrollTop = 0;
  $('backdrop').classList.remove('hidden');
  document.body.classList.add('workspace-open');
}

function closeBrand() {
  $('brandDrawer').classList.add('hidden');
  $('brandDrawer').setAttribute('aria-hidden', 'true');
  selectedSponsorId = null;
  if (!document.querySelector('.workspace-modal:not(.hidden)')) {
    $('backdrop').classList.add('hidden');
    document.body.classList.remove('workspace-open');
  }
}

function switchDrawerView(view) {
  drawerView = view;
  document.querySelectorAll('[data-drawer-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.drawerView === view);
  });
  const panels = {
    'brand-summary': 'brandSummaryPanel',
    'brand-agreement': 'brandAgreementPanel',
    'brand-assets': 'brandAssetsPanel',
    'brand-followup': 'brandFollowupPanel',
  };
  Object.entries(panels).forEach(([name, id]) => $(id).classList.toggle('hidden', name !== view));
  $('brandDrawer').scrollTop = 0;
}

function renderBrandDrawer() {
  const sponsor = sponsorById(selectedSponsorId);
  if (!sponsor) {
    closeBrand();
    return;
  }
  const relation = normalizeRelation(sponsor.relationshipType);
  const stage = normalizeStage(sponsor.stage, sponsor.status);
  $('drawerMonogram').textContent = String(sponsor.name || 'T').charAt(0).toUpperCase();
  $('drawerRelationship').textContent = RELATIONSHIPS[relation];
  $('drawerBrandName').textContent = sponsor.name;
  $('drawerStage').textContent = stageLabel(stage);
  $('drawerStage').className = 'stage-chip stage-' + stage;
  const hasFollowup = sponsor.nextAction && sponsor.nextActionAt;
  $('drawerFollowup').textContent = hasFollowup ? timingLabel(sponsor.nextActionAt) : 'Sin seguimiento';
  $('drawerFollowup').className = 'followup-chip ' + (hasFollowup ? '' : 'missing');
  renderBrandSummary(sponsor);
  renderExchangeSummary(sponsor);
  renderBrandAgreements(sponsor);
  renderCommitments(sponsor);
  renderMovements(sponsor);
  loadFundedPlayers(sponsor.id);
}

function contactLinks(sponsor) {
  const links = [];
  if (sponsor.phone) {
    const digits = String(sponsor.phone).replace(/\D/g, '');
    links.push('<a href="https://wa.me/' + esc(digits) + '" target="_blank" rel="noopener">WhatsApp</a>');
  }
  if (sponsor.email) links.push('<a href="mailto:' + esc(sponsor.email) + '">Email</a>');
  return links.join('<span>·</span>');
}

function renderBrandSummary(sponsor) {
  const relation = normalizeRelation(sponsor.relationshipType);
  const nextText = sponsor.nextAction && sponsor.nextActionAt
    ? '<strong>' + esc(sponsor.nextAction) + '</strong><span>' + esc(longDate(sponsor.nextActionAt)) + ' · ' + esc(timingLabel(sponsor.nextActionAt)) + '</span>'
    : '<strong>Sin seguimiento</strong><span>Esta marca necesita próximo movimiento y fecha.</span>';
  $('brandSummaryBody').innerHTML =
    '<section class="drawer-summary-card">' +
      '<div class="summary-field"><span>Tipo</span><strong>' + esc(RELATIONSHIPS[relation]) + '</strong></div>' +
      '<div class="summary-field"><span>Estado</span><strong>' + esc(stageLabel(sponsor.stage, sponsor.status)) + '</strong></div>' +
      '<div class="summary-field"><span>Contacto</span><strong>' + esc(sponsor.contactName || 'Sin contacto') + '</strong></div>' +
      '<div class="summary-field"><span>Valor potencial</span><strong>' + (sponsor.potentialValue != null ? money.format(Number(sponsor.potentialValue)) : 'Sin definir') + '</strong></div>' +
      '<div class="summary-field"><span>Teléfono</span><strong>' + esc(sponsor.phone || '—') + '</strong></div>' +
      '<div class="summary-field"><span>Email</span><strong>' + esc(sponsor.email || '—') + '</strong></div>' +
      '<div class="summary-field"><span>Responsable</span><strong>' + esc(sponsor.ownerName || 'Sin asignar') + '</strong></div>' +
    '</section>' +
    '<section class="next-action-card ' + (sponsor.nextAction && sponsor.nextActionAt ? '' : 'missing') + '">' +
      '<div><span>Próximo movimiento</span>' + nextText + '</div>' +
      '<div class="contact-links">' + contactLinks(sponsor) + '</div>' +
    '</section>' +
    (sponsor.notes ? '<section class="notes-card"><span>Nota</span><p>' + esc(sponsor.notes) + '</p></section>' : '') +
    (sponsor.lostReason ? '<section class="notes-card lost-reason-card"><span>Motivo de pérdida</span><p>' + esc(sponsor.lostReason) + '</p></section>' : '');
}

function renderExchangeSummary(sponsor) {
  const box = $('brandExchangeSummary');
  if (!box) return;
  const sponsorAgreements = agreementsForSponsor(sponsor.id);
  const items = sponsorAgreements.flatMap((agreement) => itemsForAgreement(agreement.id));
  if (!items.length) {
    box.innerHTML = '<section class="exchange-summary-card empty"><div class="eyebrow">A CAMBIO</div><h3>Qué nos da / qué le damos</h3>' +
      '<p class="muted">Sin elementos capturados todavía. Agrégalos en la pestaña “Acuerdo”.</p></section>';
    return;
  }
  function group(direction, title) {
    const groupItems = items.filter((item) => item.direction === direction);
    if (!groupItems.length) return '';
    const done = groupItems.filter((item) => item.fulfilled).length;
    return '<div class="exchange-summary-group">' +
      '<div class="exchange-summary-head"><h4>' + esc(title) + '</h4><span>' + done + '/' + groupItems.length + ' cumplido(s)</span></div>' +
      '<ul class="exchange-summary-list">' + groupItems.map((item) => (
        '<li class="' + (item.fulfilled ? 'fulfilled' : 'pending') + '"><span>' + esc(item.description) + '</span><b>' + (item.fulfilled ? 'Entregado' : 'Pendiente') + '</b></li>'
      )).join('') + '</ul>' +
    '</div>';
  }
  box.innerHTML = '<section class="exchange-summary-card">' +
    '<div class="drawer-section-head"><div><div class="eyebrow">A CAMBIO</div><h3>Qué nos da / qué le damos</h3></div>' +
    '<button class="secondary mini exchange-summary-detail" type="button">Ver detalle</button></div>' +
    group('receive', 'Qué nos da') + group('give', 'Qué le damos') +
  '</section>';
  box.querySelector('.exchange-summary-detail')?.addEventListener('click', () => switchDrawerView('brand-assets'));
}

async function loadFundedPlayers(sponsorId) {
  try {
    fundedPlayers = await rpc('v2_sponsor_funded_players', { organization_id: ctx.organization_id, sponsor_id: sponsorId });
  } catch {
    fundedPlayers = [];
  }
  if (selectedSponsorId === sponsorId) renderFundedPlayers();
}

function renderFundedPlayers() {
  if (!$('fundedPlayersSection')) return;
  $('fundedPlayersEmpty').classList.toggle('hidden', fundedPlayers.length > 0);
  $('fundedPlayersList').innerHTML = fundedPlayers.map((row) => (
    '<div class="funded-player-row">' +
      '<span><strong>' + esc(row.player_name) + '</strong><small>' +
        (row.funding_mode === 'percentage'
          ? Number(row.sponsor_value) + '% de la mensualidad'
          : money.format(Number(row.sponsor_value)) + ' de ' + money.format(Number(row.monthly_total)) + ' mensuales') +
      '</small></span>' +
      '<b class="' + (row.active ? 'funded-active' : 'funded-inactive') + '">' + (row.active ? 'Activo' : 'Inactivo') + '</b>' +
    '</div>'
  )).join('');
}

async function openFundingModal() {
  if (!canWrite || !selectedSponsorId) return;
  const sponsor = sponsorById(selectedSponsorId);
  $('fundingForm').reset();
  $('fundingPlayerId').value = '';
  $('fundingPlayerResults').classList.add('hidden');
  $('fundingBrandName').textContent = sponsor.name;
  $('fundingMode').value = 'fixed_amount';
  message('fundingMessage');
  if (!billingPlayers.length) {
    try {
      billingPlayers = await rpc('v2_billing_players', { organization_id: ctx.organization_id });
    } catch {
      billingPlayers = [];
    }
  }
  openModal('fundingModal');
}

async function saveFunding(event) {
  event.preventDefault();
  message('fundingMessage');
  const playerId = $('fundingPlayerId').value;
  if (!playerId) {
    message('fundingMessage', 'Busca y selecciona un Tanner de la lista.');
    return;
  }
  const button = $('saveFunding');
  button.disabled = true;
  try {
    await rpc('v2_configure_sponsor_funding', {
      organization_id: ctx.organization_id,
      player_id: playerId,
      benefit_id: null,
      funding_source_name: sponsorById(selectedSponsorId)?.name || 'Patrocinador',
      monthly_total: Number($('fundingMonthlyTotal').value || 0),
      funding_mode: $('fundingMode').value,
      sponsor_value: Number($('fundingSponsorValue').value || 0),
      starts_on: $('fundingStart').value || null,
      ends_on: $('fundingEnd').value || null,
      notes: $('fundingNotes').value.trim() || null,
      sponsor_id: selectedSponsorId,
    });
    closeModal();
    await loadFundedPlayers(selectedSponsorId);
  } catch (error) {
    message('fundingMessage', friendly(error));
  } finally {
    button.disabled = false;
  }
}

function renderBrandAgreements(sponsor) {
  const sponsorAgreements = agreementsForSponsor(sponsor.id);
  $('brandAgreementEmpty').classList.toggle('hidden', sponsorAgreements.length > 0);
  $('brandAgreementList').innerHTML = sponsorAgreements.map((agreement) => {
    const received = itemsForAgreement(agreement.id).filter((item) => item.direction === 'receive');
    const given = itemsForAgreement(agreement.id).filter((item) => item.direction === 'give');
    const progress = agreementProgress(agreement.id);
    const period = agreement.startsOn || agreement.endsOn
      ? (agreement.startsOn ? shortDate(agreement.startsOn) : 'Sin inicio') + ' → ' + (agreement.endsOn ? shortDate(agreement.endsOn) : 'Sin fin')
      : 'Sin vigencia definida';
    return '<article class="agreement-card">' +
      '<div class="agreement-card-head"><span class="agreement-status ' + esc(agreement.status) + '">' + esc(AGREEMENT_STATUSES[agreement.status] || agreement.status) + '</span>' +
      '<strong>' + (agreement.monetaryValue != null ? money.format(Number(agreement.monetaryValue)) : 'Sin valor') + '</strong></div>' +
      '<span class="agreement-period">' + esc(period) + '</span>' +
      (agreement.benefit ? '<p class="agreement-benefit">' + esc(agreement.benefit) + (agreement.discountPercent != null ? ' · ' + esc(agreement.discountPercent) + '%' : '') + '</p>' : '') +
      '<div class="agreement-counts"><span><b>' + received.length + '</b> recibimos</span><span><b>' + given.length + '</b> damos</span><span><b>' + progress.done + '/' + progress.total + '</b> cumplidos</span></div>' +
      (canWrite ? '<button class="secondary mini edit-agreement-button" data-agreement-id="' + esc(agreement.id) + '" type="button">Editar acuerdo</button>' : '') +
    '</article>';
  }).join('');
  $('brandAgreementList').querySelectorAll('[data-agreement-id]').forEach((button) => {
    button.addEventListener('click', () => openAgreementForm(agreements.find((agreement) => agreement.id === button.dataset.agreementId)));
  });
}

function renderCommitments(sponsor) {
  const sponsorAgreements = agreementsForSponsor(sponsor.id);
  const items = sponsorAgreements.flatMap((agreement) => itemsForAgreement(agreement.id));
  const fulfilled = items.filter((item) => item.fulfilled).length;
  $('commitmentProgress').textContent = fulfilled + ' de ' + items.length;
  $('commitmentEmpty').classList.toggle('hidden', items.length > 0);
  if (!items.length) {
    $('commitmentList').innerHTML = '';
    return;
  }
  function group(direction, title) {
    const groupItems = items.filter((item) => item.direction === direction);
    if (!groupItems.length) return '';
    return '<section class="commitment-group">' +
      '<div class="commitment-group-head"><h4>' + esc(title) + '</h4><span>' + groupItems.filter((item) => item.fulfilled).length + '/' + groupItems.length + '</span></div>' +
      groupItems.map((item) => {
        const asset = assetById(item.assetId);
        const detail = [
          item.quantity != null ? (item.quantity + ' ' + (item.unit || '')).trim() : '',
          item.estimatedValue != null ? money.format(Number(item.estimatedValue)) : '',
          asset?.name || '',
        ].filter(Boolean).join(' · ');
        const evidence = evidenceForItem(item.id);
        const thumbs = evidence.map((item2) => (
          '<span class="evidence-thumb" data-evidence-photo="' + esc(item2.id) + '">' +
            (canWrite ? '<button type="button" class="evidence-delete" data-evidence-id="' + esc(item2.id) + '" data-bucket="' + esc(item2.photoBucket || '') + '" data-path="' + esc(item2.photoPath || '') + '" aria-label="Eliminar evidencia">&times;</button>' : '') +
          '</span>'
        )).join('');
        return '<div class="commitment-item ' + (item.fulfilled ? 'fulfilled' : '') + '">' +
          '<label class="commitment-item-main">' +
            '<input class="fulfillment-toggle" data-item-id="' + esc(item.id) + '" type="checkbox" ' + (item.fulfilled ? 'checked' : '') + ' ' + (canWrite ? '' : 'disabled') + '>' +
            '<span><strong>' + esc(item.description) + '</strong><small>' + esc(detail || (item.fulfilled ? 'Entregado' : 'Pendiente')) + '</small></span>' +
            '<b>' + (item.fulfilled ? 'Entregado' : 'Pendiente') + '</b>' +
          '</label>' +
          '<div class="commitment-evidence">' +
            '<div class="evidence-thumbs">' + thumbs + '</div>' +
            (canWrite ? '<button type="button" class="evidence-add-btn" data-item-id="' + esc(item.id) + '">+ Evidencia</button>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</section>';
  }
  $('commitmentList').innerHTML = group('receive', 'Qué recibimos') + group('give', 'Qué damos');
  $('commitmentList').querySelectorAll('.fulfillment-toggle').forEach((input) => {
    input.addEventListener('change', () => setFulfillment(input));
  });
  $('commitmentList').querySelectorAll('.evidence-add-btn').forEach((button) => {
    button.addEventListener('click', () => {
      evidenceTargetItemId = button.dataset.itemId;
      $('evidenceUploadInput').click();
    });
  });
  $('commitmentList').querySelectorAll('.evidence-delete').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      deleteEvidence(button.dataset.evidenceId, button.dataset.bucket, button.dataset.path);
    });
  });
  hydrateEvidenceThumbs();
}

function renderMovements(sponsor) {
  const sponsorMovements = movements.filter((movement) => movement.sponsorId === sponsor.id);
  $('movementEmpty').classList.toggle('hidden', sponsorMovements.length > 0);
  $('movementList').innerHTML = sponsorMovements.map((movement) => (
    '<article class="timeline-item">' +
      '<span class="timeline-dot"></span><div>' +
        '<div class="timeline-head"><strong>' + esc(MOVEMENT_TYPES[movement.type] || movement.type) + '</strong><time>' + esc(longDate(movement.occurredAt)) + '</time></div>' +
        '<p>' + esc(movement.result) + '</p>' +
        (movement.nextAction ? '<small>Próximo: ' + esc(movement.nextAction) + ' · ' + esc(shortDate(movement.nextActionAt)) + '</small>' : '') +
      '</div>' +
    '</article>'
  )).join('');
}

function openModal(id) {
  document.querySelectorAll('.workspace-modal').forEach((modal) => modal.classList.add('hidden'));
  $(id).classList.remove('hidden');
  $(id).scrollTop = 0;
  $('backdrop').classList.remove('hidden');
  document.body.classList.add('workspace-open');
  setTimeout(() => $(id).querySelector('input:not([type="hidden"]),select,textarea')?.focus(), 30);
}

function closeModal() {
  document.querySelectorAll('.workspace-modal').forEach((modal) => modal.classList.add('hidden'));
  if ($('brandDrawer').classList.contains('hidden')) {
    $('backdrop').classList.add('hidden');
    document.body.classList.remove('workspace-open');
  }
}

function resetSponsorForm() {
  $('sponsorForm').reset();
  $('sponsorId').value = '';
  $('sponsorRelationship').value = 'sponsorship';
  $('sponsorStage').value = 'radar';
  $('sponsorModalTitle').textContent = 'Nueva marca';
  $('saveSponsor').textContent = 'Guardar marca';
  toggleLostReasonField('radar');
  message('sponsorMessage');
}

function openSponsorForm(sponsor = null) {
  if (!canWrite) return;
  resetSponsorForm();
  if (sponsor) {
    $('sponsorId').value = sponsor.id;
    $('sponsorName').value = sponsor.name || '';
    $('sponsorRelationship').value = normalizeRelation(sponsor.relationshipType);
    $('sponsorStage').value = normalizeStage(sponsor.stage, sponsor.status);
    $('sponsorContact').value = sponsor.contactName || '';
    $('sponsorPhone').value = mxPhoneDisplayFromStored(sponsor.phone);
    $('sponsorEmail').value = sponsor.email || '';
    $('sponsorPotential').value = sponsor.potentialValue ?? '';
    $('sponsorOwner').value = sponsor.ownerName || '';
    $('sponsorNextAction').value = sponsor.nextAction || '';
    $('sponsorNextDate').value = toDateInput(sponsor.nextActionAt);
    $('sponsorLostReason').value = sponsor.lostReason || '';
    $('sponsorNotes').value = sponsor.notes || '';
    $('sponsorModalTitle').textContent = 'Editar marca';
    $('saveSponsor').textContent = 'Guardar cambios';
    toggleLostReasonField($('sponsorStage').value);
  }
  openModal('sponsorModal');
}

async function saveSponsor(event) {
  event.preventDefault();
  message('sponsorMessage');
  const phoneRaw = $('sponsorPhone').value.trim();
  let phoneValue = phoneRaw || null;
  if (phoneRaw && !phoneRaw.startsWith('+')) {
    const phoneDigits = phoneRaw.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      message('sponsorMessage', 'El teléfono debe tener 10 dígitos. Ejemplo: 477 274 6136.');
      return;
    }
    phoneValue = phoneDigits;
  }
  const button = $('saveSponsor');
  button.disabled = true;
  try {
    const relationship = $('sponsorRelationship').value;
    const stage = $('sponsorStage').value;
    const id = await rpc('v2_upsert_sponsor_admin', {
      organization_id: ctx.organization_id,
      sponsor_id: $('sponsorId').value || null,
      name: $('sponsorName').value.trim(),
      sponsor_type: RELATIONSHIPS[relationship],
      contact_name: $('sponsorContact').value.trim() || null,
      phone: phoneValue,
      email: $('sponsorEmail').value.trim() || null,
      status: statusFromStage(stage),
      tier: null,
      relationship_type: relationship,
      stage,
      potential_value: $('sponsorPotential').value === '' ? null : Number($('sponsorPotential').value),
      next_action: $('sponsorNextAction').value.trim() || null,
      next_action_at: dateToIso($('sponsorNextDate').value),
      notes: $('sponsorNotes').value.trim() || null,
      owner_name: $('sponsorOwner').value.trim() || null,
      lost_reason: stage === 'lost' ? ($('sponsorLostReason').value.trim() || null) : null,
    });
    closeModal();
    await load();
    openBrand(id);
  } catch (error) {
    message('sponsorMessage', friendly(error));
  } finally {
    button.disabled = false;
  }
}

function renderBeneficiaries() {
  $('beneficiaryOptions').innerHTML = Object.entries(BENEFICIARIES).map(([code, label]) => (
    '<label><input type="checkbox" name="beneficiary" value="' + code + '"><span>' + esc(label) + '</span></label>'
  )).join('');
}

function resetAgreementForm() {
  $('agreementForm').reset();
  $('agreementId').value = '';
  $('agreementStatus').value = 'draft';
  $('agreementModalTitle').textContent = 'Nuevo acuerdo';
  $('receivedItems').innerHTML = '';
  $('givenItems').innerHTML = '';
  addItemRow('receive');
  addItemRow('give');
  message('agreementMessage');
}

function openAgreementForm(agreement = null) {
  if (!canWrite || !selectedSponsorId) return;
  const sponsor = sponsorById(selectedSponsorId);
  resetAgreementForm();
  $('agreementSponsorId').value = sponsor.id;
  $('agreementBrandName').textContent = sponsor.name;
  $('benefitFields').classList.toggle('hidden', normalizeRelation(sponsor.relationshipType) !== 'benefit_agreement');
  if (agreement) {
    $('agreementId').value = agreement.id;
    $('agreementStatus').value = agreement.status || 'draft';
    $('agreementValue').value = agreement.monetaryValue ?? '';
    $('agreementStart').value = agreement.startsOn || '';
    $('agreementEnd').value = agreement.endsOn || '';
    $('agreementBenefit').value = agreement.benefit || '';
    $('agreementDiscount').value = agreement.discountPercent ?? '';
    $('agreementRedemption').value = agreement.redemptionInstructions || '';
    const beneficiaries = Array.isArray(agreement.beneficiaries) ? agreement.beneficiaries : [];
    document.querySelectorAll('[name="beneficiary"]').forEach((input) => {
      input.checked = beneficiaries.includes(input.value);
    });
    $('agreementNotes').value = agreement.notes || '';
    $('receivedItems').innerHTML = '';
    $('givenItems').innerHTML = '';
    let received = itemsForAgreement(agreement.id).filter((item) => item.direction === 'receive');
    let given = itemsForAgreement(agreement.id).filter((item) => item.direction === 'give');
    if (!received.length && Array.isArray(agreement.benefitsReceived)) {
      received = agreement.benefitsReceived.map((description) => ({ type: 'other', description }));
    }
    if (!received.length && agreement.monetaryValue != null && Number(agreement.monetaryValue) > 0) {
      received = [{ type: 'money', description: 'Aportación económica', estimatedValue: agreement.monetaryValue }];
    }
    if (!given.length && Array.isArray(agreement.deliverables)) {
      given = agreement.deliverables.map((description) => ({ type: 'other', description }));
    }
    received.forEach((item) => addItemRow('receive', item));
    given.forEach((item) => addItemRow('give', item));
    $('agreementModalTitle').textContent = 'Editar acuerdo';
  }
  openModal('agreementModal');
}

function typeOptions(direction, selected) {
  const options = direction === 'receive' ? RECEIVE_TYPES : GIVE_TYPES;
  return Object.entries(options).map(([value, label]) => (
    '<option value="' + value + '" ' + (selected === value ? 'selected' : '') + '>' + esc(label) + '</option>'
  )).join('');
}

function assetOptions(selected) {
  return '<option value="">Sin Activo Tanner</option>' + assets.map((asset) => (
    '<option value="' + esc(asset.id) + '" ' + (selected === asset.id ? 'selected' : '') + '>' +
    esc(asset.name) + ' · ' + esc(ASSET_AVAILABILITY[asset.availability] || '') + '</option>'
  )).join('');
}

function addItemRow(direction, item = {}) {
  const container = direction === 'receive' ? $('receivedItems') : $('givenItems');
  const row = document.createElement('article');
  row.className = 'item-editor';
  const defaultType = item.type || (direction === 'receive' ? 'money' : 'advertising');
  row.innerHTML =
    '<div class="item-editor-head"><strong>Elemento</strong><button class="remove-item" type="button" aria-label="Quitar elemento">Quitar</button></div>' +
    '<div class="item-editor-grid">' +
      '<label>Tipo<select class="item-type">' + typeOptions(direction, defaultType) + '</select></label>' +
      '<label class="item-description-label">Descripción<input class="item-description" maxlength="500" required value="' + esc(item.description || '') + '" placeholder="' + (direction === 'receive' ? 'Ej. 30 jerseys' : 'Ej. Reel mensual') + '"></label>' +
      '<label>Cantidad <span class="optional">opcional</span><input class="item-quantity" type="number" min="0" step="0.01" value="' + (item.quantity ?? '') + '" inputmode="decimal"></label>' +
      '<label>Unidad <span class="optional">opcional</span><input class="item-unit" maxlength="60" value="' + esc(item.unit || '') + '" placeholder="piezas, meses…"></label>' +
      '<label>Valor estimado <span class="optional">opcional</span><input class="item-value" type="number" min="0" step="0.01" value="' + (item.estimatedValue ?? '') + '" inputmode="decimal"></label>' +
      (direction === 'give' ? '<label>Activo Tanner <span class="optional">opcional</span><select class="item-asset">' + assetOptions(item.assetId || '') + '</select></label>' : '') +
    '</div>' +
    '<label class="item-done"><input class="item-fulfilled" type="checkbox" ' + (item.fulfilled ? 'checked' : '') + '><span>' +
    (direction === 'receive' ? 'Ya lo recibimos' : 'Ya lo entregamos') + '</span></label>';
  row.querySelector('.remove-item').addEventListener('click', () => row.remove());
  if (direction === 'give') {
    row.querySelector('.item-asset').addEventListener('change', (event) => {
      const asset = assetById(event.target.value);
      if (!asset) return;
      row.querySelector('.item-type').value = 'tanner_asset';
      if (!row.querySelector('.item-description').value.trim()) row.querySelector('.item-description').value = asset.name;
      if (!row.querySelector('.item-value').value && asset.price != null) row.querySelector('.item-value').value = asset.price;
    });
  }
  container.appendChild(row);
}

function collectItems(direction) {
  const container = direction === 'receive' ? $('receivedItems') : $('givenItems');
  return [...container.querySelectorAll('.item-editor')].map((row) => ({
    type: row.querySelector('.item-type').value,
    description: row.querySelector('.item-description').value.trim(),
    quantity: row.querySelector('.item-quantity').value === '' ? null : Number(row.querySelector('.item-quantity').value),
    unit: row.querySelector('.item-unit').value.trim() || null,
    estimatedValue: row.querySelector('.item-value').value === '' ? null : Number(row.querySelector('.item-value').value),
    assetId: row.querySelector('.item-asset')?.value || null,
    fulfilled: row.querySelector('.item-fulfilled').checked,
  }));
}

async function saveAgreement(event) {
  event.preventDefault();
  message('agreementMessage');
  const button = $('saveAgreement');
  button.disabled = true;
  try {
    const received = collectItems('receive');
    const given = collectItems('give');
    const calculatedValue = received.reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);
    await rpc('v2_save_sponsor_agreement', {
      organization_id: ctx.organization_id,
      agreement_id: $('agreementId').value || null,
      sponsor_id: $('agreementSponsorId').value,
      starts_on: $('agreementStart').value || null,
      ends_on: $('agreementEnd').value || null,
      agreement_value: $('agreementValue').value === '' ? (calculatedValue || null) : Number($('agreementValue').value),
      status: $('agreementStatus').value,
      notes: $('agreementNotes').value.trim() || null,
      benefit: $('agreementBenefit').value.trim() || null,
      discount_percent: $('agreementDiscount').value === '' ? null : Number($('agreementDiscount').value),
      beneficiaries: [...document.querySelectorAll('[name="beneficiary"]:checked')].map((input) => input.value),
      redemption_instructions: $('agreementRedemption').value.trim() || null,
      received_items: received,
      given_items: given,
    });
    closeModal();
    await load();
    switchDrawerView('brand-agreement');
  } catch (error) {
    message('agreementMessage', friendly(error));
  } finally {
    button.disabled = false;
  }
}

async function setFulfillment(input) {
  input.disabled = true;
  try {
    await rpc('v2_set_sponsor_item_fulfillment', {
      organization_id: ctx.organization_id,
      item_id: input.dataset.itemId,
      fulfilled: input.checked,
    });
    await load();
  } catch (error) {
    input.checked = !input.checked;
    alert(friendly(error));
  } finally {
    input.disabled = !canWrite;
  }
}

function resetAssetForm() {
  $('assetForm').reset();
  $('assetId').value = '';
  $('assetCategory').value = 'digital';
  $('assetAvailability').value = 'available';
  $('assetModalTitle').textContent = 'Agregar Activo Tanner';
  $('saveAsset').textContent = 'Guardar activo';
  $('archiveAsset').classList.add('hidden');
  $('assetPhotoSection').classList.add('hidden');
  $('assetPhotoBox').innerHTML = '<span>Sin foto</span>';
  message('assetMessage');
  message('assetPhotoMessage');
}

function openAssetForm(asset = null) {
  if (!canWrite) return;
  resetAssetForm();
  if (asset) {
    $('assetId').value = asset.id;
    $('assetName').value = asset.name || '';
    $('assetCategory').value = ASSET_CATEGORIES[asset.category] ? asset.category : 'other';
    $('assetAvailability').value = ASSET_AVAILABILITY[asset.availability] ? asset.availability : 'available';
    $('assetPrice').value = asset.price ?? '';
    $('assetDescription').value = asset.description || '';
    $('assetModalTitle').textContent = 'Editar Activo Tanner';
    $('saveAsset').textContent = 'Guardar cambios';
    $('archiveAsset').classList.remove('hidden');
    $('assetPhotoSection').classList.remove('hidden');
    if (asset.photoPath) {
      signedUrl(asset.photoBucket, asset.photoPath).then((url) => {
        if (url) $('assetPhotoBox').innerHTML = '<img src="' + url + '" alt="">';
      }).catch(() => {});
    }
  }
  openModal('assetModal');
}

async function saveAsset(event) {
  event.preventDefault();
  message('assetMessage');
  const button = $('saveAsset');
  button.disabled = true;
  try {
    await rpc('v2_upsert_sponsor_asset_admin', {
      organization_id: ctx.organization_id,
      asset_id: $('assetId').value || null,
      name: $('assetName').value.trim(),
      category: $('assetCategory').value,
      price: $('assetPrice').value === '' ? null : Number($('assetPrice').value),
      description: $('assetDescription').value.trim() || null,
      availability: $('assetAvailability').value,
    });
    closeModal();
    await load();
    switchView('assets');
  } catch (error) {
    message('assetMessage', friendly(error));
  } finally {
    button.disabled = false;
  }
}

async function archiveAsset() {
  const id = $('assetId').value;
  if (!id || !confirm('¿Retirar este activo del inventario disponible? Los acuerdos anteriores conservarán su historial.')) return;
  $('archiveAsset').disabled = true;
  try {
    await rpc('v2_archive_sponsor_asset_admin', { organization_id: ctx.organization_id, asset_id: id });
    closeModal();
    await load();
  } catch (error) {
    message('assetMessage', friendly(error));
  } finally {
    $('archiveAsset').disabled = false;
  }
}

function openMovementForm() {
  if (!canWrite || !selectedSponsorId) return;
  const sponsor = sponsorById(selectedSponsorId);
  $('movementForm').reset();
  $('movementBrandName').textContent = sponsor.name;
  $('movementNextAction').value = sponsor.nextAction || '';
  $('movementNextDate').value = toDateInput(sponsor.nextActionAt);
  message('movementMessage');
  openModal('movementModal');
}

async function saveMovement(event) {
  event.preventDefault();
  message('movementMessage');
  const button = $('saveMovement');
  button.disabled = true;
  try {
    await rpc('v2_register_sponsor_movement', {
      organization_id: ctx.organization_id,
      sponsor_id: selectedSponsorId,
      movement_type: $('movementType').value,
      result: $('movementResult').value.trim(),
      next_action: $('movementNextAction').value.trim() || null,
      next_action_at: dateToIso($('movementNextDate').value),
    });
    closeModal();
    await load();
    switchDrawerView('brand-followup');
  } catch (error) {
    message('movementMessage', friendly(error));
  } finally {
    button.disabled = false;
  }
}

async function imageToDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportSponsorKit() {
  const sponsor = sponsorById(selectedSponsorId);
  if (!sponsor) return;
  const button = $('exportSponsorKit');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Generando…';
  try {
    const { jsPDF } = await import('https://esm.sh/jspdf@2.5.2');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    function ensureSpace(height) {
      if (y + height > pageHeight - margin) { doc.addPage(); y = margin; }
    }
    function heading(text, size = 14) {
      ensureSpace(size + 10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(11, 48, 56);
      doc.text(text, margin, y); y += size + 8;
    }
    function label(text) {
      ensureSpace(14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70, 85, 88);
      doc.text(text, margin, y); y += 15;
    }

    doc.setFillColor(7, 25, 30); doc.rect(0, 0, pageWidth, 66, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('Tannery City FC', margin, 30);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Kit de patrocinio · ' + sponsor.name, margin, 48);
    y = 92;

    heading(sponsor.name, 17);
    label('Tipo: ' + (RELATIONSHIPS[normalizeRelation(sponsor.relationshipType)] || '—'));
    label('Etapa: ' + stageLabel(sponsor.stage, sponsor.status));
    label('Contacto: ' + (sponsor.contactName || '—') + (sponsor.phone ? ' · ' + sponsor.phone : '') + (sponsor.email ? ' · ' + sponsor.email : ''));
    y += 4;

    const sponsorAgreements = agreementsForSponsor(sponsor.id);
    if (sponsorAgreements.length) {
      sponsorAgreements.forEach((agreement) => {
        heading('Acuerdo', 12);
        const period = agreement.startsOn || agreement.endsOn
          ? (agreement.startsOn ? shortDate(agreement.startsOn) : 'Sin inicio') + ' → ' + (agreement.endsOn ? shortDate(agreement.endsOn) : 'Sin fin')
          : 'Sin vigencia definida';
        label('Periodo: ' + period + ' · Estado: ' + (AGREEMENT_STATUSES[agreement.status] || agreement.status) +
          (agreement.monetaryValue != null ? ' · Valor: ' + money.format(Number(agreement.monetaryValue)) : ''));
        const items = itemsForAgreement(agreement.id);
        ['receive', 'give'].forEach((direction) => {
          const groupItems = items.filter((item) => item.direction === direction);
          if (!groupItems.length) return;
          ensureSpace(16);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 40, 45);
          doc.text(direction === 'receive' ? 'Qué recibimos' : 'Qué damos', margin, y); y += 14;
          groupItems.forEach((item) => {
            ensureSpace(14);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 65, 68);
            const mark = item.fulfilled ? '[Cumplido] ' : '[Pendiente] ';
            doc.text(mark + item.description, margin + 10, y); y += 14;
          });
        });
        y += 6;
      });
    } else {
      heading('Acuerdo', 12);
      label('Sin acuerdo capturado.');
    }

    const items = sponsorAgreements.flatMap((agreement) => itemsForAgreement(agreement.id));
    const evidence = items.flatMap((item) => evidenceForItem(item.id).map((ev) => ({ ...ev, itemDescription: item.description })));
    if (evidence.length) {
      heading('Evidencia de cumplimiento', 12);
      const thumbSize = 100, gap = 14;
      let x = margin;
      for (const ev of evidence) {
        if (x + thumbSize > pageWidth - margin) { x = margin; y += thumbSize + 26; }
        ensureSpace(thumbSize + 26);
        try {
          const url = await signedUrl(ev.photoBucket, ev.photoPath);
          const dataUrl = await imageToDataUrl(url);
          const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(dataUrl, format, x, y, thumbSize, thumbSize * 0.75);
        } catch { /* skip broken image, keep building the kit */ }
        doc.setFontSize(8); doc.setTextColor(90, 100, 103);
        doc.text(String(ev.itemDescription || ''), x, y + thumbSize * 0.75 + 11, { maxWidth: thumbSize });
        x += thumbSize + gap;
      }
      y += thumbSize + 34;
    }

    if (fundedPlayers.length) {
      heading('Impacto: jugadores becados', 12);
      fundedPlayers.forEach((row) => {
        label('• ' + row.player_name + ' — ' + (row.funding_mode === 'percentage'
          ? Number(row.sponsor_value) + '% de la mensualidad'
          : money.format(Number(row.sponsor_value)) + ' mensuales'));
      });
    }

    doc.setFontSize(8); doc.setTextColor(150, 160, 163);
    doc.text('Generado por TannerOS · ' + new Date().toLocaleDateString('es-MX'), margin, pageHeight - 20);

    doc.save('Kit-patrocinio-' + sponsor.name.replace(/[^a-z0-9]+/gi, '-') + '.pdf');
  } catch (error) {
    alert('No pudimos generar el kit: ' + friendly(error));
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.querySelectorAll('.module-nav [data-view]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});
document.querySelectorAll('[data-drawer-view]').forEach((button) => {
  button.addEventListener('click', () => switchDrawerView(button.dataset.drawerView));
});
document.querySelectorAll('.open-new-sponsor').forEach((button) => button.addEventListener('click', () => openSponsorForm()));
document.querySelectorAll('.open-new-asset').forEach((button) => button.addEventListener('click', () => openAssetForm()));
document.querySelectorAll('.close-workspace-modal').forEach((button) => button.addEventListener('click', closeModal));

$('newSponsorButton').addEventListener('click', () => openSponsorForm());
$('newAssetButton').addEventListener('click', () => openAssetForm());
$('editSponsorButton').addEventListener('click', () => openSponsorForm(sponsorById(selectedSponsorId)));
$('closeBrandDrawer').addEventListener('click', closeBrand);
$('newAgreementButton').addEventListener('click', () => openAgreementForm());
$('newMovementButton').addEventListener('click', openMovementForm);
$('addReceivedItem').addEventListener('click', () => addItemRow('receive'));
$('addGivenItem').addEventListener('click', () => addItemRow('give'));
$('brandSearch').addEventListener('input', renderBrands);
$('sponsorForm').addEventListener('submit', saveSponsor);
$('agreementForm').addEventListener('submit', saveAgreement);
$('assetForm').addEventListener('submit', saveAsset);
$('movementForm').addEventListener('submit', saveMovement);
$('archiveAsset').addEventListener('click', archiveAsset);
$('assetPhotoAction').addEventListener('click', () => $('assetPhotoInput').click());
$('assetPhotoInput').addEventListener('change', (event) => {
  const input = event.currentTarget;
  uploadAssetPhoto(input.files?.[0]).finally(() => { input.value = ''; });
});
$('evidenceUploadInput').addEventListener('change', (event) => {
  const input = event.currentTarget;
  uploadItemEvidence(input.files?.[0]).finally(() => { input.value = ''; });
});
$('sponsorStage').addEventListener('change', () => toggleLostReasonField($('sponsorStage').value));
bindPhoneMask($('sponsorPhone'));
$('exportSponsorKit').addEventListener('click', exportSponsorKit);
$('linkFundedPlayerButton').addEventListener('click', openFundingModal);
$('fundingForm').addEventListener('submit', saveFunding);
$('fundingPlayerSearch').addEventListener('input', () => {
  const query = $('fundingPlayerSearch').value.trim().toLowerCase();
  const results = $('fundingPlayerResults');
  $('fundingPlayerId').value = '';
  if (!query) { results.classList.add('hidden'); results.innerHTML = ''; return; }
  const matches = (billingPlayers || []).filter((p) => String(p.player_name || '').toLowerCase().includes(query)).slice(0, 15);
  results.innerHTML = matches.length
    ? matches.map((p) => '<button type="button" class="tsearch-opt" data-id="' + esc(p.player_id) + '">' + esc(p.player_name) + '</button>').join('')
    : '<div class="tsearch-empty">Sin coincidencias</div>';
  results.classList.remove('hidden');
});
$('fundingPlayerResults').addEventListener('click', (event) => {
  const button = event.target.closest('.tsearch-opt');
  if (!button) return;
  $('fundingPlayerId').value = button.dataset.id;
  $('fundingPlayerSearch').value = button.textContent;
  $('fundingPlayerResults').classList.add('hidden');
});
$('backdrop').addEventListener('click', () => {
  if (document.querySelector('.workspace-modal:not(.hidden)')) closeModal();
  else closeBrand();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (document.querySelector('.workspace-modal:not(.hidden)')) closeModal();
  else if (!$('brandDrawer').classList.contains('hidden')) closeBrand();
});

boot().catch((error) => {
  $('deniedText').textContent = friendly(error) || 'No pudimos abrir Patrocinios.';
  show('deniedView');
});
