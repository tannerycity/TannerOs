-- Vestidor: mensajes internos estilo chat (fase 1)
--
-- LO QUE PIDIÓ EL CLUB (05/10/2026): mensajes "estilo WhatsApp, con rediseño
-- Apple, que nos ayuden a operar". Presidencia eligió: chats 1 a 1 Y por área,
-- sin familias en esta fase, y borrar los mensajes de la muestra.
--
-- MEDIDO ANTES: 31 avisos en total; 29 eran el mismo "Seguimiento de
-- patrocinio: Don Trapo", republicado CADA DÍA desde el 07/09 por el barrido
-- de recordatorios (filtraba "no publicado HOY" en vez de "no publicado para
-- ESTE vencimiento"). Más "Hola" y "Prueba" de la demo. 4 lecturas en total.
--
-- QUÉ HACE
--   1. Chats: app.chat_threads (direct = 1 a 1, area = un rol o '*' todo el
--      club), app.chat_members (quién y hasta dónde leyó), app.chat_messages.
--      Sin acceso directo a las tablas: todo pasa por funciones v2 con
--      candado, como el resto de TannerOS.
--      · Un chat de área lo ven quienes tienen ese rol y Presidencia.
--      · Al enviar se avisa por push (best-effort, la infraestructura de
--        notify_push ya existe) a quienes no son el remitente.
--   2. Avisos: los de siempre (app.announcements), ahora con "visto por N de
--      M" para quien los publica o es Presidencia.
--   3. Barrido de recordatorios: un aviso por vencimiento, no uno por día.
--      Si se reprograma la fecha, vuelve a avisar una vez.
--   4. El borrado de los 31 avisos de la muestra va aparte (k3), porque borrar
--      datos pide confirmación de Presidencia en el momento.
--
-- REVERSIBLE: drop de las tablas chat_* y funciones nuevas; el barrido regresa
-- con su definición anterior.

create table if not exists app.chat_threads(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  kind text not null check (kind in ('direct','area')),
  area_role text,
  direct_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind='area' and area_role is not null and direct_key is null)
      or (kind='direct' and direct_key is not null and area_role is null)),
  unique (organization_id, direct_key),
  unique (organization_id, area_role)
);
create table if not exists app.chat_members(
  thread_id uuid not null references app.chat_threads(id) on delete cascade,
  user_id uuid not null,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create table if not exists app.chat_messages(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null references app.chat_threads(id) on delete cascade,
  sender_user_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  client_key text,
  created_at timestamptz not null default now(),
  unique (sender_user_id, client_key)
);
create index if not exists chat_messages_thread_at on app.chat_messages(thread_id, created_at desc);
create index if not exists chat_members_user on app.chat_members(user_id);

alter table app.chat_threads enable row level security;
alter table app.chat_members enable row level security;
alter table app.chat_messages enable row level security;
revoke all on app.chat_threads, app.chat_members, app.chat_messages from public, anon, authenticated;

-- Nombre visible de una persona.
create or replace function private.chat_name(p_user uuid)
returns text language sql stable security definer set search_path to 'pg_catalog','public'
as $$ select coalesce(nullif(btrim(p.display_name),''),'Usuario sin nombre') from public.profiles p where p.user_id=p_user $$;

-- Mi rol activo.
create or replace function private.chat_my_role(p_organization_id uuid)
returns text language sql stable security definer set search_path to 'pg_catalog','public'
as $$ select m.role from public.organization_memberships m
      where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active limit 1 $$;

-- ¿Puedo ver este chat?
create or replace function private.chat_can_access(p_organization_id uuid, p_thread_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
declare t app.chat_threads;
begin
  select * into t from app.chat_threads where id=p_thread_id and organization_id=p_organization_id;
  if t.id is null then return false; end if;
  if t.kind='direct' then
    return exists(select 1 from app.chat_members cm where cm.thread_id=t.id and cm.user_id=(select auth.uid()));
  end if;
  return t.area_role='*' or t.area_role=private.chat_my_role(p_organization_id) or private.is_presidency(p_organization_id);
end $$;

-- Los chats de área existen siempre: uno por cada rol con gente activa y uno
-- de todo el club.
create or replace function private.chat_ensure_areas(p_organization_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','app','public'
as $$
  insert into app.chat_threads(organization_id, kind, area_role)
  select p_organization_id, 'area', r from (
    select '*' r union
    select distinct m.role from public.organization_memberships m
     where m.organization_id=p_organization_id and m.active and m.role is not null and m.role<>'Presidencia') x
  on conflict (organization_id, area_role) do nothing
$$;

create or replace function private.query_chat_inbox(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private'
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
               where m.organization_id=p_organization_id and m.active and m.user_id<>v_uid))
  into v_out
  from (
    select case when t.last_message_at is null and t.kind='area' then 1 else 0 end orden, t.last_message_at ultimo,
      jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'areaRole', t.area_role,
        'title', case when t.kind='area' then case when t.area_role='*' then 'Todo el club' else t.area_role end
                      else (select private.chat_name(o.user_id) from app.chat_members o where o.thread_id=t.id and o.user_id<>v_uid limit 1) end,
        'otherRole', case when t.kind='direct' then (select m.role from app.chat_members o join public.organization_memberships m
                      on m.user_id=o.user_id and m.organization_id=p_organization_id and m.active where o.thread_id=t.id and o.user_id<>v_uid limit 1) end,
        'last', (select jsonb_build_object('body', left(cm.body,140), 'senderName', private.chat_name(cm.sender_user_id),
                   'mine', cm.sender_user_id=v_uid, 'at', cm.created_at)
                 from app.chat_messages cm where cm.thread_id=t.id order by cm.created_at desc limit 1),
        'unread', (select count(*) from app.chat_messages cm where cm.thread_id=t.id and cm.sender_user_id<>v_uid
                   and cm.created_at > coalesce((select me.last_read_at from app.chat_members me where me.thread_id=t.id and me.user_id=v_uid),'-infinity'))
      ) j
    from app.chat_threads t
    where t.organization_id=p_organization_id
      and ((t.kind='direct' and exists(select 1 from app.chat_members cm where cm.thread_id=t.id and cm.user_id=v_uid))
        or (t.kind='area' and (t.area_role='*' or t.area_role=v_role or v_pres)))
  ) x;
  return v_out;
end $$;

create or replace function private.command_chat_open_direct(p_organization_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); v_key text; v_id uuid;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_user_id is null or p_user_id=v_uid then raise exception 'Elige a otra persona'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active)
    then raise exception 'Esa persona no está activa en el club'; end if;
  v_key := least(v_uid::text, p_user_id::text) || ':' || greatest(v_uid::text, p_user_id::text);
  insert into app.chat_threads(organization_id, kind, direct_key, created_by)
  values (p_organization_id, 'direct', v_key, v_uid)
  on conflict (organization_id, direct_key) do update set direct_key = excluded.direct_key
  returning id into v_id;
  insert into app.chat_members(thread_id, user_id) values (v_id, v_uid), (v_id, p_user_id)
  on conflict do nothing;
  return v_id;
end $$;

create or replace function private.query_chat_thread(p_organization_id uuid, p_thread_id uuid, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); t app.chat_threads; v_out jsonb;
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  select * into t from app.chat_threads where id=p_thread_id;
  select jsonb_build_object(
    'thread', jsonb_build_object('id', t.id, 'kind', t.kind, 'areaRole', t.area_role,
      'title', case when t.kind='area' then case when t.area_role='*' then 'Todo el club' else t.area_role end
                    else (select private.chat_name(o.user_id) from app.chat_members o where o.thread_id=t.id and o.user_id<>v_uid limit 1) end,
      -- Quién está en el chat: para las palomitas de leído y el "visto por".
      'members', (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', private.chat_name(m.user_id), 'role', m.role,
                     'lastReadAt', (select cm.last_read_at from app.chat_members cm where cm.thread_id=t.id and cm.user_id=m.user_id))
                   order by private.chat_name(m.user_id)), '[]'::jsonb)
                  from public.organization_memberships m
                  where m.organization_id=p_organization_id and m.active
                    and case when t.kind='direct' then exists(select 1 from app.chat_members cm where cm.thread_id=t.id and cm.user_id=m.user_id)
                             else (t.area_role='*' or m.role=t.area_role or m.role='Presidencia') end)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'senderId', z.sender_user_id,
                    'senderName', private.chat_name(z.sender_user_id), 'body', z.body, 'at', z.created_at,
                    'mine', z.sender_user_id=v_uid) order by z.created_at), '[]'::jsonb)
                 from (select * from app.chat_messages cm where cm.thread_id=t.id
                         and (p_before is null or cm.created_at < p_before)
                       order by cm.created_at desc limit 80) z))
  into v_out;
  return v_out;
end $$;

create or replace function private.command_chat_mark_read(p_organization_id uuid, p_thread_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  insert into app.chat_members(thread_id, user_id, last_read_at) values (p_thread_id, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end $$;

create or replace function private.command_chat_send(p_organization_id uuid, p_thread_id uuid, p_body text, p_client_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); t app.chat_threads; v_msg app.chat_messages; v_body text := btrim(coalesce(p_body,''));
  v_name text; r record;
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  if v_body = '' then raise exception 'Escribe el mensaje'; end if;
  if length(v_body) > 4000 then raise exception 'El mensaje es demasiado largo'; end if;
  -- Doble toque o red lenta: la misma llave regresa el mismo mensaje.
  select * into v_msg from app.chat_messages where sender_user_id=v_uid and client_key=nullif(btrim(coalesce(p_client_key,'')),'');
  if v_msg.id is null then
    insert into app.chat_messages(organization_id, thread_id, sender_user_id, body, client_key)
    values (p_organization_id, p_thread_id, v_uid, v_body, nullif(btrim(coalesce(p_client_key,'')),''))
    returning * into v_msg;
    update app.chat_threads set last_message_at = v_msg.created_at where id = p_thread_id;
    insert into app.chat_members(thread_id, user_id, last_read_at) values (p_thread_id, v_uid, v_msg.created_at)
    on conflict (thread_id, user_id) do update set last_read_at = greatest(app.chat_members.last_read_at, excluded.last_read_at);
    -- Aviso al celular de los demás (si activaron notificaciones). Nunca tumba el envío.
    select * into t from app.chat_threads where id = p_thread_id;
    v_name := private.chat_name(v_uid);
    for r in
      select m.user_id from public.organization_memberships m
      where m.organization_id=p_organization_id and m.active and m.user_id<>v_uid
        and case when t.kind='direct' then exists(select 1 from app.chat_members cm where cm.thread_id=t.id and cm.user_id=m.user_id)
                 else (t.area_role='*' or m.role=t.area_role or m.role='Presidencia') end
    loop
      perform private.notify_push(p_organization_id,
        case when t.kind='direct' then v_name else v_name || ' · ' || case when t.area_role='*' then 'Todo el club' else t.area_role end end,
        left(v_body, 160), 'user', r.user_id::text, '/mensajes/?chat=' || t.id::text);
    end loop;
  end if;
  return jsonb_build_object('id', v_msg.id, 'senderId', v_msg.sender_user_id, 'senderName', private.chat_name(v_msg.sender_user_id),
    'body', v_msg.body, 'at', v_msg.created_at, 'mine', true);
end $$;

-- Para el globito de la campana: cuántos chats y avisos sin leer.
create or replace function private.query_chat_pulse(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_chats int; v_last timestamptz; v_seen timestamptz; v_avisos int;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  select count(*), max(cm.created_at) into v_chats, v_last
  from app.chat_messages cm join app.chat_threads t on t.id=cm.thread_id
  where t.organization_id=p_organization_id and cm.sender_user_id<>v_uid
    and ((t.kind='direct' and exists(select 1 from app.chat_members x where x.thread_id=t.id and x.user_id=v_uid))
      or (t.kind='area' and (t.area_role='*' or t.area_role=v_role or v_pres)))
    and cm.created_at > coalesce((select me.last_read_at from app.chat_members me where me.thread_id=t.id and me.user_id=v_uid),'-infinity');
  select seen_at into v_seen from app.announcement_seen where organization_id=p_organization_id and user_id=v_uid;
  select count(*) into v_avisos from app.announcements a
  where a.organization_id=p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
    and (a.audience_type='club' or (a.audience_type='role' and a.audience_value=v_role) or (a.audience_type='user' and a.audience_value=v_uid::text))
    and (v_seen is null or a.published_at > v_seen);
  return jsonb_build_object('chats', v_chats, 'avisos', v_avisos, 'total', v_chats + v_avisos,
    'lastAt', (select max(cm.created_at) from app.chat_messages cm where cm.organization_id=p_organization_id));
end $$;

-- Avisos con "visto por N de M" para quien publica o es Presidencia.
create or replace function private.query_avisos(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_seen timestamptz; v_out jsonb;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  select seen_at into v_seen from app.announcement_seen where organization_id=p_organization_id and user_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'body', a.body, 'source', a.source,
      'audienceType', a.audience_type, 'audienceValue', a.audience_value,
      'publishedAt', a.published_at, 'author', case when a.published_by is null then 'TannerOS' else private.chat_name(a.published_by) end,
      'unread', (v_seen is null or a.published_at > v_seen),
      'reach', case when v_pres or a.published_by=v_uid then (
        select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= a.published_at))
        from public.organization_memberships m
        left join app.announcement_seen s on s.organization_id=m.organization_id and s.user_id=m.user_id
        where m.organization_id=p_organization_id and m.active
          and (a.audience_type='club' or (a.audience_type='role' and m.role=a.audience_value) or (a.audience_type='user' and m.user_id::text=a.audience_value))) end
    ) order by a.published_at desc), '[]'::jsonb)
  into v_out
  from app.announcements a
  where a.organization_id=p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
    and (v_pres or a.audience_type='club' or (a.audience_type='role' and a.audience_value=v_role) or (a.audience_type='user' and a.audience_value=v_uid::text));
  return jsonb_build_object('canPublish', private.has_any_module_access(p_organization_id, array['calendar','admin'], true), 'avisos', v_out);
end $$;

-- Barrido de recordatorios: un aviso por vencimiento, no uno por día.
create or replace function private.run_reminder_sweep()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_row record;
begin
  for v_row in
    select p.id, p.organization_id, p.first_name, p.last_name, p.assigned_user_id
    from app.prospects p
    where p.next_action_at is not null
      and p.next_action_at <= now()
      and p.status = 'new'
      and p.assigned_user_id is not null
      and p.archived_at is null
      and not exists (
        select 1 from app.announcements a
        where a.source='prospect_reminder' and a.source_id=p.id and a.published_at >= p.next_action_at
      )
  loop
    perform private.publish_system_announcement(
      v_row.organization_id,
      'Seguimiento pendiente: ' || trim(coalesce(v_row.first_name,'') || ' ' || coalesce(v_row.last_name,'')),
      'Tenías programado un siguiente paso con este prospecto.',
      'user', v_row.assigned_user_id::text, 'prospect_reminder', v_row.id
    );
  end loop;

  for v_row in
    select s.id, s.organization_id, s.name, s.next_action
    from app.sponsors s
    where s.next_action_at is not null
      and s.next_action_at <= now()
      and coalesce(s.stage,'') not in ('lost','finished')
      and s.archived_at is null
      and not exists (
        select 1 from app.announcements a
        where a.source='sponsor_reminder' and a.source_id=s.id and a.published_at >= s.next_action_at
      )
  loop
    perform private.publish_system_announcement(
      v_row.organization_id,
      'Seguimiento de patrocinio: ' || v_row.name,
      coalesce(v_row.next_action,'Tienes un siguiente paso programado con esta marca.'),
      'role', 'Marketing', 'sponsor_reminder', v_row.id
    );
  end loop;
end
$function$;

-- Wrappers v2
create or replace function public.v2_chat_inbox(organization_id uuid) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_chat_inbox(organization_id) $$;
create or replace function public.v2_chat_open_direct(organization_id uuid, user_id uuid) returns uuid language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_chat_open_direct(organization_id, user_id) $$;
create or replace function public.v2_chat_thread(organization_id uuid, thread_id uuid, before timestamptz default null) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_chat_thread(organization_id, thread_id, before) $$;
create or replace function public.v2_chat_mark_read(organization_id uuid, thread_id uuid) returns void language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_chat_mark_read(organization_id, thread_id) $$;
create or replace function public.v2_chat_send(organization_id uuid, thread_id uuid, body text, client_key text) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_chat_send(organization_id, thread_id, body, client_key) $$;
create or replace function public.v2_chat_pulse(organization_id uuid) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_chat_pulse(organization_id) $$;
create or replace function public.v2_avisos(organization_id uuid) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_avisos(organization_id) $$;

revoke all on function public.v2_chat_inbox(uuid), public.v2_chat_open_direct(uuid,uuid), public.v2_chat_thread(uuid,uuid,timestamptz),
  public.v2_chat_mark_read(uuid,uuid), public.v2_chat_send(uuid,uuid,text,text), public.v2_chat_pulse(uuid), public.v2_avisos(uuid) from public, anon;
grant execute on function public.v2_chat_inbox(uuid), public.v2_chat_open_direct(uuid,uuid), public.v2_chat_thread(uuid,uuid,timestamptz),
  public.v2_chat_mark_read(uuid,uuid), public.v2_chat_send(uuid,uuid,text,text), public.v2_chat_pulse(uuid), public.v2_avisos(uuid) to authenticated;
