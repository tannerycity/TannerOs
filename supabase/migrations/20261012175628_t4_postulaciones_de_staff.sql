-- Postulaciones de staff (Presidencia, 12/10/2026): "fichajes de entrenadores
-- / formadores por medio de TannerOS, que los profes se inscriban y manden su
-- CV, porque por WhatsApp a veces se van".
--
--   · /trabaja/ (pública): la convocatoria del club (puestos, requisitos, qué
--     ofrece) y el formulario con CV (PDF o foto). Lo que escribe el club sale
--     de organizations.settings.convocatoriaStaff.
--   · /candidatos/ (staff): Presidencia y Dirección deportiva las ven, abren
--     el CV, escriben por WhatsApp y las mueven: nueva → en revisión →
--     entrevista → contratado / descartado.
--   · Aviso a quien contrata cuando llega una.
--
-- El CV va en tanneros-private bajo organizations/<club>/staff/<postulación>/,
-- con el mismo patrón que la foto del registro público: se crea la postulación,
-- el navegador sube el archivo (sólo a esa ruta y sólo la primera hora) y se
-- liga.

create table app.staff_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio text not null,
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  age smallint check (age between 16 and 80),
  city text,
  positions text[] not null default '{}',
  experience text,
  studies text,
  availability text[] not null default '{}',
  about text check (about is null or length(about) <= 1200),
  cv_path text,
  cv_name text,
  cv_uploaded_at timestamptz,
  status text not null default 'nueva' check (status in ('nueva','revision','entrevista','contratado','descartado')),
  notes text,
  consent jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio)
);
create index staff_applications_por_club on app.staff_applications(organization_id, status, created_at desc);
alter table app.staff_applications enable row level security;
revoke all on app.staff_applications from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.staff_applications
  for each row execute function private.guard_club_read_only();

-- Quién contrata: Presidencia (users) o Dirección deportiva.
create or replace function private.can_hire_staff(p_organization_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_module_access(p_organization_id, 'users', p_write)
      or private.has_module_access(p_organization_id, 'formacion_direccion', p_write)
$$;
revoke all on function private.can_hire_staff(uuid, boolean) from public, anon, authenticated;

-- La convocatoria pública del club (lo que ve quien quiere trabajar ahí).
create or replace function private.public_staff_call(p_public_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_cfg jsonb; v_name text;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name, coalesce(settings->'convocatoriaStaff', '{}'::jsonb) into v_name, v_cfg from public.organizations where id = v_org;
  return jsonb_build_object('club', v_name, 'open', coalesce((v_cfg->>'abierta')::boolean, true),
    'positions', coalesce(v_cfg->'puestos', '["Formador","Entrenador de porteros","Preparador físico","Coordinador"]'::jsonb),
    'requirements', coalesce(v_cfg->'requisitos', '[]'::jsonb),
    'offer', v_cfg->>'ofrecemos', 'intro', v_cfg->>'intro');
end $$;

create or replace function private.public_apply_staff(p_public_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_id uuid; v_folio text; v_n int; v_cfg jsonb; v_name text := btrim(coalesce(p->>'fullName', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g');
  v_pos text[]; r record;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select coalesce(settings->'convocatoriaStaff', '{}'::jsonb) into v_cfg from public.organizations where id = v_org;
  if not coalesce((v_cfg->>'abierta')::boolean, true) then raise exception 'La convocatoria está cerrada'; end if;
  if length(v_name) < 3 then raise exception 'Escribe tu nombre completo'; end if;
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Escribe un WhatsApp válido'; end if;
  if coalesce((p->'consent'->>'dataAccepted')::boolean, false) is not true then raise exception 'Falta aceptar el aviso de privacidad'; end if;
  select coalesce(array_agg(left(btrim(x), 80)) filter (where btrim(x) <> ''), '{}') into v_pos
    from jsonb_array_elements_text(coalesce(p->'positions', '[]'::jsonb)) x;
  if cardinality(v_pos) = 0 then raise exception 'Elige al menos un puesto'; end if;
  -- Una postulación por teléfono al día: un doble toque no la duplica.
  if exists (select 1 from app.staff_applications a where a.organization_id = v_org and a.phone = v_phone and a.created_at > now() - interval '1 day') then
    select id, folio into v_id, v_folio from app.staff_applications a where a.organization_id = v_org and a.phone = v_phone order by created_at desc limit 1;
    return jsonb_build_object('applicationId', v_id, 'folio', v_folio, 'duplicate', true);
  end if;

  select count(*) + 1 into v_n from app.staff_applications where organization_id = v_org;
  v_folio := 'ST-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  insert into app.staff_applications(organization_id, folio, full_name, phone, email, age, city, positions, experience, studies, availability, about, consent)
  values (v_org, v_folio, v_name, v_phone, nullif(lower(btrim(p->>'email')), ''), nullif(p->>'age', '')::smallint, nullif(btrim(p->>'city'), ''),
          v_pos, nullif(btrim(p->>'experience'), ''), left(nullif(btrim(p->>'studies'), ''), 300),
          coalesce((select array_agg(left(btrim(x), 60)) from jsonb_array_elements_text(coalesce(p->'availability', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
          left(nullif(btrim(p->>'about'), ''), 1200),
          jsonb_build_object('dataAccepted', true, 'privacyNoticeVersion', p->'consent'->>'privacyNoticeVersion', 'acceptedAt', now(), 'source', 'public-web'))
  returning id into v_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'StaffApplicationReceived', 'staff_application', v_id, jsonb_build_object('folio', v_folio, 'positions', to_jsonb(v_pos)));

  -- Aviso a quien contrata: Presidencia y quien tenga Dirección deportiva.
  for r in select distinct m.user_id from public.organization_memberships m
           left join private.membership_module_overrides mo on mo.membership_id = m.id and mo.module_code = 'formacion_direccion' and mo.can_read
           left join public.role_module_permissions rp on rp.organization_id = m.organization_id and rp.role = m.role and rp.module_code = 'users' and rp.can_read
           where m.organization_id = v_org and m.active and (m.is_owner or mo.membership_id is not null or rp.role is not null) loop
    insert into app.announcements(organization_id, title, body, source, audience_type, audience_value, expires_at)
    values (v_org, 'Nueva postulación de staff', format('%s · %s', v_name, array_to_string(v_pos, ', ')), 'staff', 'user', r.user_id::text, now() + interval '7 days');
    perform private.notify_push(v_org, 'Nueva postulación de staff', format('%s · %s', v_name, array_to_string(v_pos, ', ')), 'user', r.user_id::text, '/candidatos/');
  end loop;
  return jsonb_build_object('applicationId', v_id, 'folio', v_folio);
end $$;

-- El CV: sólo a la ruta de esa postulación, sin CV todavía y en su primera hora.
create or replace function private.public_staff_cv_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_app uuid;
begin
  if p_name !~* '^organizations/[0-9a-f-]{36}/staff/[0-9a-f-]{36}/cv\.(pdf|jpg|jpeg|png|webp)$' then return false; end if;
  v_org := split_part(p_name, '/', 2)::uuid; v_app := split_part(p_name, '/', 4)::uuid;
  return exists (select 1 from app.staff_applications a where a.id = v_app and a.organization_id = v_org
                 and a.cv_path is null and a.created_at >= now() - interval '1 hour');
exception when others then return false;
end $$;

create or replace function private.public_attach_staff_cv(p_public_key text, p_application_id uuid, p_path text, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  if p_path !~* ('^organizations/' || v_org || '/staff/' || p_application_id || '/cv\.(pdf|jpg|jpeg|png|webp)$') then raise exception 'Invalid CV path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = p_path) then raise exception 'CV upload not found'; end if;
  update app.staff_applications set cv_path = p_path, cv_name = left(nullif(btrim(p_name), ''), 160), cv_uploaded_at = now(), updated_at = now()
   where id = p_application_id and organization_id = v_org and cv_path is null and created_at >= now() - interval '1 hour';
  if not found then raise exception 'Application not available for CV'; end if;
  return true;
end $$;

create policy tanneros_public_staff_cv_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tanneros-private' and private.public_staff_cv_upload_allowed(name));
create policy tanneros_staff_cv_read on storage.objects for select to authenticated
  using (bucket_id = 'tanneros-private' and split_part(name, '/', 3) = 'staff' and private.storage_org_id(name) is not null
         and private.can_hire_staff(private.storage_org_id(name), false));

-- Staff: la lista y mover una postulación.
create or replace function private.staff_applications(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_hire_staff(p_organization_id, false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'folio', a.folio, 'fullName', a.full_name, 'phone', a.phone, 'email', a.email,
      'age', a.age, 'city', a.city, 'positions', to_jsonb(a.positions), 'experience', a.experience, 'studies', a.studies,
      'availability', to_jsonb(a.availability), 'about', a.about, 'cvPath', a.cv_path, 'cvName', a.cv_name,
      'status', a.status, 'notes', a.notes, 'createdAt', a.created_at, 'updatedAt', a.updated_at) order by a.created_at desc)
    from app.staff_applications a where a.organization_id = p_organization_id), '[]'::jsonb);
end $$;

create or replace function private.update_staff_application(p_organization_id uuid, p_id uuid, p_status text, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v app.staff_applications%rowtype;
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  if p_status is not null and p_status not in ('nueva','revision','entrevista','contratado','descartado') then raise exception 'Estado inválido'; end if;
  update app.staff_applications set status = coalesce(p_status, status), notes = case when p_notes is null then notes else nullif(left(btrim(p_notes), 1000), '') end,
         reviewed_by = (select auth.uid()), updated_at = now()
   where id = p_id and organization_id = p_organization_id returning * into v;
  if v.id is null then raise exception 'Postulación no encontrada'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffApplicationUpdated', 'staff_application', p_id, jsonb_build_object('status', v.status), (select auth.uid()));
  return jsonb_build_object('id', v.id, 'status', v.status, 'notes', v.notes);
end $$;

revoke all on function private.public_staff_call(text), private.public_apply_staff(text, jsonb), private.public_attach_staff_cv(text, uuid, text, text),
  private.staff_applications(uuid), private.update_staff_application(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.public_staff_cv_upload_allowed(text) from public;
grant execute on function private.public_staff_cv_upload_allowed(text) to anon, authenticated;

create or replace function public.v2_public_staff_call(club_key text)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.public_staff_call(club_key) $$;
create or replace function public.v2_public_apply_staff(club_key text, application jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.public_apply_staff(club_key, application) $$;
create or replace function public.v2_public_attach_staff_cv(club_key text, application_id uuid, cv_path text, cv_name text default null)
returns boolean language sql security definer set search_path = '' as $$ select private.public_attach_staff_cv(club_key, application_id, cv_path, cv_name) $$;
create or replace function public.v2_staff_applications(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.staff_applications(organization_id) $$;
create or replace function public.v2_update_staff_application(organization_id uuid, application_id uuid, status text default null, notes text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.update_staff_application(organization_id, application_id, status, notes) $$;
revoke all on function public.v2_public_staff_call(text), public.v2_public_apply_staff(text, jsonb), public.v2_public_attach_staff_cv(text, uuid, text, text) from public;
grant execute on function public.v2_public_staff_call(text), public.v2_public_apply_staff(text, jsonb), public.v2_public_attach_staff_cv(text, uuid, text, text) to anon, authenticated;
revoke all on function public.v2_staff_applications(uuid), public.v2_update_staff_application(uuid, uuid, text, text) from public, anon;
grant execute on function public.v2_staff_applications(uuid), public.v2_update_staff_application(uuid, uuid, text, text) to authenticated;

-- La convocatoria de Tannery City, como la armó Presidencia para su flyer.
update public.organizations
   set settings = settings || jsonb_build_object('convocatoriaStaff', jsonb_build_object(
         'abierta', true,
         'intro', 'Buscamos formadores que quieran crecer con un club formativo de alto rendimiento en León.',
         'puestos', jsonb_build_array('Formador Baby Tanners (3–6 años)', 'Formador Tanners (T8–T15)'),
         'requisitos', jsonb_build_array('Experiencia con niños', 'Licencia o curso de entrenador', 'Estudiante o egresado de Ciencias del Deporte',
                                         'Disponibilidad lunes a jueves por la tarde', 'Disponibilidad sábados (partidos)', 'Mayor de edad'),
         'ofrecemos', 'Contrato de 1 año mínimo · bonos · uniformes · capacitación en la metodología Tannery · capacitaciones externas'))
 where slug = 'tannery-city-fc' and not (settings ? 'convocatoriaStaff');
