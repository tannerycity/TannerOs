-- Los papeles que la familia tiene que aceptar (reglamento, uso de imagen,
-- terminos de una visoria) no vivian en ningun lado: se firmaban en papel o no
-- se firmaban. Aqui quedan como documentos versionados del club y aceptaciones
-- con fecha, para que exista prueba de que la familia dijo que si Y a que version.
create table if not exists app.consent_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  title text not null,
  body text not null,
  -- La version sube cada vez que cambia el texto. Una aceptacion vieja NO vale
  -- para un reglamento nuevo: por eso se guarda contra que version se acepto.
  version integer not null default 1,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists app.consent_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references app.consent_documents(id) on delete cascade,
  document_version integer not null,
  player_id uuid not null references app.players(id) on delete cascade,
  guardian_id uuid references app.guardians(id) on delete set null,
  accepted_by_user_id uuid,
  accepted_at timestamptz not null default now(),
  -- Se puede volver a aceptar una version nueva, pero no dos veces la misma.
  unique (document_id, document_version, player_id)
);
create index if not exists consent_acceptances_player_idx on app.consent_acceptances(player_id);

-- La beca se pedia por WhatsApp y se perdia. Aqui queda la solicitud con el
-- motivo que escribio la familia y quien la resolvio.
create table if not exists app.benefit_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  guardian_id uuid references app.guardians(id) on delete set null,
  requested_by_user_id uuid,
  reason text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolution_note text,
  constraint benefit_requests_status_ck check (status in ('pending','approved','rejected','withdrawn'))
);
create index if not exists benefit_requests_player_idx on app.benefit_requests(player_id, requested_at desc);

-- Nadie llega a estas tablas por PostgREST: se leen y escriben por RPC, igual
-- que el resto del portal.
alter table app.consent_documents enable row level security;
alter table app.consent_acceptances enable row level security;
alter table app.benefit_requests enable row level security;;
