-- app.payment_balances fuerza available_credit=0 cuando credit_status='legacy_hold';
-- el saldo retenido vive en held_credit. La versión anterior filtraba por
-- available_credit>0, así que nunca encontraba un solo pago que liberar.
create or replace function app.reconcile_legacy_credit(p_organization_id uuid, p_player_id uuid default null)
returns table(payments_released integer, amount_applied numeric)
language plpgsql security definer
set search_path to 'pg_catalog','app'
as $function$
declare r record; v_released integer := 0; v_applied numeric := 0; v_piece numeric;
begin
  for r in
    select pb.id
    from app.payment_balances pb
    where pb.organization_id = p_organization_id
      and (p_player_id is null or pb.player_id = p_player_id)
      and pb.held_credit > 0
      and pb.status = 'posted'
      -- Sólo se libera si ese Tanner tiene un cargo abierto que cubrir. Si no
      -- hay nada que pagar, el crédito se queda retenido esperando revisión.
      and exists (
        select 1 from app.charge_balances cb
        where cb.player_id = pb.player_id
          and cb.organization_id = pb.organization_id
          and cb.computed_status in ('pending','partial')
          and cb.balance_due > 0)
    order by pb.payment_date, pb.id
  loop
    update app.payments
       set credit_status='available',
           allocation_note=concat_ws(' · ', nullif(allocation_note,''),
             'Crédito migrado liberado por conciliación '||to_char(now(),'YYYY-MM-DD'))
     where id=r.id;
    begin
      v_piece := app.allocate_payment_oldest_first(r.id);
      v_released := v_released + 1;
      v_applied := v_applied + coalesce(v_piece,0);
    exception when others then
      continue;
    end;
  end loop;
  return query select v_released, v_applied;
end $function$;

revoke all on function app.reconcile_legacy_credit(uuid,uuid) from public, anon;;
