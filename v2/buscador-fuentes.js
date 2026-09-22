// De dónde sale lo que el buscador encuentra.
//
// Nada aquí consulta la base por su cuenta: recibe lo que devuelven las RPC
// que ya existen y las convierte en filas con la misma forma. Por eso el
// buscador no necesitó migración — todo lo que muestra ya estaba expuesto, y
// cada RPC sigue validando permisos por su cuenta, así que un profe solo
// indexa lo que un profe puede ver.
//
// La forma de una fila:
//   { tipo, titulo, subtitulo, href, telefono?, claves? }
//
// `claves` son palabras por las que también se debe encontrar algo sin que
// ensucien el subtítulo: la categoría de un artículo, el apodo de un módulo.

const nombre = (...partes) => partes.map((p) => String(p ?? '').trim()).filter(Boolean).join(' ');

// Tanners y, por separado, sus papás.
//
// Éste es el arreglo central. v2_search_index mete a los tutores dentro del
// renglón del hijo, así que buscar "Mayra" devolvía "Rodrigo Torres Anda" y
// nada decía por qué. Quien busca a una mamá quiere ver a la mamá.
export function desdeTanners(indice) {
  const filas = [];
  for (const p of indice || []) {
    const tanner = String(p?.name || '').trim();
    if (!tanner) continue;
    const href = '/jugadores/?player=' + p.id;
    filas.push({
      tipo: 'tanner',
      titulo: tanner,
      subtitulo: [p.jersey ? '#' + p.jersey : '', p.pos || ''].filter(Boolean).join(' · ') || 'Tanner',
      href,
      telefono: p.phones || '',
    });
    // Un renglón por tutor, con su propio nombre como título.
    for (const tutor of String(p?.guardians || '').split(',').map((g) => g.trim()).filter(Boolean)) {
      filas.push({
        tipo: 'tutor',
        titulo: tutor,
        subtitulo: `Familia de ${tanner}`,
        href,
        telefono: p.phones || '',
        claves: [tanner],   // también se llega al papá buscando al hijo
      });
    }
  }
  return filas;
}

export function desdeUtileria(items) {
  return (items || []).filter((i) => i && i.name).map((i) => ({
    tipo: 'utileria',
    titulo: i.name,
    subtitulo: [i.category, i.location, `${Number(i.quantity || 0)} en total`]
      .filter(Boolean).join(' · '),
    href: '/utileria/',
    claves: [i.category, i.sku].filter(Boolean),
  }));
}

export function desdeProspectos(prospectos) {
  return (prospectos || []).map((p) => {
    const titulo = nombre(p.first_name, p.last_name) || p.name;
    if (!titulo) return null;
    return {
      tipo: 'prospecto',
      titulo,
      subtitulo: ['Prospecto', p.category || '', p.status || ''].filter(Boolean).join(' · '),
      href: '/prospectos/',
      telefono: p.phone || p.guardian_phone || '',
    };
  }).filter(Boolean);
}

export function desdePatrocinadores(sponsors) {
  return (sponsors || []).filter((s) => s && (s.name || s.brand)).map((s) => ({
    tipo: 'patrocinador',
    titulo: s.name || s.brand,
    subtitulo: ['Patrocinador', s.tier || s.status || ''].filter(Boolean).join(' · '),
    href: '/patrocinadores/',
    telefono: s.phone || '',
  }));
}

export function desdeUsuarios(usuarios) {
  return (usuarios || []).filter((u) => u && (u.display_name || u.name)).map((u) => ({
    tipo: 'usuario',
    titulo: u.display_name || u.name,
    subtitulo: [u.role || 'Del club', u.active === false ? 'inactivo' : ''].filter(Boolean).join(' · '),
    href: '/usuarios/',
    telefono: u.phone || '',
  }));
}

export function desdeModulos(navItems) {
  return (navItems || []).map((m) => ({
    tipo: 'modulo',
    titulo: m.label,
    subtitulo: 'Abrir la pantalla',
    href: m.href,
    claves: [m.code].filter(Boolean),
  }));
}

// Qué pedir, según lo que la persona puede ver. Cada entrada nombra su RPC, el
// permiso que la habilita y cómo se convierte.
//
// El orden importa poco para el ranking, pero sí para el egress: son cuatro
// llamadas en paralelo, una sola vez, y solo si el buscador se usa.
export const FUENTES = [
  { rpc: 'v2_search_index',    modulo: null,        convierte: desdeTanners },
  { rpc: 'v2_equipment_items', modulo: 'utileria',  convierte: desdeUtileria },
  { rpc: 'v2_prospects',       modulo: 'prospectos', convierte: desdeProspectos },
  { rpc: 'v2_sponsors',        modulo: 'patrocinadores', convierte: desdePatrocinadores },
];

// Une todo y quita repetidos. Un mismo nombre puede llegar por dos caminos
// (un prospecto que ya es Tanner, un papá que además es usuario del club);
// gana el primero, y las fuentes vienen ordenadas de más a menos específica.
export function armaIndice(partes) {
  const vistos = new Set();
  const filas = [];
  for (const parte of partes || []) {
    for (const fila of parte || []) {
      if (!fila || !fila.titulo) continue;
      const llave = `${fila.tipo}|${fila.titulo}|${fila.href}`;
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      filas.push(fila);
    }
  }
  return filas;
}
