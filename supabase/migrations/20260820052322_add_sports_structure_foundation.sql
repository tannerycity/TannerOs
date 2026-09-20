create table if not exists app.seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'planned' check(status in ('planned','active','closed','archived')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code),
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);
create unique index if not exists ux_seasons_default_org on app.seasons(organization_id) where is_default and status<>'archived';

create table if not exists app.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  venue_type text not null default 'field' check(venue_type in ('field','stadium','training_center','gym','office','other')),
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text,
  status text not null default 'active' check(status in ('active','inactive','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code),
  check(latitude is null or latitude between -90 and 90),
  check(longitude is null or longitude between -180 and 180)
);

create table if not exists app.competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  season_id uuid references app.seasons(id) on delete set null,
  code text,
  name text not null,
  organizer text,
  competition_type text,
  format text,
  starts_on date,
  ends_on date,
  status text not null default 'draft' check(status in ('draft','active','completed','cancelled','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code),
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);

create table if not exists app.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  season_id uuid references app.seasons(id) on delete set null,
  category_id uuid references app.categories(id) on delete set null,
  code text,
  name text not null,
  display_name text,
  competition_gender text,
  age_label text,
  status text not null default 'active' check(status in ('active','inactive','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,season_id,code)
);

create table if not exists app.team_competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete cascade,
  competition_id uuid not null references app.competitions(id) on delete cascade,
  status text not null default 'active' check(status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,team_id,competition_id)
);

create table if not exists app.team_rosters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check(status in ('active','inactive','released')),
  jersey_number text,
  squad_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or ends_on>=starts_on)
);
create unique index if not exists ux_team_rosters_active_player on app.team_rosters(organization_id,team_id,player_id) where status='active' and ends_on is null;

create table if not exists app.team_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete cascade,
  membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  staff_role text not null,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check(status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or ends_on>=starts_on)
);
create unique index if not exists ux_team_staff_active_role on app.team_staff_assignments(organization_id,team_id,membership_id,staff_role) where status='active' and ends_on is null;

alter table app.matches add column if not exists season_id uuid references app.seasons(id) on delete set null;
alter table app.matches add column if not exists team_id uuid references app.teams(id) on delete set null;
alter table app.matches add column if not exists competition_id uuid references app.competitions(id) on delete set null;
alter table app.matches add column if not exists venue_id uuid references app.venues(id) on delete set null;

alter table app.sessions add column if not exists season_id uuid references app.seasons(id) on delete set null;
alter table app.sessions add column if not exists team_id uuid references app.teams(id) on delete set null;
alter table app.sessions add column if not exists venue_id uuid references app.venues(id) on delete set null;

create index if not exists ix_teams_org_season on app.teams(organization_id,season_id,status);
create index if not exists ix_rosters_team_status on app.team_rosters(organization_id,team_id,status);
create index if not exists ix_staff_team_status on app.team_staff_assignments(organization_id,team_id,status);
create index if not exists ix_competitions_org_season on app.competitions(organization_id,season_id,status);
create index if not exists ix_matches_structured on app.matches(organization_id,season_id,team_id,competition_id,match_date);
create index if not exists ix_sessions_structured on app.sessions(organization_id,season_id,team_id,starts_at);

alter table app.seasons enable row level security;
alter table app.venues enable row level security;
alter table app.competitions enable row level security;
alter table app.teams enable row level security;
alter table app.team_competitions enable row level security;
alter table app.team_rosters enable row level security;
alter table app.team_staff_assignments enable row level security;
revoke all on app.seasons,app.venues,app.competitions,app.teams,app.team_competitions,app.team_rosters,app.team_staff_assignments from public,anon,authenticated;
grant select,insert,update,delete on app.seasons,app.venues,app.competitions,app.teams,app.team_competitions,app.team_rosters,app.team_staff_assignments to service_role;

comment on table app.seasons is 'First-class sporting seasons/cycles. Additive foundation; legacy categories are not auto-mapped.';
comment on table app.teams is 'Squads/teams are distinct from age categories. No legacy category is assumed to be a team.';
comment on table app.team_rosters is 'Effective-dated player membership in a team/squad.';
comment on table app.team_staff_assignments is 'Effective-dated organization membership assignment to a team.';;
