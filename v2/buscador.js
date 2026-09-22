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
  tanner:       { etiqueta: 'Tanners',        orden: 1, icono: 'player' },
  tutor:        { etiqueta: 'Papás y tutores', orden: 2, icono: 'family' },
  prospecto:    { etiqueta: 'Prospectos',     orden: 3, icono: 'search' },
  utileria:     { etiqueta: 'Utilería',       orden: 4, icono: 'box' },
  patrocinador: { etiqueta: 'Patrocinadores', orden: 5, icono: 'tag' },
  usuario:      { etiqueta: 'Personas del club', orden: 6, icono: 'user' },
  modulo:       { etiqueta: 'Ir a',           orden: 7, icono: 'arrow' },
};

export function normaliza(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

// Un número escrito por alguien que busca un teléfono.
//
// Se exigen 4 dígitos porque con menos no discrimina: casi todo el club es de
// León, así que "477" hacía match con TODOS y llenaba la lista de ruido. Quien
// busca un teléfono trae los últimos dígitos o el número completo, no la lada.
export const MIN_DIGITOS_TELEFONO = 4;

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
  if (new RegExp(`(^|[\\s·,.\\-/])${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 80;
  if (t.includes(termino)) return 55;
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
  const digitosQ = String(q ?? '').replace(/\D/g, '');

  let total = 0;
  for (const termino of terminos) {
    const enNombre = puntuaTexto(fila.titulo, termino);
    const enSub    = puntuaTexto(fila.subtitulo, termino) * 0.6;
    const enClaves = Math.max(0, ...(fila.claves || []).map((k) => puntuaTexto(k, termino))) * 0.5;

    // El teléfono solo entra en juego cuando la consulta es un número de
    // verdad. Si no, "8" (un dorsal) pescaría cualquier teléfono que lo tenga.
    let enTelefono = 0;
    if (buscandoTelefono && fila.telefono) {
      const d = String(fila.telefono).replace(/\D/g, '');
      if (d && d.includes(digitosQ)) enTelefono = d.endsWith(digitosQ) ? 85 : 50;
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
export function busca(indice, q, { maxPorSeccion = MAX_POR_SECCION, maxTotal = MAX_TOTAL } = {}) {
  const consulta = String(q ?? '').trim();
  if (!consulta) return { mejor: null, secciones: [], total: 0 };

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

export const CACHE_VERSION = 1;
export const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutos

export function llaveDeCache(organizationId) {
  return `tos:buscador:v${CACHE_VERSION}:${organizationId || 'sin-org'}`;
}

export function cacheVigente(guardado, ahora = Date.now()) {
  if (!guardado || typeof guardado !== 'object') return false;
  if (guardado.version !== CACHE_VERSION) return false;
  if (!Array.isArray(guardado.filas) || !guardado.filas.length) return false;
  const edad = ahora - Number(guardado.guardadoEn || 0);
  return edad >= 0 && edad < CACHE_TTL_MS;
}

export function empaquetaCache(filas, ahora = Date.now()) {
  return { version: CACHE_VERSION, guardadoEn: ahora, filas };
}
