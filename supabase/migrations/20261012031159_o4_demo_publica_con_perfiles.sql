-- Demo pública con perfiles (Presidencia, 12/10/2026).
--
-- "Un botón que diga: entra, para que veas los distintos perfiles. Una demo
-- sin datos y otra con datos."
--
--   · Dos clubes demo fijos: "en marcha" (con jugadores, pagos y partidos de
--     ejemplo) y "nuevo" (recién dado de alta, vacío).
--   · /demo/ entra con un toque como Presidencia, Dirección deportiva,
--     Formador, Taquilla, Contabilidad o Familia, sin contraseña: la función
--     demo-login (edge) prepara la cuenta de ese perfil y abre la sesión.
--   · Son de solo lectura (club_write_hold = 'demo'): se ve todo y no se
--     guarda nada, así la demo amanece igual para el siguiente.
--
-- El candado de solo lectura se extiende a lo que vive fuera de app.*: el club
-- mismo, sus miembros y sus permisos. Sin esto, una Presidencia de demo (o de
-- un club que debe) podía cambiar roles o dar de baja a su equipo.

create or replace function private.guard_club_read_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := (select auth.uid()); v_hold text; v_fila jsonb;
begin
  if v_uid is null then return coalesce(new, old); end if;
  v_fila := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_org := nullif(case when tg_table_schema = 'public' and tg_table_name = 'organizations' then v_fila->>'id' else v_fila->>'organization_id' end, '')::uuid;
  v_hold := private.club_write_hold(v_org);
  if v_hold is null then return coalesce(new, old); end if;
  if exists (select 1 from public.platform_admins where user_id = v_uid) then return coalesce(new, old); end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id = v_org and m.user_id = v_uid and m.active) then
    return coalesce(new, old);
  end if;
  if v_hold = 'demo' then raise exception 'Es una demo: puedes ver todo, pero los cambios no se guardan.'; end if;
  raise exception 'Tu club está en solo lectura por un pago pendiente de la mensualidad. Al registrarse el pago vuelve todo a la normalidad.';
end $$;
revoke all on function private.guard_club_read_only() from public, anon, authenticated;

create trigger zz_club_read_only before update or delete on public.organizations
  for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on public.organization_memberships
  for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on public.role_module_permissions
  for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on private.membership_module_overrides
  for each row execute function private.guard_club_read_only();

-- Los dos clubes demo. Se crean como los crearía el administrador de la
-- plataforma (provision_club exige serlo), con un dueño de mentira.
do $$
declare v_admin uuid := (select user_id from public.platform_admins order by created_at limit 1); v_res jsonb;
begin
  if v_admin is null then raise exception 'Falta un administrador de plataforma'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.organizations where settings->>'demoPublic' = 'datos') then
    v_res := private.create_demo_club('demo.dueno@example.com');
    update public.organizations set settings = settings || '{"demoPublic":"datos"}'::jsonb where id = (v_res->>'organizationId')::uuid;
  end if;
  if not exists (select 1 from public.organizations where settings->>'demoPublic' = 'vacio') then
    v_res := private.provision_club(jsonb_build_object(
      'name', 'Club Nuevo (demo)', 'slug', 'demo-club-nuevo', 'city', 'León, Gto.', 'planCode', 'seleccion', 'founder', false,
      'colors', jsonb_build_object('primary', '#23395B', 'secondary', '#3B8E7A', 'accent', '#E0B23A'),
      'categories', jsonb_build_array(jsonb_build_object('name', 'Sub-8', 'monthlyFee', 600), jsonb_build_object('name', 'Sub-10', 'monthlyFee', 650),
                                      jsonb_build_object('name', 'Sub-12', 'monthlyFee', 700)),
      'chargeDay', 1, 'dueDay', 5, 'lateFee', 100,
      'owner', jsonb_build_object('name', 'Demo', 'email', 'demo.dueno.nuevo@example.com')));
    update public.organizations set settings = settings || '{"demo":true,"demoPublic":"vacio"}'::jsonb where id = (v_res->>'organizationId')::uuid;
  end if;
end $$;

-- Prepara la cuenta de un perfil de demo. Sólo la llama demo-login con la
-- llave de servicio (nadie con sesión la alcanza).
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
  return jsonb_build_object('organizationId', v_org.id, 'slug', v_org.slug, 'landing', '/inicio/');
end $$;
revoke all on function private.prepare_demo_user(uuid, text, text) from public, anon, authenticated;

create or replace function public.v2_prepare_demo_user(user_id uuid, perfil text, variante text)
returns jsonb language sql security definer set search_path = '' as $$ select private.prepare_demo_user(user_id, perfil, variante) $$;
revoke all on function public.v2_prepare_demo_user(uuid, text, text) from public, anon, authenticated;
grant execute on function public.v2_prepare_demo_user(uuid, text, text) to service_role;
