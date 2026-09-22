-- 1. Push subscriptions table
create table if not exists app.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_org_user_idx on app.push_subscriptions(organization_id, user_id);

alter table app.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own_select on app.push_subscriptions;
drop policy if exists push_subscriptions_own_insert on app.push_subscriptions;
drop policy if exists push_subscriptions_own_update on app.push_subscriptions;
drop policy if exists push_subscriptions_own_delete on app.push_subscriptions;
create policy push_subscriptions_own_select on app.push_subscriptions for select using (user_id = auth.uid());
create policy push_subscriptions_own_insert on app.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_subscriptions_own_update on app.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own_delete on app.push_subscriptions for delete using (user_id = auth.uid());

-- 2. Vault secrets (VAPID key pair + shared token for the internal edge function call)
select vault.create_secret('BDtFwZWNPYPy3-puGg1Q18Bs_hLfVI4tkA1m2cZqqa3h5Dl-Cf-81Iv3gR44saaQmof-Ri3o2oZ7LZe1cKTfnaQ','vapid_public_key','Web Push VAPID public key (safe to expose to clients)')
where not exists (select 1 from vault.secrets where name='vapid_public_key');
select vault.create_secret('gLqR-F6davDUk4howmLmxEb8Mo_ur-OGejG4npGbwVE','vapid_private_key','Web Push VAPID private key — server-side only')
where not exists (select 1 from vault.secrets where name='vapid_private_key');
select vault.create_secret('cgiE1b1B9D_1wPyK5in6uIgk_QSaRyMg5fsuugxD9dI','push_internal_token','Shared secret so the send-push edge function only accepts calls from our own Postgres')
where not exists (select 1 from vault.secrets where name='push_internal_token');

create or replace function private.get_app_secret(p_name text)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','vault'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name=p_name limit 1
$function$;
revoke all on function private.get_app_secret(text) from public, anon, authenticated;

-- 3. Subscription management RPCs
create or replace function private.command_save_push_subscription(p_organization_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  if coalesce(nullif(trim(p_endpoint),''),'') = '' then raise exception 'Subscription endpoint required'; end if;
  insert into app.push_subscriptions(organization_id,user_id,endpoint,p256dh,auth,user_agent)
  values (p_organization_id, v_uid, p_endpoint, p_p256dh, p_auth, nullif(trim(coalesce(p_user_agent,'')),''))
  on conflict (endpoint) do update set
    organization_id=excluded.organization_id, user_id=excluded.user_id,
    p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent, last_seen_at=now();
end
$function$;

create or replace function private.command_delete_push_subscription(p_organization_id uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  delete from app.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
end
$function$;

create or replace function public.v2_save_push_subscription(organization_id uuid, endpoint text, p256dh text, auth text, user_agent text default null)
returns void
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_save_push_subscription(organization_id, endpoint, p256dh, auth, user_agent)
$function$;

create or replace function public.v2_delete_push_subscription(organization_id uuid, endpoint text)
returns void
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_delete_push_subscription(organization_id, endpoint)
$function$;

revoke all on function private.command_save_push_subscription(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function private.command_delete_push_subscription(uuid,text) from public, anon, authenticated;
revoke all on function public.v2_save_push_subscription(uuid,text,text,text,text) from public, anon;
revoke all on function public.v2_delete_push_subscription(uuid,text) from public, anon;
grant execute on function public.v2_save_push_subscription(uuid,text,text,text,text) to authenticated;
grant execute on function public.v2_delete_push_subscription(uuid,text) to authenticated;

-- 4. notify_push: resolves an audience to subscriptions and fires the send-push edge function
create or replace function private.notify_push(p_organization_id uuid, p_title text, p_body text, p_audience_type text, p_audience_value text, p_url text default '/')
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','app','public','private','vault','net'
as $function$
declare
  v_subs jsonb;
  v_public_key text;
  v_private_key text;
  v_token text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('endpoint',ps.endpoint,'keys',jsonb_build_object('p256dh',ps.p256dh,'auth',ps.auth))),'[]'::jsonb)
  into v_subs
  from app.push_subscriptions ps
  join public.organization_memberships m on m.user_id=ps.user_id and m.organization_id=ps.organization_id and m.active=true
  where ps.organization_id=p_organization_id
    and (
      p_audience_type='club'
      or (p_audience_type='role' and m.role=p_audience_value)
      or (p_audience_type='user' and ps.user_id::text=p_audience_value)
    );

  if coalesce(jsonb_array_length(v_subs),0)=0 then return; end if;

  v_public_key := private.get_app_secret('vapid_public_key');
  v_private_key := private.get_app_secret('vapid_private_key');
  v_token := private.get_app_secret('push_internal_token');
  if v_public_key is null or v_private_key is null or v_token is null then return; end if;

  perform net.http_post(
    url := 'https://pacnegivzgxpanphrnwp.supabase.co/functions/v1/send-push',
    body := jsonb_build_object(
      'vapidPublicKey',v_public_key,'vapidPrivateKey',v_private_key,
      'subscriptions',v_subs,'title',coalesce(p_title,'TannerOS'),'body',coalesce(p_body,''),'url',coalesce(p_url,'/')
    ),
    headers := jsonb_build_object('Content-Type','application/json','x-internal-token',v_token),
    timeout_milliseconds := 8000
  );
exception when others then
  -- el push es best-effort: si algo falla aquí, nunca debe tumbar la operación que lo disparó
  null;
end
$function$;
revoke all on function private.notify_push(uuid,text,text,text,text,text) from public, anon, authenticated;

-- 5. Extiende el sistema de anuncios (ya existente) para permitir audiencia 'user' y disparar push al publicar
create or replace function private.command_publish_announcement(p_organization_id uuid, p_title text, p_body text default null::text, p_audience_type text default 'club'::text, p_audience_value text default null::text, p_source text default 'manual'::text, p_source_id uuid default null::uuid, p_starts_at timestamp with time zone default null::timestamp with time zone, p_expires_at timestamp with time zone default null::timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v_actor uuid; v_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['calendar','admin'], true) then raise exception 'Not authorized'; end if;
  if coalesce(nullif(trim(p_title),''),'') = '' then raise exception 'Title required'; end if;
  if p_audience_type not in ('club','role','user') then raise exception 'Invalid audience'; end if;
  insert into app.announcements(organization_id,title,body,source,source_id,audience_type,audience_value,starts_at,expires_at,published_by)
  values (p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), coalesce(p_source,'manual'), p_source_id, p_audience_type, p_audience_value, p_starts_at, p_expires_at, v_actor)
  returning id into v_id;
  perform private.notify_push(p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), p_audience_type, p_audience_value, '/');
  return v_id;
end $function$;

create or replace function private.query_my_announcements(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
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
    and (
      a.audience_type='club'
      or (a.audience_type='role' and a.audience_value=v_role)
      or (a.audience_type='user' and a.audience_value=v_uid::text)
    );
  return v_data;
end $function$;
;
