-- Prueba 2 de docs/auditoria/06 · INVARIANTE · SÓLO LECTURA
--
-- El daño que evita: que una mamá pague una vez en Taquilla y el club le
-- registre dos cobros porque el cajero dio doble clic.
--
-- Cómo lo prueba: `v2_post_payment` recibe una `idempotency_key`. Esta prueba
-- revisa que (a) ninguna llave se repita y (b) no existan dos pagos gemelos
-- —mismo Tanner, mismo monto, mismo día, capturados con menos de dos minutos de
-- diferencia— que compartan llave o no tengan ninguna.
--
-- ALCANCE: sólo los pagos capturados EN TannerOS. Los que vienen del sistema
-- viejo (`legacy_import`, `legacy_v1`) quedan fuera a propósito: son anteriores
-- al corte contable del 1 de agosto de 2026, que ya cerró esa historia. Incluir-
-- los dejaría la prueba en rojo para siempre por algo que ya se decidió cerrar.
-- Hay 4 pares gemelos ahí, documentados en docs/auditoria/13.

do $$
declare
  v_llaves_repetidas int; v_gemelos int; v_revisados int; v_sin_llave int;
  v_detalle text;
begin
  select count(*) into v_revisados
  from app.payments where status = 'posted' and coalesce(source,'') not like 'legacy%';

  if v_revisados = 0 then
    raise exception 'PRUEBA FALLÓ: no hay un solo pago hecho en TannerOS que revisar';
  end if;

  select count(*) into v_llaves_repetidas from (
    select idempotency_key from app.payments
    where idempotency_key is not null and status = 'posted'
    group by idempotency_key having count(*) > 1
  ) t;

  select count(*) into v_gemelos
  from app.payments a
  join app.payments b
    on b.player_id = a.player_id and b.amount = a.amount
   and b.payment_date = a.payment_date and b.id > a.id
   and abs(extract(epoch from b.created_at - a.created_at)) < 120
  where a.status = 'posted' and b.status = 'posted'
    and coalesce(a.idempotency_key,'~') = coalesce(b.idempotency_key,'~')
    and coalesce(a.source,'') not like 'legacy%'
    and coalesce(b.source,'') not like 'legacy%';

  -- Un pago sin llave no está protegido contra el doble clic. No es un error en
  -- los libros, pero sí un hueco, así que se reporta.
  select count(*) into v_sin_llave
  from app.payments
  where status = 'posted' and coalesce(source,'') not like 'legacy%' and idempotency_key is null;

  if v_llaves_repetidas > 0 or v_gemelos > 0 then
    select string_agg(format('%s $%s el %s', coalesce(pl.first_name||' '||pl.last_name,'?'), a.amount, a.payment_date), ' · ')
      into v_detalle
    from app.payments a
    join app.payments b on b.player_id=a.player_id and b.amount=a.amount
      and b.payment_date=a.payment_date and b.id>a.id
      and abs(extract(epoch from b.created_at-a.created_at)) < 120
    left join app.players pl on pl.id=a.player_id
    where a.status='posted' and b.status='posted'
      and coalesce(a.idempotency_key,'~')=coalesce(b.idempotency_key,'~')
      and coalesce(a.source,'') not like 'legacy%' and coalesce(b.source,'') not like 'legacy%';
    raise exception 'PRUEBA FALLÓ: % llave(s) repetida(s) y % pago(s) gemelo(s) en TannerOS. %',
      v_llaves_repetidas, v_gemelos, coalesce(v_detalle,'');
  end if;

  raise notice 'PRUEBA OK · 02 · % pagos de TannerOS revisados, ninguno duplicado (% sin llave de idempotencia)',
    v_revisados, v_sin_llave;
end $$;
