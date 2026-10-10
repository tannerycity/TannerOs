/* Importar jugadores desde Excel.
   1. La lista (pegada o archivo) -> 2. qué es cada columna -> 3. revisión
   del servidor sin guardar (v2_import_players con dry_run) -> 4. importar.
   La lectura vive en leer.js; el .xlsx se lee con SheetJS, que sólo se baja
   si alguien sube un Excel. */
import { bootstrapProtectedShell, rpc, $, moduleAccess, setShellHealth } from '/v2/shell.js';
import { CAMPOS, leeTabla, detectaColumnas, pareceEncabezado, filasParaImportar, PLANTILLA } from '/v2/jugadores/importar/leer.js';

const boot = await bootstrapProtectedShell({ active: 'jugadores', title: 'Importar jugadores' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERRORES = { 'Not authorized': 'Tu cuenta no puede dar de alta jugadores.', 'Máximo 500 jugadores por archivo': 'Son más de 500 jugadores: divide la lista en dos archivos.' };
const amable = e => ERRORES[e?.message] || e?.message || 'No se pudo completar.';
function msg(id, t = '', tipo = 'error') { const e = $(id); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

if (!moduleAccess(navigation, 'jugadores', true)) {
  $('imDenied').classList.remove('hidden');
} else {
  $('im').classList.remove('hidden');
}

// Estado del asistente.
let tabla = [], conEncabezado = true, mapa = {}, filas = [], revision = null;

function paso(n) {
  [1, 2, 3, 4].forEach(i => $(`imPaso${i}`).classList.toggle('hidden', i !== n));
  document.querySelectorAll('.im-pasos li').forEach(li => li.classList.toggle('activo', Number(li.dataset.paso) === n));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('imPlantilla').href = URL.createObjectURL(new Blob(['﻿' + PLANTILLA], { type: 'text/csv;charset=utf-8' }));

async function leeArchivo(archivo) {
  if (/\.(xlsx|xls)$/i.test(archivo.name)) {
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    // raw: las fechas llegan como número de serie y leer.js las convierte;
    // así no dependemos del formato de fecha del Excel (día/mes o mes/día).
    return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' })
      .map(f => f.map(c => String(c ?? '').trim())).filter(f => f.some(Boolean));
  }
  return leeTabla(await archivo.text());
}

function cargaTabla(t) {
  tabla = t;
  if (tabla.length < 1) throw new Error('No encontramos filas en tu lista.');
  conEncabezado = pareceEncabezado(tabla[0]);
  mapa = conEncabezado ? detectaColumnas(tabla[0]) : {};
  pintaMapa();
  paso(2);
}

$('imArchivo').addEventListener('change', async e => {
  const f = e.target.files?.[0]; if (!f) return;
  msg('imMsg1');
  try { cargaTabla(await leeArchivo(f)); }
  catch (err) { msg('imMsg1', err?.message?.includes('import') ? 'No pudimos abrir el Excel. Guárdalo como CSV o copia y pega las celdas.' : amable(err)); }
  e.target.value = '';
});
$('imLeer').addEventListener('click', () => {
  msg('imMsg1');
  const t = leeTabla($('imPegar').value);
  if (!t.length) { msg('imMsg1', 'Pega tu lista o sube un archivo.'); return; }
  try { cargaTabla(t); } catch (err) { msg('imMsg1', amable(err)); }
});

function columnas() {
  const ancho = Math.max(...tabla.map(f => f.length));
  return Array.from({ length: ancho }, (_, i) => conEncabezado ? (tabla[0][i] || `Columna ${i + 1}`) : `Columna ${i + 1}`);
}
function datos() { return conEncabezado ? tabla.slice(1) : tabla; }

function pintaMapa() {
  const cols = columnas();
  const visibles = CAMPOS.filter(c => c.campo !== 'lastName2' || mapa.lastName2 != null);
  $('imMapa').innerHTML = `<label class="im-check"><input type="checkbox" id="imEncabezado"${conEncabezado ? ' checked' : ''}> La primera fila son los encabezados</label>`
    + visibles.map(c => `<label class="im-campo"><span>${esc(c.etiqueta)}</span><select data-campo="${c.campo}"><option value="">No viene</option>${cols.map((h, i) => `<option value="${i}"${mapa[c.campo] === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('');
  $('imMapa').querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    if (s.value === '') delete mapa[s.dataset.campo]; else mapa[s.dataset.campo] = Number(s.value);
    pintaMuestra();
  }));
  $('imEncabezado').addEventListener('change', e => { conEncabezado = e.target.checked; mapa = conEncabezado ? detectaColumnas(tabla[0]) : mapa; pintaMapa(); });
  pintaMuestra();
}

function pintaMuestra() {
  filas = filasParaImportar(datos(), mapa);
  const muestra = filas.slice(0, 3);
  $('imMuestra').innerHTML = `<p class="im-muted">${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}. Así se leen las primeras:</p>`
    + muestra.map(f => `<div class="im-mini"><strong>${esc([f.firstName, f.lastName].filter(Boolean).join(' ') || 'Sin nombre')}</strong><span>${esc([f.birthDate, f.category, f.guardianName, f.phone].filter(Boolean).join(' · '))}</span></div>`).join('');
}

$('imAtras2').addEventListener('click', () => paso(1));
$('imRevisar').addEventListener('click', async () => {
  msg('imMsg2');
  if (mapa.firstName == null && mapa.nombreCompleto == null) { msg('imMsg2', 'Dinos cuál columna trae el nombre del jugador.'); return; }
  if (!filas.length) { msg('imMsg2', 'No hay filas para importar.'); return; }
  const b = $('imRevisar'); b.disabled = true; b.textContent = 'Revisando…';
  try {
    revision = await rpc('v2_import_players', { organization_id: ctx.organization_id, rows: filas, dry_run: true });
    pintaRevision(); paso(3);
  } catch (err) { msg('imMsg2', amable(err)); }
  finally { b.disabled = false; b.textContent = 'Revisar'; }
});

const ESTADO = { nuevo: ['Entra', 'ok'], duplicado: ['Ya existe', 'dup'], error: ['No entra', 'mal'] };
function pintaRevision() {
  const r = revision.resumen;
  const v = (n, uno, varios) => `<b>${n}</b> ${n === 1 ? uno : varios}`;
  $('imResumen').innerHTML = `<span class="im-chip ok">${v(r.nuevos, 'entra', 'entran')}</span>`
    + (r.conAvisos ? `<span class="im-chip aviso">${v(r.conAvisos, 'con algo por completar', 'con algo por completar')}</span>` : '')
    + (r.duplicados ? `<span class="im-chip dup">${v(r.duplicados, 'ya existe', 'ya existen')}</span>` : '')
    + (r.errores ? `<span class="im-chip mal">${v(r.errores, 'no entra', 'no entran')}</span>` : '');
  const orden = { error: 0, duplicado: 1, nuevo: 2 };
  const lista = [...revision.filas].sort((a, b) => orden[a.estado] - orden[b.estado] || (b.avisos?.length || 0) - (a.avisos?.length || 0));
  $('imFilas').innerHTML = lista.map(f => {
    const [txt, tono] = ESTADO[f.estado] || ['', ''];
    const notas = [f.motivo, ...(f.avisos || [])].filter(Boolean);
    return `<div class="im-fila im-${tono}"><span class="im-num">${Number(f.fila)}</span><div><strong>${esc(f.nombre || 'Sin nombre')}</strong>${f.categoria ? `<small>${esc(f.categoria)}</small>` : ''}${notas.length ? `<ul>${notas.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div><em>${txt}</em></div>`;
  }).join('');
  $('imGuardar').disabled = !r.nuevos;
  $('imGuardar').textContent = r.nuevos ? `Importar ${r.nuevos} ${r.nuevos === 1 ? 'jugador' : 'jugadores'}` : 'Nada que importar';
}

$('imAtras3').addEventListener('click', () => paso(2));
$('imGuardar').addEventListener('click', async () => {
  msg('imMsg3');
  const b = $('imGuardar'); b.disabled = true; b.textContent = 'Importando…';
  try {
    const hecho = await rpc('v2_import_players', { organization_id: ctx.organization_id, rows: filas, dry_run: false });
    const r = hecho.resumen;
    $('imListoTitulo').textContent = `${r.nuevos} ${r.nuevos === 1 ? 'jugador nuevo' : 'jugadores nuevos'} en el club`;
    $('imListoTexto').textContent = [
      r.conAvisos ? `${r.conAvisos === 1 ? '1 quedó' : `${r.conAvisos} quedaron`} con algo por completar (fecha, tutor o cuota): lo ves en su ficha.` : '',
      r.duplicados ? (r.duplicados === 1 ? '1 ya existía y no se tocó.' : `${r.duplicados} ya existían y no se tocaron.`) : '',
      r.errores ? (r.errores === 1 ? '1 no entró.' : `${r.errores} no entraron.`) : ''
    ].filter(Boolean).join(' ') || 'Todos entraron completos.';
    setShellHealth({ state: 'ok', label: `${r.nuevos} importados` });
    paso(4);
  } catch (err) { msg('imMsg3', amable(err)); b.disabled = false; pintaRevision(); }
});
$('imOtra').addEventListener('click', () => { $('imPegar').value = ''; tabla = []; filas = []; revision = null; paso(1); });
