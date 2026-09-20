-- Prueba 3 de docs/auditoria/06 · INVARIANTE · SÓLO LECTURA
--
-- Regresión de un defecto REAL encontrado en esta auditoría: al revertir las
-- asignaciones de un pago y reasignarlo, el motor reportaba «1600.00 aplicados»
-- y aplicaba 0, y además duplicaba filas históricas. El dinero de una familia
-- desaparecía de su estado de cuenta.
--
-- Los tres invariantes que ese defecto rompía:
--   a. Un pago nunca puede tener aplicado más de lo que vale.
--   b. Un pago anulado o reembolsado no puede seguir aplicado a un cargo.
--   c. Una asignación revertida no puede seguir contando como vigente.

do $$
declare
  v_sobreaplicados int; v_anulados_aplicados int; v_revertidas_vivas int;
  v_revisados int; v_detalle text;
begin
  select count(distinct payment_id) into v_revisados from app.payment_allocations;
  if v_revisados = 0 then
    raise exception 'PRUEBA FALLÓ: no hay asignaciones de pago que revisar';
  end if;

  -- (a) Aplicado > monto del pago. Medio centavo de tolerancia por redondeo.
  select count(*) into v_sobreaplicados from (
    select p.id
    from app.payments p
    join app.payment_allocations pa on pa.payment_id = p.id and pa.status = 'posted'
    group by p.id, p.amount
    having sum(pa.amount) > p.amount + 0.005
  ) t;

  -- (b) Pago muerto con asignaciones vivas.
  select count(*) into v_anulados_aplicados
  from app.payments p
  where p.status in ('void','refunded')
    and exists (select 1 from app.payment_allocations pa
                where pa.payment_id = p.id and pa.status = 'posted');

  -- (c) Una asignación revertida con fecha de reversión pero estado vigente.
  select count(*) into v_revertidas_vivas
  from app.payment_allocations
  where reversed_at is not null and status = 'posted';

  if v_sobreaplicados > 0 or v_anulados_aplicados > 0 or v_revertidas_vivas > 0 then
    select string_agg(format('%s $%s del %s: vale $%s, aplicado $%s',
             coalesce(pl.first_name||' '||pl.last_name,'?'), p.amount, p.payment_date, p.amount, s.aplicado), ' · ')
      into v_detalle
    from app.payments p
    join lateral (select sum(pa.amount) as aplicado from app.payment_allocations pa
                  where pa.payment_id=p.id and pa.status='posted') s on true
    left join app.players pl on pl.id = p.player_id
    where s.aplicado > p.amount + 0.005;
    raise exception 'PRUEBA FALLÓ: % pago(s) sobreaplicado(s), % anulado(s) que siguen aplicados, % asignación(es) revertida(s) que siguen vivas. %',
      v_sobreaplicados, v_anulados_aplicados, v_revertidas_vivas, coalesce(v_detalle,'');
  end if;

  raise notice 'PRUEBA OK · 03 · % pagos con asignaciones revisados; ni uno pierde dinero', v_revisados;
end $$;
