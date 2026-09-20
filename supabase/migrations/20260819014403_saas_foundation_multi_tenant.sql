-- TannerOS SaaS Foundation v0.1
-- Multi-tenant, module entitlements, subscriptions, role/module permissions.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  status text not null default 'active' check (status in ('trial','active','past_due','suspended','cancelled')),
  public_key text unique,
  timezone text not null default 'America/Mexico_City',
  locale text not null default 'es-MX',
  currency text not null default 'MXN',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  code text primary key,
  name text not null,
  category text not null default 'general',
  description text,
  is_core boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_modules (
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_code text not null references public.modules(code) on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  primary key (plan_id, module_code)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('trialing','active','past_due','paused','cancelled')),
  starts_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_org_status_idx on public.subscriptions(organization_id, status);

create table if not exists public.organization_module_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_code text not null references public.modules(code) on delete cascade,
  enabled boolean not null,
  limits jsonb not null default '{}'::jsonb,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_code)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  avatar_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_memberships_user_idx on public.organization_memberships(user_id, organization_id) where active;

create table if not exists public.role_module_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null,
  module_code text not null references public.modules(code) on delete cascade,
  can_read boolean not null default false,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, role, module_code)
);

insert into public.modules(code,name,category,is_core,sort_order) values
('inicio','Inicio','core',true,1),('club','Club','core',true,2),('direccion','Dirección','management',false,3),('finanzas','Finanzas','finance',false,4),('jugadores','Jugadores','sport',true,10),('asistencia','Asistencia','sport',true,11),('convocatoria','Convocatoria','sport',false,12),('calendario','Calendario','core',true,13),('academias','Academias','sport',false,14),('scouting','Scouting','sport',false,15),('prospectos','Captación','crm',false,16),('cursosVerano','Programas y Eventos','programs',false,17),('taquilla','Taquilla','finance',false,20),('cobranza','Cobranza','finance',false,21),('contabilidad','Contabilidad','finance',false,22),('patrocinadores','Patrocinadores','commercial',false,30),('tienda','Tienda','commercial',false,31),('utileria','Utilería','operations',false,40),('usuarios','Usuarios','admin',false,50),('sync','Sincronización','admin',false,51),('qa','QA','admin',false,52),('admin','Administración','admin',false,53)
on conflict (code) do update set name=excluded.name, category=excluded.category, is_core=excluded.is_core, sort_order=excluded.sort_order, active=true;

insert into public.plans(code,name,description,metadata)
values ('internal_full','Tannery Internal Full','Plan interno con todos los módulos habilitados','{"commercial":false,"source":"migration"}'::jsonb)
on conflict (code) do update set name=excluded.name, description=excluded.description, active=true;

insert into public.plan_modules(plan_id,module_code,enabled)
select p.id,m.code,true from public.plans p cross join public.modules m where p.code='internal_full'
on conflict (plan_id,module_code) do update set enabled=true;

insert into public.organizations(slug,name,legal_name,status,public_key,branding,settings)
values ('tannery-city-fc','Tannery City FC','Tannery City FC','active','1850TC1850','{"brand":"Tannery City","product":"TannerOS"}'::jsonb,'{"source":"TannerOS v1.0.238","migration":"Snapshot 0"}'::jsonb)
on conflict (slug) do update set name=excluded.name, legal_name=excluded.legal_name, status='active', public_key=excluded.public_key, updated_at=now();

insert into public.subscriptions(organization_id,plan_id,status,provider,metadata)
select o.id,p.id,'active','internal','{"grandfathered":true}'::jsonb from public.organizations o, public.plans p
where o.slug='tannery-city-fc' and p.code='internal_full'
and not exists (select 1 from public.subscriptions s where s.organization_id=o.id and s.status in ('trialing','active'));

do $$
declare t text; org uuid;
  tables text[] := array['academia_inscripciones','academias','assets','attendance','audit_log','cortes','equipment','evaluations','events','garantias','gk_packages','gk_sessions','match_stats','matches','orders','packages','payments','permissions','player_notes','players','products','prospects','qa_results','scouting','sponsors','summer_attendance','summer_courses','summer_enrollments'];
begin
  select id into org from public.organizations where slug='tannery-city-fc';
  if org is null then raise exception 'Tannery City organization not found'; end if;
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists organization_id uuid', t);
    execute format('update public.%I set organization_id = $1 where organization_id is null', t) using org;
    execute format('alter table public.%I alter column organization_id set not null', t);
    if not exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname=t and c.conname=t||'_organization_fk') then
      execute format('alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete restrict', t, t||'_organization_fk');
    end if;
    execute format('create index if not exists %I on public.%I(organization_id)', t||'_organization_idx', t);
  end loop;
end $$;

alter table migration.legacy_users add column if not exists organization_id uuid;
update migration.legacy_users set organization_id=(select id from public.organizations where slug='tannery-city-fc') where organization_id is null;
alter table migration.legacy_users alter column organization_id set not null;
create index if not exists legacy_users_org_username_idx on migration.legacy_users(organization_id, lower(username)) where deleted=false and active=true;

with o as (select id from public.organizations where slug='tannery-city-fc'), perm(role,module_code,can_read,can_write) as (
 values
 ('Presidencia','inicio',true,true),('Presidencia','club',true,true),('Presidencia','direccion',true,true),('Presidencia','finanzas',true,true),('Presidencia','jugadores',true,true),('Presidencia','asistencia',true,true),('Presidencia','convocatoria',true,true),('Presidencia','calendario',true,true),('Presidencia','academias',true,true),('Presidencia','scouting',true,true),('Presidencia','prospectos',true,true),('Presidencia','cursosVerano',true,true),('Presidencia','taquilla',true,true),('Presidencia','cobranza',true,true),('Presidencia','contabilidad',true,true),('Presidencia','patrocinadores',true,true),('Presidencia','tienda',true,true),('Presidencia','utileria',true,true),('Presidencia','usuarios',true,true),('Presidencia','sync',true,true),('Presidencia','qa',true,true),('Presidencia','admin',true,true),
 ('Operaciones','inicio',true,false),('Operaciones','club',true,true),('Operaciones','calendario',true,true),('Operaciones','jugadores',true,true),('Operaciones','asistencia',true,true),('Operaciones','convocatoria',true,true),('Operaciones','prospectos',true,true),('Operaciones','taquilla',true,true),('Operaciones','utileria',true,true),('Operaciones','tienda',true,true),('Operaciones','cursosVerano',true,true),('Operaciones','academias',true,true),
 ('Formadores','inicio',true,false),('Formadores','club',true,true),('Formadores','calendario',true,true),('Formadores','jugadores',true,true),('Formadores','scouting',true,true),('Formadores','cursosVerano',true,true),('Formadores','academias',true,true),('Formadores','asistencia',true,true),('Formadores','utileria',true,true),('Formadores','convocatoria',true,true),
 ('Academia','inicio',true,false),('Academia','calendario',true,false),('Academia','academias',true,true),('Academia','asistencia',true,true),
 ('Taquilla','inicio',true,false),('Taquilla','cobranza',true,true),('Taquilla','taquilla',true,true),('Taquilla','tienda',true,true),('Taquilla','cursosVerano',true,true),
 ('Contabilidad','inicio',true,false),('Contabilidad','finanzas',true,true),('Contabilidad','contabilidad',true,true),('Contabilidad','taquilla',true,true),('Contabilidad','cobranza',true,true),('Contabilidad','academias',true,true),
 ('La Quinta Fuerza','inicio',true,false),('La Quinta Fuerza','calendario',true,true),('La Quinta Fuerza','patrocinadores',true,true),('La Quinta Fuerza','tienda',true,true),
 ('Scouting','inicio',true,false),('Scouting','calendario',true,false),('Scouting','scouting',true,true),('Tanner','inicio',true,false),('Tanner','calendario',true,false)
)
insert into public.role_module_permissions(organization_id,role,module_code,can_read,can_write)
select o.id,p.role,p.module_code,p.can_read,p.can_write from o cross join perm p
on conflict (organization_id,role,module_code) do update set can_read=excluded.can_read,can_write=excluded.can_write,updated_at=now();

alter table public.organizations enable row level security;
alter table public.modules enable row level security;
alter table public.plans enable row level security;
alter table public.plan_modules enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organization_module_overrides enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.role_module_permissions enable row level security;

create or replace function public.is_org_member(target_org uuid) returns boolean language sql stable security invoker set search_path = '' as $$ select exists (select 1 from public.organization_memberships m where m.organization_id=target_org and m.user_id=(select auth.uid()) and m.active=true); $$;
create or replace function public.org_has_module(target_org uuid, target_module text) returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce((select omo.enabled from public.organization_module_overrides omo where omo.organization_id=target_org and omo.module_code=target_module), exists (select 1 from public.subscriptions s join public.plan_modules pm on pm.plan_id=s.plan_id where s.organization_id=target_org and s.status in ('trialing','active') and pm.module_code=target_module and pm.enabled=true), false); $$;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.org_has_module(uuid,text) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_has_module(uuid,text) to authenticated;;
