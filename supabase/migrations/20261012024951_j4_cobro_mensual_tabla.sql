-- Cobro de la suscripción a los clubes (Presidencia, 12/10/2026). 1/3: la tabla.
--
-- "Siempre tienen que pagar, los primeros cinco días del mes. Si no, $100
-- extra, y si no, se les limita el acceso."
insert into public.platform_settings(key, value)
values ('billing', '{"dueDay":5,"lateFeeMxn":100,"readOnlyDay":15,"bank":null,"clabe":null,"holder":null}'::jsonb)
on conflict (key) do nothing;

create table public.club_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  plan_code text not null,
  base_mxn numeric(12,2) not null check (base_mxn >= 0),
  extra_players int not null default 0,
  extras_mxn numeric(12,2) not null default 0 check (extras_mxn >= 0),
  late_fee_mxn numeric(12,2) not null default 0 check (late_fee_mxn >= 0),
  due_date date not null,
  read_only_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','void')),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  method text,
  reference text,
  notices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, period)
);
alter table public.club_invoices enable row level security;
revoke all on public.club_invoices from public, anon, authenticated;
