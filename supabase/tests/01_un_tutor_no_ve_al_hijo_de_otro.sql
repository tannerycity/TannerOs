-- Prueba 1 de docs/auditoria/06 · PERMISOS · SÓLO LECTURA
--
-- El daño que evita: que una mamá abra el portal y vea el estado de cuenta, las
-- valoraciones o los papeles del hijo de otra familia.
--
-- Cómo lo prueba: se hace pasar por un tutor real —con `request.jwt.claims`,
-- que es lo mismo que ve la base cuando entra desde el navegador— y le pide a
-- las tres RPC del portal un Tanner que no es suyo. Las tres tienen que negarse.
--
-- Se probó a mano en la auditoría del 19 de septiembre; esto lo fija.

do $$
declare
  v_user uuid; v_tutor text; v_propio uuid; v_ajeno uuid;
  v_fallas text[] := '{}';
  v_filtro boolean;
begin
  -- Sujeto: cualquier tutor que hoy tenga acceso al portal. La prueba se hace
  -- más fuerte conforme más familias entran, no más frágil.
  select g.user_id, trim(g.first_name || ' ' || coalesce(g.last_name,'')), pg.player_id
    into v_user, v_tutor, v_propio
  from app.guardians g
  join app.player_guardians pg on pg.guardian_id = g.id
  where g.user_id is not null and coalesce(g.status,'active') <> 'inactive'
  limit 1;

  if v_user is null then
    raise exception 'PRUEBA FALLÓ: no hay ningún tutor con acceso al portal; sin sujeto no se prueba nada';
  end if;

  -- Un Tanner que NO es de este tutor.
  select pl.id into v_ajeno
  from app.players pl
  where pl.id <> v_propio
    and not exists (
      select 1 from app.player_guardians pg2
      join app.guardians g2 on g2.id = pg2.guardian_id
      where pg2.player_id = pl.id and g2.user_id = v_user)
  limit 1;

  if v_ajeno is null then
    raise exception 'PRUEBA FALLÓ: no hay ningún Tanner ajeno con el que probar';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- Control: lo suyo sí lo puede ver. Sin esto, una RPC rota se vería como una
  -- prueba que pasa.
  begin
    perform public.v2_portal_statement(v_propio);
  exception when others then
    v_fallas := v_fallas || format('el tutor no puede ver ni a su propio hijo (%s)', sqlerrm);
  end;

  -- Lo ajeno: las tres se tienen que negar.
  begin perform public.v2_portal_statement(v_ajeno); v_filtro := true;
  exception when others then v_filtro := false; end;
  if v_filtro then v_fallas := v_fallas || 'v2_portal_statement entregó el estado de cuenta de otra familia'; end if;

  begin perform public.v2_portal_progress(v_ajeno); v_filtro := true;
  exception when others then v_filtro := false; end;
  if v_filtro then v_fallas := v_fallas || 'v2_portal_progress entregó las valoraciones de otro Tanner'; end if;

  begin perform public.v2_portal_paperwork(v_ajeno); v_filtro := true;
  exception when others then v_filtro := false; end;
  if v_filtro then v_fallas := v_fallas || 'v2_portal_paperwork entregó los papeles de otra familia'; end if;

  perform set_config('role', 'postgres', true);

  if array_length(v_fallas, 1) > 0 then
    raise exception 'PRUEBA FALLÓ: %', array_to_string(v_fallas, ' · ');
  end if;
  raise notice 'PRUEBA OK · 01 · el tutor % ve lo suyo y las tres RPC le niegan lo ajeno', v_tutor;
end $$;
