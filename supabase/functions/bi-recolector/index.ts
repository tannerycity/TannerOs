import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ga4Trafico, ga4Eventos, EVENTOS_GA4_PEDIDOS, searchConsole, metaAds, metaInsights, fotoSeguidores, sinSecretos } from "./normaliza.js";

// Recolector del tablero ejecutivo, sin Windsor (30/10/2026, h56).
//
// Lo llama pg_cron una vez al día (docs/medicion/BI-SIN-WINDSOR.md) con el
// encabezado x-bi-secreto, que se compara contra el Vault (v2_bi_secreto_ok).
// Lee con APIs oficiales y permisos de sólo lectura:
//   - GA4 Data API y Search Console API, con una cuenta de servicio de Google
//     dada de alta como Lector en cada propiedad (gratis).
//   - Graph API / Marketing API de Meta, con el token de un usuario del sistema
//     del Business Manager (ads_read, pages_read_engagement, read_insights,
//     instagram_basic, instagram_manage_insights).
// Si falta una credencial o Meta niega un permiso, esa fuente queda
// "bloqueada" con su motivo y el tablero la muestra como no disponible.
// Nunca guarda ni registra tokens, URLs completas, búsquedas ni personas.
//
// Secretos (Supabase → Edge Functions → Secrets), los carga el dueño:
//   GOOGLE_SERVICE_ACCOUNT_JSON, META_SYSTEM_USER_TOKEN

const ORG = "3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8";
const GRAPH = "https://graph.facebook.com/v21.0";
const DIAS = 7; // relee la última semana: las APIs corrigen días recientes.

type Cuenta = { fuente: string; cuenta: string; negocio: string };

function rango(dias: number) {
  const hoy = new Date(Date.now() - 6 * 3600 * 1000); // centro de México
  const hasta = new Date(hoy.getTime() - 24 * 3600 * 1000);
  const desde = new Date(hasta.getTime() - (dias - 1) * 24 * 3600 * 1000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: f(desde), hasta: f(hasta), hoy: f(hoy) };
}

// ---- Google: token de cuenta de servicio (JWT RS256) ----
async function tokenGoogle(sa: { client_email: string; private_key: string }, scope: string) {
  const b64 = (o: unknown) => btoa(typeof o === "string" ? o : JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const llave = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(cuerpo)));
  const jwt = `${cuerpo}.${btoa(String.fromCharCode(...firma)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  if (!r.ok) throw new Error(`Google token ${r.status}`);
  return (await r.json()).access_token as string;
}

async function json(url: string, init: RequestInit = {}) {
  const r = await fetch(url, init);
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${cuerpo?.error?.message || cuerpo?.error?.status || ""}`.trim());
  return cuerpo;
}

// ---- Fuentes ----
async function ga4(token: string, c: Cuenta, r: ReturnType<typeof rango>) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${c.cuenta}:runReport`;
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const dateRanges = [{ startDate: r.desde, endDate: r.hasta }];
  const t = await json(url, { method: "POST", headers: h, body: JSON.stringify({ dateRanges, dimensions: [{ name: "date" }, { name: "hostName" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }] }) });
  const e = await json(url, { method: "POST", headers: h, body: JSON.stringify({ dateRanges, dimensions: [{ name: "date" }, { name: "hostName" }, { name: "eventName" }], metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: EVENTOS_GA4_PEDIDOS } } } }) });
  return [...ga4Trafico(t, c.cuenta), ...ga4Eventos(e, c.cuenta)];
}
async function gsc(token: string, c: Cuenta, r: ReturnType<typeof rango>) {
  const d = await json(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.cuenta)}/searchAnalytics/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: r.desde, endDate: r.hasta, dimensions: ["date", "page"], rowLimit: 5000 }) });
  return searchConsole(d, c.cuenta);
}
async function anuncios(token: string, c: Cuenta, r: ReturnType<typeof rango>) {
  const q = new URLSearchParams({ level: "campaign", time_increment: "1", limit: "500", access_token: token,
    fields: "campaign_name,spend,impressions,reach,clicks,actions,date_start", time_range: JSON.stringify({ since: r.desde, until: r.hasta }) });
  return metaAds(await json(`${GRAPH}/act_${c.cuenta}/insights?${q}`), c.cuenta);
}
async function pagina(token: string, c: Cuenta, r: ReturnType<typeof rango>) {
  // El token de la página sale del token del usuario del sistema.
  const p = await json(`${GRAPH}/${c.cuenta}?fields=access_token,followers_count&access_token=${token}`);
  const q = new URLSearchParams({ metric: "page_impressions,page_post_engagements", period: "day", since: r.desde, until: r.hoy, access_token: p.access_token });
  const ins = await json(`${GRAPH}/${c.cuenta}/insights?${q}`);
  return [...metaInsights(ins, "facebook", c.cuenta, c.negocio, { page_impressions: "impresiones", page_post_engagements: "interacciones" }),
          ...fotoSeguidores(p.followers_count, "facebook", c.cuenta, c.negocio, r.hoy)];
}
async function instagram(token: string, c: Cuenta, r: ReturnType<typeof rango>) {
  const u = await json(`${GRAPH}/${c.cuenta}?fields=followers_count&access_token=${token}`);
  const q = new URLSearchParams({ metric: "reach,follower_count", period: "day", since: r.desde, until: r.hoy, access_token: token });
  const ins = await json(`${GRAPH}/${c.cuenta}/insights?${q}`);
  return [...metaInsights(ins, "instagram", c.cuenta, c.negocio, { reach: "alcance", follower_count: "nuevos_seguidores" }),
          ...fotoSeguidores(u.followers_count, "instagram", c.cuenta, c.negocio, r.hoy)];
}

Deno.serve(async (req: Request) => {
  // El secreto vive en el Vault de Supabase (h56b): nadie lo copia ni lo pega.
  const secreto = req.headers.get("x-bi-secreto") || "";
  if (req.method !== "POST" || secreto.length < 32) return new Response("Not authorized", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: valido } = await admin.rpc("v2_bi_secreto_ok", { secreto });
  if (valido !== true) return new Response("Not authorized", { status: 401 });
  const r = rango(DIAS);
  const { data: cuentas, error } = await admin.rpc("v2_bi_cuentas", { organization_id: ORG });
  if (error) return new Response(JSON.stringify({ error: "No se pudieron leer las cuentas" }), { status: 500 });

  const saTexto = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"), meta = Deno.env.get("META_SYSTEM_USER_TOKEN");
  let ga4Token: string | null = null, gscToken: string | null = null;
  const resumen: Record<string, unknown> = {};
  const porFuente = new Map<string, Cuenta[]>();
  for (const c of (cuentas || []) as Cuenta[]) porFuente.set(c.fuente, [...(porFuente.get(c.fuente) || []), c]);

  for (const [fuente, lista] of porFuente) {
    let filas: unknown[] = [], estado = "ok", detalle = "";
    try {
      if (fuente === "gbp") { estado = "bloqueada"; detalle = "Business Profile Performance API requiere acceso aprobado por Google; usar el panel nativo."; }
      else if ((fuente === "ga4" || fuente === "search_console") && !saTexto) { estado = "bloqueada"; detalle = "Falta GOOGLE_SERVICE_ACCOUNT_JSON."; }
      else if (["meta_ads", "facebook", "instagram"].includes(fuente) && !meta) { estado = "bloqueada"; detalle = "Falta META_SYSTEM_USER_TOKEN."; }
      else {
        const sa = saTexto ? JSON.parse(saTexto) : null;
        for (const c of lista) {
          if (fuente === "ga4") filas.push(...await ga4(ga4Token ??= await tokenGoogle(sa, "https://www.googleapis.com/auth/analytics.readonly"), c, r));
          if (fuente === "search_console") filas.push(...await gsc(gscToken ??= await tokenGoogle(sa, "https://www.googleapis.com/auth/webmasters.readonly"), c, r));
          if (fuente === "meta_ads") filas.push(...await anuncios(meta!, c, r));
          if (fuente === "facebook") filas.push(...await pagina(meta!, c, r));
          if (fuente === "instagram") filas.push(...await instagram(meta!, c, r));
        }
      }
    } catch (e) {
      estado = /\b(400|401|403)\b|permission|permiso/i.test(String((e as Error)?.message)) ? "bloqueada" : "error";
      detalle = sinSecretos((e as Error)?.message); filas = [];
    }
    const { data } = await admin.rpc("v2_bi_ingesta", { organization_id: ORG, fuente, estado, filas, desde: r.desde, hasta: r.hasta, detalle: detalle || null });
    resumen[fuente] = { estado, ...(data || {}) };
  }
  return new Response(JSON.stringify({ ok: true, desde: r.desde, hasta: r.hasta, fuentes: resumen }), { headers: { "Content-Type": "application/json" } });
});
