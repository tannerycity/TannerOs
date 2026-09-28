/* La credencial Tanner: qué dice, y qué NO dice cuando se va a redes.
 *
 * Del mismo registro salen dos documentos con trabajos opuestos: la credencial
 * que ve el club —entre más datos útiles, mejor— y la tarjeta que comparte la
 * familia —entre menos, mejor, porque hablamos de menores y de Instagram—.
 *
 * Lo que este archivo vigila sobre todo es la segunda: que el folio, la fecha
 * exacta, la escuela y cualquier teléfono NO se cuelen a una imagen pública, y
 * que esa imagen no se genere sin el permiso de la familia.
 */
import {
  edadDe, edadTexto, pieTexto, renglonesDeCredencial,
  puedeCompartirse, motivoSinCompartir, datosParaRedes, ligaDeBusqueda, HOST_TANNEROS,
  valorReal, renglonesDeTanner, avisoMedico, ligaDeTanner
} from '../credencial.js';

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

const HOY = new Date('2026-09-28T12:00:00');

/* ===== Edad =====
   Es el dato que la ficha no traía aunque la fecha de nacimiento está
   capturada en el 100% de los Tanners. */
revisa('la edad sale de la fecha de nacimiento', edadDe('2018-03-14', HOY) === 8);
// Un niño que aún no cumple este año tiene un año menos. En categorías
// infantiles ese año es el jugador entero.
revisa('quien todavía no cumple este año tiene un año menos',
  edadDe('2018-12-31', HOY) === 7, String(edadDe('2018-12-31', HOY)));
revisa('quien cumple justo hoy ya los tiene', edadDe('2018-09-28', HOY) === 8);
revisa('y quien cumple mañana todavía no', edadDe('2018-09-29', HOY) === 7);
revisa('un Baby Tanner de dos años se dice en años', edadTexto('2024-01-10', HOY) === '2 años');
revisa('y uno de uno, en singular', edadTexto('2025-01-10', HOY) === '1 año');
// Basura entrando no produce una credencial con una edad imposible impresa.
revisa('sin fecha no se inventa una edad', edadDe(null, HOY) === null && edadDe('', HOY) === null);
revisa('una fecha inválida tampoco', edadDe('no-es-fecha', HOY) === null);
revisa('una fecha en el futuro no imprime una edad negativa',
  edadDe('2030-01-01', HOY) === null, String(edadDe('2030-01-01', HOY)));

/* ===== Pie dominante ===== */
revisa('el pie migrado en inglés se lee en español',
  pieTexto('right') === 'Derecho' && pieTexto('left') === 'Izquierdo');
revisa('y el que ya está en español también', pieTexto('Ambos') === 'Ambos');
revisa('un valor desconocido no se imprime', pieTexto('xyz') === null && pieTexto(null) === null);

/* ===== Los renglones de la credencial =====
   Un renglón con una raya ocupa el mismo lugar que uno con información y no
   sirve de nada: la credencial se lee de pie, con la familia enfrente. */
{
  const filas = renglonesDeCredencial({
    birthDate: '2018-03-14', category: 'T8', dominantFoot: 'right',
    school: 'Colegio Léon', hoy: HOY
  });
  revisa('la credencial completa trae sus tres renglones', filas.length === 3,
    JSON.stringify(filas.map(f => f.etiqueta)));
  // Se vio al renderizarla: "Categoría" salia dos veces en la misma cara.
  revisa('la categoría no se repite: ya sale junto al nombre',
    !filas.some(f => f.etiqueta === 'Categoría'), JSON.stringify(filas.map(f => f.etiqueta)));
  revisa('la edad va primero, que es lo que más se busca',
    filas[0].etiqueta === 'Edad' && filas[0].valor === '8 años', JSON.stringify(filas[0]));
  /* Quien acaba de registrarse es un PROSPECTO, no un Tanner: nadie le ha
     asignado dorsal, y el formulario publico ni siquiera lo pregunta. Una
     credencial que lo enseñara estaria inventando. */
  revisa('un recién registrado NO trae dorsal: todavía no tiene',
    !filas.some(f => f.etiqueta === 'Dorsal'), JSON.stringify(filas.map(f => f.etiqueta)));
  revisa('ni posición, por lo mismo',
    !filas.some(f => f.etiqueta === 'Posición'), JSON.stringify(filas.map(f => f.etiqueta)));
  // Y mandarlos no los cuela: el registro no los tiene de donde sacar.
  revisa('aunque alguien los mande, no se imprimen',
    renglonesDeCredencial({ birthDate: '2018-03-14', jerseyNumber: '7', position: 'Portero', hoy: HOY })
      .length === 1);
}
{
  // El caso real del registro: un Baby Tanner recién inscrito casi no trae nada.
  const filas = renglonesDeCredencial({ birthDate: '2024-05-02', category: 'Baby Tanner', hoy: HOY });
  revisa('un recién registrado no imprime renglones vacíos',
    filas.length === 1, JSON.stringify(filas));
  revisa('y el que sí tiene sale completo',
    filas[0].etiqueta === 'Edad' && filas[0].valor === '2 años', JSON.stringify(filas));
}
revisa('sin ningún dato la credencial no truena', renglonesDeCredencial().length === 0);

/* ===== EL CANDADO QUE ESTE ARCHIVO EXISTE PARA QUE NO SE ABRA =====

   La tarjeta para redes sólo existe si la familia autorizó el uso de la imagen
   del menor. Medido en producción el día que se escribió esto: de 64 Tanners
   activos, 5 autorizaron, 0 negaron y 59 nunca fueron preguntados —los
   migrados del sistema anterior—. */
revisa('con permiso, se puede compartir', puedeCompartirse({ imageConsent: true }));
revisa('sin permiso, NO', !puedeCompartirse({ imageConsent: false }));
// La lectura insegura sería tratar "no me consta" como permiso.
revisa('y "nunca se le preguntó" tampoco es permiso',
  !puedeCompartirse({ imageConsent: null }) && !puedeCompartirse({}));
revisa('un texto que parece sí no es un sí',
  !puedeCompartirse({ imageConsent: 'true' }) && !puedeCompartirse({ imageConsent: 1 }));
// Las dos razones llevan al mismo lado, pero se le dicen distinto a quien mira
// la pantalla: a uno hay que respetarlo, al otro hay que preguntarle.
revisa('a quien negó se le respeta, y se dice así',
  /no autorizó/.test(motivoSinCompartir({ imageConsent: false, imageConsentAt: '2026-09-01' })));
revisa('a quien nunca se le preguntó, se le pregunta',
  /Falta que la familia autorice/.test(motivoSinCompartir({ imageConsent: false })));
revisa('con permiso no hay motivo que mostrar', motivoSinCompartir({ imageConsent: true }) === null);

/* ===== Lo que NO viaja a redes =====
   Una historia de Instagram la ve cualquiera. Esto es de un menor. */
{
  const d = {
    firstName: 'Mauricio', lastName: 'Torres Avila', category: 'Baby Tanner',
    birthDate: '2024-05-02', folio: 'TC-2026-00020', school: 'Jardín Santa Fe',
    phone: '+524770000000', guardian: 'Ana Ávila', photoUrl: 'blob:x', hoy: HOY
  };
  const redes = datosParaRedes(d);
  const texto = JSON.stringify(redes);

  revisa('a redes va el nombre', redes.nombre === 'Mauricio Torres Avila');
  revisa('y la categoría, que es lo que se presume', redes.categoria === 'Baby Tanner');
  revisa('y la edad, que es parte del orgullo y no ubica a nadie', redes.edad === '2 años');

  revisa('el FOLIO no viaja a redes: es un número interno', !/TC-2026-00020/.test(texto), texto);
  revisa('la FECHA DE NACIMIENTO no viaja: ubica a un menor', !/2024-05-02/.test(texto), texto);
  revisa('la ESCUELA no viaja: dice dónde encontrarlo todos los días',
    !/Jardín Santa Fe/i.test(texto), texto);
  revisa('el TELÉFONO no viaja, en ningún caso', !/477|\+52/.test(texto), texto);
  revisa('el nombre del tutor tampoco', !/Ana Ávila/i.test(texto), texto);
  // Y sólo lo que se declaró: si mañana alguien agrega un campo al registro,
  // no se cuela solo a la imagen pública.
  revisa('a redes va exactamente lo declarado y nada más',
    Object.keys(redes).sort().join(',') === 'categoria,edad,fotoUrl,nombre',
    Object.keys(redes).join(','));
}

/* ===== El QR ===== */
revisa('el QR abre el buscador con el folio',
  ligaDeBusqueda('TC-2026-00020') === `${HOST_TANNEROS}/v2/?buscar=TC-2026-00020`,
  ligaDeBusqueda('TC-2026-00020'));
revisa('un folio con caracteres raros se escapa y no rompe la liga',
  ligaDeBusqueda('A B&C') === `${HOST_TANNEROS}/v2/?buscar=A%20B%26C`, ligaDeBusqueda('A B&C'));
revisa('sin folio no se imprime un QR que no lleva a ningún lado',
  ligaDeBusqueda('') === null && ligaDeBusqueda(null) === null);
revisa('la liga apunta al dominio del club, no a otro',
  ligaDeBusqueda('X').startsWith('https://app.tannerycity.com/'));


/* ===== LA CREDENCIAL DEL TANNER =====

   Otro documento, otro trabajo. La del registro es un comprobante de
   bienvenida para un prospecto; ésta sirve toda la temporada y la mira alguien
   en la puerta, en la banca, o el día que un niño se siente mal.

   Los casos de aquí abajo salieron de mirar la base de verdad, no de
   imaginarla. Los tres hallazgos que cambiaron el código: */

/* 1. UN RELLENO NO ES UN DATO.
      20 de 64 Tanners activos tienen 'Por definir' como posición. Es lo que el
      formulario deja cuando nadie eligió. Impreso ocupa un renglón para decir
      que no sabe, y encima hace creer que alguien lo capturó. */
revisa('"Por definir" no es una posición', valorReal('Por definir') === null);
revisa('"Sin definir" tampoco', valorReal('Sin definir') === null);
revisa('ni "N/A", ni una raya, ni puntos suspensivos',
  valorReal('N/A') === null && valorReal('---') === null && valorReal('...') === null);
revisa('pero una posición de verdad sí pasa', valorReal('Mediocampista') === 'Mediocampista');
revisa('y "Portero" no se confunde con relleno', valorReal('Portero') === 'Portero');
revisa('vacío es nada', valorReal('') === null && valorReal(null) === null);

/* 2. EL DORSAL NO SIEMPRE ES UN NÚMERO.
      En la base hay un Tanner con dorsal '20+1'. Se imprime tal cual, porque
      así lo conoce el club: "corregirlo" seria inventar. */
{
  const filas = renglonesDeTanner({ jerseyNumber: '20+1', hoy: HOY });
  revisa('un dorsal raro como "20+1" se imprime tal cual',
    filas.find(f => f.etiqueta === 'Dorsal')?.valor === '#20+1', JSON.stringify(filas));
}

/* 3. EL TEXTO DE ALERGIAS YA DICE "ALERGIAS".
      Capturado en la base: "Alergias a jarabe para gripa". Con la etiqueta
      encima quedaría "ALERGIAS · Alergias a jarabe para gripa". */
revisa('el aviso de alergias no tartamudea',
  avisoMedico({ allergies: 'Alergias a jarabe para gripa' }).valor === 'Jarabe para gripa',
  JSON.stringify(avisoMedico({ allergies: 'Alergias a jarabe para gripa' })));
revisa('y el que ya viene limpio se respeta',
  avisoMedico({ allergies: 'Sulfas' }).valor === 'Sulfas');
// Sólo 4 de 64 tienen alergias capturadas. Los otros 60 salen SIN aviso, que
// es lo correcto: un "sin alergias conocidas" donde nadie preguntó da una
// tranquilidad que el club no tiene con qué respaldar.
revisa('sin alergias capturadas NO se inventa un "ninguna"',
  avisoMedico({}) === null && avisoMedico({ allergies: '' }) === null);
revisa('y un relleno en alergias tampoco produce aviso',
  avisoMedico({ allergies: 'Ninguna' }) === null);

/* ===== Los renglones del Tanner ===== */
{
  const filas = renglonesDeTanner({
    birthDate: '2021-06-11', jerseyNumber: '5', position: 'Mediocampista',
    dominantFoot: 'right', school: 'Colegio Léon', bloodType: 'O+', hoy: HOY
  });
  revisa('un Tanner completo trae sus seis renglones', filas.length === 6,
    JSON.stringify(filas.map(f => f.etiqueta)));
  revisa('la edad va primero', filas[0].etiqueta === 'Edad');
  // El tipo de sangre es de los datos que importan el día que importan.
  revisa('y el tipo de sangre está', filas.some(f => f.etiqueta === 'Sangre' && f.valor === 'O+'));
}
{
  // El caso real de Tanner050: dorsal raro, posición de relleno, nada más.
  const filas = renglonesDeTanner({ birthDate: '2022-02-03', jerseyNumber: '20+1', position: 'Por definir', hoy: HOY });
  revisa('un Tanner a medio capturar sólo trae lo que tiene',
    filas.map(f => f.etiqueta).join(',') === 'Edad,Dorsal', JSON.stringify(filas));
}
revisa('un Tanner sin nada no imprime renglones', renglonesDeTanner().length === 0);

/* ===== El QR del Tanner ===== */
revisa('el QR del Tanner abre su código, que es como lo conoce el club',
  ligaDeTanner('Tanner010') === `${HOST_TANNEROS}/v2/?buscar=Tanner010`, ligaDeTanner('Tanner010'));
revisa('sin código no se imprime un QR que no lleva a ningún lado',
  ligaDeTanner('') === null && ligaDeTanner(null) === null);

/* ===== Y que los dos documentos NO se mezclen ===== */
// La del registro no puede traer dorsal (el prospecto no tiene) y la del
// Tanner no puede traer folio de registro (ya no es un prospecto).
revisa('la credencial del registro sigue sin dorsal, aunque se lo manden',
  !renglonesDeCredencial({ birthDate: '2018-01-01', jerseyNumber: '9', hoy: HOY })
    .some(f => f.etiqueta === 'Dorsal'));
revisa('y la del Tanner sí lo trae',
  renglonesDeTanner({ jerseyNumber: '9', hoy: HOY }).some(f => f.etiqueta === 'Dorsal'));

console.log(fallos
  ? `Credencial QA FAILED · ${fallos} de ${corridas}`
  : `Credencial QA OK · ${corridas} casos, incluidos el folio que no debe llegar a Instagram y el "Por definir" que no es una posición`);
process.exit(fallos ? 1 : 0);
