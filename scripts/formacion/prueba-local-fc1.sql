-- Prueba LOCAL (PostgreSQL desechable, nunca producción) de
-- supabase/migrations/20261109124655_h76_recursos_del_futbolista.sql, contra los bancos REALES:
-- carga las migraciones b4 (tablas) y c4 (las 36 + 24 tareas de Tannery).
--
--   psql -v ON_ERROR_STOP=1 -h /tmp -p 54329 -U postgres -f scripts/formacion/prueba-local-fc1.sql
drop database if exists fc1; create database fc1;
\c fc1
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth; create schema app; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;
create table public.organizations(id uuid primary key default gen_random_uuid(), slug text unique);
create table app.files(id uuid primary key);
create table app.domain_events(id bigserial primary key, organization_id uuid, event_type text, aggregate_type text, aggregate_id uuid, payload jsonb, actor_user_id uuid);
create table private.acceso(user_id uuid, modulo text, escribe boolean);
create function private.has_module_access(p_org uuid, p_modulo text, p_write boolean) returns boolean language sql stable as $$
  select exists (select 1 from private.acceso a where a.user_id = auth.uid() and a.modulo = p_modulo and (a.escribe or not p_write)) $$;
insert into public.organizations(slug) values ('tannery-city-fc');
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000f1');
insert into private.acceso values ('00000000-0000-0000-0000-0000000000d1', 'formacion_direccion', true), ('00000000-0000-0000-0000-0000000000f1', 'formacion', true);

\i supabase/migrations/20261011210909_b4_formacion_catalogo_y_bancos.sql
\i supabase/migrations/20261011211723_c4_formacion_carga_bancos_tannery.sql
create temp table antes as select kind, code, name, version, question, phrase from app.formation_concepts;
create temp table tareas_antes as select id, code, name, primary_concept, level, buscamos, juega from app.training_tasks;

\i supabase/migrations/20261109124655_h76_recursos_del_futbolista.sql
-- Idempotente: la segunda corrida no duplica ni cambia nada.
create temp table tras1 as select kind, code, attrs from app.formation_concepts;
\i supabase/migrations/20261109124655_h76_recursos_del_futbolista.sql

do $$
declare o uuid := (select id from public.organizations); dir text := '00000000-0000-0000-0000-0000000000d1'; profe text := '00000000-0000-0000-0000-0000000000f1';
  t10 uuid; t05 uuid; b01 uuid; cat jsonb; r jsonb; n int;
begin
  select id into t10 from app.training_tasks where bank = 'tanner' and code = '10';
  select id into t05 from app.training_tasks where bank = 'tanner' and code = '05';
  select id into b01 from app.training_tasks where bank = 'baby' and code = '01';
  -- 1. No toca lo que no se modifica.
  if (select count(*) from app.formation_concepts where kind = 'reto') <> 9 then raise exception 'FALLA 1a: 9 Retos'; end if;
  if (select count(*) from app.training_tasks where status = 'oficial') <> 60 then raise exception 'FALLA 1b: 36 + 24'; end if;
  if exists (select 1 from tareas_antes a join app.training_tasks t using (id) where (a.code, a.name, a.primary_concept, a.level, a.buscamos, a.juega) is distinct from (t.code, t.name, t.primary_concept, t.level, t.buscamos, t.juega)) then raise exception 'FALLA 1c: cambió una ficha'; end if;
  if exists (select 1 from antes a join app.formation_concepts c using (kind, code) where (a.name, a.version, a.question, a.phrase) is distinct from (c.name, c.version, c.question, c.phrase)) then raise exception 'FALLA 1d: cambió un concepto existente'; end if;
  -- 2. Catálogo: 10 familias; los recursos v1.1 conservan nombre y ganan familia.
  if (select count(*) from app.formation_concepts where kind = 'familia_recurso') <> 10 then raise exception 'FALLA 2a'; end if;
  if (select attrs->>'familia' from app.formation_concepts where kind = 'recurso' and code = 'mirar') <> 'ubicacion_apoyo' then raise exception 'FALLA 2b'; end if;
  if (select name from app.formation_concepts where kind = 'recurso' and code = 'enganar') <> 'Engañar' then raise exception 'FALLA 2c'; end if;
  if (select attrs ? 'familia' from app.formation_concepts where kind = 'recurso' and code = 'comunicar') then raise exception 'FALLA 2d: comunicar no está en el mapa'; end if;
  if exists (select 1 from app.formation_concepts where kind = 'recurso' and attrs->>'familia' is not null
             and attrs->>'familia' not in (select code from app.formation_concepts where kind = 'familia_recurso')) then raise exception 'FALLA 2e: familia huérfana'; end if;
  -- 3. Idempotente.
  if exists (select kind, code, attrs from app.formation_concepts except select kind, code, attrs from tras1) then raise exception 'FALLA 3a: la 2a corrida cambió algo'; end if;
  if (select count(*) from app.task_resource_tags) <> 4 then raise exception 'FALLA 3b: % etiquetas', (select count(*) from app.task_resource_tags); end if;
  -- 4. Las 4 del caso de prueba entran SUGERIDAS y el Formador no las ve.
  if exists (select 1 from app.task_resource_tags where status <> 'sugerida') then raise exception 'FALLA 4a'; end if;
  perform set_config('prueba.uid', profe, true);
  cat := private.formation_catalog(o);
  if exists (select 1 from jsonb_array_elements(cat->'tasks') t where jsonb_array_length(t->'resources') > 0) then raise exception 'FALLA 4b: el Formador ve sugeridas'; end if;
  -- 5. El Formador sugiere, pero no aprueba ni reabre.
  r := private.command_set_task_resource(o, t05, 'enganar', 'principal');
  if r->>'status' <> 'sugerida' then raise exception 'FALLA 5a'; end if;
  begin perform private.command_set_task_resource(o, t05, 'enganar', 'principal', 'aprobada'); raise exception 'FALLA 5b'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_set_task_resource(o, b01, 'conduccion', 'principal'); raise exception 'FALLA 5c: Baby'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_set_task_resource(o, t05, 'no_existe', 'principal'); raise exception 'FALLA 5d'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  begin perform private.command_set_task_resource(o, t05, 'enganar', 'muy_principal'); raise exception 'FALLA 5e'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 6. Dirección ve las sugeridas, aprueba y entonces el Formador la ve.
  perform set_config('prueba.uid', dir, true);
  cat := private.formation_catalog(o);
  if (select jsonb_array_length(t->'resources') from jsonb_array_elements(cat->'tasks') t where t->>'id' = t10::text) <> 1 then raise exception 'FALLA 6a: Dirección no ve la sugerida'; end if;
  perform private.command_set_task_resource(o, t10, 'conduccion', 'principal', 'aprobada');
  perform private.command_set_task_resource(o, t10, 'conduccion', 'principal', 'aprobada');  -- doble toque
  if (select approved_by::text from app.task_resource_tags where task_id = t10) <> dir then raise exception 'FALLA 6b'; end if;
  if (select count(*) from app.domain_events where event_type = 'TaskResourceTagChanged' and aggregate_id = t10) <> 1 then raise exception 'FALLA 6c: el doble toque dejó dos eventos'; end if;
  perform set_config('prueba.uid', profe, true);
  cat := private.formation_catalog(o);
  if (select t->'resources' from jsonb_array_elements(cat->'tasks') t where t->>'id' = t10::text) <> '[{"code": "conduccion", "status": "aprobada", "relevance": "principal"}]'::jsonb then raise exception 'FALLA 6d: %', cat; end if;
  begin perform private.command_set_task_resource(o, t10, 'conduccion', 'complementaria'); raise exception 'FALLA 6e: el Formador reabrió'; exception when others then if sqlerrm like 'FALLA%' then raise; end if; end;
  -- 7. Descartar quita la etiqueta de la vista del Formador y queda el rastro.
  perform set_config('prueba.uid', dir, true);
  perform private.command_set_task_resource(o, t10, 'conduccion', 'principal', 'descartada', 'No conduce en el montaje real');
  perform set_config('prueba.uid', profe, true);
  if (select jsonb_array_length(t->'resources') from jsonb_array_elements(private.formation_catalog(o)->'tasks') t where t->>'id' = t10::text) <> 0 then raise exception 'FALLA 7a'; end if;
  select count(*) into n from app.domain_events where event_type = 'TaskResourceTagChanged' and aggregate_id = t10;
  if n <> 2 then raise exception 'FALLA 7b: % eventos', n; end if;
  raise notice 'FC1 OK · 7 grupos de revisiones contra los bancos reales';
end $$;
select case when has_function_privilege('anon', 'public.v2_set_task_resource(uuid,uuid,text,text,text,text)', 'execute')
         or not has_function_privilege('authenticated', 'public.v2_set_task_resource(uuid,uuid,text,text,text,text)', 'execute')
       then 'FALLA 8: permisos' else 'FC1 permisos OK' end as permisos;
