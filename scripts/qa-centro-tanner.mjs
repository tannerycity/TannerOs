// Smoke test de las RPCs públicas de Centro Tanner contra el proyecto real de
// Supabase. Sin dependencias npm: usa fetch nativo de Node contra PostgREST,
// igual que el resto del repo evita introducir un bundler o node_modules.
import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://pacnegivzgxpanphrnwp.supabase.co';
const ANON_KEY = 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const CLUB_KEY = '1850TC1850';

async function callRpc(name, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const home = await callRpc('v2_public_centro_tanner_home', { club_key: CLUB_KEY });
assert.ok(Array.isArray(home.documents) && home.documents.length >= 3, 'Home debe listar los documentos oficiales activos');
assert.ok(home.documents.some((d) => d.code === 'privacidad'), 'El Aviso de Privacidad debe estar publicado');
console.log('✓ Home de Centro Tanner responde con documentos y categorías');

const results = await callRpc('v2_public_centro_tanner_search', { club_key: CLUB_KEY, q: 'mensualidad no acumulable' });
assert.ok(Array.isArray(results) && results.length > 0, 'La búsqueda debe encontrar la política de pagos no acumulables');
console.log('✓ Búsqueda con resultados funciona');

const empty = await callRpc('v2_public_centro_tanner_search', { club_key: CLUB_KEY, q: 'xyzxyznoexistequery123' });
assert.deepEqual(empty, [], 'Una búsqueda sin coincidencias debe regresar arreglo vacío, no error');
console.log('✓ Búsqueda sin resultados no truena');

const policy = await callRpc('v2_public_centro_tanner_policy', { club_key: CLUB_KEY, policy_slug: 'pagos-y-servicios-no-acumulables' });
assert.equal(policy.title, 'Pagos y servicios no acumulables');
assert.ok(policy.officialContent.length > 100, 'La política completa debe traer el texto oficial');
console.log('✓ Detalle de política funciona');

const doc = await callRpc('v2_public_centro_tanner_document', { club_key: CLUB_KEY, doc_code: 'privacidad' });
assert.ok(doc.body.includes('Tannery City FC'), 'El aviso de privacidad debe traer el texto real, no un placeholder');
assert.ok(doc.body.includes('tannery.city.1850@gmail.com'), 'Debe conservar el correo ARCO real');
console.log('✓ Documento (Aviso de privacidad) trae contenido real');

const changelog = await callRpc('v2_public_centro_tanner_changelog', { club_key: CLUB_KEY });
assert.ok(changelog.some((c) => c.versionLabel === 'v1.1'), 'El changelog debe incluir v1.1 (pagos no acumulables)');
console.log('✓ Changelog publicado');

let missingPolicyFailed = false;
try { await callRpc('v2_public_centro_tanner_policy', { club_key: CLUB_KEY, policy_slug: 'esto-no-existe' }); }
catch { missingPolicyFailed = true; }
assert.ok(missingPolicyFailed, 'Una política inexistente debe fallar, no regresar contenido inventado');
console.log('✓ Política inexistente responde con error, no contenido falso');

console.log('Centro Tanner QA OK');
