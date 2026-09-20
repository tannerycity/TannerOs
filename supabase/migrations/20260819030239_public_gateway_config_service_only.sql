create table if not exists public.gateway_config (
  id smallint primary key default 1 check (id = 1),
  key_hash text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.gateway_config(id,key_hash,enabled,updated_at)
select id,key_hash,enabled,now() from migration.gateway_config
on conflict (id) do update set key_hash=excluded.key_hash, enabled=excluded.enabled, updated_at=now();

alter table public.gateway_config enable row level security;
revoke all on table public.gateway_config from anon, authenticated;
grant select on table public.gateway_config to service_role;;
