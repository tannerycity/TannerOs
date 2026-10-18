import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Portal de familias, fase 1 (18/10/2026): "quiero que la gente ya empiece a
// meterse". La familia abre la liga que el club le mandó por WhatsApp
// (/familias/#i=<token>), elige su contraseña y queda dentro. Su usuario es su
// teléfono (10 dígitos), porque 64 de 72 tutores no tienen correo.
//
// Se despliega SIN verificación de JWT: la usa quien todavía no tiene cuenta.
// Lo que autoriza es el token: v2_family_invite_resolve / _consume sólo los
// puede llamar la llave de servicio, el token vence en 14 días y sirve una vez.
// Con la misma liga, quien ya tenía cuenta elige una contraseña nueva.

const ORIGENES = [/^https:\/\/app\.tannerycity\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
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
function reason(error: unknown, fallback = "No se pudo completar") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return fallback;
}
const DOMINIO = "familias.tanneros.invalid";

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("Origin"));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "Server configuration unavailable" }, 500);
    const body = await req.json().catch(() => ({}));
    if (String(body.action || "") !== "claim") return json({ error: "Acción no válida" }, 400);
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Esta liga no es válida. Pídele al club una nueva." }, 400);
    if (password.length < 8 || password.length > 72) return json({ error: "La contraseña necesita al menos 8 caracteres." }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: inv, error: invError } = await admin.rpc("v2_family_invite_resolve", { token });
    if (invError) throw invError;
    if (!inv?.ok) return json({ error: "Esta liga ya se usó o venció. Pídele al club una nueva." }, 410);

    let userId: string = inv.userId || "";
    let login = "", usuario = "", creado = false;
    if (userId) {
      // Ya tenía cuenta: la liga sirve para elegir contraseña nueva.
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !target.user) throw targetError || new Error("User not found");
      const meta = { ...(target.user.app_metadata || {}), must_change_password: false, password_reset_at: new Date().toISOString() };
      const { error } = await admin.auth.admin.updateUserById(userId, { password, app_metadata: meta });
      if (error) throw error;
      login = String(target.user.email || "");
      usuario = String(target.user.app_metadata?.login_username || login);
    } else {
      // Cuenta nueva: el usuario es el teléfono.
      const telefono = String(inv.telefono || "");
      if (!/^\d{10}$/.test(telefono)) return json({ error: "El club no tiene tu teléfono a 10 dígitos. Escríbele para que lo corrija." }, 409);
      usuario = telefono; login = `${telefono}@${DOMINIO}`;
      const { data: nuevo, error } = await admin.auth.admin.createUser({
        email: login, password, email_confirm: true,
        user_metadata: { display_name: String(inv.nombre || telefono) },
        app_metadata: { login_type: "username", login_username: telefono, portal: "familias", must_change_password: false, invited: true },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          return json({ error: "Ese teléfono ya tiene cuenta. Entra con tu teléfono y tu contraseña, o pídele al club una liga para recuperarla." }, 409);
        }
        throw error;
      }
      userId = String(nuevo.user?.id || "");
      if (!userId) throw new Error("User was not created");
      creado = true;
    }

    const { error: consumeError } = await admin.rpc("v2_family_invite_consume", { token, user_id: userId });
    if (consumeError) {
      if (creado) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ error: "No se pudo ligar tu cuenta. Pídele al club una liga nueva." }, 409);
    }
    return json({ ok: true, login, usuario });
  } catch (error) {
    console.error("family-access", reason(error));
    return json({ error: "No se pudo completar. Intenta de nuevo en un momento." }, 500);
  }
});
