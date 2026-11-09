-- Prueba LOCAL (PostgreSQL desechable, nunca producción) de
-- supabase/migrations/20261109125053_h77_observacion_direccion_deportiva.sql.
--
--   psql -v ON_ERROR_STOP=1 -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc2.sql
--
-- Arma lo mínimo del esquema real (organizaciones, sesiones, eventos, perfiles
-- y los permisos por módulo) con stubs, aplica la propuesta y revisa permisos,
-- validaciones, anulación auditada, doble toque y que no toca el cierre.
drop database if exists fc2; create database fc2;
\c fc2
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth; create schema app; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;
create table public.organizations(id uuid primary key);
create table public.profiles(user_id uuid primary key, display_name text);
create table app.sessions(id uuid primary key, organization_id uuid references public.organizations(id), category_id uuid,
  status text not null default 'scheduled', closure text, closure_note text, closed_at timestamptz, responsible_user_id uuid);
create table app.domain_events(id bigserial primary key, organization_id uuid, event_type text, aggregate_type text, aggregate_id uuid, payload jsonb, actor_user_id uuid);
-- Permisos por módulo: stub con una tabla (en la base real vienen de roles).
create table private.acceso(user_id uuid, modulo text, escribe boolean);
create function private.has_module_access(p_org uuid, p_modulo text, p_write boolean) returns boolean language sql stable as $$
  select exists (select 1 from private.acceso a where a.user_id = auth.uid() and a.modulo = p_modulo and (a.escribe or not p_write)) $$;
create function private.can_plan_session(p_org uuid, p_session uuid) returns boolean language sql stable as $$
  select private.has_module_access(p_org, 'formacion_direccion', true)
      or (private.has_module_access(p_org, 'formacion', true) and exists (select 1 from app.sessions s where s.id = p_session and s.responsible_user_id = auth.uid())) $$;

\set org '''00000000-0000-0000-0000-0000000000a1'''
\set dir '''00000000-0000-0000-0000-0000000000d1'''
\set profe '''00000000-0000-0000-0000-0000000000f1'''
\set otro '''00000000-0000-0000-0000-0000000000f2'''
insert into public.organizations values (:org);
insert into auth.users values (:dir), (:profe), (:otro);
insert into public.profiles values (:dir, 'Brandon');
insert into private.acceso values (:dir, 'formacion_direccion', true), (:profe, 'formacion', true), (:otro, 'formacion', true);
insert into app.sessions(id, organization_id, status, closure, closure_note, closed_at, responsible_user_id)
values ('00000000-0000-0000-0000-0000000000b1', :org, 'completed', 'a_veces', 'Les costó mirar antes', now(), :profe),
       ('00000000-0000-0000-0000-0000000000c1', :org, 'cancelled', null, null, null, :profe);

\i supabase/migrations/20261109125053_h77_observacion_direccion_deportiva.sql

do $$
declare o uuid := '00000000-0000-0000-0000-0000000000a1'; s uuid := '00000000-0000-0000-0000-0000000000b1';
  dir text := '00000000-0000-0000-0000-0000000000d1'; profe text := '00000000-0000-0000-0000-0000000000f1'; otro text := '00000000-0000-0000-0000-0000000000f2';
  r jsonb; id1 uuid; ok boolean;
begin
  -- 1. El Formador NO puede escribir observaciones de Dirección.
  perform set_config('prueba.uid', profe, true);
  begin perform private.command_add_session_observation(o, s, 'hola'); raise exception 'FALLA 1: el Formador escribió'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 2. Dirección escribe; vacía o muy larga se rechaza.
  perform set_config('prueba.uid', dir, true);
  begin perform private.command_add_session_observation(o, s, '   '); raise exception 'FALLA 2a'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_add_session_observation(o, s, repeat('x', 601)); raise exception 'FALLA 2b'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  r := private.command_add_session_observation(o, s, '  Apareció el engaño; faltó acelerar después.  ');
  id1 := (r->>'id')::uuid;
  -- 2b. Checklist de 5 puntos (09/11/2026): sólo esas llaves y Sí / A veces / Todavía no.
  begin perform private.command_add_session_observation(o, s, null, '{"puntos":"si"}'); raise exception 'FALLA 2c: llave inventada'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_add_session_observation(o, s, null, '{"seguridad":"5"}'); raise exception 'FALLA 2d: calificación numérica'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_add_session_observation(o, s, null, '{}'); raise exception 'FALLA 2e: vacía'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  r := private.command_add_session_observation(o, s, null, '{"aprendizaje":"a_veces","participacion":"si","seguridad":"si","adaptacion":"todavia_no","convivencia":"si"}');
  if (select checklist->>'adaptacion' from app.session_observations where id = (r->>'id')::uuid) <> 'todavia_no' then raise exception 'FALLA 2f'; end if;
  perform private.command_void_session_observation(o, (r->>'id')::uuid, 'Prueba del checklist');
  -- 3. Sesión cancelada: no.
  begin perform private.command_add_session_observation(o, '00000000-0000-0000-0000-0000000000c1', 'x'); raise exception 'FALLA 3'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 4. El cierre del Formador no se toca.
  select closure = 'a_veces' and closure_note = 'Les costó mirar antes' into ok from app.sessions where id = s;
  if not ok then raise exception 'FALLA 4: cambió el cierre'; end if;
  -- 5. Su Formador la lee (con el nombre de quién) y otro Formador no.
  perform set_config('prueba.uid', profe, true);
  r := private.query_session_review(o, s);
  if r->>'closure' <> 'a_veces' or jsonb_array_length(r->'observations') <> 1 or r->'observations'->0->>'by' <> 'Brandon'
     or r->'observations'->0->>'note' <> 'Apareció el engaño; faltó acelerar después.' then raise exception 'FALLA 5a: %', r; end if;
  perform set_config('prueba.uid', otro, true);
  begin perform private.query_session_review(o, s); raise exception 'FALLA 5b: otro Formador leyó'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 6. Anular pide motivo, queda auditado y el doble toque no duplica.
  perform set_config('prueba.uid', dir, true);
  begin perform private.command_void_session_observation(o, id1, ''); raise exception 'FALLA 6a'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  perform private.command_void_session_observation(o, id1, 'Era de otra sesión');
  perform private.command_void_session_observation(o, id1, 'Era de otra sesión');
  if (select count(*) from app.domain_events where event_type = 'SessionObservationVoided') <> 2 then raise exception 'FALLA 6b: doble anulación'; end if;
  if (select voided_by::text from app.session_observations where id = id1) <> dir then raise exception 'FALLA 6c'; end if;
  if jsonb_array_length(private.query_session_review(o, s)->'observations') <> 0 then raise exception 'FALLA 6d: se sigue viendo'; end if;
  if (select count(*) from app.session_observations) <> 2 then raise exception 'FALLA 6e: se borró en vez de anular'; end if;
  -- 7. Eventos de dominio.
  if (select count(*) from app.domain_events where event_type = 'SessionObservationAdded') <> 2 then raise exception 'FALLA 7'; end if;
  raise notice 'FC2 OK · 7 grupos de revisiones';
end $$;
-- 8. anon no ejecuta las funciones públicas; authenticated sí.
select case when has_function_privilege('anon', 'public.v2_add_session_observation(uuid,uuid,text,jsonb)', 'execute')
         or has_function_privilege('anon', 'public.v2_session_review(uuid,uuid)', 'execute')
         or not has_function_privilege('authenticated', 'public.v2_session_review(uuid,uuid)', 'execute')
       then 'FALLA 8: permisos' else 'FC2 permisos OK' end as permisos;
