create schema if not exists migration;

create or replace function public.tanner_touch_row()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.row_version = coalesce(old.row_version, 0) + 1;
  new.server_received_at = now();
  return new;
end;
$$;

create table if not exists public.assets (
  id text primary key, name text, category text, price numeric(14,2), description text, availability text,
  created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text,
  deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1,
  server_received_at timestamptz not null default now()
);
drop trigger if exists trg_assets_touch on public.assets;
create trigger trg_assets_touch before update on public.assets for each row execute function public.tanner_touch_row();
create index if not exists idx_assets_updated_at on public.assets(updated_at);
create index if not exists idx_assets_legacy_updated_at on public.assets(legacy_updated_at);
create index if not exists idx_assets_deleted on public.assets(deleted);

create table if not exists public.players (
  id text primary key, code text, name text, apellidos text, number text, category text, position text, foot text, size text,
  birth_date date, monthly_fee numeric(14,2), billing_start date, gk_fee numeric(14,2), gk_start date,
  tutor text, phone text, email text, address text, school text, origen text, emergency_contact text, emergency_phone text,
  scholarship boolean, scholarship_type text, blood text, allergies text, captain boolean,
  doc_acta boolean, doc_curp boolean, doc_studies boolean, status text, motivo_baja text, fecha_baja date,
  photo_data text, photo_updated_at timestamptz, notes text, measurements jsonb, scout_consent text, scout_consent_by text,
  scout_consent_at timestamptz, consent_interno text, consent_imagen text, consent_tutor text, consent_fecha timestamptz,
  consent_version text, consent_origen text, consent_imagen_by text, consent_imagen_at timestamptz,
  created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text,
  deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1,
  server_received_at timestamptz not null default now()
);
drop trigger if exists trg_players_touch on public.players;
create trigger trg_players_touch before update on public.players for each row execute function public.tanner_touch_row();
create index if not exists idx_players_updated_at on public.players(updated_at);
create index if not exists idx_players_legacy_updated_at on public.players(legacy_updated_at);
create index if not exists idx_players_deleted on public.players(deleted);

create table if not exists public.payments (
  id text primary key, type text, category text, player_id text, player_name text, prospect_id text, supplier_name text,
  concept text, amount numeric(14,2), method text, reference text, date date, period text, program_id text, program_name text,
  program_type text, dup_intent text, responsible_user text, evidence_photo text, order_id text, enroll_id text,
  weeks_covered integer, status text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text,
  updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(),
  row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch before update on public.payments for each row execute function public.tanner_touch_row();
create index if not exists idx_payments_updated_at on public.payments(updated_at);
create index if not exists idx_payments_legacy_updated_at on public.payments(legacy_updated_at);
create index if not exists idx_payments_deleted on public.payments(deleted);

create table if not exists public.attendance (
  id text primary key, session_id text, player_id text, player_name text, date date, category text, academia_id text,
  coach text, type text, time time, field text, status text, punctuality text, arrival time, uniform text, attitude text,
  injury text, notice text, pickup text, notes text, created_at timestamptz, legacy_updated_at timestamptz,
  created_by text, updated_by text, sync_status text, deleted boolean not null default false,
  updated_at timestamptz not null default now(), row_version bigint not null default 1,
  server_received_at timestamptz not null default now()
);
drop trigger if exists trg_attendance_touch on public.attendance;
create trigger trg_attendance_touch before update on public.attendance for each row execute function public.tanner_touch_row();
create index if not exists idx_attendance_updated_at on public.attendance(updated_at);
create index if not exists idx_attendance_legacy_updated_at on public.attendance(legacy_updated_at);
create index if not exists idx_attendance_deleted on public.attendance(deleted);

create table if not exists public.prospects (
  id text primary key, name text, age integer, birth_date date, category text, school text, foot text, phone text, whatsapp text,
  email text, tutor text, source text, contact_channel text, interest_type text, recommended_by text, trial_date date,
  status text, payment_status text, next_action_date date, assigned_to text, source_form text, source_campaign text,
  converted_at timestamptz, converted_player_id text, converted_scout_id text, consent_interno text, consent_imagen text,
  consent_tutor text, consent_fecha timestamptz, consent_version text, consent_origen text, photo_data text,
  photo_updated_at timestamptz, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text,
  updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(),
  row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_prospects_touch on public.prospects;
create trigger trg_prospects_touch before update on public.prospects for each row execute function public.tanner_touch_row();
create index if not exists idx_prospects_updated_at on public.prospects(updated_at);
create index if not exists idx_prospects_legacy_updated_at on public.prospects(legacy_updated_at);
create index if not exists idx_prospects_deleted on public.prospects(deleted);

create table if not exists public.scouting (
  id text primary key, child_name text, tutor_name text, phone text, age integer, birth_date date, position text, category text,
  source text, detected_by text, location_seen text, interest_level text, status text, notes text, evaluation text,
  next_action_date date, player_id text, source_prospect_id text, cualidad_estrella text, por_que text, pilar_tec text,
  pilar_fis text, pilar_tac text, pilar_men text, veredicto text, photo_data text, created_at timestamptz,
  legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false,
  updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_scouting_touch on public.scouting;
create trigger trg_scouting_touch before update on public.scouting for each row execute function public.tanner_touch_row();
create index if not exists idx_scouting_updated_at on public.scouting(updated_at);
create index if not exists idx_scouting_legacy_updated_at on public.scouting(legacy_updated_at);
create index if not exists idx_scouting_deleted on public.scouting(deleted);

create table if not exists public.packages (
  id text primary key, name text, description text, photo_data text, price_adult numeric(14,2), price_kid numeric(14,2),
  active boolean default true, components jsonb, vigencia date, notes text, created_at timestamptz, legacy_updated_at timestamptz,
  created_by text, updated_by text, sync_status text, deleted boolean not null default false,
  updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_packages_touch on public.packages;
create trigger trg_packages_touch before update on public.packages for each row execute function public.tanner_touch_row();
create index if not exists idx_packages_updated_at on public.packages(updated_at);
create index if not exists idx_packages_legacy_updated_at on public.packages(legacy_updated_at);
create index if not exists idx_packages_deleted on public.packages(deleted);

create table if not exists public.cortes (
  id text primary key, folio text, fecha date, status text, order_ids jsonb, total_venta numeric(14,2), total_costo numeric(14,2),
  pago_proveedor numeric(14,2), notas text, created_at timestamptz, legacy_updated_at timestamptz, created_by text,
  updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(),
  row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_cortes_touch on public.cortes;
create trigger trg_cortes_touch before update on public.cortes for each row execute function public.tanner_touch_row();
create index if not exists idx_cortes_updated_at on public.cortes(updated_at);
create index if not exists idx_cortes_legacy_updated_at on public.cortes(legacy_updated_at);
create index if not exists idx_cortes_deleted on public.cortes(deleted);

create table if not exists public.garantias (
  id text primary key, folio text, order_id text, piezas jsonb, status text, timeline jsonb, corte_reposicion_id text, notas text,
  created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text,
  deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1,
  server_received_at timestamptz not null default now()
);
drop trigger if exists trg_garantias_touch on public.garantias;
create trigger trg_garantias_touch before update on public.garantias for each row execute function public.tanner_touch_row();
create index if not exists idx_garantias_updated_at on public.garantias(updated_at);
create index if not exists idx_garantias_legacy_updated_at on public.garantias(legacy_updated_at);
create index if not exists idx_garantias_deleted on public.garantias(deleted);;
