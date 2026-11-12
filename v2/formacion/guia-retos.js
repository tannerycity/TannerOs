/* Guía oficial de los 9 Retos y los 4 mundos Baby (12/11/2026).
 *
 * Lo que el Formador ve al tocar la "i": qué le digo al niño, el error más
 * común, cómo lo ayudo y cómo sé que aprendió. El contenido deportivo es de
 * Dirección Deportiva y va tal cual lo entregó; aquí no se inventa nada.
 *
 * Los ejercicios se nombran como están en el Banco Tanner: quien pinta la guía
 * muestra solo los que de verdad existen en el catálogo del club.
 *
 * Dirección puede sobrescribir la guía de un concepto en attrs.guia.
 */

// Trazos de los íconos (Lucide 1.72, licencia ISC), en línea: la app no carga nada de fuera.
export const ICONOS_RETO = {
  balon: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>',
  '1v1': '<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>',
  jugar_juntos: '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  cancha: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/>',
  ventaja: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  avanzar: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  gol: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  defender: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  reaccionar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  // Baby
  movimiento: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  juego: '<path d="M12 13V2l8 4-8 4"/><path d="M20.561 10.222a9 9 0 1 1-12.55-5.29"/><path d="M8.002 9.997a5 5 0 1 0 8.9 2.02"/>',
  convivencia: '<path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"/>'
};

export const GUIA_RETOS = {
  balon: {
    subtitulo: 'Domina la pelota',
    digo: 'Haz que la pelota vaya donde tú quieres.',
    error: 'Se le escapa la pelota porque todavía no la controla.',
    ayudo: 'Toques más suaves. Levanta la cabeza y vuelve a intentar.',
    aprendio: 'Lleva, para y pasa la pelota con mayor control.',
    ejercicios: ['Balón Vivo', 'Protege el Tesoro', '¿Por dónde salgo?']
  },
  '1v1': {
    subtitulo: 'Supera al rival',
    digo: '¡Atrévete! Mira al rival, engáñalo y pasa.',
    error: 'Corre directo contra el rival o se detiene demasiado lejos.',
    ayudo: 'Acércate con control, haz una finta y arranca cuando veas espacio.',
    aprendio: 'Supera al rival y continúa jugando.',
    ejercicios: ['Engaña y Sal', 'Cruza la Línea', 'Dos Salidas'],
    detalle: {
      titulo: 'Cómo encarar',
      puntos: [
        ['Mira', 'Observa cómo está parado el rival.'],
        ['Acércate', 'Llega con control y sin regalar la pelota.'],
        ['Engaña', 'Mueve tu cuerpo o pelota para provocar una reacción.'],
        ['Arranca', 'Cuando aparece el espacio, cambia de ritmo.']
      ],
      nota: 'No hay una sola finta correcta: cada Tanner encuentra la suya.'
    }
  },
  jugar_juntos: {
    subtitulo: 'Ayuda al equipo',
    digo: '¡Ayuda al que tiene la pelota! Dale una opción.',
    error: 'Se queda parado o todos se acercan a la pelota.',
    ayudo: 'Sepárate, encuentra espacio y muévete para ayudar.',
    aprendio: 'Ofrece ayuda y encuentra compañeros libres durante el juego.',
    ejercicios: ['Pasa y Muévete', '2v1 Encuentra al Libre', 'Tercer Hombre']
  },
  cancha: {
    subtitulo: 'Encuentra espacio',
    digo: '¡Mira a tu alrededor! Encuentra el espacio.',
    error: 'Solo mira la pelota y no observa qué ocurre alrededor.',
    ayudo: 'Levanta la cabeza y mira dónde puedes ayudar.',
    aprendio: 'Encuentra espacios y se mueve para participar mejor.',
    ejercicios: ['Mira Antes', 'Espalda o Pies', 'Hombre Libre']
  },
  ventaja: {
    subtitulo: 'Crea oportunidades',
    digo: '¡Busca cómo poner la jugada a nuestro favor!',
    error: 'Juega sin reconocer si existe una opción mejor.',
    ayudo: 'Mira al rival. Atráelo si puedes y busca al compañero libre.',
    aprendio: 'Ayuda a crear o aprovechar una oportunidad mejor.',
    ejercicios: ['Atrae y Suelta', '2v1 Fija al Defensa', '3v2 ¿Dónde Sobramos?']
  },
  avanzar: {
    subtitulo: 'Busca el camino',
    digo: '¡Busquemos el camino al gol!',
    error: 'Se queda donde está o avanza directo contra los rivales.',
    ayudo: 'Mira el espacio. Conduce, pasa o cambia de camino.',
    aprendio: 'Supera rivales o líneas y se acerca al gol.',
    ejercicios: ['Rompe la Línea', 'Supera al Guardián', 'Dos Caminos']
  },
  gol: {
    subtitulo: '¡Ve por el gol!',
    digo: '¡Ve a buscar el gol!',
    error: 'Tarda en rematar o no mira la portería.',
    ayudo: 'Mira el gol, prepara tu cuerpo y elige cómo rematar.',
    aprendio: 'Busca el remate cuando tiene oportunidad y sigue los rebotes.',
    ejercicios: ['Todas las Formas de Gol', 'Ve a Buscar el Gol', 'El Gol Sigue Vivo'],
    detalle: {
      titulo: 'Formas de rematar',
      puntos: [
        ['Interior', 'Busco colocar la pelota.'],
        ['Empeine', 'Busco un golpeo firme.'],
        ['Exterior', 'Utilizo otra superficie del pie.'],
        ['De primera', 'Remato sin controlar antes.'],
        ['Después de controlar', 'Acomodo y remato.'],
        ['En movimiento', 'Remato mientras avanzo.'],
        ['Ambas piernas', 'Practico con derecha e izquierda.'],
        ['Volea', 'Remato una pelota que viene por el aire.'],
        ['Cabeza', 'Conozco la técnica básica progresivamente y de manera apropiada a mi etapa, siguiendo los protocolos de seguridad vigentes.'],
        ['Rebote', 'Reacciono y vuelvo a buscar el gol.']
      ]
    }
  },
  defender: {
    subtitulo: 'Protege y recupera',
    digo: '¡Protege tu portería! Acércate y recupera.',
    error: 'Se lanza por la pelota y el rival lo supera.',
    ayudo: 'Acércate, frena, mira al rival y espera el momento.',
    aprendio: 'Dificulta el avance, protege y recupera cuando puede.',
    ejercicios: ['Perfil y Camino', 'No Pasas', '2v2 Salgo o Cubro']
  },
  reaccionar: {
    subtitulo: '¡Siguiente jugada!',
    digo: 'Si la pierdes, defiende. Si la ganas, ataca.',
    error: 'Se queda parado cuando cambia quién tiene la pelota.',
    ayudo: '¡Siguiente jugada! Mira qué pasó y actúa rápido.',
    aprendio: 'Cambia de atacar a defender o de defender a atacar sin quedarse parado.',
    ejercicios: ['Cambia el Chip', 'Perdí, Recupero', '¿Ataco o Aseguro?']
  }
};

// Baby Tanners no usa los 9 Retos: descubre el fútbol jugando, en cuatro mundos.
export const GUIA_BABY = {
  movimiento: {
    subtitulo: 'Aprendo a moverme',
    buscamos: 'Aprendo a correr, frenar, saltar y mover mi cuerpo.',
    pasos: ['Corro', 'Freno', 'Cambio de camino'],
    juegos: ['Semáforo', 'Carreras de animales', 'Congelados'],
    digo: '¡Corre! ¡Alto! ¡Ahora vamos para otro lado!',
    aprendio: 'Se mueve, frena y cambia de dirección jugando.'
  },
  balon: {
    subtitulo: 'Juego con mi pelota',
    buscamos: 'Aprendo a llevar mi pelota y hacer que vaya donde quiero.',
    pasos: ['Llevo mi pelota', 'La paro', 'La pateo'],
    juegos: ['La pelota a su casa', 'Derribar conos', 'Escapar con la pelota'],
    digo: '¡Lleva tu pelota a casa! ¡Que no se escape!',
    aprendio: 'Lleva, para y patea su pelota con más confianza.'
  },
  juego: {
    subtitulo: 'Juego y busco el gol',
    buscamos: 'Aprendo a jugar fútbol, buscar la portería y hacer goles.',
    pasos: ['Busco la pelota', 'Voy hacia el gol', 'Intento meterla'],
    juegos: ['Robar tesoros', 'Cruzar puertas', 'Partiditos pequeños'],
    digo: '¡Busca la portería! ¡Ve por el gol!',
    aprendio: 'Participa, intenta jugar y busca hacer gol.'
  },
  convivencia: {
    subtitulo: 'Juego con mis amigos',
    buscamos: 'Aprendo a jugar con mis amigos, ayudar y respetar.',
    pasos: ['Escucho', 'Comparto', 'Ayudo'],
    juegos: ['Juegos por parejas', 'Misiones en equipo', 'Recoger materiales juntos'],
    digo: '¡Jugamos juntos! ¡Ayudamos a nuestros amigos!',
    aprendio: 'Comparte, respeta y participa con sus compañeros.'
  }
};

export const LEMA_RETOS = 'Primero lo entiende el niño. Después lo nombra el adulto.';

const textos = v => (Array.isArray(v) ? v : []).map(String).filter(x => x.trim());

/* La guía de un concepto del catálogo: la base oficial y, encima, lo que
   Dirección haya escrito en attrs.guia. Devuelve null si no hay nada que decir
   (un concepto que no es Reto ni mundo, o un código que el club no tiene). */
export function guiaDeReto(concepto) {
  if (!concepto) return null;
  const baby = concepto.kind === 'mundo_baby';
  if (!baby && concepto.kind !== 'reto') return null;
  const base = (baby ? GUIA_BABY : GUIA_RETOS)[concepto.code];
  const propia = concepto.attrs?.guia && typeof concepto.attrs.guia === 'object' ? concepto.attrs.guia : null;
  if (!base && !propia) return null;
  const g = { ...(base || {}), ...(propia || {}) };
  return {
    tipo: baby ? 'baby' : 'reto',
    subtitulo: String(g.subtitulo || ''),
    digo: String(g.digo || ''),
    aprendio: String(g.aprendio || ''),
    ...(baby
      ? { buscamos: String(g.buscamos || ''), pasos: textos(g.pasos).slice(0, 3), juegos: textos(g.juegos).slice(0, 3) }
      : { error: String(g.error || ''), ayudo: String(g.ayudo || ''), ejercicios: textos(g.ejercicios).slice(0, 3), detalle: g.detalle?.puntos?.length ? g.detalle : null })
  };
}

/* De los ejercicios que nombra la guía, los que sí están en el Banco del club
   (mismo banco, mismo Reto). Nunca se muestra un ejercicio que no exista. */
export function ejerciciosDelBanco(nombres = [], tareas = [], reto = '') {
  const llave = s => String(s || '').trim().toLocaleLowerCase('es-MX');
  return nombres.map(n => tareas.find(t => t.bank !== 'baby' && (!reto || t.primary === reto) && llave(t.name) === llave(n))).filter(Boolean);
}
