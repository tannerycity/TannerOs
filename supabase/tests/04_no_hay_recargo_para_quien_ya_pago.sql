-- Prueba 4 de docs/auditoria/06 · INVARIANTE · SÓLO LECTURA
--
-- Regresión de un caso REAL: el 6 de septiembre de 2026 el motor de recargos
-- cobró a 13 familias que ya habían pagado. El dinero estaba en el club y aun
-- así les apareció el recargo.
--
-- El invariante: no puede existir un recargo vivo colgado de un cargo que ya
-- estaba cubierto ANTES de que el recargo naciera.

do $$
declare
  v_injustos int; v_revisados int; v_huerfanos int; v_detalle text;
begin
  select count(*) into v_revisados from app.charges where charge_type = 'late_fee';
  if v_revisados = 0 then
    raise exception 'PRUEBA FALLÓ: no hay un solo recargo que revisar; el invariante no probó nada';
  end if;

  -- Un recargo sin cargo padre no se puede juzgar: se reporta aparte para que
  -- no se cuele como «todo bien».
  select count(*) into v_huerfanos
  from app.charges lf
  where lf.charge_type = 'late_fee' and coalesce(lf.status,'') <> 'void'
    and (lf.parent_charge_id is null
         or not exists (select 1 from app.charges c where c.id = lf.parent_charge_id));

  select count(*) into v_injustos
  from app.charges lf
  join app.charges base on base.id = lf.parent_charge_id
  where lf.charge_type = 'late_fee'
    and coalesce(lf.status,'') <> 'void'
    and coalesce((select sum(pa.amount) from app.payment_allocations pa
                  where pa.charge_id = base.id and pa.status = 'posted'
                    and pa.created_at < lf.created_at), 0) >= base.amount;

  if v_injustos > 0 then
    select string_agg(format('%s · %s · recargo $%s sobre un cargo de $%s ya cubierto',
             coalesce(pl.first_name||' '||pl.last_name,'?'), base.billing_period, lf.amount, base.amount), ' · ')
      into v_detalle
    from app.charges lf
    join app.charges base on base.id = lf.parent_charge_id
    left join app.players pl on pl.id = lf.player_id
    where lf.charge_type='late_fee' and coalesce(lf.status,'') <> 'void'
      and coalesce((select sum(pa.amount) from app.payment_allocations pa
                    where pa.charge_id=base.id and pa.status='posted'
                      and pa.created_at < lf.created_at),0) >= base.amount;
    raise exception 'PRUEBA FALLÓ: % recargo(s) cobrados a quien ya había pagado. %',
      v_injustos, coalesce(v_detalle,'');
  end if;

  if v_huerfanos > 0 then
    raise exception 'PRUEBA FALLÓ: % recargo(s) vivos sin cargo padre; no se puede saber si son justos', v_huerfanos;
  end if;

  raise notice 'PRUEBA OK · 04 · % recargos revisados, ninguno sobre un cargo ya cubierto', v_revisados;
end $$;
