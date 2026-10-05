-- Estacionamiento en un solo movimiento: alta, cobro y entrega
--
-- LO QUE PIDIÓ EL CLUB (05/10/2026): que cualquiera de administración, sin
-- saber de tecnología, dé un gafete "en 3 clicks". Regla de Presidencia:
-- primero se paga y luego se entrega; sin costo sólo con motivo (patrocinio,
-- staff…).
--
-- ANTES eran cuatro trámites: alta (queda "Solicitado"), autorizar (genera el
-- cargo), ir a Taquilla a cobrar (y el pago se abonaba al adeudo MÁS VIEJO de
-- la familia, no necesariamente al gafete) y entregar.
--
-- AHORA private.command_parking_express hace todo en una transacción:
--   1. alta (o toma la solicitud que mandó la familia desde el portal),
--   2. autoriza (cargo al Tanner, o cortesía con motivo),
--   3. cobra y aplica el pago EXACTAMENTE al cargo del gafete; si el portador
--      no es Tanner (profe, proveedor…) entra como ingreso de Taquilla con
--      categoría Estacionamiento,
--   4. entrega y deja el folio.
-- Si algo falla, no queda nada a medias. Reutiliza las funciones de siempre
-- (create/approve/issue), así que candados, folios y bitácora no cambian.
--
-- CANDADOS: escribir en Estacionamiento (o Cobranza/Contabilidad). Cobrar
-- además exige poder cobrar (Taquilla, Cobranza o Contabilidad); hoy todos los
-- que escriben en Estacionamiento pueden.
--
-- IDEMPOTENTE: la misma llave no cobra dos veces (doble toque, red lenta).
--
-- REVERSIBLE: drop de las dos funciones; nada más cambia.

create or replace function private.command_parking_express(
  p_organization_id uuid, p_pass_id uuid, p_holder_kind text, p_player_id uuid,
  p_holder_name text, p_holder_phone text, p_plate text, p_vehicle text,
  p_pass_type text, p_courtesy boolean, p_courtesy_reason text,
  p_method text, p_reference text, p_collected_by_name text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  pp app.parking_passes; v_id uuid; v_key text := btrim(coalesce(p_idempotency_key,''));
  v_courtesy boolean := coalesce(p_courtesy,false);
  v_method text := lower(btrim(coalesce(p_method,'')));
  v_due numeric; v_payment uuid; v_paid numeric := 0; v_issue jsonb; v_prev uuid;
  v_concepto text; v_folio text;
begin
  if not private.has_any_module_access(p_organization_id, array['estacionamiento','billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  if length(v_key) < 8 then raise exception 'Idempotency key required'; end if;

  -- Doble toque: si esta llave ya entregó un gafete, regresa el mismo resultado.
  select e.pass_id into v_prev from app.parking_pass_events e
   where e.organization_id = p_organization_id and e.event = 'issued'
     and e.payload->>'express_key' = v_key limit 1;
  if v_prev is not null then
    select * into pp from app.parking_passes where id = v_prev;
    return jsonb_build_object('ok', true, 'pass_id', pp.id, 'folio', pp.folio,
      'courtesy', pp.is_courtesy, 'paid', 0, 'repeated', true);
  end if;

  if not v_courtesy then
    if not private.has_any_module_access(p_organization_id, array['taquilla','billing','accounting'], true)
      then raise exception 'Tu usuario no puede cobrar; pide que lo cobren en Taquilla'; end if;
    if v_method not in ('cash','transfer','card')
      then raise exception 'Elige cómo pagó: efectivo, transferencia o tarjeta'; end if;
  end if;

  -- 1. Alta, o la solicitud que ya existe.
  if p_pass_id is null then
    v_id := (private.command_create_parking(p_organization_id, p_holder_kind, p_player_id,
               p_holder_name, p_holder_phone, p_plate, p_vehicle, v_courtesy,
               p_courtesy_reason, coalesce(p_pass_type,'tanner'))->>'id')::uuid;
  else
    v_id := p_pass_id;
  end if;
  select * into pp from app.parking_passes
   where id = v_id and organization_id = p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status not in ('requested','approved')
    then raise exception 'Ese gafete ya se entregó o está cerrado'; end if;

  -- 2. Autorizar.
  if pp.status = 'requested' then
    if v_courtesy or pp.player_id is not null then
      perform private.command_approve_parking(p_organization_id, pp.id, null,
        v_courtesy, p_courtesy_reason, p_pass_type);
    else
      -- Portador sin Tanner que sí paga: no hay cuenta a la cual cargar, así
      -- que se autoriza sin cargo y el dinero entra como ingreso (paso 3).
      v_folio := coalesce(pp.folio, app.next_parking_folio(p_organization_id, pp.season,
        case when lower(coalesce(btrim(p_pass_type),'')) in ('vip','tanner') then lower(btrim(p_pass_type)) else pp.pass_type end));
      update app.parking_passes
         set status='approved', approved_at=now(),
             pass_type = case when lower(coalesce(btrim(p_pass_type),'')) in ('vip','tanner') then lower(btrim(p_pass_type)) else pass_type end,
             price = app.parking_pass_price(case when lower(coalesce(btrim(p_pass_type),'')) in ('vip','tanner') then lower(btrim(p_pass_type)) else pass_type end),
             folio = v_folio, expires_on = coalesce(expires_on, make_date(season,12,31)), updated_at=now()
       where id = pp.id;
      perform app.log_parking_event(pp.id, 'approved', 'staff', null,
        jsonb_build_object('folio', v_folio, 'courtesy', false, 'sin_cuenta', true));
    end if;
    select * into pp from app.parking_passes where id = v_id;
  end if;

  -- 3. Cobrar, si no es cortesía. Se cobra lo que debe ESTE gafete.
  if not pp.is_courtesy then
    v_concepto := concat('Gafete de estacionamiento ', pp.season,
                         case when pp.vehicle_plate is not null then ' · '||pp.vehicle_plate else '' end);
    if pp.charge_id is not null then
      select cb.balance_due into v_due from app.charge_balances cb where cb.id = pp.charge_id;
      if coalesce(v_due,0) > 0 then
        insert into app.payments(organization_id, player_id, amount, payment_date, method, reference,
          concept, status, source, category, idempotency_key, payer_type, payment_purpose,
          credit_status, collected_by_name, created_by_user_id, created_at, updated_at)
        values(p_organization_id, pp.player_id, v_due, current_date, v_method,
          nullif(btrim(coalesce(p_reference,'')),''), v_concepto, 'posted', 'tanneros_v2',
          'Estacionamiento', v_key, 'guardian', 'billing', 'available',
          nullif(btrim(coalesce(p_collected_by_name,'')),''), auth.uid(), now(), now())
        returning id into v_payment;
        insert into app.payment_allocations(organization_id, payment_id, charge_id, amount)
        values(p_organization_id, v_payment, pp.charge_id, v_due);
        insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id,
          payload, actor_user_id, request_id)
        values(p_organization_id, 'PaymentPosted', 'payment', v_payment,
          jsonb_build_object('player_id', pp.player_id, 'amount', v_due, 'payment_date', current_date,
            'payerType', 'guardian', 'collectedBy', nullif(btrim(coalesce(p_collected_by_name,'')),''),
            'parkingPassId', pp.id, 'chargeId', pp.charge_id),
          auth.uid(), v_key);
        v_paid := v_due;
      end if;
    elsif pp.player_id is null then
      v_payment := private.command_post_general_income(p_organization_id, pp.price, current_date,
        v_method, 'Estacionamiento', v_concepto, pp.holder_name, p_reference, v_key, null);
      v_paid := pp.price;
    end if;
    if v_payment is not null then
      perform app.log_parking_event(pp.id, 'paid', 'staff', null,
        jsonb_build_object('payment_id', v_payment, 'amount', v_paid, 'method', v_method));
    end if;
  end if;

  -- 4. Entregar.
  v_issue := private.command_issue_parking(p_organization_id, pp.id, null);
  update app.parking_pass_events set payload = payload || jsonb_build_object('express_key', v_key)
   where id = (select e.id from app.parking_pass_events e
               where e.pass_id = pp.id and e.event = 'issued' order by e.created_at desc limit 1);

  return jsonb_build_object('ok', true, 'pass_id', pp.id, 'folio', v_issue->>'folio',
    'courtesy', pp.is_courtesy, 'paid', v_paid, 'method', case when v_paid > 0 then v_method end);
end $function$;

revoke all on function private.command_parking_express(uuid,uuid,text,uuid,text,text,text,text,text,boolean,text,text,text,text,text) from public;

create or replace function public.v2_parking_express(
  organization_id uuid, pass_id uuid, holder_kind text, player_id uuid,
  holder_name text, holder_phone text, plate text, vehicle text,
  pass_type text, courtesy boolean, courtesy_reason text,
  method text, reference text, collected_by_name text, idempotency_key text)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$ select private.command_parking_express(organization_id, pass_id, holder_kind, player_id,
  holder_name, holder_phone, plate, vehicle, pass_type, courtesy, courtesy_reason,
  method, reference, collected_by_name, idempotency_key) $function$;

revoke all on function public.v2_parking_express(uuid,uuid,text,uuid,text,text,text,text,text,boolean,text,text,text,text,text) from public, anon;
grant execute on function public.v2_parking_express(uuid,uuid,text,uuid,text,text,text,text,text,boolean,text,text,text,text,text) to authenticated;
