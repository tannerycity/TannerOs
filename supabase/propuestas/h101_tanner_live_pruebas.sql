-- Pruebas de h101 · Tanner LIVE. ESCRIBEN DATOS: sólo en la réplica local o
-- en una rama de Supabase, NUNCA en producción (al revés que supabase/tests/,
-- que son de sólo lectura). Todo corre en una transacción que se revierte.
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f h101_tanner_live_replica_local.sql   (sólo local)
--   psql "$DB" -v ON_ERROR_STOP=1 -f h101_tanner_live.sql
--   psql "$DB" -v ON_ERROR_STOP=1 -f h101_tanner_live_pruebas.sql
--
-- Una prueba que falla levanta 'PRUEBA FALLÓ: …'. Al final imprime cuántas pasaron.
\set ON_ERROR_STOP 1
begin;

create schema pr;
create table pr.ok(n int); insert into pr.ok values (0);
create function pr.como(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'none', true);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;
create function pr.rol(p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', p_rol, true);
end $$;
create function pr.es(p_cond boolean, p_que text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'PRUEBA FALLÓ: %', p_que; end if;
  update pr.ok set n = n + 1;
end $$;
create function pr.cam(p uuid) returns app.live_cameras language sql security definer as $$ select * from app.live_cameras where id = p $$;
create function pr.diag(p uuid) returns app.live_diagnostics language sql security definer as $$ select * from app.live_diagnostics where id = p $$;
create function pr.token_en_claro(p text) returns boolean language sql security definer as $$ select exists (select 1 from app.live_tickets where token_hash = convert_to(p, 'UTF8')) $$;
grant usage on schema pr to anon, authenticated, service_role;
grant execute on all functions in schema pr to anon, authenticated, service_role;
grant select, update on pr.ok to anon, authenticated, service_role;

-- Datos: club A (Tannery) y club B (otro club del SaaS).
insert into public.organizations(id, slug, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'tannery-city-fc-prueba', 'Club A'),
  ('b0000000-0000-0000-0000-00000000000b', 'club-b-prueba', 'Club B');
insert into public.organization_module_overrides(organization_id, module_code, enabled) values
  ('a0000000-0000-0000-0000-00000000000a', 'live', true), ('b0000000-0000-0000-0000-00000000000b', 'live', true)
on conflict (organization_id, module_code) do update set enabled = true;
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write) values
  ('a0000000-0000-0000-0000-00000000000a', 'Presidencia', 'live', true, true),
  ('b0000000-0000-0000-0000-00000000000b', 'Presidencia', 'live', true, true)
on conflict do nothing;
insert into public.profiles(user_id, display_name) values ('11111111-0000-0000-0000-000000000001', 'Presidencia A');
insert into public.organization_memberships(id, organization_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'Presidencia'),
  ('aaaa0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', 'Formadores'),
  ('aaaa0000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000003', 'Taquilla'),
  ('bbbb0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000001', 'Presidencia');
-- Formador: Tanner LIVE sólo lectura, por persona. Taquilla: nada.
insert into private.membership_module_overrides(organization_id, membership_id, module_code, can_read, can_write)
values ('a0000000-0000-0000-0000-00000000000a', 'aaaa0000-0000-0000-0000-000000000002', 'live', true, false);
insert into app.guardians(id, organization_id, first_name, last_name, phone, user_id) values
  ('9a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Papa', 'T10', '4771234567', '33333333-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Papa', 'T12', '4777654321', '33333333-0000-0000-0000-000000000002'),
  ('9b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Papa', 'ClubB', '4770000000', '33333333-0000-0000-0000-000000000003');
insert into app.players(id, organization_id, first_name, category, image_consent) values
  ('7a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Liam', 'T10', true),
  ('7a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Ana', 'T12', false),
  ('7b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Leo', 'T10', true);
insert into app.player_guardians(player_id, guardian_id, organization_id) values
  ('7a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('7a000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a'),
  ('7b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b');

do $$
declare
  A constant uuid := 'a0000000-0000-0000-0000-00000000000a';
  B constant uuid := 'b0000000-0000-0000-0000-00000000000b';
  PRESI constant uuid := '11111111-0000-0000-0000-000000000001';
  FORM constant uuid := '11111111-0000-0000-0000-000000000002';
  TAQ constant uuid := '11111111-0000-0000-0000-000000000003';
  PRESI_B constant uuid := '22222222-0000-0000-0000-000000000001';
  PAPA10 constant uuid := '33333333-0000-0000-0000-000000000001';
  PAPA12 constant uuid := '33333333-0000-0000-0000-000000000002';
  PAPAB constant uuid := '33333333-0000-0000-0000-000000000003';
  EXTRANO constant uuid := '44444444-0000-0000-0000-000000000001';
  G10 constant uuid := '9a000000-0000-0000-0000-000000000001';
  r jsonb; v_rec uuid; v_cam uuid; v_sens uuid; v_tok text; v_err text; v_hoy int; v_otro int;
begin
  v_hoy := extract(isodow from now() at time zone 'America/Mexico_City');
  v_otro := case when v_hoy = 7 then 1 else v_hoy + 1 end;

  -- 1. Registrar un grabador sin conocer su configuración real.
  perform pr.como(PRESI);
  r := public.v2_live_guardar_grabador(A, '{"nombre":"Grabador del parque"}');
  v_rec := (r->>'id')::uuid;
  perform pr.es(v_rec is not null, 'se registra un grabador sólo con nombre');

  -- 2. IP pública: rechazada. Credenciales en notas: rechazadas.
  begin perform public.v2_live_guardar_grabador(A, '{"nombre":"X","ip":"8.8.8.8"}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'una IP pública no se acepta para el grabador');
  begin perform public.v2_live_guardar_grabador(A, '{"nombre":"X","ip":"192.168.1.108","notas":"rtsp://admin:secreta@192.168.1.108:554"}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'unas notas con usuario:contraseña RTSP no se guardan');
  r := public.v2_live_guardar_grabador(A, jsonb_build_object('id', v_rec, 'nombre', 'Grabador del parque', 'ip', '192.168.1.108', 'tipo', 'nvr', 'codec', 'h264', 'canales', 8));
  perform pr.es((r->>'ok')::boolean, 'se edita el grabador con IP privada');

  -- 3. Cámara: nace apagada, con audiencia T10 + Formadores y horario hoy.
  r := public.v2_live_guardar_camara(A, jsonb_build_object('grabador', v_rec, 'nombre', 'Cancha 1', 'cancha', 'Cancha 1', 'canal', 1, 'ruta', 'tc-cancha-1',
         'categorias', jsonb_build_array('T10'), 'roles', jsonb_build_array('Formadores'),
         'horario', jsonb_build_array(jsonb_build_object('dia', v_hoy, 'de', '00:00', 'a', '23:59'))));
  v_cam := (r->>'id')::uuid;
  perform pr.es(not (pr.cam(v_cam)).enabled, 'la cámara nace apagada');
  perform pr.es(not (pr.cam(v_cam)).audio_enabled, 'la cámara nace sin audio');

  -- 4. No se enciende sin revisar permisos de imagen.
  r := public.v2_live_activar(A, v_cam, true, null);
  perform pr.es(r->>'motivo' = 'revisar_consentimiento', 'no se enciende sin revisar permisos de imagen');
  r := public.v2_live_revisar_consentimiento(A, v_cam);
  perform pr.es((r->>'jugadores')::int = 1 and (r->>'sin_permiso')::int = 0, 'la revisión cuenta sólo jugadores de la audiencia y de este club');
  r := public.v2_live_activar(A, v_cam, true, null);
  perform pr.es((r->>'ok')::boolean, 'con revisión, audiencia y horario, se enciende');

  -- 5. Familia T10: ve la cámara pero primero acepta las reglas.
  perform pr.como(PAPA10);
  r := public.v2_live_mis_camaras(null);
  perform pr.es(jsonb_array_length(r->'camaras') = 1 and r->'camaras'->0->>'motivo' = 'sin_terminos', 'el tutor ve su cámara y se le piden las reglas');
  r := public.v2_live_ticket(v_cam);
  perform pr.es(r->>'motivo' = 'sin_terminos', 'sin aceptar reglas no hay ticket');
  perform public.v2_live_aceptar_terminos(null, 1);
  r := public.v2_live_ticket(v_cam);
  perform pr.es(r->>'motivo' = 'sin_gateway' and r->>'ticket' is null, 'sin gateway no se emite ticket ni se simula señal');

  -- 6. Gateway: sólo Presidencia lo configura.
  perform pr.como(FORM);
  begin perform public.v2_live_ajustes(A, '{"gateway":"https://live.tannerycity.com"}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'un formador no cambia el gateway');
  perform pr.como(PRESI);
  begin perform public.v2_live_ajustes(A, '{"gateway":"http://live.tannerycity.com"}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'el gateway exige https');
  perform public.v2_live_ajustes(A, '{"gateway":"https://live.tannerycity.com"}');

  perform pr.como(PAPA10);
  r := public.v2_live_ticket(v_cam);
  v_tok := r->>'ticket';
  perform pr.es((r->>'ok')::boolean and v_tok ~ '^[0-9a-f]{64}$', 'el tutor autorizado recibe un ticket');
  perform pr.es(r->>'whep' = 'https://live.tannerycity.com/tc-cancha-1/whep' and r::text !~* 'rtsp', 'el navegador recibe la URL del gateway, nunca RTSP');
  perform pr.es(not pr.token_en_claro(v_tok), 'el token no se guarda en claro');

  -- 7. Aislamiento: otra categoría, otro club, un extraño.
  perform pr.como(PAPA12);
  r := public.v2_live_mis_camaras(null);
  perform pr.es(jsonb_array_length(r->'camaras') = 0, 'un tutor de otra categoría no ve la cámara');
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'sin_permiso', 'un tutor de otra categoría no obtiene ticket');
  perform pr.como(PAPAB);
  perform pr.es(jsonb_array_length(public.v2_live_mis_camaras(null)->'camaras') = 0, 'un tutor de otro club no ve cámaras ajenas');
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'no_existe', 'a otro club ni se le confirma que la cámara existe');
  begin perform public.v2_live_mis_camaras(A); v_err := null; exception when others then v_err := sqlerrm; end;
  -- Pedir la org A siendo tutor de B regresa su propio club (B), nunca A.
  perform pr.es(v_err is not null or jsonb_array_length(public.v2_live_mis_camaras(A)->'camaras') = 0, 'pedir el id de otro club no abre sus cámaras');
  perform pr.como(PRESI_B);
  begin perform public.v2_live_panel(A); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'Presidencia de otro club no abre el panel de A');
  perform pr.como(EXTRANO);
  begin perform public.v2_live_mis_camaras(null); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'un usuario sin club no ve nada');
  perform pr.como(PAPA10);
  begin perform public.v2_live_panel(A); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'un tutor no abre el panel administrativo');
  perform pr.como(FORM);
  begin perform public.v2_live_panel(A); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'un formador (sólo lectura) no abre el panel administrativo');
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'sin_terminos', 'el formador de la audiencia llega hasta las reglas');
  perform pr.como(TAQ);
  begin perform public.v2_live_mis_camaras(A); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'staff sin el módulo no ve Tanner LIVE');

  -- 8. Gateway valida el ticket (service_role).
  perform pr.rol('service_role');
  r := public.v2_live_gateway_autoriza(v_tok, 'tc-cancha-1', 'read', '201.0.0.10', 'sesion-1');
  perform pr.es((r->>'ok')::boolean, 'el gateway acepta un ticket vigente');
  perform pr.es(public.v2_live_gateway_autoriza(v_tok, 'otra-ruta', 'read', '201.0.0.10', null)->>'motivo' = 'ruta', 'el ticket sólo abre su cámara');
  perform pr.es(public.v2_live_gateway_autoriza(v_tok, 'tc-cancha-1', 'read', '187.1.1.1', null)->>'motivo' = 'otro_dispositivo', 'compartir el ticket a otro dispositivo no sirve');
  perform pr.es(public.v2_live_gateway_autoriza(v_tok, 'tc-cancha-1', 'publish', '201.0.0.10', null)->>'motivo' = 'accion', 'nadie publica con un ticket');
  perform pr.es(public.v2_live_gateway_autoriza(repeat('0', 64), 'tc-cancha-1', 'read', null, null)->>'motivo' = 'ticket_invalido', 'un ticket inventado no pasa');
  perform pr.es(public.v2_live_gateway_estado('tc-cancha-1', 'error', 'fallo rtsp://admin:secreta@192.168.1.108 password=1234')->>'ok' = 'true', 'el gateway reporta estado');
  perform pr.es((pr.cam(v_cam)).last_error !~* '(secreta|1234)', 'un error con credenciales se guarda limpio');

  -- 9. Botón de pánico: pausa general corta las sesiones.
  perform pr.como(PRESI);
  begin perform public.v2_live_pausa(A, true, ''); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'pausar pide motivo');
  r := public.v2_live_pausa(A, true, 'Incidente en cancha');
  perform pr.es((r->>'sesiones_cortadas')::int >= 1, 'la pausa revoca las sesiones abiertas');
  perform pr.rol('service_role');
  perform pr.es(public.v2_live_gateway_autoriza(v_tok, 'tc-cancha-1', 'read', '201.0.0.10', null)->>'motivo' = 'revocado', 'un ticket revocado ya no abre');
  perform pr.es(jsonb_array_length(public.v2_live_gateway_cortes(now() - interval '1 minute')) >= 1, 'el gateway recibe qué sesiones cortar');
  perform pr.como(PAPA10);
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'pausado', 'en pausa nadie obtiene ticket');
  perform pr.como(PRESI);
  perform public.v2_live_pausa(A, false, 'Todo en orden');

  -- 10. Revocar a un tutor.
  r := public.v2_live_bloquear(A, G10, null, 'Solicitud de la familia');
  perform pr.como(PAPA10);
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'bloqueado', 'un tutor revocado no obtiene ticket');
  perform pr.como(PRESI);
  perform public.v2_live_desbloquear(A, (r->>'id')::uuid);
  perform pr.como(PAPA10);
  perform pr.es((public.v2_live_ticket(v_cam)->>'ok')::boolean, 'al restituir, vuelve a ver');

  -- 11. Fuera de horario: la familia no; el administrador sí (para configurar).
  perform pr.como(PRESI);
  r := public.v2_live_guardar_camara(A, jsonb_build_object('id', v_cam, 'grabador', v_rec, 'nombre', 'Cancha 1', 'canal', 1, 'ruta', 'tc-cancha-1',
         'categorias', jsonb_build_array('T10'), 'roles', jsonb_build_array('Formadores'),
         'horario', jsonb_build_array(jsonb_build_object('dia', v_otro, 'de', '17:00', 'a', '19:00'))));
  perform pr.es(not (r->>'apagada_por_cambio')::boolean, 'cambiar sólo el horario no apaga la cámara');
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' in ('ok', 'sin_gateway'), 'el administrador revisa fuera de horario');
  perform pr.como(PAPA10);
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' = 'fuera_de_horario', 'fuera de horario la familia no ve');

  -- 12. Cambiar quién ve apaga la cámara y obliga a revisar de nuevo.
  perform pr.como(PRESI);
  r := public.v2_live_guardar_camara(A, jsonb_build_object('id', v_cam, 'grabador', v_rec, 'nombre', 'Cancha 1', 'canal', 1, 'ruta', 'tc-cancha-1',
         'categorias', jsonb_build_array('T10', 'T12'), 'roles', jsonb_build_array('Formadores'),
         'horario', jsonb_build_array(jsonb_build_object('dia', v_hoy, 'de', '00:00', 'a', '23:59'))));
  perform pr.es((r->>'apagada_por_cambio')::boolean and not (pr.cam(v_cam)).enabled, 'cambiar la audiencia apaga la cámara');
  r := public.v2_live_revisar_consentimiento(A, v_cam);
  perform pr.es((r->>'sin_permiso')::int = 1, 'la revisión detecta al menor sin permiso de imagen');
  r := public.v2_live_activar(A, v_cam, true, null);
  perform pr.es(r->>'motivo' = 'falta_justificacion', 'con menores sin permiso, Presidencia debe justificar');
  r := public.v2_live_activar(A, v_cam, true, 'Autorizado por escrito por las familias de T12 el 20/11');
  perform pr.es((r->>'ok')::boolean, 'Presidencia enciende con justificación escrita');

  -- 13. Cámara sensible: nunca se enciende ni se lista.
  r := public.v2_live_guardar_camara(A, '{"nombre":"Vestidor","sensible":true,"categorias":["T10"],"horario":[{"dia":1,"de":"08:00","a":"09:00"}]}');
  v_sens := (r->>'id')::uuid;
  perform public.v2_live_revisar_consentimiento(A, v_sens);
  perform pr.es(public.v2_live_activar(A, v_sens, true, 'x')->>'motivo' = 'sensible', 'una cámara sensible no se enciende');
  perform pr.como(PAPA10);
  perform pr.es(not (public.v2_live_mis_camaras(null)->'camaras')::text ~ 'Vestidor', 'una cámara sensible no aparece a las familias');

  -- 14. Audio: sólo Presidencia.
  perform pr.como(PRESI);
  r := public.v2_live_guardar_camara(A, jsonb_build_object('id', v_sens, 'nombre', 'Vestidor', 'sensible', true, 'audio', true));
  perform pr.es((pr.cam(v_sens)).audio_enabled, 'Presidencia puede activar audio');

  -- 15. Apagar corta sesiones; prueba manual se anota como persona.
  r := public.v2_live_activar(A, v_cam, false, 'fin de pruebas');
  perform pr.es((r->>'ok')::boolean and not (r->>'activa')::boolean, 'el administrador apaga la transmisión');
  r := public.v2_live_prueba_manual(A, v_rec, v_cam, 'ok', 'VLC en la red del parque mostró la cancha. password: 1234', '{"herramienta":"VLC","codec":"h264"}');
  perform pr.es((pr.diag((r->>'id')::uuid)).source = 'admin', 'la prueba manual queda como hecha por una persona');
  perform pr.es((pr.diag((r->>'id')::uuid)).detail::text !~ '1234', 'una contraseña en la nota se limpia');

  -- 16. Bitácora y sin tokens en ella.
  r := public.v2_live_bitacora(A, 200);
  perform pr.es(jsonb_array_length(r) >= 10, 'la bitácora registra las acciones');
  perform pr.es(r::text !~ v_tok, 'la bitácora no guarda tokens');
  perform pr.como(null);
end $$;

-- 18. Botón "Transmitir": enlace sin cuenta, candado de la academia, familias.
do $$
declare
  A constant uuid := 'a0000000-0000-0000-0000-00000000000a';
  PRESI constant uuid := '11111111-0000-0000-0000-000000000001';
  FORM constant uuid := '11111111-0000-0000-0000-000000000002';
  PAPA10 constant uuid := '33333333-0000-0000-0000-000000000001';
  r jsonb; v_cam uuid; v_c2 uuid; v_c3 uuid; v_b uuid; v_enl text; v_enl2 text; v_tk text; v_err text; v_hoy int; v_otro int; v_local timestamp;
begin
  v_local := now() at time zone 'America/Mexico_City';
  v_hoy := extract(isodow from v_local);
  v_otro := case when v_hoy = 7 then 1 else v_hoy + 1 end;
  perform pr.como(PRESI);
  select (x->>'id')::uuid into v_cam from jsonb_array_elements(public.v2_live_panel(A)->'camaras') x where x->>'nombre' = 'Cancha 1';

  -- 18.1 Cámara sin horario de academia: Transmitir por enlace, en un toque.
  v_c2 := (public.v2_live_guardar_camara(A, '{"nombre":"Cancha 2","ruta":"tc-cancha-2"}')->>'id')::uuid;
  r := public.v2_live_transmitir(A, v_c2, 'enlace', 'Final Copa TCP', 120);
  v_b := (r->>'id')::uuid; v_enl := r->>'enlace';
  perform pr.es((r->>'ok')::boolean and v_enl ~ '^[0-9a-f]{32}$', 'Transmitir por enlace da un enlace sin pedir audiencia ni permisos');
  perform pr.es(((r->>'termina')::timestamptz - now()) between interval '119 minutes' and interval '121 minutes', 'la transmisión termina sola a las 2 h');
  r := public.v2_live_transmitir(A, v_c2, 'enlace', null, 60);
  perform pr.es((r->>'ya_estaba')::boolean and (r->>'id')::uuid = v_b, 'tocar Transmitir otra vez no duplica');
  begin perform public.v2_live_transmitir(A, v_c2, 'enlace', null, 400); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'una transmisión no dura más de 6 h');

  -- 18.2 Quien abre el enlace, sin cuenta.
  perform pr.rol('anon');
  r := public.v2_live_publico(v_enl);
  perform pr.es((r->>'ok')::boolean and r->>'titulo' = 'Final Copa TCP', 'el enlace abre sin cuenta y dice qué es');
  perform pr.es(public.v2_live_publico(repeat('f', 32))->>'motivo' = 'no_existe', 'un enlace inventado no abre');
  perform pr.es(public.v2_live_publico('x')->>'motivo' = 'no_existe', 'basura en el enlace no revienta');
  r := public.v2_live_publico_ticket(v_enl);
  v_tk := r->>'ticket';
  perform pr.es((r->>'ok')::boolean and r->>'whep' = 'https://live.tannerycity.com/tc-cancha-2/whep', 'el enlace da ticket para su cámara');
  perform pr.rol('service_role');
  perform pr.es((public.v2_live_gateway_autoriza(v_tk, 'tc-cancha-2', 'read', '189.1.1.1', 's-enl')->>'ok')::boolean, 'el gateway acepta el ticket del enlace');
  perform pr.es(public.v2_live_gateway_autoriza(v_tk, 'tc-cancha-1', 'read', '189.1.1.1', null)->>'motivo' = 'ruta', 'el ticket del enlace no abre otra cancha');

  -- 18.3 Tope de personas viendo.
  perform pr.como(null);
  update app.live_broadcasts set max_viewers = 1 where id = v_b;
  perform pr.rol('anon');
  perform pr.es(public.v2_live_publico_ticket(v_enl)->>'motivo' = 'lleno', 'con el cupo lleno no entra uno más');
  perform pr.como(null);
  update app.live_broadcasts set max_viewers = 50 where id = v_b;

  -- 18.4 Nuevo enlace: el viejo deja de servir y corta a quien lo usaba.
  perform pr.como(PRESI);
  v_enl2 := public.v2_live_nuevo_enlace(A, v_b)->>'enlace';
  perform pr.es(v_enl2 ~ '^[0-9a-f]{32}$' and v_enl2 <> v_enl, 'Nuevo enlace da otro');
  perform pr.rol('anon');
  perform pr.es(public.v2_live_publico(v_enl)->>'motivo' = 'no_existe', 'el enlace viejo ya no abre');
  perform pr.es((public.v2_live_publico(v_enl2)->>'ok')::boolean, 'el enlace nuevo sí');
  perform pr.rol('service_role');
  perform pr.es(public.v2_live_gateway_autoriza(v_tk, 'tc-cancha-2', 'read', '189.1.1.1', null)->>'motivo' = 'revocado', 'cambiar el enlace corta a quien lo usaba');

  -- 18.5 Detener.
  perform pr.rol('anon');
  v_tk := public.v2_live_publico_ticket(v_enl2)->>'ticket';
  perform pr.como(PRESI);
  perform pr.es((public.v2_live_panel(A)->'transmisiones')::text ~ 'Final Copa TCP', 'el panel enseña la transmisión activa');
  r := public.v2_live_detener(A, v_b);
  perform pr.es((r->>'sesiones_cortadas')::int >= 1, 'Detener corta a quien estaba viendo');
  perform pr.rol('anon');
  perform pr.es(public.v2_live_publico(v_enl2)->>'motivo' = 'terminada', 'tras Detener, el enlace dice que terminó');
  perform pr.es(public.v2_live_publico_ticket(v_enl2)->>'motivo' = 'terminada', 'tras Detener no hay ticket');

  -- 18.6 Candado de la academia.
  perform pr.como(PRESI);
  r := public.v2_live_guardar_camara(A, jsonb_build_object('id', v_cam, 'nombre', 'Cancha 1', 'canal', 1, 'ruta', 'tc-cancha-1',
         'categorias', jsonb_build_array('T10', 'T12'), 'roles', jsonb_build_array('Formadores'),
         'horario', jsonb_build_array(jsonb_build_object('dia', v_hoy, 'de', '00:00', 'a', '23:59'))));
  perform pr.es(public.v2_live_transmitir(A, v_cam, 'enlace', null, 60)->>'motivo' = 'horario_academia', 'en horario de academia no se transmite por enlace');
  if v_local::time < time '21:00' then
    v_c3 := (public.v2_live_guardar_camara(A, jsonb_build_object('nombre', 'Cancha 3', 'ruta', 'tc-cancha-3',
             'horario', jsonb_build_array(jsonb_build_object('dia', v_hoy, 'de', to_char(v_local + interval '1 hour', 'HH24:MI'), 'a', '23:59')))) ->>'id')::uuid;
    r := public.v2_live_transmitir(A, v_c3, 'enlace', 'Renta', 180);
    perform pr.es((r->>'recortada_por_academia')::boolean and (r->>'termina')::timestamptz <= now() + interval '61 minutes', 'el enlace se apaga solo antes de que empiece la academia');
  else
    perform pr.es(true, 'recorte por academia (se omite después de las 21:00)');
  end if;

  -- 18.7 Transmitir para familias fuera de su horario.
  r := public.v2_live_guardar_camara(A, jsonb_build_object('id', v_cam, 'nombre', 'Cancha 1', 'canal', 1, 'ruta', 'tc-cancha-1',
         'categorias', jsonb_build_array('T10', 'T12'), 'roles', jsonb_build_array('Formadores'),
         'horario', jsonb_build_array(jsonb_build_object('dia', v_otro, 'de', '16:00', 'a', '19:00'))));
  perform pr.como(PAPA10);
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' in ('desactivada', 'fuera_de_horario'), 'fuera de horario y apagada, la familia no ve');
  perform pr.como(PRESI);
  r := public.v2_live_transmitir(A, v_cam, 'familias', 'Partido amistoso', 90);
  perform pr.es((r->>'ok')::boolean and r->>'enlace' is null, 'Transmitir para familias no crea enlace público');
  v_b := (r->>'id')::uuid;
  perform pr.como(PAPA10);
  perform pr.es((public.v2_live_ticket(v_cam)->>'ok')::boolean, 'con Transmitir para familias, el tutor ve fuera de horario');
  perform pr.como(PRESI);
  perform public.v2_live_detener(A, v_b);
  perform pr.como(PAPA10);
  perform pr.es(public.v2_live_ticket(v_cam)->>'motivo' in ('desactivada', 'fuera_de_horario'), 'al detener, la familia deja de ver');

  -- 18.8 Pausa general detiene transmisiones; nadie más transmite.
  perform pr.como(PRESI);
  v_enl := public.v2_live_transmitir(A, v_c2, 'enlace', null, 60)->>'enlace';
  perform public.v2_live_pausa(A, true, 'Prueba de pánico');
  perform pr.rol('anon');
  perform pr.es(public.v2_live_publico(v_enl)->>'motivo' in ('terminada', 'pausado'), 'la pausa general apaga los enlaces');
  perform pr.como(PRESI);
  perform pr.es(public.v2_live_transmitir(A, v_c2, 'enlace', null, 60)->>'motivo' = 'pausado', 'en pausa no se puede transmitir');
  perform public.v2_live_pausa(A, false, 'listo');
  perform pr.como(FORM);
  begin perform public.v2_live_transmitir(A, v_c2, 'enlace', null, 60); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'Not authorized', 'sólo un administrador toca Transmitir');
  perform pr.rol('anon');
  begin perform public.v2_live_transmitir(A, v_c2, 'enlace', null, 60); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'permission denied', 'anon no puede transmitir');
  perform pr.como(null);
end $$;

-- 17. Permisos de base: nadie lee las tablas ni llama funciones de servidor.
do $$
declare v_err text;
begin
  perform pr.como('33333333-0000-0000-0000-000000000001');
  begin perform count(*) from app.live_cameras; v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err is not null, 'authenticated no lee app.live_cameras directo');
  begin perform public.v2_live_gateway_autoriza(repeat('a', 64), 'x', 'read', null, null); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'permission denied', 'un usuario no llama al autorizador del gateway');
  begin perform private.live_motivo(gen_random_uuid()); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'permission denied', 'un usuario no llama funciones private.live_*');
  perform pr.rol('anon');
  begin perform public.v2_live_mis_camaras(null); v_err := null; exception when others then v_err := sqlerrm; end;
  perform pr.es(v_err ~ 'permission denied', 'anon no llama a Tanner LIVE');
  perform pr.como(null);
end $$;

select 'Tanner LIVE · ' || n || ' pruebas pasaron' as resultado from pr.ok;
rollback;
