-- Prueba 15 · FLUJO · ESCRIBE Y SE REVIERTE
--
-- h57: Facebook con las métricas vigentes de Meta (page_impressions se dio de baja).
--   - La ingesta acepta "visualizaciones" de Facebook.
--   - El tablero muestra visualizaciones_facebook (suma de días) y ya no
--     impresiones_facebook: visualizaciones no son impresiones.
--   - Una métrica fuera del catálogo sigue rechazada.
-- Usa usuarios de prueba: corre igual en local y en producción (se revierte).

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_r jsonb; v_x jsonb; v_fallas text[] := '{}'; v_ok int := 0;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date; kpi jsonb;
begin
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  v_pres := coalesce(v_pres, '00000000-0000-0000-0000-0000000000a1');
  begin
    perform set_config('role', 'service_role', true);
    v_x := public.v2_bi_ingesta(v_org, 'facebook', 'ok', jsonb_build_array(
      jsonb_build_object('fuente', 'facebook', 'cuenta', '166989879833376', 'negocio', 'club', 'metrica', 'visualizaciones', 'dia', v_hoy - 2, 'valor', 120),
      jsonb_build_object('fuente', 'facebook', 'cuenta', '166989879833376', 'negocio', 'club', 'metrica', 'visualizaciones', 'dia', v_hoy - 1, 'valor', 80),
      jsonb_build_object('fuente', 'facebook', 'cuenta', '727296023789322', 'negocio', 'tcp', 'metrica', 'visualizaciones', 'dia', v_hoy - 1, 'valor', 45),
      jsonb_build_object('fuente', 'facebook', 'cuenta', '166989879833376', 'negocio', 'club', 'metrica', 'vistas_inventadas', 'dia', v_hoy - 1, 'valor', 9)
    ), v_hoy - 2, v_hoy, null);
    -- 1. Visualizaciones entra; lo que no está en el catálogo, no.
    if (v_x->>'guardadas')::int = 3 and (v_x->>'rechazadas')::int = 1 then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Ingesta: esperaba 3 y 1, fue ' || v_x::text); end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 6, v_hoy);
    -- 2. El tablero suma los días por negocio.
    select k into kpi from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'visualizaciones_facebook' and k->>'negocio' = 'club';
    if kpi->>'estado' = 'real' and (kpi->>'valor')::numeric = 200 then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Visualizaciones club: esperaba 200 real, fue ' || coalesce(kpi::text, 'falta')); end if;
    select k into kpi from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'visualizaciones_facebook' and k->>'negocio' = 'tcp';
    if (kpi->>'valor')::numeric = 45 then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Visualizaciones TCP: esperaba 45, fue ' || coalesce(kpi::text, 'falta')); end if;
    -- 3. Ya no hay KPI de impresiones de Facebook.
    if not exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'impresiones_facebook') then v_ok := v_ok + 1;
    else v_fallas := v_fallas || 'El tablero aún muestra impresiones_facebook'::text; end if;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 15 · % comprobaciones: Facebook con visualizaciones, sin impresiones inventadas', v_ok;
end $$;
