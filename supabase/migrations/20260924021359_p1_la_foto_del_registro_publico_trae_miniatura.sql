-- P1 · La foto del registro publico tambien trae miniatura
--
-- LO QUE MIDIO LA BASE (23 sep 2026, 63 Tanners activos)
--   con foto ....................... 49
--   CON FOTO PERO SIN MINIATURA .... 42   <- se ven como iniciales en las listas
--   con miniatura ...................  7
--   sin foto ....................... 14
--
-- Y de esos 42 sin miniatura, 25 se crearon en los ultimos 60 dias. No es
-- basura de la migracion vieja: se siguen produciendo.
--
-- LA FUGA
-- Habia dos caminos para subir la foto de un Tanner y solo uno hacia miniatura:
--
--   v2/jugadores/photos.js (el expediente)  ->  sube grande Y miniatura
--   public-form.js (registro publico)       ->  sube UN solo archivo
--
-- Y al convertir un prospecto en Tanner, command_convert_prospect_to_player
-- heredaba photo_path pero photo_thumb_path no existia ni en la tabla de
-- prospectos. Asi que cada nino inscrito por el formulario publico llegaba sin
-- miniatura, para siempre.
--
-- Convertir las 42 a mano sin tapar esto es una rueda de hamster: en tres meses
-- vuelven a ser 25. Esta migracion tapa la fuga; la limpieza de las 42 se hace
-- una sola vez despues, desde /admin/fotos/.

alter table app.prospects
  add column if not exists photo_thumb_path text;

comment on column app.prospects.photo_thumb_path is
  'Miniatura de la foto del registro publico. Se hereda al Tanner al convertir: sin ella, las listas lo pintan con iniciales.';

-- La miniatura se valida igual de duro que la foto grande: prefijo exacto,
-- extension conocida y existencia real en el bucket. Este endpoint lo llama
-- `anon` desde el formulario publico, asi que nada de lo que mande se cree.
--
-- Se tira la version de 3 argumentos ANTES de crear la de 4. `create or
-- replace` con un parametro de mas no reemplaza: crea una segunda funcion, y
-- entonces quedan las dos vivas. La primera vez que se intento aplicar esto,
-- la propia guarda del final conto 3 funciones donde debian ser 2 y abortó.
drop function if exists private.public_attach_prospect_photo(text,uuid,text);

create or replace function private.public_attach_prospect_photo(
  p_public_key text,
  p_prospect_id uuid,
  p_photo_path text,
  p_photo_thumb_path text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private', 'storage'
as $function$
declare v_org uuid; v_expected text; v_expected_thumb text; v_thumb text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Registration unavailable'; end if;
  v_expected:=format('organizations/%s/prospects/%s/profile.',v_org,p_prospect_id);
  if position(v_expected in p_photo_path)<>1 or p_photo_path !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'Invalid photo path'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='tanneros-prospect-photos' and o.name=p_photo_path) then raise exception 'Photo upload not found'; end if;

  -- La miniatura es opcional a proposito: si el navegador de la mama no la
  -- pudo generar, el registro NO se cae. Se queda sin miniatura, que es
  -- exactamente lo que pasaba antes, y /admin/fotos/ la hace despues.
  v_thumb:=nullif(trim(coalesce(p_photo_thumb_path,'')),'');
  if v_thumb is not null then
    v_expected_thumb:=format('organizations/%s/prospects/%s/profile-thumb.',v_org,p_prospect_id);
    if position(v_expected_thumb in v_thumb)<>1 or v_thumb !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'Invalid photo path'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='tanneros-prospect-photos' and o.name=v_thumb) then raise exception 'Photo upload not found'; end if;
  end if;

  update app.prospects set photo_path=p_photo_path,photo_thumb_path=v_thumb,photo_uploaded_at=now(),updated_at=now()
  where id=p_prospect_id and organization_id=v_org and source='public_form' and photo_required=true and photo_path is null and created_at>=now()-interval '1 hour';
  if not found then raise exception 'Prospect not available for photo'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectPhotoAttached','prospect',p_prospect_id,jsonb_build_object('photoPath',p_photo_path,'thumbPath',v_thumb));
  return true;
end $function$;

-- Agregar un parametro NO reemplaza la funcion: crea una segunda, y con DEFAULT
-- la llamada de tres argumentos ya no puede elegir entre las dos. Se tira la
-- vieja en la misma transaccion.
drop function if exists public.v2_public_attach_prospect_photo(text,uuid,text);

create function public.v2_public_attach_prospect_photo(
  club_key text, prospect_id uuid, photo_path text, photo_thumb_path text default null
) returns boolean
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.public_attach_prospect_photo(club_key, prospect_id, photo_path, photo_thumb_path) $function$;

revoke all on function public.v2_public_attach_prospect_photo(text,uuid,text,text) from public;
grant execute on function public.v2_public_attach_prospect_photo(text,uuid,text,text) to anon, authenticated;

-- Al convertir, la miniatura viaja con la foto. Sin este renglon, tapar la fuga
-- en el formulario no serviria de nada: la miniatura se quedaria en el
-- prospecto y el Tanner seguiria naciendo con iniciales.
create or replace function private.command_convert_prospect_to_player(p_organization_id uuid, p_prospect_id uuid, p_category_id uuid default null::uuid, p_monthly_fee numeric default null::numeric, p_joined_at date default CURRENT_DATE, p_jersey_number text default null::text, p_position text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  pr app.prospects%rowtype;
  cat app.categories%rowtype;
  v_player uuid;
  v_guardian uuid;
  v_code text;
  v_fee numeric;
  v_existing uuid;
begin
  if not private.has_module_access(p_organization_id,'players',true)
     or not private.has_module_access(p_organization_id,'prospects',true)
  then raise exception 'Not authorized'; end if;

  select * into pr from app.prospects
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null
   for update;
  if not found then raise exception 'Prospect not found'; end if;
  if pr.converted_player_id is not null then return pr.converted_player_id; end if;
  if coalesce(length(trim(pr.first_name)),0)<2 or coalesce(length(trim(pr.last_name)),0)<2 then raise exception 'Prospect name incomplete'; end if;
  if pr.birth_date is null then raise exception 'Prospect birth date required'; end if;
  if coalesce(length(trim(pr.guardian_name)),0)<2 or coalesce(length(trim(pr.phone)),0)<8 then raise exception 'Guardian contact required'; end if;

  if p_category_id is not null then
    select * into cat from app.categories where id=p_category_id and organization_id=p_organization_id and status='active';
    if not found then raise exception 'Invalid category'; end if;
  end if;

  select p.id into v_existing from app.players p
   where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
     and lower(trim(p.first_name))=lower(trim(pr.first_name))
     and lower(trim(coalesce(p.last_name,'')))=lower(trim(coalesce(pr.last_name,'')))
     and p.birth_date=pr.birth_date
   limit 1;
  if v_existing is not null then raise exception 'Possible duplicate player'; end if;

  v_code:=private.next_player_code(p_organization_id);
  v_fee:=greatest(0,coalesce(p_monthly_fee,0));

  insert into app.players(
    organization_id,code,first_name,last_name,birth_date,status,category,position,dominant_foot,jersey_number,school,sex,
    photo_bucket,photo_path,photo_thumb_path,joined_at,notes,source_prospect_id,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,created_at,updated_at
  ) values(
    p_organization_id,v_code,trim(pr.first_name),nullif(trim(pr.last_name),''),pr.birth_date,'active',
    case when p_category_id is not null then cat.name else nullif(trim(pr.category_interest),'') end,
    nullif(trim(p_position),''),pr.dominant_foot,nullif(trim(p_jersey_number),''),pr.school_name,pr.sex,
    case when pr.photo_path is not null then 'tanneros-prospect-photos' else 'tanneros-private' end,
    pr.photo_path,pr.photo_thumb_path,p_joined_at,nullif(trim(pr.public_message),''),pr.id,
    pr.privacy_notice_version,pr.data_consent,pr.data_consent_at,pr.image_consent,pr.image_consent_at,now(),now()
  ) returning id into v_player;

  select g.id into v_guardian from app.guardians g
   where g.organization_id=p_organization_id and g.status='active' and g.phone=pr.phone
   order by g.created_at limit 1;
  if v_guardian is null then
    insert into app.guardians(organization_id,first_name,last_name,phone,email,relationship_default,status)
    values(p_organization_id,trim(pr.guardian_name),null,pr.phone,pr.email,'Tutor','active') returning id into v_guardian;
  end if;
  insert into app.player_guardians(player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing,organization_id)
  values(v_player,v_guardian,'Tutor',true,true,true,p_organization_id)
  on conflict do nothing;

  if p_category_id is not null then
    insert into app.player_enrollments(organization_id,player_id,category_id,starts_on,status,notes)
    values(p_organization_id,v_player,p_category_id,p_joined_at,'active','Alta desde prospecto')
    on conflict do nothing;
  end if;

  insert into app.billing_profiles(organization_id,player_id,base_monthly_fee,billing_start,billing_day,is_exempt,status,needs_review,review_reason)
  values(p_organization_id,v_player,v_fee,p_joined_at,1,(v_fee=0),'active',(p_monthly_fee is null),case when p_monthly_fee is null then 'Cuota pendiente de configurar al convertir prospecto' else null end);

  update app.prospects set status='converted',converted_player_id=v_player,updated_at=now() where id=pr.id;

  update app.scouting_reports
     set player_id=v_player, status='closed', updated_at=now()
   where organization_id=p_organization_id and prospect_id=pr.id and player_id is null;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectConvertedToPlayer','player',v_player,
    jsonb_build_object('prospectId',pr.id,'code',v_code,'categoryId',p_category_id,'monthlyFee',v_fee,'photoPreserved',pr.photo_path is not null,'thumbPreserved',pr.photo_thumb_path is not null,'privacyPreserved',pr.data_consent),
    coalesce((select auth.uid())::text,'system'));
  return v_player;
end $function$;

revoke all on function private.public_attach_prospect_photo(text,uuid,text,text) from public, anon, authenticated;
revoke all on function private.command_convert_prospect_to_player(uuid,uuid,uuid,numeric,date,text,text) from public, anon, authenticated;

do $$
declare v int;
begin
  -- Una sola de cada una: si quedaran las dos versiones del attach, la llamada
  -- de tres argumentos del formulario publico no sabria a cual ir.
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_public_attach_prospect_photo';
  if v <> 1 then raise exception 'v2_public_attach_prospect_photo quedo % veces', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname in ('public_attach_prospect_photo','command_convert_prospect_to_player');
  if v <> 2 then raise exception 'las funciones de private quedaron % veces', v; end if;

  -- El formulario publico lo llama sin sesion: si anon pierde el permiso, nadie
  -- se puede volver a registrar.
  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='public' and routine_name='v2_public_attach_prospect_photo' and grantee='anon';
  if v < 1 then raise exception 'anon se quedo sin permiso para adjuntar la foto'; end if;

  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='private'
     and routine_name in ('public_attach_prospect_photo','command_convert_prospect_to_player')
     and grantee in ('PUBLIC','anon','authenticated');
  if v <> 0 then raise exception 'las funciones de P1 quedaron con % permisos sueltos', v; end if;
end $$;
