-- Causa raíz de la cartera inflada: si una familia paga ANTES de que exista el
-- cargo (pagar septiembre el 26 de agosto), allocate_payment_oldest_first no
-- encuentra a qué aplicarlo y el pago queda como crédito suelto. Cuando la
-- facturación crea el cargo días después, nadie vuelve a intentar aplicarlo,
-- así que la familia aparece debiendo pese a haber pagado.
-- Esto reaplica el crédito suelto reutilizando la misma función de asignación
-- que ya se usa al registrar un pago (no se inventa lógica de reparto nueva).
create or replace function app.apply_available_credit(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app'
as $function$
declare v_payment_id uuid; v_applied integer := 0;
begin
  for v_payment_id in
    select pb.id
    from app.payment_balances pb
    where pb.organization_id = p_organization_id
      and pb.available_credit > 0
      -- Sólo si ese Tanner tiene algún cargo abierto que el crédito pueda cubrir.
      and exists (
        select 1 from app.charge_balances cb
        where cb.player_id = pb.player_id
          and cb.organization_id = pb.organization_id
          and cb.computed_status in ('pending','partial')
          and cb.balance_due > 0)
    order by pb.payment_date, pb.id
  loop
    perform app.allocate_payment_oldest_first(v_payment_id);
    v_applied := v_applied + 1;
  end loop;
  return v_applied;
end $function$;

revoke all on function app.apply_available_credit(uuid) from public, anon, authenticated;

-- Se engancha al final de la facturación: en cuanto existen los cargos del
-- periodo, el crédito que estaba esperando se aplica solo.
create or replace function private.command_run_billing(p_organization_id uuid, p_period date, p_as_of date)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare v_club integer; v_academy integer; v_late integer; v_credit integer;
begin
  if not private.has_module_access(p_organization_id,'admin',true) then raise exception 'Not authorized'; end if;
  v_club := app.generate_monthly_charges(p_organization_id, p_period);
  v_academy := app.generate_academy_charges(p_organization_id, p_period);
  v_late := app.assess_late_fees(p_organization_id, p_as_of);
  v_credit := app.apply_available_credit(p_organization_id);
  return jsonb_build_object(
    'club_charges_created', v_club,
    'academy_charges_created', v_academy,
    'charges_created', v_club + v_academy,
    'late_fees_created', v_late,
    'credits_applied', v_credit);
end $function$;;
