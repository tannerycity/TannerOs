-- h101 · Tanner LIVE (aplicada el 24/11/2026)
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
-- Reverso y pruebas (escriben: sólo en local o en una rama de Supabase):
-- supabase/tests/tanner-live/.


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
