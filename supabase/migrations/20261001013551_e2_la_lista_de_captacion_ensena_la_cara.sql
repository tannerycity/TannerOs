-- La lista de Captación enseña la cara de cada prospecto
--
-- LO QUE SE REPORTÓ: "cuando los registran, no me sale su miniatura en la
-- lista hasta que entro".
--
-- POR QUÉ: la lista de Captación nunca pinta fotos —sólo iniciales— y la foto
-- completa se firma al abrir la ficha. Fue a propósito: el contrato de egress
-- dice que una lista consume miniaturas, no originales. Pero la lista tampoco
-- recibía la miniatura (v2_prospects no traía photo_thumb_path), y aunque la
-- hubiera recibido no existía: el candado anónimo la rechazaba (arreglado en
-- d2). Medido hoy: 23 prospectos con foto, 22 sin miniatura.
--
-- LO QUE CAMBIA
--
--   1. v2_prospects trae photo_thumb_path. Cambia el RETURNS TABLE, así que
--      se tiran y se recrean las dos (la pública depende de la privada) con
--      los mismos permisos que tenían: authenticated, postgres, service_role.
--   2. v2_set_prospect_photo_thumb: guarda la miniatura que TannerOS genera
--      para un prospecto que no la tiene. Exige escribir en Prospectos, que
--      la ruta sea la del prospecto ('…/prospects/<id>/profile-thumb…') y que
--      el archivo exista. Así se curan los 22 viejos: la pantalla la genera
--      una sola vez y de ahí en adelante la lista sólo baja ~8 kB por niño.
--
-- REVERSIBLE: recrear las dos funciones con la columna de menos.

drop function if exists public.v2_prospects(uuid, text);
drop function if exists private.query_prospects(uuid, text);

create function private.query_prospects(p_organization_id uuid, p_status text default null)
returns table(id uuid, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, source text, source_campaign text, source_channel text, registration_type text, category_interest text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, photo_path text, photo_uploaded_at timestamp with time zone, privacy_notice_version text, data_consent boolean, data_consent_at timestamp with time zone, image_consent boolean, image_consent_at timestamp with time zone, status text, next_action_at timestamp with time zone, notes text, loss_reason text, assigned_user_id uuid, assigned_user_name text, created_at timestamp with time zone, scouting_count bigint, photo_thumb_path text)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id,array['prospects','scouting'],false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.first_name,p.last_name,p.birth_date,p.phone,p.email,p.guardian_name,
         p.source,p.source_campaign,p.source_channel,p.registration_type,p.category_interest,p.purpose,
         p.dominant_foot,p.school_name,p.referral_name,p.public_message,p.photo_path,p.photo_uploaded_at,
         p.privacy_notice_version,p.data_consent,p.data_consent_at,p.image_consent,p.image_consent_at,
         p.status,p.next_action_at,p.notes,p.loss_reason,p.assigned_user_id,pr.display_name,p.created_at,
         (select count(*) from app.scouting_reports s where s.organization_id=p.organization_id and s.prospect_id=p.id) as scouting_count,
         p.photo_thumb_path
  from app.prospects p
  left join public.profiles pr on pr.user_id=p.assigned_user_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.created_at desc,p.id;
end $function$;

create function public.v2_prospects(organization_id uuid, status_filter text default null)
returns table(id uuid, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, source text, source_campaign text, source_channel text, registration_type text, category_interest text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, photo_path text, photo_uploaded_at timestamp with time zone, privacy_notice_version text, data_consent boolean, data_consent_at timestamp with time zone, image_consent boolean, image_consent_at timestamp with time zone, status text, next_action_at timestamp with time zone, notes text, loss_reason text, assigned_user_id uuid, assigned_user_name text, created_at timestamp with time zone, scouting_count bigint, photo_thumb_path text)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_prospects(organization_id,status_filter) $function$;

revoke all on function private.query_prospects(uuid, text) from public, anon;
grant execute on function private.query_prospects(uuid, text) to authenticated, service_role;
revoke all on function public.v2_prospects(uuid, text) from public, anon;
grant execute on function public.v2_prospects(uuid, text) to authenticated, service_role;

create or replace function private.command_set_prospect_photo_thumb(
  p_organization_id uuid, p_prospect_id uuid, p_thumb_path text)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private', 'storage'
as $function$
declare v_prefijo text;
begin
  if not private.has_module_access(p_organization_id,'prospects',true) then raise exception 'Not authorized'; end if;
  v_prefijo:=format('organizations/%s/prospects/%s/profile-thumb',p_organization_id,p_prospect_id);
  if position(v_prefijo in coalesce(p_thumb_path,''))<>1 or p_thumb_path !~* '\.(jpg|jpeg|png|webp)$' then
    raise exception 'Invalid photo path';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='tanneros-prospect-photos' and o.name=p_thumb_path) then
    raise exception 'Photo upload not found';
  end if;
  update app.prospects set photo_thumb_path=p_thumb_path, updated_at=now()
  where id=p_prospect_id and organization_id=p_organization_id and archived_at is null and photo_path is not null;
  if not found then raise exception 'Prospect not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(p_organization_id,'ProspectPhotoThumbGenerated','prospect',p_prospect_id,
         jsonb_build_object('thumbPath',p_thumb_path),(select auth.uid()),(select auth.uid())::text);
  return p_thumb_path;
end $function$;

revoke all on function private.command_set_prospect_photo_thumb(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.v2_set_prospect_photo_thumb(organization_id uuid, prospect_id uuid, thumb_path text)
returns text
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.command_set_prospect_photo_thumb(organization_id, prospect_id, thumb_path); $$;

revoke all on function public.v2_set_prospect_photo_thumb(uuid, uuid, text) from public, anon;
grant execute on function public.v2_set_prospect_photo_thumb(uuid, uuid, text) to authenticated;
