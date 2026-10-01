-- Prueba 11 · PERMISOS · ESCRIBE Y SE REVIERTE
--
-- El club pidió un lugar para la fecha de ingreso "que sólo Presidencia la
-- pueda mover". Esto comprueba las dos mitades de esa frase:
--
--   · que Presidencia SÍ la mueva, y
--   · que alguien que puede guardar el expediente pero NO es Presidencia
--     guarde todo lo demás y deje esa fecha intacta.
--
-- EL CONTROL POSITIVO IMPORTA TANTO COMO EL CANDADO
--
-- La primera versión de esta prueba usó a Formadores para el caso negativo y
-- no probó nada: un Formador no puede escribir el expediente, así que tronaba
-- antes de llegar al candado de la fecha. El rol que sirve es el que SÍ puede
-- guardar la ficha y NO es Presidencia — hoy, Operaciones.
--
-- Por eso el rol negativo se busca por lo que PUEDE, no por cómo se llama: el
-- día que el club reacomode permisos, esta prueba sigue buscando al indicado
-- en vez de quedarse probando a alguien que ya no aplica.
--
-- DESDE a2 SON DOS FECHAS: ingreso a TannerOS e ingreso al club. Las dos con
-- el mismo candado, y cada cambio deja quién lo hizo. La prueba cubre ambas y
-- revisa que el expediente traiga el rastro con el nombre de Presidencia.
--
-- Todo dentro de un bloque que se revierte solo. Al terminar no queda ni una
-- fecha cambiada; se verifica contando después de correrla.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_otro uuid; v_rol_otro text;
  v_jug uuid; v_nace date; v_perfil jsonb;
  v_puso text; v_quedo text; v_apellido text;
  v_puso_reg text; v_quedo_reg text; v_rastro int; v_rastro_quien text;
  v_pres_puede boolean; v_otro_puede boolean;
  v_futura text; v_antes_de_nacer text;
  r record;
begin
  -- Quien manda.
  select m.user_id into v_pres from public.organization_memberships m
  where m.active and m.organization_id = v_org and m.role = 'Presidencia' limit 1;
  if v_pres is null then
    raise exception 'PRUEBA FALLÓ: no hay Presidencia con quien probar';
  end if;

  -- Y el rol que puede guardar la ficha SIN ser Presidencia. Se busca por lo
  -- que puede hacer, no por su nombre.
  for r in select distinct on (m.role) m.role, m.user_id
           from public.organization_memberships m
           where m.active and m.organization_id = v_org and m.role <> 'Presidencia'
           order by m.role, m.user_id
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role','authenticated')::text, true);
    perform set_config('role','authenticated', true);
    if private.has_module_access(v_org,'players',true)
       and not private.is_presidency(v_org) then
      v_otro := r.user_id; v_rol_otro := r.role;
    end if;
    perform set_config('role','postgres', true);
    exit when v_otro is not null;
  end loop;

  if v_otro is null then
    raise exception 'PRUEBA FALLÓ: no hay ningún rol que pueda guardar el expediente sin ser Presidencia; el candado no probó nada';
  end if;

  select id, birth_date into v_jug, v_nace from app.players
  where organization_id = v_org and archived_at is null and status = 'active'
    and birth_date is not null
  limit 1;
  if v_jug is null then
    raise exception 'PRUEBA FALLÓ: no hay un Tanner activo con fecha de nacimiento con quien probar';
  end if;

  begin
    /* ===== PRESIDENCIA SÍ ===== */
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_pres, 'role','authenticated')::text, true);
    perform set_config('role','authenticated', true);
    v_pres_puede := public.v2_can_set_joined_at(v_org);

    v_perfil := public.v2_save_player_profile(v_org, v_jug,
      'QA','Presidencia', v_nace, null,null,null,null,null,null,null,null,null,null,
      null,null,null,null,null,null, null,null,null,null, date '2026-01-15', date '2026-02-01');
    v_puso := coalesce(v_perfil->'player'->>'joinedAt','(null)');
    v_puso_reg := coalesce(v_perfil->'player'->>'registeredAt','(null)');
    v_rastro := jsonb_array_length(coalesce(v_perfil->'player'->'admissionHistory','[]'));
    select pf.display_name into v_rastro_quien from public.profiles pf where pf.user_id = v_pres;
    if not exists (select 1 from jsonb_array_elements(v_perfil->'player'->'admissionHistory') h
                   where h->>'field' = 'registeredAt' and h->>'to' = '2026-02-01'
                     and h->>'by' = coalesce(nullif(btrim(v_rastro_quien),''),'Usuario sin nombre')) then
      v_rastro_quien := '(no quedó registro)';
    end if;

    /* ===== LOS DOS DISPARATES ===== */
    begin
      perform public.v2_save_player_profile(v_org, v_jug,
        'QA','Presidencia', v_nace, null,null,null,null,null,null,null,null,null,null,
        null,null,null,null,null,null, null,null,null,null, current_date + 5);
      v_futura := 'SE ACEPTÓ';
    exception when others then v_futura := 'rechazada'; end;

    begin
      perform public.v2_save_player_profile(v_org, v_jug,
        'QA','Presidencia', v_nace, null,null,null,null,null,null,null,null,null,null,
        null,null,null,null,null,null, null,null,null,null, v_nace - 30);
      v_antes_de_nacer := 'SE ACEPTÓ';
    exception when others then v_antes_de_nacer := 'rechazada'; end;

    -- La de TannerOS tiene las mismas guardias.
    begin
      perform public.v2_save_player_profile(v_org, v_jug,
        'QA','Presidencia', v_nace, null,null,null,null,null,null,null,null,null,null,
        null,null,null,null,null,null, null,null,null,null, null, current_date + 5);
      v_futura := v_futura || ' / TannerOS SE ACEPTÓ';
    exception when others then null; end;

    /* ===== EL OTRO ROL NO, Y SIN TRONAR ===== */
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_otro, 'role','authenticated')::text, true);
    v_otro_puede := public.v2_can_set_joined_at(v_org);

    v_perfil := public.v2_save_player_profile(v_org, v_jug,
      'QA','OtroRol', v_nace, null,null,null,null,null,null,null,null,null,null,
      null,null,null,null,null,null, null,null,null,null, date '1999-01-01', date '1999-01-01');
    v_quedo := coalesce(v_perfil->'player'->>'joinedAt','(null)');
    v_quedo_reg := coalesce(v_perfil->'player'->>'registeredAt','(null)');
    v_apellido := coalesce(v_perfil->'player'->>'lastName','(null)');

    perform set_config('role','postgres', true);
    raise exception 'REVIERTE';
  exception when others then
    perform set_config('role','postgres', true);
    if sqlerrm <> 'REVIERTE' then
      raise exception 'PRUEBA FALLÓ: reventó al probar la fecha de ingreso: %', sqlerrm;
    end if;
  end;

  /* ===== EL VEREDICTO, con los números ya capturados ===== */
  if not v_pres_puede then
    raise exception 'PRUEBA FALLÓ: v2_can_set_joined_at le dice que NO a Presidencia; la pantalla le deshabilitaría el campo a quien sí manda';
  end if;
  if v_puso <> '2026-01-15' then
    raise exception 'PRUEBA FALLÓ: Presidencia guardó la fecha y quedó en "%"', v_puso;
  end if;
  if v_puso_reg <> '2026-02-01' then
    raise exception 'PRUEBA FALLÓ: Presidencia guardó la fecha de ingreso a TannerOS y quedó en "%"', v_puso_reg;
  end if;
  if v_rastro < 2 or v_rastro_quien = '(no quedó registro)' then
    raise exception 'PRUEBA FALLÓ: el expediente no trae quién movió las fechas (% cambios en el rastro)', v_rastro;
  end if;
  if v_futura <> 'rechazada' then
    raise exception 'PRUEBA FALLÓ: se aceptó una fecha de ingreso futura';
  end if;
  if v_antes_de_nacer <> 'rechazada' then
    raise exception 'PRUEBA FALLÓ: se aceptó una fecha de ingreso anterior al nacimiento';
  end if;
  if v_otro_puede then
    raise exception 'PRUEBA FALLÓ: v2_can_set_joined_at le dice que SÍ a %, que no es Presidencia', v_rol_otro;
  end if;
  -- Guardó: el expediente es suyo. Lo que no movió es la fecha.
  if v_apellido <> 'OtroRol' then
    raise exception 'PRUEBA FALLÓ: % no pudo guardar el expediente; el candado se cerró de más', v_rol_otro;
  end if;
  if v_quedo <> '2026-01-15' then
    raise exception 'PRUEBA FALLÓ: % movió la fecha de ingreso a "%"; sólo Presidencia debe poder', v_rol_otro, v_quedo;
  end if;

  if v_quedo_reg <> '2026-02-01' then
    raise exception 'PRUEBA FALLÓ: % movió la fecha de ingreso a TannerOS a "%"; sólo Presidencia debe poder', v_rol_otro, v_quedo_reg;
  end if;

  raise notice 'PRUEBA OK · 11 · Presidencia puso las dos fechas y quedó su nombre en el rastro; % guardó el expediente y las dejó intactas; futura y anterior al nacimiento rechazadas',
    v_rol_otro;
end $$;
