-- Política de Presidencia: si el Tanner se va el día 15 o antes, entrenó la mitad o
-- menos y se le cobra medio mes. Del 16 en adelante, mes completo.
-- Antes se cobraba el mes entero siempre, y por eso 3 Tanners de baja arrastran $1,750
-- de meses que no cursaron.
--
-- El cargo original NO se borra: se registra un ajuste de decremento, que es como el
-- resto del sistema baja un saldo y deja rastro. Es una regla de cobro, no un perdón
-- discrecional, así que no pasa por la autorización caso por caso de Presidencia.
create or replace function app.prorate_withdrawal_month(
  p_organization_id uuid, p_player_id uuid, p_withdrawn_at date, p_actor text default null)
returns numeric
language plpgsql security definer
set search_path to 'pg_catalog','app'
as $function$
declare
  r record;
  v_mes date := date_trunc('month', p_withdrawn_at)::date;
  v_mitad numeric;
  v_corte numeric;
  v_total numeric := 0;
  v_tope numeric := 0;
begin
  -- Del 16 en adelante se cobra completo: no hay nada que hacer.
  if extract(day from p_withdrawn_at) > 15 then return 0; end if;

  for r in
    select cb.id, cb.net_amount, cb.balance_due, cb.concept
    from app.charge_balances cb
    join app.charges c on c.id = cb.id
    where cb.organization_id = p_organization_id
      and cb.player_id = p_player_id
      and cb.billing_period = v_mes
      and cb.charge_type in ('monthly_fee','academy_fee')
      and c.status = 'posted'
      and cb.net_amount > 0
  loop
    v_mitad := round(r.net_amount / 2, 2);
    -- Nunca se recorta más de lo que sigue pendiente: si la familia ya pagó el mes
    -- completo, el excedente es una devolución y eso lo decide Presidencia, no esto.
    v_corte := least(v_mitad, r.balance_due);
    if v_corte <= 0 then
      v_tope := v_tope + v_mitad;
      continue;
    end if;

    insert into app.charge_adjustments(
      organization_id, charge_id, adjustment_type, amount, reason, status, direction,
      idempotency_key, posted_at)
    values(
      p_organization_id, r.id, 'correction', v_corte,
      'Prorrateo por baja el '||to_char(p_withdrawn_at,'DD/MM/YYYY')||': entrenó medio mes o menos',
      'posted', 'decrease',
      'baja-prorrateo:'||r.id::text, now())
    on conflict(organization_id, idempotency_key) do nothing;

    if found then v_total := v_total + v_corte; end if;
    if v_mitad > v_corte then v_tope := v_tope + (v_mitad - v_corte); end if;
  end loop;

  if v_total > 0 or v_tope > 0 then
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
    values(p_organization_id,'WithdrawalMonthProrated','player',p_player_id,
      jsonb_build_object('withdrawnAt',p_withdrawn_at,'period',v_mes,'reduced',v_total,
        'notReducedBecauseAlreadyPaid',v_tope,
        'policy','baja el dia 15 o antes = medio mes; del 16 en adelante = mes completo'),
      p_actor);
  end if;
  return v_total;
end $function$;

revoke all on function app.prorate_withdrawal_month(uuid,uuid,date,text) from public, anon, authenticated;;
