-- Encuestas como permiso (15/10/2026): "quiero darle permiso a Zul de ver y
-- enviar encuestas". Encuestas pasa a ser módulo para poder darlo por persona
-- (Usuarios > persona > Encuestas) sin cambiar su rol. Presidencia lo tiene
-- siempre. Leer = ver resultados y compartir la liga; escribir = crear,
-- cerrar y volver a abrir encuestas.
insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('encuestas', 'Encuestas', 'management', 'Encuestas de experiencia: crear, compartir la liga y ver resultados.', false, true, 4)
on conflict (code) do nothing;

-- Disponible en los mismos planes que Dirección.
insert into public.plan_modules(plan_id, module_code, enabled)
select plan_id, 'encuestas', enabled from public.plan_modules where module_code = 'direccion'
on conflict do nothing;

-- Por rol, igual que Dirección (hoy: sólo Presidencia).
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select organization_id, role, 'encuestas', can_read, can_write from public.role_module_permissions where module_code = 'direccion'
on conflict do nothing;

create or replace function private.can_use_surveys(p_organization_id uuid, p_write boolean)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'encuestas', p_write)
$$;
revoke all on function private.can_use_surveys(uuid, boolean) from public, anon;
grant execute on function private.can_use_surveys(uuid, boolean) to authenticated;

do $do$
declare r record; d text;
begin
  for r in select * from (values
    ('public.v2_surveys(uuid)', 'if not private.is_presidency(v_org) then raise exception ''Sólo Presidencia ve las encuestas'';',
                                'if not private.can_use_surveys(v_org, false) then raise exception ''No tienes permiso para ver las encuestas'';'),
    ('private.survey_results(uuid, text)', 'if not private.is_presidency(p_organization_id) then raise exception ''Sólo Presidencia ve los resultados'';',
                                'if not private.can_use_surveys(p_organization_id, false) then raise exception ''No tienes permiso para ver los resultados'';'),
    ('public.v2_create_survey(uuid, text, text)', 'if not private.is_presidency(organization_id) then raise exception ''Sólo Presidencia crea encuestas'';',
                                'if not private.can_use_surveys(organization_id, true) then raise exception ''No tienes permiso para crear encuestas'';'),
    ('public.v2_set_survey_open(uuid, text, boolean)', 'if not private.is_presidency(v_org) then raise exception ''Sólo Presidencia cierra encuestas'';',
                                'if not private.can_use_surveys(v_org, true) then raise exception ''No tienes permiso para cerrar encuestas'';')
  ) t(f, viejo, nuevo) loop
    d := pg_get_functiondef(r.f::regprocedure);
    if position('can_use_surveys' in d) = 0 then
      d := replace(d, r.viejo, r.nuevo);
      if position('can_use_surveys' in d) = 0 then raise exception 'h14: no se pudo parchar %', r.f; end if;
      execute d;
    end if;
  end loop;
end $do$;

-- Zul (Operaciones): ver y enviar encuestas, por persona.
insert into private.membership_module_overrides(organization_id, membership_id, module_code, can_read, can_write)
select m.organization_id, m.id, 'encuestas', true, true
  from public.organization_memberships m
 where m.id = '65511245-858a-479b-a2fd-94f935ff5b83'
on conflict (organization_id, membership_id, module_code) do update set can_read = true, can_write = true, updated_at = now();
