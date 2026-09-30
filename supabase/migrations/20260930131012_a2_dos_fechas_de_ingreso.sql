-- Dos fechas de ingreso, las mismas para todos, y quién las movió
--
-- LO QUE PIDIÓ EL CLUB: "homogenizar las fechas de ingreso. Fecha de ingreso
-- en TannerOS y fecha de ingreso al club. Esas dos, no más. Los de migración
-- que se las podamos poner nosotros, todas editables, y que quede registro de
-- quién lo hizo."
--
-- LAS DOS FECHAS
--
--   · Ingreso al club (app.players.joined_at, ya existía): desde cuándo el
--     niño es Tanner. Es la que ve la familia y la que da la antigüedad.
--   · Ingreso a TannerOS (app.players.registered_at, NUEVA): desde cuándo el
--     club lo tiene en el sistema. Para quien llegó por el link de registro
--     es el día en que su familia llenó el formulario.
--
-- CÓMO SE LLENA LA NUEVA, medido antes de aplicar (76 Tanners sin archivar)
--
--   · 9 llegaron por captación (link o prospecto): el día en que se capturó
--     el prospecto. Ya tenían su fecha de ingreso al club.
--   · 67 vienen de la migración: el día en que se capturaron en el sistema
--     anterior (su created_at, que se copió al migrar). Su fecha de ingreso al
--     club NO existe en ningún lado; esa la pone Presidencia.
--   · Los que se den de alta de aquí en adelante: la pone un trigger, así no
--     hay que tocar las tres funciones que crean Tanners.
--
-- Ninguna fecha se inventa: todas salen de cuándo se creó el renglón.
--
-- QUIÉN LAS MUEVE
--
-- Las dos, sólo Presidencia, con el mismo trato que ya tenía la del club:
-- quien no puede la ve deshabilitada y, si manda un valor, se ignora sin
-- tronar. Mismas guardias: no futura, no anterior al nacimiento.
--
-- EL REGISTRO DE QUIÉN
--
-- Cada cambio deja un evento en app.domain_events con el usuario que lo hizo,
-- de dónde a dónde, y cuándo. El expediente ahora los trae (admissionHistory)
-- con el nombre de la persona, para que la pantalla los enseñe debajo de
-- cada fecha.
--
-- LA MISMA FECHA EN TODAS LAS PANTALLAS
--
-- El portal de Familias enseñaba la MÁS ANTIGUA entre la capturada, su primera
-- inscripción y su primer cargo. Si Presidencia corregía la fecha hacia
-- adelante, la familia seguía viendo la vieja. Ahora la capturada manda; la
-- evidencia sólo se usa mientras no haya una.
--
-- REVERSIBLE: las firmas de 26 argumentos están abajo; la columna nueva se
-- puede tirar sin afectar a ninguna otra.

-- ---------------------------------------------------------------------------
-- 1. La columna, su relleno y su trigger.
-- ---------------------------------------------------------------------------
alter table app.players add column if not exists registered_at date;

comment on column app.players.registered_at is
  'Fecha de ingreso a TannerOS. Para registros por link: el día del formulario. Editable sólo por Presidencia.';
comment on column app.players.joined_at is
  'Fecha de ingreso al club. Editable sólo por Presidencia.';

update app.players p
set registered_at = (
  least(coalesce(p.created_at, now()),
        coalesce((select pr.created_at from app.prospects pr where pr.id = p.source_prospect_id),
                 p.created_at, now()))
  at time zone coalesce(o.timezone, 'America/Mexico_City'))::date
from public.organizations o
where o.id = p.organization_id and p.registered_at is null;

create or replace function private.players_default_registered_at()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if new.registered_at is null then
    new.registered_at := (
      least(coalesce(new.created_at, now()),
            coalesce((select pr.created_at from app.prospects pr where pr.id = new.source_prospect_id), now()))
      at time zone coalesce((select o.timezone from public.organizations o where o.id = new.organization_id),
                            'America/Mexico_City'))::date;
  end if;
  return new;
end
$function$;

revoke all on function private.players_default_registered_at() from public, anon, authenticated;

drop trigger if exists trg_players_default_registered_at on app.players;
create trigger trg_players_default_registered_at
  before insert on app.players
  for each row execute function private.players_default_registered_at();

alter table app.players alter column registered_at set not null;

-- ---------------------------------------------------------------------------
-- 2. Guardar la fecha de ingreso a TannerOS, con el mismo candado.
-- ---------------------------------------------------------------------------
create or replace function private.command_set_player_registered_at(
  p_organization_id uuid, p_player_id uuid, p_registered_at date)
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

  -- Sin el permiso se ignora, igual que la fecha de ingreso al club.
  if not private.is_presidency(p_organization_id) then
    return v_row.registered_at;
  end if;
  -- null = "no la toques".
  if p_registered_at is null or p_registered_at = v_row.registered_at then
    return v_row.registered_at;
  end if;

  if p_registered_at > current_date then
    raise exception 'La fecha de ingreso a TannerOS no puede ser futura';
  end if;
  if v_row.birth_date is not null and p_registered_at < v_row.birth_date then
    raise exception 'La fecha de ingreso a TannerOS no puede ser anterior a su nacimiento';
  end if;

  update app.players set registered_at = p_registered_at, updated_at = now()
  where id = p_player_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(p_organization_id,'PlayerRegisteredAtChanged','player',p_player_id,
         jsonb_build_object('from',v_row.registered_at,'to',p_registered_at),
         (select auth.uid()), (select auth.uid())::text);

  return p_registered_at;
end
$function$;

revoke all on function private.command_set_player_registered_at(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. El guardado del expediente la incluye.
--
-- Igual que en z1: agregar un parámetro crea OTRA función. Se tiran primero
-- las de 26 con su firma escrita a mano, para que quede una sola.
-- ---------------------------------------------------------------------------
drop function if exists public.v2_save_player_profile(
  uuid, uuid, text, text, date, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date);
drop function if exists private.command_save_player_profile(
  uuid, uuid, text, text, date, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date);

create or replace function private.command_save_player_profile(
  p_organization_id uuid, p_player_id uuid, p_first_name text, p_last_name text,
  p_birth_date date, p_position text, p_dominant_foot text, p_jersey_number text,
  p_school text, p_blood_type text, p_allergies text, p_address text,
  p_emergency_contact_name text, p_emergency_contact_phone text, p_notes text,
  p_guardian_name text, p_guardian_phone text, p_guardian_email text,
  p_guardian_relationship text, p_can_pickup boolean, p_receives_billing boolean,
  p_category_id uuid, p_category_effective_date date, p_category_notes text,
  p_sex text default null, p_joined_at date default null, p_registered_at date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
declare v_before jsonb; v_current uuid;
begin
  v_before:=private.query_player_profile(p_organization_id,p_player_id);
  perform private.command_update_player_profile(p_organization_id,p_player_id,p_first_name,p_last_name,p_birth_date,p_position,p_dominant_foot,p_jersey_number,p_school,p_blood_type,p_allergies,p_address,p_emergency_contact_name,p_emergency_contact_phone,p_notes,p_guardian_name,p_guardian_phone,p_guardian_email,p_guardian_relationship,p_can_pickup,p_receives_billing,p_sex);

  -- Las dos fechas van por su propio comando, donde vive el candado de
  -- Presidencia, y DESPUÉS del perfil para validar contra el nacimiento nuevo.
  perform private.command_set_player_joined_at(p_organization_id,p_player_id,p_joined_at);
  perform private.command_set_player_registered_at(p_organization_id,p_player_id,p_registered_at);

  v_current:=nullif(v_before->'activeEnrollment'->>'categoryId','')::uuid;
  if p_category_id is not null and p_category_id is distinct from v_current then
    perform private.command_change_player_category(p_organization_id,p_player_id,p_category_id,coalesce(p_category_effective_date,current_date),p_category_notes);
  end if;
  return private.query_player_profile(p_organization_id,p_player_id);
end $function$;

revoke all on function private.command_save_player_profile(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date, date) from public, anon, authenticated;

create or replace function public.v2_save_player_profile(
  organization_id uuid, player_id uuid, first_name text, last_name text,
  birth_date date, player_position text, dominant_foot text, jersey_number text,
  school text, blood_type text, allergies text, address text,
  emergency_contact_name text, emergency_contact_phone text, notes text,
  guardian_name text, guardian_phone text, guardian_email text,
  guardian_relationship text, can_pickup boolean, receives_billing boolean,
  category_id uuid, category_effective_date date, category_notes text,
  sex text default null, joined_at date default null, registered_at date default null)
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
    receives_billing, category_id, category_effective_date, category_notes, sex,
    joined_at, registered_at);
$$;

grant execute on function public.v2_save_player_profile(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, uuid, date, text, text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. El expediente trae las dos fechas, de dónde vino el Tanner y quién las
--    ha movido.
--
-- admissionOrigin: 'link' (formulario público), 'migracion' (sistema anterior
-- o prospecto importado de ahí) o 'alta' (capturado a mano en TannerOS).
-- ---------------------------------------------------------------------------
create or replace function private.query_player_profile(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb; v_history jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'birthDate',p.birth_date,'status',p.status,
    'category',p.category,'position',p.position,'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
    'sex',p.sex,
    'bloodType',p.blood_type,'allergies',p.allergies,'address',p.address,'emergencyContactName',p.emergency_contact_name,
    'emergencyContactPhone',p.emergency_contact_phone,'photoBucket',p.photo_bucket,'photoPath',p.photo_path,'photoThumbPath',p.photo_thumb_path,
    'legacyPhotoData',case when p.photo_path is null then nullif(lp.photo_data,'') else null end,'notes',p.notes,
    'privacyNoticeVersion',p.privacy_notice_version,'dataConsent',p.data_consent,'dataConsentAt',p.data_consent_at,
    'imageConsent',p.image_consent,'imageConsentAt',p.image_consent_at,'joinedAt',p.joined_at,'registeredAt',p.registered_at,
    'admissionOrigin',case
      when p.legacy_id is not null or pr.source = 'legacy_import' then 'migracion'
      when pr.source = 'public_form' then 'link'
      else 'alta' end,
    'withdrawnAt',p.withdrawn_at,
    'withdrawalReason',p.withdrawal_reason,'needsReview',p.needs_review,'reviewReason',p.review_reason
  ) into v_player
  from app.players p
  left join public.players lp on lp.organization_id=p.organization_id and lp.id=p.legacy_id
  left join app.prospects pr on pr.id=p.source_prospect_id and pr.organization_id=p.organization_id
  where p.id=p_player_id and p.organization_id=p_organization_id and p.archived_at is null;
  if v_player is null then raise exception 'Player not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field',case e.event_type when 'PlayerJoinedAtChanged' then 'joinedAt' else 'registeredAt' end,
    'from',e.payload->>'from','to',e.payload->>'to','at',e.occurred_at,
    'by',coalesce(nullif(btrim(pf.display_name),''),'Usuario sin nombre')
  ) order by e.occurred_at desc),'[]'::jsonb) into v_history
  from (select * from app.domain_events
        where organization_id=p_organization_id and aggregate_type='player' and aggregate_id=p_player_id
          and event_type in ('PlayerJoinedAtChanged','PlayerRegisteredAtChanged')
        order by occurred_at desc limit 30) e
  left join public.profiles pf on pf.user_id=e.actor_user_id;
  v_player:=v_player||jsonb_build_object('admissionHistory',v_history);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'firstName',g.first_name,'lastName',g.last_name,'phone',g.phone,'email',g.email,'relationshipDefault',g.relationship_default,
    'relationship',pg.relationship,'isPrimary',pg.is_primary,'canPickup',pg.can_pickup,'receivesBilling',pg.receives_billing,'status',g.status
  ) order by pg.is_primary desc,g.created_at),'[]'::jsonb) into v_guardians
  from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id and g.organization_id=pg.organization_id
  where pg.organization_id=p_organization_id and pg.player_id=p_player_id;
  select jsonb_build_object('id',pe.id,'categoryId',pe.category_id,'categoryName',c.name,'startsOn',pe.starts_on,'status',pe.status)
  into v_enrollment from app.player_enrollments pe join app.categories c on c.id=pe.category_id and c.organization_id=pe.organization_id
  where pe.organization_id=p_organization_id and pe.player_id=p_player_id and pe.status='active' order by pe.starts_on desc,pe.created_at desc limit 1;
  return jsonb_build_object('player',v_player,'guardians',v_guardians,'activeEnrollment',v_enrollment);
end
$function$;

-- ---------------------------------------------------------------------------
-- 5. El portal de Familias: la fecha capturada manda.
-- ---------------------------------------------------------------------------
create or replace function private.portal_home()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  g app.guardians;
  v jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;

  select jsonb_build_object(
    'guardian', jsonb_build_object(
      'name', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
      'phone', g.phone,
      'email', g.email
    ),
    'organization', (
      select jsonb_build_object(
        'name', o.name,
        'whatsapp', nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber',''),'\D','','g'),''),
        'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),'')
      )
      from public.organizations o
      where o.id = g.organization_id
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id,
        'first_name', pl.first_name,
        'last_name', pl.last_name,
        'birth_date', pl.birth_date,
        'category', pl.category,
        'position', pl.position,
        'dominant_foot', pl.dominant_foot,
        'jersey_number', pl.jersey_number,
        -- La que capturó Presidencia manda. La evidencia (primera inscripción
        -- o primer cargo) sólo cubre mientras no haya una.
        'joined_at', coalesce(pl.joined_at, least(
          (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id = pl.id),
          (select min(c.due_date) from app.charges c
            where c.player_id = pl.id and c.status = 'posted' and c.voided_at is null))),
        'status', pl.status,
        'photo_path', pl.photo_path,
        'photo_thumb_path', pl.photo_thumb_path,
        'photo_bucket', pl.photo_bucket,
        'balance', coalesce((
          select sum(cb.balance_due)
          from app.charge_balances cb
          where cb.player_id = pl.id
            and cb.balance_due > 0
        ), 0)
      ) order by pl.first_name)
      from app.players pl
      where pl.id in (select player_id from private.portal_player_ids())
    ), '[]'::jsonb)
  ) into v;

  return v;
end
$function$;
