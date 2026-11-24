-- ================================================ botón "Transmitir" ====

-- ¿Se puede ver por enlace esta transmisión AHORA? 'ok' o el motivo.
create or replace function private.live_motivo_enlace(p_broadcast uuid)
returns text language plpgsql stable security definer set search_path to '' as $$
declare b app.live_broadcasts; c app.live_cameras;
begin
  select * into b from app.live_broadcasts where id = p_broadcast;
  if not found or b.mode <> 'enlace' then return 'no_existe'; end if;
  select * into c from app.live_cameras where id = b.camera_id;
  if c.archived_at is not null then return 'no_existe'; end if;
  if not private.module_enabled(b.organization_id, 'live') then return 'modulo_apagado'; end if;
  if b.stopped_at is not null or now() >= b.ends_at then return 'terminada'; end if;
  if c.sensitive then return 'sensible'; end if;
  if coalesce((select paused from app.live_settings where organization_id = b.organization_id), false) then return 'pausado'; end if;
  -- El candado de la academia: en su horario, esa cámara es sólo de familias.
  if private.live_fin_de_ventana(c.id) is not null then return 'horario_academia'; end if;
  return 'ok';
end $$;

create or replace function private.live_revoca_transmision(p_broadcast uuid, p_motivo text)
returns integer language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update app.live_tickets set revoked_at = now(), revoke_reason = left(p_motivo, 120)
   where broadcast_id = p_broadcast and revoked_at is null and session_expires_at > now();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.live_transmitir(p_org uuid, p_camera uuid, p_modo text, p_titulo text, p_minutos integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  c app.live_cameras; b app.live_broadcasts;
  v_fin timestamptz; v_prox timestamptz; v_token text; v_sin integer; v_recortada boolean := false;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  if p_modo not in ('enlace', 'familias') then raise exception 'Invalid mode'; end if;
  if p_minutos is null or p_minutos < 15 or p_minutos > 360 then raise exception 'Duration must be 15 to 360 minutes'; end if;
  select * into c from app.live_cameras where id = p_camera and organization_id = p_org and archived_at is null;
  if not found then raise exception 'Camera not found'; end if;
  if c.sensitive then return jsonb_build_object('ok', false, 'motivo', 'sensible'); end if;
  if coalesce((select paused from app.live_settings where organization_id = p_org), false) then return jsonb_build_object('ok', false, 'motivo', 'pausado'); end if;
  -- Si ya está transmitiendo, se regresa la misma (no se duplica).
  select * into b from app.live_broadcasts where camera_id = p_camera and stopped_at is null and now() < ends_at order by started_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'ya_estaba', true, 'id', b.id, 'modo', b.mode, 'enlace', b.link_token, 'termina', b.ends_at);
  end if;
  v_fin := now() + make_interval(mins => p_minutos);
  if p_modo = 'enlace' then
    if private.live_fin_de_ventana(c.id) is not null then return jsonb_build_object('ok', false, 'motivo', 'horario_academia'); end if;
    v_prox := private.live_proximo_inicio(c.id);
    if v_prox is not null and v_prox < v_fin then v_fin := v_prox; v_recortada := true; end if;
    if v_fin < now() + interval '5 minutes' then return jsonb_build_object('ok', false, 'motivo', 'horario_academia'); end if;
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
  else
    if not exists (select 1 from app.live_camera_audience a where a.camera_id = c.id) then return jsonb_build_object('ok', false, 'motivo', 'sin_audiencia'); end if;
    if c.consent_reviewed_at is null or c.consent_reviewed_at < now() - interval '30 days' then return jsonb_build_object('ok', false, 'motivo', 'revisar_consentimiento'); end if;
    select count(*) filter (where not coalesce(p.image_consent, false)) into v_sin
      from app.players p join app.live_camera_audience a on a.camera_id = c.id and a.kind = 'categoria' and lower(btrim(a.value)) = lower(btrim(p.category))
     where p.organization_id = p_org and p.archived_at is null;
    if v_sin > 0 and not private.is_presidency(p_org) then return jsonb_build_object('ok', false, 'motivo', 'consentimiento_incompleto', 'sin_permiso', v_sin); end if;
  end if;
  insert into app.live_broadcasts(organization_id, camera_id, mode, title, link_token, ends_at, created_by)
  values (p_org, c.id, p_modo, nullif(btrim(coalesce(p_titulo, '')), ''), v_token, v_fin, (select auth.uid()))
  returning * into b;
  perform private.live_audita(p_org, 'transmision_iniciada', 'live_broadcast', b.id,
    jsonb_build_object('camara', c.name, 'modo', p_modo, 'titulo', b.title, 'termina', v_fin, 'recortada_por_academia', v_recortada));
  return jsonb_build_object('ok', true, 'id', b.id, 'modo', b.mode, 'enlace', b.link_token, 'termina', b.ends_at, 'recortada_por_academia', v_recortada);
end $$;

create or replace function private.live_detener(p_org uuid, p_broadcast uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b app.live_broadcasts; v_n integer;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  update app.live_broadcasts set stopped_at = now(), stopped_by = (select auth.uid()), stop_reason = 'detenida'
   where id = p_broadcast and organization_id = p_org and stopped_at is null returning * into b;
  if not found then raise exception 'Broadcast not found'; end if;
  v_n := private.live_revoca_transmision(b.id, 'transmisión detenida');
  -- Familias fuera de su horario: al detener, se corta también a los tutores.
  if b.mode = 'familias' and private.live_fin_de_ventana(b.camera_id) is null then
    v_n := v_n + private.live_revoca_tickets(p_org, b.camera_id, null, 'transmisión detenida');
  end if;
  perform private.live_audita(p_org, 'transmision_detenida', 'live_broadcast', b.id, jsonb_build_object('sesiones_cortadas', v_n));
  return jsonb_build_object('ok', true, 'sesiones_cortadas', v_n);
end $$;

create or replace function private.live_nuevo_enlace(p_org uuid, p_broadcast uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_token text := encode(extensions.gen_random_bytes(16), 'hex'); v_n integer;
begin
  if not private.live_admin(p_org) then raise exception 'Not authorized'; end if;
  update app.live_broadcasts set link_token = v_token
   where id = p_broadcast and organization_id = p_org and mode = 'enlace' and stopped_at is null and now() < ends_at;
  if not found then raise exception 'Broadcast not found'; end if;
  v_n := private.live_revoca_transmision(p_broadcast, 'enlace cambiado');
  perform private.live_audita(p_org, 'enlace_cambiado', 'live_broadcast', p_broadcast, jsonb_build_object('sesiones_cortadas', v_n));
  return jsonb_build_object('ok', true, 'enlace', v_token, 'sesiones_cortadas', v_n);
end $$;

-- Quien abre el enlace (sin cuenta): qué es y si se puede ver.
create or replace function private.live_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare b app.live_broadcasts; c app.live_cameras; v_m text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select * into b from app.live_broadcasts where link_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  v_m := private.live_motivo_enlace(b.id);
  if v_m in ('no_existe', 'modulo_apagado', 'sensible') then return jsonb_build_object('ok', false, 'motivo', v_m); end if;
  select * into c from app.live_cameras where id = b.camera_id;
  return jsonb_build_object('ok', v_m = 'ok', 'motivo', v_m, 'titulo', coalesce(b.title, c.name), 'camara', c.name,
    'cancha', c.venue_label, 'termina', b.ends_at, 'estado', case when v_m = 'ok' then c.stream_state end);
end $$;

create or replace function private.live_publico_ticket(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b app.live_broadcasts; c app.live_cameras; s app.live_settings; v_m text; v_tk text; v_ses timestamptz; v_exp timestamptz; v_prox timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select * into b from app.live_broadcasts where link_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  v_m := private.live_motivo_enlace(b.id);
  if v_m <> 'ok' then return jsonb_build_object('ok', false, 'motivo', v_m); end if;
  select * into c from app.live_cameras where id = b.camera_id;
  select * into s from app.live_settings where organization_id = b.organization_id;
  if s.gateway_base_url is null or c.gateway_path is null then return jsonb_build_object('ok', false, 'motivo', 'sin_gateway'); end if;
  -- Tope de personas viendo a la vez, y freno a quien pide tickets sin parar.
  if (select count(*) from app.live_tickets t where t.broadcast_id = b.id and t.revoked_at is null and t.session_expires_at > now()
        and (t.used_at is not null or t.issued_at > now() - interval '2 minutes')) >= b.max_viewers then
    return jsonb_build_object('ok', false, 'motivo', 'lleno');
  end if;
  if (select count(*) from app.live_tickets t where t.broadcast_id = b.id and t.issued_at > now() - interval '1 minute') >= b.max_viewers + 20 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;
  v_tk := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(secs => coalesce(s.ticket_ttl_seconds, 120));
  v_ses := least(now() + make_interval(mins => coalesce(s.session_max_minutes, 90)), b.ends_at);
  v_prox := private.live_proximo_inicio(c.id);
  if v_prox is not null and v_prox < v_ses then v_ses := v_prox; end if;
  insert into app.live_tickets(organization_id, camera_id, user_id, broadcast_id, token_hash, expires_at, session_expires_at)
  values (b.organization_id, c.id, null, b.id, extensions.digest(v_tk, 'sha256'), v_exp, v_ses);
  return jsonb_build_object('ok', true, 'motivo', 'ok', 'ticket', v_tk, 'expira', v_exp, 'sesion_hasta', v_ses,
    'whep', s.gateway_base_url || '/' || c.gateway_path || '/whep',
    'hls', s.gateway_base_url || '/' || c.gateway_path || '/index.m3u8');
end $$;

-- ========================================== gateway y agente (service_role) ====
-- Los llama sólo una función de servidor con la llave de servicio, nunca el
-- navegador. Ver docs/tanner-live/gateway/.

create or replace function private.live_gateway_autoriza(p_token text, p_path text, p_accion text, p_ip text, p_sesion text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t record; v_motivo text; v_ip inet;
begin
  if p_accion is distinct from 'read' then return jsonb_build_object('ok', false, 'motivo', 'accion'); end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'motivo', 'ticket_invalido'); end if;
  select tk.*, c.gateway_path into t from app.live_tickets tk join app.live_cameras c on c.id = tk.camera_id
   where tk.token_hash = extensions.digest(p_token, 'sha256') for update of tk;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'ticket_invalido'); end if;
  if t.revoked_at is not null then return jsonb_build_object('ok', false, 'motivo', 'revocado'); end if;
  if t.gateway_path is distinct from p_path then return jsonb_build_object('ok', false, 'motivo', 'ruta'); end if;
  if now() > t.session_expires_at or (t.used_at is null and now() > t.expires_at) then return jsonb_build_object('ok', false, 'motivo', 'vencido'); end if;
  begin v_ip := nullif(p_ip, '')::inet; exception when others then v_ip := null; end;
  -- Un ticket es de un solo dispositivo: si ya se usó desde otra IP, no.
  if t.first_ip is not null and v_ip is not null and t.first_ip <> v_ip then return jsonb_build_object('ok', false, 'motivo', 'otro_dispositivo'); end if;
  -- Se vuelve a revisar TODO como si fuera esa persona: horario, pausa,
  -- bloqueo, permisos. Un ticket viejo no sobrevive a un cambio de reglas.
  if t.user_id is null then
    -- Ticket de un enlace: vale mientras la transmisión siga y no sea hora
    -- de la academia en esa cámara.
    v_motivo := private.live_motivo_enlace(t.broadcast_id);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', t.user_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', t.user_id::text, true);
    v_motivo := private.live_motivo(t.camera_id);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
  if v_motivo <> 'ok' then return jsonb_build_object('ok', false, 'motivo', v_motivo); end if;
  update app.live_tickets set used_at = coalesce(used_at, now()), first_ip = coalesce(first_ip, v_ip),
         gateway_session_id = coalesce(left(p_sesion, 120), gateway_session_id), last_seen_at = now()
   where id = t.id;
  return jsonb_build_object('ok', true, 'motivo', 'ok', 'expira', t.session_expires_at);
end $$;

-- Sesiones que el gateway debe cortar (revocadas o vencidas) desde p_desde.
create or replace function private.live_gateway_cortes(p_desde timestamptz)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sesion', t.gateway_session_id, 'motivo', coalesce(t.revoke_reason, 'vencido'))), '[]'::jsonb)
    from app.live_tickets t
   where t.gateway_session_id is not null
     and ((t.revoked_at is not null and t.revoked_at >= coalesce(p_desde, now() - interval '10 minutes'))
       or (t.session_expires_at <= now() and t.session_expires_at >= coalesce(p_desde, now() - interval '10 minutes')))
$$;

create or replace function private.live_gateway_estado(p_path text, p_estado text, p_error text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c app.live_cameras;
begin
  if p_estado not in ('offline', 'conectando', 'online', 'error') then raise exception 'Invalid state'; end if;
  update app.live_cameras set stream_state = p_estado, state_reported_at = now(),
         last_error = case when p_estado = 'error' then nullif(private.live_limpia(p_error), '') else null end
   where gateway_path = p_path and archived_at is null returning * into c;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'ruta'); end if;
  insert into app.live_diagnostics(organization_id, camera_id, check_kind, result, source, detail)
  values (c.organization_id, c.id, 'gateway_estado', case when p_estado in ('online', 'conectando') then 'ok' else 'falla' end, 'gateway',
          jsonb_strip_nulls(jsonb_build_object('estado', p_estado, 'error', nullif(private.live_limpia(p_error), ''))));
  return jsonb_build_object('ok', true);
end $$;

-- El agente dentro de la red del parque reporta una prueba. Sólo claves
-- conocidas pasan a `detail`; lo demás se descarta.
create or replace function private.live_agente_diagnostico(p_recorder uuid, p_camera uuid, p_prueba text, p_resultado text, p_datos jsonb, p_latencia integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_det jsonb;
begin
  select organization_id into v_org from app.live_recorders where id = p_recorder;
  if v_org is null then select organization_id into v_org from app.live_cameras where id = p_camera; end if;
  if v_org is null then raise exception 'Unknown device'; end if;
  if p_camera is not null and not exists (select 1 from app.live_cameras c where c.id = p_camera and c.organization_id = v_org) then raise exception 'Camera mismatch'; end if;
  v_det := jsonb_strip_nulls(jsonb_build_object(
    'codec', p_datos->>'codec', 'resolucion', p_datos->>'resolucion', 'fps', p_datos->'fps', 'substream', p_datos->'substream',
    'agente', p_datos->>'agente', 'error', nullif(private.live_limpia(p_datos->>'error'), '')));
  insert into app.live_diagnostics(organization_id, recorder_id, camera_id, check_kind, result, source, detail, latency_ms)
  values (v_org, p_recorder, p_camera, p_prueba, p_resultado, 'agente', v_det, p_latencia);
  if p_recorder is not null and p_prueba = 'tcp_rtsp' then
    update app.live_recorders set connectivity = case p_resultado when 'ok' then 'alcanzable' when 'falla' then 'inalcanzable'
                                                                 when 'tiempo_agotado' then 'inalcanzable' else 'error' end,
           last_check_at = now() where id = p_recorder;
  end if;
  return jsonb_build_object('ok', true);
end $$;
