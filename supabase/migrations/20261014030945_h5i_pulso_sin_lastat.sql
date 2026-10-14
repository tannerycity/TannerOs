-- h5i_pulso_sin_lastat (aplicada 14/10/2026 con aprobación de Presidencia)
-- Hallazgo F de la auditoría de v2_chat_pulse (13/10/2026).
-- 'lastAt' era max(created_at) de TODOS los mensajes del club, incluidos chats
-- privados en los que el usuario no participa: dejaba ver CUÁNDO escribió
-- alguien. Ningún consumidor lo usa (cliente, SQL, Edge Functions, pruebas),
-- así que se quita. Los contadores (chats, avisos, total) no cambian.
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
  return jsonb_build_object('chats', v_chats, 'avisos', v_avisos, 'total', v_chats + v_avisos);
end $$;
