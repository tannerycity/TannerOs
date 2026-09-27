-- La hoja de producción no sabía qué pieza era cada una.
--
-- El club arma sus pedidos al proveedor en una hoja por modelo: una tabla por
-- jersey, con la imagen del modelo al lado, y un renglón por persona con DOS
-- tallas — la de la playera y la del short — porque un uniforme se pide así.
--
-- La hoja que devolvía el sistema traía la talla de cada pieza por separado y
-- nada que dijera si esa pieza era un jersey, un short o unas calcetas. Para
-- armar el renglón de dos tallas había que adivinarlo leyendo el texto de la
-- descripción ("Jersey ...", "Short ..."), que es justo el tipo de suposición
-- que se rompe el día que alguien nombre un producto "Playera de salida".
--
-- El dato ya existe: app.products.category. Sólo no viajaba. Esto lo manda,
-- junto con el nombre del producto, para que la hoja clasifique por dato y no
-- por parecido de texto.
--
-- No cambia nada de lo que ya devolvía: sólo agrega dos llaves. La hoja de
-- corte y la lista de personalización siguen leyendo lo mismo.
create or replace function private.query_production_batch_sheet(p_organization_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'kitKey', coalesce(nullif(oi.attributes->>'bundleId',''), nullif(oi.attributes->>'kitInstanceId','')),
    -- Lo nuevo: qué es la pieza, según el catálogo y no según su nombre.
    -- Va nulo cuando el renglón se capturó suelto, sin producto ligado; la
    -- hoja lo trata como pieza aparte en vez de inventarle una columna.
    'categoria', nullif(p.category,''),
    'productName', nullif(p.name,'')
  ) order by o.folio, oi.description), '[]'::jsonb)
  into v_items
  from app.production_batch_orders bo
  join app.orders o on o.id = bo.order_id and o.organization_id = bo.organization_id
  join app.order_items oi on oi.order_id = o.id and oi.organization_id = o.organization_id
  left join app.products p on p.id = oi.product_id and p.organization_id = oi.organization_id
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
$function$;

-- Crear una función en private le vuelve a dar EXECUTE a PUBLIC. Se cierra
-- cada vez, sin excepción.
revoke all on function private.query_production_batch_sheet(uuid,uuid) from public, anon, authenticated;
