// Logica pura de Mercado Pago para la suscripcion de Mi Club FC.
//
// Sin red y sin secretos guardados: la usa la Edge Function (Deno) y la prueba
// scripts/qa-saas-mercadopago.mjs (Node). WebCrypto existe en los dos.
//
// Documentacion revisada el 23/11/2026 (Mercado Pago Developers, Mexico):
//   - Suscripciones sin plan asociado: POST /preapproval con auto_recurring
//     {frequency, frequency_type:"months", transaction_amount, currency_id}.
//     status "pending" => Mercado Pago da init_point para que la academia
//     autorice el pago en su sitio (no tocamos datos de tarjeta).
//   - Webhooks: header x-signature "ts=...,v1=..." con HMAC-SHA256 (hex) de
//     "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" y la clave secreta de
//     la aplicacion. data.id alfanumerico va en minusculas. Si falta un valor,
//     ese par se omite del manifiesto.

export const MP_API = 'https://api.mercadopago.com';

export function parseSignature(header) {
  const out = {};
  for (const parte of String(header || '').split(',')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return out;
}

export function manifest(dataId, requestId, ts) {
  const id = dataId == null || dataId === '' ? null : (/^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId));
  return (id != null ? `id:${id};` : '') + (requestId ? `request-id:${requestId};` : '') + (ts ? `ts:${ts};` : '');
}

export async function hmacHex(secret, texto) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', key, enc.encode(texto));
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function igualTiempoConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// Firma valida Y reciente (contra repeticion de un aviso viejo capturado).
// ts puede venir en segundos o en milisegundos: se aceptan los dos.
export async function verifySignature({ secret, signatureHeader, requestId, dataId, nowMs = Date.now(), toleranceSec = 600 }) {
  if (!secret) return { ok: false, motivo: 'sin_clave' };
  const { ts, v1 } = parseSignature(signatureHeader);
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, motivo: 'encabezado' };
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(nowMs - tsMs) > toleranceSec * 1000) return { ok: false, motivo: 'vencida' };
  const esperado = await hmacHex(secret, manifest(dataId, requestId, ts));
  return igualTiempoConstante(esperado, v1.toLowerCase()) ? { ok: true } : { ok: false, motivo: 'firma' };
}

// Centavos enteros -> "346.84" sin pasar por punto flotante.
export function pesosTexto(centavos) {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('monto invalido');
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

// Cuerpo del preapproval. El monto sale del SERVIDOR (cotizacion guardada),
// nunca del navegador. external_reference = id de la suscripcion: el aviso se
// cruza con la academia correcta y con nada mas.
export function preapprovalBody({ subscriptionId, planName, cycle, totalCents, payerEmail, backUrl, startDate = null }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(subscriptionId))) throw new Error('suscripcion invalida');
  if (!['monthly', 'annual'].includes(cycle)) throw new Error('ciclo invalido');
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new Error('una suscripcion de pago necesita monto');
  const auto = { frequency: cycle === 'annual' ? 12 : 1, frequency_type: 'months', transaction_amount: Number(pesosTexto(totalCents)), currency_id: 'MXN' };
  if (startDate) auto.start_date = new Date(startDate).toISOString();
  return {
    reason: `Mi Club FC · ${planName} · ${cycle === 'annual' ? 'anual' : 'mensual'}`,
    external_reference: String(subscriptionId),
    payer_email: String(payerEmail || '').trim().toLowerCase(),
    back_url: backUrl,
    auto_recurring: auto,
    status: 'pending'
  };
}

// Llave del aviso para no procesarlo dos veces. Si Mercado Pago repite el
// mismo aviso trae el mismo x-request-id; sin el, tema + recurso + accion.
export function eventKey({ requestId, topic, dataId, action }) {
  return requestId ? `rid:${requestId}` : `t:${topic}:${dataId}:${action || ''}`;
}

export function topicOf(url, body) {
  const q = url.searchParams;
  return String(body?.type || body?.topic || q.get('type') || q.get('topic') || '');
}
export function dataIdOf(url, body) {
  return String(url.searchParams.get('data.id') || body?.data?.id || url.searchParams.get('id') || '');
}

// Ambiente: sandbox por omision. Produccion necesita DOS llaves a proposito:
// MC_MP_ENV=production y MC_MP_PRODUCTION_AUTHORIZED=si (aprobacion de Presidencia).
export function ambiente(env) {
  const quiere = env('MC_MP_ENV') === 'production' ? 'production' : 'sandbox';
  if (quiere === 'production' && env('MC_MP_PRODUCTION_AUTHORIZED') !== 'si') return { env: 'sandbox', bloqueado: 'produccion_no_autorizada' };
  const token = env(quiere === 'production' ? 'MC_MP_ACCESS_TOKEN_PRODUCTION' : 'MC_MP_ACCESS_TOKEN_SANDBOX');
  return { env: quiere, token: token || null };
}

// Lo que se guarda de un recurso de Mercado Pago: solo lo necesario, sin datos
// del pagador ni de la tarjeta.
export function pagoSeguro(p) {
  return {
    id: String(p?.id ?? ''), status: p?.status ?? null, status_detail: p?.status_detail ?? null,
    transaction_amount: p?.transaction_amount ?? null, currency_id: p?.currency_id ?? null,
    date_approved: p?.date_approved ?? null, date_last_updated: p?.date_last_updated ?? null
  };
}
export function preapprovalSeguro(p) {
  return {
    id: String(p?.id ?? ''), status: p?.status ?? null, external_reference: p?.external_reference ?? null,
    last_modified: p?.last_modified ?? null,
    auto_recurring: { transaction_amount: p?.auto_recurring?.transaction_amount ?? null, currency_id: p?.auto_recurring?.currency_id ?? null }
  };
}
