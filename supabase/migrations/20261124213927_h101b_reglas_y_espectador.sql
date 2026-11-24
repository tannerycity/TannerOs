-- ============================================================ ayudantes ====

create or replace function private.live_tz(p_org uuid)
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select o.timezone from public.organizations o where o.id = p_org), 'America/Mexico_City')
$$;

create or replace function private.live_admin(p_org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select private.has_module_access(p_org, 'live', true)
$$;

-- Quita credenciales de cualquier texto antes de guardarlo o mostrarlo.
create or replace function private.live_limpia(p_txt text)
returns text language sql immutable set search_path to '' as $$
  -- 1) rtsp://usuario:clave@host -> rtsp://host
  -- 2) password=xxx / contraseña: xxx / token=xxx -> [dato oculto]
  -- 3) cualquier mención suelta de esas palabras -> [dato oculto]
  -- El resultado nunca choca con los checks *_sin_secretos de las tablas.
  select left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_txt,''),
           'rtsp://[^[:space:]@/]*@', 'rtsp://', 'gi'),
           '(password|passwd|contrase[^[:space:]=:]*|token)[[:space:]]*[=:][[:space:]]*[^[:space:]&]+', '[dato oculto]', 'gi'),
           '(password|passwd|contrase[^[:space:]=:]*|token)', '[dato oculto]', 'gi'), 300)
$$;

create or replace function private.live_audita(p_org uuid, p_tipo text, p_agregado text, p_id uuid, p_payload jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into app.audit_events(organization_id, actor_user_id, actor_label, event_type, aggregate_type, aggregate_id, payload)
  values (p_org, (select auth.uid()),
          (select p.display_name from public.profiles p where p.user_id = (select auth.uid())),
          'live.' || p_tipo, p_agregado, p_id::text, coalesce(p_payload, '{}'::jsonb))
$$;

-- Organización del que llama: la que pide (si es staff de ella) o la de su
-- cuenta de tutor.
create or replace function private.live_org_de(p_org uuid)
returns uuid language plpgsql stable security definer set search_path to '' as $$
declare v uuid;
begin
  if p_org is not null and private.has_module_access(p_org, 'live', false) then return p_org; end if;
  select g.organization_id into v from app.guardians g
   where g.user_id = (select auth.uid()) and coalesce(g.status, 'active') <> 'inactive'
     and (p_org is null or g.organization_id = p_org)
   limit 1;
  return v;
end $$;

-- Fin de la ventana de horario vigente (hoy), en timestamptz. null si no hay.
create or replace function private.live_fin_de_ventana(p_camera uuid)
returns timestamptz language sql stable security definer set search_path to '' as $$
  select min(((now() at time zone private.live_tz(w.organization_id))::date + w.end_time) at time zone private.live_tz(w.organization_id))
    from app.live_camera_windows w
   where w.camera_id = p_camera
     and w.weekday = extract(isodow from now() at time zone private.live_tz(w.organization_id))
     and (now() at time zone private.live_tz(w.organization_id))::time >= w.start_time
     and (now() at time zone private.live_tz(w.organization_id))::time < w.end_time
$$;

-- Transmisión "familias" activa en la cámara (botón Transmitir).
create or replace function private.live_familias_activa(p_camera uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from app.live_broadcasts b where b.camera_id = p_camera and b.mode = 'familias'
                    and b.stopped_at is null and now() < b.ends_at)
$$;

-- Siguiente inicio del horario de la academia en esa cámara (hoy o mañana),
-- para que una transmisión por enlace se apague sola antes de que empiece.
create or replace function private.live_proximo_inicio(p_camera uuid)
returns timestamptz language plpgsql stable security definer set search_path to '' as $$
declare v_tz text; v_dia date; v_min timestamptz; v_t timestamptz; w record;
begin
  select private.live_tz(c.organization_id) into v_tz from app.live_cameras c where c.id = p_camera;
  if v_tz is null then return null; end if;
  for k in 0..1 loop
    v_dia := (now() at time zone v_tz)::date + k;
    for w in select x.start_time from app.live_camera_windows x where x.camera_id = p_camera and x.weekday = extract(isodow from v_dia) loop
      v_t := (v_dia + w.start_time) at time zone v_tz;
      if v_t > now() and (v_min is null or v_t < v_min) then v_min := v_t; end if;
    end loop;
  end loop;
  return v_min;
end $$;

-- LA regla. Devuelve 'ok' o el motivo por el que el usuario actual no puede
-- ver esa cámara ahora. Todo lo demás (listas, tickets, gateway) la usa.
create or replace function private.live_motivo(p_camera uuid)
returns text language plpgsql stable security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  c app.live_cameras;
  s app.live_settings;
  v_staff boolean; v_admin boolean; v_guardian uuid;
  v_aud boolean := false;
  v_fam boolean;
begin
  if v_uid is null then return 'sin_sesion'; end if;
  select * into c from app.live_cameras where id = p_camera;
  if not found or c.archived_at is not null then return 'no_existe'; end if;
  if not private.module_enabled(c.organization_id, 'live') then return 'modulo_apagado'; end if;

  v_staff := private.has_module_access(c.organization_id, 'live', false);
  v_admin := private.has_module_access(c.organization_id, 'live', true);
  select g.id into v_guardian from app.guardians g
   where g.user_id = v_uid and g.organization_id = c.organization_id and coalesce(g.status, 'active') <> 'inactive' limit 1;
  -- A un extraño ni siquiera se le confirma que la cámara existe.
  if not v_staff and v_guardian is null then return 'no_existe'; end if;

  if c.sensitive then return 'sensible'; end if;
  select * into s from app.live_settings where organization_id = c.organization_id;
  if coalesce(s.paused, false) then return 'pausado'; end if;
  v_fam := private.live_familias_activa(c.id);
  -- "Transmitir" en modo familias vale como encendida y en horario.
  if not c.enabled and not v_fam then return 'desactivada'; end if;

  if v_admin then v_aud := true; end if;
  if not v_aud and v_staff then
    v_aud := exists (select 1 from app.live_camera_audience a
                       join public.organization_memberships m on m.organization_id = c.organization_id and m.user_id = v_uid and m.active
                      where a.camera_id = c.id and a.kind = 'rol' and a.value = m.role);
  end if;
  if not v_aud and v_guardian is not null then
    v_aud := exists (select 1 from app.live_camera_audience a
                       join app.player_guardians pg on pg.guardian_id = v_guardian
                       join app.players p on p.id = pg.player_id and p.archived_at is null and p.organization_id = c.organization_id
                      where a.camera_id = c.id and a.kind = 'categoria' and lower(btrim(a.value)) = lower(btrim(p.category)));
  end if;
  if not v_aud then return 'sin_permiso'; end if;

  if exists (select 1 from app.live_access_blocks b
              where b.organization_id = c.organization_id and b.lifted_at is null
                and (b.camera_id is null or b.camera_id = c.id)
                and (b.user_id = v_uid or (v_guardian is not null and b.guardian_id = v_guardian))) then
    return 'bloqueado';
  end if;

  if not v_admin and not exists (select 1 from app.live_viewer_terms t
                                  where t.organization_id = c.organization_id and t.user_id = v_uid
                                    and t.version = coalesce(s.terms_version, 1)) then
    return 'sin_terminos';
  end if;

  -- El administrador puede revisar la imagen fuera de horario para configurar.
  if not v_admin and not v_fam then
    if not exists (select 1 from app.live_camera_windows w where w.camera_id = c.id) then return 'sin_horario'; end if;
    if private.live_fin_de_ventana(c.id) is null then return 'fuera_de_horario'; end if;
  end if;
  return 'ok';
end $$;

create or replace function private.live_revoca_tickets(p_org uuid, p_camera uuid, p_user uuid, p_motivo text)
returns integer language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update app.live_tickets t set revoked_at = now(), revoke_reason = left(p_motivo, 120)
   where t.organization_id = p_org and t.revoked_at is null and t.session_expires_at > now()
     and (p_camera is null or t.camera_id = p_camera)
     and (p_user is null or t.user_id = p_user);
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================ espectador ====

create or replace function private.live_mis_camaras(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := private.live_org_de(p_org); s app.live_settings; v_uid uuid := (select auth.uid());
begin
  if v_org is null then raise exception 'Not authorized'; end if;
  select * into s from app.live_settings where organization_id = v_org;
  return jsonb_build_object(
    'pausado', coalesce(s.paused, false),
    'terminos', jsonb_build_object('version', coalesce(s.terms_version, 1),
       'aceptados', exists (select 1 from app.live_viewer_terms t where t.organization_id = v_org and t.user_id = v_uid and t.version = coalesce(s.terms_version, 1))),
    'camaras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'nombre', x.name, 'cancha', x.venue_label, 'motivo', x.motivo,
               'estado', case when x.motivo = 'ok' then x.stream_state end,
               'estado_al', case when x.motivo = 'ok' then x.state_reported_at end,
               'horario', coalesce((select jsonb_agg(jsonb_build_object('dia', w.weekday, 'de', to_char(w.start_time, 'HH24:MI'), 'a', to_char(w.end_time, 'HH24:MI')) order by w.weekday, w.start_time)
                                      from app.live_camera_windows w where w.camera_id = x.id), '[]'::jsonb))
             order by x.name)
        from (select c.*, private.live_motivo(c.id) motivo from app.live_cameras c
               where c.organization_id = v_org and c.archived_at is null and not c.sensitive) x
       where x.motivo not in ('no_existe', 'sin_permiso', 'sensible', 'modulo_apagado', 'sin_sesion')), '[]'::jsonb));
end $$;

create or replace function private.live_aceptar_terminos(p_org uuid, p_version integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.live_org_de(p_org); v_ver integer;
begin
  if v_org is null then raise exception 'Not authorized'; end if;
  select coalesce((select terms_version from app.live_settings where organization_id = v_org), 1) into v_ver;
  if p_version is distinct from v_ver then raise exception 'Terms version mismatch'; end if;
  insert into app.live_viewer_terms(organization_id, user_id, version) values (v_org, (select auth.uid()), v_ver)
  on conflict do nothing;
  perform private.live_audita(v_org, 'terminos_aceptados', 'live_terms', null, jsonb_build_object('version', v_ver));
  return jsonb_build_object('ok', true, 'version', v_ver);
end $$;

create or replace function private.live_ticket(p_camera uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_motivo text := private.live_motivo(p_camera);
  c app.live_cameras; s app.live_settings;
  v_token text; v_fin timestamptz; v_ses timestamptz; v_exp timestamptz;
begin
  if v_motivo <> 'ok' then return jsonb_build_object('ok', false, 'motivo', v_motivo); end if;
  select * into c from app.live_cameras where id = p_camera;
  select * into s from app.live_settings where organization_id = c.organization_id;
  -- Freno: un usuario no pide más de 6 tickets por minuto.
  if (select count(*) from app.live_tickets t where t.user_id = v_uid and t.issued_at > now() - interval '1 minute') >= 6 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;
  if s.gateway_base_url is null or c.gateway_path is null then
    -- Sin gateway no hay video real. No se emite ticket: la pantalla lo dice.
    return jsonb_build_object('ok', false, 'motivo', 'sin_gateway');
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(secs => coalesce(s.ticket_ttl_seconds, 120));
  v_ses := now() + make_interval(mins => coalesce(s.session_max_minutes, 90));
  v_fin := private.live_fin_de_ventana(c.id);
  if v_fin is null then
    select max(b.ends_at) into v_fin from app.live_broadcasts b
     where b.camera_id = c.id and b.mode = 'familias' and b.stopped_at is null and now() < b.ends_at;
  end if;
  if v_fin is not null and v_fin < v_ses then v_ses := v_fin; end if;
  insert into app.live_tickets(organization_id, camera_id, user_id, token_hash, expires_at, session_expires_at)
  values (c.organization_id, c.id, v_uid, extensions.digest(v_token, 'sha256'), v_exp, v_ses);
  perform private.live_audita(c.organization_id, 'ticket', 'live_camera', c.id, jsonb_build_object('sesion_hasta', v_ses));
  return jsonb_build_object('ok', true, 'motivo', 'ok', 'ticket', v_token, 'expira', v_exp, 'sesion_hasta', v_ses,
    'whep', s.gateway_base_url || '/' || c.gateway_path || '/whep',
    'hls', s.gateway_base_url || '/' || c.gateway_path || '/index.m3u8');
end $$;
