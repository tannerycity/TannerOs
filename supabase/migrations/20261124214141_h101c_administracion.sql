-- ======================================================= administración ====

create or replace function private.live_panel(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s app.live_settings;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  select * into s from app.live_settings where organization_id = p_org;
  return jsonb_build_object(
    'ajustes', jsonb_build_object('pausado', coalesce(s.paused, false), 'pausa_motivo', s.paused_reason, 'pausado_al', s.paused_at,
                                  'gateway', s.gateway_base_url, 'ticket_seg', coalesce(s.ticket_ttl_seconds, 120),
                                  'sesion_min', coalesce(s.session_max_minutes, 90), 'terminos_version', coalesce(s.terms_version, 1)),
    'presidencia', private.is_presidency(p_org),
    'grabadores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre', r.label, 'tipo', r.device_type, 'modelo', r.model, 'firmware', r.firmware,
        'ip', host(r.local_ip), 'puerto', r.rtsp_port, 'canales', r.channels_total, 'codec', r.codec,
        'substream', r.substream_available, 'notas', r.notes, 'conectividad', r.connectivity, 'revisado_al', r.last_check_at) order by r.created_at)
      from app.live_recorders r where r.organization_id = p_org and r.archived_at is null), '[]'::jsonb),
    'camaras', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'grabador', c.recorder_id, 'nombre', c.name, 'cancha', c.venue_label, 'canal', c.channel,
        'perfil', c.stream_profile, 'codec', c.codec, 'resolucion', c.resolution, 'ruta', c.gateway_path,
        'activa', c.enabled, 'sensible', c.sensitive, 'audio', c.audio_enabled,
        'consentimiento_al', c.consent_reviewed_at, 'estado', c.stream_state, 'estado_al', c.state_reported_at,
        'error', c.last_error,
        'categorias', coalesce((select jsonb_agg(a.value order by a.value) from app.live_camera_audience a where a.camera_id = c.id and a.kind = 'categoria'), '[]'::jsonb),
        'roles', coalesce((select jsonb_agg(a.value order by a.value) from app.live_camera_audience a where a.camera_id = c.id and a.kind = 'rol'), '[]'::jsonb),
        'horario', coalesce((select jsonb_agg(jsonb_build_object('dia', w.weekday, 'de', to_char(w.start_time, 'HH24:MI'), 'a', to_char(w.end_time, 'HH24:MI')) order by w.weekday, w.start_time)
                               from app.live_camera_windows w where w.camera_id = c.id), '[]'::jsonb),
        'viendo', (select count(*) from app.live_tickets t where t.camera_id = c.id and t.revoked_at is null and t.used_at is not null and t.session_expires_at > now()))
        order by c.name)
      from app.live_cameras c where c.organization_id = p_org and c.archived_at is null), '[]'::jsonb),
    'transmisiones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'camara_id', b.camera_id, 'camara', cam.name, 'modo', b.mode, 'titulo', b.title, 'enlace', b.link_token,
        'desde', b.started_at, 'termina', b.ends_at,
        'viendo', (select count(*) from app.live_tickets t where t.broadcast_id = b.id and t.revoked_at is null and t.used_at is not null and t.session_expires_at > now()))
        order by b.started_at desc)
      from app.live_broadcasts b join app.live_cameras cam on cam.id = b.camera_id
      where b.organization_id = p_org and b.stopped_at is null and now() < b.ends_at), '[]'::jsonb),
    'bloqueos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'tutor', nullif(concat_ws(' ', g.first_name, g.last_name), ''), 'camara', cam.name,
        'motivo', b.reason, 'desde', b.created_at) order by b.created_at desc)
      from app.live_access_blocks b left join app.guardians g on g.id = b.guardian_id left join app.live_cameras cam on cam.id = b.camera_id
      where b.organization_id = p_org and b.lifted_at is null), '[]'::jsonb),
    'diagnosticos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'grabador', d.recorder_id, 'camara', d.camera_id, 'prueba', d.check_kind, 'resultado', d.result,
        'fuente', d.source, 'detalle', d.detail, 'latencia_ms', d.latency_ms, 'al', d.occurred_at) order by d.occurred_at desc)
      from (select * from app.live_diagnostics x where x.organization_id = p_org order by x.occurred_at desc limit 40) d), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(distinct p.category order by p.category) from app.players p
                             where p.organization_id = p_org and p.archived_at is null and nullif(btrim(p.category), '') is not null), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(distinct m.role order by m.role) from public.organization_memberships m
                        where m.organization_id = p_org and m.active), '[]'::jsonb));
end $$;

create or replace function private.live_guardar_grabador(p_org uuid, d jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid := nullif(d->>'id', '')::uuid; v_ip inet;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  v_ip := nullif(btrim(coalesce(d->>'ip', '')), '')::inet;
  if v_id is null then
    insert into app.live_recorders(organization_id, label, device_type, model, firmware, local_ip, rtsp_port, channels_total, codec, substream_available, notes, created_by)
    values (p_org, btrim(d->>'nombre'), coalesce(nullif(d->>'tipo', ''), 'desconocido'), nullif(btrim(d->>'modelo'), ''), nullif(btrim(d->>'firmware'), ''),
            v_ip, coalesce(nullif(d->>'puerto', '')::int, 554), nullif(d->>'canales', '')::smallint,
            coalesce(nullif(d->>'codec', ''), 'desconocido'), (d->>'substream')::boolean, nullif(btrim(d->>'notas'), ''), (select auth.uid()))
    returning id into v_id;
    perform private.live_audita(p_org, 'grabador_creado', 'live_recorder', v_id, jsonb_build_object('tipo', d->>'tipo', 'modelo', d->>'modelo'));
  else
    update app.live_recorders set label = btrim(d->>'nombre'), device_type = coalesce(nullif(d->>'tipo', ''), 'desconocido'),
           model = nullif(btrim(d->>'modelo'), ''), firmware = nullif(btrim(d->>'firmware'), ''), local_ip = v_ip,
           rtsp_port = coalesce(nullif(d->>'puerto', '')::int, 554), channels_total = nullif(d->>'canales', '')::smallint,
           codec = coalesce(nullif(d->>'codec', ''), 'desconocido'), substream_available = (d->>'substream')::boolean,
           notes = nullif(btrim(d->>'notas'), ''), updated_at = now()
     where id = v_id and organization_id = p_org and archived_at is null;
    if not found then raise exception 'Recorder not found'; end if;
    perform private.live_audita(p_org, 'grabador_editado', 'live_recorder', v_id, jsonb_build_object('tipo', d->>'tipo', 'modelo', d->>'modelo'));
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function private.live_guardar_camara(p_org uuid, d jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid := nullif(d->>'id', '')::uuid;
  v_rec uuid := nullif(d->>'grabador', '')::uuid;
  v_antes text[]; v_despues text[]; v_apagada boolean := false; w jsonb;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if v_rec is not null and not exists (select 1 from app.live_recorders r where r.id = v_rec and r.organization_id = p_org) then
    raise exception 'Recorder not found';
  end if;
  if coalesce((d->>'audio')::boolean, false) and not private.is_presidency(p_org) then
    raise exception 'Only Presidencia can enable audio';
  end if;
  if v_id is null then
    insert into app.live_cameras(organization_id, recorder_id, name, venue_label, channel, stream_profile, codec, resolution, gateway_path, sensitive, audio_enabled, created_by)
    values (p_org, v_rec, btrim(d->>'nombre'), nullif(btrim(d->>'cancha'), ''), nullif(d->>'canal', '')::smallint,
            coalesce(nullif(d->>'perfil', ''), 'sub'), coalesce(nullif(d->>'codec', ''), 'desconocido'), nullif(btrim(d->>'resolucion'), ''),
            nullif(lower(btrim(d->>'ruta')), ''), coalesce((d->>'sensible')::boolean, false), coalesce((d->>'audio')::boolean, false), (select auth.uid()))
    returning id into v_id;
  else
    select coalesce(array_agg(a.kind || ':' || a.value order by a.kind, a.value), '{}') into v_antes from app.live_camera_audience a where a.camera_id = v_id;
    update app.live_cameras set recorder_id = v_rec, name = btrim(d->>'nombre'), venue_label = nullif(btrim(d->>'cancha'), ''),
           channel = nullif(d->>'canal', '')::smallint, stream_profile = coalesce(nullif(d->>'perfil', ''), 'sub'),
           codec = coalesce(nullif(d->>'codec', ''), 'desconocido'), resolution = nullif(btrim(d->>'resolucion'), ''),
           gateway_path = nullif(lower(btrim(d->>'ruta')), ''), sensitive = coalesce((d->>'sensible')::boolean, false),
           enabled = case when coalesce((d->>'sensible')::boolean, false) then false else enabled end,
           audio_enabled = coalesce((d->>'audio')::boolean, false), updated_at = now()
     where id = v_id and organization_id = p_org and archived_at is null;
    if not found then raise exception 'Camera not found'; end if;
  end if;

  delete from app.live_camera_audience where camera_id = v_id;
  insert into app.live_camera_audience(camera_id, organization_id, kind, value)
  select distinct v_id, p_org, 'categoria', btrim(x) from jsonb_array_elements_text(coalesce(d->'categorias', '[]'::jsonb)) x where btrim(x) <> ''
  union
  select distinct v_id, p_org, 'rol', btrim(x) from jsonb_array_elements_text(coalesce(d->'roles', '[]'::jsonb)) x where btrim(x) <> '';

  delete from app.live_camera_windows where camera_id = v_id;
  for w in select * from jsonb_array_elements(coalesce(d->'horario', '[]'::jsonb)) loop
    insert into app.live_camera_windows(camera_id, organization_id, weekday, start_time, end_time)
    values (v_id, p_org, (w->>'dia')::smallint, (w->>'de')::time, (w->>'a')::time);
  end loop;

  -- Si cambió quién ve, la revisión de permisos de imagen ya no vale: se
  -- apaga y hay que volver a revisar antes de encenderla.
  select coalesce(array_agg(a.kind || ':' || a.value order by a.kind, a.value), '{}') into v_despues from app.live_camera_audience a where a.camera_id = v_id;
  if v_antes is not null and v_antes is distinct from v_despues then
    update app.live_cameras set consent_reviewed_at = null, consent_reviewed_by = null,
           enabled = false where id = v_id and (enabled or consent_reviewed_at is not null)
    returning true into v_apagada;
    if coalesce(v_apagada, false) then perform private.live_revoca_tickets(p_org, v_id, null, 'cambio de audiencia'); end if;
  end if;
  perform private.live_audita(p_org, case when v_antes is null then 'camara_creada' else 'camara_editada' end, 'live_camera', v_id,
    jsonb_build_object('audiencia', v_despues, 'apagada_por_cambio', coalesce(v_apagada, false)));
  return jsonb_build_object('ok', true, 'id', v_id, 'apagada_por_cambio', coalesce(v_apagada, false));
end $$;

-- Cuántos menores de la audiencia no tienen permiso de imagen. Quien encienda
-- la cámara lo ve antes, y queda en la bitácora con los números.
create or replace function private.live_revisar_consentimiento(p_org uuid, p_camera uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.live_cameras c where c.id = p_camera and c.organization_id = p_org and c.archived_at is null) then raise exception 'Camera not found'; end if;
  select jsonb_build_object(
      'jugadores', count(*),
      'sin_permiso', count(*) filter (where not coalesce(p.image_consent, false)))
    into r
    from app.players p
    join app.live_camera_audience a on a.camera_id = p_camera and a.kind = 'categoria' and lower(btrim(a.value)) = lower(btrim(p.category))
   where p.organization_id = p_org and p.archived_at is null;
  update app.live_cameras set consent_reviewed_at = now(), consent_reviewed_by = (select auth.uid()) where id = p_camera;
  perform private.live_audita(p_org, 'consentimiento_revisado', 'live_camera', p_camera, r);
  return r || jsonb_build_object('ok', true);
end $$;

create or replace function private.live_activar(p_org uuid, p_camera uuid, p_activa boolean, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c app.live_cameras; v_sin integer; v_n integer;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  select * into c from app.live_cameras where id = p_camera and organization_id = p_org and archived_at is null for update;
  if not found then raise exception 'Camera not found'; end if;
  if not p_activa then
    update app.live_cameras set enabled = false, updated_at = now() where id = p_camera;
    v_n := private.live_revoca_tickets(p_org, p_camera, null, 'transmisión apagada');
    perform private.live_audita(p_org, 'camara_apagada', 'live_camera', p_camera, jsonb_build_object('motivo', left(p_motivo, 300), 'sesiones_cortadas', v_n));
    return jsonb_build_object('ok', true, 'activa', false, 'sesiones_cortadas', v_n);
  end if;
  if c.sensitive then return jsonb_build_object('ok', false, 'motivo', 'sensible'); end if;
  if not exists (select 1 from app.live_camera_audience a where a.camera_id = p_camera) then return jsonb_build_object('ok', false, 'motivo', 'sin_audiencia'); end if;
  if not exists (select 1 from app.live_camera_windows w where w.camera_id = p_camera) then return jsonb_build_object('ok', false, 'motivo', 'sin_horario'); end if;
  if c.consent_reviewed_at is null or c.consent_reviewed_at < now() - interval '30 days' then return jsonb_build_object('ok', false, 'motivo', 'revisar_consentimiento'); end if;
  select count(*) filter (where not coalesce(p.image_consent, false)) into v_sin
    from app.players p join app.live_camera_audience a on a.camera_id = p_camera and a.kind = 'categoria' and lower(btrim(a.value)) = lower(btrim(p.category))
   where p.organization_id = p_org and p.archived_at is null;
  -- Con menores sin permiso de imagen en la audiencia, sólo Presidencia
  -- decide, y lo deja escrito.
  if v_sin > 0 and not private.is_presidency(p_org) then return jsonb_build_object('ok', false, 'motivo', 'consentimiento_incompleto', 'sin_permiso', v_sin); end if;
  if v_sin > 0 and length(btrim(coalesce(p_motivo, ''))) < 10 then return jsonb_build_object('ok', false, 'motivo', 'falta_justificacion', 'sin_permiso', v_sin); end if;
  update app.live_cameras set enabled = true, updated_at = now() where id = p_camera;
  perform private.live_audita(p_org, 'camara_encendida', 'live_camera', p_camera, jsonb_build_object('motivo', left(p_motivo, 300), 'sin_permiso', v_sin));
  return jsonb_build_object('ok', true, 'activa', true);
end $$;

create or replace function private.live_pausa(p_org uuid, p_pausar boolean, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_n integer := 0;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if p_pausar and length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Reason required'; end if;
  insert into app.live_settings(organization_id, paused, paused_reason, paused_at, paused_by)
  values (p_org, p_pausar, case when p_pausar then btrim(p_motivo) end, case when p_pausar then now() end, case when p_pausar then (select auth.uid()) end)
  on conflict (organization_id) do update set paused = excluded.paused, paused_reason = excluded.paused_reason,
     paused_at = excluded.paused_at, paused_by = excluded.paused_by, updated_at = now();
  if p_pausar then
    v_n := private.live_revoca_tickets(p_org, null, null, 'pausa general');
    update app.live_broadcasts set stopped_at = now(), stopped_by = (select auth.uid()), stop_reason = 'pausa general'
     where organization_id = p_org and stopped_at is null;
  end if;
  perform private.live_audita(p_org, case when p_pausar then 'pausa_general' else 'pausa_levantada' end, 'live_settings', null,
    jsonb_build_object('motivo', left(p_motivo, 300), 'sesiones_cortadas', v_n));
  return jsonb_build_object('ok', true, 'pausado', p_pausar, 'sesiones_cortadas', v_n);
end $$;

create or replace function private.live_ajustes(p_org uuid, d jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_gw text := nullif(lower(btrim(coalesce(d->>'gateway', ''))), '');
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  -- A dónde se manda a las familias por video lo decide sólo Presidencia.
  if (d ? 'gateway') and v_gw is distinct from (select gateway_base_url from app.live_settings where organization_id = p_org)
     and not private.is_presidency(p_org) then
    raise exception 'Only Presidencia can change the gateway';
  end if;
  insert into app.live_settings(organization_id, gateway_base_url, ticket_ttl_seconds, session_max_minutes, terms_version)
  values (p_org, v_gw, coalesce((d->>'ticket_seg')::int, 120), coalesce((d->>'sesion_min')::int, 90), coalesce((d->>'terminos_version')::int, 1))
  on conflict (organization_id) do update set
     gateway_base_url = case when d ? 'gateway' then v_gw else app.live_settings.gateway_base_url end,
     ticket_ttl_seconds = coalesce((d->>'ticket_seg')::int, app.live_settings.ticket_ttl_seconds),
     session_max_minutes = coalesce((d->>'sesion_min')::int, app.live_settings.session_max_minutes),
     terms_version = greatest(app.live_settings.terms_version, coalesce((d->>'terminos_version')::int, app.live_settings.terms_version)),
     updated_at = now();
  perform private.live_audita(p_org, 'ajustes', 'live_settings', null, d - 'secreto');
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.live_accesos(p_org uuid, p_camera uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s app.live_settings;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  select * into s from app.live_settings where organization_id = p_org;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'tutor_id', g.id, 'tutor', nullif(concat_ws(' ', g.first_name, g.last_name), ''),
      'telefono', case when length(g.phone) >= 4 then '··· ' || right(regexp_replace(g.phone, '[^0-9]', '', 'g'), 4) end,
      'con_cuenta', g.user_id is not null,
      'jugadores', (select jsonb_agg(concat_ws(' · ', p.first_name, p.category)) from app.player_guardians pg2 join app.players p on p.id = pg2.player_id
                     where pg2.guardian_id = g.id and p.archived_at is null),
      'reglas_aceptadas', exists (select 1 from app.live_viewer_terms t where t.organization_id = p_org and t.user_id = g.user_id and t.version = coalesce(s.terms_version, 1)),
      'bloqueado', exists (select 1 from app.live_access_blocks b where b.organization_id = p_org and b.lifted_at is null and b.guardian_id = g.id and (b.camera_id is null or b.camera_id = p_camera)))
      order by g.first_name, g.last_name)
    from app.guardians g
   where g.organization_id = p_org and coalesce(g.status, 'active') <> 'inactive'
     and exists (select 1 from app.player_guardians pg join app.players p on p.id = pg.player_id and p.archived_at is null
                   join app.live_camera_audience a on a.camera_id = p_camera and a.kind = 'categoria' and lower(btrim(a.value)) = lower(btrim(p.category))
                  where pg.guardian_id = g.id)), '[]'::jsonb);
end $$;

create or replace function private.live_bloquear(p_org uuid, p_guardian uuid, p_camera uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_user uuid; v_n integer;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  select g.user_id into v_user from app.guardians g where g.id = p_guardian and g.organization_id = p_org;
  if not found then raise exception 'Guardian not found'; end if;
  if p_camera is not null and not exists (select 1 from app.live_cameras c where c.id = p_camera and c.organization_id = p_org) then raise exception 'Camera not found'; end if;
  insert into app.live_access_blocks(organization_id, guardian_id, user_id, camera_id, reason, created_by)
  values (p_org, p_guardian, v_user, p_camera, btrim(p_motivo), (select auth.uid())) returning id into v_id;
  v_n := case when v_user is null then 0 else private.live_revoca_tickets(p_org, p_camera, v_user, 'acceso revocado') end;
  perform private.live_audita(p_org, 'acceso_revocado', 'live_block', v_id, jsonb_build_object('tutor', p_guardian, 'camara', p_camera, 'motivo', left(p_motivo, 300), 'sesiones_cortadas', v_n));
  return jsonb_build_object('ok', true, 'id', v_id, 'sesiones_cortadas', v_n);
end $$;

create or replace function private.live_desbloquear(p_org uuid, p_block uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  update app.live_access_blocks set lifted_at = now(), lifted_by = (select auth.uid())
   where id = p_block and organization_id = p_org and lifted_at is null;
  if not found then raise exception 'Block not found'; end if;
  perform private.live_audita(p_org, 'acceso_restituido', 'live_block', p_block, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.live_archivar(p_org uuid, p_tipo text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if p_tipo = 'camara' then
    update app.live_cameras set archived_at = now(), enabled = false, updated_at = now() where id = p_id and organization_id = p_org and archived_at is null;
    if not found then raise exception 'Camera not found'; end if;
    perform private.live_revoca_tickets(p_org, p_id, null, 'cámara archivada');
    update app.live_broadcasts set stopped_at = now(), stopped_by = (select auth.uid()), stop_reason = 'cámara archivada'
     where camera_id = p_id and stopped_at is null;
  elsif p_tipo = 'grabador' then
    update app.live_recorders set archived_at = now(), updated_at = now() where id = p_id and organization_id = p_org and archived_at is null;
    if not found then raise exception 'Recorder not found'; end if;
  else raise exception 'Invalid kind'; end if;
  perform private.live_audita(p_org, p_tipo || '_archivado', 'live_' || p_tipo, p_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- Una persona del club anota lo que comprobó a mano (p. ej. "VLC en la red
-- del parque mostró la cancha"). Queda como fuente 'admin', nunca como si lo
-- hubiera medido una máquina.
create or replace function private.live_prueba_manual(p_org uuid, p_recorder uuid, p_camera uuid, p_resultado text, p_nota text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_det jsonb;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if p_recorder is not null and not exists (select 1 from app.live_recorders r where r.id = p_recorder and r.organization_id = p_org) then raise exception 'Recorder not found'; end if;
  if p_camera is not null and not exists (select 1 from app.live_cameras c where c.id = p_camera and c.organization_id = p_org) then raise exception 'Camera not found'; end if;
  v_det := jsonb_strip_nulls(jsonb_build_object('nota', nullif(private.live_limpia(p_nota), ''),
             'codec', p_datos->>'codec', 'resolucion', p_datos->>'resolucion', 'substream', p_datos->'substream', 'herramienta', p_datos->>'herramienta'));
  insert into app.live_diagnostics(organization_id, recorder_id, camera_id, check_kind, result, source, detail, reported_by)
  values (p_org, p_recorder, p_camera, 'registro_manual', p_resultado, 'admin', v_det, (select auth.uid())) returning id into v_id;
  perform private.live_audita(p_org, 'prueba_manual', 'live_diagnostic', v_id, jsonb_build_object('resultado', p_resultado));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function private.live_bitacora(p_org uuid, p_limite integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('tipo', e.event_type, 'quien', e.actor_label, 'al', e.occurred_at,
                                                        'objeto', e.aggregate_type, 'datos', e.payload) order by e.occurred_at desc)
    from (select * from app.audit_events x where x.organization_id = p_org and x.event_type like 'live.%'
           order by x.occurred_at desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) e), '[]'::jsonb);
end $$;
