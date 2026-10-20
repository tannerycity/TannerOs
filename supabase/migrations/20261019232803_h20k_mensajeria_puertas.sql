/* ---------- Puertas públicas (sólo usuarios con sesión) ---------- */
create or replace function public.v2_chat_edit(organization_id uuid, message_id uuid, body text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_edit(organization_id, message_id, body) $$;
create or replace function public.v2_chat_delete(organization_id uuid, message_id uuid)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_delete(organization_id, message_id) $$;
create or replace function public.v2_chat_pin(organization_id uuid, thread_id uuid, message_id uuid)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_pin(organization_id, thread_id, message_id) $$;
create or replace function public.v2_chat_mute(organization_id uuid, thread_id uuid, until timestamptz)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_mute(organization_id, thread_id, until) $$;
create or replace function public.v2_chat_search(organization_id uuid, thread_id uuid, q text)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_chat_search(organization_id, thread_id, q) $$;
create or replace function public.v2_chat_quick_replies(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_chat_quick_replies(organization_id) $$;
create or replace function public.v2_chat_quick_reply_save(organization_id uuid, id uuid, shortcut text, body text)
returns uuid language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_quick_reply_save(organization_id, id, shortcut, body) $$;
create or replace function public.v2_aviso_enterado(organization_id uuid, aviso_id uuid)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_aviso_enterado(organization_id, aviso_id) $$;
create or replace function public.v2_aviso_detalle(organization_id uuid, aviso_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_aviso_detalle(organization_id, aviso_id) $$;
create or replace function public.v2_aviso_fijar(organization_id uuid, aviso_id uuid, fijo boolean)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_aviso_fijar(organization_id, aviso_id, fijo) $$;
create or replace function public.v2_aviso_cancelar(organization_id uuid, aviso_id uuid)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_aviso_cancelar(organization_id, aviso_id) $$;

revoke all on function public.v2_chat_edit(uuid, uuid, text) from public, anon;
revoke all on function public.v2_chat_delete(uuid, uuid) from public, anon;
revoke all on function public.v2_chat_pin(uuid, uuid, uuid) from public, anon;
revoke all on function public.v2_chat_mute(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.v2_chat_search(uuid, uuid, text) from public, anon;
revoke all on function public.v2_chat_quick_replies(uuid) from public, anon;
revoke all on function public.v2_chat_quick_reply_save(uuid, uuid, text, text) from public, anon;
revoke all on function public.v2_aviso_enterado(uuid, uuid) from public, anon;
revoke all on function public.v2_aviso_detalle(uuid, uuid) from public, anon;
revoke all on function public.v2_aviso_fijar(uuid, uuid, boolean) from public, anon;
revoke all on function public.v2_aviso_cancelar(uuid, uuid) from public, anon;
grant execute on function public.v2_chat_edit(uuid, uuid, text),
  public.v2_chat_delete(uuid, uuid), public.v2_chat_pin(uuid, uuid, uuid), public.v2_chat_mute(uuid, uuid, timestamptz),
  public.v2_chat_search(uuid, uuid, text), public.v2_chat_quick_replies(uuid), public.v2_chat_quick_reply_save(uuid, uuid, text, text),
  public.v2_aviso_enterado(uuid, uuid), public.v2_aviso_detalle(uuid, uuid),
  public.v2_aviso_fijar(uuid, uuid, boolean), public.v2_aviso_cancelar(uuid, uuid) to authenticated;
revoke all on function private.command_chat_edit(uuid, uuid, text),
  private.command_chat_delete(uuid, uuid), private.command_chat_pin(uuid, uuid, uuid), private.command_chat_mute(uuid, uuid, timestamptz),
  private.query_chat_search(uuid, uuid, text), private.query_chat_quick_replies(uuid), private.command_chat_quick_reply_save(uuid, uuid, text, text),
  private.command_aviso_enterado(uuid, uuid), private.query_aviso_detalle(uuid, uuid),
  private.command_aviso_fijar(uuid, uuid, boolean), private.command_aviso_cancelar(uuid, uuid), private.avisos_programados_push(),
  private.aviso_hermanos(uuid), private.aviso_puede_manejar(uuid, uuid), private.chat_msg_json(app.chat_messages, uuid)
  from public, anon, authenticated;
