alter table app.billing_profiles add column if not exists needs_review boolean not null default false;
alter table app.billing_profiles add column if not exists review_reason text;
alter table app.billing_profiles add column if not exists legacy_scholarship_type text;

create table if not exists app.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null,
  category text,
  concept text,
  method text,
  reference text,
  supplier_name text,
  status text not null default 'posted' check (status in ('posted','void','refunded')),
  source text not null default 'legacy_import',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_app_expenses_org_date on app.expenses(organization_id,expense_date);
alter table app.expenses enable row level security;;
