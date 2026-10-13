-- Staff y organigrama (Presidencia, 12/10/2026), 1/3: las tablas: "una parte que diga Staff,
-- que se vea el organigrama; esa info nos sirve para que los papás vean cuál
-- es su entrenador". Decisiones: la familia ve foto, nombre y rol (sin
-- teléfono); el organigrama lo ve todo el staff.
--
--   · app.staff_members: la ficha de cada persona del staff (tenga o no cuenta
--     en TannerOS), con su puesto, nivel, a quién reporta, categorías, foto y
--     la carta de no antecedentes penales (entregada / vence).
--   · Contratar en Candidatos crea su ficha (con su foto) sola.
--   · Las categorías de alguien con cuenta se reflejan en
--     category_staff_assignments: es lo que usa Formación.
--   · El portal de familias ve a los formadores de la categoría de su hijo y
--     a Dirección deportiva, si su ficha lo permite.

create table app.staff_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references app.staff_applications(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  title text not null check (length(btrim(title)) between 2 and 80),
  level text not null default 'formador' check (level in ('presidencia','direccion','coordinacion','formador','operacion')),
  reports_to uuid references app.staff_members(id) on delete set null,
  phone text,
  email text,
  photo_path text,
  photo_thumb_path text,
  show_to_families boolean not null default true,
  background_check text not null default 'pendiente' check (background_check in ('pendiente','entregada')),
  background_valid_until date,
  joined_at date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reports_to is null or reports_to <> id)
);
create unique index staff_members_un_usuario on app.staff_members(organization_id, user_id) where user_id is not null;
create unique index staff_members_una_postulacion on app.staff_members(application_id) where application_id is not null;
create table app.staff_member_categories (
  staff_id uuid not null references app.staff_members(id) on delete cascade,
  category_id uuid not null references app.categories(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (staff_id, category_id)
);
alter table app.staff_members enable row level security;
alter table app.staff_member_categories enable row level security;
revoke all on app.staff_members, app.staff_member_categories from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.staff_members for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on app.staff_member_categories for each row execute function private.guard_club_read_only();
