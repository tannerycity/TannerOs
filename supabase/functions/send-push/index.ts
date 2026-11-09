// send-push: manda las notificaciones (web push) que pide private.notify_push.
//
// Seguridad (09/11/2026, h72): esta función ya NO guarda ninguna llave en su
// código. La llave interna vive sólo en Vault (push_internal_token); aquí se
// pregunta a la base si la que llegó es la buena (v2_push_token_valido, sólo
// service_role). Para cambiarla basta con rotarla en Vault.
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("x-internal-token") || "";
  const { data: valido, error } = await supabase.rpc("v2_push_token_valido", { token });
  if (error || valido !== true) return json({ error: "Unauthorized" }, 401);

  let payload: {
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    subscriptions?: { endpoint: string; keys: { p256dh: string; auth: string } }[];
    title?: string;
    body?: string;
    url?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { vapidPublicKey, vapidPrivateKey, subscriptions, title, body, url } = payload;
  if (!vapidPublicKey || !vapidPrivateKey || !Array.isArray(subscriptions) || !subscriptions.length) {
    return json({ ok: true, sent: 0, note: "Nada que enviar" });
  }

  webpush.setVapidDetails("mailto:soporte@tannerycity.com", vapidPublicKey, vapidPrivateKey);
  const notificationPayload = JSON.stringify({ title: title || "TannerOS", body: body || "", url: url || "/" });

  const staleEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, notificationPayload);
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) staleEndpoints.push(sub.endpoint);
      }
    }),
  );

  if (staleEndpoints.length) {
    await supabase.rpc("v2_purge_push_subscriptions", { endpoints: staleEndpoints }).then(() => {}, () => {});
  }
  return json({ ok: true, sent, failed, purged: staleEndpoints.length });
});
