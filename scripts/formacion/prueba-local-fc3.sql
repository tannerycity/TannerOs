-- Prueba LOCAL (PostgreSQL desechable, nunca producción) de
-- supabase/propuestas/FC3_parches_tanner.sql.
--
--   psql -v ON_ERROR_STOP=1 -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc3.sql
drop database if exists fc3; create database fc3;
\c fc3
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth; create schema app; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;
create table public.organizations(id uuid primary key, slug text unique);
create table public.profiles(user_id uuid primary key, display_name text);
create table app.players(id uuid primary key, organization_id uuid, first_name text);
create table app.categories(id uuid primary key, organization_id uuid, name text);
create table app.domain_events(id bigserial primary key, organization_id uuid, event_type text, aggregate_type text, aggregate_id uuid, payload jsonb, actor_user_id uuid);
create table private.acceso(user_id uuid, modulo text, escribe boolean);
create table private.presidencia(user_id uuid);
create table private.tutor(user_id uuid, player_id uuid);
create function private.has_module_access(p_org uuid, p_modulo text, p_write boolean) returns boolean language sql stable as $$
  select exists (select 1 from private.acceso a where a.user_id = auth.uid() and a.modulo = p_modulo and (a.escribe or not p_write)) $$;
create function private.is_presidency(p_org uuid) returns boolean language sql stable as $$ select exists (select 1 from private.presidencia where user_id = auth.uid()) $$;
create function private.portal_owns_player(p uuid) returns boolean language sql stable as $$ select exists (select 1 from private.tutor where user_id = auth.uid() and player_id = p) $$;
create function private.hoy_mx() returns date language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

insert into public.organizations values ('00000000-0000-0000-0000-0000000000a1', 'tannery-city-fc'), ('00000000-0000-0000-0000-0000000000a2', 'otro-club');
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.profiles values ('00000000-0000-0000-0000-0000000000d1', 'Brandon');
insert into private.acceso values ('00000000-0000-0000-0000-0000000000d1', 'formacion_direccion', true), ('00000000-0000-0000-0000-0000000000f1', 'formacion', true);
insert into private.presidencia values ('00000000-0000-0000-0000-0000000000e1');
insert into app.players values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Leo'), ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000a2', 'De otro club');
insert into private.tutor values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2');

\i supabase/propuestas/FC3_parches_tanner.sql
\i supabase/propuestas/FC3_parches_tanner.sql

do $$
declare o uuid := '00000000-0000-0000-0000-0000000000a1'; leo uuid := '00000000-0000-0000-0000-0000000000b1'; ana uuid := '00000000-0000-0000-0000-0000000000b2';
  dir text := '00000000-0000-0000-0000-0000000000d1'; pres text := '00000000-0000-0000-0000-0000000000e1'; profe text := '00000000-0000-0000-0000-0000000000f1';
  tutor_leo text := '00000000-0000-0000-0000-0000000000c1'; tutor_ana text := '00000000-0000-0000-0000-0000000000c2';
  r jsonb; ini uuid; camp uuid;
begin
  -- 1. Catálogo: exactamente Iniciación y Campeones (idempotente: el archivo corrió 2 veces).
  if (select string_agg(code, ',' order by code) from app.patch_types) <> 'campeones,iniciacion' then raise exception 'FALLA 1'; end if;
  -- 2. El Formador no otorga.
  perform set_config('prueba.uid', profe, true);
  begin perform private.command_award_patch(o, leo, 'iniciacion', '{"variant":"tanner"}'); raise exception 'FALLA 2'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 3. Dirección otorga; Iniciación pide versión; Campeones pide motivo; nada inventado; nada futuro; nada de otro club.
  perform set_config('prueba.uid', dir, true);
  begin perform private.command_award_patch(o, leo, 'iniciacion', '{}'); raise exception 'FALLA 3a: sin versión'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_award_patch(o, leo, 'campeones', '{}'); raise exception 'FALLA 3b: sin motivo'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_award_patch(o, leo, 'goleador', '{"reason":"10 goles"}'); raise exception 'FALLA 3c: parche inventado'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_award_patch(o, leo, 'iniciacion', jsonb_build_object('variant', 'tanner', 'awardedOn', (private.hoy_mx() + 1)::text)); raise exception 'FALLA 3d: futuro'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_award_patch(o, '00000000-0000-0000-0000-0000000000b9', 'iniciacion', '{"variant":"tanner"}'); raise exception 'FALLA 3e: otro club'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  r := private.command_award_patch(o, leo, 'iniciacion', '{"variant":"tanner","note":"Ceremonia de noviembre"}'); ini := (r->>'id')::uuid;
  -- 4. Doble toque: no duplica.
  r := private.command_award_patch(o, leo, 'iniciacion', '{"variant":"tanner"}');
  if not (r->>'already')::boolean or (r->>'id')::uuid <> ini then raise exception 'FALLA 4: %', r; end if;
  -- 5. Campeones: con motivo; otro motivo es otro parche; el mismo motivo no se duplica.
  r := private.command_award_patch(o, leo, 'campeones', '{"reason":"Campeones Copa León 2026"}'); camp := (r->>'id')::uuid;
  r := private.command_award_patch(o, leo, 'campeones', '{"reason":"campeones copa león 2026 "}');
  if not (r->>'already')::boolean then raise exception 'FALLA 5a'; end if;
  perform private.command_award_patch(o, leo, 'campeones', '{"reason":"Campeones Liga Invierno 2027"}');
  if (select count(*) from app.patch_awards where player_id = leo) <> 3 then raise exception 'FALLA 5b'; end if;
  -- 6. Entregado: una vez, con quién.
  perform private.command_mark_patch_delivered(o, ini); perform private.command_mark_patch_delivered(o, ini);
  if (select count(*) from app.domain_events where event_type = 'PatchDelivered') <> 1 then raise exception 'FALLA 6'; end if;
  -- 7. Revocar: Dirección no; Presidencia sí, con motivo; no se borra.
  begin perform private.command_revoke_patch(o, camp, 'Error'); raise exception 'FALLA 7a'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  perform set_config('prueba.uid', pres, true);
  begin perform private.command_revoke_patch(o, camp, ' '); raise exception 'FALLA 7b'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  perform private.command_revoke_patch(o, camp, 'Se registró en el Tanner equivocado');
  if (select count(*) from app.patch_awards where player_id = leo) <> 3 then raise exception 'FALLA 7c: se borró'; end if;
  -- 8. Familia: sólo su hijo, sólo vigentes, sin quién lo registró.
  perform set_config('prueba.uid', tutor_leo, true);
  r := public.v2_portal_patches(leo);
  if jsonb_array_length(r) <> 2 or r::text like '%Brandon%' or r::text like '%Copa León%' then raise exception 'FALLA 8a: %', r; end if;
  perform set_config('prueba.uid', tutor_ana, true);
  begin perform public.v2_portal_patches(leo); raise exception 'FALLA 8b: otro tutor vio a Leo'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 9. Staff: el Formador lee la historia (con revocados), pero no puede otorgar.
  perform set_config('prueba.uid', profe, true);
  r := private.query_player_patches(o, leo);
  if jsonb_array_length(r->'awards') <> 3 or (r->>'canAward')::boolean or (r->>'canRevoke')::boolean then raise exception 'FALLA 9: %', r; end if;
  -- 10. Eventos.
  if (select count(*) from app.domain_events where event_type = 'PatchAwarded') <> 3 or (select count(*) from app.domain_events where event_type = 'PatchRevoked') <> 1 then raise exception 'FALLA 10'; end if;
  raise notice 'FC3 OK · 10 grupos de revisiones';
end $$;
select case when has_function_privilege('anon', 'public.v2_award_patch(uuid,uuid,text,jsonb)', 'execute')
         or has_function_privilege('anon', 'public.v2_portal_patches(uuid)', 'execute')
         or not has_function_privilege('authenticated', 'public.v2_portal_patches(uuid)', 'execute')
       then 'FALLA 11: permisos' else 'FC3 permisos OK' end as permisos;
