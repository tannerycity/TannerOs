create table if not exists public.shadow_ingest_log (
  id bigint generated always as identity primary key,
  batch_id text,
  entity text not null,
  record_count integer not null default 0,
  source_backend text,
  ok boolean not null,
  error text,
  received_at timestamptz not null default now()
);

create index if not exists shadow_ingest_log_received_idx on public.shadow_ingest_log(received_at desc);
create index if not exists shadow_ingest_log_entity_idx on public.shadow_ingest_log(entity, received_at desc);
alter table public.shadow_ingest_log enable row level security;;
