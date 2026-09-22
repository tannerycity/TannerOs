-- El profe ve el expediente de SUS categorías, no el de los 66 Tanners.
--
-- Mismo patrón que ya funciona para academias (my_academy_ids / can_see_academy),
-- ahora para las categorías del club. No se reusa app.team_staff_assignments
-- porque cuelga de app.teams, que está vacía: la unidad real del club es la
-- categoría, no el equipo.
--
-- Un profe puede tener VARIAS categorías: en el club es normal que alguien
-- lleve T8 y T10, o que cubra a un compañero de forma permanente.
create table if not exists app.category_staff_assignments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category_id uuid not null references app.categories(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (category_id, user_id)
);
create index if not exists category_staff_assignments_user_idx
  on app.category_staff_assignments(organization_id, user_id);

-- Sin políticas: nadie la toca directo, solo las funciones SECURITY DEFINER.
alter table app.category_staff_assignments enable row level security;

create or replace function private.my_category_ids(p_organization_id uuid)
returns setof uuid
language sql stable security definer
set search_path to 'pg_catalog','app','private'
as $$
  select s.category_id from app.category_staff_assignments s
  where s.organization_id=p_organization_id and s.user_id=(select auth.uid())
$$;
revoke all on function private.my_category_ids(uuid) from public, anon, authenticated;

-- Quién ve TODAS las categorías. Por módulo, no por nombre de rol:
-- jugadores_estado es el permiso de "administro el expediente" (Presidencia y
-- Operaciones). Un rol nuevo sin ese módulo queda acotado solo.
create or replace function private.is_player_admin(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','private'
as $$
  select private.is_presidency(p_organization_id)
      or private.has_module_access(p_organization_id,'jugadores_estado',false)
$$;
revoke all on function private.is_player_admin(uuid) from public, anon, authenticated;

create or replace function private.can_see_category(p_organization_id uuid, p_category_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','private'
as $$
  select private.is_player_admin(p_organization_id)
      or p_category_id in (select private.my_category_ids(p_organization_id))
$$;
revoke all on function private.can_see_category(uuid,uuid) from public, anon, authenticated;
;
