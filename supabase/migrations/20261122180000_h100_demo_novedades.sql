-- h100 · El demo para vender con todo lo nuevo (22/11/2026).
-- Presidencia: "ya tenemos nuestro demo... con todas las adecuaciones nuevas"
-- y "sí, métele datos". Halcones FC (demo) ya tenía jugadores, pagos,
-- asistencia y partidos; le faltaba lo que se hizo después: tienda y pedidos,
-- becas, patrocinadores, prospectos, una visoría y evaluaciones.
--
-- Sólo escribe en un club marcado como demo (settings.demo) y sólo una vez
-- (settings.demoNovedades). Teléfonos inválidos a propósito, como el demo
-- original: nadie real recibe un WhatsApp desde aquí.
begin;

create or replace function private.siembra_demo_novedades(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'app', 'private' as $function$
declare
  v_hoy date := current_date; v_j uuid[]; v_p uuid; v_o uuid; v_s uuid; v_c uuid; v_slug text := 'visoria-demo';
  v_prod uuid[] := '{}'; i int; v_n int := 0;
  v_nombres text[] := array['Iker','Gael','Mateo','Thiago','Emiliano','Santiago','Valentina','Leonardo','Regina','Bruno','Romina','Tadeo'];
  v_apellidos text[] := array['Soto','Rivas','Lara','Campos','Mejía','Ortega','Nava','Salinas','Prado','Ibarra','Vega','Duarte'];
  v_veredictos text[] := array['Invitar a prueba','Invitar a prueba','Volver a observar','No continuar','Invitar a prueba'];
  v_status_ped text[] := array['pending_payment','partial_payment','paid','in_production','ready','delivered','paid','pending_payment'];
begin
  if not coalesce((select (settings->>'demo')::boolean from public.organizations where id = p_org), false) then
    raise exception 'Sólo se llena un club marcado como demo';
  end if;
  if coalesce((select (settings->>'demoNovedades')::boolean from public.organizations where id = p_org), false) then
    return jsonb_build_object('ya', true);
  end if;

  select array_agg(id order by first_name, last_name) into v_j from app.players where organization_id = p_org and archived_at is null;
  if coalesce(array_length(v_j, 1), 0) < 12 then return jsonb_build_object('sinJugadores', true); end if;

  -- Tienda: cuatro productos.
  insert into app.products(organization_id, name, product_type, category, price, cost, active, lead_days, personalizable, description)
  values (p_org, 'Kit oficial (playera, short y medias)', 'kit', 'Uniformes', 1450, 820, true, 21, true, 'Con número y nombre.'),
         (p_org, 'Playera de entrenamiento', 'product', 'Entrenamiento', 390, 180, true, 14, false, null),
         (p_org, 'Sudadera del club', 'product', 'Ropa', 690, 340, true, 14, false, null),
         (p_org, 'Balón oficial No. 5', 'product', 'Equipo', 520, 290, true, 3, false, null);
  select array_agg(id order by price desc) into v_prod from app.products where organization_id = p_org;

  -- Pedidos en cada paso.
  for i in 1..8 loop
    insert into app.orders(organization_id, player_id, customer_name, customer_phone, subtotal, discount, total, status, source, notes, created_at, due_date)
    values (p_org, v_j[i], (select first_name || ' ' || last_name from app.players where id = v_j[i]), '5200000' || lpad((900 + i)::text, 5, '0'),
            case when i % 2 = 0 then 1450 else 1080 end, 0, case when i % 2 = 0 then 1450 else 1080 end,
            v_status_ped[i], 'demo', 'Pedido de ejemplo', now() - (i * interval '3 days'), v_hoy + (14 - i))
    returning id into v_o;
    if i % 2 = 0 then
      insert into app.order_items(organization_id, order_id, product_id, description, quantity, unit_price, unit_cost, attributes)
      values (p_org, v_o, v_prod[1], 'Kit oficial (playera, short y medias)', 1, 1450, 820, jsonb_build_object('talla', 'CH', 'numero', (i + 4)::text));
    else
      insert into app.order_items(organization_id, order_id, product_id, description, quantity, unit_price, unit_cost, attributes)
      values (p_org, v_o, v_prod[2], 'Sudadera del club', 1, 690, 340, jsonb_build_object('talla', 'M')),
             (p_org, v_o, v_prod[4], 'Playera de entrenamiento', 1, 390, 180, jsonb_build_object('talla', 'M'));
    end if;
    v_n := v_n + 1;
  end loop;

  -- Patrocinadores: dos activos, uno negociando, uno por buscar.
  insert into app.sponsors(organization_id, name, sponsor_type, contact_name, phone, status, tier, stage, potential_value, next_action, next_action_at)
  values (p_org, 'Ferretería El Halcón', 'empresa', 'Rosa Núñez', '520000099001', 'active', 'oro', 'active', 60000, 'Entregar fotos del torneo', now() + interval '5 days')
  returning id into v_s;
  insert into app.sponsor_agreements(organization_id, sponsor_id, starts_on, ends_on, monetary_value, status, benefit, deliverables)
  values (p_org, v_s, v_hoy - 60, v_hoy + 300, 60000, 'active', 'Logo en la playera y en la cancha', '["Logo en el pecho de la playera", "Lona en la cancha", "2 publicaciones al mes"]'::jsonb);
  insert into app.sponsors(organization_id, name, sponsor_type, contact_name, phone, status, tier, stage, potential_value, next_action, next_action_at)
  values (p_org, 'Clínica Deportiva Movimiento', 'empresa', 'Dr. Luis Aranda', '520000099002', 'active', 'plata', 'active', 24000, 'Renovar convenio', now() + interval '20 days')
  returning id into v_s;
  insert into app.sponsor_agreements(organization_id, sponsor_id, starts_on, ends_on, monetary_value, status, benefit, discount_percent, deliverables)
  values (p_org, v_s, v_hoy - 120, v_hoy + 30, 24000, 'active', '15% en consultas para familias del club', 15, '["Logo en la manga", "Valoración médica de inicio de temporada"]'::jsonb);
  insert into app.sponsors(organization_id, name, sponsor_type, contact_name, phone, status, stage, potential_value, next_action, next_action_at)
  values (p_org, 'Tacos Don Beto', 'negocio', 'Alberto Ruiz', '520000099003', 'negotiation', 'negotiation', 12000, 'Mandar propuesta', now() + interval '2 days'),
         (p_org, 'Gimnasio Fuerza Norte', 'empresa', null, null, 'prospect', 'prospect', 18000, 'Primer contacto', now() + interval '7 days');

  -- Becas y descuentos.
  insert into app.player_benefits(organization_id, player_id, benefit_type, calculation_type, percentage, starts_on, active, priority, scholarship_modality, funding_source_name, notes, next_review_at)
  values (p_org, v_j[9], 'scholarship_partial', 'percentage', 50, v_hoy - 90, true, 1, 'deportiva', 'Club', 'Beca deportiva de ejemplo', v_hoy + 90),
         (p_org, v_j[10], 'scholarship_partial', 'percentage', 30, v_hoy - 60, true, 1, 'apoyo_familiar', 'Club', 'Apoyo familiar de ejemplo', v_hoy + 120),
         (p_org, v_j[11], 'sibling_discount', 'percentage', 10, v_hoy - 150, true, 2, null, null, 'Descuento por hermano', null),
         (p_org, v_j[12], 'sponsor_funded', 'percentage', 100, v_hoy - 30, true, 1, null, 'Ferretería El Halcón', 'La paga un patrocinador', v_hoy + 180);

  -- Visoría de ejemplo (ya terminada) con sus inscritos, quién llegó y qué dijo el visor.
  insert into app.visoria_campaigns(organization_id, slug, title, dates_label, location, starts_on, capacity, is_open)
  values (p_org, v_slug, 'Visoría de ejemplo', 'Sábado de visoría', 'Cancha del club', v_hoy - 14, 30, false)
  returning id into v_c;
  for i in 1..12 loop
    insert into app.prospects(organization_id, first_name, last_name, birth_date, phone, guardian_name, source, source_campaign, source_channel,
      interest_type, registration_type, purpose, status, photo_required, privacy_notice_version, data_consent, data_consent_at, folio,
      dominant_foot, sex, category_interest, metadata, created_at, updated_at)
    values (p_org, v_nombres[i], v_apellidos[i], make_date(2012 + (i % 5), 1 + (i % 12), 1 + i), '5200000' || lpad((800 + i)::text, 5, '0'),
      'Mamá de ' || v_nombres[i], 'public_form', v_slug, case when i % 3 = 0 then 'Recomendación' when i % 3 = 1 then 'Instagram' else 'WhatsApp' end,
      'player', case when i = 6 then 'goalkeeper' else 'player' end, 'Visoría', case when i <= 3 then 'contacted' else 'new' end, false,
      'demo', true, now(), private.next_prospect_folio(p_org), case when i % 4 = 0 then 'left' else 'right' end, case when i in (7, 9, 11) then 'F' else 'M' end,
      null, jsonb_build_object('visoria', jsonb_build_object('campaign', v_slug, 'posicion', case when i = 6 then 'Portero' when i % 3 = 0 then 'Delantero' when i % 3 = 1 then 'Medio' else 'Defensa' end)
        || case when i <= 9 then jsonb_build_object('llegoAt', (v_hoy - 14)::timestamptz + interval '9 hours' + (i * interval '4 minutes')) else '{}'::jsonb end),
      now() - interval '30 days', now())
    returning id into v_p;
    if i <= 5 then
      insert into app.scouting_reports(organization_id, prospect_id, observed_name, observed_at, observed_location, position, verdict, status,
        technical_score, physical_score, tactical_score, mental_score, notes)
      values (p_org, v_p, v_nombres[i] || ' ' || v_apellidos[i], (v_hoy - 14)::timestamptz + interval '11 hours', 'Visoría de ejemplo',
        case when i % 3 = 0 then 'Delantero' when i % 3 = 1 then 'Medio' else 'Defensa' end, v_veredictos[i], 'open', 4, 3 + (i % 2), 3, 4, 'Evaluación de ejemplo');
    end if;
  end loop;

  -- Prospectos de la academia en cada etapa.
  for i in 1..6 loop
    insert into app.prospects(organization_id, first_name, last_name, birth_date, phone, guardian_name, source, source_campaign, source_channel,
      interest_type, registration_type, purpose, status, photo_required, privacy_notice_version, data_consent, data_consent_at, folio, next_action_at, created_at, updated_at)
    values (p_org, v_nombres[13 - i], v_apellidos[i], make_date(2014 + (i % 4), 3, 10 + i), '5200000' || lpad((700 + i)::text, 5, '0'),
      'Papá de ' || v_nombres[13 - i], 'public_form', 'registro_general', case when i % 2 = 0 then 'Facebook' else 'Recomendación' end,
      'player', 'player', 'Academia', (array['new','contacted','trial_scheduled','trial_completed','new','not_continuing'])[i], false,
      'demo', true, now(), private.next_prospect_folio(p_org), now() + (i * interval '1 day'), now() - (i * interval '4 days'), now());
  end loop;

  update public.organizations set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('demoNovedades', true) where id = p_org;
  return jsonb_build_object('pedidos', v_n, 'productos', 4, 'patrocinadores', 4, 'becas', 4, 'visoria', 12, 'evaluaciones', 5, 'prospectosAcademia', 6);
end $function$;
revoke all on function private.siembra_demo_novedades(uuid) from public, anon, authenticated;

select private.siembra_demo_novedades(id) from public.organizations where slug = 'demo-halcones';

commit;
