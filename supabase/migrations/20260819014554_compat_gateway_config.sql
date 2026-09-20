create table if not exists migration.gateway_config (
  id smallint primary key default 1 check (id=1),
  key_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into migration.gateway_config(id,key_hash,enabled)
values (1,'5f64f5b602b3022515c3fa1dd16678eed57a10b85a2eca762cee619e5ce6bfb6',true)
on conflict (id) do update set key_hash=excluded.key_hash, enabled=true, updated_at=now();
alter table migration.gateway_config enable row level security;;
