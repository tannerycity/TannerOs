-- PROPUESTA · PROP-FC-002 decisión 6 · Observación de Dirección Deportiva (09/11/2026)
--
-- NO APLICADA. Requiere autorización de Presidencia para correr en producción.
--
-- Hoy el cierre rápido ya existe (sessions.closure: si / a_veces / todavia_no,
-- con nota del Formador; h-i4). Falta la segunda mitad de la decisión 6: la
-- observación de Dirección Deportiva sobre esa sesión.
--
-- Diseño:
--   · Tabla nueva, sólo agregar (append-only): no toca app.sessions, no cambia
--     el cierre del Formador y no se confunde con la asistencia.
--   · Corregir = anular con motivo (queda quién y cuándo) y escribir otra.
--   · Escribe sólo Dirección (formacion_direccion, escritura). Leen Dirección
--     y el Formador de esa sesión (can_plan_session). Familias no la ven:
--     es seguimiento interno del aprendizaje, no un expediente disciplinario.
--   · No califica al niño ni al Formador: es una observación de texto
--     ("apareció / no apareció la conducta, qué ajustar"). Sin puntos.

create table if not exists app.session_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references app.sessions(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null check (btrim(note) <> '' and char_length(note) <= 600),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or nullif(btrim(void_reason), '') is not null)
);
create index if not exists session_observations_por_sesion on app.session_observations(organization_id, session_id) where voided_at is null;
alter table app.session_observations enable row level security;
-- Como el resto de app.*: sin políticas; todo pasa por funciones.

create or replace function private.command_add_session_observation(p_organization_id uuid, p_session_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_s app.sessions%rowtype; v_id uuid;
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Escribe la observación'; end if;
  if char_length(p_note) > 600 then raise exception 'La observación es muy larga (máximo 600)'; end if;
  select * into v_s from app.sessions where id = p_session_id and organization_id = p_organization_id;
  if v_s.id is null then raise exception 'Session not found'; end if;
  if v_s.status = 'cancelled' then raise exception 'La sesión está cancelada'; end if;
  insert into app.session_observations(organization_id, session_id, author_user_id, note)
  values (p_organization_id, p_session_id, v_uid, btrim(p_note)) returning id into v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'SessionObservationAdded', 'session', p_session_id, jsonb_build_object('observationId', v_id), v_uid);
  return jsonb_build_object('id', v_id, 'sessionId', p_session_id);
end $$;

create or replace function private.command_void_session_observation(p_organization_id uuid, p_observation_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_o app.session_observations%rowtype;
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Di por qué se anula'; end if;
  select * into v_o from app.session_observations where id = p_observation_id and organization_id = p_organization_id for update;
  if v_o.id is null then raise exception 'Observation not found'; end if;
  if v_o.voided_at is not null then return jsonb_build_object('id', v_o.id, 'voided', true); end if;  -- doble toque: idempotente
  update app.session_observations set voided_at = now(), voided_by = v_uid, void_reason = btrim(p_reason) where id = v_o.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'SessionObservationVoided', 'session', v_o.session_id, jsonb_build_object('observationId', v_o.id, 'reason', btrim(p_reason)), v_uid);
  return jsonb_build_object('id', v_o.id, 'voided', true);
end $$;

-- Lo que se ve de una sesión: el cierre del Formador y las observaciones vigentes.
create or replace function private.query_session_review(p_organization_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s app.sessions%rowtype;
begin
  if not private.can_plan_session(p_organization_id, p_session_id) then raise exception 'Not authorized'; end if;
  select * into v_s from app.sessions where id = p_session_id and organization_id = p_organization_id;
  if v_s.id is null then raise exception 'Session not found'; end if;
  return jsonb_build_object(
    'sessionId', v_s.id, 'closure', v_s.closure, 'closureNote', v_s.closure_note, 'closedAt', v_s.closed_at,
    'observations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'note', o.note, 'at', o.created_at,
        'by', coalesce((select pr.display_name from public.profiles pr where pr.user_id = o.author_user_id), 'Dirección'))
        order by o.created_at)
      from app.session_observations o where o.session_id = v_s.id and o.voided_at is null), '[]'::jsonb));
end $$;

revoke all on function private.command_add_session_observation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.command_void_session_observation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.query_session_review(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_add_session_observation(organization_id uuid, session_id uuid, note text)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_add_session_observation(organization_id, session_id, note) $$;
create or replace function public.v2_void_session_observation(organization_id uuid, observation_id uuid, reason text)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_void_session_observation(organization_id, observation_id, reason) $$;
create or replace function public.v2_session_review(organization_id uuid, session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_session_review(organization_id, session_id) $$;
revoke all on function public.v2_add_session_observation(uuid, uuid, text) from public, anon;
revoke all on function public.v2_void_session_observation(uuid, uuid, text) from public, anon;
revoke all on function public.v2_session_review(uuid, uuid) from public, anon;
grant execute on function public.v2_add_session_observation(uuid, uuid, text) to authenticated;
grant execute on function public.v2_void_session_observation(uuid, uuid, text) to authenticated;
grant execute on function public.v2_session_review(uuid, uuid) to authenticated;
