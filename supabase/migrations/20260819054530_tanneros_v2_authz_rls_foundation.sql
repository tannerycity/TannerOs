create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.legacy_module_code(p_module text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_module
    when 'players' then 'jugadores'
    when 'billing' then 'cobranza'
    when 'accounting' then 'contabilidad'
    when 'academies' then 'academias'
    when 'attendance' then 'asistencia'
    when 'programs' then 'cursosVerano'
    when 'commerce' then 'tienda'
    when 'prospects' then 'prospectos'
    when 'scouting' then 'scouting'
    when 'sponsors' then 'patrocinadores'
    when 'equipment' then 'utileria'
    when 'calendar' then 'calendario'
    when 'users' then 'usuarios'
    when 'admin' then 'admin'
    when 'qa' then 'qa'
    else p_module
  end
$$;

create or replace function private.is_active_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships m
      join public.profiles p on p.user_id=m.user_id and p.active=true
      join public.organizations o on o.id=m.organization_id and o.status='active'
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.active=true
    )
$$;

create or replace function private.module_enabled(p_organization_id uuid, p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_module text := private.legacy_module_code(p_module);
  v_override boolean;
begin
  select omo.enabled into v_override
  from public.organization_module_overrides omo
  where omo.organization_id=p_organization_id and omo.module_code=v_module;

  if found then return v_override; end if;

  return exists (
    select 1
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id and pl.active=true
    join public.plan_modules pm on pm.plan_id=s.plan_id and pm.module_code=v_module and pm.enabled=true
    where s.organization_id=p_organization_id
      and s.status in ('active','trialing')
      and s.starts_at <= now()
      and (s.current_period_end is null or s.current_period_end >= now())
  );
end
$$;

create or replace function private.has_module_access(p_organization_id uuid, p_module text, p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_active_member(p_organization_id)
    and private.module_enabled(p_organization_id,p_module)
    and exists (
      select 1
      from public.organization_memberships m
      join public.role_module_permissions rp
        on rp.organization_id=m.organization_id
       and rp.role=m.role
       and rp.module_code=private.legacy_module_code(p_module)
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.active=true
        and rp.can_read=true
        and (not p_write or rp.can_write=true)
    )
$$;

create or replace function private.has_any_module_access(p_organization_id uuid, p_modules text[], p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1 from unnest(p_modules) m(module_code)
    where private.has_module_access(p_organization_id,m.module_code,p_write)
  )
$$;

create or replace function private.can_manage_users(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select private.has_module_access(p_organization_id,'users',true)
$$;

revoke all on function private.legacy_module_code(text) from public;
revoke all on function private.is_active_member(uuid) from public;
revoke all on function private.module_enabled(uuid,text) from public;
revoke all on function private.has_module_access(uuid,text,boolean) from public;
revoke all on function private.has_any_module_access(uuid,text[],boolean) from public;
revoke all on function private.can_manage_users(uuid) from public;
grant execute on function private.legacy_module_code(text) to authenticated, service_role;
grant execute on function private.is_active_member(uuid) to authenticated, service_role;
grant execute on function private.module_enabled(uuid,text) to authenticated, service_role;
grant execute on function private.has_module_access(uuid,text,boolean) to authenticated, service_role;
grant execute on function private.has_any_module_access(uuid,text[],boolean) to authenticated, service_role;
grant execute on function private.can_manage_users(uuid) to authenticated, service_role;

-- Profile and membership policies.
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
using ((select auth.uid())=user_id);
create policy profiles_self_update on public.profiles for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

drop policy if exists memberships_self_read on public.organization_memberships;
drop policy if exists memberships_admin_read on public.organization_memberships;
create policy memberships_self_read on public.organization_memberships for select to authenticated
using ((select auth.uid())=user_id and active=true);
create policy memberships_admin_read on public.organization_memberships for select to authenticated
using (private.can_manage_users(organization_id));

-- Files explicitly carry their domain authorization context.
alter table app.files add column if not exists module_code text;
update app.files set module_code=case entity_type
  when 'player' then 'players'
  when 'guardian' then 'players'
  when 'academy' then 'academies'
  when 'program' then 'programs'
  when 'product' then 'commerce'
  when 'order' then 'commerce'
  when 'scouting' then 'scouting'
  when 'sponsor' then 'sponsors'
  when 'equipment' then 'equipment'
  else 'admin' end
where module_code is null;
alter table app.files alter column module_code set default 'admin';
alter table app.files alter column module_code set not null;
alter table app.files drop constraint if exists files_module_code_check;
alter table app.files add constraint files_module_code_check check (module_code in ('players','billing','accounting','academies','attendance','programs','commerce','prospects','scouting','sponsors','equipment','calendar','users','admin','qa'));

-- Generic helper to replace policies consistently.
create or replace function private.install_module_rls(p_table regclass, p_module text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_schema text;
  v_table text;
  v_base text;
begin
  select n.nspname,c.relname into v_schema,v_table
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=p_table;
  if v_schema <> 'app' then raise exception 'Only app schema is allowed'; end if;
  v_base := 'v2_'||v_table;
  execute format('drop policy if exists %I on %I.%I',v_base||'_read',v_schema,v_table);
  execute format('drop policy if exists %I on %I.%I',v_base||'_insert',v_schema,v_table);
  execute format('drop policy if exists %I on %I.%I',v_base||'_update',v_schema,v_table);
  execute format('drop policy if exists %I on %I.%I',v_base||'_delete',v_schema,v_table);
  execute format('create policy %I on %I.%I for select to authenticated using ((select private.has_module_access(organization_id,%L,false)))',v_base||'_read',v_schema,v_table,p_module);
  execute format('create policy %I on %I.%I for insert to authenticated with check ((select private.has_module_access(organization_id,%L,true)))',v_base||'_insert',v_schema,v_table,p_module);
  execute format('create policy %I on %I.%I for update to authenticated using ((select private.has_module_access(organization_id,%L,true))) with check ((select private.has_module_access(organization_id,%L,true)))',v_base||'_update',v_schema,v_table,p_module,p_module);
  execute format('create policy %I on %I.%I for delete to authenticated using ((select private.has_module_access(organization_id,%L,true)))',v_base||'_delete',v_schema,v_table,p_module);
end
$$;

select private.install_module_rls('app.players','players');
select private.install_module_rls('app.guardians','players');
select private.install_module_rls('app.player_guardians','players');
select private.install_module_rls('app.categories','players');
select private.install_module_rls('app.player_enrollments','players');
select private.install_module_rls('app.billing_profiles','billing');
select private.install_module_rls('app.charges','billing');
select private.install_module_rls('app.payment_allocations','billing');
select private.install_module_rls('app.payments','billing');
select private.install_module_rls('app.player_benefits','billing');
select private.install_module_rls('app.refunds','billing');
select private.install_module_rls('app.charge_adjustments','billing');
select private.install_module_rls('app.expenses','accounting');
select private.install_module_rls('app.academies','academies');
select private.install_module_rls('app.academy_enrollments','academies');
select private.install_module_rls('app.attendance_records','attendance');
select private.install_module_rls('app.programs','programs');
select private.install_module_rls('app.program_enrollments','programs');
select private.install_module_rls('app.products','commerce');
select private.install_module_rls('app.orders','commerce');
select private.install_module_rls('app.order_items','commerce');
select private.install_module_rls('app.prospects','prospects');
select private.install_module_rls('app.scouting_reports','scouting');
select private.install_module_rls('app.sponsors','sponsors');
select private.install_module_rls('app.sponsor_agreements','sponsors');
select private.install_module_rls('app.equipment_items','equipment');
select private.install_module_rls('app.equipment_assignments','equipment');

-- Sessions can belong to calendar, academy or programs; attendance users also need read context.
drop policy if exists v2_sessions_read on app.sessions;
drop policy if exists v2_sessions_insert on app.sessions;
drop policy if exists v2_sessions_update on app.sessions;
drop policy if exists v2_sessions_delete on app.sessions;
create policy v2_sessions_read on app.sessions for select to authenticated
using ((select private.has_any_module_access(organization_id,array['calendar','academies','programs','attendance'],false)));
create policy v2_sessions_insert on app.sessions for insert to authenticated
with check ((select private.has_any_module_access(organization_id,array['calendar','academies','programs'],true)));
create policy v2_sessions_update on app.sessions for update to authenticated
using ((select private.has_any_module_access(organization_id,array['calendar','academies','programs'],true)))
with check ((select private.has_any_module_access(organization_id,array['calendar','academies','programs'],true)));
create policy v2_sessions_delete on app.sessions for delete to authenticated
using ((select private.has_any_module_access(organization_id,array['calendar','academies','programs'],true)));

-- File metadata is authorized by its own canonical module.
drop policy if exists v2_files_read on app.files;
drop policy if exists v2_files_insert on app.files;
drop policy if exists v2_files_update on app.files;
drop policy if exists v2_files_delete on app.files;
create policy v2_files_read on app.files for select to authenticated
using ((select private.has_module_access(organization_id,module_code,false)));
create policy v2_files_insert on app.files for insert to authenticated
with check ((select private.has_module_access(organization_id,module_code,true)));
create policy v2_files_update on app.files for update to authenticated
using ((select private.has_module_access(organization_id,module_code,true)))
with check ((select private.has_module_access(organization_id,module_code,true)));
create policy v2_files_delete on app.files for delete to authenticated
using ((select private.has_module_access(organization_id,module_code,true)));

-- Billing policy is readable by billing/accounting, writable only by admin.
drop policy if exists v2_billing_policies_read on app.billing_policies;
drop policy if exists v2_billing_policies_write on app.billing_policies;
create policy v2_billing_policies_read on app.billing_policies for select to authenticated
using ((select private.has_any_module_access(organization_id,array['billing','accounting'],false)));
create policy v2_billing_policies_write on app.billing_policies for all to authenticated
using ((select private.has_module_access(organization_id,'admin',true)))
with check ((select private.has_module_access(organization_id,'admin',true)));

-- Audit is append-only from trusted server/database paths; users with admin/QA can read.
drop policy if exists v2_audit_read on app.audit_events;
create policy v2_audit_read on app.audit_events for select to authenticated
using ((select private.has_any_module_access(organization_id,array['admin','qa'],false)));

-- Minimum grants: no anonymous access. Authenticated access is still constrained by RLS.
revoke all on all tables in schema app from anon;
grant usage on schema app to authenticated, service_role;
grant select,insert,update,delete on all tables in schema app to authenticated, service_role;
revoke insert,update,delete on app.audit_events from authenticated;

-- Financial ledgers are not mutable directly by the browser. Reads are allowed; writes go through trusted application services.
revoke insert,update,delete on app.charges,app.payment_allocations,app.payments,app.refunds,app.charge_adjustments from authenticated;

comment on schema private is 'Non-exposed authorization and security helpers for TannerOS v2.';
comment on function private.has_module_access(uuid,text,boolean) is 'Authorizes by active Auth user, organization membership, role permission and subscription entitlement.';;
