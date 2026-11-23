import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// @ts-ignore modulo JS compartido con las pruebas de Node
import { MP_API, verifySignature, preapprovalBody, eventKey, topicOf, dataIdOf, ambiente, pagoSeguro, preapprovalSeguro } from "./mp.js";

// SUSCRIPCION A MI CLUB FC con Mercado Pago (23/11/2026) — BORRADOR, NO DESPLEGADA.
//
// Es el cobro de Mi Club FC a las ACADEMIAS. No tiene nada que ver con
// pago-en-linea (h50), que es la cuenta de cada club para cobrar a SUS
// familias: otra cuenta, otros secretos, otras tablas.
//
//   POST {action:"checkout", organizationId, tier, cycle, addons, coupon}
//     Con la sesion del usuario. La base cotiza y crea la suscripcion
//     pendiente (v2_saas_start_checkout revisa permisos y monto). Si es
//     Semilla gratis, termina ahi: sin tarjeta. Si no, se crea el
//     preapproval en Mercado Pago con el monto DEL SERVIDOR y se regresa la
//     liga para autorizar el pago.
//   POST {action:"cancel", organizationId, reason}
//     Cancela la renovacion (la academia conserva el acceso hasta el fin del
//     periodo) y cancela el preapproval en Mercado Pago.
//   POST ?aviso=mp
//     Webhook. Firma + vigencia; el aviso se registra una sola vez y el
//     recurso se CONSULTA en la API (el cuerpo del aviso nunca se cree).
//     Una redireccion del navegador no activa nada: activa el pago aprobado.
//
// Secretos (Supabase -> Edge Functions -> Secrets), SOLO del SaaS:
//   MC_MP_ENV                       sandbox (omision) | production
//   MC_MP_PRODUCTION_AUTHORIZED     "si" solo con aprobacion de Presidencia
//   MC_MP_ACCESS_TOKEN_SANDBOX      token de PRUEBA de la cuenta de Mi Club FC
//   MC_MP_ACCESS_TOKEN_PRODUCTION   token de produccion (no se configura todavia)
//   MC_MP_WEBHOOK_SECRET            clave secreta de Webhooks de esa aplicacion
//   MC_SITE_URL                     https://app.tannerycity.com (regreso)
// Sin token: contesta "no configurado" y no hace nada.

const env = (k: string) => Deno.env.get(k) ?? "";
const ORIGENES = [/^https:\/\/app\.tannerycity\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const ok = origin && ORIGENES.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://app.tannerycity.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}
const json = (h: HeadersInit, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const comoUsuario = (auth: string) => createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false }, global: { headers: { Authorization: auth } },
});
const mensaje = (e: unknown) => (e && typeof e === "object" && "message" in e) ? String((e as { message: unknown }).message) : "No se pudo completar";

async function mp(token: string, method: string, path: string, body?: unknown, idem?: string) {
  const r = await fetch(`${MP_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(idem ? { "X-Idempotency-Key": idem } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  // Nunca se registra el token ni el cuerpo completo: solo ruta y codigo.
  if (!r.ok) throw new Error(`Mercado Pago ${method} ${path.split("?")[0]} respondio ${r.status}`);
  return data;
}

async function checkout(req: Request, body: Record<string, unknown>) {
  const amb = ambiente(env);
  if (!amb.token) return { status: 503, body: { ok: false, error: "El cobro en línea todavía no está configurado." } };
  const auth = req.headers.get("Authorization") || "";
  const orgId = String(body.organizationId || "");
  if (!auth || !UUID.test(orgId)) return { status: 400, body: { ok: false, error: "Solicitud inválida" } };
  const db = comoUsuario(auth);
  const { data: user } = await db.auth.getUser();
  if (!user?.user?.email) return { status: 401, body: { ok: false, error: "Inicia sesión" } };
  // La base cotiza y revisa permisos. El navegador manda codigos, no montos.
  const { data: r, error } = await db.rpc("v2_saas_start_checkout", {
    organization_id: orgId, tier: String(body.tier || ""), cycle: String(body.cycle || "monthly"),
    addons: Array.isArray(body.addons) ? body.addons.map(String).slice(0, 20) : [], coupon: body.coupon ? String(body.coupon) : null,
  });
  if (error) return { status: 403, body: { ok: false, error: mensaje(error) } };
  if (!r?.ok) return { status: 422, body: r };
  if (!r.requierePago) return { status: 200, body: { ok: true, status: r.status, gratis: true } };
  const pre = await mp(amb.token, "POST", "/preapproval", preapprovalBody({
    subscriptionId: r.subscriptionId, planName: r.cotizacion?.plan, cycle: r.cotizacion?.ciclo, totalCents: Number(r.total),
    payerEmail: user.user.email, backUrl: `${env("MC_SITE_URL") || "https://app.tannerycity.com"}/admin/?suscripcion=revisar`,
    startDate: r.inicia,
  }), r.subscriptionId);
  const liga = amb.env === "sandbox" ? (pre.sandbox_init_point || pre.init_point) : pre.init_point;
  const { error: e2 } = await admin().rpc("v2_saas_svc_attach_preapproval", {
    subscription_id: r.subscriptionId, environment: amb.env, preapproval_id: String(pre.id), checkout_url: liga,
  });
  if (e2) throw e2;
  return { status: 200, body: { ok: true, status: "pending", pagar: liga, ambiente: amb.env, total: r.total } };
}

async function cancelar(req: Request, body: Record<string, unknown>) {
  const amb = ambiente(env);
  const auth = req.headers.get("Authorization") || "";
  const orgId = String(body.organizationId || "");
  if (!auth || !UUID.test(orgId)) return { status: 400, body: { ok: false, error: "Solicitud inválida" } };
  const { data: r, error } = await comoUsuario(auth).rpc("v2_saas_cancel_renewal", { organization_id: orgId, reason: body.reason ? String(body.reason) : null });
  if (error) return { status: 403, body: { ok: false, error: mensaje(error) } };
  if (r?.preapprovalId && amb.token && r.environment === amb.env) {
    await mp(amb.token, "PUT", `/preapproval/${encodeURIComponent(r.preapprovalId)}`, { status: "cancelled" });
  }
  return { status: 200, body: { ok: true, accesoHasta: r?.accesoHasta } };
}

async function aviso(req: Request, url: URL) {
  const amb = ambiente(env);
  const body = await req.json().catch(() => ({}));
  const topic = topicOf(url, body), dataId = dataIdOf(url, body);
  const requestId = req.headers.get("x-request-id") || "";
  if (!topic || !dataId) return { status: 200, body: { ok: true, ignorado: "sin tema" } };
  const firma = await verifySignature({ secret: env("MC_MP_WEBHOOK_SECRET"), signatureHeader: req.headers.get("x-signature"), requestId, dataId });
  const db = admin();
  const { data: ev, error: e1 } = await db.rpc("v2_saas_svc_register_event", {
    environment: amb.env, event_key: eventKey({ requestId, topic, dataId, action: body?.action }), topic,
    action: body?.action ? String(body.action) : null, resource_id: dataId, request_id: requestId || null, signature_valid: firma.ok,
  });
  if (e1) throw e1;
  if (!firma.ok) return { status: 401, body: { ok: false, error: "firma" } };
  if (!ev?.process) return { status: 200, body: { ok: true, repetido: true } };
  if (!amb.token) return { status: 503, body: { ok: false, error: "no configurado" } };
  try {
    let resultado: unknown = null;
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      const pre = await mp(amb.token, "GET", `/preapproval/${encodeURIComponent(dataId)}`);
      ({ data: resultado } = await db.rpc("v2_saas_svc_apply_preapproval", { environment: amb.env, preapproval: preapprovalSeguro(pre) }));
    } else if (topic === "subscription_authorized_payment") {
      const cuota = await mp(amb.token, "GET", `/authorized_payments/${encodeURIComponent(dataId)}`);
      const payId = cuota?.payment?.id;
      if (payId && cuota?.preapproval_id) {
        const pago = await mp(amb.token, "GET", `/v1/payments/${encodeURIComponent(String(payId))}`);
        ({ data: resultado } = await db.rpc("v2_saas_svc_apply_payment", { environment: amb.env, preapproval_id: String(cuota.preapproval_id), payment: pagoSeguro(pago) }));
      } else {
        resultado = { ignorado: "cuota sin pago todavía", estado: cuota?.status ?? null };
      }
    } else if (topic === "payment") {
      const pago = await mp(amb.token, "GET", `/v1/payments/${encodeURIComponent(dataId)}`);
      // Validar en sandbox donde viene el preapproval en un pago de suscripcion.
      const pre = pago?.metadata?.preapproval_id || pago?.point_of_interaction?.transaction_data?.subscription_id;
      if (pre) ({ data: resultado } = await db.rpc("v2_saas_svc_apply_payment", { environment: amb.env, preapproval_id: String(pre), payment: pagoSeguro(pago) }));
      else resultado = { ignorado: "pago sin suscripción (no es del SaaS)" };
    } else {
      resultado = { ignorado: `tema ${topic}` };
    }
    await db.rpc("v2_saas_svc_finish_event", { event_id: ev.id, status: "processed", result: resultado, error: null });
    return { status: 200, body: { ok: true } };
  } catch (e) {
    // Error: se guarda y se contesta 500 para que Mercado Pago reintente.
    await db.rpc("v2_saas_svc_finish_event", { event_id: ev.id, status: "error", result: null, error: mensaje(e).slice(0, 300) });
    return { status: 500, body: { ok: false } };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(h, 405, { ok: false });
  try {
    if (url.searchParams.get("aviso") === "mp") { const r = await aviso(req, url); return json(h, r.status, r.body); }
    const body = await req.json().catch(() => ({}));
    const r = body?.action === "checkout" ? await checkout(req, body) : body?.action === "cancel" ? await cancelar(req, body)
      : { status: 400, body: { ok: false, error: "Acción desconocida" } };
    return json(h, r.status, r.body);
  } catch (e) {
    console.error("saas-suscripcion:", mensaje(e));
    return json(h, 500, { ok: false, error: "No se pudo completar. Intenta de nuevo." });
  }
});
