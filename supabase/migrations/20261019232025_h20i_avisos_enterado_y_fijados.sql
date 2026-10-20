/* ---------- Avisos: lista con Enterado, fijados y programados ---------- */
create or replace function private.query_avisos(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_seen timestamptz; v_out jsonb; v_pub boolean;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  v_pub := private.has_any_module_access(p_organization_id, array['calendar','admin'], true);
  select seen_at into v_seen from app.announcement_seen where organization_id = p_organization_id and user_id = v_uid;
  with vis as (
    select a.*, coalesce(a.starts_at, a.published_at) as salio,
      (a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role)
        or (a.audience_type = 'user' and a.audience_value = v_uid::text)) as para_mi
    from app.announcements a
    where a.organization_id = p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
      and (v_pres or a.published_by = v_uid or a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role)
           or (a.audience_type = 'user' and a.audience_value = v_uid::text))
      -- Un programado sólo lo ve antes de tiempo quien lo puede manejar.
      and (a.starts_at is null or a.starts_at <= now() or v_pres or a.published_by = v_uid)
  ), grp as (
    select (array_agg(a.id order by (a.audience_value = v_uid::text) desc, a.id))[1] as id,
      array_agg(a.id) as ids, bool_or(a.para_mi) as para_mi,
      a.title, a.body, a.source, a.published_by, min(a.salio) as salio, max(a.starts_at) as starts_at, max(a.pinned_at) as pinned_at,
      min(a.audience_type) as audience_type, count(*) as n,
      array_agg(distinct a.audience_value) as valores
    from vis a
    group by a.title, a.body, a.source, a.published_by, a.starts_at,
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
      'publishedAt', g.salio, 'author', case when g.published_by is null then 'TannerOS' else private.chat_name(g.published_by) end,
      'scheduledFor', case when g.starts_at > now() then g.starts_at end,
      'pinned', g.pinned_at is not null,
      'canManage', (v_pres or g.published_by = v_uid),
      'canAck', g.para_mi and g.published_by is distinct from v_uid and not coalesce(g.starts_at > now(), false),
      'acked', exists (select 1 from app.announcement_acks k where k.announcement_id = any(g.ids) and k.user_id = v_uid),
      'unread', not coalesce(g.starts_at > now(), false) and (v_seen is null or g.salio > v_seen),
      'reach', case when not (v_pres or g.published_by = v_uid) or g.starts_at > now() then null
        when g.audience_type in ('familias','categoria') then (
          select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= g.salio), 'familias', true)
          from private.family_audience_users(p_organization_id, g.audience_type, g.valores[1]) f
          left join app.announcement_seen s on s.organization_id = p_organization_id and s.user_id = f.user_id)
        else (
        select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= g.salio),
          'acked', count(*) filter (where exists (select 1 from app.announcement_acks k where k.announcement_id = any(g.ids) and k.user_id = m.user_id)))
        from public.organization_memberships m
        left join app.announcement_seen s on s.organization_id = m.organization_id and s.user_id = m.user_id
        where m.organization_id = p_organization_id and m.active and m.user_id is distinct from g.published_by
          and (g.audience_type = 'club' or (g.audience_type = 'role' and m.role = any(g.valores))
               or (g.audience_type = 'user' and m.user_id::text = any(g.valores)))) end
    ) order by (g.pinned_at is not null) desc, g.pinned_at desc, g.salio desc), '[]'::jsonb)
  into v_out from grp g;
  return jsonb_build_object('canPublish', v_pub, 'avisos', v_out,
    'categorias', case when v_pub then (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from (
        select distinct p.category c from app.players p where p.organization_id = p_organization_id and p.status = 'active' and nullif(trim(p.category), '') is not null) x) end);
end $$;

create or replace function private.command_aviso_enterado(p_organization_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare a app.announcements; v_uid uuid := auth.uid(); v_role text;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into a from app.announcements where id = p_id and organization_id = p_organization_id and archived_at is null;
  v_role := private.chat_my_role(p_organization_id);
  if a.id is null or not (a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role)
     or (a.audience_type = 'user' and a.audience_value = v_uid::text)) or (a.starts_at > now()) then
    raise exception 'Ese aviso no es para ti'; end if;
  insert into app.announcement_acks(announcement_id, user_id) values (p_id, v_uid) on conflict do nothing;
end $$;

-- Quién lo vio, quién dijo "Enterado" y quién falta. Sólo el autor o Presidencia.
create or replace function private.query_aviso_detalle(p_organization_id uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare a app.announcements; v_ids uuid[]; v_salio timestamptz;
begin
  if not private.aviso_puede_manejar(p_organization_id, p_id) then raise exception 'Not authorized'; end if;
  select * into a from app.announcements where id = p_id;
  select array_agg(h) into v_ids from private.aviso_hermanos(p_id) h;
  v_salio := coalesce(a.starts_at, a.published_at);
  if a.audience_type in ('familias', 'categoria') then
    return (select coalesce(jsonb_agg(jsonb_build_object('name', private.chat_name(f.user_id), 'role', 'Familia',
              'seenAt', case when s.seen_at >= v_salio then s.seen_at end, 'ackAt', null)
              order by (s.seen_at >= v_salio) nulls first, private.chat_name(f.user_id)), '[]'::jsonb)
            from private.family_audience_users(p_organization_id, a.audience_type, a.audience_value) f
            left join app.announcement_seen s on s.organization_id = p_organization_id and s.user_id = f.user_id);
  end if;
  return (select coalesce(jsonb_agg(x.j order by x.orden, x.nombre), '[]'::jsonb) from (
    select private.chat_name(m.user_id) nombre,
      case when k.acked_at is not null then 2 when s.seen_at >= v_salio then 1 else 0 end orden,
      jsonb_build_object('name', private.chat_name(m.user_id), 'role', m.role,
        'seenAt', case when s.seen_at >= v_salio then s.seen_at end, 'ackAt', k.acked_at) j
    from public.organization_memberships m
    left join app.announcement_seen s on s.organization_id = m.organization_id and s.user_id = m.user_id
    left join lateral (select max(acked_at) acked_at from app.announcement_acks ak where ak.announcement_id = any(v_ids) and ak.user_id = m.user_id) k on true
    where m.organization_id = p_organization_id and m.active and m.user_id is distinct from a.published_by
      and (a.audience_type = 'club' or (a.audience_type = 'role' and m.role = a.audience_value)
           or (a.audience_type = 'user' and m.user_id::text in (select b.audience_value from app.announcements b where b.id = any(v_ids))))) x);
end $$;

create or replace function private.command_aviso_fijar(p_organization_id uuid, p_id uuid, p_fijo boolean)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.aviso_puede_manejar(p_organization_id, p_id) then raise exception 'Not authorized'; end if;
  update app.announcements set pinned_at = case when p_fijo then now() end where id in (select private.aviso_hermanos(p_id));
end $$;

create or replace function private.command_aviso_cancelar(p_organization_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.aviso_puede_manejar(p_organization_id, p_id) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.announcements a where a.id = p_id and a.starts_at > now()) then
    raise exception 'Ese aviso ya salió: no se puede cancelar'; end if;
  update app.announcements set archived_at = now(), push_pending = false where id in (select private.aviso_hermanos(p_id));
end $$;
