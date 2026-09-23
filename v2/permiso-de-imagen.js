// ¿Este niño puede salir en la publicidad del club?
//
// Vive fuera de cualquier módulo porque la pregunta se hace en varios: en el
// expediente, en el administrador de fotos, en el portal de la familia y en la
// lista que se le imprime a quien maneja redes. Si cada pantalla la contestara
// por su cuenta, tarde o temprano una diría que sí y otra que no.
//
// LA REGLA ES LA MISMA QUE EN LA BASE (private.estado_de_imagen). Aquí se
// repite para poder pintar sin ir al servidor, pero no se inventa: el servidor
// ya manda `image_consent_status` y ése gana siempre.
//
// SON TRES RESPUESTAS, NO DOS. Medido el 23 de septiembre sobre 63 Tanners
// activos: 5 autorizan, 3 dijeron que no, y 55 nunca fueron preguntados (43 de
// ésos ya tienen foto cargada). Las dos últimas prohíben publicar igual, pero
// sólo la tercera es trabajo pendiente: al que dijo que no no se le vuelve a
// preguntar; a los 55 hay que pedirles la firma.

export const IMAGEN = {
  autoriza: {
    etiqueta: 'Puede salir en publicidad',
    corto: 'Puede salir',
    icono: '✓',
    nivel: 'ok',
    publicable: true,
    queHacer: null
  },
  no_autoriza: {
    etiqueta: 'No autoriza su imagen',
    corto: 'No autoriza',
    icono: '⦸',
    nivel: 'bajo',
    publicable: false,
    queHacer: 'La familia ya decidió que no. No se le vuelve a preguntar.'
  },
  sin_preguntar: {
    etiqueta: 'Falta pedir la firma',
    corto: 'Falta firma',
    icono: '!',
    nivel: 'atencion',
    publicable: false,
    queHacer: 'Nadie le ha preguntado. Hasta que firme, tampoco se publica.'
  }
};

const texto = v => String(v ?? '').trim();

export function estadoDeImagen(p) {
  // Lo que manda el servidor gana: ahí vive la regla original.
  const directo = p?.image_consent_status ?? p?.imageConsentStatus;
  if (directo && IMAGEN[directo]) return { clave: directo, ...IMAGEN[directo] };

  // Sin ese campo se deduce con los datos crudos, con la MISMA escalera que
  // private.estado_de_imagen: primero el sí, luego el rastro de que se
  // preguntó (firmó una versión del aviso, o quedó el consentimiento de datos,
  // que en el formulario público va obligatorio junto a la casilla de imagen).
  const autoriza = p?.image_consent ?? p?.imageConsent;
  const datos = p?.data_consent ?? p?.dataConsent;
  const aviso = p?.privacy_notice_version ?? p?.privacyNoticeVersion;
  const clave = autoriza ? 'autoriza'
    : (texto(aviso) || datos) ? 'no_autoriza'
    : 'sin_preguntar';
  return { clave, ...IMAGEN[clave] };
}

// La única pregunta que importa antes de subir algo a redes.
export function puedePublicarse(p) {
  return estadoDeImagen(p).publicable;
}

// Para el candado sobre la foto: texto corto, y el color SIEMPRE acompañado de
// ícono y palabras. Quien revisa un collage de miniaturas no debe tener que
// distinguir un borde rojo de uno ámbar para saber a quién no puede subir.
export function candadoDeFoto(p) {
  const e = estadoDeImagen(p);
  if (e.publicable) return null;
  return { clave: e.clave, icono: e.icono, corto: e.corto, etiqueta: e.etiqueta, nivel: e.nivel };
}

export function cuentaDeImagen(lista) {
  const c = { total: 0, autoriza: 0, no_autoriza: 0, sin_preguntar: 0, noPublicables: 0, noPublicablesConFoto: 0 };
  for (const p of lista || []) {
    c.total++;
    const e = estadoDeImagen(p);
    c[e.clave]++;
    if (!e.publicable) {
      c.noPublicables++;
      if (p?.photo_path ?? p?.photoPath) c.noPublicablesConFoto++;
    }
  }
  return c;
}

// Ordenados como se trabajan: primero los que ya dijeron que no (nunca se
// tocan), luego los que faltan de firmar (ésos sí se persiguen).
export function noPublicables(lista) {
  return (lista || [])
    .filter(p => !puedePublicarse(p))
    .sort((a, b) => {
      const ea = estadoDeImagen(a).clave, eb = estadoDeImagen(b).clave;
      if (ea !== eb) return ea === 'no_autoriza' ? -1 : 1;
      return String(a?.first_name || a?.name || '').localeCompare(String(b?.first_name || b?.name || ''), 'es');
    });
}

/* ===== La lista que se le da a quien maneja redes =====
   Esa persona no tiene —ni debe tener— acceso a Jugadores. Necesita la lista
   en papel o en PDF, y necesita que diga los nombres completos: una lista de
   "no publicables" sin nombres no sirve para nada. */

export const COLUMNAS_NO_PUBLICABLES = [
  { clave: 'name', titulo: 'Tanner', ancho: 210 },
  { clave: 'categoria', titulo: 'Categoría', ancho: 120 },
  { clave: 'motivo', titulo: 'Situación', ancho: 170 },
  { clave: 'foto', titulo: 'Foto en el sistema', ancho: 100 }
];

export function filaDeNoPublicable(p) {
  const e = estadoDeImagen(p);
  return {
    name: texto([p?.first_name, p?.last_name].filter(Boolean).join(' ')) || texto(p?.name) || 'Tanner',
    categoria: texto(p?.category) || texto(p?.categoryName) || '—',
    motivo: e.etiqueta,
    foto: (p?.photo_path ?? p?.photoPath) ? 'Sí' : 'No'
  };
}

export function nombreDeArchivoNoPublicables(hoy) {
  const d = texto(hoy) || new Date().toISOString().slice(0, 10);
  return `no-publicables-${d.replace(/[^0-9-]/g, '') || 'hoy'}.pdf`;
}
