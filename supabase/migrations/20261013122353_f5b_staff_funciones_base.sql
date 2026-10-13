-- f5b: Staff, las tres funciones base que se crearon a mano el 12/10 (el
-- archivo de la migración se colgaba). Mismas definiciones, ahora registradas:
--   · staff_board: el organigrama y la lista (quien contrata ve teléfono,
--     correo y la carta; los demás, nombre, puesto y foto).
--   · set_staff_photo: liga la foto subida a la ficha.
--   · portal_staff: lo que ve la familia (formadores de la categoría de su
--     hijo y Dirección deportiva, si su ficha lo permite).
create or replace function private.portal_staff()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return coalesce((select jsonb_agg(x order by x->>'orden', x->>'fullName') from (
    select distinct on (s.id) jsonb_build_object('id', s.id, 'fullName', s.full_name, 'title', s.title, 'level', s.level,
      'photoThumbPath', s.photo_thumb_path, 'orden', case s.level when 'formador' then '1' else '2' end,
      'categories', coalesce((select jsonb_agg(c.name) from app.staff_member_categories sc join app.categories c on c.id = sc.category_id where sc.staff_id = s.id), '[]'::jsonb)) x
    from app.staff_members s
    where s.organization_id = g.organization_id and s.active and s.show_to_families
      and (s.level = 'direccion' or exists (
        select 1 from app.staff_member_categories sc join app.categories c on c.id = sc.category_id
        join app.player_guardians pg on pg.guardian_id = g.id join app.players pl on pl.id = pg.player_id
        where sc.staff_id = s.id and pl.organization_id = g.organization_id and lower(btrim(pl.category)) = lower(btrim(c.name))))
  ) t), '[]'::jsonb);
end $$;

create or replace function private.set_staff_photo(p_organization_id uuid, p_id uuid, p_path text, p_thumb text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_base text := '^organizations/' || p_organization_id || '/staff/' || p_id || '/foto-[0-9]{10,16}';
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  if p_path !~* (v_base || '\.(jpg|jpeg|png|webp)$') or (p_thumb is not null and p_thumb !~* (v_base || '-thumb\.(jpg|jpeg|png|webp)$')) then raise exception 'Invalid photo path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = p_path) then raise exception 'Photo upload not found'; end if;
  update app.staff_members set photo_path = p_path, photo_thumb_path = p_thumb, updated_at = now() where id = p_id and organization_id = p_organization_id;
  if not found then raise exception 'Ficha no encontrada'; end if;
  return jsonb_build_object('id', p_id);
end $$;

create or replace function private.staff_board(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
      order by array_position(array['presidencia','direccion','coordinacion','formador','operacion'], s.level), s.full_name)
      from app.staff_members s where s.organization_id = p_organization_id and (s.active or v_edita)), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order nulls last, c.name)
      from app.categories c where c.organization_id = p_organization_id and c.status = 'active'), '[]'::jsonb),
    'withoutCard', case when v_edita then coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role,
        'name', coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))) order by m.role)
      from public.organization_memberships m join auth.users u on u.id = m.user_id
      where m.organization_id = p_organization_id and m.active and m.role <> 'Tanner'
        and not exists (select 1 from app.staff_members s where s.organization_id = p_organization_id and s.user_id = m.user_id)), '[]'::jsonb) else '[]'::jsonb end);
end $$;

revoke all on function private.staff_board(uuid), private.set_staff_photo(uuid, uuid, text, text),
  private.portal_staff() from public, anon, authenticated;
