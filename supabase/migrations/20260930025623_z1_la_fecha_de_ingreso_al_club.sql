-- La fecha de ingreso al club, y quién puede moverla
--
-- LO QUE PIDIÓ EL CLUB: "me gustaría que tuviéramos un lugar donde venga la
-- fecha de ingreso… que sólo Presidencia la pueda mover".
--
-- LO QUE HABÍA
--
-- La columna app.players.joined_at EXISTE desde hace tiempo, y dos pantallas
-- ya la leen: el portal de Familias la enseña como "En el club · Desde …" —y
-- cuando falta, como "Por registrar"— y la ficha del Tanner la usa de respaldo
-- para calcular su antigüedad.
--
-- Lo que no existía era dónde capturarla. Por eso, medido hoy: de los 62
-- Tanners activos, sólo 9 tienen fecha de ingreso. Las 53 familias restantes
-- ven "Por registrar" en su portal y el club no puede decir desde cuándo está
-- cada niño.
--
-- No es un dato de adorno: es lo que contesta "¿cuánto lleva aquí?" cuando se
-- decide una beca, un reconocimiento de antigüedad o a quién se le entrega el
-- uniforme primero.
--
-- QUIÉN PUEDE MOVERLA
--
-- Sólo Presidencia, como se pidió. Un Formador o Taquilla que guarde el
-- expediente NO la cambia — y tampoco truena: se le ignora el valor y se
-- conserva el que estaba. Es el mismo trato que ya recibían los campos de
-- familia cuando alguien sin el permiso 'jugadores_familia' guardaba la ficha.
--
-- Tronar sería peor: el que guarda un expediente para corregir un teléfono no
-- tiene por qué recibir un error sobre un campo que su pantalla le enseñó
-- deshabilitado.
--
-- DOS GUARDIAS SOBRE EL DATO
--
--   · No puede estar en el futuro. Nadie ingresa mañana.
--   · No puede ser anterior a su fecha de nacimiento. Es un error de dedo, y
--     uno que pasaría callado hasta que alguien calcule una antigüedad de
--     doce años en un niño de cuatro.
--
-- NULL SIGUE SIGNIFICANDO "NO LA TOQUES"
--
-- El parámetro es opcional y va al final, así que todo lo que ya llamaba a
-- esta función sigue funcionando sin cambios. Mandar null NO borra la fecha:
-- la deja como está. Para el club, "no mandé nada" y "quiero borrarla" son
-- cosas distintas, y la segunda no se pidió.
--
-- REVERSIBLE: volver a ejecutar las funciones en su versión anterior las
-- regresa. Ningún dato se toca aquí.

-- ---------------------------------------------------------------------------
-- 1. Guardar la fecha de ingreso, con su candado.
-- ---------------------------------------------------------------------------
create or replace function private.command_set_player_joined_at(
  p_organization_id uuid, p_player_id uuid, p_joined_at date)
returns date
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_row app.players%rowtype;
begin
  select * into v_row from app.players
  where id = p_player_id and organization_id = p_organization_id and archived_at is null
  for update;
  if not found then raise exception 'Player not found'; end if;

  -- Sin el permiso, el valor se ignora y se conserva el que estaba. No truena:
  -- quien guarda el expediente para corregir un telefono no tiene por que
  -- recibir un error de un campo que su pantalla le enseño deshabilitado.
  if not private.is_presidency(p_organization_id) then
    return v_row.joined_at;
  end if;
  -- null = "no la toques". Borrarla no se pidio y no se ofrece.
  if p_joined_at is null then
    return v_row.joined_at;
  end if;
  if p_joined_at = v_row.joined_at then
    return v_row.joined_at;
  end if;

  if p_joined_at > current_date then
    raise exception 'La fecha de ingreso no puede ser futura';
  end if;
  if v_row.birth_date is not null and p_joined_at < v_row.birth_date then
    raise exception 'La fecha de ingreso no puede ser anterior a su nacimiento';
  end if;

  update app.players set joined_at = p_joined_at, updated_at = now()
  where id = p_player_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerJoinedAtChanged','player',p_player_id,
         jsonb_build_object('from',v_row.joined_at,'to',p_joined_at),
         (select auth.uid()));

  return p_joined_at;
end
$function$;

revoke all on function private.command_set_player_joined_at(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El guardado del expediente la incluye.
--
-- OJO CON EL 'create or replace': agregar un parametro NO reemplaza la
-- funcion, crea una SEGUNDA con otra firma. Quedarian dos
-- v2_save_player_profile —una de 25 argumentos y otra de 26— y PostgREST
-- elegiria segun las llaves que le manden: una pantalla vieja seguiria
-- pegandole a la de 25, que no sabe de la fecha de ingreso, y el dato se
-- perderia en silencio.
--
-- Por eso las de 25 se tiran primero, con su firma completa escrita a mano.
-- Verificado antes de aplicar: en produccion existe exactamente UNA version de
-- cada una, la de 25.
--
-- REVERSIBLE: las firmas viejas estan aqui escritas; recrearlas las regresa.
-- ---------------------------------------------------------------------------
drop function if exists public.v2_save_player_profile(
  uuid, uuid, text, text, date, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, uuid, date, text, text);
drop function if exists private.command_save_player_profile(
  uuid, uuid, text, text, date, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, uuid, date, text, text);

create or replace function private.command_save_player_profile(
  p_organization_id uuid, p_player_id uuid, p_first_name text, p_last_name text,
  p_birth_date date, p_position text, p_dominant_foot text, p_jersey_number text,
  p_school text, p_blood_type text, p_allergies text, p_address text,
  p_emergency_contact_name text, p_emergency_contact_phone text, p_notes text,
  p_guardian_name text, p_guardian_phone text, p_guardian_email text,
  p_guardian_relationship text, p_can_pickup boolean, p_receives_billing boolean,
  p_category_id uuid, p_category_effective_date date, p_category_notes text,
  p_sex text default null, p_joined_at date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
declare v_before jsonb; v_current uuid;
begin
  v_before:=private.query_player_profile(p_organization_id,p_player_id);
  perform private.command_update_player_profile(p_organization_id,p_player_id,p_first_name,p_last_name,p_birth_date,p_position,p_dominant_foot,p_jersey_number,p_school,p_blood_type,p_allergies,p_address,p_emergency_contact_name,p_emergency_contact_phone,p_notes,p_guardian_name,p_guardian_phone,p_guardian_email,p_guardian_relationship,p_can_pickup,p_receives_billing,p_sex);

  -- La fecha de ingreso va por su propio comando, que es donde vive el candado
  -- de Presidencia. Se llama DESPUES de actualizar el perfil para que la
  -- validacion contra la fecha de nacimiento use la que se acaba de guardar y
  -- no la anterior.
  perform private.command_set_player_joined_at(p_organization_id,p_player_id,p_joined_at);

  v_current:=nullif(v_before->'activeEnrollment'->>'categoryId','')::uuid;
  if p_category_id is not null and p_category_id is distinct from v_current then
    perform private.command_change_player_category(p_organization_id,p_player_id,p_category_id,coalesce(p_category_effective_date,current_date),p_category_notes);
  end if;
  return private.query_player_profile(p_organization_id,p_player_id);
end $function$;

revoke all on function private.command_save_player_profile(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. La cascara publica, con el parametro nuevo al final.
--
-- SECURITY DEFINER, como todas desde la migracion w1: una cascara INVOKER no
-- alcanza a la privada y la pantalla recibe "permission denied".
-- ---------------------------------------------------------------------------
create or replace function public.v2_save_player_profile(
  organization_id uuid, player_id uuid, first_name text, last_name text,
  birth_date date, player_position text, dominant_foot text, jersey_number text,
  school text, blood_type text, allergies text, address text,
  emergency_contact_name text, emergency_contact_phone text, notes text,
  guardian_name text, guardian_phone text, guardian_email text,
  guardian_relationship text, can_pickup boolean, receives_billing boolean,
  category_id uuid, category_effective_date date, category_notes text,
  sex text default null, joined_at date default null)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$
  select private.command_save_player_profile(
    organization_id, player_id, first_name, last_name, birth_date, player_position,
    dominant_foot, jersey_number, school, blood_type, allergies, address,
    emergency_contact_name, emergency_contact_phone, notes, guardian_name,
    guardian_phone, guardian_email, guardian_relationship, can_pickup,
    receives_billing, category_id, category_effective_date, category_notes, sex, joined_at);
$$;

grant execute on function public.v2_save_player_profile(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La pantalla necesita saber si QUIEN ESTA MIRANDO puede moverla.
--
-- Sin esto tendria que adivinarlo por el nombre del rol, y el dia que el club
-- cree un rol nuevo con ese permiso la pantalla se quedaria mintiendo. La
-- respuesta la da la misma funcion que aplica el candado.
-- ---------------------------------------------------------------------------
create or replace function public.v2_can_set_joined_at(organization_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.is_presidency(organization_id); $$;

grant execute on function public.v2_can_set_joined_at(uuid) to authenticated;
