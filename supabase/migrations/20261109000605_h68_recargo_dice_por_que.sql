-- h68 · El recargo dice por qué está ahí (09/11/2026)
--
-- Presidencia, con la hoja de cobro de Rodrigo: "falta el concepto de debe
-- mensualidad noviembre". Noviembre sí estaba pagado (el viernes 6; el
-- límite era el 5) y sólo quedaba su recargo, pero la hoja no lo decía.
--
-- query_player_collection: cada recargo trae `parent` con la mensualidad que
-- lo generó: su fecha límite, cuánto falta y la fecha del último pago. Así la
-- hoja dice "Noviembre ya está pagado (pagó el 6, el límite era el 5)".

do $$
declare d text; v_a text := '''sponsor'', coalesce(cb.payer_type, ''guardian'') = ''sponsor'')';
begin
  d := pg_get_functiondef('private.query_player_collection(uuid,uuid)'::regprocedure);
  if position('''parent''' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h68: no encontré el cargo en query_player_collection'; end if;
    execute replace(d, v_a, '''sponsor'', coalesce(cb.payer_type, ''guardian'') = ''sponsor'',
        ''parent'', case when c.parent_charge_id is null then null else (
          select jsonb_build_object(''due'', pc.due_date, ''balance'', pb.balance_due,
            ''paidOn'', (select max(py.payment_date) from app.payment_allocations pa join app.payments py on py.id = pa.payment_id
                         where pa.charge_id = pc.id and pa.status = ''posted'' and py.status = ''posted'' and py.voided_at is null))
          from app.charges pc join app.charge_balances pb on pb.id = pc.id where pc.id = c.parent_charge_id) end)');
  end if;
end $$;
