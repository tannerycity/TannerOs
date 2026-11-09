-- SOLICITUD PÚBLICA DE APOYO (09/11/2026, Mich): en Centro Tanner, "Apoyo de
-- Ingreso" y las demás modalidades que la familia puede pedir directo decían
-- "Siguiente paso: SOLICITAR APOYO" pero no había ningún botón — y la única
-- forma real de pedirlo (v2_portal_scholarship_apply) exige sesión en
-- TannerOS y un jugador YA inscrito (portal_owns_player). Para "Apoyo de
-- Ingreso" eso no tiene sentido: es justo para quien AÚN NO se inscribe.
-- "Que inicie sesión hace que la gente lo pierda."
--
-- Mismo patrón que las postulaciones públicas de staff (t4_postulaciones_de_staff):
-- tabla propia, sin sesión, con folio y cola de revisión interna — Presidencia
-- la ve en /v2/becas/, la vincula a un jugador si/cuando corresponde, y
-- acepta o rechaza. No reemplaza v2_portal_scholarship_apply (que sigue
-- siendo el camino normal para una familia ya inscrita con cuenta).

create table app.scholarship_public_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio text not null,
  modality text not null check (modality in ('ingreso','apoyo_familiar','academica','lealtad','curtibrother')),
  guardian_name text not null check (length(btrim(guardian_name)) between 3 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  child_name text not null check (length(btrim(child_name)) between 2 and 120),
  child_status text not null default 'sin_inscribir' check (child_status in ('sin_inscribir','inscrito')),
  reason text not null check (length(btrim(reason)) between 20 and 2000),
  consent jsonb not null default '{}'::jsonb,
  status text not null default 'nueva' check (status in ('nueva','contactada','vinculada','rechazada')),
  linked_player_id uuid references app.players(id) on delete set null,
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio)
);
create index scholarship_public_requests_por_club on app.scholarship_public_requests(organization_id, status, created_at desc);
alter table app.scholarship_public_requests enable row level security;
revoke all on app.scholarship_public_requests from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.scholarship_public_requests
  for each row execute function private.guard_club_read_only();

-- La familia manda su solicitud sin sesión.
create or replace function private.public_scholarship_request(p_public_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_id uuid; v_folio text; v_n int;
  v_guardian text := btrim(coalesce(p->>'guardianName', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g');
  v_child text := btrim(coalesce(p->>'childName', ''));
  v_modality text := coalesce(p->>'modality', '');
  v_reason text := btrim(coalesce(p->>'reason', ''));
  v_status text := coalesce(p->>'childStatus', 'sin_inscribir');
  r record;
begin
  perform private.enforce_public_rate_limit('scholarship_public_request', 60, interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  if v_modality not in ('ingreso','apoyo_familiar','academica','lealtad','curtibrother') then raise exception 'Modalidad inválida'; end if;
  if length(v_guardian) < 3 then raise exception 'Escribe tu nombre completo'; end if;
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Escribe un WhatsApp válido'; end if;
  if length(v_child) < 2 then raise exception 'Escribe el nombre de tu hijo(a)'; end if;
  if length(v_reason) < 20 then raise exception 'Cuéntanos un poco más: el motivo necesita al menos 20 caracteres'; end if;
  if length(v_reason) > 2000 then raise exception 'El motivo es muy largo, resúmelo en 2000 caracteres'; end if;
  if v_status not in ('sin_inscribir','inscrito') then v_status := 'sin_inscribir'; end if;
  if coalesce((p->'consent'->>'dataAccepted')::boolean, false) is not true then raise exception 'Falta aceptar el aviso de privacidad'; end if;

  -- Una solicitud por teléfono+modalidad al día: un doble toque no la duplica.
  if exists (select 1 from app.scholarship_public_requests x where x.organization_id=v_org and x.phone=v_phone and x.modality=v_modality and x.created_at > now() - interval '1 day') then
    select id, folio into v_id, v_folio from app.scholarship_public_requests x where x.organization_id=v_org and x.phone=v_phone and x.modality=v_modality order by created_at desc limit 1;
    return jsonb_build_object('requestId', v_id, 'folio', v_folio, 'duplicate', true);
  end if;

  select count(*) + 1 into v_n from app.scholarship_public_requests where organization_id = v_org;
  v_folio := 'BC-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(v_n::text, 4, '0');

  insert into app.scholarship_public_requests(organization_id, folio, modality, guardian_name, phone, email, child_name, child_status, reason, consent)
  values (v_org, v_folio, v_modality, v_guardian, v_phone, nullif(lower(btrim(p->>'email')), ''), v_child, v_status, v_reason,
    jsonb_build_object('dataAccepted', true, 'privacyNoticeVersion', p->'consent'->>'privacyNoticeVersion', 'acceptedAt', now(), 'source', 'public-web'))
  returning id into v_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'ScholarshipPublicRequestReceived', 'scholarship_public_request', v_id, jsonb_build_object('folio', v_folio, 'modality', v_modality));

  -- Aviso a quien revisa becas: Presidencia o quien tenga Dirección.
  for r in select distinct m.user_id from public.organization_memberships m
           left join public.role_module_permissions rp on rp.organization_id=m.organization_id and rp.role=m.role and rp.module_code='direccion' and rp.can_read
           where m.organization_id = v_org and m.active and (m.role='Presidencia' or rp.role is not null) loop
    insert into app.announcements(organization_id, title, body, source, audience_type, audience_value, expires_at)
    values (v_org, 'Nueva solicitud de apoyo', format('%s pide %s para %s', v_guardian, v_modality, v_child), 'becas', 'user', r.user_id::text, now() + interval '7 days');
    perform private.notify_push(v_org, 'Nueva solicitud de apoyo', format('%s pide %s para %s', v_guardian, v_modality, v_child), 'user', r.user_id::text, '/becas/');
  end loop;

  return jsonb_build_object('requestId', v_id, 'folio', v_folio);
end $$;

-- Presidencia/Dirección: la lista y moverla (vincular a jugador, aceptar, rechazar).
create or replace function private.scholarship_public_requests_list(p_organization_id uuid, p_status_filter text default null)
returns jsonb language plpgsql stable security definer set search_path = 'pg_catalog','app','public','private' as $$
declare v_data jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'folio',r.folio,'modality',r.modality,'guardianName',r.guardian_name,'phone',r.phone,'email',r.email,
    'childName',r.child_name,'childStatus',r.child_status,'reason',r.reason,'status',r.status,'notes',r.notes,
    'linkedPlayerId',r.linked_player_id,'createdAt',r.created_at,'updatedAt',r.updated_at
  ) order by r.created_at desc), '[]'::jsonb) into v_data
  from app.scholarship_public_requests r
  where r.organization_id=p_organization_id and (p_status_filter is null or r.status=p_status_filter);
  return v_data;
end $$;

create or replace function private.scholarship_public_request_update(p_organization_id uuid, p_id uuid, p_status text default null, p_notes text default null, p_link_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','app','public','private' as $$
declare v app.scholarship_public_requests%rowtype;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_status is not null and p_status not in ('nueva','contactada','vinculada','rechazada') then raise exception 'Estado inválido'; end if;
  if p_link_player_id is not null and not exists(select 1 from app.players where id=p_link_player_id and organization_id=p_organization_id) then
    raise exception 'Jugador no encontrado';
  end if;
  update app.scholarship_public_requests set
    status=coalesce(p_status,status),
    notes=case when p_notes is null then notes else nullif(left(btrim(p_notes),1000),'') end,
    linked_player_id=coalesce(p_link_player_id, linked_player_id),
    reviewed_by=(select auth.uid()), updated_at=now()
  where id=p_id and organization_id=p_organization_id returning * into v;
  if v.id is null then raise exception 'Solicitud no encontrada'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipPublicRequestUpdated','scholarship_public_request',p_id,jsonb_build_object('status',v.status,'linkedPlayerId',v.linked_player_id),(select auth.uid()));
  return jsonb_build_object('id',v.id,'status',v.status,'linkedPlayerId',v.linked_player_id);
end $$;

revoke all on function private.public_scholarship_request(text,jsonb), private.scholarship_public_requests_list(uuid,text),
  private.scholarship_public_request_update(uuid,uuid,text,text,uuid) from public, anon, authenticated;

create or replace function public.v2_public_scholarship_request(club_key text, request jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.public_scholarship_request(club_key, request) $$;
revoke all on function public.v2_public_scholarship_request(text,jsonb) from public, authenticated;
grant execute on function public.v2_public_scholarship_request(text,jsonb) to anon, authenticated;

create or replace function public.v2_scholarship_public_requests(organization_id uuid, status_filter text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_public_requests_list(organization_id, status_filter) $$;
revoke all on function public.v2_scholarship_public_requests(uuid,text) from public, anon;
grant execute on function public.v2_scholarship_public_requests(uuid,text) to authenticated;

create or replace function public.v2_scholarship_public_request_update(organization_id uuid, id uuid, status text default null, notes text default null, link_player_id uuid default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_public_request_update(organization_id, id, status, notes, link_player_id) $$;
revoke all on function public.v2_scholarship_public_request_update(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.v2_scholarship_public_request_update(uuid,uuid,text,text,uuid) to authenticated;
