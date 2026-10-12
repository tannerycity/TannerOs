/* DEMO PÚBLICA CON PERFILES (Presidencia, 12/10/2026).
 *
 * "Un botón que diga: entra, para que veas los distintos perfiles. Una demo
 * sin datos y otra con datos."
 *
 * Sin contraseña: demo-login (edge) prepara la cuenta del perfil en el club
 * demo elegido y regresa su sesión; aquí se guarda y se entra. Los clubes demo
 * son de solo lectura (o4): se ve todo y no se guarda nada.
 */
import { createClient } from '/v2/supabase-client.js';

const URL_SUPABASE = 'https://pacnegivzgxpanphrnwp.supabase.co';
const LLAVE = 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const supabase = createClient(URL_SUPABASE, LLAVE, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
const $ = id => document.getElementById(id);

let variante = 'datos';
function msg(t = '', tipo = 'error') { const e = $('dmMsg'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }
function pintaVariante() {
  document.querySelectorAll('.dm-variante').forEach(b => { const on = b.dataset.variante === variante; b.classList.toggle('activa', on); b.setAttribute('aria-checked', String(on)); });
  // El club nuevo todavía no tiene familias que ver.
  const fam = document.querySelector('[data-perfil="familia"]');
  fam.disabled = variante === 'vacio';
  fam.title = fam.disabled ? 'El club nuevo todavía no tiene familias' : '';
}

export async function entra(perfil) {
  msg('Abriendo la demo…', 'info');
  document.querySelectorAll('.dm-perfil').forEach(b => { b.disabled = true; });
  try {
    const r = await fetch(`${URL_SUPABASE}/functions/v1/demo-login`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: LLAVE }, body: JSON.stringify({ perfil, variante })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error(d.error || 'No se pudo abrir la demo. Intenta de nuevo.');
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    const { error } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
    if (error) throw error;
    location.href = d.landing || '/';
  } catch (e) {
    msg(e?.message || 'No se pudo abrir la demo.');
    document.querySelectorAll('.dm-perfil').forEach(b => { b.disabled = false; }); pintaVariante();
  }
}

document.querySelectorAll('.dm-variante').forEach(b => b.addEventListener('click', () => { variante = b.dataset.variante; pintaVariante(); msg(); }));
document.querySelectorAll('.dm-perfil').forEach(b => b.addEventListener('click', () => entra(b.dataset.perfil)));
const pedida = new URLSearchParams(location.search).get('club');
if (pedida === 'vacio' || pedida === 'nuevo') variante = 'vacio';
pintaVariante();
