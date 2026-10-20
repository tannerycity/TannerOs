/* ---------- El hilo: con cita, archivo, fijado y silencio ---------- */
create or replace function private.query_chat_thread(p_organization_id uuid, p_thread_id uuid, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_uid uuid := auth.uid(); t app.chat_threads; v_out jsonb;
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  select * into t from app.chat_threads where id = p_thread_id;
  select jsonb_build_object(
    'thread', jsonb_build_object('id', t.id, 'kind', t.kind, 'areaRole', t.area_role,
      'title', case when t.kind = 'area' then case when t.area_role = '*' then 'Todo el club' else t.area_role end
                    else (select private.chat_name(o.user_id) from app.chat_members o where o.thread_id = t.id and o.user_id <> v_uid limit 1) end,
      'mutedUntil', (select cm.muted_until from app.chat_members cm where cm.thread_id = t.id and cm.user_id = v_uid and cm.muted_until > now()),
      'pinned', (select private.chat_msg_json(pm, v_uid) || jsonb_build_object('pinnedBy', private.chat_name(t.pinned_by))
                 from app.chat_messages pm where pm.id = t.pinned_message_id and pm.deleted_at is null),
      -- Quién está en el chat: para las palomitas, el "visto por" y las menciones.
      'members', (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', private.chat_name(m.user_id), 'role', m.role,
                     'lastReadAt', (select cm.last_read_at from app.chat_members cm where cm.thread_id = t.id and cm.user_id = m.user_id))
                   order by private.chat_name(m.user_id)), '[]'::jsonb)
                  from public.organization_memberships m
                  where m.organization_id = p_organization_id and m.active
                    and case when t.kind = 'direct' then exists (select 1 from app.chat_members cm where cm.thread_id = t.id and cm.user_id = m.user_id)
                             else (t.area_role = '*' or m.role = t.area_role or m.role = 'Presidencia') end)),
    'messages', (select coalesce(jsonb_agg(private.chat_msg_json(z, v_uid) order by z.created_at), '[]'::jsonb)
                 from (select * from app.chat_messages cm where cm.thread_id = t.id
                         and (p_before is null or cm.created_at < p_before)
                       order by cm.created_at desc limit 80) z))
  into v_out;
  return v_out;
end $$;

/* ---------- La lista de chats ---------- */
create or replace function private.query_chat_inbox(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_out jsonb;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  perform private.chat_ensure_areas(p_organization_id);
  v_role := private.chat_my_role(p_organization_id);
  v_pres := private.is_presidency(p_organization_id);
  select jsonb_build_object(
    'me', jsonb_build_object('userId', v_uid, 'name', private.chat_name(v_uid), 'role', v_role, 'presidency', v_pres),
    'threads', coalesce(jsonb_agg(x.j order by x.orden, x.ultimo desc nulls last), '[]'::jsonb),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', private.chat_name(m.user_id), 'role', m.role)
                 order by private.chat_name(m.user_id)), '[]'::jsonb)
               from public.organization_memberships m
               where m.organization_id = p_organization_id and m.active and m.user_id <> v_uid))
  into v_out
  from (
    select case when t.last_message_at is null and t.kind = 'area' then 1 else 0 end orden, t.last_message_at ultimo,
      jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'areaRole', t.area_role,
        'title', case when t.kind = 'area' then case when t.area_role = '*' then 'Todo el club' else t.area_role end
                      else (select private.chat_name(o.user_id) from app.chat_members o where o.thread_id = t.id and o.user_id <> v_uid limit 1) end,
        'otherRole', case when t.kind = 'direct' then (select m.role from app.chat_members o join public.organization_memberships m
                      on m.user_id = o.user_id and m.organization_id = p_organization_id and m.active where o.thread_id = t.id and o.user_id <> v_uid limit 1) end,
        'muted', coalesce(me.muted_until > now(), false),
        'last', (select jsonb_build_object('body', left(private.chat_preview(cm), 140), 'senderName', private.chat_name(cm.sender_user_id),
                   'mine', cm.sender_user_id = v_uid, 'at', cm.created_at, 'deleted', cm.deleted_at is not null)
                 from app.chat_messages cm where cm.thread_id = t.id order by cm.created_at desc limit 1),
        'unread', (select count(*) from app.chat_messages cm where cm.thread_id = t.id and cm.sender_user_id <> v_uid and cm.deleted_at is null
                   and cm.created_at > coalesce(me.last_read_at, '-infinity')),
        'mentions', (select count(*) from app.chat_messages cm where cm.thread_id = t.id and cm.sender_user_id <> v_uid and cm.deleted_at is null
                   and v_uid = any(cm.mentions) and cm.created_at > coalesce(me.last_read_at, '-infinity'))
      ) j
    from app.chat_threads t
    left join app.chat_members me on me.thread_id = t.id and me.user_id = v_uid
    where t.organization_id = p_organization_id
      and ((t.kind = 'direct' and me.user_id is not null)
        or (t.kind = 'area' and (t.area_role = '*' or t.area_role = v_role or v_pres)))
  ) x;
  return v_out;
end $$;
