import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Demo pública con perfiles (Presidencia, 12/10/2026): "un botón que diga
// entra, para que veas los distintos perfiles".
//
// Sin contraseña: cada perfil es una cuenta fija (demo.<perfil>.<variante>
// @example.com) de uno de los dos clubes demo. Aquí se crea si no existe, se
// le da su rol (v2_prepare_demo_user, sólo con la llave de servicio) y se abre
// la sesión con un enlace mágico que se canjea en el servidor: al navegador
// sólo llegan los tokens de esa cuenta de demo.
//
// Los clubes demo son de solo lectura (o4): nadie puede descomponerlos.

const ORIGENES = [/^https:\/\/app\.tannerycity\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PERFILES = new Set(["presidencia", "direccion", "formador", "taquilla", "contabilidad", "familia"]);
const VARIANTES = new Set(["datos", "vacio"]);

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
function reason(error: unknown, fallback = "No se pudo abrir la demo") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return fallback;
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("Origin"));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "Server configuration unavailable" }, 500);
    const body = await req.json().catch(() => ({}));
    const perfil = String(body.perfil || ""), variante = String(body.variante || "");
    if (!PERFILES.has(perfil) || !VARIANTES.has(variante)) return json({ error: "Perfil o demo inválidos" }, 400);
    if (perfil === "familia" && variante === "vacio") return json({ error: "El club nuevo todavía no tiene familias" }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `demo.${perfil}.${variante}@example.com`;
    const meta = perfil === "familia" ? { demo: true, portal: "familias", must_change_password: false } : { demo: true, must_change_password: false };

    const creado = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: meta, user_metadata: { full_name: `Demo ${perfil}` } });
    if (creado.error && !/already|registered|exists/i.test(creado.error.message)) throw creado.error;

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link?.user || !link.properties?.hashed_token) throw linkError || new Error("No se pudo preparar el acceso");

    const { data: prep, error: prepError } = await admin.rpc("v2_prepare_demo_user", { user_id: link.user.id, perfil, variante });
    if (prepError) throw prepError;

    const publico = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: ses, error: sesError } = await publico.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (sesError || !ses?.session) throw sesError || new Error("No se pudo abrir la sesión");

    return json({
      access_token: ses.session.access_token,
      refresh_token: ses.session.refresh_token,
      landing: (prep as { landing?: string })?.landing || "/",
      club: (prep as { slug?: string })?.slug || null,
    });
  } catch (error) {
    return json({ error: reason(error) }, 500);
  }
});
