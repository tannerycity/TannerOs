create table if not exists migration.raw_entity_snapshots (
  entity text primary key,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);
alter table migration.raw_entity_snapshots enable row level security;;
