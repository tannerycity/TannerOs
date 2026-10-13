-- b5: aplicada a mano por Presidencia en el SQL Editor de Supabase el 13/10/2026
-- (la herramienta de migraciones no podía confirmar los DELETE de las funciones).
-- TannerOS · pegar en Supabase > SQL Editor > New query > Run
-- Proyecto pacnegivzgxpanphrnwp (Tannery City). Crea funciones; NO borra datos al correrlo.
begin;

-- b5: Eliminar una postulación (Candidatos).
--
-- Pedido de Presidencia (13/10/2026): "¿cómo los puedo eliminar?". Descartado
-- la deja en el historial; Eliminar la borra con su CV y su foto, para pruebas,
-- duplicados o cuando el candidato pide que se borren sus datos (ARCO).
-- Quien puede contratar con escritura la borra; un contratado no, porque ya es
-- parte del staff.
--
-- La función borra el renglón y regresa las rutas de los archivos; la página
-- los quita del bucket con la política de abajo (Supabase no deja borrar
-- storage.objects desde SQL).

create or replace function private.delete_staff_application(p_organization_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v app.staff_applications%rowtype;
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  select * into v from app.staff_applications where id = p_id and organization_id = p_organization_id;
  if not found then raise exception 'Postulación no encontrada'; end if;
  if v.status = 'contratado' then raise exception 'Ya es parte del staff: no se elimina desde Candidatos'; end if;
  delete from app.staff_applications where id = p_id;
  return jsonb_build_object('id', p_id,
    'paths', to_jsonb(array_remove(array[v.cv_path, v.photo_path, v.photo_thumb_path], null)));
end $$;
revoke all on function private.delete_staff_application(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_delete_staff_application(organization_id uuid, application_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.delete_staff_application(organization_id, application_id) $$;
revoke all on function public.v2_delete_staff_application(uuid, uuid) from public, anon;
grant execute on function public.v2_delete_staff_application(uuid, uuid) to authenticated;

create or replace function private.staff_file_in_use(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.staff_applications a where p_name in (a.cv_path, a.photo_path, a.photo_thumb_path))
$$;
revoke all on function private.staff_file_in_use(text) from public, anon;
grant execute on function private.staff_file_in_use(text) to authenticated;

-- Los archivos de una postulación que ya no existe: sólo quien contrata, y
-- sólo si ningún renglón vivo los usa.
create policy tanneros_staff_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tanneros-private' and split_part(name, '/', 3) = 'staff' and private.storage_org_id(name) is not null
         and private.can_hire_staff(private.storage_org_id(name), true)
         and not private.staff_file_in_use(name));

create or replace function private.save_staff_member(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_jefe uuid := nullif(p->>'reportsTo', '')::uuid; v_user uuid; v_paso uuid; v_n int := 0; v_cats uuid[];
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  if v_id is not null and not exists (select 1 from app.staff_members where id = v_id and organization_id = p_organization_id) then raise exception 'Ficha no encontrada'; end if;
  if v_jefe is not null and not exists (select 1 from app.staff_members where id = v_jefe and organization_id = p_organization_id) then raise exception 'A quién reporta no es de este club'; end if;
  v_user := nullif(p->>'userId', '')::uuid;
  if v_user is not null and not exists (select 1 from public.organization_memberships where organization_id = p_organization_id and user_id = v_user and active) then raise exception 'Esa cuenta no es de este club'; end if;
  if v_id is null then
    insert into app.staff_members(organization_id, user_id, full_name, title, level, reports_to, phone, email, show_to_families, joined_at)
    values (p_organization_id, v_user, btrim(p->>'fullName'), btrim(coalesce(nullif(p->>'title', ''), 'Staff')), coalesce(nullif(p->>'level', ''), 'formador'), v_jefe,
            nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), ''), nullif(lower(btrim(p->>'email')), ''),
            coalesce((p->>'showToFamilies')::boolean, true), coalesce(nullif(p->>'joinedAt', '')::date, current_date))
    returning id into v_id;
  else
    -- Sin ciclos: subir desde el jefe nuevo no puede llegar a esta ficha.
    v_paso := v_jefe;
    while v_paso is not null and v_n < 50 loop
      if v_paso = v_id then raise exception 'No puede reportar a alguien que le reporta'; end if;
      select reports_to into v_paso from app.staff_members where id = v_paso; v_n := v_n + 1;
    end loop;
    update app.staff_members set
      full_name = coalesce(nullif(btrim(p->>'fullName'), ''), full_name), title = coalesce(nullif(btrim(p->>'title'), ''), title),
      level = coalesce(nullif(p->>'level', ''), level), reports_to = case when jsonb_exists(p, 'reportsTo') then v_jefe else reports_to end,
      phone = case when jsonb_exists(p, 'phone') then nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), '') else phone end,
      email = case when jsonb_exists(p, 'email') then nullif(lower(btrim(p->>'email')), '') else email end,
      show_to_families = coalesce((p->>'showToFamilies')::boolean, show_to_families),
      background_check = coalesce(nullif(p->>'backgroundCheck', ''), background_check),
      background_valid_until = case when jsonb_exists(p, 'backgroundValidUntil') then nullif(p->>'backgroundValidUntil', '')::date else background_valid_until end,
      active = coalesce((p->>'active')::boolean, active), updated_at = now()
    where id = v_id;
  end if;
  if jsonb_exists(p, 'categoryIds') then
    select coalesce(array_agg(x::uuid), '{}') into v_cats from jsonb_array_elements_text(p->'categoryIds') x;
    if exists (select 1 from unnest(v_cats) c where not exists (select 1 from app.categories k where k.id = c and k.organization_id = p_organization_id)) then raise exception 'Categoría inválida'; end if;
    select user_id into v_user from app.staff_members where id = v_id;
    -- Formación usa category_staff_assignments: se quita lo que ya no lleva y se agrega lo nuevo.
    if v_user is not null then
      delete from app.category_staff_assignments a where a.organization_id = p_organization_id and a.user_id = v_user
        and a.category_id in (select category_id from app.staff_member_categories where staff_id = v_id) and not (a.category_id = any(v_cats));
      insert into app.category_staff_assignments(organization_id, category_id, user_id, assigned_by)
      select p_organization_id, c, v_user, (select auth.uid()) from unnest(v_cats) c on conflict (category_id, user_id) do nothing;
    end if;
    delete from app.staff_member_categories where staff_id = v_id and not (category_id = any(v_cats));
    insert into app.staff_member_categories(staff_id, category_id, organization_id) select v_id, c, p_organization_id from unnest(v_cats) c on conflict do nothing;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

revoke all on function private.save_staff_member(uuid, jsonb) from public, anon, authenticated;

commit;
