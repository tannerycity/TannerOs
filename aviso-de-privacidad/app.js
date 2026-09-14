import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const $ = (id) => document.getElementById(id);
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(v) { if (!v) return ''; const d = new Date(`${String(v).slice(0, 10)}T12:00:00`); if (Number.isNaN(d.getTime())) return ''; return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
function renderBody(text) {
  return String(text || '').split(/\n\n+/).map((block) => {
    const lines = block.split('\n').map((l) => esc(l));
    if (lines.every((l) => l.startsWith('• '))) return `<ul>${lines.map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`;
    return `<p>${lines.join('<br>')}</p>`;
  }).join('');
}
(async () => {
  try {
    const { data, error } = await supabase.rpc('v2_public_centro_tanner_document', { club_key: '1850TC1850', doc_code: 'privacidad' });
    if (error) throw error;
    $('avisoVersion').textContent = data.version;
    $('avisoFecha').textContent = fmtDate(data.effectiveDate);
    $('avisoUpdated').textContent = fmtDate(data.effectiveDate);
    $('avisoBody').innerHTML = renderBody(data.body);
    $('avisoLoading').classList.add('hidden');
    $('avisoContent').classList.remove('hidden');
  } catch {
    $('avisoLoading').classList.add('hidden');
    $('avisoError').classList.remove('hidden');
  }
})();
