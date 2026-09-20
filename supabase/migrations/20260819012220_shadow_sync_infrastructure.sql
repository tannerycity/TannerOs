create schema if not exists migration;

create table if not exists migration.shadow_config (
  id smallint primary key default 1 check (id = 1),
  key_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into migration.shadow_config (id, key_hash, enabled)
values (1, 'b5f8194db47e257a025db61362814a23b69a2dbdf83bbc4c03a2deebb6d31c3d', true)
on conflict (id) do update set key_hash = excluded.key_hash, enabled = true, updated_at = now();

create table if not exists migration.shadow_ingest_log (
  id bigint generated always as identity primary key,
  batch_id text,
  entity text not null,
  record_count integer not null default 0,
  source_backend text,
  ok boolean not null,
  error text,
  received_at timestamptz not null default now()
);

create index if not exists shadow_ingest_log_received_idx on migration.shadow_ingest_log(received_at desc);
create index if not exists shadow_ingest_log_entity_idx on migration.shadow_ingest_log(entity, received_at desc);

alter table migration.shadow_config enable row level security;
alter table migration.shadow_ingest_log enable row level security;;
