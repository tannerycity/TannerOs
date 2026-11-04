-- BECAS TANNERY CITY: módulo completo de becas y apoyos dentro de Centro Tanner.
--
-- Reutiliza lo que ya existe en vez de duplicarlo:
--   - app.player_benefits sigue siendo el único registro del beneficio YA
--     otorgado (monto/porcentaje/vigencia activa) — aquí solo se le agrega
--     scholarship_modality (de qué programa vino) y next_review_at (revisión
--     trimestral), ambas columnas nuevas y nulas por default.
--   - app.policies / app.faqs (Centro Tanner, categoría 'becas') siguen siendo
--     la fuente de contenido informativo, FAQ y buscador — no se duplica aquí.
--   - app.domain_events sigue siendo la bitácora de auditoría de todo cambio
--     de estado (mismo patrón que BenefitRequested/SponsorFundingConfigured).
--
-- Lo nuevo es el *flujo de la solicitud* hasta el dictamen: app.scholarship_
-- applications. El estado de la solicitud (hasta aprobada/no_aprobada) vive
-- aquí; el estado del beneficio YA otorgado (vigente/próxima revisión/
-- suspendida/terminada/renovada) vive en player_benefits.active + next_review_at
-- + ends_on, que ya existían. Mezclar las 17 "etapas" del protocolo en una
-- sola columna de texto habría sido imposible de mantener.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Configuración central (fuente única: si Presidencia cambia la cuota, todo
-- lo que la muestra —wizard, páginas, FAQ— debe leer de aquí, no de texto fijo).
-- ---------------------------------------------------------------------------
create table if not exists app.scholarship_settings (
  organization_id uuid primary key references public.organizations(id),
  min_percentage numeric not null default 10,
  application_fee numeric not null default 200,
  internal_fund_cap_pct numeric not null default 10,
  max_full_scholarships integer not null default 3,
  response_days integer not null default 7,
  attendance_target_pct numeric not null default 90,
  referrals_per_quarter integer not null default 2,
  commercial_contacts_per_quarter integer not null default 1,
  max_warnings integer not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table app.scholarship_settings enable row level security;

insert into app.scholarship_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Solicitudes/nominaciones: el flujo completo hasta el dictamen de Presidencia.
-- ---------------------------------------------------------------------------
create table if not exists app.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  player_id uuid not null references app.players(id),
  guardian_id uuid references app.guardians(id),
  modality text not null check (modality in ('ingreso','apoyo_familiar','academica','deportiva','tanner','lealtad','curtibrother')),
  origin text not null check (origin in ('family_request','staff_nomination')),
  status text not null default 'borrador' check (status in (
    'borrador','pendiente_pago','pago_recibido','enviada','en_revision_administrativa',
    'info_pendiente','en_evaluacion','comite','presidencia','aprobada','no_aprobada','retirada'
  )),
  reason text,
  evidence_note text,
  fee_required boolean not null default false,
  fee_amount numeric,
  fee_status text not null default 'not_required' check (fee_status in ('not_required','pending','paid','waived')),
  fee_waived_reason text,
  committee_note text,
  info_requested_note text,
  decided_percentage numeric check (decided_percentage is null or (decided_percentage >= 0 and decided_percentage <= 100)),
  decided_duration_months integer,
  decided_starts_on date,
  decided_ends_on date,
  decided_covers text[],
  decision_note text,
  nominated_by_user_id uuid,
  resulting_benefit_id uuid references app.player_benefits(id),
  decided_by_user_id uuid,
  decided_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.scholarship_applications enable row level security;
create index if not exists idx_scholarship_app_org_status on app.scholarship_applications(organization_id, status);
create index if not exists idx_scholarship_app_player on app.scholarship_applications(player_id);

-- No acumulación: un jugador no puede tener dos solicitudes abiertas a la vez
-- (abierta = cualquier estado que no sea un cierre: aprobada/no_aprobada/retirada).
create unique index if not exists uq_scholarship_app_one_open_per_player
  on app.scholarship_applications(player_id)
  where status not in ('aprobada','no_aprobada','retirada');

-- ---------------------------------------------------------------------------
-- Tanner por Tanner: bitácora de referidos y contactos comerciales por trimestre.
-- ---------------------------------------------------------------------------
create table if not exists app.scholarship_tanner_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  player_id uuid not null references app.players(id),
  quarter_label text not null,
  kind text not null check (kind in ('referral','commercial_contact')),
  child_name text,
  contact_name text,
  contact_phone text,
  contact_company text,
  contact_relationship text,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);
alter table app.scholarship_tanner_log enable row level security;
create index if not exists idx_scholarship_tanner_log_player_q on app.scholarship_tanner_log(player_id, quarter_label);

-- ---------------------------------------------------------------------------
-- player_benefits: de qué programa vino el beneficio y cuándo toca revisarlo.
-- Columnas nuevas, nulas por default — no afecta nada de lo ya existente
-- (becas cargadas a mano desde Jugadores siguen funcionando igual).
-- ---------------------------------------------------------------------------
alter table app.player_benefits add column if not exists scholarship_modality text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'player_benefits_scholarship_modality_check') then
    alter table app.player_benefits add constraint player_benefits_scholarship_modality_check
      check (scholarship_modality is null or scholarship_modality in ('ingreso','apoyo_familiar','academica','deportiva','tanner','lealtad','curtibrother'));
  end if;
end $$;
alter table app.player_benefits add column if not exists next_review_at date;
alter table app.player_benefits add column if not exists source_application_id uuid references app.scholarship_applications(id);

commit;
