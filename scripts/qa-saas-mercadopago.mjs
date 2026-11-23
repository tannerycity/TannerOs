/* QA de la logica de Mercado Pago del SaaS (supabase/functions/saas-suscripcion/mp.js).
 *
 * Sin red: la firma se calcula aparte con node:crypto (otra implementacion) y
 * se exige que mp.js la acepte; luego se altera cada pieza y se exige rechazo.
 * Tambien: montos en centavos -> texto sin flotantes, frecuencia anual, que el
 * ambiente sea sandbox salvo doble autorizacion, y que no se guarden datos del
 * pagador ni de la tarjeta.
 */
import { createHmac } from 'node:crypto';
import { manifest, verifySignature, pesosTexto, preapprovalBody, eventKey, ambiente, pagoSeguro, parseSignature } from '../supabase/functions/saas-suscripcion/mp.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const SECRETO = 'clave-de-prueba-no-real';
const ahora = 1795400000000;
const ts = String(Math.floor(ahora / 1000));
const firmar = (id, rid, t, s = SECRETO) => createHmac('sha256', s).update(`id:${id};request-id:${rid};ts:${t};`).digest('hex');

// ── Manifiesto (documentacion oficial) ────────────────────────────────────
revisa('manifiesto completo', manifest('123', 'r-1', '99') === 'id:123;request-id:r-1;ts:99;');
revisa('data.id alfanumerico en minusculas', manifest('ABC123', 'r', '1') === 'id:abc123;request-id:r;ts:1;');
revisa('data.id con guiones se respeta', manifest('AB-12', 'r', '1') === 'id:AB-12;request-id:r;ts:1;');
revisa('sin request-id se omite el par', manifest('1', '', '5') === 'id:1;ts:5;');
revisa('encabezado se parte bien', JSON.stringify(parseSignature('ts=1, v1=ab')) === '{"ts":"1","v1":"ab"}');

// ── Firma ─────────────────────────────────────────────────────────────────
const base = { secret: SECRETO, requestId: 'req-9', dataId: '987654', nowMs: ahora };
const v1 = firmar('987654', 'req-9', ts);
const ok = await verifySignature({ ...base, signatureHeader: `ts=${ts},v1=${v1}` });
revisa('firma correcta: valida', ok.ok, ok);
revisa('firma con espacios en el encabezado: valida', (await verifySignature({ ...base, signatureHeader: ` ts=${ts} , v1=${v1} ` })).ok);
revisa('ts en milisegundos tambien', (await verifySignature({ ...base, signatureHeader: `ts=${ahora},v1=${firmar('987654', 'req-9', String(ahora))}` })).ok);
const mal = async (n, h, extra = {}, motivo) => { const r = await verifySignature({ ...base, ...extra, signatureHeader: h }); revisa(n, !r.ok && (!motivo || r.motivo === motivo), r); };
await mal('otro secreto', `ts=${ts},v1=${firmar('987654', 'req-9', ts, 'otra')}`, {}, 'firma');
await mal('otro recurso (data.id cambiado)', `ts=${ts},v1=${v1}`, { dataId: '987655' }, 'firma');
await mal('otro request-id', `ts=${ts},v1=${v1}`, { requestId: 'req-10' }, 'firma');
await mal('ts alterado', `ts=${Number(ts) + 1},v1=${v1}`, {}, 'firma');
await mal('aviso viejo (repeticion, 11 min)', `ts=${Number(ts) - 660},v1=${firmar('987654', 'req-9', String(Number(ts) - 660))}`, {}, 'vencida');
await mal('sin encabezado', '', {}, 'encabezado');
await mal('v1 que no es hex de 64', `ts=${ts},v1=zz`, {}, 'encabezado');
await mal('sin clave configurada', `ts=${ts},v1=${v1}`, { secret: '' }, 'sin_clave');

// ── Montos: centavos -> texto, sin flotantes ──────────────────────────────
revisa('346.84', pesosTexto(34684) === '346.84');
revisa('0.05', pesosTexto(5) === '0.05');
revisa('3229.20', pesosTexto(322920) === '3229.20');
revisa('pesosTexto rechaza flotante', (() => { try { pesosTexto(1.5); return false; } catch { return true; } })());
const sub = '3f1c2b9a-1111-4222-8333-944445555666';
const mensual = preapprovalBody({ subscriptionId: sub, planName: 'FORMATIVO', cycle: 'monthly', totalCents: 34684, payerEmail: ' Club@Ejemplo.MX ', backUrl: 'https://app.tannerycity.com/admin/' });
revisa('preapproval mensual: frecuencia 1 mes', mensual.auto_recurring.frequency === 1 && mensual.auto_recurring.frequency_type === 'months');
revisa('preapproval: monto exacto y MXN', mensual.auto_recurring.transaction_amount === 346.84 && mensual.auto_recurring.currency_id === 'MXN');
revisa('preapproval: external_reference = suscripcion', mensual.external_reference === sub);
revisa('preapproval: pending (la academia autoriza en Mercado Pago, sin tarjeta aqui)', mensual.status === 'pending' && !('card_token_id' in mensual));
revisa('preapproval: correo normalizado', mensual.payer_email === 'club@ejemplo.mx');
const anual = preapprovalBody({ subscriptionId: sub, planName: 'FORMATIVO', cycle: 'annual', totalCents: 374587, payerEmail: 'a@b.mx', backUrl: 'x', startDate: '2027-01-01T00:00:00Z' });
revisa('preapproval anual: cada 12 meses y fecha de inicio', anual.auto_recurring.frequency === 12 && anual.auto_recurring.start_date === '2027-01-01T00:00:00.000Z');
revisa('no se crea preapproval de $0 (Semilla no pide tarjeta)', (() => { try { preapprovalBody({ subscriptionId: sub, planName: 'S', cycle: 'monthly', totalCents: 0 }); return false; } catch { return true; } })());
revisa('ciclo invalido', (() => { try { preapprovalBody({ subscriptionId: sub, planName: 'S', cycle: 'weekly', totalCents: 1 }); return false; } catch { return true; } })());

// ── Idempotencia del aviso ────────────────────────────────────────────────
revisa('mismo aviso, misma llave', eventKey({ requestId: 'r1', topic: 'payment', dataId: '1' }) === eventKey({ requestId: 'r1', topic: 'payment', dataId: '1' }));
revisa('sin request-id: tema+recurso+accion', eventKey({ topic: 'payment', dataId: '1', action: 'payment.updated' }) === 't:payment:1:payment.updated');

// ── Ambiente: sandbox salvo doble autorizacion ────────────────────────────
const con = vars => k => vars[k] || '';
revisa('por omision sandbox', ambiente(con({ MC_MP_ACCESS_TOKEN_SANDBOX: 't' })).env === 'sandbox');
revisa('production sin autorizacion se queda en sandbox', ambiente(con({ MC_MP_ENV: 'production', MC_MP_ACCESS_TOKEN_PRODUCTION: 'p' })).bloqueado === 'produccion_no_autorizada');
revisa('production autorizada usa su propio token', ambiente(con({ MC_MP_ENV: 'production', MC_MP_PRODUCTION_AUTHORIZED: 'si', MC_MP_ACCESS_TOKEN_PRODUCTION: 'p' })).token === 'p');
revisa('no usa el token de la tienda del club (MP_ACCESS_TOKEN)', ambiente(con({ MP_ACCESS_TOKEN: 'club' })).token === null);

// ── Lo que se guarda del pago: nada del pagador ni de la tarjeta ───────────
const guardado = pagoSeguro({ id: 55, status: 'approved', transaction_amount: 346.84, currency_id: 'MXN', payer: { email: 'x@y.mx', identification: { number: 'XAXX' } }, card: { last_four_digits: '4242', cardholder: { name: 'Ana' } } });
revisa('pago: sin payer ni card', !JSON.stringify(guardado).match(/payer|card|4242|x@y|Ana|XAXX/), guardado);

console.log(fallos ? `\nqa-saas-mercadopago: ${fallos} de ${corridas} comprobaciones fallaron` : `qa-saas-mercadopago OK · ${corridas} comprobaciones`);
if (fallos) process.exit(1);
