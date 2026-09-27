/* La hoja de producción, como la arma el club de verdad.

   El proveedor no produce "pedidos": produce MODELOS. Por eso la hoja que
   Tannery City usa hoy en Excel tiene una pestaña por jersey, con la imagen
   del modelo al lado y un renglón por persona: nombre, número, la talla de
   la playera y la del short. Esto arma exactamente eso a partir de las piezas
   del corte.

   Sin DOM y sin llamadas: son datos que entran y datos que salen, para poder
   probarlo sin abrir un navegador. */

/* Qué es cada pieza.

   La categoría viene del catálogo, pero en la base conviven DOS convenciones,
   porque los productos migrados del sistema viejo traen la suya y los nuevos
   la de ahora. Medido en producción, un mismo pedido puede traer:

     Jersey "Black" Edition            cat='Jersey / Playera'   (vieja)
     Jersey "Wet Blue" - Home Edition  cat='jersey'             (nueva)
     Short                             cat='shorts'
     Par de calcetas                   cat='socks'

   Así que no se compara contra una lista cerrada: se normaliza quitando
   acentos y signos, y se busca la palabra. Un producto capturado suelto viene
   sin categoría y cae en 'otra', que la hoja trata como pieza aparte en vez
   de meterla a fuerza en una columna que no le toca. */
const SIN_ACENTOS = /[̀-ͯ]/g;
export function normaliza(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(SIN_ACENTOS, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function tipoDePieza(categoria) {
  const c = normaliza(categoria);
  if (!c) return 'otra';
  if (/\bjersey\b|\bplayera\b|\buniforme\b|\bconjunto\b/.test(c)) return 'jersey';
  if (/\bshort\b|\bshorts\b/.test(c)) return 'short';
  if (/\bsock\b|\bsocks\b|\bcalceta\b|\bcalcetas\b/.test(c)) return 'calcetas';
  return 'otra';
}

/* El nombre del modelo.

   Es lo que encabeza cada tabla. Se prefiere el nombre del catálogo sobre la
   descripción congelada del renglón: la descripción se guardó como estaba el
   día del pedido y puede traer un nombre que el club ya cambió. Si el renglón
   no trae producto ligado, la descripción es lo único que hay. */
export function nombreDeModelo(pieza) {
  return String(pieza?.productName || pieza?.description || 'Sin producto').trim();
}

/* Quién es el dueño de la pieza, dentro de un kit.

   Un kit trae la playera, el short y las calcetas de una misma persona. Para
   armar el renglón del Excel —con sus dos columnas de talla— hay que saber
   qué short le toca a qué playera.

   El número es la llave más confiable: el short viaja SIN nombre (medido en
   el corte del club), pero sí con dorsal. El nombre entra como segunda
   opción, para el short de quien no lleva número. */
function duenoEnKit(p) {
  const num = String(p.numero || '').trim();
  if (num) return `#${num}`;
  const nom = normaliza(p.nombrePers);
  if (nom) return `n:${nom}`;
  return null; // Sin dueño: es del kit entero, no de una persona.
}

/* Agrupa las piezas de un corte en tablas por modelo.

   La forma de la hoja la manda el proveedor: produce MODELOS, no pedidos. Así
   que cada playera abre su tabla y arrastra consigo el short y las calcetas
   de su mismo kit; una pieza suelta abre la suya.

   Devuelve [{ modelo, kitName, piezas, renglones:[{nombre,numero,tallaJersey,
   tallaShort,producto,comentarios,cantidad}] }], ordenado por modelo. */
export function hojaPorModelo(items = []) {
  const piezas = Array.isArray(items) ? items : [];

  /* Primero los acompañantes: short y calcetas que viven dentro de un kit.
     No encabezan tabla —el proveedor no produce "shorts sueltos" cuando van
     en kit—, así que se guardan para colgárselos al renglón de su playera. */
  const acompanantes = new Map(); // kitKey -> { porDueno:Map, delKit:[] }
  for (const p of piezas) {
    if (!p.kitKey || tipoDePieza(p.categoria) === 'jersey') continue;
    if (!acompanantes.has(p.kitKey)) acompanantes.set(p.kitKey, { porDueno: new Map(), delKit: [] });
    const bolsa = acompanantes.get(p.kitKey);
    const dueno = duenoEnKit(p);
    if (dueno) {
      if (!bolsa.porDueno.has(dueno)) bolsa.porDueno.set(dueno, []);
      bolsa.porDueno.get(dueno).push(p);
    } else {
      // Sin dueño: acompaña a todos los renglones de ese kit.
      bolsa.delKit.push(p);
    }
  }

  const modelos = new Map();
  for (const p of piezas) {
    const tipo = tipoDePieza(p.categoria);
    // Un acompañante de kit ya se contó arriba: no abre tabla ni renglón.
    if (p.kitKey && tipo !== 'jersey') continue;

    const nombre = nombreDeModelo(p);
    if (!modelos.has(nombre)) modelos.set(nombre, { modelo: nombre, kitName: p.kitName || null, _filas: new Map(), piezas: 0 });
    const grupo = modelos.get(nombre);
    if (p.kitName && !grupo.kitName) grupo.kitName = p.kitName;

    const llave = p.kitKey ? `kit:${p.kitKey}|${duenoEnKit(p) || 'unico'}` : `pieza:${p.itemId}`;
    if (!grupo._filas.has(llave)) {
      grupo._filas.set(llave, {
        nombre: p.nombrePers || null, numero: p.numero || null,
        tallaJersey: null, tallaShort: null,
        producto: nombre, comentarios: [], cantidad: 0
      });
    }
    const fila = grupo._filas.get(llave);
    if (!fila.nombre && p.nombrePers) fila.nombre = p.nombrePers;
    if (!fila.numero && p.numero) fila.numero = p.numero;
    fila.cantidad += Number(p.quantity || 1);
    grupo.piezas += Number(p.quantity || 1);

    if (tipo === 'jersey') fila.tallaJersey = p.talla || fila.tallaJersey;
    else if (tipo === 'short') fila.tallaShort = p.talla || fila.tallaShort;
    else if (p.talla) fila.comentarios.push(`${nombre} ${p.talla}`);
    if (p.obs) fila.comentarios.push(p.obs);
    if (p.tipo) fila.comentarios.push(p.tipo);

    // Y ahora lo que venía con él en el kit.
    if (p.kitKey && acompanantes.has(p.kitKey)) {
      const bolsa = acompanantes.get(p.kitKey);
      const dueno = duenoEnKit(p);
      const suyos = [...(dueno ? bolsa.porDueno.get(dueno) || [] : []), ...bolsa.delKit];
      for (const a of suyos) {
        const t = tipoDePieza(a.categoria);
        const nom = nombreDeModelo(a);
        // Cuenta también aquí: si no, el encabezado diría "1 pieza" encima de
        // un resumen que lista la playera Y el short, y el papel se
        // contradice solo.
        grupo.piezas += Number(a.quantity || 1);
        if (t === 'short') fila.tallaShort = a.talla || fila.tallaShort;
        // Calcetas y demás no tienen columna: se dicen en comentarios, que es
        // donde el club las anota hoy junto a cosas como "Manga larga".
        else fila.comentarios.push(a.talla ? `${nom} ${a.talla}` : nom);
        if (a.obs) fila.comentarios.push(a.obs);
        if (!fila.numero && a.numero) fila.numero = a.numero;
      }
    }
  }

  return [...modelos.values()]
    .map(g => ({
      modelo: g.modelo, kitName: g.kitName, piezas: g.piezas,
      renglones: [...g._filas.values()].map(f => ({
        ...f,
        // Sin duplicados: un kit de cuatro playeras repetiría "Par de
        // calcetas" cuatro veces y el proveedor leería basura.
        comentarios: [...new Set(f.comentarios)].join(' · ') || null
      }))
    }))
    .sort((a, b) => a.modelo.localeCompare(b.modelo, 'es'));
}

/* El renglón, ya como texto para el papel. El "—" es del formato, no del
   dato: quien lea la hoja tiene que ver la casilla vacía, no un hueco. */
export function filaDeHoja(fila, indice) {
  return {
    id: String(indice + 1),
    nombre: fila.nombre || '—',
    numero: fila.numero ? String(fila.numero) : '—',
    tallaJersey: fila.tallaJersey || '—',
    tallaShort: fila.tallaShort || '—',
    producto: fila.producto || '—',
    comentarios: fila.comentarios || '',
    status: ''
  };
}

export const COLUMNAS_HOJA = [
  { clave: 'id',          titulo: 'ID',          ancho: 26 },
  { clave: 'nombre',      titulo: 'NOMBRE',      ancho: 108 },
  { clave: 'numero',      titulo: 'NÚMERO',      ancho: 52 },
  { clave: 'tallaJersey', titulo: 'TALLA PLAYERA', ancho: 62 },
  { clave: 'tallaShort',  titulo: 'TALLA SHORT',   ancho: 56 },
  { clave: 'producto',    titulo: 'PRODUCTO',    ancho: 150 },
  { clave: 'comentarios', titulo: 'COMENTARIOS', ancho: 112 },
  { clave: 'status',      titulo: 'STATUS',      ancho: 60 }
];

/* Cuántas piezas cortar de cada talla, por modelo. Es el resumen que el
   maquilador mira primero: no le importa de quién es cada una, le importa
   cuántas cortar. */
export function resumenDeTallas(grupo) {
  const cuenta = new Map();
  for (const f of grupo.renglones) {
    for (const [tipo, talla] of [['playera', f.tallaJersey], ['short', f.tallaShort]]) {
      if (!talla) continue;
      const k = `${tipo} ${talla}`;
      cuenta.set(k, (cuenta.get(k) || 0) + (f.cantidad || 1));
    }
  }
  return [...cuenta.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }));
}

export function nombreDeArchivoHoja(folio) {
  return `hoja-de-produccion-${String(folio || 'corte').replace(/[^\w-]+/g, '-')}.pdf`;
}
