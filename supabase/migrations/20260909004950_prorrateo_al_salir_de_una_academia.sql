-- Cuando se da de baja al Tanner del CLUB, app.prorate_withdrawal_month ya recorta
-- también su cargo de academia. Pero sacar a un niño SOLO de la academia (sigue
-- entrenando con el club) no recortaba nada: le quedaba el mes completo aunque
-- hubiera ido tres días.
--
-- Misma regla que el club, la que fijó Presidencia: sale el 15 o antes = medio mes;
-- del 16 en adelante = mes completo.
--
-- A diferencia del prorrateo de baja del club, esta función se acota a los cargos
-- de ESA inscripción (academy_enrollment_id). Si tocara todos los cargos del mes
-- le recortaría también la mensualidad del club a un niño que sigue entrenando.
create or replace function app.prorate_academy_withdrawal(
  p_organization_id uuid, p_enrollment_id uuid, p_ends_on date, p_actor text default null
) returns numeric
language plpgsql
security definer
set search_path to 'pg_catalog','app'
as $function$
declare
  r record;
  v_mes date := date_trunc('month', p_ends_on)::date;
  v_mitad numeric; v_corte numeric;
  v_total numeric := 0; v_ya_pagado numeric := 0;
begin
  -- Del 16 en adelante se cobra completo: no hay nada que recortar.
  if extract(day from p_ends_on) > 15 then return 0; end if;

  for r in
    select cb.id, cb.net_amount, cb.balance_due
    from app.charge_balances cb
    join app.charges c on c.id = cb.id
    where cb.organization_id = p_organization_id
      and c.academy_enrollment_id = p_enrollment_id
      and cb.billing_period = v_mes
      and cb.charge_type = 'academy_fee'
      and c.status = 'posted'
      and cb.net_amount > 0
  loop
    v_mitad := round(r.net_amount / 2, 2);
    -- Nunca se recorta más de lo que sigue pendiente: si la familia ya pagó el mes
    -- completo, el excedente es una devolución y eso lo decide Presidencia.
    v_corte := least(v_mitad, r.balance_due);
    if v_corte <= 0 then
      v_ya_pagado := v_ya_pagado + v_mitad;
      continue;
    end if;

    insert into app.charge_adjustments(
      organization_id, charge_id, adjustment_type, amount, reason, status, direction,
      idempotency_key, posted_at)
    values(
      p_organization_id, r.id, 'correction', v_corte,
      'Prorrateo por salir de la academia el '||to_char(p_ends_on,'DD/MM/YYYY')||': fue medio mes o menos',
      'posted', 'decrease',
      'academia-prorrateo:'||r.id::text, now())
    on conflict(organization_id, idempotency_key) do nothing;

    if found then v_total := v_total + v_corte; end if;
    if v_mitad > v_corte then v_ya_pagado := v_ya_pagado + (v_mitad - v_corte); end if;
  end loop;

  if v_total > 0 or v_ya_pagado > 0 then
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
    values(p_organization_id,'AcademyMonthProrated','academy_enrollment',p_enrollment_id,
      jsonb_build_object('endsOn',p_ends_on,'period',v_mes,'reduced',v_total,
        'notReducedBecauseAlreadyPaid',v_ya_pagado,
        'policy','sale el dia 15 o antes = medio mes; del 16 en adelante = mes completo'),
      p_actor);
  end if;
  return v_total;
end $function$;


-- Cerrar la inscripción ahora recorta el mes cuando toca.
create or replace function private.command_withdraw_academy_enrollment(
  p_organization_id uuid, p_enrollment_id uuid, p_ends_on date, p_reason text
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v app.academy_enrollments%rowtype; v_end date:=coalesce(p_ends_on,current_date); v_recorte numeric;
begin
  if not private.has_module_access(p_organization_id,'academias',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;
  select * into v from app.academy_enrollments where id=p_enrollment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Academy enrollment not found'; end if;
  if v.status<>'active' then raise exception 'Academy enrollment is not active'; end if;
  if v_end<v.starts_on then raise exception 'Withdrawal date cannot precede enrollment start'; end if;

  update app.academy_enrollments
  set status='cancelled',ends_on=v_end,
      notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja: '||trim(p_reason)),updated_at=now()
  where id=v.id;

  -- El cargo del mes en curso ya está emitido: hay que recortarlo aquí mismo o la
  -- familia recibe el mes completo de una academia a la que ya no va.
  v_recorte := app.prorate_academy_withdrawal(p_organization_id, v.id, v_end,
    coalesce((select auth.uid())::text,'system'));

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademyEnrollmentWithdrawn','academy_enrollment',v.id,
    jsonb_build_object('academyId',v.academy_id,'playerId',v.player_id,'endsOn',v_end,
      'reason',trim(p_reason),'proratedAmount',v_recorte),
    coalesce((select auth.uid())::text,'system'));
end $function$;

revoke all on function private.command_withdraw_academy_enrollment(uuid,uuid,date,text) from public, anon, authenticated;;
