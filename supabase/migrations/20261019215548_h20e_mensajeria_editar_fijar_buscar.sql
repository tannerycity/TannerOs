/* ---------- Editar (15 min) y borrar lo propio ---------- */
create or replace function private.command_chat_edit(p_organization_id uuid, p_message_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_uid uuid := auth.uid(); v_msg app.chat_messages; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_msg from app.chat_messages where id = p_message_id and organization_id = p_organization_id;
  if v_msg.id is null or not private.chat_can_access(p_organization_id, v_msg.thread_id) then raise exception 'Not authorized'; end if;
  if v_msg.sender_user_id <> v_uid then raise exception 'Sólo puedes editar tus mensajes'; end if;
  if v_msg.deleted_at is not null then raise exception 'Ese mensaje ya se borró'; end if;
  if v_msg.created_at < now() - interval '15 minutes' then raise exception 'Ya pasaron 15 minutos: no se puede editar'; end if;
  if v_body = '' and v_msg.attachment is null then raise exception 'Escribe el mensaje'; end if;
  if length(v_body) > 4000 then raise exception 'El mensaje es demasiado largo'; end if;
  if v_body = v_msg.body then return private.chat_msg_json(v_msg, v_uid); end if;
  update app.chat_messages set body = v_body, edited_at = now() where id = p_message_id returning * into v_msg;
  return private.chat_msg_json(v_msg, v_uid);
end $$;

create or replace function private.command_chat_delete(p_organization_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_uid uuid := auth.uid(); v_msg app.chat_messages;
begin
  select * into v_msg from app.chat_messages where id = p_message_id and organization_id = p_organization_id;
  if v_msg.id is null or not private.chat_can_access(p_organization_id, v_msg.thread_id) then raise exception 'Not authorized'; end if;
  if v_msg.sender_user_id <> v_uid then raise exception 'Sólo puedes borrar tus mensajes'; end if;
  -- Borrar es para todos: el texto, el archivo y las menciones se van.
  update app.chat_messages set body = '', attachment = null, mentions = '{}', deleted_at = coalesce(deleted_at, now()) where id = p_message_id;
  update app.chat_threads set pinned_message_id = null, pinned_by = null, pinned_at = null where pinned_message_id = p_message_id;
end $$;

/* ---------- Fijar y silenciar ---------- */
create or replace function private.command_chat_pin(p_organization_id uuid, p_thread_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  if p_message_id is not null and not exists (select 1 from app.chat_messages m where m.id = p_message_id and m.thread_id = p_thread_id and m.deleted_at is null) then
    raise exception 'Ese mensaje no es de este chat'; end if;
  update app.chat_threads set pinned_message_id = p_message_id,
    pinned_by = case when p_message_id is null then null else auth.uid() end,
    pinned_at = case when p_message_id is null then null else now() end
  where id = p_thread_id;
end $$;

create or replace function private.command_chat_mute(p_organization_id uuid, p_thread_id uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  insert into app.chat_members(thread_id, user_id, muted_until) values (p_thread_id, auth.uid(), p_until)
  on conflict (thread_id, user_id) do update set muted_until = excluded.muted_until;
end $$;

/* ---------- Buscar dentro de un chat ---------- */
create or replace function private.query_chat_search(p_organization_id uuid, p_thread_id uuid, p_q text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_q text := btrim(coalesce(p_q, ''));
begin
  if not private.chat_can_access(p_organization_id, p_thread_id) then raise exception 'Not authorized'; end if;
  if length(v_q) < 2 then return '[]'::jsonb; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return (select coalesce(jsonb_agg(private.chat_msg_json(z, auth.uid()) order by z.created_at desc), '[]'::jsonb)
          from (select * from app.chat_messages m where m.thread_id = p_thread_id and m.deleted_at is null
                  and (m.body ilike v_q or m.attachment->>'name' ilike v_q)
                order by m.created_at desc limit 40) z);
end $$;

/* ---------- Respuestas rápidas ---------- */
create or replace function private.query_chat_quick_replies(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'shortcut', q.shortcut, 'body', q.body) order by q.shortcut), '[]'::jsonb)
          from app.chat_quick_replies q where q.organization_id = p_organization_id and q.user_id = auth.uid());
end $$;

create or replace function private.command_chat_quick_reply_save(p_organization_id uuid, p_id uuid, p_shortcut text, p_body text)
returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_corto text := lower(btrim(coalesce(p_shortcut, ''), ' /'));
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_corto !~ '^[a-z0-9_-]{1,24}$' then raise exception 'El atajo va sin espacios ni acentos (ej. gracias, horario)'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'Escribe la respuesta (máximo 1000 letras)'; end if;
  if exists (select 1 from app.chat_quick_replies q where q.organization_id = p_organization_id and q.user_id = v_uid
               and q.shortcut = v_corto and q.id is distinct from p_id) then raise exception 'Ya tienes una respuesta con /%', v_corto; end if;
  if p_id is null then
    if (select count(*) from app.chat_quick_replies q where q.organization_id = p_organization_id and q.user_id = v_uid) >= 50 then
      raise exception 'Llegaste a 50 respuestas rápidas'; end if;
    insert into app.chat_quick_replies(organization_id, user_id, shortcut, body) values (p_organization_id, v_uid, v_corto, btrim(p_body)) returning id into v_id;
  else
    update app.chat_quick_replies set shortcut = v_corto, body = btrim(p_body)
    where id = p_id and organization_id = p_organization_id and user_id = v_uid returning id into v_id;
    if v_id is null then raise exception 'Not authorized'; end if;
  end if;
  return v_id;
end $$;
