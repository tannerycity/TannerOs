-- Réplica mínima de Supabase/TannerOS para probar h101 en un Postgres local.
-- NO es una migración: sólo crea lo que h101 toca (roles, auth.uid(), las
-- tablas y ayudantes de permisos) con la misma forma que producción.
-- Uso: docs/tanner-live/README.md, "Probar la propuesta en local".
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth; create schema if not exists app; create schema if not exists private; create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema private, app to authenticated, service_role;
create or replace function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
create or replace function extensions.digest(text, text) returns bytea language sql as $$ select public.digest($1, $2) $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.organizations(id uuid primary key default gen_random_uuid(), slug text unique, name text, timezone text default 'America/Mexico_City');
create table public.profiles(user_id uuid primary key, display_name text, active boolean default true);
create table public.organization_memberships(id uuid primary key default gen_random_uuid(), organization_id uuid, user_id uuid, role text, active boolean default true, is_owner boolean default false);
create table public.modules(code text primary key, name text, category text, description text, is_core boolean, active boolean, sort_order int);
create table public.plan_modules(plan_id uuid, module_code text, enabled boolean, primary key(plan_id, module_code));
create table public.role_module_permissions(organization_id uuid, role text, module_code text, can_read boolean, can_write boolean, primary key(organization_id, role, module_code));
create table public.organization_module_overrides(organization_id uuid, module_code text, enabled boolean, primary key(organization_id, module_code));
create table private.membership_module_overrides(organization_id uuid, membership_id uuid, module_code text, can_read boolean, can_write boolean, primary key(organization_id, membership_id, module_code));
create table app.guardians(id uuid primary key default gen_random_uuid(), organization_id uuid, first_name text, last_name text, phone text, status text default 'active', user_id uuid);
create table app.players(id uuid primary key default gen_random_uuid(), organization_id uuid, first_name text, last_name text, category text, image_consent boolean default false, archived_at timestamptz);
create table app.player_guardians(player_id uuid, guardian_id uuid, organization_id uuid, primary key(player_id, guardian_id));
create table app.audit_events(id uuid primary key default gen_random_uuid(), organization_id uuid, actor_user_id uuid, actor_label text, event_type text, aggregate_type text, aggregate_id text, payload jsonb default '{}', request_id text, occurred_at timestamptz default now(), legacy_id text);

create function private.module_enabled(p_org uuid, p_module text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select o.enabled from public.organization_module_overrides o where o.organization_id = p_org and o.module_code = p_module), false) $$;
create function private.is_active_member(p_org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_memberships m where m.organization_id = p_org and m.user_id = auth.uid() and m.active) $$;
create function private.has_module_access(p_org uuid, p_module text, p_write boolean default false) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_member(p_org) and private.module_enabled(p_org, p_module) and exists (
    select 1 from public.organization_memberships m
      left join public.role_module_permissions rp on rp.organization_id = m.organization_id and rp.role = m.role and rp.module_code = p_module
      left join private.membership_module_overrides mo on mo.organization_id = m.organization_id and mo.membership_id = m.id and mo.module_code = p_module
     where m.organization_id = p_org and m.user_id = auth.uid() and m.active
       and case when p_write then coalesce(mo.can_write, rp.can_write, false) else coalesce(mo.can_read, rp.can_read, false) end) $$;
create function private.is_presidency(p_org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_memberships m where m.organization_id = p_org and m.user_id = auth.uid() and m.active and m.role = 'Presidencia') $$;
create function private.guard_club_read_only() returns trigger language plpgsql as $$ begin return coalesce(new, old); end $$;
create function private.usage_modulos() returns text[] language sql immutable as $$ select array['inicio'] $$;
grant execute on function private.module_enabled(uuid,text), private.is_active_member(uuid), private.has_module_access(uuid,text,boolean), private.is_presidency(uuid) to authenticated, service_role;
