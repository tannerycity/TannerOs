-- Gafetes de estacionamiento. Cada uno cuesta lo mismo, vence por temporada y
-- se renueva. El precio se congela en el pase al emitirlo: si mañana sube a
-- $250, el histórico sigue diciendo lo que de verdad se cobró.
create or replace function app.parking_pass_price()
returns numeric language sql immutable
set search_path to 'pg_catalog'
as $$ select 200::numeric $$;

-- Temporada vigente. El club juega por año calendario; si cambia a ago-jul,
-- se ajusta aquí y todo lo demás sigue igual.
create or replace function app.parking_season(p_at date default current_date)
returns integer language sql immutable
set search_path to 'pg_catalog'
as $$ select extract(year from p_at)::integer $$;

create table if not exists app.parking_passes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  guardian_id uuid references app.guardians(id) on delete set null,
  folio text,
  season integer not null,
  -- requested: la familia lo pidió | approved: autorizado y cobrado
  -- issued: ya se le entregó el gafete físico | expired/revoked/lost: fuera de circulación
  status text not null default 'requested'
    check (status in ('requested','approved','issued','rejected','expired','revoked','lost')),
  vehicle_plate text,
  vehicle_desc text,
  price numeric not null default 0,
  charge_id uuid references app.charges(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz, issued_at timestamptz,
  expires_on date,
  closed_at timestamptz, close_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parking_passes_org_status on app.parking_passes(organization_id,status);
create index if not exists parking_passes_player on app.parking_passes(player_id);
create index if not exists parking_passes_guardian on app.parking_passes(guardian_id);
-- Un folio no se puede repetir dentro de una temporada.
create unique index if not exists parking_passes_folio_season
  on app.parking_passes(organization_id,season,folio) where folio is not null;
-- La placa no puede estar viva dos veces en la misma temporada.
create unique index if not exists parking_passes_plate_season
  on app.parking_passes(organization_id,season,upper(btrim(vehicle_plate)))
  where vehicle_plate is not null and status in ('requested','approved','issued');

-- Bitácora inmutable: es la trazabilidad. Nunca se edita ni se borra, así que
-- la historia de un gafete siempre se puede reconstruir.
create table if not exists app.parking_pass_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pass_id uuid not null references app.parking_passes(id) on delete cascade,
  event text not null,
  actor_user_id uuid,
  actor_kind text not null default 'staff' check (actor_kind in ('familia','staff','sistema')),
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists parking_pass_events_pass on app.parking_pass_events(pass_id, created_at desc);

comment on table app.parking_passes is 'Gafetes de estacionamiento por temporada. La familia los solicita desde el portal y el club los autoriza y entrega.';
comment on table app.parking_pass_events is 'Bitácora inmutable de cada gafete: quién lo pidió, quién lo autorizó, cuándo se entregó y por qué se dio de baja.';

alter table app.parking_passes enable row level security;
alter table app.parking_pass_events enable row level security;
revoke all on app.parking_passes from public, anon, authenticated;
revoke all on app.parking_pass_events from public, anon, authenticated;;
