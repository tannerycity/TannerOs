-- app.payment_balances calculaba el crédito sin mirar el estado del pago, así que un
-- pago ANULADO seguía reportando su monto completo como saldo a favor. Son $3,900 de
-- 8 pagos cancelados inflando la cifra. Los asignadores ya filtran por status='posted',
-- así que nunca se aplicó ese dinero (0 asignaciones desde pagos anulados): el daño era
-- de reporte. Pero la vista alimenta el portal de familias y el estado de cuenta, o sea
-- que un papá podía ver a su favor dinero de un pago cancelado.
create or replace view app.payment_balances as
 select p.id,
    p.organization_id,
    p.player_id,
    p.amount,
    coalesce(a.allocated_amount, 0::numeric) as allocated_amount,
    coalesce(r.refunded_amount, 0::numeric) as refunded_amount,
    case
        when p.status <> 'posted'::text then 0::numeric
        when p.credit_status = 'available'::text then greatest(0::numeric, p.amount - coalesce(a.allocated_amount, 0::numeric) - coalesce(r.refunded_amount, 0::numeric))
        else 0::numeric
    end as available_credit,
    p.status,
    p.payment_date,
    p.method,
    p.reference,
    p.payer_type,
    p.payer_name,
    p.credit_status,
    case
        when p.status <> 'posted'::text then 0::numeric
        when p.credit_status = 'legacy_hold'::text then greatest(0::numeric, p.amount - coalesce(a.allocated_amount, 0::numeric) - coalesce(r.refunded_amount, 0::numeric))
        else 0::numeric
    end as held_credit
   from app.payments p
     left join lateral ( select coalesce(sum(x.amount), 0::numeric) as allocated_amount
           from app.payment_allocations x
          where x.payment_id = p.id and x.status = 'posted'::text) a on true
     left join lateral ( select coalesce(sum(x.amount), 0::numeric) as refunded_amount
           from app.refunds x
          where x.payment_id = p.id and x.status = 'posted'::text) r on true;;
