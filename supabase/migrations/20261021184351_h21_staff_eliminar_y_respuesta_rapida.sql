-- Aplicada a mano en Supabase › SQL Editor por Presidencia (21/10/2026): el
-- conector no puede correr DELETE sin confirmación. Sólo crea funciones.
-- PEGAR EN SUPABASE > SQL Editor > Run (20/10/2026)
-- 1) Staff: eliminar a quien ya se dio de baja (h21)
-- 2) Mensajes: borrar una respuesta rápida propia (h20l)
-- Sólo crea funciones; no borra ningún dato al correrlo.

-- h21 · Staff: eliminar a quien ya se dio de baja (20/10/2026).
-- Pedido de Presidencia: "quiero poder eliminar a los que dimos de baja".
-- Decisión: se borra la ficha (y sus categorías) y, si tiene cuenta, se le
-- quita el acceso al club con la misma función de Usuarios (protege al dueño
-- y deja su evento). Sólo Presidencia, sólo a quien ya está de baja, nunca a
-- uno mismo ni a alguien de Presidencia (eso se hace desde Usuarios).
create or replace function private.command_delete_staff_member(p_organization_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare m app.staff_members; v_mem public.organization_memberships; v_code text; v_acceso boolean := false;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede eliminar a alguien del staff'; end if;
  select * into m from app.staff_members where id = p_member_id and organization_id = p_organization_id for update;
  if m.id is null then raise exception 'Ficha no encontrada'; end if;
  if m.active then raise exception 'Primero dale de baja; después se puede eliminar'; end if;
  if m.user_id is not null then
    if m.user_id = (select auth.uid()) then raise exception 'No puedes eliminar tu propia ficha'; end if;
    select * into v_mem from public.organization_memberships where organization_id = p_organization_id and user_id = m.user_id;
    if v_mem.id is not null and v_mem.active then
      if v_mem.is_owner then raise exception 'La cuenta del dueño del club no se puede quitar'; end if;
      if v_mem.role = 'Presidencia' then raise exception 'A alguien de Presidencia se le quita el acceso desde Usuarios'; end if;
      v_code := case v_mem.role when 'Operaciones' then 'operations' when 'Formadores' then 'coach' when 'Academia' then 'academy'
        when 'Taquilla' then 'cashier' when 'Contabilidad' then 'accounting' when 'Marketing' then 'commercial'
        when 'Scouting' then 'scouting' when 'Tanner' then 'player' end;
      if v_code is null then raise exception 'Ese rol se maneja desde Usuarios'; end if;
      perform private.command_update_membership_admin(p_organization_id, v_mem.id, v_code, false);
      v_acceso := true;
    end if;
    delete from app.category_staff_assignments where organization_id = p_organization_id and user_id = m.user_id;
    delete from app.academy_staff_assignments where organization_id = p_organization_id and user_id = m.user_id;
  end if;
  delete from app.staff_members where id = m.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffMemberDeleted', 'staff_member', m.id,
          jsonb_build_object('fullName', m.full_name, 'userId', m.user_id, 'accessRemoved', v_acceso), (select auth.uid()));
  -- La foto se borra desde la pantalla: Storage la suelta en cuanto la ficha ya no existe.
  return jsonb_build_object('accessRemoved', v_acceso, 'files', to_jsonb(array_remove(array[m.photo_path, m.photo_thumb_path], null)));
end $$;

create or replace function public.v2_delete_staff_member(organization_id uuid, member_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_delete_staff_member(organization_id, member_id) $$;
revoke all on function public.v2_delete_staff_member(uuid, uuid) from public, anon;
grant execute on function public.v2_delete_staff_member(uuid, uuid) to authenticated;
revoke all on function private.command_delete_staff_member(uuid, uuid) from public, anon, authenticated;

create or replace function private.command_chat_quick_reply_delete(p_organization_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  delete from app.chat_quick_replies where id = p_id and organization_id = p_organization_id and user_id = auth.uid();
end $$;
create or replace function public.v2_chat_quick_reply_delete(organization_id uuid, id uuid)
returns void language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_chat_quick_reply_delete(organization_id, id) $$;
revoke all on function public.v2_chat_quick_reply_delete(uuid, uuid) from public, anon;
grant execute on function public.v2_chat_quick_reply_delete(uuid, uuid) to authenticated;
revoke all on function private.command_chat_quick_reply_delete(uuid, uuid) from public, anon, authenticated;
