/* ---------- La campana: sin silenciados (salvo menciones) ni programados ---------- */
create or replace function private.query_chat_pulse(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_chats int; v_last timestamptz; v_seen timestamptz; v_avisos int;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  select count(*), max(cm.created_at) into v_chats, v_last
  from app.chat_messages cm join app.chat_threads t on t.id = cm.thread_id
  left join app.chat_members me on me.thread_id = t.id and me.user_id = v_uid
  where t.organization_id = p_organization_id and cm.sender_user_id <> v_uid and cm.deleted_at is null
    and ((t.kind = 'direct' and me.user_id is not null)
      or (t.kind = 'area' and (t.area_role = '*' or t.area_role = v_role or v_pres)))
    and cm.created_at > coalesce(me.last_read_at, '-infinity')
    and (coalesce(me.muted_until, '-infinity') <= now() or v_uid = any(cm.mentions));
  select seen_at into v_seen from app.announcement_seen where organization_id = p_organization_id and user_id = v_uid;
  select count(*) into v_avisos from app.announcements a
  where a.organization_id = p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
    and (a.starts_at is null or a.starts_at <= now())
    and (a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role) or (a.audience_type = 'user' and a.audience_value = v_uid::text))
    and (v_seen is null or coalesce(a.starts_at, a.published_at) > v_seen);
  return jsonb_build_object('chats', v_chats, 'avisos', v_avisos, 'total', v_chats + v_avisos);
end $$;

create or replace function private.query_my_announcements(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'app', 'private'
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
      'startsAt',a.starts_at,'publishedAt',coalesce(a.starts_at,a.published_at),
      'unread',(v_seen is null or coalesce(a.starts_at,a.published_at) > v_seen)
    ) order by coalesce(a.starts_at,a.published_at) desc),'[]'::jsonb)
  into v_data
  from app.announcements a
  where a.organization_id=p_organization_id and a.archived_at is null
    and (a.expires_at is null or a.expires_at > now())
    and (a.starts_at is null or a.starts_at <= now())
    and (
      a.audience_type='club'
      or (a.audience_type='role' and a.audience_value=v_role)
      or (a.audience_type='user' and a.audience_value=v_uid::text)
    );
  return v_data;
end $$;

-- Portal de familias: un programado cuenta como nuevo cuando sale, no cuando se capturó.
create or replace function public.v2_portal_avisos()
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare g app.guardians; v_seen timestamptz; v_cats text[];
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  select seen_at into v_seen from app.announcement_seen where organization_id = g.organization_id and user_id = g.user_id;
  select coalesce(array_agg(distinct p.category), '{}') into v_cats from app.players p where p.id in (select player_id from private.portal_player_ids()) and p.status = 'active';
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
      'categoria', case when a.audience_type = 'categoria' then a.audience_value end,
      'publishedAt', a.salio, 'author', case when a.published_by is null then null else private.chat_name(a.published_by) end,
      'unread', (v_seen is null or a.salio > v_seen)) order by a.salio desc), '[]'::jsonb)
    from (select a.*, coalesce(a.starts_at, a.published_at) salio from app.announcements a
           where a.organization_id = g.organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
             and (a.starts_at is null or a.starts_at <= now())
             and (a.audience_type = 'familias' or (a.audience_type = 'categoria' and a.audience_value = any(v_cats)))
           order by coalesce(a.starts_at, a.published_at) desc limit 30) a);
end $$;
revoke all on function public.v2_portal_avisos() from public, anon;
grant execute on function public.v2_portal_avisos() to authenticated;
