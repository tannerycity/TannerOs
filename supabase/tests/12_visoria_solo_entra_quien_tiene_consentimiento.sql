-- Prueba 12 · PERMISOS + FLUJO · ESCRIBE Y SE REVIERTE
--
-- Paquete docs/visorias/03 (matriz QA, TC-01 a TC-18): que cada menor tenga
-- una autorización válida, verificable y auditable antes de entrar a una
-- visoría. Se prueba entrando por las mismas puertas que la app: como
-- visitante anónimo (la familia, con su liga), como Presidencia, como
-- Operaciones (Fichajes sin salud) y como Visor (Scouting).
--
-- Todo pasa en una visoría de prueba creada aquí, dentro de un bloque que se
-- revierte solo: al terminar no queda ni la campaña, ni el niño, ni un renglón
-- de bitácora. Las variables sobreviven al rollback y se revisan después.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_club text := 'tannery-city-fc';
  v_pres uuid; v_ops uuid; v_scout uuid;
  v_slug text := 'qa-visoria-' || substr(md5(random()::text), 1, 8);
  v_c uuid; v_r jsonb; v_tok text; v_tok2 text; v_ctx jsonb; v_base jsonb; v_pay jsonb; v_res jsonb;
  v_k1 uuid; v_k2 uuid; v_n int; v_txt text; v_hash text; v_pid uuid; v_pid2 uuid;
  v_fallas text[] := '{}'; v_ok int := 0; v_firma text := 'data:image/png;base64,' || repeat('iVBORw0KGgo', 300);
  v_legal jsonb := jsonb_build_object(
    'organizador_legal', 'Organizador QA S.C.', 'organizador_domicilio', 'Domicilio QA 123, León, Gto.',
    'responsable_conjunto', 'No hay responsable conjunto.', 'privacidad_correo', 'qa@example.com', 'privacidad_contacto', 'WhatsApp QA',
    'fecha_horario', 'Sábado de prueba, 9:00 a 12:00', 'coordinador', 'Coordinador QA · 477 000 0000',
    'coordinador_emergencias', 'Coordinador de emergencias QA', 'protocolo_emergencia', 'Protocolo QA aprobado',
    'medios_oficiales', 'Instagram oficial', 'encargados_tecnologicos', 'Proveedor de nube QA', 'arco_medio', 'qa@example.com',
    'arco_procedimiento', 'Procedimiento QA', 'conservacion', 'Tabla QA.', 'analitica', 'Sin analítica en la visoría.', 'url_aviso', 'https://example.com');
begin
  select m.user_id into v_pres from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  select m.user_id into v_ops from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Operaciones'
     and not exists (select 1 from private.membership_module_overrides o where o.membership_id = m.id and o.module_code = 'visoria_salud') limit 1;
  select m.user_id into v_scout from public.organization_memberships m where m.organization_id = v_org and m.active and m.role = 'Scouting' limit 1;
  if v_pres is null or v_ops is null or v_scout is null then
    raise exception 'PRUEBA FALLÓ: faltan usuarios de Presidencia, Operaciones o Scouting con quien probar';
  end if;

  begin
    insert into app.visoria_campaigns(organization_id, slug, title, dates_label, location, starts_on, capacity)
    values (v_org, v_slug, 'Visoría QA', 'Sábado de prueba', 'Cancha de prueba QA, León, Gto.', current_date + 10, 5) returning id into v_c;

    -- La familia aparta lugar (anónima).
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    v_r := public.v2_public_visoria(v_club, v_slug);
    if (v_r->>'signingOpen')::boolean or v_r->'legal' <> 'null'::jsonb then v_fallas := v_fallas || 'TC-15: la firma abre sin configuración ni aprobaciones'::text; else v_ok := v_ok + 1; end if;

    v_r := public.v2_public_visoria_reserve(v_club, v_slug,
      '{"firstName":"Qaniño","lastName":"Prueba Uno","birthDate":"2015-03-02","sex":"M","type":"player","foot":"right","school":"Escuela QA"}',
      '{"name":"Mamá QA","phone":"4771112233","channel":"Instagram","relationship":"madre"}', '{"nombre":"Abuela QA","telefono":"4774445566"}', 'Mamá o abuela');
    v_tok := v_r->>'token'; v_pid := (v_r->>'id')::uuid;
    v_r := public.v2_public_visoria_reserve(v_club, v_slug,
      '{"firstName":"Qaniña","lastName":"Prueba Dos","birthDate":"2014-05-06","sex":"F","type":"player","foot":"left","school":"Escuela QA"}',
      '{"name":"Papá QA","phone":"4771119999","channel":"WhatsApp","relationship":"padre"}', '{"nombre":"Tío QA","telefono":"4778887777"}', null);
    v_tok2 := v_r->>'token'; v_pid2 := (v_r->>'id')::uuid;
    if v_tok !~ '^[0-9a-f]{48}$' or v_tok2 !~ '^[0-9a-f]{48}$' then v_fallas := v_fallas || 'Apartar: no regresó la liga de la familia'::text; else v_ok := v_ok + 1; end if;

    -- Sin aprobaciones no se firma (TC-15).
    v_res := public.v2_public_visoria_sign(v_club, v_tok, jsonb_build_object('idempotencyKey', 'qa-cerrada-0000000001'));
    if coalesce(v_res->>'error', '') not like '%Signing closed%' then v_fallas := v_fallas || ('TC-15: firmó con el evento sin aprobar: ' || v_res::text); else v_ok := v_ok + 1; end if;

    -- Operaciones no puede aprobar; Presidencia sí, pero no con campos vacíos.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_ops, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.v2_visoria_approve(v_org, v_c, 'legal', 'Intento de aprobación sin permiso');
      v_fallas := v_fallas || 'Aprobación: Operaciones pudo aprobar'::text;
    exception when others then v_ok := v_ok + 1; end;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.v2_visoria_approve(v_org, v_c, 'legal', 'Revisado por abogado de QA el 29/10/2026');
      v_fallas := v_fallas || 'Aprobación: se aprobó con la configuración legal incompleta'::text;
    exception when others then v_ok := v_ok + 1; end;
    -- Seguro sin verificar: no abre aunque lo demás esté.
    perform public.v2_visoria_setup_update(v_org, v_c, jsonb_build_object('legal', v_legal));
    begin
      perform public.v2_visoria_approve(v_org, v_c, 'legal', 'Revisado por abogado de QA el 29/10/2026');
      v_fallas := v_fallas || 'Seguro: se aprobó sin verificar el estado real del seguro'::text;
    exception when others then v_ok := v_ok + 1; end;
    perform public.v2_visoria_setup_update(v_org, v_c, '{"insurance":"sin_seguro_verificado"}');
    perform public.v2_visoria_approve(v_org, v_c, 'legal', 'Revisado por abogado de QA el 29/10/2026');
    perform public.v2_visoria_approve(v_org, v_c, 'operativa', 'Cancha, botiquín y staff revisados por QA');
    perform public.v2_visoria_approve(v_org, v_c, 'seguridad', 'Roles y archivos revisados por QA hoy');

    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    v_ctx := public.v2_public_visoria_sign_context(v_club, v_tok);
    if not (v_ctx->>'signingOpen')::boolean then v_fallas := v_fallas || ('Aprobado: la firma no abrió: ' || coalesce(v_ctx::text, '')); end if;
    if (v_ctx->'legal'->'consent'->>'body') !~ 'ESTA VISORÍA NO INCLUYE SEGURO' or (v_ctx->'legal'->'consent'->>'body') ~ '\{\{(organizador|sede|seccion)'
      then v_fallas := v_fallas || 'Texto: el consentimiento aprobado no trae el aviso de seguro o quedó un campo sin llenar'::text; else v_ok := v_ok + 1; end if;

    v_base := jsonb_build_object(
      'eventHash', v_ctx->'legal'->>'eventHash', 'consentDocumentId', v_ctx->'legal'->'consent'->>'id', 'privacyDocumentId', v_ctx->'legal'->'privacy'->>'id',
      'signer', jsonb_build_object('name', 'Mamá QA Prueba', 'relationship', 'madre', 'phone', '4771112233'),
      'emergencia', jsonb_build_object('nombre', 'Abuela QA', 'telefono', '4774445566'),
      'salud', jsonb_build_object('condicion', jsonb_build_object('respuesta', 'ninguna'), 'alergias', jsonb_build_object('respuesta', 'ninguna'),
                                  'restriccion', jsonb_build_object('respuesta', 'ninguna'), 'atencion', jsonb_build_object('respuesta', 'ninguna')),
      'choices', jsonb_build_object('accept_participation', '{"value":true}'::jsonb, 'ack_no_insurance', '{"value":true}'::jsonb,
        'ack_health_and_emergency', '{"value":true}'::jsonb, 'consent_sensitive_data', '{"value":true}'::jsonb,
        'guardian_authority', '{"value":true}'::jsonb, 'media_publication', '{"value":false}'::jsonb),
      'firma', jsonb_build_object('imagen', v_firma, 'puntos', 80, 'ancho', 300, 'alto', 90, 'trazos', 3));

    -- TC-01 / TC-05: participación sin aceptar, mandada directo a la API.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc01-000000000001',
      'choices', (v_base->'choices') || '{"accept_participation":{"value":false}}'));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-01/05: firmó sin aceptar la participación'::text; else v_ok := v_ok + 1; end if;
    -- TC-02: sin reconocer que no hay seguro.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc02-000000000001',
      'choices', (v_base->'choices') - 'ack_no_insurance'));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-02: firmó sin reconocer la ausencia de seguro'::text; else v_ok := v_ok + 1; end if;
    -- TC-03: sin consentimiento de datos sensibles no se guarda salud.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc03-000000000001',
      'choices', (v_base->'choices') || '{"consent_sensitive_data":{"value":false}}',
      'salud', (v_base->'salud') || '{"alergias":{"respuesta":"si","detalle":"Penicilina"}}'));
    perform set_config('role', 'postgres', true);
    select count(*) into v_n from app.visoria_health where prospect_id = v_pid;
    if v_res->>'error' is null or v_n > 0 then v_fallas := v_fallas || 'TC-03: guardó salud sin consentimiento expreso'::text; else v_ok := v_ok + 1; end if;
    perform set_config('role', 'anon', true);
    -- TC-04: firma en blanco.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc04-000000000001',
      'firma', jsonb_build_object('imagen', 'data:image/png;base64,AAAA', 'puntos', 0, 'ancho', 0, 'alto', 0)));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-04: aceptó una firma en blanco'::text; else v_ok := v_ok + 1; end if;
    -- TC-06 (imagen) obligatoria de contestar, pero el "no" no bloquea.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc06-000000000001',
      'choices', (v_base->'choices') - 'media_publication'));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-06: firmó sin contestar lo de fotos (no hay valor por defecto)'::text; else v_ok := v_ok + 1; end if;
    -- TC-11: versión vieja del documento.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-tc11-000000000001', 'eventHash', repeat('0', 64)));
    if coalesce(v_res->>'error', '') not like '%Document version changed%' then v_fallas := v_fallas || 'TC-11: firmó una versión que no es la vigente'::text; else v_ok := v_ok + 1; end if;
    -- Liga inventada.
    v_res := public.v2_public_visoria_sign(v_club, repeat('a', 48), v_base || jsonb_build_object('idempotencyKey', 'qa-liga-000000000001'));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-16: firmó con una liga que no existe'::text; else v_ok := v_ok + 1; end if;

    -- La firma buena.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-buena-00000000001'));
    v_k1 := (v_res->>'consentId')::uuid;
    if v_k1 is null then v_fallas := v_fallas || ('Firma válida rechazada: ' || v_res::text); else v_ok := v_ok + 1; end if;
    -- TC-13: doble toque.
    v_res := public.v2_public_visoria_sign(v_club, v_tok, v_base || jsonb_build_object('idempotencyKey', 'qa-buena-00000000001'));
    perform set_config('role', 'postgres', true);
    select count(*) into v_n from app.visoria_consents where prospect_id = v_pid;
    if (v_res->>'consentId')::uuid is distinct from v_k1 or v_n <> 1 then v_fallas := v_fallas || 'TC-13: el doble envío creó dos consentimientos'::text; else v_ok := v_ok + 1; end if;
    -- TC-06: dijo que no a fotos -> no hay permiso, y sí participa (sigue el flujo).
    if (select image_consent from app.prospects where id = v_pid) or not exists (select 1 from app.visoria_media_history where prospect_id = v_pid and decision = 'negada')
      then v_fallas := v_fallas || 'TC-06: la negativa de imagen no quedó registrada'::text; else v_ok := v_ok + 1; end if;
    -- TC-16: la llave de la familia 1 con la liga de la familia 2.
    perform set_config('role', 'anon', true);
    v_res := public.v2_public_visoria_sign(v_club, v_tok2, v_base || jsonb_build_object('idempotencyKey', 'qa-buena-00000000001'));
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-16: una liga ajena pudo tomar el consentimiento de otro niño'::text; else v_ok := v_ok + 1; end if;

    -- TC-14: sin expediente (PDF) no está autorizado.
    perform set_config('role', 'postgres', true);
    if private.visoria_acceso(v_c, v_pid)->>'status' <> 'PENDIENTE' then v_fallas := v_fallas || 'TC-14: autorizado sin expediente generado'::text; else v_ok := v_ok + 1; end if;
    -- Inmutable (TC-18).
    begin
      update app.visoria_consents set consent_text = 'otro texto' where id = v_k1;
      v_fallas := v_fallas || 'TC-18: se pudo reescribir el texto firmado'::text;
    exception when others then v_ok := v_ok + 1; end;
    begin
      update app.visoria_audit set reason = 'x' where consent_id = v_k1;
      v_fallas := v_fallas || 'Bitácora: se pudo reescribir'::text;
    exception when others then v_ok := v_ok + 1; end;
    select consent_text, consent_text_hash into v_txt, v_hash from app.visoria_consents where id = v_k1;
    if private.visoria_sha(v_txt) <> v_hash or v_txt !~ 'Mamá QA Prueba' or v_txt !~ 'Qaniño Prueba Uno' then
      v_fallas := v_fallas || 'TC-18: el texto firmado no corresponde a su hash o no trae firmante y menor'::text; else v_ok := v_ok + 1; end if;

    -- La función del expediente adjunta el PDF; luego hay que verificar identidad.
    perform public.v2_visoria_artifact_attach(v_k1, 'organizations/qa/expediente.pdf', repeat('a', 64), 'qa');
    if private.visoria_acceso(v_c, v_pid)->>'status' <> 'PENDIENTE' then v_fallas := v_fallas || 'Identidad: autorizado sin verificar a quien firmó'::text; else v_ok := v_ok + 1; end if;
    -- TC-10: el PDF con la liga de otra familia.
    v_res := public.v2_visoria_artifact_access(v_k1, v_tok2, null, 'copia');
    if (v_res->>'ok')::boolean then v_fallas := v_fallas || 'TC-10: una familia pudo pedir el expediente de otra'::text; else v_ok := v_ok + 1; end if;
    v_res := public.v2_visoria_artifact_access(v_k1, v_tok, null, 'copia');
    if not (v_res->>'ok')::boolean then v_fallas := v_fallas || 'Copia: la familia no pudo pedir su propio expediente'::text; end if;

    -- Operaciones verifica identidad y queda autorizado; pero no ve la salud.
    perform set_config('request.jwt.claims', json_build_object('sub', v_ops, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.v2_visoria_verify(v_org, v_k1, 'presencial_identificacion', 'Identificación vista en la entrada');
    v_res := public.v2_visoria_health(v_org, v_k1, 'Curiosidad');
    if coalesce(v_res->>'error', '') <> 'Not authorized' then v_fallas := v_fallas || 'TC-09: Operaciones abrió la ficha de salud'::text; else v_ok := v_ok + 1; end if;
    -- TC-08: no hay evaluador ni autorización: no se transfiere nada.
    v_res := public.v2_visoria_transfer(v_org, v_pid);
    if v_res->>'error' is null then v_fallas := v_fallas || 'TC-08: transfirió datos sin autorización'::text; else v_ok := v_ok + 1; end if;
    perform set_config('role', 'postgres', true);
    if not exists (select 1 from app.visoria_audit where consent_id = v_k1 and action = 'salud_consultada' and result = 'rechazado') then
      v_fallas := v_fallas || 'TC-09: el intento de ver salud no quedó en la bitácora'::text; else v_ok := v_ok + 1; end if;
    if private.visoria_acceso(v_c, v_pid)->>'status' <> 'AUTORIZADO' then v_fallas := v_fallas || ('Autorizado: con todo en orden no quedó autorizado: ' || (private.visoria_acceso(v_c, v_pid))::text); else v_ok := v_ok + 1; end if;

    -- Familia 2: alergia -> revisión médica; fotos sí y luego las revoca (TC-07).
    perform set_config('role', 'anon', true);
    v_res := public.v2_public_visoria_sign(v_club, v_tok2, v_base || jsonb_build_object('idempotencyKey', 'qa-dos-0000000000001',
      'signer', jsonb_build_object('name', 'Papá QA Prueba', 'relationship', 'padre', 'phone', '4771119999'),
      'emergencia', jsonb_build_object('nombre', 'Tío QA', 'telefono', '4778887777'),
      'salud', (v_base->'salud') || '{"alergias":{"respuesta":"si","detalle":"Penicilina"}}',
      'choices', (v_base->'choices') || '{"media_publication":{"value":true}}'));
    v_k2 := (v_res->>'consentId')::uuid;
    perform public.v2_public_visoria_media_revoke(v_club, v_tok2);
    perform set_config('role', 'postgres', true);
    perform public.v2_visoria_artifact_attach(v_k2, 'organizations/qa/expediente2.pdf', repeat('b', 64), 'qa');
    if v_k2 is null or private.visoria_acceso(v_c, v_pid2)->>'status' <> 'REVISION_MEDICA' then v_fallas := v_fallas || 'Salud: una alergia no mandó a revisión médica'::text; else v_ok := v_ok + 1; end if;
    if (select image_consent from app.prospects where id = v_pid2)
       or (select count(*) from app.visoria_media_history where prospect_id = v_pid2 and decision in ('otorgada', 'revocada')) <> 2 then
      v_fallas := v_fallas || 'TC-07: la revocación de imagen no detuvo el permiso o no quedó en la historia'::text; else v_ok := v_ok + 1; end if;
    -- Presidencia (salud) sí la ve y la resuelve.
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_res := public.v2_visoria_health(v_org, v_k2, 'Revisión médica previa al evento');
    if v_res->'answers'->'alergias'->>'detalle' <> 'Penicilina' then v_fallas := v_fallas || 'Salud: Presidencia no pudo ver la ficha'::text; else v_ok := v_ok + 1; end if;
    perform public.v2_visoria_health_review(v_org, v_k2, 'apto', 'Puede participar; llevar su medicamento');
    perform public.v2_visoria_verify(v_org, v_k2, 'whatsapp_club', 'El pase llegó del WhatsApp registrado');

    -- El visor ve sólo AUTORIZADO / NO_AUTORIZADO, sin contacto ni salud.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_scout, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_visoria_board(v_org, v_slug);
    if exists (select 1 from jsonb_array_elements(v_r->'items') x where x ? 'phone' or x ? 'emergencia' or x ? 'salud' or x->'access' ? 'reason')
      then v_fallas := v_fallas || 'Visor: el tablero le manda contacto, salud o motivos'::text; else v_ok := v_ok + 1; end if;

    -- TC-12: cambia la sede -> lo firmado ya no autoriza y la firma se cierra.
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_r := public.v2_visoria_setup_update(v_org, v_c, '{"location":"Otra cancha QA, León, Gto."}');
    perform set_config('role', 'postgres', true);
    if not (v_r->>'materialChange')::boolean or private.visoria_acceso(v_c, v_pid)->>'status' <> 'SIN_CONSENTIMIENTO'
       or jsonb_array_length(private.visoria_faltantes(v_c)) = 0 then
      v_fallas := v_fallas || 'TC-12: cambió la sede y lo firmado siguió autorizando'::text; else v_ok := v_ok + 1; end if;
    -- TC-18: lo firmado conserva su texto y su hash tras el cambio.
    if (select consent_text_hash from app.visoria_consents where id = v_k1) <> v_hash then v_fallas := v_fallas || 'TC-18: cambió el expediente anterior'::text; else v_ok := v_ok + 1; end if;

    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);

  if array_length(v_fallas, 1) > 0 then
    raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok;
  end if;
  raise notice 'PRUEBA OK · 12 · % comprobaciones de la visoría: sin consentimiento válido, verificado y con expediente nadie queda autorizado', v_ok;
end $$;
