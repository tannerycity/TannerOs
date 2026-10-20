/* ---------- Un mensaje, como lo ve quien pregunta ---------- */
create or replace function private.chat_msg_json(m app.chat_messages, p_uid uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
  select jsonb_build_object('id', m.id, 'senderId', m.sender_user_id, 'senderName', private.chat_name(m.sender_user_id),
    'body', case when m.deleted_at is null then m.body else '' end, 'at', m.created_at, 'mine', m.sender_user_id = p_uid,
    'editedAt', m.edited_at, 'deleted', m.deleted_at is not null,
    'attachment', case when m.deleted_at is null then m.attachment end,
    'mentions', to_jsonb(m.mentions), 'mentionsMe', p_uid = any(m.mentions),
    'replyTo', (select jsonb_build_object('id', r.id, 'senderName', private.chat_name(r.sender_user_id),
                  'body', case when r.deleted_at is null then left(r.body, 160) else '' end, 'deleted', r.deleted_at is not null,
                  'attachment', case when r.deleted_at is null then r.attachment->>'name' end,
                  'kind', case when r.deleted_at is null then r.attachment->>'kind' end)
                from app.chat_messages r where r.id = m.reply_to))
$$;

-- Lo que se lee en la lista y en el push cuando el mensaje no trae texto.
create or replace function private.chat_preview(m app.chat_messages)
returns text language sql immutable set search_path to 'pg_catalog'
as $$
  select case when m.deleted_at is not null then 'Mensaje eliminado'
              when btrim(m.body) <> '' then m.body
              when m.attachment->>'kind' = 'image' then 'Foto'
              else 'Archivo: ' || coalesce(m.attachment->>'name', '') end
$$;

/* ---------- Enviar: con cita, archivo y menciones ---------- */
-- Nombre nuevo (no se tumba el viejo: las pantallas abiertas lo siguen usando
-- y el viejo pasa por aquí, con las mismas reglas de silencio y push).
create or replace function private.command_chat_enviar(p_organization_id uuid, p_thread_id uuid, p_body text, p_client_key text,
  p_reply_to uuid, p_attachment jsonb, p_mentions uuid[])
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_uid uuid := auth.uid(); t app.chat_threads; v_msg app.chat_messages; v_body text := btrim(coalesce(p_body, ''));
  v_name text; r record; v_key text := nullif(btrim(coalesce(p_client_key, '')), ''); v_att jsonb; v_path text;
  v_mentions uuid[] := '{}'; v_titulo text; v_donde text;
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  select * into t from app.chat_threads where id = p_thread_id;
  -- Doble toque o red lenta: la misma llave regresa el mismo mensaje.
  select * into v_msg from app.chat_messages where sender_user_id = v_uid and client_key = v_key;
  if v_msg.id is not null then return private.chat_msg_json(v_msg, v_uid); end if;

  if p_attachment is not null then
    v_path := p_attachment->>'path';
    if v_path is null or private.chat_storage_thread(v_path) is distinct from p_thread_id
       or private.storage_org_id(v_path) is distinct from p_organization_id then raise exception 'Archivo inválido'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = v_path) then
      raise exception 'El archivo no terminó de subir'; end if;
    v_att := jsonb_build_object('path', v_path, 'name', left(coalesce(nullif(btrim(p_attachment->>'name'), ''), 'archivo'), 120),
      'mime', left(coalesce(p_attachment->>'mime', ''), 100),
      'size', least(greatest(coalesce((p_attachment->>'size')::bigint, 0), 0), 15728640),
      'kind', case when coalesce(p_attachment->>'mime', '') like 'image/%' then 'image' else 'file' end,
      'w', nullif((p_attachment->>'w')::int, 0), 'h', nullif((p_attachment->>'h')::int, 0));
  end if;
  if v_body = '' and v_att is null then raise exception 'Escribe el mensaje'; end if;
  if length(v_body) > 4000 then raise exception 'El mensaje es demasiado largo'; end if;
  if p_reply_to is not null and not exists (select 1 from app.chat_messages x where x.id = p_reply_to and x.thread_id = p_thread_id) then
    raise exception 'Ese mensaje no es de este chat'; end if;
  -- Sólo se menciona a quien está en el chat de área.
  if t.kind = 'area' and p_mentions is not null then
    select coalesce(array_agg(distinct m.user_id), '{}') into v_mentions
    from public.organization_memberships m
    where m.organization_id = p_organization_id and m.active and m.user_id <> v_uid and m.user_id = any(p_mentions)
      and (t.area_role = '*' or m.role = t.area_role or m.role = 'Presidencia');
  end if;

  insert into app.chat_messages(organization_id, thread_id, sender_user_id, body, client_key, reply_to, attachment, mentions)
  values (p_organization_id, p_thread_id, v_uid, v_body, v_key, p_reply_to, v_att, v_mentions)
  returning * into v_msg;
  update app.chat_threads set last_message_at = v_msg.created_at where id = p_thread_id;
  insert into app.chat_members(thread_id, user_id, last_read_at) values (p_thread_id, v_uid, v_msg.created_at)
  on conflict (thread_id, user_id) do update set last_read_at = greatest(app.chat_members.last_read_at, excluded.last_read_at);

  -- Aviso al celular de los demás. Silenciado no suena, salvo que lo mencionen.
  v_name := private.chat_name(v_uid);
  v_donde := case when t.area_role = '*' then 'Todo el club' else t.area_role end;
  for r in
    select m.user_id, m.user_id = any(v_mentions) as mencionado from public.organization_memberships m
    where m.organization_id = p_organization_id and m.active and m.user_id <> v_uid
      and case when t.kind = 'direct' then exists (select 1 from app.chat_members cm where cm.thread_id = t.id and cm.user_id = m.user_id)
               else (t.area_role = '*' or m.role = t.area_role or m.role = 'Presidencia') end
  loop
    continue when not r.mencionado and exists (select 1 from app.chat_members cm where cm.thread_id = t.id and cm.user_id = r.user_id and cm.muted_until > now());
    v_titulo := case when t.kind = 'direct' then v_name when r.mencionado then v_name || ' te mencionó · ' || v_donde else v_name || ' · ' || v_donde end;
    perform private.notify_push(p_organization_id, v_titulo, left(private.chat_preview(v_msg), 160), 'user', r.user_id::text, '/mensajes/?chat=' || t.id::text);
  end loop;
  return private.chat_msg_json(v_msg, v_uid);
end $$;

create or replace function private.command_chat_send(p_organization_id uuid, p_thread_id uuid, p_body text, p_client_key text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_enviar(p_organization_id, p_thread_id, p_body, p_client_key, null, null, null) $$;
create or replace function public.v2_chat_enviar(organization_id uuid, thread_id uuid, body text, client_key text,
  reply_to uuid default null, attachment jsonb default null, mentions uuid[] default null)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_enviar(organization_id, thread_id, body, client_key, reply_to, attachment, mentions) $$;
revoke all on function public.v2_chat_enviar(uuid, uuid, text, text, uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.v2_chat_enviar(uuid, uuid, text, text, uuid, jsonb, uuid[]) to authenticated;
revoke all on function private.command_chat_enviar(uuid, uuid, text, text, uuid, jsonb, uuid[]) from public, anon, authenticated;
