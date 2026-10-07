-- Fotos en Asistencia: miniaturas para los profes
--
-- REPORTE DE PRESIDENCIA (07/10/2026): "cuando los profes entran a tomar
-- lista no pueden ver las fotos de los jugadores". La pantalla decía
-- "0 caras visibles · 16 expedientes necesitan miniatura" en T10.
--
-- CAUSAS MEDIDAS:
--   1. La auditoría de egress (#141) dejó la lista de asistencia pidiendo
--      SÓLO miniaturas (para no bajar fotos de varios MB por niño), pero
--      v2_attendance_roster nunca devolvió photo_thumb_path. Resultado: 0
--      fotos para todos, aunque 49 de 54 Tanners activos sí tienen miniatura.
--   2. 5 Tanners que entraron por Fichajes no tenían miniatura en su
--      expediente: se generó en Fichajes después de convertirlos y nunca se
--      copió al Tanner.
--   3. 6 Tanners que entraron por Fichajes guardan su foto en el almacén de
--      prospectos, que sólo lee quien tiene Fichajes. Los profes no lo tienen.
--
-- QUÉ HACE:
--   1. v2_attendance_roster_thumbs(organization_id, session_id): la
--      miniatura de cada Tanner de la sesión, con los mismos candados que la
--      lista. (Función aparte para no cambiar la firma de la lista.)
--   2. Copia al Tanner la miniatura que ya existe en su prospecto (misma foto).
--   3. Cuando Fichajes genera una miniatura, también la copia al Tanner si ya
--      lo convirtieron.
--   4. Quien ve Jugadores o Asistencia puede leer, del almacén de prospectos,
--      SÓLO los archivos que hoy son la foto o la miniatura de un Tanner de su
--      club. El resto del almacén sigue cerrado.
--
-- EGRESS: la lista baja miniaturas de ~8 kB, nunca la foto original.
--
-- REVERSIBLE: borrar v2_attendance_roster_thumbs, restaurar la versión
-- anterior de command_set_prospect_photo_thumb y borrar la política
-- tanneros_prospect_photos_read_as_player.

create or replace function private.query_attendance_roster_thumbs(p_organization_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $function$
begin
  -- Mismos candados que la lista (query_attendance_roster): Asistencia y
  -- que la persona pueda tocar esa sesión.
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.sessions s where s.id=p_session_id and s.organization_id=p_organization_id)
    then raise exception 'Session not found'; end if;
  if not private.can_touch_session(p_organization_id,p_session_id) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('playerId',p.id,'thumb',p.photo_thumb_path,'bucket',coalesce(p.photo_bucket,'tanneros-private')))
      from private.session_roster_ids(p_organization_id,p_session_id) r
      join app.players p on p.id=r.player_id
     where p.photo_thumb_path is not null), '[]'::jsonb);
end $function$;

create or replace function public.v2_attendance_roster_thumbs(organization_id uuid, session_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_attendance_roster_thumbs(organization_id,session_id) $function$;
revoke all on function public.v2_attendance_roster_thumbs(uuid,uuid) from public, anon;
grant execute on function public.v2_attendance_roster_thumbs(uuid,uuid) to authenticated;

-- 2. Miniaturas que ya existían en el prospecto
update app.players p
   set photo_thumb_path = pr.photo_thumb_path, updated_at = now()
  from app.prospects pr
 where pr.organization_id = p.organization_id
   and pr.photo_path = p.photo_path
   and pr.photo_thumb_path is not null
   and p.photo_thumb_path is null;

-- 3. De aquí en adelante, la miniatura de Fichajes también llega al Tanner
create or replace function private.command_set_prospect_photo_thumb(p_organization_id uuid, p_prospect_id uuid, p_thumb_path text)
returns text language plpgsql security definer set search_path to 'pg_catalog','app','private','storage'
as $function$
declare v_prefijo text; v_foto text;
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
  where id=p_prospect_id and organization_id=p_organization_id and archived_at is null and photo_path is not null
  returning photo_path into v_foto;
  if not found then raise exception 'Prospect not found'; end if;
  update app.players set photo_thumb_path=p_thumb_path, updated_at=now()
   where organization_id=p_organization_id and photo_path=v_foto and photo_thumb_path is null;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(p_organization_id,'ProspectPhotoThumbGenerated','prospect',p_prospect_id,
         jsonb_build_object('thumbPath',p_thumb_path),(select auth.uid()),(select auth.uid())::text);
  return p_thumb_path;
end $function$;

-- 4. La foto de un Tanner que vino de Fichajes la ve quien ve Tanners
create or replace function private.is_player_photo_object(p_organization_id uuid, p_name text)
returns boolean language sql stable security definer set search_path to 'pg_catalog','app','private'
as $$
  select exists(select 1 from app.players p
                 where p.organization_id = p_organization_id and p.archived_at is null
                   and p.photo_bucket = 'tanneros-prospect-photos'
                   and (p.photo_path = p_name or p.photo_thumb_path = p_name))
$$;
revoke all on function private.is_player_photo_object(uuid,text) from public, anon;
grant execute on function private.is_player_photo_object(uuid,text) to authenticated;

create policy tanneros_prospect_photos_read_as_player on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tanneros-prospect-photos'
    and private.storage_org_id(name) is not null
    and private.has_any_module_access(private.storage_org_id(name), array['players','attendance'], false)
    and private.is_player_photo_object(private.storage_org_id(name), name)
  );
