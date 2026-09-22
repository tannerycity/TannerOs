-- Centro Tanner: fuente única de verdad para políticas, FAQ, versiones y changelog.
-- Sigue el patrón ya usado por app.consent_documents/app.consent_acceptances: tablas en
-- `app`, RLS activo sin políticas (deny-all), acceso únicamente vía funciones
-- SECURITY DEFINER en `private`/`public`. No se toca ningún módulo existente.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- app.policies: ~140 políticas internas convertidas en contenido consultable.
-- ---------------------------------------------------------------------------
create table if not exists app.policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  policy_code text not null,
  slug text not null,
  title text not null,
  category text not null check (category in (
    'inscripcion','mensualidades','becas','entrenamientos','asistencia',
    'partidos','uniformes','baby_tanners','jugadores','familias','conducta',
    'seguridad','salud','tanner_os','estacionamiento','tannery_city_park',
    'privacidad','faq'
  )),
  scope text not null default 'tannery_city' check (scope in ('tannery_city','tannery_city_park','torneos_tcp')),
  short_answer text not null,
  official_content text not null,
  keywords text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  requires_acceptance boolean not null default false,
  consent_document_code text,
  version integer not null default 1,
  effective_date date,
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  unique (organization_id, policy_code),
  unique (organization_id, slug)
);
alter table app.policies enable row level security;

-- Historial insert-only: nunca se destruye una versión ya publicada.
create table if not exists app.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references app.policies(id),
  version integer not null,
  title text not null,
  short_answer text not null,
  official_content text not null,
  status text not null,
  effective_date date,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (policy_id, version)
);
alter table app.policy_versions enable row level security;

-- ---------------------------------------------------------------------------
-- app.faqs: preguntas frecuentes, relacionadas a una política fuente cuando aplica.
-- ---------------------------------------------------------------------------
create table if not exists app.faqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  policy_id uuid references app.policies(id),
  question text not null,
  answer text not null,
  category text,
  keywords text[] not null default '{}',
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft','published','archived')),
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
alter table app.faqs enable row level security;

-- ---------------------------------------------------------------------------
-- app.centro_tanner_changes: changelog curado (/centro-tanner/cambios).
-- ---------------------------------------------------------------------------
create table if not exists app.centro_tanner_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_label text not null,
  title text not null,
  description text not null,
  effective_date date,
  status text not null default 'published' check (status in ('draft','published')),
  published_at timestamptz,
  related_policy_id uuid references app.policies(id),
  related_document_code text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table app.centro_tanner_changes enable row level security;

-- ---------------------------------------------------------------------------
-- Historial de app.consent_documents (Reglamento, Privacidad, Uso de imagen...).
-- La tabla ya existe y ya respalda las aceptaciones de tutores; aquí solo se
-- agrega lo necesario para nunca perder el texto de una versión publicada.
-- ---------------------------------------------------------------------------
alter table app.consent_documents add column if not exists effective_date date;
alter table app.consent_documents add column if not exists published_at timestamptz not null default now();
alter table app.consent_documents add column if not exists created_by uuid;
alter table app.consent_documents add column if not exists updated_by uuid;

create table if not exists app.consent_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references app.consent_documents(id),
  version integer not null,
  title text not null,
  body text not null,
  required boolean not null,
  effective_date date,
  published_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);
alter table app.consent_document_versions enable row level security;

-- Respalda cada versión anterior antes de sobrescribir título/cuerpo/versión.
create or replace function app.consent_documents_snapshot() returns trigger
language plpgsql as $$
begin
  if (tg_op='UPDATE') and (old.body is distinct from new.body or old.title is distinct from new.title or old.version is distinct from new.version) then
    insert into app.consent_document_versions(document_id,version,title,body,required,effective_date,published_at,created_by)
    values (old.id, old.version, old.title, old.body, old.required, old.effective_date, coalesce(old.published_at, old.updated_at), old.updated_by)
    on conflict (document_id, version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consent_documents_snapshot on app.consent_documents;
create trigger trg_consent_documents_snapshot
  before update on app.consent_documents
  for each row execute function app.consent_documents_snapshot();

-- ---------------------------------------------------------------------------
-- Búsqueda: tsvector (español, sin acentos) + trigram para tolerancia a errores.
-- ---------------------------------------------------------------------------
create or replace function app.policies_search_update() returns trigger
language plpgsql as $$
begin
  new.search := to_tsvector('spanish', unaccent(
    coalesce(new.title,'') || ' ' || coalesce(new.short_answer,'') || ' ' ||
    coalesce(new.official_content,'') || ' ' || array_to_string(coalesce(new.keywords,'{}'),' ')
  ));
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_policies_search on app.policies;
create trigger trg_policies_search before insert or update on app.policies
  for each row execute function app.policies_search_update();

create or replace function app.faqs_search_update() returns trigger
language plpgsql as $$
begin
  new.search := to_tsvector('spanish', unaccent(
    coalesce(new.question,'') || ' ' || coalesce(new.answer,'') || ' ' ||
    array_to_string(coalesce(new.keywords,'{}'),' ')
  ));
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_faqs_search on app.faqs;
create trigger trg_faqs_search before insert or update on app.faqs
  for each row execute function app.faqs_search_update();

create index if not exists idx_policies_search on app.policies using gin(search);
create index if not exists idx_policies_title_trgm on app.policies using gin(title gin_trgm_ops);
create index if not exists idx_policies_org_status on app.policies(organization_id, status);
create index if not exists idx_policies_org_category on app.policies(organization_id, category) where status='published';

create index if not exists idx_faqs_search on app.faqs using gin(search);
create index if not exists idx_faqs_question_trgm on app.faqs using gin(question gin_trgm_ops);
create index if not exists idx_faqs_org_status on app.faqs(organization_id, status);
create index if not exists idx_faqs_policy on app.faqs(policy_id);

create index if not exists idx_changes_org_status on app.centro_tanner_changes(organization_id, status, effective_date desc);
;
