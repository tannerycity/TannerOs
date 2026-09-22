-- Prueba 5 de docs/auditoria/06 · PERMISOS · SÓLO LECTURA
--
-- El daño que evita: que un profe abra el padrón y vea cuánto paga —o cuánta
-- beca tiene— el hijo de cada familia. Se encontró así en la auditoría: el
-- cuerpo técnico veía la cuota de todos.
--
-- Cómo lo prueba: se hace pasar por un Formadores real y pide `v2_players`.
-- Los siete campos que el candado `private.can_see_player_money` protege tienen
-- que venir vacíos en TODAS las filas.
--
-- El control positivo importa tanto como la prueba: si `can_see_player_money`
-- devolviera `false` para todo el mundo, la prueba pasaría y el club se quedaría
-- sin ver su propio dinero. Por eso también se exige que quien SÍ cobra lo vea.

do $$
declare
  v_form uuid; v_cobra uuid; v_org uuid; v_rol text;
  v_filas_f int; v_fugas int; v_filas_c int; v_con_cuota int;
begin
  select m.user_id, m.organization_id into v_form, v_org
  from public.organization_memberships m
  where m.active and m.role = 'Formadores' limit 1;

  select m.user_id, m.role into v_cobra, v_rol
  from public.organization_memberships m
  where m.active and m.role in ('Taquilla','Contabilidad','Presidencia')
    and m.organization_id = v_org limit 1;

  if v_form is null then raise exception 'PRUEBA FALLÓ: no hay ningún Formadores activo con el que probar'; end if;
  if v_cobra is null then raise exception 'PRUEBA FALLÓ: no hay ningún rol de cobranza con el que hacer el control positivo'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_form, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*),
         count(*) filter (where base_monthly_fee is not null
                             or billing_status is not null
                             or review_reason is not null
                             or benefit_active
                             or benefit_source is not null
                             or benefit_type is not null
                             or needs_review)
    into v_filas_f, v_fugas
  from public.v2_players(v_org, null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cobra, 'role','authenticated')::text, true);
  select count(*), count(*) filter (where base_monthly_fee is not null)
    into v_filas_c, v_con_cuota
  from public.v2_players(v_org, null);

  perform set_config('role','postgres', true);

  if v_filas_f = 0 then
    raise exception 'PRUEBA FALLÓ: el Formadores no ve ni un Tanner; sin filas no se prueba nada';
  end if;
  if v_fugas > 0 then
    raise exception 'PRUEBA FALLÓ: el Formadores vio dinero en % de sus % Tanners', v_fugas, v_filas_f;
  end if;
  if v_con_cuota = 0 then
    raise exception 'PRUEBA FALLÓ: ni % ve la cuota de nadie; el candado se cerró de más y el club no ve su dinero', v_rol;
  end if;

  raise notice 'PRUEBA OK · 05 · Formadores: % Tanners, 0 con dinero · %: % Tanners, % con cuota',
    v_filas_f, v_rol, v_filas_c, v_con_cuota;
end $$;
