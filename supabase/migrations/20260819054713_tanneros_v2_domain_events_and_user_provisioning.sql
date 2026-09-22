create table if not exists app.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor text,
  request_id text,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_domain_events_org_time on app.domain_events(organization_id,occurred_at desc);
create index if not exists idx_domain_events_aggregate on app.domain_events(aggregate_type,aggregate_id,occurred_at desc);
alter table app.domain_events enable row level security;
revoke all on app.domain_events from anon, authenticated;
grant select on app.domain_events to authenticated;
grant all on app.domain_events to service_role;
drop policy if exists v2_domain_events_read on app.domain_events;
create policy v2_domain_events_read on app.domain_events for select to authenticated
using ((select private.has_any_module_access(organization_id,array['admin','qa'],false)));

create table if not exists app.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_code text not null,
  invited_by uuid references auth.users(id) on delete set null,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,email,status)
);
create index if not exists idx_org_invites_email_status on app.organization_invitations(lower(email),status,expires_at);
alter table app.organization_invitations enable row level security;
revoke all on app.organization_invitations from anon;
grant select,insert,update on app.organization_invitations to authenticated,service_role;
drop policy if exists v2_org_invites_read on app.organization_invitations;
drop policy if exists v2_org_invites_insert on app.organization_invitations;
drop policy if exists v2_org_invites_update on app.organization_invitations;
create policy v2_org_invites_read on app.organization_invitations for select to authenticated
using ((select private.can_manage_users(organization_id)) or lower(email)=lower(coalesce((select auth.jwt()->>'email'),'')));
create policy v2_org_invites_insert on app.organization_invitations for insert to authenticated
with check ((select private.can_manage_users(organization_id)) and invited_by=(select auth.uid()));
create policy v2_org_invites_update on app.organization_invitations for update to authenticated
using ((select private.can_manage_users(organization_id)))
with check ((select private.can_manage_users(organization_id)));

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public
as $$
begin
  insert into public.profiles(user_id,display_name,phone,active,created_at,updated_at)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)),new.phone,true,now(),now())
  on conflict(user_id) do nothing;
  return new;
end
$$;
revoke all on function private.handle_new_auth_user() from public,anon,authenticated;
drop trigger if exists trg_tanneros_auth_user_created on auth.users;
create trigger trg_tanneros_auth_user_created
after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function private.accept_pending_invites(p_user_id uuid,p_email text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog,public,app
as $$
declare r record; v_count integer:=0; v_legacy_role text;
begin
  for r in
    select * from app.organization_invitations
    where lower(email)=lower(p_email) and status='pending' and expires_at>=now()
    for update
  loop
    v_legacy_role := case r.role_code
      when 'owner' then 'Presidencia'
      when 'president' then 'Presidencia'
      when 'operations' then 'Operaciones'
      when 'coach' then 'Formadores'
      when 'academy' then 'Academia'
      when 'cashier' then 'Taquilla'
      when 'accounting' then 'Contabilidad'
      when 'commercial' then 'La Quinta Fuerza'
      when 'scouting' then 'Scouting'
      when 'player' then 'Tanner'
      else null end;
    if v_legacy_role is null then raise exception 'Unknown role code %',r.role_code; end if;
    insert into public.organization_memberships(organization_id,user_id,role,active,is_owner,created_at,updated_at)
    values(r.organization_id,p_user_id,v_legacy_role,true,r.role_code='owner',now(),now())
    on conflict(organization_id,user_id) do update set role=excluded.role,active=true,is_owner=excluded.is_owner,updated_at=now();
    update app.organization_invitations set status='accepted',accepted_by=p_user_id,accepted_at=now(),updated_at=now() where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;
revoke all on function private.accept_pending_invites(uuid,text) from public,anon,authenticated;

create or replace function private.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $$
begin
  if new.email is not null and new.confirmed_at is not null and (old.confirmed_at is null or old.confirmed_at is distinct from new.confirmed_at) then
    perform private.accept_pending_invites(new.id,new.email);
  end if;
  return new;
end
$$;
revoke all on function private.handle_auth_user_confirmed() from public,anon,authenticated;
drop trigger if exists trg_tanneros_auth_user_confirmed on auth.users;
create trigger trg_tanneros_auth_user_confirmed
after update of confirmed_at on auth.users for each row execute function private.handle_auth_user_confirmed();

comment on table app.domain_events is 'Immutable business-domain event stream for integration and audit workflows.';
comment on table app.organization_invitations is 'Pending SaaS organization invitations; no legacy password migration.';;
