-- Textos base para que el club arranque. Se editan desde la base cuando
-- Presidencia quiera; al cambiar el texto hay que subir la version, si no las
-- firmas viejas seguirian cubriendo un texto que ya no dice lo mismo.
insert into app.consent_documents (organization_id, code, title, body, version, required, active)
select o.id, v.code, v.title, v.body, 1, v.required, true
from public.organizations o
cross join (values
  ('reglamento','Reglamento del club',
   E'Como familia Tanner me comprometo a:\n\n' ||
   E'• Llevar a mi hijo puntual a entrenamientos y partidos, y avisar al club cuando no pueda asistir.\n' ||
   E'• Respetar a profes, árbitros, compañeros y rivales, dentro y fuera de la cancha.\n' ||
   E'• Cubrir la mensualidad dentro de los primeros 5 días de cada mes.\n' ||
   E'• Cuidar el uniforme y las instalaciones del club.\n' ||
   E'• Apoyar la formación deportiva y humana de mi hijo, entendiendo que el resultado no está por encima del proceso.\n\n' ||
   E'Entiendo que el club puede dar de baja a un jugador por faltas graves de conducta de la familia o del jugador.',
   true),
  ('uso_de_imagen','Uso de fotos y video',
   E'Autorizo a Tannery City FC a tomar fotografías y video de mi hijo durante entrenamientos, partidos y eventos del club, y a usarlos para:\n\n' ||
   E'• Redes sociales y página del club.\n' ||
   E'• Material de promoción y convocatorias.\n' ||
   E'• Reconocimientos, memorias y contenido deportivo.\n\n' ||
   E'El club se compromete a no usar esas imágenes con fines ajenos a su actividad deportiva, a no venderlas a terceros y a retirarlas si lo solicito por escrito.\n\n' ||
   E'Puedo no aceptar este punto sin que afecte la participación de mi hijo en el club.',
   false),
  ('visoria','Términos para visorías',
   E'Autorizo que mi hijo participe en visorías y pruebas organizadas por Tannery City FC o por clubes con los que el club tenga acuerdo.\n\n' ||
   E'• Entiendo que una visoría es una evaluación y no garantiza su selección.\n' ||
   E'• Confirmo que mi hijo se encuentra en condiciones físicas para participar.\n' ||
   E'• Autorizo al club a dar los primeros auxilios y trasladarlo a un servicio médico si hiciera falta, avisándome de inmediato.\n' ||
   E'• Autorizo que sus datos deportivos se compartan con el club evaluador para efectos de la visoría.',
   false)
) as v(code,title,body,required)
on conflict (organization_id, code) do nothing;;
