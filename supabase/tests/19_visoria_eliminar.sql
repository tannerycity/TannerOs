-- Prueba 19 · FLUJO + PERMISOS · ESCRIBE Y SE REVIERTE
--
-- h61: eliminar un registro de visoría (pruebas o errores).
--   - Sin motivo, no. anon, no. Quien sólo ve Prospectos (sin admin), no.
--   - Un registro sin firma: se borra con sus ligas y queda en la bitácora.
--   - Con consentimiento firmado: no se borra (se da de baja).
-- Todo se revierte al final.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'; v_slug text := 'visoria-noviembre-2026';
  v_key text; v_pres uuid; v_a jsonb; v_r jsonb; v_fallas text[] := '{}'; v_ok int := 0; v_k uuid;
begin
  select slug into v_key from public.organizations where id = v_org;
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  begin
    perform set_config('role', 'anon', true);
    v_a := public.v2_public_visoria_reserve(v_key, v_slug,
      '{"firstName":"Prueba","lastName":"Eliminar QA","birthDate":"2015-03-02","sex":"M","type":"player","foot":"right","school":"QA"}',
      '{"name":"Tutor QA","phone":"4770000009","channel":"Instagram","relationship":"madre"}', '{"nombre":"Emergencia QA","telefono":"4770000008"}', null);
    begin perform public.v2_visoria_delete(v_org, (v_a->>'id')::uuid, 'prueba'); v_fallas := v_fallas || 'anon eliminó'::text;
    exception when others then v_ok := v_ok + 1; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin perform public.v2_visoria_delete(v_org, (v_a->>'id')::uuid, ''); v_fallas := v_fallas || 'Eliminó sin motivo'::text;
    exception when others then v_ok := v_ok + 1; end;
    v_r := public.v2_visoria_delete(v_org, (v_a->>'id')::uuid, 'Registro de prueba QA');
    perform set_config('role', 'postgres', true);
    if not (v_r->>'deleted')::boolean or exists (select 1 from app.prospects where id = (v_a->>'id')::uuid)
       or exists (select 1 from app.visoria_sign_links where prospect_id = (v_a->>'id')::uuid) then
      v_fallas := v_fallas || ('No se borró completo: ' || v_r::text); else v_ok := v_ok + 1; end if;
    if not exists (select 1 from app.visoria_audit where action = 'registro_eliminado' and detail->>'folio' = v_r->>'folio' and reason = 'Registro de prueba QA') then
      v_fallas := v_fallas || 'No quedó en la bitácora'::text; else v_ok := v_ok + 1; end if;
    -- Con consentimiento firmado (si hay alguno en producción): no se borra.
    select k.prospect_id into v_k from app.visoria_consents k limit 1;
    if v_k is not null then
      perform set_config('role', 'authenticated', true);
      begin perform public.v2_visoria_delete(v_org, v_k, 'prueba QA'); v_fallas := v_fallas || 'Eliminó con consentimiento'::text;
      exception when others then if sqlerrm like '%consentimiento firmado%' then v_ok := v_ok + 1; else v_fallas := v_fallas || ('Con firma: ' || sqlerrm); end if; end;
      perform set_config('role', 'postgres', true);
    end if;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 19 · % comprobaciones: eliminar sólo con motivo, por admin y sin firma', v_ok;
end $$;
