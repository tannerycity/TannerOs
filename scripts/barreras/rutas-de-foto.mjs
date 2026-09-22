// Las rutas de foto se arman en un solo lugar
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// v2_set_player_photo valida el nombre del archivo y rechaza con "Invalid
// photo path" DESPUES de que la foto ya se subio. La pantalla de
// mantenimiento armaba el nombre a mano, le metia un "-opt<sello>" en medio y
// rompia el patron: diez fotos, 27.8 MB descargados, cero guardadas.
//
// Por eso el nombre se arma en v2/foto-rutas.js y no en la pantalla.
// El patron vive en la base y se repite en el cliente para poder probarlo.
// Si la base lo cambia y el cliente no, las fotos se suben y se rechazan.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  const fotosApp = fs.readFileSync('v2/admin/fotos/app.js','utf8');
  if (/`\$\{[^`]*\}-opt\$\{/.test(fotosApp))
    errors.push('/admin/fotos/: vuelve a armar el nombre con "-opt", que la base rechaza');
  for (const pieza of ['rutaDeOriginal','rutaDeMiniatura','rutaValida'])
    if (!fotosApp.includes(pieza))
      errors.push(`/admin/fotos/: ya no usa ${pieza}; el nombre del archivo tiene que salir de foto-rutas.js`);

  const fotoRutas = fs.readFileSync('v2/foto-rutas.js','utf8');
  for (const patron of ['^profile-[0-9]{10,16}\\.(jpg|jpeg|png|webp)$',
                        '^profile-[0-9]{10,16}-thumb\\.(jpg|jpeg|png|webp)$'])
    if (!fotoRutas.includes(patron))
      errors.push(`foto-rutas.js: el patron ya no coincide con el de v2_set_player_photo (${patron})`);

  return errors;
}
