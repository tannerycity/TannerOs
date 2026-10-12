-- Demo pública: el inicio del staff es /, no /inicio/ (esa ruta no existe).
create or replace function private.prepare_demo_user(p_user uuid, p_perfil text, p_variante text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations%rowtype;
  v_rol text := case p_perfil when 'presidencia' then 'Presidencia' when 'direccion' then 'Operaciones' when 'formador' then 'Formadores'
                              when 'taquilla' then 'Taquilla' when 'contabilidad' then 'Contabilidad' end;
  v_guardian uuid;
begin
  if p_variante not in ('datos', 'vacio') then raise exception 'Variante inválida'; end if;
  if v_rol is null and p_perfil <> 'familia' then raise exception 'Perfil inválido'; end if;
  select * into v_org from public.organizations where settings->>'demoPublic' = p_variante and coalesce((settings->>'demo')::boolean, false) limit 1;
  if v_org.id is null then raise exception 'No hay club demo'; end if;

  if p_perfil = 'familia' then
    select id into v_guardian from app.guardians where organization_id = v_org.id and user_id = p_user limit 1;
    if v_guardian is null then
      select g.id into v_guardian from app.guardians g where g.organization_id = v_org.id and g.user_id is null
       and exists (select 1 from app.player_guardians pg where pg.guardian_id = g.id) order by g.created_at limit 1;
      if v_guardian is null then raise exception 'Este club demo no tiene familias'; end if;
      update app.guardians set user_id = p_user, updated_at = now() where id = v_guardian;
    end if;
    return jsonb_build_object('organizationId', v_org.id, 'slug', v_org.slug, 'landing', '/familias/');
  end if;

  insert into public.organization_memberships(organization_id, user_id, role, active, is_owner)
  values (v_org.id, p_user, v_rol, true, p_perfil = 'presidencia')
  on conflict (organization_id, user_id) do update set role = excluded.role, active = true, is_owner = excluded.is_owner;
  if p_perfil = 'formador' then
    insert into app.category_staff_assignments(organization_id, category_id, user_id)
    select v_org.id, c.id, p_user from app.categories c where c.organization_id = v_org.id
    on conflict (category_id, user_id) do nothing;
  end if;
  return jsonb_build_object('organizationId', v_org.id, 'slug', v_org.slug, 'landing', '/');
end $$;
revoke all on function private.prepare_demo_user(uuid, text, text) from public, anon, authenticated;
