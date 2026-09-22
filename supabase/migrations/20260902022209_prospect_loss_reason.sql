-- 1. Motivo de perdida: se captura al marcar un prospecto como "No continua".
alter table app.prospects add column if not exists loss_reason text;

-- 2. command_upsert_prospect_followup: exige el motivo al pasar a not_continuing,
--    lo limpia si el prospecto se reactiva a otro estado.
create or replace function private.command_upsert_prospect_followup(p_organization_id uuid, p_prospect_id uuid, p_status text, p_next_action_at timestamp with time zone, p_notes text, p_loss_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'prospects',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('new','contacted','trial_scheduled','trial_completed','converted','not_continuing') then raise exception 'Invalid prospect status'; end if;
  if p_status='not_continuing' and nullif(trim(coalesce(p_loss_reason,'')),'') is null then
    raise exception 'El motivo es obligatorio para marcar "No continúa"';
  end if;
  update app.prospects
     set status=p_status,next_action_at=p_next_action_at,notes=nullif(trim(coalesce(p_notes,'')),''),
         loss_reason=case when p_status='not_continuing' then trim(p_loss_reason) else null end,
         assigned_user_id=(select auth.uid()),updated_at=now()
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Prospect not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectFollowupUpdated','prospect',p_prospect_id,
         jsonb_build_object('status',p_status,'next_action_at',p_next_action_at,'lossReason',case when p_status='not_continuing' then trim(p_loss_reason) else null end),coalesce((select auth.uid())::text,'system'));
end $function$;

-- 3. query_prospects: exponer loss_reason y el responsable asignado (util tambien para
--    el reporte de conversion por scout que sigue).
drop function private.query_prospects(uuid, text);

create function private.query_prospects(p_organization_id uuid, p_status text default null::text)
 returns table(id uuid, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, source text, source_campaign text, source_channel text, registration_type text, category_interest text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, photo_path text, photo_uploaded_at timestamp with time zone, privacy_notice_version text, data_consent boolean, data_consent_at timestamp with time zone, image_consent boolean, image_consent_at timestamp with time zone, status text, next_action_at timestamp with time zone, notes text, loss_reason text, assigned_user_id uuid, assigned_user_name text, created_at timestamp with time zone, scouting_count bigint)
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
         (select count(*) from app.scouting_reports s where s.organization_id=p.organization_id and s.prospect_id=p.id) as scouting_count
  from app.prospects p
  left join public.profiles pr on pr.user_id=p.assigned_user_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.created_at desc,p.id;
end $function$;

revoke execute on function private.query_prospects(uuid, text) from public;
grant execute on function private.query_prospects(uuid, text) to postgres, authenticated, service_role;

-- 4. Wrappers publicos: v2_update_prospect_followup (nuevo parametro) y v2_prospects
--    (nueva firma, requiere drop+create igual que query_prospects).
create or replace function public.v2_update_prospect_followup(organization_id uuid, prospect_id uuid, status text, next_action_at timestamp with time zone, notes text, loss_reason text default null::text)
 returns void
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select private.command_upsert_prospect_followup(organization_id,prospect_id,status,next_action_at,notes,loss_reason) $function$;

drop function public.v2_prospects(uuid, text);

create function public.v2_prospects(organization_id uuid, status_filter text default null::text)
 returns table(id uuid, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, source text, source_campaign text, source_channel text, registration_type text, category_interest text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, photo_path text, photo_uploaded_at timestamp with time zone, privacy_notice_version text, data_consent boolean, data_consent_at timestamp with time zone, image_consent boolean, image_consent_at timestamp with time zone, status text, next_action_at timestamp with time zone, notes text, loss_reason text, assigned_user_id uuid, assigned_user_name text, created_at timestamp with time zone, scouting_count bigint)
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_prospects(organization_id,status_filter) $function$;

revoke execute on function public.v2_prospects(uuid, text) from public, anon;
grant execute on function public.v2_prospects(uuid, text) to postgres, authenticated, service_role;

revoke execute on function public.v2_update_prospect_followup(uuid, uuid, text, timestamp with time zone, text, text) from public, anon;
grant execute on function public.v2_update_prospect_followup(uuid, uuid, text, timestamp with time zone, text, text) to postgres, authenticated, service_role;
;
