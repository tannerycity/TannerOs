-- e5: Utilería, "¿A quién?" con todos los profes y alta rápida.
--
-- Pedido de Presidencia (13/10/2026): "¿cómo puedo agregar directamente ahí a
-- un profesor, en corto?". La lista sólo traía cuentas con rol Formadores o
-- Academia, y "Otra persona" no guardaba nada. Ahora:
--   · equipment_people: cuentas de Formadores/Academia, fichas de Staff (con o
--     sin cuenta) y los nombres que ya se usaron en "Otra persona".
--   · quick_add_staff: crea la ficha de Staff con nombre, WhatsApp y puesto.
--     Sólo Presidencia y Operaciones (decisión de Presidencia). Es la misma
--     ficha del organigrama: lo que Zul da de alta aquí ya no se recaptura.
create or replace function private.can_quick_add_staff(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = (select auth.uid()) and m.active
      and (m.is_owner or m.role in ('Presidencia', 'Operaciones')))
$$;

create or replace function private.equipment_people(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if not private.has_module_access(p_organization_id, 'equipment', true) then raise exception 'Not authorized'; end if;
  with cuentas as (
    select m.user_id, coalesce(nullif(btrim(pr.display_name), ''), 'Sin nombre') as nombre
    from public.organization_memberships m left join public.profiles pr on pr.user_id = m.user_id
    where m.organization_id = p_organization_id and m.active and m.role in ('Formadores', 'Academia')
  ), fichas as (
    select s.id, s.user_id, s.full_name as nombre, s.title from app.staff_members s
    where s.organization_id = p_organization_id and s.active
  ), gente as (
    select 'cuenta' as tipo, c.user_id::text as user_id, null::text as staff_id, c.nombre, null::text as puesto from cuentas c
    where not exists (select 1 from fichas f where f.user_id = c.user_id)
    union all
    select 'ficha', f.user_id::text, f.id::text, f.nombre, f.title from fichas f
    union all
    select distinct on (lower(btrim(a.assigned_to_label))) 'otro', null, null, btrim(a.assigned_to_label), null
    from app.equipment_assignments a
    where a.organization_id = p_organization_id and a.assigned_to_user_id is null
      and nullif(btrim(a.assigned_to_label), '') is not null and a.assigned_at > now() - interval '120 days'
      and not exists (select 1 from fichas f where lower(btrim(f.nombre)) = lower(btrim(a.assigned_to_label)))
  )
  select coalesce(jsonb_agg(jsonb_build_object('tipo', g.tipo, 'userId', g.user_id, 'staffId', g.staff_id, 'name', g.nombre, 'title', g.puesto)
    order by g.tipo = 'otro', g.nombre), '[]'::jsonb) into v_out from gente g;
  return jsonb_build_object('people', v_out, 'canAddStaff', private.can_quick_add_staff(p_organization_id));
end $$;

create or replace function private.quick_add_staff(p_organization_id uuid, p_name text, p_phone text, p_level text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
  v_level text := case when p_level in ('coordinacion', 'operacion', 'direccion') then p_level else 'formador' end;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if not private.can_quick_add_staff(p_organization_id) then raise exception 'Sólo Presidencia y Operaciones dan de alta profes'; end if;
  if length(v_name) < 2 then raise exception 'Escribe el nombre'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Ese WhatsApp no se ve completo'; end if;
  select id into v_id from app.staff_members where organization_id = p_organization_id and active and lower(btrim(full_name)) = lower(v_name) limit 1;
  if v_id is not null then return jsonb_build_object('staffId', v_id, 'name', v_name, 'existing', true); end if;
  insert into app.staff_members(organization_id, full_name, title, level, phone)
  values (p_organization_id, left(v_name, 120),
          case v_level when 'coordinacion' then 'Coordinación' when 'operacion' then 'Operación' when 'direccion' then 'Dirección deportiva' else 'Formador' end,
          v_level, v_phone)
  returning id into v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffMemberQuickAdded', 'staff_member', v_id, jsonb_build_object('name', v_name, 'level', v_level, 'from', 'utileria'), (select auth.uid()));
  return jsonb_build_object('staffId', v_id, 'name', v_name);
end $$;

revoke all on function private.can_quick_add_staff(uuid), private.equipment_people(uuid), private.quick_add_staff(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.v2_equipment_people(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.equipment_people(organization_id) $$;
create or replace function public.v2_quick_add_staff(organization_id uuid, full_name text, phone text default null, level text default 'formador')
returns jsonb language sql security definer set search_path = '' as $$ select private.quick_add_staff(organization_id, full_name, phone, level) $$;
revoke all on function public.v2_equipment_people(uuid), public.v2_quick_add_staff(uuid, text, text, text) from public, anon;
grant execute on function public.v2_equipment_people(uuid), public.v2_quick_add_staff(uuid, text, text, text) to authenticated;
