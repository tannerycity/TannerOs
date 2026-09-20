create table if not exists public.academia_inscripciones (
  id text primary key, academia_id text, academia_name text, player_id text, player_name text, fee numeric(14,2), start_date date, status text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_academia_inscripciones_touch on public.academia_inscripciones; create trigger trg_academia_inscripciones_touch before update on public.academia_inscripciones for each row execute function public.tanner_touch_row();
create index if not exists idx_academia_inscripciones_updated_at on public.academia_inscripciones(updated_at); create index if not exists idx_academia_inscripciones_legacy_updated_at on public.academia_inscripciones(legacy_updated_at); create index if not exists idx_academia_inscripciones_deleted on public.academia_inscripciones(deleted);

create table if not exists public.gk_packages (
  id text primary key, academia_id text, player_id text, player_name text, classes integer, price numeric(14,2), purchased date, expires date, status text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_gk_packages_touch on public.gk_packages; create trigger trg_gk_packages_touch before update on public.gk_packages for each row execute function public.tanner_touch_row();
create index if not exists idx_gk_packages_updated_at on public.gk_packages(updated_at); create index if not exists idx_gk_packages_legacy_updated_at on public.gk_packages(legacy_updated_at); create index if not exists idx_gk_packages_deleted on public.gk_packages(deleted);

create table if not exists public.gk_sessions (
  id text primary key, academia_id text, player_id text, player_name text, date date, time time, hours numeric(14,2), rate numeric(14,2), amount numeric(14,2), status text, package_id text, paid_ref text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_gk_sessions_touch on public.gk_sessions; create trigger trg_gk_sessions_touch before update on public.gk_sessions for each row execute function public.tanner_touch_row();
create index if not exists idx_gk_sessions_updated_at on public.gk_sessions(updated_at); create index if not exists idx_gk_sessions_legacy_updated_at on public.gk_sessions(legacy_updated_at); create index if not exists idx_gk_sessions_deleted on public.gk_sessions(deleted);

create table if not exists migration.legacy_users (
  id text primary key, name text, email text, role text, status text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, username text, password_hash text, salt text, active boolean default true, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id text primary key, role text, module text, can_read boolean default false, can_write boolean default false, status text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_permissions_touch on public.permissions; create trigger trg_permissions_touch before update on public.permissions for each row execute function public.tanner_touch_row();
create index if not exists idx_permissions_updated_at on public.permissions(updated_at); create index if not exists idx_permissions_legacy_updated_at on public.permissions(legacy_updated_at); create index if not exists idx_permissions_deleted on public.permissions(deleted);

create table if not exists public.audit_log (
  id text primary key, action text, entity text, details jsonb, event_at timestamptz, actor_user text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_audit_log_touch on public.audit_log; create trigger trg_audit_log_touch before update on public.audit_log for each row execute function public.tanner_touch_row();
create index if not exists idx_audit_log_updated_at on public.audit_log(updated_at); create index if not exists idx_audit_log_legacy_updated_at on public.audit_log(legacy_updated_at); create index if not exists idx_audit_log_deleted on public.audit_log(deleted);

create table if not exists public.qa_results (
  id text primary key, test text, status text, message text, kind text, details jsonb, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_qa_results_touch on public.qa_results; create trigger trg_qa_results_touch before update on public.qa_results for each row execute function public.tanner_touch_row();
create index if not exists idx_qa_results_updated_at on public.qa_results(updated_at); create index if not exists idx_qa_results_legacy_updated_at on public.qa_results(legacy_updated_at); create index if not exists idx_qa_results_deleted on public.qa_results(deleted);

create table if not exists public.summer_courses (
  id text primary key, name text, kind text, type text, category text, description text, location text, responsible text, group_label text, age_min integer, age_max integer, start_date date, end_date date, schedule text, fee numeric(14,2), fee_weekly numeric(14,2), weeks integer, capacity integer, status text, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_summer_courses_touch on public.summer_courses; create trigger trg_summer_courses_touch before update on public.summer_courses for each row execute function public.tanner_touch_row();
create index if not exists idx_summer_courses_updated_at on public.summer_courses(updated_at); create index if not exists idx_summer_courses_legacy_updated_at on public.summer_courses(legacy_updated_at); create index if not exists idx_summer_courses_deleted on public.summer_courses(deleted);

create table if not exists public.summer_enrollments (
  id text primary key, course_id text, course_name text, child_name text, child_apellidos text, birth_date date, age integer, foot text, played_before text, played_where text, tutor text, phone text, email text, school text, address text, blood_type text, allergies text, medical_notes text, medications text, emergency_contact text, emergency_phone text, emergency_relation text, auth_participation boolean, auth_fitness boolean, auth_image boolean, auth_rules boolean, signed_by text, signed_at timestamptz, consent_interno text, consent_imagen text, consent_tutor text, consent_fecha timestamptz, consent_version text, consent_origen text, photo_data text, source text, status text, plan text, weeks_contracted integer, payment_amount numeric(14,2), payment_method text, payment_date date, payment_ref text, converted_to text, converted_id text, converted_at timestamptz, notes text, created_at timestamptz, legacy_updated_at timestamptz, created_by text, updated_by text, sync_status text, deleted boolean not null default false, updated_at timestamptz not null default now(), row_version bigint not null default 1, server_received_at timestamptz not null default now()
);
drop trigger if exists trg_summer_enrollments_touch on public.summer_enrollments; create trigger trg_summer_enrollments_touch before update on public.summer_enrollments for each row execute function public.tanner_touch_row();
create index if not exists idx_summer_enrollments_updated_at on public.summer_enrollments(updated_at); create index if not exists idx_summer_enrollments_legacy_updated_at on public.summer_enrollments(legacy_updated_at); create index if not exists idx_summer_enrollments_deleted on public.summer_enrollments(deleted);;
