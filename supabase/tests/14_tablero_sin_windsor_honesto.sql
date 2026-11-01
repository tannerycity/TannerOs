-- Prueba 14 · PERMISOS + FLUJO · ESCRIBE Y SE REVIERTE
--
-- h56 (docs/medicion/BI-SIN-WINDSOR.md): el tablero ejecutivo sin Windsor.
--   - Sólo Administración (Presidencia) lo abre; nadie del navegador ingesta.
--   - Una fuente que nunca sincronizó sale "no_disponible" con valor nulo, no 0.
--   - La ingesta rechaza métricas fuera del catálogo, cuentas desconocidas y
--     valores negativos.
--   - Seguidores es el último valor, no la suma de días; club y TCP separados.
--   - Costo por prospecto: no se calcula sin gasto CLUB-; con él, "estimado".
--   - La operación de TCP dice que falta su base, sin inventar.
-- Usa usuarios de prueba: corre igual en local y en producción (se revierte).

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_otro uuid := '00000000-0000-0000-0000-0000000000b2';
  v_r jsonb; v_x jsonb; v_fallas text[] := '{}'; v_ok int := 0; v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  kpi jsonb;
begin
  -- En producción, una persona real de Presidencia; en local, el usuario de prueba.
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  v_pres := coalesce(v_pres, '00000000-0000-0000-0000-0000000000a1');
  begin
    -- 1. Alguien sin Administración no ve el tablero.
    perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.v2_bi_tablero(v_org, v_hoy - 29, v_hoy);
      v_fallas := v_fallas || 'Permisos: alguien sin Administración vio el tablero'::text;
    exception when others then v_ok := v_ok + 1; end;
    -- 2. Nadie desde el navegador puede meter números.
    begin
      perform public.v2_bi_ingesta(v_org, 'instagram', 'ok', '[]'::jsonb, v_hoy, v_hoy, null);
      v_fallas := v_fallas || 'Permisos: un usuario pudo ingestar'::text;
    exception when others then v_ok := v_ok + 1; end;

    -- 3. Antes de sincronizar: externo "no_disponible" y nulo; el club, real.
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 29, v_hoy);
    select k into kpi from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'seguidores_instagram' and k->>'negocio' = 'club';
    if kpi->>'estado' = 'no_disponible' and kpi->'valor' = 'null'::jsonb then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Sin sincronizar debía ser no_disponible y nulo: ' || coalesce(kpi::text, 'falta')); end if;
    if exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'prospectos' and k->>'estado' = 'real' and (k->>'valor') is not null)
      then v_ok := v_ok + 1; else v_fallas := v_fallas || 'Prospectos del club debían salir reales de la base'::text; end if;
    if exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'negocio' = 'tcp' and k->>'kpi' = 'operacion' and k->>'estado' = 'no_disponible' and k->'valor' = 'null'::jsonb)
      then v_ok := v_ok + 1; else v_fallas := v_fallas || 'La operación de TCP debía decir no disponible'::text; end if;

    -- 4. Ingesta (como el recolector): valida catálogo, cuenta y valor.
    perform set_config('role', 'service_role', true);
    v_x := public.v2_bi_ingesta(v_org, 'instagram', 'ok', jsonb_build_array(
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841462855563889', 'negocio', 'club', 'metrica', 'seguidores', 'dia', v_hoy - 2, 'valor', 980),
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841462855563889', 'negocio', 'club', 'metrica', 'seguidores', 'dia', v_hoy, 'valor', 990),
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841475095627973', 'negocio', 'tcp', 'metrica', 'seguidores', 'dia', v_hoy, 'valor', 358),
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841462855563889', 'negocio', 'club', 'metrica', 'nombre_del_jugador', 'dia', v_hoy, 'valor', 1),
      jsonb_build_object('fuente', 'instagram', 'cuenta', '999', 'negocio', 'club', 'metrica', 'alcance', 'dia', v_hoy, 'valor', 5),
      jsonb_build_object('fuente', 'instagram', 'cuenta', '17841462855563889', 'negocio', 'club', 'metrica', 'alcance', 'dia', v_hoy, 'valor', -3)
    ), v_hoy - 2, v_hoy, null);
    if (v_x->>'guardadas')::int = 3 and (v_x->>'rechazadas')::int = 3 then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Ingesta: esperaba 3 y 3, fue ' || v_x::text); end if;
    perform public.v2_bi_ingesta(v_org, 'meta_ads', 'ok', jsonb_build_array(
      jsonb_build_object('fuente', 'meta_ads', 'cuenta', '1253862975729440', 'negocio', 'compartido', 'metrica', 'gasto', 'dia', v_hoy - 1, 'valor', 600)), v_hoy - 1, v_hoy, null);

    -- 5. Seguidores: el último por cuenta, no la suma; club y TCP separados.
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 29, v_hoy);
    if exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'seguidores_instagram' and k->>'negocio' = 'club' and (k->>'valor')::numeric = 990 and k->>'estado' = 'real')
       and exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'seguidores_instagram' and k->>'negocio' = 'tcp' and (k->>'valor')::numeric = 358)
      then v_ok := v_ok + 1; else v_fallas := v_fallas || 'Seguidores: esperaba 990 club y 358 TCP'::text; end if;

    -- 6. Gasto sin prefijo CLUB-: compartido; el costo por prospecto no se inventa.
    if exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'gasto_meta' and k->>'negocio' = 'compartido' and (k->>'valor')::numeric = 600)
       and exists (select 1 from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'costo_por_prospecto' and k->>'estado' = 'no_disponible' and k->'valor' = 'null'::jsonb)
      then v_ok := v_ok + 1; else v_fallas := v_fallas || 'Costo por prospecto debía ser no disponible sin gasto CLUB-'::text; end if;

    -- 7. Con gasto CLUB- y prospectos: estimado = gasto / prospectos.
    perform set_config('role', 'service_role', true);
    perform public.v2_bi_ingesta(v_org, 'meta_ads', 'ok', jsonb_build_array(
      jsonb_build_object('fuente', 'meta_ads', 'cuenta', '1253862975729440', 'negocio', 'club', 'metrica', 'gasto', 'dia', v_hoy - 1, 'valor', 300)), v_hoy - 1, v_hoy, null);
    perform set_config('role', 'postgres', true);
    insert into app.prospects(organization_id, first_name, created_at) select v_org, 'Prueba BI', now() from generate_series(1, 3);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_bi_tablero(v_org, v_hoy - 1, v_hoy);
    select k into kpi from jsonb_array_elements(v_r->'kpis') k where k->>'kpi' = 'costo_por_prospecto';
    if kpi->>'estado' = 'estimado' and (kpi->>'valor')::numeric > 0 and (kpi->>'valor')::numeric <= 100 then v_ok := v_ok + 1;
    else v_fallas := v_fallas || ('Costo por prospecto con gasto CLUB-: ' || coalesce(kpi::text, 'falta')); end if;

    -- 8. Rango absurdo: se rechaza.
    begin
      perform public.v2_bi_tablero(v_org, v_hoy, v_hoy - 5);
      v_fallas := v_fallas || 'Rango invertido aceptado'::text;
    exception when others then v_ok := v_ok + 1; end;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 14 · % comprobaciones: tablero sólo para Administración, catálogo cerrado y nada de ceros inventados', v_ok;
end $$;
