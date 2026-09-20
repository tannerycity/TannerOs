create table if not exists public.evaluations (
  id text primary key, player_id text, period text, date date, evaluator text, tecnica numeric(14,2), inteligencia numeric(14,2), intensidad numeric(14,2), mentalidad numeric(14,2), valores numeric(14,2), gk_manos numeric(14,2), gk_colocacion numeric(14,2), gk_aereo numeric(14,2), gk_pies numeric(14,2), gk_mando numeric(14,2), obj_deportivo text, obj_formativo text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_evaluations_touch on public.evaluations; create trigger trg_evaluations_touch before update on public.evaluations for each row execute function public.tanner_touch_row();
create index if not exists idx_evaluations_updated_at on public.evaluations(updated_at); create index if not exists idx_evaluations_legacy_updated_at on public.evaluations(legacy_updated_at); create index if not exists idx_evaluations_deleted on public.evaluations(deleted);

create table if not exists public.player_notes (
  id text primary key, player_id text, date date, context text, text text, author text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_player_notes_touch on public.player_notes; create trigger trg_player_notes_touch before update on public.player_notes for each row execute function public.tanner_touch_row();
create index if not exists idx_player_notes_updated_at on public.player_notes(updated_at); create index if not exists idx_player_notes_legacy_updated_at on public.player_notes(legacy_updated_at); create index if not exists idx_player_notes_deleted on public.player_notes(deleted);

create table if not exists public.matches (
  id text primary key, date date, category text, opponent text, tournament text, phase text, location text, result text, goals_for text, goals_against text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_matches_touch on public.matches; create trigger trg_matches_touch before update on public.matches for each row execute function public.tanner_touch_row();
create index if not exists idx_matches_updated_at on public.matches(updated_at); create index if not exists idx_matches_legacy_updated_at on public.matches(legacy_updated_at); create index if not exists idx_matches_deleted on public.matches(deleted);

create table if not exists public.match_stats (
  id text primary key, match_id text, player_id text, player_name text, attended boolean, starter boolean, minutes_played integer, goals integer, assists integer, yellow_cards integer, red_cards integer, saves integer, clean_sheet boolean, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_match_stats_touch on public.match_stats; create trigger trg_match_stats_touch before update on public.match_stats for each row execute function public.tanner_touch_row();
create index if not exists idx_match_stats_updated_at on public.match_stats(updated_at); create index if not exists idx_match_stats_legacy_updated_at on public.match_stats(legacy_updated_at); create index if not exists idx_match_stats_deleted on public.match_stats(deleted);

create table if not exists public.sponsors (
  id text primary key, name text, tier text, contact_name text, phone text, email text, amount numeric(14,2), closed_date date, start_date date, end_date date, status text, assets jsonb, notes text, recibimos jsonb, damos jsonb, convenio jsonb, movimientos jsonb, tipo_relacion text, etapa text, proximo_movimiento text, proximo_fecha date, valor_potencial numeric(14,2), created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_sponsors_touch on public.sponsors; create trigger trg_sponsors_touch before update on public.sponsors for each row execute function public.tanner_touch_row();
create index if not exists idx_sponsors_updated_at on public.sponsors(updated_at); create index if not exists idx_sponsors_legacy_updated_at on public.sponsors(legacy_updated_at); create index if not exists idx_sponsors_deleted on public.sponsors(deleted);

create table if not exists public.products (
  id text primary key, sku text, name text, title text, category text, edicion text, edicion_color text, estampado text, price numeric(14,2), cost numeric(14,2), stock integer, status text, sizes jsonb, description text, photo_data text, price_adult numeric(14,2), price_kid numeric(14,2), price_special numeric(14,2), provider text, lead_days integer, active boolean default true, cost_history jsonb, extras jsonb, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_products_touch on public.products; create trigger trg_products_touch before update on public.products for each row execute function public.tanner_touch_row();
create index if not exists idx_products_updated_at on public.products(updated_at); create index if not exists idx_products_legacy_updated_at on public.products(legacy_updated_at); create index if not exists idx_products_deleted on public.products(deleted);

create table if not exists public.orders (
  id text primary key, product_id text, player_id text, quantity integer, total numeric(14,2), status text, notes text, folio text, client_type text, client_name text, client_phone text, tutor text, category text, responsable text, items jsonb, subtotal numeric(14,2), discount numeric(14,2), discount_reason text, discount_auth_by text, corte_id text, due_date date, estimated_delivery date, timeline jsonb, draft boolean, source text, player_name text, numero_pendiente text, consent_interno text, consent_tutor text, consent_fecha timestamptz, consent_origen text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_orders_touch on public.orders; create trigger trg_orders_touch before update on public.orders for each row execute function public.tanner_touch_row();
create index if not exists idx_orders_updated_at on public.orders(updated_at); create index if not exists idx_orders_legacy_updated_at on public.orders(legacy_updated_at); create index if not exists idx_orders_deleted on public.orders(deleted);

create table if not exists public.events (
  id text primary key, title text, date date, time time, type text, place text, sponsor_id text, jersey text, rival text, roster jsonb, status text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_events_touch on public.events; create trigger trg_events_touch before update on public.events for each row execute function public.tanner_touch_row();
create index if not exists idx_events_updated_at on public.events(updated_at); create index if not exists idx_events_legacy_updated_at on public.events(legacy_updated_at); create index if not exists idx_events_deleted on public.events(deleted);

create table if not exists public.equipment (
  id text primary key, name text, category text, quantity integer, status text, location text, responsible text, photo_data text, photo_updated_at timestamptz, cost_unit numeric(14,2), min_stock numeric(14,2), notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_equipment_touch on public.equipment; create trigger trg_equipment_touch before update on public.equipment for each row execute function public.tanner_touch_row();
create index if not exists idx_equipment_updated_at on public.equipment(updated_at); create index if not exists idx_equipment_legacy_updated_at on public.equipment(legacy_updated_at); create index if not exists idx_equipment_deleted on public.equipment(deleted);

create table if not exists public.academias (
  id text primary key, name text, tipo text, profesor_user_id text, profesor_nombre text, profesor_username text, fee_mensual numeric(14,2), rate_hora numeric(14,2), dias text, horario text, lugar text, cat_ingreso text, cat_egreso text, ejes jsonb, profe_modelo text, profe_monto numeric(14,2), profe_porcentaje numeric(14,2), color text, activa boolean, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_academias_touch on public.academias; create trigger trg_academias_touch before update on public.academias for each row execute function public.tanner_touch_row();
create index if not exists idx_academias_updated_at on public.academias(updated_at); create index if not exists idx_academias_legacy_updated_at on public.academias(legacy_updated_at); create index if not exists idx_academias_deleted on public.academias(deleted);;
