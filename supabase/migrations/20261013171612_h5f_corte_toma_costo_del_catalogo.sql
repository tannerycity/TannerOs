-- h5f: el corte de producción no avanzaba (13/10/2026). Una pieza vendida
-- antes de capturar su costo quedó con unit_cost vacío y el corte se negaba
-- con un mensaje en inglés que la pantalla escondía. Ahora, al mandar a
-- producción, la pieza sin costo toma el costo vigente del catálogo; si el
-- catálogo tampoco lo tiene, el aviso dice en español qué pieza y dónde
-- capturarlo. Lo mismo para "no está listo".
do $$
declare d text; n0 text;
begin
  d := pg_get_functiondef('private.command_create_production_batch(uuid,jsonb,text,text)'::regprocedure); n0 := d;
  d := replace(d,
    $r$if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null) then raise exception 'Frozen cost is required before production batch'; end if;$r$,
    $r$update app.order_items i set unit_cost = pr.cost
       from app.products pr
      where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null
        and pr.id=i.product_id and pr.cost is not null;
    if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null) then
      raise exception 'Falta el costo de %. Captúralo en Catálogo › Costos y vuelve a crear el corte.',
        (select string_agg(distinct split_part(i.description,' · ',1), ', ') from app.order_items i
          where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null);
    end if;$r$);
  d := replace(d,
    $r$raise exception 'Order is not production-ready: %',v_readiness->'missing';$r$,
    $r$raise exception 'El pedido % todavía no está listo: %', (select folio from app.orders where id=v_order),
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_readiness->'missing') x);$r$);
  if d = n0 or position('Frozen cost' in d) > 0 or position('not production-ready' in d) > 0 then
    raise exception 'No se pudo parchar command_create_production_batch';
  end if;
  execute d;
end $$;