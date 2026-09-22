-- create temp table ... on commit drop revienta si el motor se corre dos veces
-- dentro de la misma transaccion. Se usa un CTE y se acabo la tabla temporal.
create or replace function app.assess_late_fees(p_organization_id uuid, p_as_of date)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app','public'
as $function$
declare v_policy app.billing_policies%rowtype; v_count integer:=0;
begin
  select * into v_policy from app.billing_policies where organization_id=p_organization_id;

  with credito as (
    select pb.player_id, sum(pb.available_credit) as disponible
    from app.payment_balances pb
    where pb.organization_id = p_organization_id
    group by 1
  ), vencido as (
    select c.player_id, sum(cb.balance_due) as debe
    from app.charges c
    join app.charge_balances cb on cb.id = c.id
    where c.organization_id = p_organization_id
      and c.status = 'posted' and c.voided_at is null
      and cb.balance_due > 0 and p_as_of > c.due_date
    group by 1
  ),
  -- Quien ya pago: su dinero sin aplicar cubre todo lo que trae vencido. La
  -- regla del club es "si no pagaron al dia 5"; lo que importa es si el club
  -- tiene su dinero, no si un capturista alcanzo a aplicarlo.
  al_corriente as (
    select v.player_id, v.debe, coalesce(cr.disponible,0) as disponible
    from vencido v
    left join credito cr on cr.player_id = v.player_id
    where coalesce(cr.disponible,0) >= v.debe
  ),
  nuevos as (
    insert into app.charges(organization_id,player_id,billing_profile_id,parent_charge_id,charge_type,
      billing_period,concept,amount,due_date,status,source,late_fee_eligible,idempotency_key,posted_at,
      payer_type,payer_name,academy_enrollment_id,player_benefit_id)
    select c.organization_id,c.player_id,c.billing_profile_id,c.id,'late_fee',c.billing_period,
      'Recargo · '||c.concept,v_policy.late_fee_amount,p_as_of,'posted','billing_engine',false,
      'late-fee:'||c.id::text,now(),c.payer_type,c.payer_name,c.academy_enrollment_id,c.player_benefit_id
    from app.charges c
    join app.charge_balances cb on cb.id=c.id
    where c.organization_id=p_organization_id
      and c.charge_type in ('monthly_fee','academy_fee')
      and c.status='posted' and c.late_fee_eligible=true
      and cb.balance_due>0
      and c.billing_period>=date_trunc('month',v_policy.effective_from)::date
      and p_as_of>c.due_date
      and c.player_id not in (select player_id from al_corriente)
    on conflict do nothing
    returning 1
  ),
  -- Trazabilidad: queda la huella de a quien NO se le cobro mora y por que, para
  -- que nadie tenga que reconstruirlo a mano despues.
  huella as (
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
    select p_organization_id,'LateFeeSkippedPlayerHasCredit','player',a.player_id,
           jsonb_build_object('asOf',p_as_of,'vencido',a.debe,'creditoDisponible',a.disponible)
    from al_corriente a
    returning 1
  )
  select count(*) into v_count from nuevos;

  return v_count;
end $function$;;
