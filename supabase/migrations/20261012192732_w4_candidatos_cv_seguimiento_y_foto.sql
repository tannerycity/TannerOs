-- Candidatos a staff, segunda vuelta (Presidencia, 12/10/2026).
--
-- 1. "No puedo ver el CV": la política de lectura del CV usa can_hire_staff,
--    que estaba cerrada a authenticated; el storage la evalúa como el usuario
--    y fallaba con "permission denied". Se abre (sólo dice sí o no).
-- 2. "Que sea fácil para alguien que no sabe de tecnología darle seguimiento":
--    un paso más, Prueba en cancha, entre Entrevista y Contratado. Las
--    etiquetas en pantalla: Nueva → Contactado → Entrevista → Prueba →
--    Contratado (o Descartado). 'revision' se queda como código de Contactado.
-- 3. "Que pongan una foto y se haga chiquita, para tener nuestro banco de
--    profes": foto y miniatura junto al CV; las listas sólo piden la miniatura.

grant execute on function private.can_hire_staff(uuid, boolean) to authenticated;

alter table app.staff_applications drop constraint staff_applications_status_check;
alter table app.staff_applications add constraint staff_applications_status_check
  check (status in ('nueva','revision','entrevista','prueba','contratado','descartado'));
alter table app.staff_applications add column photo_path text, add column photo_thumb_path text;

-- Subir CV, foto y miniatura: sólo a la ruta de esa postulación, sólo lo que
-- falta y sólo en su primera hora.
create or replace function private.public_staff_cv_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_app uuid; v_archivo text;
begin
  if p_name !~* '^organizations/[0-9a-f-]{36}/staff/[0-9a-f-]{36}/(cv\.(pdf|jpg|jpeg|png|webp)|foto(-thumb)?\.(jpg|jpeg|png|webp))$' then return false; end if;
  v_org := split_part(p_name, '/', 2)::uuid; v_app := split_part(p_name, '/', 4)::uuid; v_archivo := split_part(p_name, '/', 5);
  return exists (select 1 from app.staff_applications a where a.id = v_app and a.organization_id = v_org
                 and a.created_at >= now() - interval '1 hour'
                 and case when v_archivo like 'cv.%' then a.cv_path is null else a.photo_path is null end);
exception when others then return false;
end $$;

create or replace function private.public_attach_staff_photo(p_public_key text, p_application_id uuid, p_path text, p_thumb text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_base text;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  v_base := '^organizations/' || v_org || '/staff/' || p_application_id || '/';
  if p_path !~* (v_base || 'foto\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid photo path'; end if;
  if p_thumb is not null and p_thumb !~* (v_base || 'foto-thumb\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid photo path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = p_path) then raise exception 'Photo upload not found'; end if;
  if p_thumb is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = p_thumb) then raise exception 'Photo upload not found'; end if;
  update app.staff_applications set photo_path = p_path, photo_thumb_path = p_thumb, updated_at = now()
   where id = p_application_id and organization_id = v_org and photo_path is null and created_at >= now() - interval '1 hour';
  if not found then raise exception 'Application not available for photo'; end if;
  return true;
end $$;
revoke all on function private.public_attach_staff_photo(text, uuid, text, text) from public, anon, authenticated;
create or replace function public.v2_public_attach_staff_photo(club_key text, application_id uuid, photo_path text, photo_thumb_path text default null)
returns boolean language sql security definer set search_path = '' as $$ select private.public_attach_staff_photo(club_key, application_id, photo_path, photo_thumb_path) $$;
revoke all on function public.v2_public_attach_staff_photo(text, uuid, text, text) from public;
grant execute on function public.v2_public_attach_staff_photo(text, uuid, text, text) to anon, authenticated;

create or replace function private.staff_applications(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_hire_staff(p_organization_id, false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'folio', a.folio, 'fullName', a.full_name, 'phone', a.phone, 'email', a.email,
      'age', a.age, 'city', a.city, 'positions', to_jsonb(a.positions), 'experience', a.experience, 'studies', a.studies,
      'availability', to_jsonb(a.availability), 'about', a.about, 'cvPath', a.cv_path, 'cvName', a.cv_name,
      'photoPath', a.photo_path, 'photoThumbPath', a.photo_thumb_path,
      'status', a.status, 'notes', a.notes, 'createdAt', a.created_at, 'updatedAt', a.updated_at) order by a.created_at desc)
    from app.staff_applications a where a.organization_id = p_organization_id), '[]'::jsonb);
end $$;

create or replace function private.update_staff_application(p_organization_id uuid, p_id uuid, p_status text, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v app.staff_applications%rowtype;
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  if p_status is not null and p_status not in ('nueva','revision','entrevista','prueba','contratado','descartado') then raise exception 'Estado inválido'; end if;
  update app.staff_applications set status = coalesce(p_status, status), notes = case when p_notes is null then notes else nullif(left(btrim(p_notes), 1000), '') end,
         reviewed_by = (select auth.uid()), updated_at = now()
   where id = p_id and organization_id = p_organization_id returning * into v;
  if v.id is null then raise exception 'Postulación no encontrada'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffApplicationUpdated', 'staff_application', p_id, jsonb_build_object('status', v.status), (select auth.uid()));
  return jsonb_build_object('id', v.id, 'status', v.status, 'notes', v.notes, 'updatedAt', v.updated_at);
end $$;
