/* ---------- Archivos del chat ----------
   Ruta: organizations/<org>/chat/<hilo>/<archivo>. Sube quien está en el
   chat; lo ve quien está en el chat mientras el mensaje siga vivo (o quien lo
   subió, para que Storage confirme la subida). Borrar el mensaje lo apaga. */
create or replace function private.chat_storage_thread(p_name text)
returns uuid language plpgsql immutable set search_path to 'pg_catalog'
as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if coalesce(array_length(parts, 1), 0) <> 5 or parts[1] <> 'organizations' or parts[3] <> 'chat' then return null; end if;
  begin return parts[4]::uuid; exception when others then return null; end;
end $$;

create or replace function private.chat_storage_can_upload(p_name text)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$
  select private.chat_storage_thread(p_name) is not null and private.storage_org_id(p_name) is not null
    and p_name ~* '^organizations/[0-9a-f-]{36}/chat/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|heic|pdf|doc|docx|xls|xlsx|csv|txt|mp4|mov)$'
    and private.chat_can_access(private.storage_org_id(p_name), private.chat_storage_thread(p_name))
$$;

create or replace function private.chat_storage_can_read(p_name text, p_owner uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
  select private.chat_storage_thread(p_name) is not null and private.storage_org_id(p_name) is not null
    and private.chat_can_access(private.storage_org_id(p_name), private.chat_storage_thread(p_name))
    and (p_owner = (select auth.uid())
         or exists (select 1 from app.chat_messages m where m.thread_id = private.chat_storage_thread(p_name)
                      and m.deleted_at is null and m.attachment->>'path' = p_name))
$$;
