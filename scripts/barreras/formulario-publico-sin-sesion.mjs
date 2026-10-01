// El formulario público entra SIEMPRE como visitante anónimo
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// public-form.js vive en el mismo dominio que TannerOS. Con el cliente por
// defecto, si en ese navegador habia una sesion de staff, el registro se
// mandaba COMO esa persona. El 01/10/2026 alguien de Marketing lleno el
// registro de Damian con su sesion abierta: el registro paso, la foto no
// ("new row violates row-level security policy"), porque el candado del
// bucket deja subir fotos de registro a visitantes anonimos, no a cualquier
// usuario. El Tanner nacio sin foto.
//
// La cura es no persistir sesion en ese cliente. Si alguien la quita, truena.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  const src = fs.readFileSync('public-form.js', 'utf8');
  const llamadas = src.match(/createClient\([^;]*\);/g) || [];
  if (!llamadas.length) errors.push('Formulario publico: no se encontro su createClient');
  for (const l of llamadas) {
    if (!/persistSession\s*:\s*false/.test(l))
      errors.push('Formulario publico: su cliente de Supabase no tiene persistSession:false. '
        + 'Con una sesion de staff abierta en el navegador, la foto del registro se sube como esa persona y el bucket la rechaza');
  }
  return errors;
}
