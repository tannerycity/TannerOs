create table if not exists app.billing_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  charge_day smallint not null default 1 check (charge_day between 1 and 28),
  due_day smallint not null default 5 check (due_day between 1 and 28),
  late_fee_amount numeric(12,2) not null default 100 check (late_fee_amount >= 0),
  proration_method text not null default 'weekly_quarters' check (proration_method in ('weekly_quarters','daily','none','manual')),
  first_month_late_fee_enabled boolean not null default false,
  allocation_strategy text not null default 'oldest_first' check (allocation_strategy in ('oldest_first','explicit_only')),
  allow_partial_payments boolean not null default true,
  overpayment_strategy text not null default 'credit_balance' check (overpayment_strategy in ('credit_balance','reject')),
  sibling_discount_amount numeric(12,2) not null default 50 check (sibling_discount_amount >= 0),
  currency text not null default 'MXN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.player_benefits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  benefit_type text not null check (benefit_type in ('scholarship_full','scholarship_partial','sibling_discount','sponsor_funded','custom')),
  calculation_type text not null default 'fixed_amount' check (calculation_type in ('fixed_amount','percentage','override_amount','full_waiver','informational')),
  fixed_amount numeric(12,2),
  percentage numeric(7,4) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  override_amount numeric(12,2),
  funding_source_name text,
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  priority smallint not null default 100,
  notes text,
  legacy_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists idx_app_player_benefits_active on app.player_benefits(organization_id,player_id,active,starts_on,ends_on);

create table if not exists app.charge_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  charge_id uuid not null references app.charges(id) on delete cascade,
  player_benefit_id uuid references app.player_benefits(id) on delete set null,
  adjustment_type text not null check (adjustment_type in ('discount','waiver','credit','debit','correction')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'posted' check (status in ('posted','void')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,idempotency_key)
);

create table if not exists app.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null references app.payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  refund_date date not null,
  method text,
  reference text,
  reason text not null,
  status text not null default 'posted' check (status in ('posted','void')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,idempotency_key)
);

create table if not exists app.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  actor_label text,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_app_audit_aggregate on app.audit_events(organization_id,aggregate_type,aggregate_id,occurred_at desc);
create index if not exists idx_app_audit_event_type on app.audit_events(organization_id,event_type,occurred_at desc);

alter table app.charges add column if not exists late_fee_eligible boolean not null default true;
alter table app.charges add column if not exists idempotency_key text;
alter table app.payments add column if not exists idempotency_key text;
alter table app.payments add column if not exists payer_type text check (payer_type is null or payer_type in ('guardian','sponsor','player','organization','other'));
alter table app.payments add column if not exists payer_name text;
alter table app.expenses add column if not exists idempotency_key text;

create unique index if not exists uq_app_charges_idempotency on app.charges(organization_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_app_payments_idempotency on app.payments(organization_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_app_expenses_idempotency on app.expenses(organization_id,idempotency_key) where idempotency_key is not null;

alter table app.billing_policies enable row level security;
alter table app.player_benefits enable row level security;
alter table app.charge_adjustments enable row level security;
alter table app.refunds enable row level security;
alter table app.audit_events enable row level security;

insert into app.billing_policies (
  organization_id, charge_day, due_day, late_fee_amount, proration_method,
  first_month_late_fee_enabled, allocation_strategy, allow_partial_payments,
  overpayment_strategy, sibling_discount_amount, currency
)
select id,1,5,100,'weekly_quarters',false,'oldest_first',true,'credit_balance',50,currency
from public.organizations
on conflict (organization_id) do update set
  charge_day=excluded.charge_day,
  due_day=excluded.due_day,
  late_fee_amount=excluded.late_fee_amount,
  proration_method=excluded.proration_method,
  first_month_late_fee_enabled=excluded.first_month_late_fee_enabled,
  allocation_strategy=excluded.allocation_strategy,
  allow_partial_payments=excluded.allow_partial_payments,
  overpayment_strategy=excluded.overpayment_strategy,
  sibling_discount_amount=excluded.sibling_discount_amount,
  currency=excluded.currency,
  updated_at=now();

comment on table app.billing_policies is 'Organization-level accounts receivable policy for TannerOS v2.';
comment on table app.player_benefits is 'Canonical recurring player benefits and third-party funding arrangements.';
comment on table app.charge_adjustments is 'Immutable-style posted adjustments against receivable charges. Void instead of delete.';
comment on table app.refunds is 'Refund records against posted payments. Void instead of delete.';
comment on table app.audit_events is 'Append-only domain audit trail for TannerOS v2.';;
