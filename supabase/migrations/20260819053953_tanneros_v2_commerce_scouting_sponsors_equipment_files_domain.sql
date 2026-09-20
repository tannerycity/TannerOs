create table if not exists app.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  slug text,
  name text not null,
  description text,
  product_type text not null default 'product' check(product_type in ('product','kit','service')),
  category text,
  price numeric(12,2) not null default 0,
  cost numeric(12,2),
  stock integer,
  sizes jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  lead_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,sku),
  unique(organization_id,slug)
);

create table if not exists app.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio text,
  player_id uuid references app.players(id) on delete set null,
  guardian_id uuid references app.guardians(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'pending_payment' check(status in ('draft','pending_payment','partial_payment','paid','in_production','ready','delivered','cancelled','refunded')),
  source text not null default 'internal',
  notes text,
  due_date date,
  estimated_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,folio)
);

create table if not exists app.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete cascade,
  product_id uuid references app.products(id) on delete set null,
  description text not null,
  quantity integer not null default 1 check(quantity>0),
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app.prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text,
  birth_date date,
  phone text,
  email text,
  guardian_name text,
  source text,
  source_campaign text,
  interest_type text,
  category_interest text,
  status text not null default 'new' check(status in ('new','contacted','trial_scheduled','trial_completed','converted','not_continuing','archived')),
  assigned_user_id uuid,
  next_action_at timestamptz,
  notes text,
  converted_player_id uuid references app.players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists app.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid references app.players(id) on delete set null,
  prospect_id uuid references app.prospects(id) on delete set null,
  observed_name text,
  observed_at timestamptz not null default now(),
  observed_location text,
  detected_by_user_id uuid,
  position text,
  category text,
  technical_score numeric,
  physical_score numeric,
  tactical_score numeric,
  mental_score numeric,
  star_quality text,
  verdict text,
  notes text,
  status text not null default 'open' check(status in ('open','follow_up','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.sponsors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sponsor_type text,
  contact_name text,
  phone text,
  email text,
  status text not null default 'prospect' check(status in ('prospect','negotiation','active','inactive','lost','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,name)
);

create table if not exists app.sponsor_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sponsor_id uuid not null references app.sponsors(id) on delete cascade,
  starts_on date,
  ends_on date,
  monetary_value numeric(12,2),
  benefits_received jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check(status in ('draft','active','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);

create table if not exists app.equipment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  quantity integer not null default 0 check(quantity>=0),
  min_stock integer not null default 0 check(min_stock>=0),
  unit_cost numeric(12,2),
  location text,
  status text not null default 'active' check(status in ('active','maintenance','retired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,sku)
);

create table if not exists app.equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  equipment_item_id uuid not null references app.equipment_items(id) on delete cascade,
  assigned_to_user_id uuid,
  assigned_to_label text,
  quantity integer not null check(quantity>0),
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  notes text
);

create table if not exists app.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  entity_type text,
  entity_id uuid,
  file_type text,
  mime_type text,
  original_name text,
  size_bytes bigint,
  checksum text,
  status text not null default 'active' check(status in ('active','archived','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,storage_bucket,storage_path)
);

create index if not exists idx_app_orders_org_status on app.orders(organization_id,status,created_at desc);
create index if not exists idx_app_prospects_org_status on app.prospects(organization_id,status,next_action_at);
create index if not exists idx_app_scouting_org_status on app.scouting_reports(organization_id,status,observed_at desc);
create index if not exists idx_app_sponsors_org_status on app.sponsors(organization_id,status);
create index if not exists idx_app_equipment_org_status on app.equipment_items(organization_id,status);
create index if not exists idx_app_files_entity on app.files(organization_id,entity_type,entity_id);

alter table app.products enable row level security;
alter table app.orders enable row level security;
alter table app.order_items enable row level security;
alter table app.prospects enable row level security;
alter table app.scouting_reports enable row level security;
alter table app.sponsors enable row level security;
alter table app.sponsor_agreements enable row level security;
alter table app.equipment_items enable row level security;
alter table app.equipment_assignments enable row level security;
alter table app.files enable row level security;

revoke all on all tables in schema app from anon,authenticated;
grant all on all tables in schema app to service_role;

comment on table app.files is 'Metadata only; binary objects live in Supabase Storage.';
comment on table app.orders is 'Canonical commerce order aggregate, replacing mixed legacy order shapes.';;
