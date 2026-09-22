// Cómo se convierte lo que alguien escribe en "Usuario o correo" al correo real
// con el que Supabase autentica.
//
// El club tiene dos clases de cuenta. Las de staff y familias usan un correo
// interno inventado (brandon@staff.tanneros.invalid), así que basta con escribir
// el usuario. Las demás usan un correo de verdad —Gmail, iCloud, Hotmail— y para
// ésas el usuario NO sirve: hay que escribir el correo completo.
//
// El problema que esto arregla no era la conversión, que siempre estuvo bien,
// sino el mensaje cuando falla. Quien escribía "Presidencia" y su contraseña
// correcta recibía "contraseña incorrecta", porque lo que viajó al servidor fue
// presidencia@staff.tanneros.invalid, una cuenta que no existe. El mensaje
// mandaba a la persona a resetear una contraseña que nunca estuvo mal.

export const DOMINIO_INTERNO = '@staff.tanneros.invalid';

export function esCorreo(valor) {
  return String(valor || '').includes('@');
}

export function credencialACorreo(valor) {
  const credencial = String(valor || '').trim().toLowerCase();
  if (credencial.includes('@')) return credencial;
  return `${credencial.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')}${DOMINIO_INTERNO}`;
}

// Un usuario a secas y un correo completo fallan por razones distintas, y el
// mensaje tiene que decir cuál.
//
// A propósito NO distingue entre "ese usuario no existe" y "la contraseña está
// mal": el mismo texto sale en los dos casos. Si dijera cuál de los dos es,
// cualquiera podría sondear nombres desde la pantalla de entrada y averiguar
// quién tiene cuenta en el club.
export function mensajeDeCredencialRechazada(valor) {
  const credencial = String(valor || '').trim();
  if (esCorreo(credencial)) return 'Usuario, correo o contraseña incorrectos.';
  return `No pudimos entrar con el usuario «${credencial}». Revisa tu contraseña, y si tu cuenta usa un correo (Gmail, iCloud, Hotmail), escríbelo completo en vez del usuario.`;
}
