-- f5: Staff y organigrama, 3/3 (sin guardar ficha): quién ve las fotos del
-- staff, contratar crea la ficha y los permisos. Guardar la ficha
-- (save_staff_member) va aparte porque borra categorías y pide confirmación.
-- staff_board, set_staff_photo y portal_staff quedan en f5b.

-- Fotos del staff: el staff del club las ve; la familia, sólo las de quien le toca ver.
create or replace function private.can_read_staff_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.storage_org_id(p_name); g app.guardians;
begin
  if v_org is null or split_part(p_name, '/', 3) <> 'staff' or split_part(p_name, '/', 5) !~ '^foto' then return false; end if;
  if private.is_active_member(v_org) then
    return exists (select 1 from app.staff_members s where s.organization_id = v_org and (s.photo_path = p_name or s.photo_thumb_path = p_name));
  end if;
  select * into g from private.portal_guardian();
  if g.id is null or g.organization_id <> v_org then return false; end if;
  return exists (select 1 from jsonb_array_elements(private.portal_staff()) x join app.staff_members s on s.id = (x->>'id')::uuid where s.photo_thumb_path = p_name);
exception when others then return false;
end $$;
create policy tanneros_staff_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'tanneros-private' and private.can_read_staff_photo(name));
create policy tanneros_staff_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tanneros-private' and split_part(name, '/', 3) = 'staff' and private.storage_org_id(name) is not null
              and name ~* '^organizations/[0-9a-f-]{36}/staff/[0-9a-f-]{36}/foto-[0-9]{10,16}(-thumb)?\.(jpg|jpeg|png|webp)$'
              and private.can_hire_staff(private.storage_org_id(name), true));

-- Contratar en Candidatos crea su ficha en Staff, con su foto, reportando a
-- Dirección deportiva y con la carta pendiente.
create or replace function private.update_staff_application(p_organization_id uuid, p_id uuid, p_status text, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v app.staff_applications%rowtype; v_antes text; v_ficha uuid;
begin
  if not private.can_hire_staff(p_organization_id, true) then raise exception 'Not authorized'; end if;
  if p_status is not null and p_status not in ('nueva','revision','entrevista','prueba','contratado','descartado') then raise exception 'Estado inválido'; end if;
  select status into v_antes from app.staff_applications where id = p_id and organization_id = p_organization_id;
  update app.staff_applications set status = coalesce(p_status, status), notes = case when p_notes is null then notes else nullif(left(btrim(p_notes), 1000), '') end,
         reviewed_by = (select auth.uid()), updated_at = now()
   where id = p_id and organization_id = p_organization_id returning * into v;
  if v.id is null then raise exception 'Postulación no encontrada'; end if;
  if v.status = 'contratado' and v_antes is distinct from 'contratado' then
    insert into app.staff_members(organization_id, application_id, full_name, title, level, reports_to, phone, email, photo_path, photo_thumb_path)
    values (p_organization_id, v.id, v.full_name, left(coalesce(v.positions[1], 'Formador'), 80), 'formador',
            (select s.id from app.staff_members s where s.organization_id = p_organization_id and s.level = 'direccion' and s.active order by s.created_at limit 1),
            v.phone, v.email, v.photo_path, v.photo_thumb_path)
    on conflict (application_id) where application_id is not null do update set active = true, updated_at = now()
    returning id into v_ficha;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffApplicationUpdated', 'staff_application', p_id, jsonb_build_object('status', v.status, 'staffMemberId', v_ficha), (select auth.uid()));
  return jsonb_build_object('id', v.id, 'status', v.status, 'notes', v.notes, 'updatedAt', v.updated_at, 'staffMemberId', v_ficha);
end $$;

revoke all on function private.staff_board(uuid), private.set_staff_photo(uuid, uuid, text, text),
  private.portal_staff() from public, anon, authenticated;
revoke all on function private.can_read_staff_photo(text) from public, anon;
grant execute on function private.can_read_staff_photo(text) to authenticated;

create or replace function public.v2_staff_board(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.staff_board(organization_id) $$;
create or replace function public.v2_set_staff_photo(organization_id uuid, member_id uuid, photo_path text, photo_thumb_path text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.set_staff_photo(organization_id, member_id, photo_path, photo_thumb_path) $$;
create or replace function public.v2_portal_staff()
returns jsonb language sql stable security definer set search_path = '' as $$ select private.portal_staff() $$;
revoke all on function public.v2_staff_board(uuid), public.v2_set_staff_photo(uuid, uuid, text, text), public.v2_portal_staff() from public, anon;
grant execute on function public.v2_staff_board(uuid), public.v2_set_staff_photo(uuid, uuid, text, text), public.v2_portal_staff() to authenticated;
