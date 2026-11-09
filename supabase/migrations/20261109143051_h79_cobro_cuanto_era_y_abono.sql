-- h79 · El cobro dice cuánto era y cuánto ya abonó (09/11/2026)
--
-- Presidencia, con la hoja de cobro de Isabella: "a veces siento que me
-- cobran cosas que no entiendo". Octubre salía en $350 junto a noviembre en
-- $550: parecía otro precio, y era lo que faltaba de $550 tras abonar $200.
--
-- query_player_collection: cada cargo trae además `amount` (lo que vale, ya
-- con ajustes), `paid` (lo abonado) y `paidOn` (la fecha de su último abono).
-- Así la hoja dice "De $550 · ya abonó $200 el 6 oct" y agrupa por mes.
-- Sólo lectura: no cambia montos, saldos ni reglas de recargo.

do $$
declare d text; v_a text := '''balance'', cb.balance_due,';
begin
  d := pg_get_functiondef('private.query_player_collection(uuid,uuid)'::regprocedure);
  if position('''paid'', cb.allocated_amount' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h79: no encontré el saldo del cargo en query_player_collection'; end if;
    execute replace(d, v_a, '''balance'', cb.balance_due, ''amount'', cb.net_amount, ''paid'', cb.allocated_amount,
        ''paidOn'', (select max(py.payment_date) from app.payment_allocations pa join app.payments py on py.id = pa.payment_id
                     where pa.charge_id = cb.id and pa.status = ''posted'' and py.status = ''posted'' and py.voided_at is null),');
  end if;
end $$;
