-- Presidencia confirmó que los dos pagos de "Mensualidad Julio" son reales: la familia
-- pagó dos veces. El segundo quedó atrapado en Tanner009, el expediente duplicado que
-- se retiró, así que el dinero no le contaba a la familia. Se pasa al expediente vivo
-- y se libera el crédito migrado por la vía normal de conciliación.
do $$
declare v009 uuid; v045 uuid; v_org uuid; v_pay uuid; r record; v_antes numeric; v_despues numeric;
begin
  select id,organization_id into v009,v_org from app.players where code='Tanner009';
  select id into v045 from app.players where code='Tanner045';
  if v009 is null or v045 is null then raise exception 'No se encontraron los expedientes'; end if;

  select id into v_pay from app.payments where player_id=v009;
  if v_pay is null then raise exception 'No hay pago que mover en Tanner009'; end if;
  if (select count(*) from app.payments where player_id=v009)<>1 then
    raise exception 'Se esperaba exactamente 1 pago en Tanner009';
  end if;

  select coalesce(sum(balance_due),0) into v_antes from app.charge_balances where player_id=v045 and balance_due>0;

  update app.payments set player_id=v045,
    allocation_note=concat_ws(' · ',nullif(allocation_note,''),
      'Pago recuperado de Tanner009 (expediente duplicado) por instrucción de Presidencia')
  where id=v_pay;

  select * into r from app.reconcile_legacy_credit(v_org, v045);
  if coalesce(r.amount_applied,0)<>400 then
    raise exception 'Se esperaba aplicar 400 y se aplicaron %', coalesce(r.amount_applied,0);
  end if;

  select coalesce(sum(balance_due),0) into v_despues from app.charge_balances where player_id=v045 and balance_due>0;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PaymentReassigned','payment',v_pay,
    jsonb_build_object('fromPlayer','Tanner009','toPlayer','Tanner045','amount',400,
      'reason','Expediente duplicado consolidado; Presidencia confirmó que los dos pagos de julio son reales',
      'balanceBefore',v_antes,'balanceAfter',v_despues),
    'consolidacion_duplicados');
end $$;

select ch.billing_period, ch.concept, cb.balance_due as debe
from app.charge_balances cb join app.charges ch on ch.id=cb.id
join app.players p on p.id=cb.player_id
where p.code='Tanner045' and cb.balance_due>0 order by ch.billing_period, ch.charge_type;;
