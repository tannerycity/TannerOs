import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as PDFLib from "npm:pdf-lib@1.17.1";
import { armaExpediente } from "./pdf.js";

// Expediente de consentimiento de visoría (29/10/2026, h54).
//
// Paquete docs/visorias/00 §E: el PDF se genera del expediente que la base ya
// congeló al firmar, se guarda en un bucket privado y su SHA-256 queda en el
// consentimiento. Mientras no exista, el consentimiento sigue en
// "pending_artifact" y la puerta no lo deja pasar: nunca se anuncia
// "completado" sin el PDF.
//
//   POST {action:"build", token}            la familia, justo después de firmar
//   POST {action:"build", consentId}        staff (con sesión): reintentar
//   POST {action:"copy", token}             la familia descarga su copia
//   POST {action:"copy", consentId}         staff (con sesión) descarga
//
// Quién puede qué lo decide la base (v2_visoria_artifact_access) y cada
// descarga queda en la bitácora. Las ligas firmadas viven 2 minutos.
// Sin verificación de JWT: la familia no tiene cuenta; la autoriza su liga.

const ORIGENES = [/^https:\/\/app\.tannerycity\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "tanneros-visoria-expedientes";

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

async function sha256(bytes: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(h).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("Origin"));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !service) return json({ error: "Server configuration unavailable" }, 500);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action !== "build" && action !== "copy") return json({ error: "Acción no válida" }, 400);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    // Quién pide: la liga de la familia o un usuario del staff.
    const token = typeof body.token === "string" && /^[0-9a-f]{48}$/.test(body.token) ? body.token : null;
    let userId: string | null = null;
    let consentId: string | null = typeof body.consentId === "string" && UUID.test(body.consentId) ? body.consentId : null;
    if (token) {
      const { data, error } = await admin.rpc("v2_visoria_consent_by_token", { token });
      if (error) throw error;
      consentId = data || null;
    } else {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ") || !anonKey) return json({ error: "Not authorized" }, 401);
      const usuario = createClient(url, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: who } = await usuario.auth.getUser();
      userId = who?.user?.id || null;
      if (!userId) return json({ error: "Not authorized" }, 401);
    }
    if (!consentId) return json({ error: "No hay consentimiento firmado con esta liga." }, 404);

    const { data: acceso, error: accesoError } = await admin.rpc("v2_visoria_artifact_access",
      { consent_id: consentId, token, user_id: userId, purpose: action === "build" ? "generar" : "descarga" });
    if (accesoError) throw accesoError;
    if (!acceso?.ok) return json({ error: "Not authorized" }, 403);

    const { data: x, error: ctxError } = await admin.rpc("v2_visoria_artifact_context", { consent_id: consentId });
    if (ctxError) throw ctxError;
    let path: string = x.artifactPath || "";
    let status: string = x.status;

    if (!path) {
      // Se genera una sola vez. Si dos llegan juntos, el segundo adjunto no
      // pisa al primero: la base regresa el que quedó.
      const bytes: Uint8Array = await armaExpediente(PDFLib, x);
      const hash = await sha256(bytes);
      const destino = `organizations/${x.organizationId}/visorias/${x.campaign.slug}/${x.consentId}-${hash.slice(0, 12)}.pdf`;
      const { error: upError } = await admin.storage.from(BUCKET).upload(destino, bytes, { contentType: "application/pdf", upsert: false });
      if (upError && !/exists/i.test(upError.message)) throw upError;
      const { data: adj, error: adjError } = await admin.rpc("v2_visoria_artifact_attach",
        { consent_id: consentId, path: destino, sha256: hash, actor: userId ? "staff" : "familia" });
      if (adjError) throw adjError;
      path = adj.path; status = adj.status;
    }

    if (action === "build") return json({ ok: true, status });
    const { data: firmada, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 120,
      { download: `expediente-visoria-${String(x.folio || "tannery").toLowerCase()}.pdf` });
    if (signError) throw signError;
    return json({ ok: true, status, url: firmada.signedUrl });
  } catch (error) {
    // Sin detalles al navegador: el mensaje de la base puede traer datos.
    console.error("visoria-expediente", error instanceof Error ? error.message : "error");
    return json({ error: "No se pudo generar el expediente. Inténtalo de nuevo; tu firma ya quedó guardada." }, 500);
  }
});
