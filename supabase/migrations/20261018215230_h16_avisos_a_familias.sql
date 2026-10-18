-- Portal de familias, fase 2: avisos del club a las familias (18/10/2026).
-- "Que le lleguen los anuncios a todas las familias." Hasta hoy los avisos
-- sólo llegaban al staff. Dos públicos nuevos:
--   familias            todas las familias con cuenta en el portal
--   categoria / <cat>   las familias con un hijo activo en esa categoría
-- Llegan al portal (Inicio) y, si la familia activó notificaciones, a su
-- celular. Presidencia ve cuántas familias ya lo vieron.
alter table app.announcements drop constraint if exists announcements_audience_type_check;
alter table app.announcements add constraint announcements_audience_type_check
  check (audience_type = any (array['club', 'role', 'user', 'familias', 'categoria']));

create or replace function private.command_publish_announcement(p_organization_id uuid, p_title text, p_body text DEFAULT NULL::text, p_audience_type text DEFAULT 'club'::text, p_audience_value text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text, p_source_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'private'
AS $function$
declare v_actor uuid; v_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['calendar','admin'], true) then raise exception 'Not authorized'; end if;
  if coalesce(nullif(trim(p_title),''),'') = '' then raise exception 'Title required'; end if;
  if p_audience_type not in ('club','role','user','familias','categoria') then raise exception 'Invalid audience'; end if;
  if p_audience_type = 'categoria' and coalesce(nullif(trim(p_audience_value),''),'') = '' then raise exception 'Elige la categoría'; end if;
  insert into app.announcements(organization_id,title,body,source,source_id,audience_type,audience_value,starts_at,expires_at,published_by)
  values (p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), coalesce(p_source,'manual'), p_source_id, p_audience_type,
          case when p_audience_type = 'familias' then null else p_audience_value end, p_starts_at, p_expires_at, v_actor)
  returning id into v_id;
  perform private.notify_push(p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), p_audience_type, p_audience_value,
          case when p_audience_type in ('familias','categoria') then '/familias/' else '/' end);
  return v_id;
end $function$;

-- Las familias del público de un aviso (cuentas del portal).
create or replace function private.family_audience_users(p_organization_id uuid, p_audience_type text, p_audience_value text)
returns table(user_id uuid) language sql stable security definer set search_path to 'pg_catalog', 'app' as $$
  select distinct g.user_id from app.guardians g
   where g.organization_id = p_organization_id and g.user_id is not null and coalesce(g.status, 'active') <> 'inactive'
     and exists (select 1 from app.player_guardians pg join app.players p on p.id = pg.player_id
                  where pg.guardian_id = g.id and p.status = 'active'
                    and (p_audience_type = 'familias' or (p_audience_type = 'categoria' and p.category = p_audience_value)))
$$;

create or replace function private.notify_push(p_organization_id uuid, p_title text, p_body text, p_audience_type text, p_audience_value text, p_url text DEFAULT '/'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'private', 'vault', 'net'
AS $function$
declare
  v_subs jsonb;
  v_public_key text;
  v_private_key text;
  v_token text;
begin
  if p_audience_type in ('familias','categoria') then
    -- Las familias no son miembros del club: se buscan por su tutor.
    select coalesce(jsonb_agg(jsonb_build_object('endpoint',ps.endpoint,'keys',jsonb_build_object('p256dh',ps.p256dh,'auth',ps.auth))),'[]'::jsonb)
    into v_subs
    from app.push_subscriptions ps
    where ps.organization_id = p_organization_id
      and ps.user_id in (select user_id from private.family_audience_users(p_organization_id, p_audience_type, p_audience_value));
  else
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
  end if;

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

-- Mensajes > Avisos del staff: quien publica ve lo suyo, el alcance de un aviso
-- a familias se cuenta en familias, y van las categorías para elegir.
create or replace function private.query_avisos(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_seen timestamptz; v_out jsonb; v_pub boolean;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  v_pub := private.has_any_module_access(p_organization_id, array['calendar','admin'], true);
  select seen_at into v_seen from app.announcement_seen where organization_id = p_organization_id and user_id = v_uid;
  with vis as (
    select a.* from app.announcements a
    where a.organization_id = p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
      and (v_pres or a.published_by = v_uid or a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role)
           or (a.audience_type = 'user' and a.audience_value = v_uid::text))
  ), grp as (
    select (array_agg(a.id order by (a.audience_value = v_uid::text) desc, a.id))[1] as id,
      a.title, a.body, a.source, a.published_by, min(a.published_at) as published_at,
      min(a.audience_type) as audience_type, count(*) as n,
      array_agg(distinct a.audience_value) as valores
    from vis a
    group by a.title, a.body, a.source, a.published_by,
      case when a.audience_type = 'user' then date_trunc('minute', a.published_at) end,
      case when a.audience_type = 'user' then null else a.id end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'body', g.body, 'source', g.source,
      'audienceType', case when g.n > 1 then 'users' else g.audience_type end,
      'audienceValue', case when g.n > 1 then null else g.valores[1] end,
      'recipients', case when g.audience_type = 'user' then (
          select coalesce(jsonb_agg(jsonb_build_object('userId', v, 'name', private.chat_name(v::uuid)) order by (v = v_uid::text) desc, v), '[]'::jsonb)
          from unnest(g.valores) v) end,
      'publishedAt', g.published_at, 'author', case when g.published_by is null then 'TannerOS' else private.chat_name(g.published_by) end,
      'unread', (v_seen is null or g.published_at > v_seen),
      'reach', case when not (v_pres or g.published_by = v_uid) then null
        when g.audience_type in ('familias','categoria') then (
          select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= g.published_at), 'familias', true)
          from private.family_audience_users(p_organization_id, g.audience_type, g.valores[1]) f
          left join app.announcement_seen s on s.organization_id = p_organization_id and s.user_id = f.user_id)
        else (
        select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= g.published_at))
        from public.organization_memberships m
        left join app.announcement_seen s on s.organization_id = m.organization_id and s.user_id = m.user_id
        where m.organization_id = p_organization_id and m.active
          and (g.audience_type = 'club' or (g.audience_type = 'role' and m.role = any(g.valores))
               or (g.audience_type = 'user' and m.user_id::text = any(g.valores)))) end
    ) order by g.published_at desc), '[]'::jsonb)
  into v_out from grp g;
  return jsonb_build_object('canPublish', v_pub, 'avisos', v_out,
    'categorias', case when v_pub then (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from (
        select distinct p.category c from app.players p where p.organization_id = p_organization_id and p.status = 'active' and nullif(trim(p.category), '') is not null) x) end);
end $function$;

-- Los avisos que ve la familia en su portal.
create or replace function public.v2_portal_avisos()
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $$
declare g app.guardians; v_seen timestamptz; v_cats text[];
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  select seen_at into v_seen from app.announcement_seen where organization_id = g.organization_id and user_id = g.user_id;
  select coalesce(array_agg(distinct p.category), '{}') into v_cats from app.players p where p.id in (select player_id from private.portal_player_ids()) and p.status = 'active';
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
      'categoria', case when a.audience_type = 'categoria' then a.audience_value end,
      'publishedAt', a.published_at, 'author', case when a.published_by is null then null else private.chat_name(a.published_by) end,
      'unread', (v_seen is null or a.published_at > v_seen)) order by a.published_at desc), '[]'::jsonb)
    from (select * from app.announcements a
           where a.organization_id = g.organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
             and (a.starts_at is null or a.starts_at <= now())
             and (a.audience_type = 'familias' or (a.audience_type = 'categoria' and a.audience_value = any(v_cats)))
           order by a.published_at desc limit 30) a);
end $$;
revoke all on function public.v2_portal_avisos() from public, anon;
grant execute on function public.v2_portal_avisos() to authenticated;

create or replace function public.v2_portal_avisos_vistos()
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  insert into app.announcement_seen(organization_id, user_id, seen_at) values (g.organization_id, g.user_id, now())
  on conflict (organization_id, user_id) do update set seen_at = now();
end $$;
revoke all on function public.v2_portal_avisos_vistos() from public, anon;
grant execute on function public.v2_portal_avisos_vistos() to authenticated;

-- Notificaciones al celular de la familia.
create or replace function public.v2_portal_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if coalesce(nullif(trim(p_endpoint), ''), '') = '' then raise exception 'Subscription endpoint required'; end if;
  insert into app.push_subscriptions(organization_id, user_id, endpoint, p256dh, auth, user_agent)
  values (g.organization_id, g.user_id, p_endpoint, p_p256dh, p_auth, nullif(trim(coalesce(p_user_agent, '')), ''))
  on conflict (endpoint) do update set organization_id = excluded.organization_id, user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = now();
end $$;
revoke all on function public.v2_portal_save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.v2_portal_save_push_subscription(text, text, text, text) to authenticated;
