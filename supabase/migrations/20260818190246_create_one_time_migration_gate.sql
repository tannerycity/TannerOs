create table if not exists migration.migration_control (
  name text primary key,
  enabled boolean not null default false,
  enabled_at timestamptz,
  consumed_at timestamptz
);
alter table migration.migration_control enable row level security;
insert into migration.migration_control(name,enabled) values ('shadow_pull',false) on conflict (name) do nothing;;
