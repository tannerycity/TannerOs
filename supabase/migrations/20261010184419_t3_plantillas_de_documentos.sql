-- Plantillas de documentos para un club nuevo.
-- Un club nuevo nacía sin reglamento, uso de imagen ni términos de visoría.
-- Estas plantillas llevan su nombre; provision_club las siembra (u3) y el
-- club las edita en Centro Tanner. El aviso de privacidad va en su propia
-- función porque es largo y lleva datos que sólo el club sabe.

create or replace function private.plantilla_aviso_de_privacidad(p_club text, p_ciudad text, p_whatsapp text)
returns text language sql immutable set search_path to 'pg_catalog'
as $function$ select 'Aviso de privacidad de ' || coalesce(nullif(trim(p_club), ''), 'el club') || ' [PENDIENTE: texto completo]' $function$;

create or replace function private.plantillas_de_documentos(p_club text, p_ciudad text, p_whatsapp text)
returns table(code text, title text, body text, required boolean)
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  with d(club) as (select coalesce(nullif(trim(p_club), ''), 'El club'))
  select 'reglamento', 'Reglamento del club', $t$Como familia del club me comprometo a:

• Llevar a mi hijo puntual a entrenamientos y partidos, y avisar al club cuando no pueda asistir.
• Respetar a profes, árbitros, compañeros y rivales, dentro y fuera de la cancha.
• Cubrir la mensualidad en las fechas que el club indique.
• Cuidar el uniforme y las instalaciones del club.
• Apoyar la formación deportiva y humana de mi hijo, entendiendo que el resultado no está por encima del proceso.

Entiendo que el club puede dar de baja a un jugador por faltas graves de conducta de la familia o del jugador.$t$, true
  from d
  union all
  select 'uso_de_imagen', 'Uso de fotos y video', replace($t$Autorizo a {club} a tomar fotografías y video de mi hijo durante entrenamientos, partidos y eventos del club, y a usarlos para:

• Redes sociales y página del club.
• Material de promoción y convocatorias.
• Reconocimientos, memorias y contenido deportivo.

El club se compromete a no usar esas imágenes con fines ajenos a su actividad deportiva, a no venderlas a terceros y a retirarlas si lo solicito por escrito.

Puedo no aceptar este punto sin que afecte la participación de mi hijo en el club.$t$, '{club}', d.club), false
  from d
  union all
  select 'visoria', 'Términos para visorías', replace($t$Autorizo que mi hijo participe en visorías y pruebas organizadas por {club} o por clubes con los que el club tenga acuerdo.

• Entiendo que una visoría es una evaluación y no garantiza su selección.
• Confirmo que mi hijo se encuentra en condiciones físicas para participar.
• Autorizo al club a dar los primeros auxilios y trasladarlo a un servicio médico si hiciera falta, avisándome de inmediato.
• Autorizo que sus datos deportivos se compartan con el club evaluador para efectos de la visoría.$t$, '{club}', d.club), false
  from d
  union all
  select 'privacidad', 'Aviso de privacidad', private.plantilla_aviso_de_privacidad(p_club, p_ciudad, p_whatsapp), true
  from d
$function$;