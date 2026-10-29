import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Pago en línea de la tienda con Mercado Pago (28/10/2026, h50).
//
// Presidencia: "ármate por mientras la pasarela de pago y ya después le
// configuramos la cuenta". Dos puertas:
//
//   POST {action:"crear", orderId, folio, origen}
//     La tienda, al terminar el pedido. Abre el intento en la base
//     (v2_online_payment_start valida pedido + folio y lo que falta), crea la
//     preferencia en Mercado Pago y regresa la liga para pagar.
//
//   POST ?aviso=mp   (notification_url de la preferencia)
//     Mercado Pago avisa que un pago cambió. Se revisa la firma y, sobre todo,
//     se CONSULTA el pago en la API de Mercado Pago: el cuerpo del aviso nunca
//     se cree. Con eso, v2_online_payment_notice registra el pago del pedido
//     (o lo marca rechazado, pendiente, reembolsado). Repetir el aviso no
//     duplica.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN     Access Token de producción de la cuenta del club.
//   MP_WEBHOOK_SECRET   "Clave secreta" de Webhooks en Mercado Pago.
// Sin MP_ACCESS_TOKEN la función contesta "no configurado" y la tienda sigue
// con transferencia.

const ORIGENES = [/^https:\/\/app\.tannerycity\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MP = "https://api.mercadopago.com";
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
function reason(error: unknown, fallback = "No se pudo iniciar el pago") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return fallback;
}
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function hmacHex(secret: string, texto: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// x-signature: "ts=1704908010,v1=618c8534..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
async function firmaValida(req: Request, dataId: string, secret: string) {
  const partes = Object.fromEntries((req.headers.get("x-signature") || "").split(",").map((p) => p.trim().split("=", 2)));
  const ts = partes.ts, v1 = partes.v1, rid = req.headers.get("x-request-id") || "";
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const esperado = await hmacHex(secret, `id:${id};request-id:${rid};ts:${ts};`);
  if (esperado.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}

async function crear(body: Record<string, unknown>, token: string) {
  const orderId = String(body.orderId || ""), folio = String(body.folio || "").trim();
  const origen = ORIGENES.some((r) => r.test(String(body.origen || ""))) ? String(body.origen) : "https://app.tannerycity.com";
  if (!UUID.test(orderId) || !folio) throw new Error("Pedido no encontrado");
  const db = admin();
  const { data: intento, error } = await db.rpc("v2_online_payment_start", { order_id: orderId, folio });
  if (error) throw new Error(error.message);
  const vuelta = (estado: string) => `${origen}/tienda/?pago=${encodeURIComponent(folio)}&estado=${estado}`;
  const pref = {
    items: [{ id: folio, title: `Pedido ${folio} · ${intento.club || "Tienda"}`, quantity: 1, unit_price: Number(intento.amount), currency_id: "MXN" }],
    payer: { name: intento.customerName || undefined, email: intento.customerEmail || undefined },
    external_reference: intento.id,
    notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/pago-en-linea?aviso=mp`,
    back_urls: { success: vuelta("ok"), pending: vuelta("pendiente"), failure: vuelta("fallo") },
    auto_return: "approved",
    statement_descriptor: "TANNERY CITY",
    metadata: { folio, organization_id: intento.organizationId },
  };
  const r = await fetch(`${MP}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": intento.id },
    body: JSON.stringify(pref),
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p?.init_point) throw new Error("Mercado Pago no respondió. Intenta otra vez o paga por transferencia.");
  await db.rpc("v2_online_payment_preference", { attempt_id: intento.id, preference_id: String(p.id) });
  return { url: p.init_point, amount: intento.amount };
}

async function aviso(req: Request, token: string) {
  const url = new URL(req.url);
  const cuerpo = await req.json().catch(() => ({} as Record<string, unknown>));
  const tipo = String(url.searchParams.get("type") || url.searchParams.get("topic") || (cuerpo as any)?.type || "");
  const dataId = String(url.searchParams.get("data.id") || url.searchParams.get("id") || (cuerpo as any)?.data?.id || "");
  if (tipo !== "payment" || !/^\d+$/.test(dataId)) return { ignorado: true };
  const secreto = Deno.env.get("MP_WEBHOOK_SECRET");
  if (secreto && !(await firmaValida(req, dataId, secreto))) return { status: 401, error: "Firma inválida" };
  // La verdad: el pago consultado en Mercado Pago con la llave del club.
  const r = await fetch(`${MP}/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}`);
  const pago = await r.json();
  if (!UUID.test(String(pago.external_reference || ""))) return { ignorado: true };
  const { data, error } = await admin().rpc("v2_online_payment_notice", {
    attempt_id: pago.external_reference, provider_payment_id: String(pago.id), status: String(pago.status || ""),
    amount: Number(pago.transaction_amount || 0), method: String(pago.payment_type_id || ""),
    detail: [pago.payment_method_id, pago.status_detail].filter(Boolean).join(" · ") || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("Origin"));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) return json({ error: "El pago en línea todavía no está configurado. Paga por transferencia." }, 503);
  const esAviso = new URL(req.url).searchParams.get("aviso") === "mp";
  try {
    if (esAviso) {
      const r = await aviso(req, token);
      if ((r as any)?.status === 401) return json({ error: (r as any).error }, 401);
      return json({ ok: true, ...r });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "crear") return json({ error: "Acción no válida" }, 400);
    return json(await crear(body, token));
  } catch (error) {
    // En un aviso, un 500 hace que Mercado Pago lo vuelva a mandar más tarde.
    return json({ error: reason(error) }, esAviso ? 500 : 400);
  }
});
