-- Prueba 16 · PERMISOS + FLUJO · ESCRIBE Y SE REVIERTE
--
-- h58: la pantalla de Métricas también para Zul.
--   - Quien tiene el permiso de Métricas (Zul, por persona) abre el tablero y
--     la serie diaria; quien no lo tiene, no.
--   - Lo cobrado (dinero del club) sólo sale a Presidencia o Administración.
--   - La serie trae agregados por día, la última sincronización de cada fuente
--     y prospectos por día como conteo; ningún nombre.
-- Usa usuarios de prueba: corre igual en local y en producción (se revierte).

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_zul uuid; v_otro uuid := '00000000-0000-0000-0000-0000000000c4';
  v_r jsonb; v_s jsonb; v_fallas text[] := '{}'; v_ok int := 0;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  select m.user_id into v_zul from public.organization_memberships m where m.id = '65511245-858a-479b-a2fd-94f935ff5b83';
  begin
    -- Datos de prueba: una fuente sincronizada y un prospecto de hoy.
    perform set_config('role', 'service_role', true);
    perform public.v2_bi_ingesta(v_org, 'instagram', 'ok', jsonb_build_array(
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841462855563889', 'negocio', 'club', 'metrica', 'alcance', 'dia', v_hoy - 1, 'valor', 321)), v_hoy - 1, v_hoy, null);
    perform set_config('role', 'postgres', true);
    insert into app.prospects(organization_id, first_name, created_at) values (v_org, 'Prueba Métricas', now());

    -- 1. Zul abre el tablero y la serie.
    perform set_config('request.jwt.claims', json_build_object('sub', v_zul, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 6, v_hoy);
    v_s := public.v2_bi_serie(v_org, v_hoy - 6, v_hoy);
    if jsonb_array_length(v_r->'kpis') > 0 then v_ok := v_ok + 1; else v_fallas := v_fallas || 'Zul no ve el tablero'::text; end if;
    -- 2. Pero no lo cobrado.
    if not exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'cobrado') then v_ok := v_ok + 1;
    else v_fallas := v_fallas || 'Zul vio lo cobrado'::text; end if;
    -- 3. La serie trae el alcance del día, como agregado.
    if exists (select 1 from jsonb_array_elements(v_s->'filas') f where f->>'fuente' = 'instagram' and f->>'metrica' = 'alcance' and (f->>'valor')::numeric = 321 and (f->>'dia')::date = v_hoy - 1)
      then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Serie sin el alcance: ' || (v_s->'filas')::text); end if;
    -- 4. Prospectos por día como conteo, sin nombres.
    if exists (select 1 from jsonb_array_elements(v_s->'prospectos') p where (p->>'dia')::date = v_hoy and (p->>'n')::int >= 1)
       and position('Prueba Métricas' in v_s::text) = 0 then v_ok := v_ok + 1;
    else v_fallas := v_fallas || ('Prospectos: ' || coalesce((v_s->'prospectos')::text, 'falta')); end if;
    -- 5. Y la última sincronización de cada fuente.
    if exists (select 1 from jsonb_array_elements(v_s->'sincronizaciones') s where s->>'fuente' = 'instagram' and s->>'estado' = 'ok') then v_ok := v_ok + 1;
    else v_fallas := v_fallas || 'Serie sin sincronizaciones'::text; end if;

    -- 6. Presidencia sí ve lo cobrado.
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 6, v_hoy);
    if exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'cobrado') then v_ok := v_ok + 1;
    else v_fallas := v_fallas || 'Presidencia no vio lo cobrado'::text; end if;

    -- 7. Alguien sin el permiso no abre ninguna de las dos.
    perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
    begin perform public.v2_bi_tablero(v_org, v_hoy - 6, v_hoy); v_fallas := v_fallas || 'Sin permiso abrió el tablero'::text;
    exception when others then v_ok := v_ok + 1; end;
    begin perform public.v2_bi_serie(v_org, v_hoy - 6, v_hoy); v_fallas := v_fallas || 'Sin permiso abrió la serie'::text;
    exception when others then v_ok := v_ok + 1; end;
    -- 8. Rango absurdo: se rechaza.
    perform set_config('request.jwt.claims', json_build_object('sub', v_zul, 'role', 'authenticated')::text, true);
    begin perform public.v2_bi_serie(v_org, v_hoy, v_hoy - 5); v_fallas := v_fallas || 'Rango invertido aceptado'::text;
    exception when others then v_ok := v_ok + 1; end;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 16 · % comprobaciones: Métricas para Zul sin lo cobrado, serie diaria sin personas', v_ok;
end $$;
