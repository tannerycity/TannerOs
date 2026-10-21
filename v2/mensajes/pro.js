// Mensajería pro (h20, 19/10/2026): las reglas que no dependen de la pantalla.
// Viven aparte para probarlas sin navegador (scripts/qa-mensajes-pro.mjs).

// Lo mismo que acepta la política de Storage (private.chat_storage_can_upload):
// si se agrega una extensión aquí, se agrega allá.
export const EXTENSIONES = ['jpg','jpeg','png','webp','gif','heic','pdf','doc','docx','xls','xlsx','csv','txt','mp4','mov'];
export const MAX_ARCHIVO = 15 * 1024 * 1024;
export const MINUTOS_PARA_EDITAR = 15;
export const CARPETA_CHAT = 'chat';

const MIME_EXT = { 'image/jpeg':'jpg', 'image/png':'png', 'image/gif':'gif', 'image/heic':'heic',
  'application/pdf':'pdf', 'text/plain':'txt', 'text/csv':'csv', 'video/mp4':'mp4', 'video/quicktime':'mov' };

export function extensionDe(nombre, mime) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ''));
  const ext = m ? m[1].toLowerCase() : MIME_EXT[mime] || '';
  return EXTENSIONES.includes(ext) ? ext : null;
}

// Por qué no se puede mandar un archivo, o null si sí se puede.
export function problemaConArchivo(archivo) {
  if (!archivo) return 'Elige un archivo.';
  if (!extensionDe(archivo.name, archivo.type)) return 'Ese tipo de archivo no se puede mandar. Usa foto, PDF, Word, Excel o video.';
  if (archivo.size > MAX_ARCHIVO) return 'El archivo pesa más de 15 MB.';
  return null;
}

export function rutaDeArchivo(org, hilo, id, ext) {
  return `organizations/${org}/${CARPETA_CHAT}/${hilo}/${id}.${ext}`;
}

export function pesoLegible(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

// ¿Se puede editar todavía? Sólo lo propio, vivo y dentro de 15 minutos.
export function puedeEditar(m, ahora = Date.now()) {
  if (!m || !m.mine || m.deleted || m.estado || !m.id) return false;
  return ahora - new Date(m.at).getTime() < MINUTOS_PARA_EDITAR * 60e3;
}

/* ---------- @menciones ---------- */
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Si el cursor está justo después de "@algo", qué se está buscando.
export function mencionEnCurso(texto, cursor) {
  const antes = String(texto || '').slice(0, cursor);
  const m = /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u.exec(antes);
  return m ? { inicio: antes.length - m[2].length - 1, q: m[2] } : null;
}

export function candidatosDeMencion(miembros, q, yo) {
  const b = sinAcentos(q);
  return (miembros || []).filter(p => p.userId !== yo && (!b || sinAcentos(p.name).split(/\s+/).some(w => w.startsWith(b))))
    .filter((p, i, a) => a.findIndex(x => x.userId === p.userId) === i).slice(0, 6);
}

// Cambia "@bra" por "@Brandon Ruiz " y deja el cursor después.
export function insertaMencion(texto, cursor, nombre) {
  const en = mencionEnCurso(texto, cursor);
  if (!en) return { texto, cursor };
  const nuevo = `${texto.slice(0, en.inicio)}@${nombre} ${texto.slice(cursor)}`;
  return { texto: nuevo, cursor: en.inicio + nombre.length + 2 };
}

// A quién se menciona de verdad: "@Nombre Completo" tal como quedó escrito.
export function mencionados(texto, miembros, yo) {
  const t = sinAcentos(texto);
  return [...new Set((miembros || []).filter(p => p.userId !== yo && p.name && t.includes('@' + sinAcentos(p.name))).map(p => p.userId))];
}

// Resalta "@Nombre" en un texto que YA viene escapado.
export function resaltaMenciones(html, nombres) {
  // Una sola pasada, el nombre más largo primero: "Ana Sofía" no se vuelve a
  // resaltar como "Ana" adentro de su propia marca.
  const alternativas = [...new Set(nombres || [])].filter(Boolean).sort((a, b) => b.length - a.length)
    .map(n => n.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!alternativas.length) return html;
  return html.replace(new RegExp(`@(?:${alternativas.join('|')})`, 'g'), m => `<b class="ms-mention">${m}</b>`);
}

/* ---------- Respuestas rápidas ---------- */
// "/gra" al inicio de la caja → busca respuestas que empiecen así.
export function atajoEnCurso(texto) {
  const m = /^\/([a-z0-9_-]{0,24})$/i.exec(String(texto || ''));
  return m ? m[1].toLowerCase() : null;
}
export function filtraRapidas(lista, q) {
  const b = String(q || '').toLowerCase();
  return (lista || []).filter(r => !b || r.shortcut.startsWith(b) || sinAcentos(r.body).includes(sinAcentos(b))).slice(0, 8);
}
export function atajoValido(s) { return /^[a-z0-9_-]{1,24}$/.test(String(s || '').trim().toLowerCase().replace(/^\//, '')); }

// Las que se ofrecen cuando alguien todavía no tiene ninguna guardada.
export const RAPIDAS_SUGERIDAS = [
  { shortcut: 'enterado', body: 'Enterado, gracias.' },
  { shortcut: 'reviso', body: 'Lo reviso y te confirmo hoy.' },
  { shortcut: 'listo', body: 'Listo, ya quedó.' },
  { shortcut: 'llamame', body: '¿Me puedes marcar cuando tengas un minuto?' }
];

/* ---------- Silenciar ---------- */
export const SILENCIOS = [
  { clave: '8h', label: '8 horas', ms: 8 * 3600e3 },
  { clave: '1s', label: '1 semana', ms: 7 * 864e5 },
  { clave: 'siempre', label: 'Siempre', ms: null }
];
export function silencioHasta(clave, ahora = Date.now()) {
  const s = SILENCIOS.find(x => x.clave === clave);
  if (!s) return null;
  return s.ms == null ? '9999-12-31T00:00:00Z' : new Date(ahora + s.ms).toISOString();
}

/* ---------- Programar avisos ---------- */
// datetime-local en hora del celular → ISO. Entre 5 minutos y 60 días.
export function validaProgramado(valor, ahora = Date.now()) {
  if (!valor) return { error: 'Elige el día y la hora.' };
  const t = new Date(valor).getTime();
  if (!Number.isFinite(t)) return { error: 'Esa fecha no es válida.' };
  if (t < ahora + 5 * 60e3) return { error: 'Prográmalo al menos 5 minutos adelante.' };
  if (t > ahora + 60 * 864e5) return { error: 'Se puede programar hasta 60 días antes.' };
  return { iso: new Date(t).toISOString() };
}
export function valorLocal(fecha) {
  const d = new Date(fecha), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Una huella del hilo: si cambia (editado, borrado, fijado), se repinta.
export function huellaDelHilo(d) {
  const ms = d?.messages || [];
  return [ms.length, ms.at(-1)?.id, d?.thread?.pinned?.id || '', d?.thread?.mutedUntil || '',
    ms.map(m => `${m.editedAt || ''}${m.deleted ? 'x' : ''}`).join('')].join('|');
}
