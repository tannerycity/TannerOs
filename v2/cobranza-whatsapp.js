// El botón de cobrar por WhatsApp, y por qué a veces no se puede.
//
// Lo que había antes: la lista de vencidos armaba un enlace a wa.me con
// `telefono.replace(/\D/g,'')` y, si no había teléfono, el botón simplemente
// **desaparecía**. Dos problemas, los dos medidos el 22 de septiembre de 2026
// sobre los 31 Tanners con saldo vencido:
//
//   22  teléfono completo, con lada de país   → el botón servía
//    5  sin ningún teléfono                   → el botón se esfumaba sin decir nada
//    4  teléfono de 10 dígitos, sin lada      → se abría wa.me/4776996600
//
// El tercer caso es el grave. Un número sin lada de país no es «incompleto»
// para WhatsApp: es **otro número**. Mandarle a un desconocido el nombre de un
// niño y cuánto debe su familia no es un detalle cosmético.
//
// De dónde sale la lada: del WhatsApp que el club ya tiene configurado. El club
// y sus familias están en el mismo país, y los números nacionales miden lo
// mismo, así que la diferencia de largo entre uno y otro ES la lada. Con el
// club en 524792651338 (12) y una tutora en 4776996600 (10), la lada es 52.
//
// Cuando no alcanza para estar seguros, NO se adivina: se dice qué falta.

export const LADA_MAX = 4;

// Devuelve la lada del país deduciéndola del número del club, o null si no se
// puede deducir con confianza.
export function ladaDelClub(whatsappDelClub, digitosLocales) {
  const club = String(whatsappDelClub || '').replace(/\D/g, '');
  const local = Number(digitosLocales) || 0;
  if (!club || !local) return null;
  const largo = club.length - local;
  if (largo < 1 || largo > LADA_MAX) return null;
  return club.slice(0, largo);
}

// `estado` manda: 'ok' trae número para marcar, los otros dos explican qué falta.
export function preparaCobro(telefonoCrudo, whatsappDelClub) {
  const crudo = String(telefonoCrudo || '').trim();
  if (!crudo) return { estado: 'sin_telefono', numero: null };

  const digitos = crudo.replace(/\D/g, '');
  if (!digitos) return { estado: 'sin_telefono', numero: null };

  // Con `+` el número ya viene completo: es lo que capturó quien lo dio de alta.
  if (crudo.startsWith('+')) {
    return digitos.length >= 8 && digitos.length <= 15
      ? { estado: 'ok', numero: digitos }
      : { estado: 'sin_lada', numero: null, local: digitos };
  }

  const lada = ladaDelClub(whatsappDelClub, digitos.length);
  if (!lada) return { estado: 'sin_lada', numero: null, local: digitos };
  return { estado: 'ok', numero: lada + digitos };
}

// El mensaje lleva el nombre del club, no uno escrito a mano: esto va a correr
// en más de un club.
export function mensajeDeCobro({ club, tanner, monto, desde }) {
  const nombreClub = String(club || '').trim() || 'el club';
  const quien = String(tanner || '').trim() || 'su hijo';
  const partes = [`Hola, le recordamos el pago pendiente de ${quien} en ${nombreClub}`];
  if (monto) partes.push(` por ${monto}`);
  if (desde) partes.push(` (desde ${desde})`);
  return partes.join('') + '. ¡Gracias!';
}

export function ligaDeCobro({ numero, club, tanner, monto, desde }) {
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeDeCobro({ club, tanner, monto, desde }))}`;
}

// Para el aviso de arriba de la lista: qué le falta al club, no a una familia.
export function faltaConfigurarElClub(whatsappDelClub, cobros) {
  const club = String(whatsappDelClub || '').replace(/\D/g, '');
  const necesitanLada = (cobros || []).some(c => c && c.estado === 'sin_lada');
  if (!club && necesitanLada) return 'sin_whatsapp_del_club';
  if (club && necesitanLada) return 'lada_no_deducible';
  return null;
}
