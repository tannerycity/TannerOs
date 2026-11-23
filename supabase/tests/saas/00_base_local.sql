-- BASE LOCAL DESECHABLE para probar supabase/pendientes/saas_comercial_v1.sql
-- sin tocar produccion. NUNCA se corre contra Supabase: la guarda de abajo
-- aborta si la base no se llama mcfc_saas_local.
--
-- Reproduce solo lo que la migracion necesita, copiado de las migraciones
-- reales del repo (definiciones vigentes en produccion al 23/11/2026):
--   20260819014403 (organizations, modules, plans, subscriptions, memberships)
--   20260819054530 (legacy_module_code, is_active_member, module_enabled)
--   20260820021619 (has_module_access con overrides por persona)
--   20261010161119 (platform_admins, is_platform_admin, planes cantera/primera/seleccion)
\set ON_ERROR_STOP 1
do $$ begin
  if current_database() <> 'mcfc_saas_local' then raise exception 'Esta base local solo se corre en mcfc_saas_local (estas en %)', current_database(); end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create extension if not exists pgcrypto;
create schema auth; create schema app; create schema private;
grant usage on schema public, app to anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, legal_name text,
  status text not null default 'active', settings jsonb not null default '{}', branding jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.modules (code text primary key, name text not null, category text not null default 'general',
  is_core boolean not null default false, active boolean not null default true, sort_order int not null default 100);
create table public.plans (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  description text, active boolean not null default true, metadata jsonb not null default '{}');
create table public.plan_modules (plan_id uuid not null references public.plans(id) on delete cascade,
  module_code text not null references public.modules(code) on delete cascade, enabled boolean not null default true,
  limits jsonb not null default '{}', primary key (plan_id, module_code));
create table public.subscriptions (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id), plan_id uuid not null references public.plans(id),
  status text not null default 'active', starts_at timestamptz not null default now(), current_period_end timestamptz,
  cancelled_at timestamptz, provider text, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.organization_module_overrides (organization_id uuid not null references public.organizations(id),
  module_code text not null references public.modules(code), enabled boolean not null, reason text,
  primary key (organization_id, module_code));
create table public.profiles (user_id uuid primary key references auth.users(id), active boolean not null default true);
create table public.organization_memberships (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
  role text not null, active boolean not null default true, is_owner boolean not null default false, unique (organization_id, user_id));
create table public.role_module_permissions (organization_id uuid not null references public.organizations(id), role text not null,
  module_code text not null references public.modules(code), can_read boolean not null default false, can_write boolean not null default false,
  primary key (organization_id, role, module_code));
create table private.membership_module_overrides (organization_id uuid not null, membership_id uuid not null references public.organization_memberships(id),
  module_code text not null references public.modules(code), can_read boolean, can_write boolean, primary key (organization_id, membership_id, module_code));
create table public.platform_admins (user_id uuid primary key references auth.users(id), note text);
create table public.platform_settings (key text primary key, value jsonb not null);
create table app.players (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  first_name text, last_name text, birth_date date, status text not null default 'active', archived_at timestamptz);
create table app.player_enrollments (id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  player_id uuid not null references app.players(id), category text not null, status text not null default 'active');

do $$ declare t text; begin
  foreach t in array array['organizations','modules','plans','plan_modules','subscriptions','organization_module_overrides','profiles',
    'organization_memberships','role_module_permissions','platform_admins','platform_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  execute 'alter table app.players enable row level security';
  execute 'revoke all on app.players from public, anon, authenticated';
end $$;

-- ---- funciones vigentes en produccion (copiadas tal cual) ----
create or replace function private.legacy_module_code(p_module text) returns text language sql immutable set search_path = pg_catalog as $$
  select case p_module when 'players' then 'jugadores' when 'billing' then 'cobranza' when 'accounting' then 'contabilidad'
    when 'academies' then 'academias' when 'attendance' then 'asistencia' when 'programs' then 'cursosVerano' when 'commerce' then 'tienda'
    when 'prospects' then 'prospectos' when 'scouting' then 'scouting' when 'sponsors' then 'patrocinadores' when 'equipment' then 'utileria'
    when 'calendar' then 'calendario' when 'users' then 'usuarios' when 'admin' then 'admin' when 'qa' then 'qa' else p_module end $$;

create or replace function private.is_active_member(p_organization_id uuid) returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select (select auth.uid()) is not null and exists (select 1 from public.organization_memberships m
    join public.profiles p on p.user_id=m.user_id and p.active=true
    join public.organizations o on o.id=m.organization_id and o.status='active'
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active=true) $$;

create or replace function private.module_enabled(p_organization_id uuid, p_module text) returns boolean language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'private' as $function$
declare v_module text := private.legacy_module_code(p_module); v_override boolean;
begin
  select omo.enabled into v_override from public.organization_module_overrides omo where omo.organization_id=p_organization_id and omo.module_code=v_module;
  if found then return v_override; end if;
  return exists (select 1 from public.subscriptions s join public.plans pl on pl.id=s.plan_id and pl.active=true
    join public.plan_modules pm on pm.plan_id=s.plan_id and pm.module_code=v_module and pm.enabled=true
    where s.organization_id=p_organization_id and s.status in ('active','trialing') and s.starts_at <= now()
      and (s.current_period_end is null or s.current_period_end >= now()));
end $function$;

create or replace function private.has_module_access(p_organization_id uuid, p_module text, p_write boolean default false)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $function$
  select private.is_active_member(p_organization_id) and private.module_enabled(p_organization_id,p_module)
    and exists (select 1 from public.organization_memberships m
      left join public.role_module_permissions rp on rp.organization_id=m.organization_id and rp.role=m.role and rp.module_code=private.legacy_module_code(p_module)
      left join private.membership_module_overrides mo on mo.organization_id=m.organization_id and mo.membership_id=m.id and mo.module_code=private.legacy_module_code(p_module)
      where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active=true
        and coalesce(mo.can_read,rp.can_read,false)=true
        and (not p_write or (coalesce(mo.can_read,rp.can_read,false)=true and coalesce(mo.can_write,rp.can_write,false)=true))) $function$;

create or replace function private.is_platform_admin() returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public' as $$ select exists (select 1 from public.platform_admins where user_id = (select auth.uid())) $$;

revoke all on function private.legacy_module_code(text), private.is_active_member(uuid), private.module_enabled(uuid,text),
  private.has_module_access(uuid,text,boolean), private.is_platform_admin() from public;
grant execute on function private.legacy_module_code(text), private.is_active_member(uuid), private.module_enabled(uuid,text),
  private.has_module_access(uuid,text,boolean) to authenticated, service_role;
revoke all on function private.is_platform_admin() from anon, authenticated;

-- ---- catalogo de modulos y planes como esta en produccion ----
insert into public.modules(code, name, sort_order) select c, c, row_number() over () from unnest(array[
  'inicio','club','direccion','encuestas','finanzas','correcciones','pago_proveedor','visoria_salud','metricas','jugadores','asistencia',
  'callups','convocatoria','calendario','academias','scouting','prospectos','cursosVerano','formacion','formacion_direccion','taquilla','cobranza',
  'contabilidad','patrocinadores','tienda','commerce_finance','utileria','usuarios','qa','sync','admin','catalogo','jugadores_familia',
  'jugadores_estado','estacionamiento','centro_tanner']) c;

insert into public.plans(code, name, metadata) values
  ('internal_full','Tannery Internal Full','{"commercial":false,"forSale":false,"order":99}'),
  ('cantera','Cantera','{"forSale":true,"priceMxn":990,"maxPlayers":50,"order":1}'),
  ('primera','Primera','{"forSale":true,"priceMxn":1990,"maxPlayers":150,"order":2}'),
  ('seleccion','Selección','{"forSale":true,"priceMxn":3490,"maxPlayers":null,"order":3}');
insert into public.plan_modules(plan_id, module_code) select p.id, m.code from public.plans p, public.modules m where p.code = 'internal_full';
insert into public.plan_modules(plan_id, module_code) select p.id, x from public.plans p, unnest(array['admin','asistencia','calendario','centro_tanner',
  'club','cobranza','correcciones','direccion','encuestas','finanzas','inicio','jugadores','jugadores_estado','jugadores_familia','metricas',
  'pago_proveedor','prospectos','taquilla','usuarios','visoria_salud']) x where p.code = 'cantera';
insert into public.plan_modules(plan_id, module_code) select p.id, x from public.plans p, unnest(array['admin','asistencia','calendario','callups',
  'catalogo','centro_tanner','club','cobranza','commerce_finance','contabilidad','convocatoria','correcciones','direccion','encuestas','finanzas',
  'inicio','jugadores','jugadores_estado','jugadores_familia','metricas','pago_proveedor','patrocinadores','prospectos','taquilla','tienda',
  'usuarios','utileria','visoria_salud']) x where p.code = 'primera';
insert into public.plan_modules(plan_id, module_code) select p.id, pm.module_code from public.plans p, public.plan_modules pm
  join public.plans pr on pr.id = pm.plan_id and pr.code = 'primera' where p.code = 'seleccion';
insert into public.plan_modules(plan_id, module_code) select p.id, x from public.plans p,
  unnest(array['prospectos','scouting','academias','cursosVerano','estacionamiento','formacion','formacion_direccion']) x where p.code = 'seleccion'
  on conflict do nothing;

-- Como en Supabase: service_role recibe permisos sobre lo que se cree en public y app.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema app grant all on tables to service_role;
grant all on all tables in schema public, app to service_role;
