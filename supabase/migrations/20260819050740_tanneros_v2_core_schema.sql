create schema if not exists app;

create table if not exists app.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  relationship_default text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  code text,
  first_name text not null,
  last_name text,
  birth_date date,
  status text not null default 'active' check (status in ('active','inactive','withdrawn')),
  category text,
  position text,
  dominant_foot text,
  jersey_number text,
  school text,
  blood_type text,
  allergies text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_path text,
  notes text,
  joined_at date,
  withdrawn_at date,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists app.player_guardians (
  player_id uuid not null references app.players(id) on delete cascade,
  guardian_id uuid not null references app.guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  can_pickup boolean not null default true,
  receives_billing boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (player_id, guardian_id)
);

create table if not exists app.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  billing_start date,
  billing_day smallint not null default 1 check (billing_day between 1 and 28),
  is_exempt boolean not null default false,
  exemption_reason text,
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, player_id)
);

create table if not exists app.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid references app.players(id) on delete set null,
  billing_profile_id uuid references app.billing_profiles(id) on delete set null,
  charge_type text not null default 'monthly_fee',
  billing_period date,
  concept text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending','partial','paid','void','waived')),
  source text not null default 'system',
  legacy_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, player_id, charge_type, billing_period)
);

create table if not exists app.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  player_id uuid references app.players(id) on delete set null,
  payer_guardian_id uuid references app.guardians(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_date date not null,
  method text,
  reference text,
  concept text,
  status text not null default 'posted' check (status in ('posted','void','refunded')),
  source text not null default 'legacy_import',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null references app.payments(id) on delete cascade,
  charge_id uuid not null references app.charges(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, charge_id)
);

create index if not exists idx_app_players_org_status on app.players(organization_id,status);
create index if not exists idx_app_guardians_org_phone on app.guardians(organization_id,phone);
create index if not exists idx_app_charges_org_period on app.charges(organization_id,billing_period,status);
create index if not exists idx_app_payments_org_date on app.payments(organization_id,payment_date);
create index if not exists idx_app_allocations_charge on app.payment_allocations(charge_id);

alter table app.guardians enable row level security;
alter table app.players enable row level security;
alter table app.player_guardians enable row level security;
alter table app.billing_profiles enable row level security;
alter table app.charges enable row level security;
alter table app.payments enable row level security;
alter table app.payment_allocations enable row level security;

comment on schema app is 'TannerOS v2 canonical domain model. Production v1 remains in public during transition.';
comment on column app.players.legacy_id is 'Reference to v1 public.players.id. Transitional only.';
comment on column app.payments.legacy_id is 'Reference to v1 public.payments.id. Transitional only.';;
