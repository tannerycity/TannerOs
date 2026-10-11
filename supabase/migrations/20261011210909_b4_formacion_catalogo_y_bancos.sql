-- Formación Tanner · Fase 0 · 4/7: el vocabulario de la metodología y los bancos de tareas.
--
-- formation_concepts: 9 Retos, 4 niveles, 4 mundos Baby, 8 Recursos,
-- 4 Especialidades y 6 etapas (y, cuando llegue su documento, las Skills).
-- Por club: TannerOS es SaaS y la metodología de Tannery es de Tannery.
--
-- training_tasks: Banco Tanner (36) y Banco Baby (24), separados por `bank`.
-- Baby no es un T6 pequeño: sus tareas no tienen Reto ni nivel, tienen mundo y edad.
-- Una tarea no se edita encima: una versión nueva archiva la anterior y las
-- sesiones viejas siguen apuntando a la que usaron.
--
-- La carga sale de supabase/semillas/formacion/*.json (extraídos de los .docx
-- con scripts/formacion/extraer_bancos.py, sin reescribir texto) vía
-- scripts/formacion/sql-bancos.mjs.

create table app.formation_concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('reto','nivel','mundo_baby','recurso','especialidad','etapa','skill')),
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  question text,
  phrase text,
  sort_order smallint not null default 0,
  version text not null,
  attrs jsonb not null default '{}'::jsonb check (jsonb_typeof(attrs) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind, code)
);

create table app.training_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank text not null check (bank in ('tanner','baby')),
  code text not null,
  version text not null,
  name text not null check (btrim(name) <> ''),
  primary_concept text not null,
  level text check (level in ('sin_rival','con_rival','con_decision','en_juego')),
  related_concepts text[] not null default '{}',
  age_min smallint,
  age_max smallint,
  stages text[] not null default '{}',
  minutes smallint check (minutes between 1 and 120),
  players_min smallint,
  players_max smallint,
  buscamos text not null,
  montaje text,
  juega text not null,
  dile text[] not null default '{}',
  observa text not null,
  easier text,
  harder text,
  space_note text,
  adapta text,
  video_guide text,
  video_file_id uuid references app.files(id) on delete set null,
  variants text,
  status text not null default 'propuesta' check (status in ('propuesta','oficial','archivada')),
  source text,
  proposed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  supersedes_id uuid references app.training_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, bank, code, version),
  -- Banco Tanner: Reto + nivel (la escalera). Banco Baby: mundo + edad, sin nivel.
  check (bank <> 'tanner' or (level is not null and primary_concept in ('balon','1v1','jugar_juntos','cancha','ventaja','avanzar','gol','defender','reaccionar'))),
  check (bank <> 'baby' or (level is null and primary_concept in ('movimiento','balon','juego','convivencia') and age_min is not null and age_max is not null and age_min <= age_max)),
  check (players_min is null or players_max is null or players_min <= players_max)
);
-- Una sola versión oficial por tarea.
create unique index training_tasks_una_oficial on app.training_tasks(organization_id, bank, code) where status = 'oficial';
create index training_tasks_por_concepto on app.training_tasks(organization_id, bank, primary_concept) where status = 'oficial';

-- Como el resto de app.*: nadie lee las tablas directo, todo pasa por funciones.
alter table app.formation_concepts enable row level security;
alter table app.training_tasks enable row level security;
revoke all on app.formation_concepts, app.training_tasks from public, anon, authenticated;

-- El catálogo para quien trabaja con la metodología. Dirección ve también las
-- propuestas; el Formador, sólo lo oficial.
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
               'videoGuide', t.video_guide, 'videoFileId', t.video_file_id, 'variants', t.variants, 'status', t.status)
             order by t.bank desc, t.code)
      from app.training_tasks t
      where t.organization_id = p_organization_id
        and (t.status = 'oficial' or (v_dir and t.status = 'propuesta'))), '[]'::jsonb)
  );
end $$;
revoke all on function private.formation_catalog(uuid) from public, anon, authenticated;

create or replace function public.v2_formation_catalog(organization_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.formation_catalog(organization_id) $$;
revoke all on function public.v2_formation_catalog(uuid) from public, anon;
grant execute on function public.v2_formation_catalog(uuid) to authenticated;
