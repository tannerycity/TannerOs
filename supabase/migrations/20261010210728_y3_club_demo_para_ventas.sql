-- Club demo para ventas.
-- Para enseñarle TannerOS a un club sin abrir los datos reales de Tannery.
-- v2_create_demo_club(owner_email) da de alta "Halcones FC (demo)" con el
-- alta normal y lo llena como un club con meses de vida: 40 jugadores en 4
-- categorías, mensualidades de 4 meses con pagos y adeudos (con el motor de
-- cobro real), 6 semanas de asistencia (con una racha de faltas para que se
-- vea la alerta), partidos con goles y asistencias, aviso de privacidad y
-- datos de pago completos. Los teléfonos son inválidos a propósito: nadie
-- real recibe un WhatsApp desde el demo.
-- Un club demo no cuenta en el ingreso del portal (settings.demo).

create or replace function private.siembra_club_demo(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare
  v_hoy date := current_date;
  v_inicio date := (date_trunc('month', current_date) - interval '3 months')::date;
  v_nombres_h text[] := array['Santiago','Mateo','Sebastián','Leonardo','Emiliano','Diego','Iker','Gael','Daniel','Alejandro','Rodrigo','Ángel','Nicolás','Tadeo','Bruno','Thiago','Maximiliano','Joaquín','Emilio','Valentín'];
  v_nombres_m text[] := array['Valentina','Regina','Sofía','Camila','Ximena','Renata','María José','Romina','Victoria','Natalia'];
  v_apellidos text[] := array['Hernández','García','Martínez','López','González','Rodríguez','Pérez','Sánchez','Ramírez','Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Gutiérrez','Ortiz','Mendoza','Aguilar','Castillo','Jiménez','Vargas'];
  v_rivales text[] := array['Club Celaya Norte','Academia Irapuato','Deportivo Silao','Atlético Salamanca','FC San Miguel','Unión Guanajuato'];
  c record; v_cat_idx int := 0; i int; n int := 0;
  v_player uuid; v_guardian uuid; v_first text; v_last text; v_sex text; v_birth date;
  v_ses uuid; v_dia date; v_semana int; v_status text; v_pago int := 0; r record;
  v_match uuid; v_goles jsonb; v_gf int; v_ga int; v_conv uuid[];
begin
  if not coalesce((select (settings->>'demo')::boolean from public.organizations where id = p_org), false) then
    raise exception 'Sólo se llena un club marcado como demo';
  end if;

  update app.billing_policies set effective_from = v_inicio where organization_id = p_org;

  for c in select * from app.categories where organization_id = p_org and status = 'active' order by sort_order loop
    v_cat_idx := v_cat_idx + 1;
    for i in 1..10 loop
      n := n + 1;
      v_sex := case when i in (4, 9) then 'F' else 'M' end;
      v_first := case when v_sex = 'F' then v_nombres_m[1 + (n % array_length(v_nombres_m, 1))] else v_nombres_h[1 + (n % array_length(v_nombres_h, 1))] end;
      v_last := v_apellidos[1 + ((n * 7) % array_length(v_apellidos, 1))] || ' ' || v_apellidos[1 + ((n * 11 + 3) % array_length(v_apellidos, 1))];
      v_birth := (v_hoy - make_interval(years => 5 + v_cat_idx * 2, days => (n * 37) % 330))::date;
      insert into app.players (organization_id, code, first_name, last_name, birth_date, status, category, jersey_number, sex,
                               joined_at, registered_at, notes, created_at, updated_at)
      values (p_org, private.next_player_code(p_org), v_first, v_last, v_birth, 'active', c.name, (i + 1)::text, v_sex,
              v_inicio, v_inicio, 'Club demo', now(), now())
      returning id into v_player;
      insert into app.guardians (organization_id, first_name, last_name, phone, relationship_default, status)
      values (p_org, case when n % 3 = 0 then 'Jorge' else 'Ana' end, split_part(v_last, ' ', 1),
              '5200000' || lpad(n::text, 5, '0'), case when n % 3 = 0 then 'Papá' else 'Mamá' end, 'active')
      returning id into v_guardian;
      insert into app.player_guardians (player_id, guardian_id, relationship, is_primary, can_pickup, receives_billing, organization_id)
      values (v_player, v_guardian, case when n % 3 = 0 then 'Papá' else 'Mamá' end, true, true, true, p_org);
      insert into app.player_enrollments (organization_id, player_id, category_id, starts_on, status, notes)
      values (p_org, v_player, c.id, v_inicio, 'active', 'Club demo');
      insert into app.billing_profiles (organization_id, player_id, base_monthly_fee, billing_start, billing_day, is_exempt, status, needs_review)
      values (p_org, v_player, coalesce(c.monthly_fee, 600), v_inicio, 1, false, 'active', false);
    end loop;
  end loop;

  -- Mensualidades de 4 meses con el motor real.
  for i in 0..3 loop
    perform app.generate_monthly_charges(p_org, (v_inicio + make_interval(months => i))::date);
  end loop;

  -- Pagos: los meses pasados casi todos al corriente; el mes en curso, a medias.
  for r in select ch.*, row_number() over (order by ch.player_id, ch.billing_period) rn,
                  (select pg.guardian_id from app.player_guardians pg where pg.player_id = ch.player_id limit 1) gid
             from app.charges ch where ch.organization_id = p_org and ch.status = 'posted' loop
    if (r.billing_period < date_trunc('month', v_hoy)::date and r.rn % 9 <> 0)
       or (r.billing_period = date_trunc('month', v_hoy)::date and r.rn % 2 = 0) then
      v_pago := v_pago + 1;
      insert into app.payments (organization_id, player_id, payer_guardian_id, amount, payment_date, method, concept, status, source,
                                payment_purpose, credit_status, payer_type, reconciliation_status, collected_by_name, created_at, updated_at)
      values (p_org, r.player_id, r.gid, r.amount, least(v_hoy, r.due_date - (r.rn % 6)::int),
              case when r.rn % 3 = 0 then 'Efectivo' else 'Transferencia' end, 'Mensualidad', 'posted', 'demo',
              'billing', 'available', 'guardian', 'approved', 'Demo', now(), now());
    end if;
  end loop;
  perform app.apply_available_credit(p_org);
  perform app.assess_late_fees(p_org, v_hoy);

  -- Asistencia: martes y jueves de las últimas 6 semanas.
  for c in select * from app.categories where organization_id = p_org and status = 'active' order by sort_order loop
    for v_semana in 1..6 loop
      foreach v_dia in array array[(date_trunc('week', v_hoy) - make_interval(weeks => v_semana) + interval '1 day')::date,
                                   (date_trunc('week', v_hoy) - make_interval(weeks => v_semana) + interval '3 days')::date] loop
        insert into app.sessions (organization_id, session_type, category_id, starts_at, ends_at, location, title, status, created_at, updated_at)
        values (p_org, 'training', c.id, (v_dia + time '18:00') at time zone 'America/Mexico_City',
                (v_dia + time '19:30') at time zone 'America/Mexico_City', 'Cancha principal', 'Entrenamiento', 'completed', now(), now())
        returning id into v_ses;
        insert into app.attendance_records (organization_id, session_id, player_id, status, recorded_at, updated_at)
        select p_org, v_ses, p.id,
               case when p.rn = 4 and v_semana <= 2 then 'absent'          -- racha de faltas reciente
                    when p.rn = 8 and (v_semana + extract(dow from v_dia)::int) % 2 = 0 then 'absent'
                    when (p.rn * v_semana + extract(dow from v_dia)::int) % 13 = 0 then 'late'
                    when (p.rn * v_semana) % 17 = 0 then 'excused'
                    else 'present' end,
               (v_dia + time '18:10') at time zone 'America/Mexico_City', now()
        from (select pl.id, row_number() over (order by pl.code) rn from app.players pl
               where pl.organization_id = p_org and pl.category = c.name) p;
      end loop;
    end loop;
    -- La siguiente semana, ya en el calendario.
    foreach v_dia in array array[(date_trunc('week', v_hoy) + interval '8 days')::date, (date_trunc('week', v_hoy) + interval '10 days')::date] loop
      insert into app.sessions (organization_id, session_type, category_id, starts_at, ends_at, location, title, status, created_at, updated_at)
      values (p_org, 'training', c.id, (v_dia + time '18:00') at time zone 'America/Mexico_City',
              (v_dia + time '19:30') at time zone 'America/Mexico_City', 'Cancha principal', 'Entrenamiento', 'scheduled', now(), now());
    end loop;

    -- Dos partidos por categoría, con goles y asistencias.
    for v_semana in 1..2 loop
      select array_agg(id order by code) into v_conv from (select id, code from app.players where organization_id = p_org and category = c.name order by code limit 9) x;
      v_gf := (v_semana + v_cat_idx) % 4; v_ga := (v_semana * 2 + c.sort_order / 10) % 3;
      select coalesce(jsonb_agg(jsonb_build_object('scorer', v_conv[1 + (g * 2) % 9], 'assist', case when g % 2 = 0 then v_conv[1 + (g * 2 + 3) % 9] end)), '[]'::jsonb)
        into v_goles from generate_series(1, v_gf) g;
      insert into app.matches (organization_id, match_date, category, opponent, tournament, result, goals_for, goals_against, status, metadata, created_at, updated_at)
      values (p_org, (v_hoy - make_interval(weeks => v_semana * 2, days => (date_part('dow', v_hoy)::int + 1) % 7))::date, c.name,
              v_rivales[1 + ((v_semana + c.sort_order / 10) % array_length(v_rivales, 1))], 'Liga Municipal',
              v_gf || '-' || v_ga, v_gf, v_ga, 'completed',
              jsonb_build_object('venue', case when v_semana = 1 then 'local' else 'visita' end, 'goals', v_goles), now(), now())
      returning id into v_match;
      insert into app.match_callups (organization_id, match_id, player_id, selected, created_at, updated_at)
      select p_org, v_match, pid, true, now(), now() from unnest(v_conv) pid;
      insert into app.match_player_stats (organization_id, match_id, player_id, player_name_snapshot, attended, starter, minutes_played,
                                          goals, assists, yellow_cards, red_cards, saves, clean_sheet, metadata, created_at, updated_at)
      select p_org, v_match, pl.id, trim(pl.first_name || ' ' || coalesce(pl.last_name, '')), true, false, 0,
             (select count(*) from jsonb_array_elements(v_goles) g where g->>'scorer' = pl.id::text),
             (select count(*) from jsonb_array_elements(v_goles) g where g->>'assist' = pl.id::text),
             0, 0, 0, false, jsonb_build_object('tiempo', case when pl.id = v_conv[9] then 'poco' else 'medio' end), now(), now()
      from app.players pl where pl.id = any(v_conv);
    end loop;
  end loop;

  -- Documentos y datos de pago completos: el demo no debe enseñar pendientes.
  update app.consent_documents
     set body = replace(replace(replace(body,
           '[PENDIENTE: calle, número, colonia y código postal]', 'Av. de la Cancha 100, Col. Centro, C.P. 37000'),
           '[PENDIENTE: correo de contacto del club]', 'contacto@halcones-demo.mx'),
           '[PENDIENTE: ciudad y estado]', 'León, Guanajuato'),
         updated_at = now()
   where organization_id = p_org and body like '%[PENDIENTE:%';
  update public.organizations
     set settings = settings || jsonb_build_object('paymentInstructions', jsonb_build_object(
           'methods', jsonb_build_array('Transferencia', 'Efectivo'),
           'transfer', jsonb_build_object('bank', 'Banco Demo', 'clabe', '002180000000000009', 'holder', 'Halcones Demo AC'))),
         updated_at = now()
   where id = p_org;

  return jsonb_build_object('jugadores', n, 'pagos', v_pago,
    'cargos', (select count(*) from app.charges where organization_id = p_org),
    'sesiones', (select count(*) from app.sessions where organization_id = p_org),
    'partidos', (select count(*) from app.matches where organization_id = p_org));
end $function$;
revoke all on function private.siembra_club_demo(uuid) from public, anon, authenticated;

create or replace function private.create_demo_club(p_owner_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v_slug text := 'demo-halcones'; v_n int := 1; v_res jsonb; v_org uuid; v_datos jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_n := v_n + 1; v_slug := 'demo-halcones-' || v_n;
  end loop;
  v_res := private.provision_club(jsonb_build_object(
    'name', 'Halcones FC (demo)', 'slug', v_slug, 'city', 'León, Gto.', 'planCode', 'seleccion', 'founder', false,
    'colors', jsonb_build_object('primary', '#1B2A41', 'secondary', '#2E7D5B', 'accent', '#E0B23A'),
    'categories', jsonb_build_array(
      jsonb_build_object('name', 'Sub-8', 'monthlyFee', 650), jsonb_build_object('name', 'Sub-10', 'monthlyFee', 700),
      jsonb_build_object('name', 'Sub-12', 'monthlyFee', 750), jsonb_build_object('name', 'Sub-14', 'monthlyFee', 800)),
    'chargeDay', 1, 'dueDay', 5, 'lateFee', 100,
    'owner', jsonb_build_object('name', 'Demo', 'email', p_owner_email)));
  v_org := (v_res->>'organizationId')::uuid;
  update public.organizations set settings = settings || '{"demo": true}'::jsonb where id = v_org;
  v_datos := private.siembra_club_demo(v_org);
  return v_res || jsonb_build_object('demo', true, 'datos', v_datos);
end $function$;
revoke all on function private.create_demo_club(text) from public, anon, authenticated;

create or replace function public.v2_create_demo_club(owner_email text)
returns jsonb language sql security definer set search_path = ''
as $$ select private.create_demo_club(owner_email) $$;
revoke all on function public.v2_create_demo_club(text) from public, anon;
grant execute on function public.v2_create_demo_club(text) to authenticated;