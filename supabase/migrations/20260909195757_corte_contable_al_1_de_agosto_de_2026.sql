-- CORTE CONTABLE AL 1 DE AGOSTO DE 2026
--
-- Julio fue el mes de la migracion y su cobranza no es reconstruible: TannerOS
-- registro $69,589 de ingresos ese mes contra $52,979.96 de abonos en el banco,
-- pero las transferencias registradas ($48,290) son MENOS que esos abonos, asi
-- que no se puede afirmar cuales registros eran duplicados y cuales reales.
-- El club decidio cerrar lo anterior y arrancar limpio desde agosto.
--
-- El corte es BLANDO a proposito: lo que ya esta aplicado se queda aplicado.
-- $8,850 de cargos de agosto y septiembre estan pagados con dinero que entro en
-- julio, en 16 Tanners; soltarlos habria hecho que 16 familias amanecieran
-- debiendo sin haber hecho nada mal.
--
-- Nada se borra. Si una familia reclama con su comprobante, su pago sigue ahi.
alter table app.payments drop constraint if exists payments_credit_status_check;
alter table app.payments add constraint payments_credit_status_check
  check (credit_status = any (array['available','legacy_hold','consumed','not_applicable','cutover_closed']));

-- La fecha del corte vive en la configuracion del club, no en el codigo: cada
-- club del SaaS migra en su propia fecha.
update public.organizations
   set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('ledgerCutoverOn','2026-08-01'),
       updated_at = now();

-- 1) Condonar lo que quedaba debiendo de antes del corte ($4,150 en 10 Tanners).
insert into app.charge_adjustments(organization_id,charge_id,adjustment_type,amount,reason,
  status,direction,idempotency_key,posted_at)
select cb.organization_id, cb.id, 'waiver', cb.balance_due,
  'Corte contable al 1 de agosto de 2026: el club cierra la cobranza anterior',
  'posted','decrease','cutover-2026-08-01:'||cb.id::text, now()
from app.charge_balances cb
where cb.billing_period < '2026-08-01' and cb.balance_due > 0
on conflict do nothing;

-- 2) Cerrar el credito sin aplicar de pagos de julio o antes ($10,200 en 18
--    Tanners). No se borra el pago: solo deja de tapar meses nuevos.
update app.payments p
   set credit_status = 'cutover_closed',
       allocation_note = trim(both ' ' from coalesce(p.allocation_note,'')||
         ' | Crédito cerrado por el corte contable del 1 de agosto de 2026'),
       updated_at = now()
  from app.payment_balances pb
 where pb.id = p.id
   and p.payment_date < '2026-08-01'
   and p.status = 'posted' and p.voided_at is null
   and p.payment_purpose = 'billing'
   and (pb.available_credit > 0 or pb.held_credit > 0);

-- 3) El motor de asignacion no debe volver a tocar ese credito.
create or replace function app.allocate_payment_oldest_first(p_payment_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'app','public'
as $function$
declare v_payment app.payments%rowtype; r record; v_available numeric; v_piece numeric; v_total numeric:=0;
begin
  select * into v_payment from app.payments where id=p_payment_id for update;
  if not found or v_payment.status<>'posted' then raise exception 'Payment not available'; end if;
  if v_payment.payment_purpose<>'billing' then raise exception 'Payment is not a billing payment'; end if;
  if v_payment.credit_status='legacy_hold' then raise exception 'Legacy held credit requires explicit reconciliation'; end if;
  -- Cerrado por el corte contable: ese dinero ya no cubre meses nuevos.
  if v_payment.credit_status='cutover_closed' then raise exception 'Ese pago quedó cerrado en el corte contable'; end if;
  for r in
    select cb.* from app.charge_balances cb
    where cb.organization_id=v_payment.organization_id
      and cb.player_id=v_payment.player_id
      and cb.computed_status in ('pending','partial')
      and cb.balance_due>0
      and ((v_payment.payer_type='sponsor' and cb.payer_type='sponsor'
            and (cb.payer_name is null or v_payment.payer_name is null
                 or lower(trim(cb.payer_name))=lower(trim(v_payment.payer_name))))
        or (coalesce(v_payment.payer_type,'guardian')<>'sponsor'
            and coalesce(cb.payer_type,'guardian')<>'sponsor'))
    order by cb.billing_period nulls last, cb.due_date, cb.created_at, cb.id
  loop
    select available_credit into v_available from app.payment_balances where id=v_payment.id;
    exit when coalesce(v_available,0)<=0;
    v_piece:=least(v_available,r.balance_due);
    insert into app.payment_allocations(organization_id,payment_id,charge_id,amount)
    values(v_payment.organization_id,v_payment.id,r.id,v_piece)
    on conflict(payment_id,charge_id) do update set
      amount = case when app.payment_allocations.status='reversed'
                    then excluded.amount
                    else app.payment_allocations.amount + excluded.amount end,
      status = 'posted',
      reversed_at = null,
      reversal_reason = null,
      reversed_by = null;
    v_total:=v_total+v_piece;
  end loop;
  return v_total;
end $function$;;
