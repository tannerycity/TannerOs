
-- ============ TABLAS ============
create table if not exists app.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  source text not null default 'manual',
  source_id uuid,
  audience_type text not null default 'club' check (audience_type in ('club','role')),
  audience_value text,
  starts_at timestamptz,
  expires_at timestamptz,
  published_by uuid,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists idx_announcements_org_pub on app.announcements(organization_id, published_at desc) where archived_at is null;

create table if not exists app.announcement_seen (
  organization_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table app.announcements enable row level security;
alter table app.announcement_seen enable row level security;

-- ============ FUNCIONES PRIVADAS (gated) ============
create or replace function private.command_publish_announcement(
  p_organization_id uuid, p_title text, p_body text default null,
  p_audience_type text default 'club', p_audience_value text default null,
  p_source text default 'manual', p_source_id uuid default null,
  p_starts_at timestamptz default null, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['calendar','admin'], true) then raise exception 'Not authorized'; end if;
  if coalesce(nullif(trim(p_title),''),'') = '' then raise exception 'Title required'; end if;
  if p_audience_type not in ('club','role') then raise exception 'Invalid audience'; end if;
  insert into app.announcements(organization_id,title,body,source,source_id,audience_type,audience_value,starts_at,expires_at,published_by)
  values (p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), coalesce(p_source,'manual'), p_source_id, p_audience_type, p_audience_value, p_starts_at, p_expires_at, v_actor)
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.query_my_announcements(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v_uid uuid; v_role text; v_seen timestamptz; v_data jsonb;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_uid := auth.uid();
  select role into v_role from public.organization_memberships where organization_id=p_organization_id and user_id=v_uid and active=true limit 1;
  select seen_at into v_seen from app.announcement_seen where organization_id=p_organization_id and user_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'title',a.title,'body',a.body,'source',a.source,'sourceId',a.source_id,
      'audienceType',a.audience_type,'audienceValue',a.audience_value,
      'startsAt',a.starts_at,'publishedAt',a.published_at,
      'unread',(v_seen is null or a.published_at > v_seen)
    ) order by a.published_at desc),'[]'::jsonb)
  into v_data
  from app.announcements a
  where a.organization_id=p_organization_id and a.archived_at is null
    and (a.expires_at is null or a.expires_at > now())
    and (a.audience_type='club' or (a.audience_type='role' and a.audience_value=v_role));
  return v_data;
end $$;

create or replace function private.command_mark_announcements_seen(p_organization_id uuid)
returns void
language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v_uid uuid;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_uid := auth.uid();
  insert into app.announcement_seen(organization_id,user_id,seen_at) values (p_organization_id, v_uid, now())
  on conflict (organization_id,user_id) do update set seen_at=now();
end $$;

-- ============ WRAPPERS PÚBLICOS (v2_) ============
create or replace function public.v2_publish_announcement(
  organization_id uuid, title text, body text default null,
  audience_type text default 'club', audience_value text default null,
  source text default 'manual', source_id uuid default null,
  starts_at timestamptz default null, expires_at timestamptz default null
) returns uuid language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_publish_announcement(organization_id,title,body,audience_type,audience_value,source,source_id,starts_at,expires_at) $$;

create or replace function public.v2_my_announcements(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public','private'
as $$ select private.query_my_announcements(organization_id) $$;

create or replace function public.v2_mark_announcements_seen(organization_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_mark_announcements_seen(organization_id) $$;

-- ============ PERMISOS (solo authenticated, como el resto de v2_) ============
revoke all on function public.v2_publish_announcement(uuid,text,text,text,text,text,uuid,timestamptz,timestamptz) from public, anon;
revoke all on function public.v2_my_announcements(uuid) from public, anon;
revoke all on function public.v2_mark_announcements_seen(uuid) from public, anon;
grant execute on function public.v2_publish_announcement(uuid,text,text,text,text,text,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.v2_my_announcements(uuid) to authenticated;
grant execute on function public.v2_mark_announcements_seen(uuid) to authenticated;
;
