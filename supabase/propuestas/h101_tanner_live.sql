-- h101 · Tanner LIVE (PROPUESTA, NO APLICADA)
--
-- Transmisión privada de entrenamientos desde el CCTV Dahua de Tannery City
-- Park hacia padres/tutores autorizados y staff. Ver docs/tanner-live/.
--
-- Principios (los mismos de toda la casa):
--   * Tablas en `app`, lógica en `private`, envoltorios `public.v2_live_*`
--     security definer que sólo llaman a private.
--   * Nada se lee directo de las tablas: RLS activado, sin políticas, y
--     revoke a anon/authenticated. Todo pasa por RPC que revisa el permiso.
--   * NINGUNA credencial del grabador vive en la base. Usuario y contraseña
--     RTSP sólo existen en el gateway (variables de entorno del servidor).
--     Hay checks que rechazan notas o errores con "rtsp://usuario@" o
--     "password", por si alguien los pega por error.
--   * Privado por defecto: una cámara nace apagada, sin audiencia, sin
--     horario y sin audio. Para encenderla hace falta audiencia, horario y
--     una revisión de permisos de imagen de los menores de esa audiencia.
--   * El navegador del papá nunca recibe una URL RTSP. Recibe un ticket de un
--     solo dispositivo que vence en minutos; el gateway lo valida contra la
--     base en cada conexión (private.live_gateway_autoriza) y la sesión se
--     corta al final del horario, al pausar o al revocar.
--   * Sin grabación: este módulo no guarda video ni ofrece descarga.
--
-- Cómo se aprueba: supabase/propuestas/README.md. Su reverso está en
-- h101_tanner_live_reverso.sql y sus pruebas en h101_tanner_live_pruebas.sql.

begin;

-- ============================================================== tablas ====

create table app.live_settings(
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  paused boolean not null default false,
  paused_reason text check (paused_reason is null or length(paused_reason) <= 300),
  paused_at timestamptz,
  paused_by uuid,
  -- Origen público del gateway (MediaMTX detrás de TLS). Sólo el origen: la
  -- ruta de cada cámara se arma en el servidor. null = sin gateway todavía.
  gateway_base_url text check (gateway_base_url is null or gateway_base_url ~ '^https://[a-z0-9.-]+(:[0-9]{2,5})?$'),
  ticket_ttl_seconds integer not null default 120 check (ticket_ttl_seconds between 30 and 600),
  session_max_minutes integer not null default 90 check (session_max_minutes between 5 and 240),
  terms_version integer not null default 1 check (terms_version >= 1),
  updated_at timestamptz not null default now()
);

create table app.live_recorders(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  device_type text not null default 'desconocido' check (device_type in ('nvr','dvr','xvr','ipc','desconocido')),
  model text check (model is null or length(model) <= 80),
  firmware text check (firmware is null or length(firmware) <= 80),
  -- Sólo direcciones privadas: el grabador nunca se publica a internet.
  local_ip inet check (local_ip is null or local_ip << inet '10.0.0.0/8' or local_ip << inet '172.16.0.0/12' or local_ip << inet '192.168.0.0/16'),
  rtsp_port integer not null default 554 check (rtsp_port between 1 and 65535),
  channels_total smallint check (channels_total is null or channels_total between 1 and 256),
  codec text not null default 'desconocido' check (codec in ('h264','h265','desconocido')),
  substream_available boolean,               -- null = no verificado
  notes text check (notes is null or length(notes) <= 500),
  connectivity text not null default 'sin_verificar' check (connectivity in ('sin_verificar','alcanzable','inalcanzable','error')),
  last_check_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_recorders_sin_secretos check (
    coalesce(notes,'') || ' ' || label || ' ' || coalesce(model,'') !~* '(rtsp://[^[:space:]]*@|password|passwd|contrase)')
);
create index live_recorders_org on app.live_recorders(organization_id);

create table app.live_cameras(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recorder_id uuid references app.live_recorders(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 60),
  venue_label text check (venue_label is null or length(venue_label) <= 60),
  channel smallint check (channel is null or channel between 1 and 256),
  stream_profile text not null default 'sub' check (stream_profile in ('sub','main')),
  codec text not null default 'desconocido' check (codec in ('h264','h265','desconocido')),
  resolution text check (resolution is null or resolution ~ '^[0-9]{3,4}x[0-9]{3,4}$'),
  -- Nombre de la ruta en el gateway. Único global: un gateway puede servir a
  -- varios clubes. No es secreto, pero sin ticket no abre nada.
  gateway_path text unique check (gateway_path is null or gateway_path ~ '^[a-z0-9][a-z0-9_-]{2,62}$'),
  enabled boolean not null default false,
  sensitive boolean not null default false,  -- vestidores, baños, oficinas: nunca se transmite
  audio_enabled boolean not null default false,
  consent_reviewed_at timestamptz,
  consent_reviewed_by uuid,
  stream_state text not null default 'sin_configurar' check (stream_state in ('sin_configurar','offline','conectando','online','error')),
  state_reported_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 300),
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_cameras_sensible_apagada check (not (enabled and sensitive)),
  constraint live_cameras_archivada_apagada check (not (enabled and archived_at is not null)),
  constraint live_cameras_sin_secretos check (coalesce(last_error,'') !~* '(rtsp://[^[:space:]]*@|password|passwd|contrase)')
);
create index live_cameras_org on app.live_cameras(organization_id);

-- Quién puede ver: categorías (sus tutores) y roles del staff.
create table app.live_camera_audience(
  camera_id uuid not null references app.live_cameras(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('categoria','rol')),
  value text not null check (length(btrim(value)) between 1 and 60),
  primary key (camera_id, kind, value)
);

-- Cuándo: ventanas semanales (ISO: 1 = lunes … 7 = domingo), hora del club.
create table app.live_camera_windows(
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references app.live_cameras(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index live_camera_windows_cam on app.live_camera_windows(camera_id);

-- Revocaciones. camera_id null = todas las cámaras del club.
create table app.live_access_blocks(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guardian_id uuid references app.guardians(id) on delete cascade,
  user_id uuid,
  camera_id uuid references app.live_cameras(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  check (guardian_id is not null or user_id is not null)
);
create index live_access_blocks_org on app.live_access_blocks(organization_id) where lifted_at is null;

-- Aceptación de las reglas de Tanner LIVE (no grabar, no compartir).
create table app.live_viewer_terms(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  version integer not null,
  accepted_at timestamptz not null default now(),
  primary key (organization_id, user_id, version)
);

-- Transmisiones con el botón "Transmitir" (24/11/2026, Presidencia: "un
-- botón de transmitir y ya, y veo a quién le doy acceso").
--   modo 'enlace'   — la ve quien tenga el enlace, sin cuenta (rentas de TCP,
--                     la final del torneo). Nunca durante el horario de la
--                     academia de esa cámara: no arranca, y si llega la hora
--                     se corta sola.
--   modo 'familias' — la academia fuera de su horario fijo: la ven los
--                     tutores de la audiencia de la cámara, con su cuenta.
-- Toda transmisión tiene fin (máx. 6 h). El enlace se guarda para poder
-- copiarlo otra vez; sólo lo lee un administrador por RPC. "Nuevo enlace"
-- invalida el anterior y corta a quien lo estaba usando.
create table app.live_broadcasts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references app.live_cameras(id) on delete cascade,
  mode text not null check (mode in ('enlace','familias')),
  title text check (title is null or length(title) <= 80),
  link_token text unique check (link_token is null or link_token ~ '^[0-9a-f]{32}$'),
  max_viewers integer not null default 50 check (max_viewers between 1 and 500),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  stopped_at timestamptz,
  stop_reason text check (stop_reason is null or length(stop_reason) <= 120),
  created_by uuid,
  stopped_by uuid,
  check (ends_at > started_at and ends_at <= started_at + interval '6 hours'),
  check ((mode = 'enlace') = (link_token is not null))
);
create index live_broadcasts_activas on app.live_broadcasts(camera_id) where stopped_at is null;

-- Tickets de reproducción. Se guarda sólo el hash; el token viaja una vez.
-- user_id null = ticket de un enlace (quien lo abre no tiene cuenta).
create table app.live_tickets(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references app.live_cameras(id) on delete cascade,
  user_id uuid,
  broadcast_id uuid references app.live_broadcasts(id) on delete cascade,
  token_hash bytea not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,           -- para empezar a ver
  session_expires_at timestamptz not null,   -- tope de la sesión
  used_at timestamptz,
  first_ip inet,
  gateway_session_id text check (gateway_session_id is null or length(gateway_session_id) <= 120),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or length(revoke_reason) <= 120),
  check (user_id is not null or broadcast_id is not null)
);
create index live_tickets_user on app.live_tickets(user_id, issued_at desc);
create index live_tickets_activos on app.live_tickets(organization_id) where revoked_at is null;

-- Diagnóstico: lo que reporta un agente/gateway autorizado o una persona.
create table app.live_diagnostics(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recorder_id uuid references app.live_recorders(id) on delete cascade,
  camera_id uuid references app.live_cameras(id) on delete cascade,
  check_kind text not null check (check_kind in ('registro_manual','tcp_rtsp','rtsp_describe','sondeo_stream','gateway_estado')),
  result text not null check (result in ('ok','falla','tiempo_agotado','no_autorizado','no_probado')),
  source text not null check (source in ('admin','agente','gateway')),
  detail jsonb not null default '{}'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 600000),
  reported_by uuid,
  occurred_at timestamptz not null default now(),
  constraint live_diagnostics_sin_secretos check (detail::text !~* '(rtsp://[^[:space:]"]*@|password|passwd|contrase|token)')
);
create index live_diagnostics_org on app.live_diagnostics(organization_id, occurred_at desc);

-- Nadie lee ni escribe estas tablas directo.
do $$
declare t text;
begin
  foreach t in array array['live_settings','live_recorders','live_cameras','live_camera_audience','live_camera_windows',
                           'live_access_blocks','live_viewer_terms','live_broadcasts','live_tickets','live_diagnostics']
  loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on table app.%I from public, anon, authenticated', t);
    -- El candado de los clubes demo (solo lectura) cubre también a Tanner LIVE.
    execute format('create trigger zz_club_read_only before insert or update or delete on app.%I for each row execute function private.guard_club_read_only()', t);
  end loop;
end $$;

-- ============================================================== módulo ====

insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('live', 'Tanner LIVE', 'club', 'Entrenamientos en vivo, privados, para tutores y staff autorizados.', false, true, 40)
on conflict (code) do nothing;

-- En los planes queda apagado; se enciende club por club.
insert into public.plan_modules(plan_id, module_code, enabled)
select distinct plan_id, 'live', false from public.plan_modules
on conflict do nothing;

insert into public.organization_module_overrides(organization_id, module_code, enabled)
select id, 'live', true from public.organizations where slug = 'tannery-city-fc'
on conflict do nothing;

-- Por rol: igual que Dirección (hoy, sólo Presidencia lee y escribe). A un
-- formador u otra persona se le da por persona en Usuarios.
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select organization_id, role, 'live', can_read, can_write from public.role_module_permissions where module_code = 'direccion'
on conflict do nothing;

create or replace function private.usage_modulos()
returns text[] language sql immutable set search_path to '' as $$
  select array['inicio','mensajes','club','direccion','taquilla','contabilidad','finanzas','jugadores','asistencia','becas','partidos',
    'calendario','centro_tanner','academias','formacion','prospectos','candidatos','staff','cumpleanos','encuestas','scouting','visorias',
    'cursosVerano','tienda','catalogo','utileria','estacionamiento','patrocinadores','metricas','ideas','usuarios','invitaciones','admin','cambios','qa','convocatoria','live']
$$;
revoke all on function private.usage_modulos() from public, anon, authenticated;

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

-- ===================================================== envoltorios v2_* ====

create or replace function public.v2_live_mis_camaras(organization_id uuid default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_mis_camaras($1) $$;
create or replace function public.v2_live_aceptar_terminos(organization_id uuid, version integer)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_aceptar_terminos($1, $2) $$;
create or replace function public.v2_live_ticket(camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_ticket($1) $$;
create or replace function public.v2_live_panel(organization_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_panel($1) $$;
create or replace function public.v2_live_guardar_grabador(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_guardar_grabador($1, $2) $$;
create or replace function public.v2_live_guardar_camara(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_guardar_camara($1, $2) $$;
create or replace function public.v2_live_revisar_consentimiento(organization_id uuid, camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_revisar_consentimiento($1, $2) $$;
create or replace function public.v2_live_activar(organization_id uuid, camera_id uuid, activa boolean, motivo text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_activar($1, $2, $3, $4) $$;
create or replace function public.v2_live_pausa(organization_id uuid, pausar boolean, motivo text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_pausa($1, $2, $3) $$;
create or replace function public.v2_live_ajustes(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_ajustes($1, $2) $$;
create or replace function public.v2_live_accesos(organization_id uuid, camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_accesos($1, $2) $$;
create or replace function public.v2_live_bloquear(organization_id uuid, guardian_id uuid, camera_id uuid, motivo text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_bloquear($1, $2, $3, $4) $$;
create or replace function public.v2_live_desbloquear(organization_id uuid, block_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_desbloquear($1, $2) $$;
create or replace function public.v2_live_archivar(organization_id uuid, tipo text, id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_archivar($1, $2, $3) $$;
create or replace function public.v2_live_prueba_manual(organization_id uuid, recorder_id uuid, camera_id uuid, resultado text, nota text default null, datos jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_prueba_manual($1, $2, $3, $4, $5, $6) $$;
create or replace function public.v2_live_bitacora(organization_id uuid, limite integer default 100)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_bitacora($1, $2) $$;

create or replace function public.v2_live_transmitir(organization_id uuid, camera_id uuid, modo text, titulo text default null, minutos integer default 120)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_transmitir($1, $2, $3, $4, $5) $$;
create or replace function public.v2_live_detener(organization_id uuid, broadcast_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_detener($1, $2) $$;
create or replace function public.v2_live_nuevo_enlace(organization_id uuid, broadcast_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_nuevo_enlace($1, $2) $$;

-- Para quien abre el enlace: sin cuenta (anon). Sólo sirven con el enlace.
create or replace function public.v2_live_publico(enlace text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_publico($1) $$;
create or replace function public.v2_live_publico_ticket(enlace text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_publico_ticket($1) $$;

-- Sólo servidor.
create or replace function public.v2_live_gateway_autoriza(token text, path text, accion text, ip text default null, sesion text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_autoriza($1, $2, $3, $4, $5) $$;
create or replace function public.v2_live_gateway_cortes(desde timestamptz default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_cortes($1) $$;
create or replace function public.v2_live_gateway_estado(path text, estado text, error text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_estado($1, $2, $3) $$;
create or replace function public.v2_live_agente_diagnostico(recorder_id uuid, camera_id uuid, prueba text, resultado text, datos jsonb default '{}'::jsonb, latencia_ms integer default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_agente_diagnostico($1, $2, $3, $4, $5, $6) $$;

-- ============================================================== permisos ====

do $$
declare f text;
begin
  -- Todo lo privado, cerrado.
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname like 'live\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Pantallas: authenticated.
  foreach f in array array[
    'public.v2_live_mis_camaras(uuid)', 'public.v2_live_aceptar_terminos(uuid,integer)', 'public.v2_live_ticket(uuid)',
    'public.v2_live_panel(uuid)', 'public.v2_live_guardar_grabador(uuid,jsonb)', 'public.v2_live_guardar_camara(uuid,jsonb)',
    'public.v2_live_revisar_consentimiento(uuid,uuid)', 'public.v2_live_activar(uuid,uuid,boolean,text)', 'public.v2_live_pausa(uuid,boolean,text)',
    'public.v2_live_ajustes(uuid,jsonb)', 'public.v2_live_accesos(uuid,uuid)', 'public.v2_live_bloquear(uuid,uuid,uuid,text)',
    'public.v2_live_desbloquear(uuid,uuid)', 'public.v2_live_archivar(uuid,text,uuid)',
    'public.v2_live_prueba_manual(uuid,uuid,uuid,text,text,jsonb)', 'public.v2_live_bitacora(uuid,integer)',
    'public.v2_live_transmitir(uuid,uuid,text,text,integer)', 'public.v2_live_detener(uuid,uuid)', 'public.v2_live_nuevo_enlace(uuid,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- El enlace: anon y authenticated (quien lo abre puede tener o no cuenta).
  foreach f in array array['public.v2_live_publico(text)', 'public.v2_live_publico_ticket(text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  -- Gateway y agente: sólo service_role.
  foreach f in array array[
    'public.v2_live_gateway_autoriza(text,text,text,text,text)', 'public.v2_live_gateway_cortes(timestamptz)',
    'public.v2_live_gateway_estado(text,text,text)', 'public.v2_live_agente_diagnostico(uuid,uuid,text,text,jsonb,integer)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
