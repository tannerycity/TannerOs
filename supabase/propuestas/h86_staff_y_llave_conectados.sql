-- h86 (11/11/2026, Presidencia): "no es lo mismo staff que entregar la llave".
-- Staff (app.staff_members) es la ficha y el organigrama que ven las familias;
-- la llave es la cuenta para entrar. Se unen por staff_members.user_id, pero
-- nada los conectaba al entregar una llave: Checo Martínez (ficha) y Sergio
-- Martínez (llave, mismo profe) quedaron como dos personas.
--
--   · v2_staff_without_account: las fichas de Staff activas que aún no tienen
--     llave, para elegirlas al "Entregar una llave".
--   · v2_link_staff_account: conecta una ficha con su llave (una por persona).
-- Lo puede hacer quien contrata staff (private.can_hire_staff, con escritura).

create or replace function private.query_staff_without_account(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_hire_staff(p_organization_id, false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'fullName', s.full_name, 'title', s.title, 'level', s.level,
                     'phone', s.phone, 'email', s.email) order by s.full_name)
                     from app.staff_members s
                    where s.organization_id = p_organization_id and s.active and s.user_id is null), '[]'::jsonb);
end $$;
revoke all on function private.query_staff_without_account(uuid) from public, anon, authenticated;

create or replace function private.command_link_staff_account(p_organization_id uuid, p_staff_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s app.staff_members%rowtype;
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  select * into v_s from app.staff_members where id = p_staff_id and organization_id = p_organization_id for update;
  if v_s.id is null then raise exception 'Esa ficha de Staff no existe'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id = p_organization_id and m.user_id = p_user_id) then
    raise exception 'Esa llave no es de este club';
  end if;
  if v_s.user_id is not null and v_s.user_id <> p_user_id then raise exception 'Esa ficha ya está conectada a otra llave'; end if;
  if exists (select 1 from app.staff_members s where s.organization_id = p_organization_id and s.user_id = p_user_id and s.id <> p_staff_id) then
    raise exception 'Esa llave ya está conectada a otra ficha de Staff';
  end if;
  update app.staff_members set user_id = p_user_id, updated_at = now() where id = p_staff_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffAccountLinked', 'staff_member', p_staff_id, jsonb_build_object('userId', p_user_id), (select auth.uid()));
  return jsonb_build_object('staffId', p_staff_id, 'userId', p_user_id);
end $$;
revoke all on function private.command_link_staff_account(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_staff_without_account(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_staff_without_account(organization_id) $$;
revoke all on function public.v2_staff_without_account(uuid) from public, anon;
grant execute on function public.v2_staff_without_account(uuid) to authenticated;

create or replace function public.v2_link_staff_account(organization_id uuid, staff_id uuid, user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_link_staff_account(organization_id, staff_id, user_id) $$;
revoke all on function public.v2_link_staff_account(uuid, uuid, uuid) from public, anon;
grant execute on function public.v2_link_staff_account(uuid, uuid, uuid) to authenticated;

-- Checo Martínez (ficha) = Sergio Martínez (llave del 11/11/2026), mismo profe.
do $$
declare v_s uuid := '4f8af6d0-8399-4c26-a97f-022ad7de7b4d'; v_u uuid := '8ed80bd5-1b4c-42f4-90d4-47f664a3980c'; v_org uuid;
begin
  update app.staff_members set user_id = v_u, updated_at = now()
   where id = v_s and user_id is null
     and not exists (select 1 from app.staff_members x where x.user_id = v_u)
  returning organization_id into v_org;
  if v_org is not null then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_org, 'StaffAccountLinked', 'staff_member', v_s, jsonb_build_object('userId', v_u, 'motivo', 'Checo = Sergio Martínez (Presidencia, 11/11/2026)'), null);
  end if;
end $$;
