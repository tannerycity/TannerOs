create table if not exists app.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  min_age smallint,
  max_age smallint,
  status text not null default 'active' check(status in ('active','inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists app.player_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  category_id uuid references app.categories(id) on delete set null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check(status in ('active','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or ends_on>=starts_on)
);

create table if not exists app.academies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  academy_type text not null default 'general',
  description text,
  status text not null default 'active' check(status in ('active','inactive','archived')),
  monthly_fee numeric(12,2),
  hourly_rate numeric(12,2),
  schedule jsonb not null default '[]'::jsonb,
  location text,
  evaluation_model jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,slug)
);

create table if not exists app.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academy_id uuid not null references app.academies(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  agreed_fee numeric(12,2),
  status text not null default 'active' check(status in ('active','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or ends_on>=starts_on)
);

create table if not exists app.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  program_type text not null default 'program',
  category_label text,
  description text,
  starts_on date,
  ends_on date,
  schedule jsonb not null default '[]'::jsonb,
  location text,
  capacity integer,
  fee numeric(12,2),
  status text not null default 'draft' check(status in ('draft','published','active','completed','cancelled','archived')),
  public_registration_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,slug),
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);

create table if not exists app.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references app.programs(id) on delete cascade,
  player_id uuid references app.players(id) on delete set null,
  participant_first_name text not null,
  participant_last_name text,
  guardian_id uuid references app.guardians(id) on delete set null,
  phone text,
  email text,
  birth_date date,
  status text not null default 'registered' check(status in ('registered','confirmed','waitlisted','cancelled','completed')),
  payment_status text not null default 'pending' check(payment_status in ('pending','partial','paid','waived','refunded')),
  consent jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_type text not null check(session_type in ('training','match','academy','program','evaluation','other')),
  category_id uuid references app.categories(id) on delete set null,
  academy_id uuid references app.academies(id) on delete set null,
  program_id uuid references app.programs(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  responsible_user_id uuid,
  title text,
  notes text,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or ends_at>=starts_at)
);

create table if not exists app.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references app.sessions(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  status text not null check(status in ('present','absent','late','excused')),
  arrived_at timestamptz,
  punctuality text,
  uniform_status text,
  attitude_note text,
  injury_note text,
  pickup_note text,
  notes text,
  recorded_by_user_id uuid,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,player_id)
);

create index if not exists idx_app_enrollments_player on app.player_enrollments(organization_id,player_id,status);
create index if not exists idx_app_academy_enrollments on app.academy_enrollments(organization_id,academy_id,status);
create index if not exists idx_app_program_enrollments on app.program_enrollments(organization_id,program_id,status);
create index if not exists idx_app_sessions_org_start on app.sessions(organization_id,starts_at);
create index if not exists idx_app_attendance_session on app.attendance_records(session_id,status);

alter table app.categories enable row level security;
alter table app.player_enrollments enable row level security;
alter table app.academies enable row level security;
alter table app.academy_enrollments enable row level security;
alter table app.programs enable row level security;
alter table app.program_enrollments enable row level security;
alter table app.sessions enable row level security;
alter table app.attendance_records enable row level security;

comment on table app.programs is 'Generic programs domain replacing summer-specific technical entities.';
comment on table app.academies is 'Generic academy domain replacing goalkeeper-specific technical entities.';;
