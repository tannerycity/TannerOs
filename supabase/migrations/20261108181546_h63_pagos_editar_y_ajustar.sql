-- H63 · Pagos: editar, ajustar hacia arriba y recargos que no tocaban (08/11/2026).
--
-- Presidencia: "aquí dice que pague 500, pero si quiero que pague 800 no lo
-- puedo ajustar; todos los botones son para condonar"; "que yo pueda
-- editarlos, decir pagó esto"; "me pagó el viernes en la noche, lo registré
-- después y ya me dice que está retrasado y debe $100... ¿por qué no le
-- puedo editar la fecha del pago?". Y debe funcionar "tanto para
-- Presidencia como para Zul" (escritura en Contabilidad, como el resto de
-- correcciones desde h-zul_puede_corregir_cobros).
--
-- Funciones nuevas:
--   · v2_set_charge_amount: el cargo pasa a costar lo que se diga (sube o
--     baja). Queda como ajuste con motivo en el historial ("VAR"). No puede
--     bajar de lo ya pagado.
--   · v2_edit_payment: fecha, método y referencia de un pago (todo el folio
--     cambia de fecha junto). Con motivo y antes/después en la bitácora.
--   · v2_waive_on_time_late_fees: si un mes quedó pagado completo con pagos
--     de fecha igual o anterior a su vencimiento, su recargo se quita solo
--     (pasa al capturar un pago con fecha atrasada o al corregir la fecha).
-- Cambios: el estado de cuenta trae billing_start (para explicar un mes
-- proporcional) y el historial de cambios dice si un ajuste subió o bajó.

-- ---------------------------------------------------------------------------
-- 1. Recargos de meses que sí se pagaron a tiempo
-- ---------------------------------------------------------------------------
create or replace function private.waive_on_time_late_fees(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare r record; v_n integer := 0; v_total numeric := 0; v_actor uuid := (select auth.uid()); v_auth uuid;
begin
  for r in
    select lf.id, lb.balance_due, pc.id as padre, pb.net_amount as neto_padre, pc.due_date as vence, pc.concept as concepto
    from app.charges lf
    join app.charge_balances lb on lb.id = lf.id
    join app.charges pc on pc.id = lf.parent_charge_id and pc.organization_id = lf.organization_id
    join app.charge_balances pb on pb.id = pc.id
    where lf.organization_id = p_organization_id and lf.player_id = p_player_id
      and lf.charge_type = 'late_fee' and lf.status = 'posted' and lb.balance_due > 0.004
      and pb.net_amount > 0
      and coalesce((select sum(pa.amount) from app.payment_allocations pa join app.payments py on py.id = pa.payment_id
                    where pa.charge_id = pc.id and pa.status = 'posted' and py.status = 'posted' and py.voided_at is null
                      and py.payment_date <= pc.due_date), 0) >= pb.net_amount - 0.005
  loop
    if v_actor is not null then
      insert into app.charge_adjustment_authorizations(organization_id, charge_id, adjustment_type, amount, reason, status,
        authorized_by_user_id, consumed_by_user_id, consumed_at, idempotency_key)
      values (p_organization_id, r.id, 'waiver', r.balance_due,
        'Recargo quitado: ' || r.concepto || ' se pagó a tiempo (a más tardar el ' || to_char(r.vence, 'DD/MM/YYYY') || '); se capturó después.',
        'consumed', v_actor, v_actor, now(), 'a-tiempo:' || r.id::text)
      on conflict do nothing
      returning id into v_auth;
    end if;
    insert into app.charge_adjustments(organization_id, charge_id, adjustment_type, amount, reason, status, idempotency_key, direction,
      authorization_id, authorized_by_user_id, posted_by_user_id, posted_at)
    values (p_organization_id, r.id, 'waiver', r.balance_due,
      'Recargo quitado: ' || r.concepto || ' se pagó a tiempo (a más tardar el ' || to_char(r.vence, 'DD/MM/YYYY') || '); se capturó después.',
      'posted', 'a-tiempo:' || r.id::text, 'decrease', v_auth, v_actor, v_actor, now())
    on conflict do nothing;
    if found then
      v_n := v_n + 1; v_total := v_total + r.balance_due;
      insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
      values (p_organization_id, 'LateFeeWaivedPaidOnTime', 'charge', r.id,
        jsonb_build_object('parentChargeId', r.padre, 'dueDate', r.vence, 'amount', r.balance_due), v_actor);
    end if;
    v_auth := null;
  end loop;
  return jsonb_build_object('waived', v_n, 'amount', v_total);
end $$;

-- Quien cobra puede pedirlo (Taquilla captura la fecha real del pago); la
-- regla la decide la base, no quien llama.
create or replace function public.v2_waive_on_time_late_fees(organization_id uuid, player_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
begin
  if not (private.is_presidency(organization_id) or private.has_module_access(organization_id, 'accounting', true)
          or private.has_module_access(organization_id, 'billing', true)) then
    raise exception 'Not authorized';
  end if;
  return private.waive_on_time_late_fees(organization_id, player_id);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cambiar lo que cuesta un cargo (sube o baja)
-- ---------------------------------------------------------------------------
create or replace function private.command_set_charge_amount(p_organization_id uuid, p_charge_id uuid, p_new_amount numeric, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare c record; v_nuevo numeric := round(coalesce(p_new_amount, -1), 2); v_dif numeric; v_actor uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), ''); v_auth uuid; v_dir text;
begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'accounting', true)) then
    raise exception 'No tienes permiso para cambiar un cargo';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'Escribe el motivo (al menos 5 letras): queda en el registro.'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then raise exception 'Idempotency key required'; end if;
  if v_nuevo < 0 then raise exception 'Escribe el monto nuevo (puede ser 0).'; end if;
  select id into v_auth from app.charge_adjustment_authorizations where organization_id = p_organization_id and idempotency_key = btrim(p_idempotency_key);
  if v_auth is not null then return jsonb_build_object('ok', true, 'repeated', true); end if;

  select cb.*, ch.status as estado into c from app.charge_balances cb join app.charges ch on ch.id = cb.id
  where cb.id = p_charge_id and cb.organization_id = p_organization_id for update of ch;
  if not found or c.estado <> 'posted' then raise exception 'Ese cargo no existe o está cancelado.'; end if;
  v_dif := round(v_nuevo - c.net_amount, 2);
  if abs(v_dif) < 0.005 then raise exception 'El cargo ya está en ese monto.'; end if;
  if v_dif < 0 and v_nuevo < c.allocated_amount - 0.005 then
    raise exception 'Ya pagó %; el cargo no puede quedar en menos de lo pagado. Si el pago estuvo mal, edítalo o corrígelo.', to_char(c.allocated_amount, 'FM$999,999,990.00');
  end if;
  v_dir := case when v_dif > 0 then 'increase' else 'decrease' end;

  insert into app.charge_adjustment_authorizations(organization_id, charge_id, adjustment_type, amount, reason, status,
    authorized_by_user_id, consumed_by_user_id, consumed_at, idempotency_key)
  values (p_organization_id, p_charge_id, 'correction', abs(v_dif), v_motivo, 'consumed', v_actor, v_actor, now(), btrim(p_idempotency_key))
  returning id into v_auth;
  insert into app.charge_adjustments(organization_id, charge_id, adjustment_type, amount, reason, status, idempotency_key, direction,
    authorization_id, authorized_by_user_id, posted_by_user_id, posted_at)
  values (p_organization_id, p_charge_id, 'correction', abs(v_dif), v_motivo, 'posted', 'monto:' || v_auth::text, v_dir,
    v_auth, v_actor, v_actor, now());
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, request_id)
  values (p_organization_id, 'ChargeAmountChanged', 'charge', p_charge_id,
    jsonb_build_object('from', c.net_amount, 'to', v_nuevo, 'reason', v_motivo, 'concept', c.concept), v_actor, btrim(p_idempotency_key));
  return jsonb_build_object('ok', true, 'chargeId', p_charge_id, 'from', c.net_amount, 'to', v_nuevo);
end $$;

create or replace function public.v2_set_charge_amount(organization_id uuid, charge_id uuid, new_amount numeric, reason text, idempotency_key text)
returns jsonb language sql security definer set search_path to ''
as $$ select private.command_set_charge_amount(organization_id, charge_id, new_amount, reason, idempotency_key) $$;

-- ---------------------------------------------------------------------------
-- 3. Editar un pago: fecha, método y referencia
-- ---------------------------------------------------------------------------
create or replace function private.command_edit_payment(p_organization_id uuid, p_payment_id uuid, p_payment_date date, p_method text, p_reference text, p_reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare pay app.payments%rowtype; v_actor uuid := (select auth.uid()); v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
  v_hoy date := (now() at time zone 'America/Mexico_City')::date; v_fecha date; v_metodo text; v_ref text; r record; v_quitados jsonb := '[]'::jsonb;
  v_pres boolean := private.is_presidency(p_organization_id);
begin
  if not (v_pres or private.has_module_access(p_organization_id, 'accounting', true)) then raise exception 'No tienes permiso para editar un pago'; end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'Escribe el motivo (al menos 5 letras): queda en el registro.'; end if;
  select * into pay from app.payments where id = p_payment_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Ese pago no existe.'; end if;
  if pay.status <> 'posted' or pay.voided_at is not null then raise exception 'Ese pago ya está revertido: no se puede editar.'; end if;
  v_fecha := coalesce(p_payment_date, pay.payment_date);
  if v_fecha > v_hoy then raise exception 'La fecha del pago no puede ser futura.'; end if;
  if v_fecha < v_hoy - 180 then raise exception 'Es de hace más de 6 meses: para eso usa Corregir.'; end if;
  v_metodo := coalesce(nullif(btrim(coalesce(p_method, '')), ''), pay.method);
  if v_metodo not in ('cash', 'transfer', 'card') then raise exception 'Método no válido.'; end if;
  v_ref := case when p_reference is null then pay.reference else nullif(btrim(p_reference), '') end;
  if v_fecha = pay.payment_date and v_metodo = pay.method and v_ref is not distinct from pay.reference then
    raise exception 'No cambiaste nada.';
  end if;

  -- La fecha es del cobro completo: todas las partes del mismo folio.
  for r in select * from app.payments x where x.organization_id = p_organization_id and x.status = 'posted' and x.voided_at is null
             and (x.id = pay.id or (pay.ticket_id is not null and x.ticket_id = pay.ticket_id)) for update loop
    update app.payments set
      payment_date = v_fecha,
      method = case when r.id = pay.id then v_metodo else method end,
      reference = case when r.id = pay.id then v_ref else reference end,
      -- Si lo edita alguien que no es Presidencia, Presidencia lo vuelve a validar.
      reconciliation_status = case when not v_pres and reconciliation_status = 'approved' then 'pending' else reconciliation_status end,
      updated_at = now()
    where id = r.id;
    if r.player_id is not null then v_quitados := v_quitados || private.waive_on_time_late_fees(p_organization_id, r.player_id); end if;
  end loop;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PaymentEdited', 'payment', pay.id, jsonb_build_object(
    'before', jsonb_build_object('date', pay.payment_date, 'method', pay.method, 'reference', pay.reference),
    'after', jsonb_build_object('date', v_fecha, 'method', v_metodo, 'reference', v_ref),
    'reason', v_motivo, 'ticketId', pay.ticket_id, 'lateFeesWaived', v_quitados), v_actor);
  return jsonb_build_object('ok', true, 'date', v_fecha, 'method', v_metodo, 'lateFeesWaived',
    (select coalesce(sum((x->>'waived')::int), 0) from jsonb_array_elements(v_quitados) x),
    'lateFeesAmount', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(v_quitados) x));
end $$;

create or replace function public.v2_edit_payment(organization_id uuid, payment_id uuid, payment_date date, method text, reference text, reason text)
returns jsonb language sql security definer set search_path to ''
as $$ select private.command_edit_payment(organization_id, payment_id, payment_date, method, reference, reason) $$;

-- ---------------------------------------------------------------------------
-- 4. Lo que la pantalla necesita para explicar
-- ---------------------------------------------------------------------------
-- El historial de cambios dice si un ajuste subió o bajó el cargo.
do $$
declare d text; v_a text := '''kind'',''adjustment'',''type'',ca.adjustment_type,';
begin
  d := pg_get_functiondef('private.query_player_change_history(uuid,uuid)'::regprocedure);
  if position('ca.direction' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h63: no encontré el ajuste en query_player_change_history'; end if;
    execute replace(d, v_a, v_a || '''direction'',ca.direction,');
  end if;
end $$;

-- El estado de cuenta trae desde cuándo se le cobra: así un mes proporcional
-- se explica solo ("empezó el 12 oct") en vez de parecer un error.
do $$
declare d text; v_a text := 'bp.base_monthly_fee, bp.is_exempt';
begin
  d := pg_get_functiondef('private.query_player_account_statement(uuid,uuid)'::regprocedure);
  if position('bp.billing_start' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h63: no encontré el perfil en query_player_account_statement'; end if;
    execute replace(d, v_a, 'bp.base_monthly_fee, bp.billing_start, bp.is_exempt');
  end if;
end $$;

revoke all on function public.v2_waive_on_time_late_fees(uuid, uuid) from public, anon;
revoke all on function public.v2_set_charge_amount(uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.v2_edit_payment(uuid, uuid, date, text, text, text) from public, anon;
grant execute on function public.v2_waive_on_time_late_fees(uuid, uuid) to authenticated;
grant execute on function public.v2_set_charge_amount(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.v2_edit_payment(uuid, uuid, date, text, text, text) to authenticated;
revoke all on function private.waive_on_time_late_fees(uuid, uuid) from public, anon, authenticated;
revoke all on function private.command_set_charge_amount(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function private.command_edit_payment(uuid, uuid, date, text, text, text) from public, anon, authenticated;
