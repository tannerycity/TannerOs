-- h91 · Staff por áreas (12/11/2026)
--
-- Presidencia: "no están bien separados los roles en esa pantalla... en
-- contabilidad, marketing, scouting y todo eso tiene que tener su apartado, no
-- tienen que ir en formadores".
--
-- La ficha de Staff sólo aceptaba cinco niveles (presidencia, direccion,
-- coordinacion, formador, operacion), así que quien recibía una llave de
-- Contabilidad, Taquilla o Scouting quedaba en "Formadores" y hasta se le pedía
-- carta de no antecedentes penales.
--
-- 1. La ficha acepta cinco áreas más: academia, scouting, marketing,
--    contabilidad y taquilla.
-- 2. Se acomoda a quien ya tiene llave: su área sale del rol de su llave. Sólo
--    se mueven fichas que estaban en formador, coordinacion u operacion; nadie
--    de Presidencia ni de Dirección deportiva cambia.
-- 3. El organigrama se ordena con las diez áreas.
--
-- No cambia permisos: lo que cada quien puede hacer sigue saliendo de su llave.
begin;

alter table app.staff_members drop constraint if exists staff_members_level_check;
alter table app.staff_members add constraint staff_members_level_check
  check (level in ('presidencia','direccion','coordinacion','formador','academia','scouting','marketing','contabilidad','taquilla','operacion'));

update app.staff_members s
   set level = case m.role when 'Contabilidad' then 'contabilidad' when 'Taquilla' then 'taquilla' when 'Scouting' then 'scouting'
                           when 'Marketing' then 'marketing' when 'Academia' then 'academia' when 'Operaciones' then 'operacion' end,
       updated_at = now()
  from public.organization_memberships m
 where m.organization_id = s.organization_id and m.user_id = s.user_id
   and m.role in ('Contabilidad','Taquilla','Scouting','Marketing','Academia','Operaciones')
   and s.level in ('formador','coordinacion','operacion')
   and s.level is distinct from case m.role when 'Contabilidad' then 'contabilidad' when 'Taquilla' then 'taquilla' when 'Scouting' then 'scouting'
                                            when 'Marketing' then 'marketing' when 'Academia' then 'academia' when 'Operaciones' then 'operacion' end;

create or replace function private.staff_board(p_organization_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_edita boolean;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_edita := private.can_hire_staff(p_organization_id, true);
  return jsonb_build_object(
    'canEdit', v_edita,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'fullName', s.full_name, 'title', s.title, 'level', s.level, 'reportsTo', s.reports_to,
        'photoPath', s.photo_path, 'photoThumbPath', s.photo_thumb_path, 'showToFamilies', s.show_to_families,
        'joinedAt', s.joined_at, 'active', s.active, 'hasAccount', s.user_id is not null,
        'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order nulls last, c.name)
                                from app.staff_member_categories sc join app.categories c on c.id = sc.category_id where sc.staff_id = s.id), '[]'::jsonb))
      || case when v_edita then jsonb_build_object('phone', s.phone, 'email', s.email, 'backgroundCheck', s.background_check,
           'backgroundValidUntil', s.background_valid_until, 'applicationId', s.application_id) else '{}'::jsonb end
      order by array_position(array['presidencia','direccion','coordinacion','formador','academia','scouting','marketing','contabilidad','taquilla','operacion'], s.level), s.full_name)
      from app.staff_members s where s.organization_id = p_organization_id and (s.active or v_edita)), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order nulls last, c.name)
      from app.categories c where c.organization_id = p_organization_id and c.status = 'active'), '[]'::jsonb),
    'withoutCard', case when v_edita then coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role,
        'name', coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))) order by m.role)
      from public.organization_memberships m join auth.users u on u.id = m.user_id
      where m.organization_id = p_organization_id and m.active and m.role <> 'Tanner'
        and not exists (select 1 from app.staff_members s where s.organization_id = p_organization_id and s.user_id = m.user_id)), '[]'::jsonb) else '[]'::jsonb end);
end $function$;

commit;
