-- Prueba 13 · PERMISOS + FLUJO · ESCRIBE Y SE REVIERTE
--
-- h55 (docs/medicion): el uso de TannerOS se cuenta en casa y agregado.
--   - Abrir un módulo suma una apertura y un actor seudónimo por día.
--   - El mismo usuario dos veces el mismo día: dos aperturas, un actor.
--   - Un módulo fuera del catálogo o el rol Tanner no cuentan.
--   - Sin sesión no cuenta nada.
--   - El resumen da usuarios activos y uso por módulo, sin ids reales, y sólo
--     lo abre quien tiene Administración (Presidencia).
-- Todo dentro de un bloque que se revierte solo.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_ops uuid; v_r jsonb; v_n int; v_fallas text[] := '{}'; v_ok int := 0; v_antes int;
begin
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  select m.user_id into v_ops from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Operaciones' limit 1;
  if v_pres is null or v_ops is null then raise exception 'PRUEBA FALLÓ: faltan usuarios de Presidencia u Operaciones'; end if;
  begin
    select coalesce(sum(opens), 0) into v_antes from app.usage_daily where organization_id = v_org and module = 'taquilla'
      and day = (now() at time zone 'America/Mexico_City')::date;
    perform set_config('request.jwt.claims', json_build_object('sub', v_ops, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.v2_usage_ping(v_org, 'taquilla');
    perform public.v2_usage_ping(v_org, 'taquilla');
    perform public.v2_usage_ping(v_org, 'modulo_inventado');
    begin
      perform public.v2_usage_summary(v_org, 30);
      v_fallas := v_fallas || 'Resumen: Operaciones pudo ver el uso (es de Presidencia)'::text;
    exception when others then v_ok := v_ok + 1; end;
    perform set_config('role', 'postgres', true);
    select opens into v_n from app.usage_daily where organization_id = v_org and module = 'taquilla' and day = (now() at time zone 'America/Mexico_City')::date;
    if v_n - v_antes <> 2 then v_fallas := v_fallas || ('Aperturas: esperaba 2, hubo ' || (v_n - v_antes)); else v_ok := v_ok + 1; end if;
    if exists (select 1 from app.usage_daily where module = 'modulo_inventado') then v_fallas := v_fallas || 'Catálogo: contó un módulo inventado'::text; else v_ok := v_ok + 1; end if;
    if exists (select 1 from app.usage_actors where actor ~ v_ops::text or actor = v_ops::text) then v_fallas := v_fallas || 'Seudónimo: se guardó el id real'::text; else v_ok := v_ok + 1; end if;

    -- El rol Tanner no cuenta.
    update public.organization_memberships set role = 'Tanner' where user_id = v_ops and organization_id = v_org;
    perform set_config('role', 'authenticated', true);
    perform public.v2_usage_ping(v_org, 'inicio');
    perform set_config('role', 'postgres', true);
    if exists (select 1 from app.usage_daily where organization_id = v_org and module = 'inicio' and day = (now() at time zone 'America/Mexico_City')::date and opens > 0
               and not exists (select 1 from app.usage_actors a where a.module = 'inicio' and a.organization_id = v_org and a.day = (now() at time zone 'America/Mexico_City')::date
                               and a.actor <> encode(pg_catalog.sha256(convert_to(v_ops::text || ':' || v_org::text || ':' || (select s.salt from private.usage_salt s), 'UTF8')), 'hex')))
       and exists (select 1 from app.usage_actors a where a.module = 'inicio' and a.actor = encode(pg_catalog.sha256(convert_to(v_ops::text || ':' || v_org::text || ':' || (select s.salt from private.usage_salt s), 'UTF8')), 'hex'))
      then v_fallas := v_fallas || 'Rol Tanner: se contó'::text; else v_ok := v_ok + 1; end if;

    -- Sin sesión no cuenta.
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform public.v2_usage_ping(v_org, 'club');
    if exists (select 1 from app.usage_daily where organization_id = v_org and module = 'club' and day = (now() at time zone 'America/Mexico_City')::date and opens > 0
               and not exists (select 1 from app.usage_actors a where a.organization_id = v_org and a.module = 'club' and a.day = (now() at time zone 'America/Mexico_City')::date))
      then v_fallas := v_fallas || 'Sin sesión: se contó'::text; else v_ok := v_ok + 1; end if;

    -- Presidencia ve el resumen, sin personas.
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_usage_summary(v_org, 7);
    perform set_config('role', 'postgres', true);
    if (v_r->>'wau')::int < 1 or not exists (select 1 from jsonb_array_elements(v_r->'modules') m where m->>'module' = 'taquilla' and (m->>'opens')::int >= 2 and (m->>'users')::int >= 1)
      then v_fallas := v_fallas || ('Resumen: no trae el uso de Taquilla ' || v_r::text); else v_ok := v_ok + 1; end if;
    if v_r::text ~ v_ops::text or v_r::text ~ 'actor' then v_fallas := v_fallas || 'Resumen: trae ids de personas'::text; else v_ok := v_ok + 1; end if;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 13 · % comprobaciones: el uso se cuenta agregado, sin ids reales, sin rol Tanner y sólo Presidencia lo ve', v_ok;
end $$;
