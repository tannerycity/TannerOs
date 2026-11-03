-- Prueba 18 · FLUJO + PERMISOS · ESCRIBE Y SE REVIERTE
--
-- h60: con el cupo lleno, la familia no se va: queda en la lista de espera.
--   - Con lugar: se inscribe y recibe su liga para firmar.
--   - Cupo lleno: queda en '<slug>-espera', sin liga, sin contar en el cupo; la
--     portada dice "waitlist".
--   - Dar de baja pide motivo, libera el lugar y conserva el lead en '<slug>-baja'.
--   - Sumar sólo con lugar; inscribe y regresa la liga personal.
--   - anon no puede dar de baja ni sumar.
-- Baja el cupo a "inscritos + 1" dentro del bloque y todo se revierte al final.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'; v_slug text := 'visoria-noviembre-2026';
  v_key text; v_pres uuid; v_n int; v_r jsonb; v_a jsonb; v_b jsonb; v_fallas text[] := '{}'; v_ok int := 0; v_src text;
  nino jsonb := '{"firstName":"Prueba","lastName":"Espera Uno","birthDate":"2015-03-02","sex":"M","type":"player","foot":"right","school":"QA"}';
  tutor jsonb := '{"name":"Tutor QA","phone":"4770000001","channel":"Instagram","relationship":"madre"}';
  emer jsonb := '{"nombre":"Emergencia QA","telefono":"4770000002"}';
begin
  select slug into v_key from public.organizations where id = v_org;
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  begin
    v_n := private.visoria_inscritos(v_org, v_slug);
    update app.visoria_campaigns set capacity = v_n + 1, is_open = true where organization_id = v_org and slug = v_slug;

    -- 1. Con un lugar: se inscribe y trae liga.
    perform set_config('role', 'anon', true);
    v_a := public.v2_public_visoria_reserve(v_key, v_slug, nino, tutor, emer, null);
    if v_a->>'token' is null or coalesce((v_a->>'waitlist')::boolean, false) then v_fallas := v_fallas || ('Con lugar no se inscribió: ' || v_a::text); else v_ok := v_ok + 1; end if;

    -- 2. Lleno: a la lista de espera, sin liga.
    v_r := public.v2_public_visoria(v_key, v_slug);
    if (v_r->>'open')::boolean or not (v_r->>'waitlist')::boolean then v_fallas := v_fallas || ('La portada no ofrece lista de espera: ' || v_r::text); else v_ok := v_ok + 1; end if;
    v_b := public.v2_public_visoria_reserve(v_key, v_slug, jsonb_set(nino, '{lastName}', '"Espera Dos"'), jsonb_set(tutor, '{phone}', '"4770000003"'), emer, null);
    perform set_config('role', 'postgres', true);
    if not coalesce((v_b->>'waitlist')::boolean, false) or v_b->>'token' is not null then v_fallas := v_fallas || ('Lleno no fue a la lista: ' || v_b::text); else v_ok := v_ok + 1; end if;
    select source_campaign into v_src from app.prospects where id = (v_b->>'id')::uuid;
    if v_src <> v_slug || '-espera' then v_fallas := v_fallas || ('Quedó en ' || coalesce(v_src, '(nada)')); else v_ok := v_ok + 1; end if;
    if private.visoria_inscritos(v_org, v_slug) <> v_n + 1 then v_fallas := v_fallas || 'La lista de espera contó en el cupo'::text; else v_ok := v_ok + 1; end if;

    -- 3. Repetir el registro en espera no duplica ni da liga.
    perform set_config('role', 'anon', true);
    v_r := public.v2_public_visoria_reserve(v_key, v_slug, jsonb_set(nino, '{lastName}', '"Espera Dos"'), jsonb_set(tutor, '{phone}', '"4770000003"'), emer, null);
    perform set_config('role', 'postgres', true);
    if v_r->>'id' <> v_b->>'id' or v_r->>'token' is not null then v_fallas := v_fallas || ('Duplicó la espera: ' || v_r::text); else v_ok := v_ok + 1; end if;

    -- 4. anon no da de baja ni suma.
    perform set_config('role', 'anon', true);
    begin perform public.v2_visoria_drop(v_org, (v_a->>'id')::uuid, 'prueba'); v_fallas := v_fallas || 'anon dio de baja'::text;
    exception when others then v_ok := v_ok + 1; end;
    begin perform public.v2_visoria_waitlist_add(v_org, (v_b->>'id')::uuid); v_fallas := v_fallas || 'anon sumó'::text;
    exception when others then v_ok := v_ok + 1; end;

    -- 5. Staff: sumar con cupo lleno no se puede; baja sin motivo tampoco.
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin perform public.v2_visoria_waitlist_add(v_org, (v_b->>'id')::uuid); v_fallas := v_fallas || 'Sumó con cupo lleno'::text;
    exception when others then if sqlerrm like 'Cupo lleno%' then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Sumar lleno: ' || sqlerrm); end if; end;
    begin perform public.v2_visoria_drop(v_org, (v_a->>'id')::uuid, ''); v_fallas := v_fallas || 'Baja sin motivo'::text;
    exception when others then v_ok := v_ok + 1; end;

    -- 6. Baja con motivo libera el lugar y el lead se queda; luego se suma al de la espera.
    v_r := public.v2_visoria_drop(v_org, (v_a->>'id')::uuid, 'Prueba QA: ya no puede');
    if (v_r->>'spotsLeft')::int <> 1 then v_fallas := v_fallas || ('La baja no liberó: ' || v_r::text); else v_ok := v_ok + 1; end if;
    v_r := public.v2_visoria_waitlist_add(v_org, (v_b->>'id')::uuid);
    if length(coalesce(v_r->>'token', '')) < 20 or v_r->>'phone' is null then v_fallas := v_fallas || ('Sumar no dio liga: ' || v_r::text); else v_ok := v_ok + 1; end if;
    v_r := public.v2_visoria_board(v_org, v_slug);
    perform set_config('role', 'postgres', true);
    if not exists (select 1 from jsonb_array_elements(v_r->'items') i where i->>'id' = v_b->>'id') then v_fallas := v_fallas || 'El sumado no está en inscritos'::text; else v_ok := v_ok + 1; end if;
    if not exists (select 1 from jsonb_array_elements(v_r->'waitlist') i where i->>'id' = v_a->>'id' and i->>'status' = 'baja' and i->>'dropReason' like 'Prueba QA%') then
      v_fallas := v_fallas || 'La baja no se ve en el tablero'::text; else v_ok := v_ok + 1; end if;
    if (select count(*) from app.visoria_audit where prospect_id in ((v_a->>'id')::uuid, (v_b->>'id')::uuid) and action in ('baja', 'sumado_de_espera', 'lista_de_espera')) <> 3 then
      v_fallas := v_fallas || 'Faltan renglones en la bitácora'::text; else v_ok := v_ok + 1; end if;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 18 · % comprobaciones: lista de espera, baja con motivo y sumar con liga', v_ok;
end $$;
