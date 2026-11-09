-- PROPUESTA · PROP-FC-002 · Recursos del Futbolista Tanner (09/11/2026)
--
-- Autorizada por Presidencia el 09/11/2026 (10 familias, Cuerpo transversal;
-- anticipar, comunicar y ejecutar se quedan como recursos de la Metodología).
-- Archivo GENERADO: se edita scripts/formacion/fc1-esquema.sql o la semilla
-- supabase/semillas/formacion/recursos-v0.1.json y se corre
-- node scripts/formacion/sql-recursos.mjs.
--
-- Qué hace (y qué no):
--   · Reutiliza app.formation_concepts (ya tiene kind 'recurso'): agrega el
--     kind 'familia_recurso' y carga las 10 familias del mapa 04 con sus
--     recursos. Recurso = herramienta para resolver un Reto; NO es un Reto.
--     Los 9 Retos, los 4 niveles, las 36 + 24 tareas y las 5 dimensiones no
--     se tocan.
--   · task_resource_tags: tarea ↔ recurso, muchos a muchos, PRINCIPAL o
--     COMPLEMENTARIA, con estado sugerida → aprobada / descartada. El Formador
--     (o la carga) sugiere; sólo Dirección Deportiva aprueba (mapa 04 §8).
--   · El catálogo que ve el Formador sólo trae etiquetas APROBADAS; el
--     recomendador sólo cuenta ésas. Dirección ve también las sugeridas.
--   · Sólo Banco Tanner: Baby conserva sus 4 mundos (mapa 04 §5).
--   · Cada cambio de etiqueta deja evento con antes y después.

alter table app.formation_concepts drop constraint if exists formation_concepts_kind_check;
alter table app.formation_concepts add constraint formation_concepts_kind_check
  check (kind in ('reto','nivel','mundo_baby','recurso','especialidad','etapa','skill','familia_recurso'));

create table if not exists app.task_resource_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references app.training_tasks(id) on delete cascade,
  resource_id uuid not null references app.formation_concepts(id) on delete restrict,
  relevance text not null check (relevance in ('principal','complementaria')),
  status text not null default 'sugerida' check (status in ('sugerida','aprobada','descartada')),
  source text,
  note text check (note is null or char_length(note) <= 300),
  proposed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, resource_id),
  check (status <> 'aprobada' or approved_at is not null)
);
create index if not exists task_resource_tags_por_recurso on app.task_resource_tags(organization_id, resource_id) where status = 'aprobada';
alter table app.task_resource_tags enable row level security;

-- Sugerir (Formador o Dirección) o decidir (sólo Dirección).
create or replace function private.command_set_task_resource(p_organization_id uuid, p_task_id uuid, p_resource_code text,
  p_relevance text, p_status text default 'sugerida', p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_dir boolean := private.has_module_access(p_organization_id, 'formacion_direccion', true);
  v_task app.training_tasks%rowtype; v_res app.formation_concepts%rowtype; v_old app.task_resource_tags%rowtype; v_new app.task_resource_tags%rowtype;
begin
  if not (v_dir or private.has_module_access(p_organization_id, 'formacion', true)) then raise exception 'Not authorized'; end if;
  if p_relevance not in ('principal','complementaria') then raise exception 'Relevancia inválida'; end if;
  if p_status not in ('sugerida','aprobada','descartada') then raise exception 'Estado inválido'; end if;
  if p_status <> 'sugerida' and not v_dir then raise exception 'Sólo Dirección Deportiva aprueba o descarta etiquetas'; end if;
  select * into v_task from app.training_tasks where id = p_task_id and organization_id = p_organization_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if v_task.bank <> 'tanner' then raise exception 'Las tareas Baby se trabajan por mundos, no por recursos'; end if;
  if v_task.status <> 'oficial' then raise exception 'Sólo se etiquetan tareas oficiales'; end if;
  select * into v_res from app.formation_concepts where organization_id = p_organization_id and kind = 'recurso' and code = p_resource_code and active;
  if v_res.id is null then raise exception 'Recurso no encontrado'; end if;
  select * into v_old from app.task_resource_tags where task_id = p_task_id and resource_id = v_res.id for update;
  -- Un Formador no reabre lo que Dirección ya decidió.
  if v_old.id is not null and not v_dir and v_old.status <> 'sugerida' then raise exception 'Dirección Deportiva ya decidió esta etiqueta'; end if;
  insert into app.task_resource_tags(organization_id, task_id, resource_id, relevance, status, note, proposed_by, approved_by, approved_at, updated_by)
  values (p_organization_id, p_task_id, v_res.id, p_relevance, p_status, nullif(btrim(p_note), ''), v_uid,
          case when p_status = 'aprobada' then v_uid end, case when p_status = 'aprobada' then now() end, v_uid)
  on conflict (task_id, resource_id) do update set relevance = excluded.relevance, status = excluded.status,
    note = coalesce(excluded.note, app.task_resource_tags.note),
    approved_by = case when excluded.status = 'aprobada' then v_uid else null end,
    approved_at = case when excluded.status = 'aprobada' then now() else null end,
    updated_by = v_uid, updated_at = now()
  returning * into v_new;
  if v_old.id is null or v_old.status is distinct from v_new.status or v_old.relevance is distinct from v_new.relevance then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'TaskResourceTagChanged', 'training_task', p_task_id,
            jsonb_build_object('resource', p_resource_code,
              'before', case when v_old.id is null then null else jsonb_build_object('relevance', v_old.relevance, 'status', v_old.status) end,
              'after', jsonb_build_object('relevance', v_new.relevance, 'status', v_new.status)), v_uid);
  end if;
  return jsonb_build_object('id', v_new.id, 'resource', p_resource_code, 'relevance', v_new.relevance, 'status', v_new.status);
end $$;
revoke all on function private.command_set_task_resource(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.v2_set_task_resource(organization_id uuid, task_id uuid, resource_code text, relevance text,
  status text default 'sugerida', note text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.command_set_task_resource(organization_id, task_id, resource_code, relevance, status, note) $$;
revoke all on function public.v2_set_task_resource(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.v2_set_task_resource(uuid, uuid, text, text, text, text) to authenticated;

-- El catálogo de siempre (b4) + los recursos de cada tarea.
create or replace function private.formation_catalog(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_dir boolean;
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)) then
    raise exception 'Not authorized';
  end if;
  v_dir := private.has_module_access(p_organization_id, 'formacion_direccion', false);
  return jsonb_build_object(
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'code', c.code, 'name', c.name, 'question', c.question,
               'phrase', c.phrase, 'attrs', c.attrs) order by c.kind, c.sort_order)
      from app.formation_concepts c
      where c.organization_id = p_organization_id and c.active), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'bank', t.bank, 'code', t.code, 'version', t.version, 'name', t.name,
               'primary', t.primary_concept, 'level', t.level, 'related', to_jsonb(t.related_concepts),
               'ageMin', t.age_min, 'ageMax', t.age_max, 'stages', to_jsonb(t.stages), 'minutes', t.minutes,
               'playersMin', t.players_min, 'playersMax', t.players_max,
               'buscamos', t.buscamos, 'montaje', t.montaje, 'juega', t.juega, 'dile', to_jsonb(t.dile), 'observa', t.observa,
               'easier', t.easier, 'harder', t.harder, 'space', t.space_note, 'adapta', t.adapta,
               'videoGuide', t.video_guide, 'videoFileId', t.video_file_id, 'variants', t.variants, 'status', t.status,
               'resources', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'relevance', r.relevance, 'status', r.status)
                                             order by r.relevance desc, c.sort_order)
                                      from app.task_resource_tags r join app.formation_concepts c on c.id = r.resource_id
                                      where r.task_id = t.id and (r.status = 'aprobada' or (v_dir and r.status = 'sugerida'))), '[]'::jsonb))
             order by t.bank desc, t.code)
      from app.training_tasks t
      where t.organization_id = p_organization_id
        and (t.status = 'oficial' or (v_dir and t.status = 'propuesta'))), '[]'::jsonb)
  );
end $$;
revoke all on function private.formation_catalog(uuid) from public, anon, authenticated;
