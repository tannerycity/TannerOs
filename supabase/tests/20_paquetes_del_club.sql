-- Prueba 20 · FLUJO + PERMISOS · ESCRIBE Y SE REVIERTE
--
-- h62: paquetes del club, becas que descuentan solas y precios por fecha.
--   - Un portero que pagaba club + academia queda en "Porteros 4 días" al
--     precio del paquete y la academia pasa a $0.
--   - "Porteros 2 días": no cobra dos veces el mes y no sale en la lista de
--     su categoría.
--   - Una beca "informativa" descuenta sola; renovarla da 3 meses; vencida
--     deja de descontar.
--   - Un precio del mes siguiente no cambia el mes de antes.
--   - Sin motivo, paquete de otro grupo, sin precio o precio en un mes ya
--     cobrado: no. anon: no.
-- Todo se revierte al final.

do $$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_pres uuid; v_fallas text[] := '{}'; v_ok int := 0; v_r jsonb;
  v_gk uuid; v_solo uuid; v_beca uuid; v_b uuid; v_ses uuid; v_n int; v_t4 uuid;
  v_mes date := date_trunc('month', (now() at time zone 'America/Mexico_City')::date)::date;
  v_sig date := (date_trunc('month', (now() at time zone 'America/Mexico_City')::date) + interval '1 month')::date;
begin
  select m.user_id into v_pres from public.organization_memberships m join public.profiles pf on pf.user_id = m.user_id and pf.active
    where m.organization_id = v_org and m.active and m.role = 'Presidencia' limit 1;
  select id into v_t4 from app.club_packages where organization_id = v_org and code = 'tanner_4';
  -- Un portero con mensualidad de club y otro sin ella ("solo porteros").
  select e.player_id into v_gk from app.academy_enrollments e join app.academies a on a.id = e.academy_id
    join app.billing_profiles bp on bp.player_id = e.player_id join app.players p on p.id = e.player_id and p.status = 'active'
    where e.organization_id = v_org and e.status = 'active' and a.academy_type = 'goalkeeper' and bp.base_monthly_fee > 0 and bp.package_id is null limit 1;
  select e.player_id into v_solo from app.academy_enrollments e join app.academies a on a.id = e.academy_id
    join app.billing_profiles bp on bp.player_id = e.player_id join app.players p on p.id = e.player_id and p.status = 'active'
    where e.organization_id = v_org and e.status = 'active' and a.academy_type = 'goalkeeper' and bp.base_monthly_fee = 0 and bp.package_id is null limit 1;
  -- Un Tanner (no Baby) con beca parcial de monto fijo, sin paquete.
  select b.player_id, b.id into v_beca, v_b from app.player_benefits b join app.billing_profiles bp on bp.player_id = b.player_id
    join app.player_enrollments pe on pe.player_id = b.player_id and pe.status = 'active' join app.categories c on c.id = pe.category_id
    where b.organization_id = v_org and b.active and b.benefit_type = 'scholarship_partial' and b.fixed_amount > 0 and bp.package_id is null
      and private.category_package_group(c.name, c.package_group) = 'tanner' and bp.needs_review = false limit 1;
  begin
    perform set_config('role', 'anon', true);
    begin perform public.v2_set_player_package(v_org, v_gk, 'porteros_4', 'prueba QA'); v_fallas := v_fallas || 'anon puso paquete'::text;
    exception when others then v_ok := v_ok + 1; end;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pres, 'role', 'authenticated')::text, true);

    if v_gk is not null then
      perform set_config('role', 'authenticated', true);
      v_r := public.v2_set_player_package(v_org, v_gk, 'porteros_4', 'Prueba QA porteros');
      perform set_config('role', 'postgres', true);
      if (v_r->>'fee')::numeric <> (v_r->>'price')::numeric - private.package_discount(v_org, v_gk, (v_r->>'price')::numeric, (v_r->>'from')::date)
         or exists (select 1 from app.academy_enrollments e join app.academies a on a.id = e.academy_id
                    where e.player_id = v_gk and e.status = 'active' and a.academy_type = 'goalkeeper' and coalesce(e.agreed_fee, -1) <> 0)
      then v_fallas := v_fallas || ('Porteros 4 días: ' || v_r::text); else v_ok := v_ok + 1; end if;
    end if;

    if v_solo is not null then
      perform set_config('role', 'authenticated', true);
      v_r := public.v2_set_player_package(v_org, v_solo, 'porteros_2', 'Prueba QA solo porteros');
      perform set_config('role', 'postgres', true);
      v_n := app.generate_monthly_charges(v_org, v_mes);
      if (select count(*) from app.charges where player_id = v_solo and charge_type = 'monthly_fee' and billing_period = v_mes and voided_at is null) > 1
      then v_fallas := v_fallas || 'Porteros 2 días cobró doble el mes'::text; else v_ok := v_ok + 1; end if;
      select s.id into v_ses from app.sessions s join app.player_enrollments pe on pe.category_id = s.category_id and pe.player_id = v_solo and pe.status = 'active'
        where s.academy_id is null order by s.starts_at desc limit 1;
      if v_ses is not null and exists (select 1 from private.session_roster_ids(v_org, v_ses) x where x.player_id = v_solo)
      then v_fallas := v_fallas || 'Porteros 2 días salió en su categoría'::text; else v_ok := v_ok + 1; end if;
    end if;

    if v_beca is not null then
      perform set_config('role', 'authenticated', true);
      v_r := public.v2_set_player_package(v_org, v_beca, 'tanner_4', 'Prueba QA beca');
      perform set_config('role', 'postgres', true);
      if (select calculation_type from app.player_benefits where id = v_b) = 'informational' or (v_r->>'fee')::numeric >= (v_r->>'price')::numeric
      then v_fallas := v_fallas || ('Beca no descontó: ' || v_r::text); else v_ok := v_ok + 1; end if;

      perform set_config('role', 'authenticated', true);
      v_r := public.v2_renew_benefit(v_org, v_b, 'Prueba QA renovar');
      perform set_config('role', 'postgres', true);
      -- Renovada: vence al cierre de un mes, al menos 2 meses después de hoy.
      if (v_r->>'endsOn')::date < current_date + 59 or (v_r->>'endsOn')::date <> (date_trunc('month', (v_r->>'endsOn')::date) + interval '1 month - 1 day')::date
      then v_fallas := v_fallas || ('Renovar: ' || v_r::text); else v_ok := v_ok + 1; end if;
      if private.package_discount(v_org, v_beca, 1000, ((v_r->>'endsOn')::date + interval '1 month')::date) <> 0
      then v_fallas := v_fallas || 'Beca vencida siguió descontando'::text; else v_ok := v_ok + 1; end if;

      perform set_config('role', 'authenticated', true);
      perform public.v2_set_package_price(v_org, 'tanner_4', 1234, (v_sig + interval '1 month')::date, 'Prueba QA');
      perform set_config('role', 'postgres', true);
      if private.package_price(v_t4, v_sig) = 1234 or private.package_price(v_t4, (v_sig + interval '1 month')::date) <> 1234
      then v_fallas := v_fallas || 'Precio por fecha'::text; else v_ok := v_ok + 1; end if;

      perform set_config('role', 'authenticated', true);
      begin perform public.v2_set_player_package(v_org, v_beca, 'baby_3', 'Prueba QA grupo'); v_fallas := v_fallas || 'Baby a un Tanner'::text;
      exception when others then v_ok := v_ok + 1; end;
      begin perform public.v2_set_player_package(v_org, v_beca, 'tanner_2', 'Prueba QA sin precio'); v_fallas := v_fallas || 'Paquete sin precio'::text;
      exception when others then v_ok := v_ok + 1; end;
      begin perform public.v2_set_player_package(v_org, v_beca, 'porteros_4', 'no'); v_fallas := v_fallas || 'Sin motivo'::text;
      exception when others then v_ok := v_ok + 1; end;
      begin perform public.v2_set_package_price(v_org, 'tanner_4', 1, v_mes, 'Prueba QA'); v_fallas := v_fallas || 'Precio en el mes ya cobrado'::text;
      exception when others then v_ok := v_ok + 1; end;
      perform set_config('role', 'postgres', true);
    end if;
    raise exception 'REVIERTE';
  exception when others then
    if sqlerrm <> 'REVIERTE' then v_fallas := v_fallas || ('Reventó: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);
  if array_length(v_fallas, 1) > 0 then raise exception 'PRUEBA FALLÓ: % (pasaron %)', array_to_string(v_fallas, ' | '), v_ok; end if;
  raise notice 'PRUEBA OK · 20 · % comprobaciones: paquetes, becas que descuentan solas, precios por fecha y porteros', v_ok;
end $$;
