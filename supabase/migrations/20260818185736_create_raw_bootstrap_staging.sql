create table if not exists migration.raw_bootstrap (
  id bigint generated always as identity primary key,
  source text not null default 'apps_script_bootstrap',
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);
alter table migration.raw_bootstrap enable row level security;;
