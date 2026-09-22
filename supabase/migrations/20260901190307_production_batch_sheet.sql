-- Hoja de producción (corte + personalización) para un lote de pedidos.
-- Expone el detalle a nivel pieza (talla, nombre, número) que query_production_batch_finance
-- no incluye (esa es solo dinero). Mismo criterio de autorización que la vista de finanzas
-- del corte: cualquiera con lectura de commerce o accounting puede verla/imprimirla.
create or replace function private.query_production_batch_sheet(p_organization_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch app.production_batches%rowtype;
  v_items jsonb;
begin
  if not (private.has_module_access(p_organization_id,'commerce',false) or private.has_module_access(p_organization_id,'accounting',false)) then
    raise exception 'Not authorized';
  end if;

  select * into v_batch from app.production_batches where id=p_batch_id and organization_id=p_organization_id;
  if not found then raise exception 'Production batch not found'; end if;
  if v_batch.batch_type <> 'orders' then raise exception 'Este corte no es de pedidos; no tiene hoja de producción'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId', oi.id,
    'orderId', o.id,
    'orderFolio', o.folio,
    'customerName', o.customer_name,
    'description', oi.description,
    'quantity', oi.quantity,
    'talla', coalesce(nullif(oi.attributes->>'talla',''), nullif(oi.attributes->>'size','')),
    'numero', nullif(coalesce(oi.attributes->>'numero', oi.attributes->>'number'),''),
    'nombrePers', nullif(coalesce(oi.attributes->>'nombrePers', oi.attributes->>'personalizationName'),''),
    'tipo', nullif(oi.attributes->>'tipo',''),
    'obs', nullif(oi.attributes->>'obs',''),
    'kitName', nullif(coalesce(oi.attributes->>'bundleName', oi.attributes->>'esPaquete'),''),
    'kitKey', coalesce(nullif(oi.attributes->>'bundleId',''), nullif(oi.attributes->>'kitInstanceId',''))
  ) order by o.folio, oi.description), '[]'::jsonb)
  into v_items
  from app.production_batch_orders bo
  join app.orders o on o.id = bo.order_id and o.organization_id = bo.organization_id
  join app.order_items oi on oi.order_id = o.id and oi.organization_id = o.organization_id
  where bo.organization_id = p_organization_id and bo.batch_id = p_batch_id;

  return jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id, 'folio', v_batch.folio, 'supplierName', v_batch.supplier_name,
      'submittedOn', v_batch.submitted_on, 'receivedAt', v_batch.received_at,
      'status', v_batch.status, 'notes', v_batch.notes
    ),
    'items', v_items
  );
end;
$$;

create or replace function public.v2_production_batch_sheet(organization_id uuid, batch_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select private.query_production_batch_sheet(organization_id, batch_id)
$$;

revoke all on function public.v2_production_batch_sheet(uuid,uuid) from public;
grant execute on function public.v2_production_batch_sheet(uuid,uuid) to authenticated, service_role;
;
