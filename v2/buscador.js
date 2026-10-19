// El motor del buscador universal.
//
// Todo aquí es función pura sobre un índice ya armado: quién arma ese índice
// vive en buscador-fuentes.js, y quién lo pinta, en shell.js. Separado así
// porque el ranking es lo que decide si el buscador sirve, y es lo único que
// se puede probar sin navegador.
//
// El defecto que esto reemplaza: un `includes()` sobre "nombre + meta" juntos,
// sin orden ni tipo. Buscar a una mamá devolvía el nombre del hijo como título,
// sin decir por qué aparecía, así que parecía que no la había encontrado.

export const TIPOS = {
  accion:       { etiqueta: 'Acciones',       orden: 0, icono: 'plus' },
  tanner:       { etiqueta: 'Tanners',        orden: 1, icono: 'player' },
  tutor:        { etiqueta: 'Papás y tutores', orden: 2, icono: 'family' },
  prospecto:    { etiqueta: 'Prospectos',     orden: 3, icono: 'search' },
  utileria:     { etiqueta: 'Utilería',       orden: 4, icono: 'box' },
  patrocinador: { etiqueta: 'Patrocinadores', orden: 5, icono: 'tag' },
  usuario:      { etiqueta: 'Personas del club', orden: 6, icono: 'user' },
  modulo:       { etiqueta: 'Ir a',           orden: 7, icono: 'arrow' },
};

// Memo: el mismo nombre se normaliza en cada tecla; con miles de filas eso
// era la mitad del tiempo de una búsqueda.
const MEMO = new Map(), MEMO_MAX = 50000;
const memo = (mapa, llave, fn) => {
  let v = mapa.get(llave);
  if (v === undefined) { if (mapa.size > MEMO_MAX) mapa.clear(); v = fn(); mapa.set(llave, v); }
  return v;
};
export function normaliza(texto) {
  const crudo = String(texto ?? '');
  return memo(MEMO, crudo, () => crudo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
}
const INICIOS = new Map(), PALABRAS = new Map();
const inicioDePalabra = (termino) => memo(INICIOS, termino, () => new RegExp(`(^|[\\s·,.\\-/])${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
const palabrasDe = (t) => memo(PALABRAS, t, () => t.split(/[\s·,.\-/()#]+/).filter(Boolean));

// Un número escrito por alguien que busca un teléfono.
//
// Se exigen 4 dígitos porque con menos no discrimina: casi todo el club es de
// León, así que "477" hacía match con TODOS y llenaba la lista de ruido. Quien
// busca un teléfono trae los últimos dígitos o el número completo, no la lada.
export const MIN_DIGITOS_TELEFONO = 4;

// Los teléfonos llegan como +52 477…, 477…, o 521 477…: se comparan los
// últimos 10 dígitos de cada uno, nunca todos pegados (antes "+52 477 174
// 8014" no encontraba a quien lo tenía guardado sin lada).
export function telefonosDe(texto) {
  return String(texto ?? '').split(/[,;/]|\s(?=\+)/)
    .map((t) => t.replace(/\D/g, '')).filter((d) => d.length >= 7)
    .map((d) => (d.length > 10 ? d.slice(-10) : d));
}
const digitosDeConsulta = (q) => { const d = String(q ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

// Distancia de edición (con transposición): "rodirgo" está a 1 de "rodrigo".
// Se corta en cuanto pasa del máximo, así que cuesta casi nada.
export function distancia(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < minFila) minFila = v;
    }
    if (minFila > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[n];
}
// Cuántos errores de dedo se perdonan según lo largo de la palabra: con
// palabras cortas un error ya es otra palabra ("ana" / "ama").
export const toleranciaPara = (termino) => (termino.length >= 8 ? 2 : termino.length >= 4 ? 1 : 0);

export function esBusquedaDeTelefono(q) {
  const digitos = String(q ?? '').replace(/\D/g, '');
  return digitos.length >= MIN_DIGITOS_TELEFONO && /^[\d\s+()-]+$/.test(String(q ?? '').trim());
}

// Puntaje de un término contra un texto. Más alto es mejor; 0 es no coincide.
//
// La escala imita a Spotlight: lo que empieza igual gana a lo que solo contiene.
// Escribir "ro" debe traer primero a Rodrigo, no a Mauro.
function puntuaTexto(texto, termino) {
  const t = normaliza(texto);
  if (!t || !termino) return 0;
  if (t === termino) return 100;
  if (t.startsWith(termino)) return 90;
  // Inicio de cualquier palabra: encuentra "Torres" en "Rodrigo Torres Anda".
  if (inicioDePalabra(termino).test(t)) return 80;
  if (t.includes(termino)) return 55;
  // Error de dedo: "rodirgo" → Rodrigo, "gianlcua" → Gianluca. Vale menos que
  // cualquier coincidencia exacta, así que nunca le gana a lo bien escrito.
  const tol = toleranciaPara(termino);
  if (tol) {
    for (const palabra of palabrasDe(t)) {
      if (distancia(palabra, termino, tol) <= tol) return 40;
      // Lo que va escribiendo, con un error: "rodri" → "rodrigo".
      if (termino.length >= 5 && palabra.length > termino.length && distancia(palabra.slice(0, termino.length), termino, 1) <= 1) return 35;
    }
  }
  return 0;
}

// Puntaje de una fila del índice contra la consulta completa.
//
// Cada término tiene que coincidir en algo (nombre, subtítulo o palabras
// clave); si uno no coincide, la fila se descarta. Así "rodrigo torres"
// no trae a todos los Rodrigos.
export function puntuaFila(fila, q) {
  const terminos = normaliza(q).split(/\s+/).filter(Boolean);
  if (!terminos.length) return 0;

  const buscandoTelefono = esBusquedaDeTelefono(q);
  const digitosQ = digitosDeConsulta(q);

  let total = 0;
  for (const termino of terminos) {
    const enNombre = puntuaTexto(fila.titulo, termino);
    const enSub    = puntuaTexto(fila.subtitulo, termino) * 0.6;
    const enClaves = Math.max(0, ...(fila.claves || []).map((k) => puntuaTexto(k, termino))) * 0.5;

    // El teléfono solo entra en juego cuando la consulta es un número de
    // verdad. Si no, "8" (un dorsal) pescaría cualquier teléfono que lo tenga.
    let enTelefono = 0;
    if (buscandoTelefono && fila.telefono) {
      for (const d of telefonosDe(fila.telefono)) {
        if (d.includes(digitosQ)) enTelefono = Math.max(enTelefono, d.endsWith(digitosQ) ? 85 : 50);
      }
    }

    const mejor = Math.max(enNombre, enSub, enClaves, enTelefono);
    if (!mejor) return 0;          // un término sin coincidencia descarta la fila
    total += mejor;
  }
  // Promedio, para que una consulta larga no gane sola por acumulación.
  return total / terminos.length;
}

export function ordenaFilas(a, b) {
  if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
  const oa = TIPOS[a.tipo]?.orden ?? 99, ob = TIPOS[b.tipo]?.orden ?? 99;
  if (oa !== ob) return oa - ob;
  return normaliza(a.titulo).localeCompare(normaliza(b.titulo));
}

export const MAX_POR_SECCION = 5;
export const MAX_TOTAL = 20;

// El resultado que la UI pinta: un "mejor resultado" arriba y el resto
// agrupado por tipo, como Spotlight.
// Con una sola letra todo coincide y la lista es ruido; un número sí vale
// (un dorsal).
export const MIN_LETRAS = 2;
export function esConsultaCorta(q) {
  const c = normaliza(q);
  return !!c && c.length < MIN_LETRAS && !/\d/.test(c);
}

export function busca(indice, q, { maxPorSeccion = MAX_POR_SECCION, maxTotal = MAX_TOTAL } = {}) {
  const consulta = String(q ?? '').trim();
  if (!consulta) return { mejor: null, secciones: [], total: 0 };
  if (esConsultaCorta(consulta)) return { mejor: null, secciones: [], total: 0, corta: true };

  const conPuntaje = [];
  for (const fila of indice || []) {
    const puntaje = puntuaFila(fila, consulta);
    if (puntaje > 0) conPuntaje.push({ ...fila, puntaje });
  }
  conPuntaje.sort(ordenaFilas);

  const mejor = conPuntaje.length ? conPuntaje[0] : null;
  // El mejor resultado no se repite abajo: ya está hasta arriba.
  const resto = conPuntaje.slice(1, maxTotal);

  const porTipo = new Map();
  for (const fila of resto) {
    if (!porTipo.has(fila.tipo)) porTipo.set(fila.tipo, []);
    const lista = porTipo.get(fila.tipo);
    if (lista.length < maxPorSeccion) lista.push(fila);
  }

  const secciones = [...porTipo.entries()]
    .map(([tipo, filas]) => ({ tipo, etiqueta: TIPOS[tipo]?.etiqueta || tipo, filas }))
    .sort((a, b) => (TIPOS[a.tipo]?.orden ?? 99) - (TIPOS[b.tipo]?.orden ?? 99));

  return { mejor, secciones, total: conPuntaje.length };
}

// Las filas en el orden en que se ven, para que las flechas del teclado
// recorran exactamente lo que está en pantalla.
export function filasEnOrden(resultado) {
  const filas = [];
  if (resultado?.mejor) filas.push(resultado.mejor);
  for (const seccion of resultado?.secciones || []) filas.push(...seccion.filas);
  return filas;
}

// Lo último que la persona abrió desde el buscador, sin repetidos y con lo
// más reciente primero. Se guarda la fila, no lo que tecleó.
export const MAX_RECIENTES = 5;
export function agregaReciente(lista, fila, max = MAX_RECIENTES) {
  if (!fila || !fila.titulo || !fila.href) return (lista || []).slice(0, max);
  const nueva = { tipo: fila.tipo, titulo: fila.titulo, subtitulo: fila.subtitulo || '', href: fila.href };
  return [nueva, ...(lista || []).filter((r) => !(r.href === nueva.href && r.titulo === nueva.titulo))].slice(0, max);
}
export const llaveDeRecientes = (organizationId, userId) => `${PREFIJO_CACHE}recientes:${organizationId || 'sin-org'}:${userId || 'sin-usuario'}`;

// Parte el título para que la UI resalte lo que la persona escribió, sin
// inyectar HTML: devuelve trozos y quién va resaltado.
export function trozosResaltados(texto, q) {
  const original = String(texto ?? '');
  const terminos = [...new Set(normaliza(q).split(/\s+/).filter(Boolean))];
  if (!terminos.length) return [{ texto: original, resaltado: false }];

  const plano = normaliza(original);
  const marcas = new Array(original.length).fill(false);
  for (const termino of terminos) {
    let desde = 0;
    for (;;) {
      const i = plano.indexOf(termino, desde);
      if (i < 0) break;
      for (let k = i; k < i + termino.length && k < marcas.length; k++) marcas[k] = true;
      desde = i + termino.length;
    }
  }
  const trozos = [];
  let actual = '';
  let estado = marcas[0] || false;
  for (let i = 0; i < original.length; i++) {
    if ((marcas[i] || false) !== estado) { trozos.push({ texto: actual, resaltado: estado }); actual = ''; estado = marcas[i] || false; }
    actual += original[i];
  }
  if (actual) trozos.push({ texto: actual, resaltado: estado });
  return trozos;
}

// ── Caché del índice ───────────────────────────────────────────────────────
//
// Medido contra los datos reales del club, armar el índice cuesta 136 kB, y de
// esos 106 kB son los prospectos (74 filas con todas sus columnas). Pedirlo en
// cada pantalla tiraría por la borda lo que se ahorró en la auditoría de
// egress, así que se guarda ya convertido —que pesa una fracción— y se reusa
// mientras dure la pestaña.
//
// sessionStorage y no localStorage a propósito: el índice trae nombres y
// teléfonos de familias del club. Al cerrar la pestaña se va, y no queda
// rastro en un equipo compartido como la iPad de la banca.

// LA LLAVE ES DE LA PERSONA, NO DEL CLUB (auditoría 19/10/2026). Antes era
// sólo del club y "Salir" no la borraba: en la iPad de la banca, un profe que
// entraba después de Presidencia en la misma pestaña recibía el índice de
// Presidencia (teléfonos de familias, prospectos, patrocinadores) durante 10
// minutos. Ahora la llave lleva el usuario, el paquete dice de quién es y se
// borra al salir. La versión subió para que ningún caché viejo se reuse.
export const CACHE_VERSION = 2;
export const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutos
export const PREFIJO_CACHE = 'tos:buscador:';

export function llaveDeCache(organizationId, userId) {
  return `${PREFIJO_CACHE}v${CACHE_VERSION}:${organizationId || 'sin-org'}:${userId || 'sin-usuario'}`;
}

export function cacheVigente(guardado, ahora = Date.now(), dueno = null) {
  if (!guardado || typeof guardado !== 'object') return false;
  if (guardado.version !== CACHE_VERSION) return false;
  // Sin dueño no se reusa: un caché que no sabe de quién es no se le da a nadie.
  if (!dueno || guardado.dueno !== dueno) return false;
  if (!Array.isArray(guardado.filas) || !guardado.filas.length) return false;
  const edad = ahora - Number(guardado.guardadoEn || 0);
  return edad >= 0 && edad < CACHE_TTL_MS;
}

// `caidas` viaja con el índice a propósito: si una fuente no respondió al
// armarlo, el aviso tiene que sobrevivir al caché. Si no, la primera búsqueda
// avisa y las siguientes —servidas de sessionStorage— se callan.
export function empaquetaCache(filas, ahora = Date.now(), caidas = [], dueno = null) {
  return { version: CACHE_VERSION, guardadoEn: ahora, dueno, filas, caidas };
}

// Al salir se va todo lo del buscador, de cualquier versión, club o persona.
export function borraCacheDelBuscador(storage) {
  try {
    const s = storage || globalThis.sessionStorage;
    if (!s) return 0;
    const llaves = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIJO_CACHE)) llaves.push(k); }
    llaves.forEach((k) => s.removeItem(k));
    return llaves.length;
  } catch (_) { return 0; }   // modo privado: no hay nada que borrar
}
