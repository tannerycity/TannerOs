-- h59 · Por pedir: el pedido confirmado con la familia se pide, pagado o no (03/11/2026).
--
-- Zul (Tienda): "quiero tener un apartado que sea por pedir aunque esté pagado
-- o no... que diga si está pagado o no, pero que me haga el PDF completo de lo
-- que le voy a mandar a mi proveedor... que se le pueda poner que ya está
-- confirmado por las personas en el grupo o en persona... y pueda ver si ya
-- está confirmado o no para hacer mi pedido".
--
-- Presidencia decidió (02/11/2026):
--   · Se pide todo lo CONFIRMADO, aunque no esté pagado. La deuda sigue en
--     Cobrar y la regla de siempre no cambia: no se entrega sin pagar
--     (command_update_order_status ya lo exige para 'delivered').
--   · La confirmación es OBLIGATORIA: sin confirmar no se pide, ni pagado.
--
-- Qué cambia:
--   1. Confirmar el pedido (v2_confirm_order): "en el grupo" o "en persona".
--      Guarda quién, cuándo y una huella de las piezas (prenda, talla, nombre,
--      número, manga). Si después se edita una pieza, la huella ya no
--      coincide y hay que volver a confirmar. Confirmar también confirma el
--      número y da el pedido por revisado: es una sola acción.
--   2. order_readiness: un pedido confirmado (o ya con el proveedor) no pide
--      pago para estar listo.
--   3. order_stage: sin confirmar va a Revisar; confirmado y con datos va a
--      Por pedir, pagado o no. Devuelve la confirmación para la pantalla.
--   4. command_create_production_batch: acepta pedidos sin pagar y exige que
--      estén confirmados (con la huella vigente).
--   5. command_update_order_status: pending_payment ya puede pasar a
--      in_production (sólo si order_readiness lo deja, o sea, confirmado).
--   6. v2_orders_sheet: la hoja del PDF antes de mandar, sin crear el envío
--      (borrador para revisarlo).
--
-- No borra ni toca datos de pedidos.

-- 1. La huella y la confirmación ------------------------------------------------

create or replace function private.order_huella(p_organization_id uuid, p_order_id uuid)
returns text language sql stable security definer set search_path to ''
as $$
  select md5(coalesce(string_agg(concat_ws('|',
           i.id::text, coalesce(i.product_id::text, ''), coalesce(i.description, ''), coalesce(i.quantity::text, ''),
           coalesce(btrim(coalesce(i.attributes->>'talla', i.attributes->>'size')), ''),
           coalesce(btrim(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName')), ''),
           coalesce(btrim(coalesce(i.attributes->>'numero', i.attributes->>'number')), ''),
           coalesce(i.attributes->>'manga', '')), '#' order by i.id), ''))
    from app.order_items i
   where i.organization_id = p_organization_id and i.order_id = p_order_id
$$;

create or replace function private.order_confirmada(p_organization_id uuid, p_order_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce((select o.metadata->'confirmado'->>'huella' = private.order_huella(p_organization_id, p_order_id)
                     from app.orders o where o.id = p_order_id and o.organization_id = p_organization_id), false)
$$;

create or replace function private.confirm_order(p_organization_id uuid, p_order_id uuid, p_via text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_o app.orders%rowtype; v_numeros jsonb;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  if p_via is not null and p_via not in ('grupo', 'persona') then raise exception 'Di cómo se confirmó: en el grupo o en persona'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then
    raise exception 'El pedido % ya se pidió al proveedor o está cerrado: ya no se confirma', v_o.folio;
  end if;

  if p_via is null then
    update app.orders set metadata = coalesce(metadata, '{}'::jsonb) - 'confirmado', updated_at = now()
     where id = p_order_id and organization_id = p_organization_id;
  else
    select coalesce(jsonb_agg(distinct btrim(coalesce(i.attributes->>'numero', i.attributes->>'number'))), '[]'::jsonb) into v_numeros
      from app.order_items i
     where i.organization_id = p_organization_id and i.order_id = p_order_id
       and nullif(btrim(coalesce(i.attributes->>'numero', i.attributes->>'number', '')), '') is not null;
    update app.orders set metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('confirmado', jsonb_build_object('via', p_via, 'at', now(), 'by', (select auth.uid()),
             'huella', private.order_huella(p_organization_id, p_order_id)))
        || case when jsonb_array_length(v_numeros) > 0
             then jsonb_build_object('numeroConfirmado', jsonb_build_object('numeros', v_numeros, 'at', now(), 'by', (select auth.uid())))
             else '{}'::jsonb end
        || case when v_o.metadata->>'reviewedAt' is null
             then jsonb_build_object('reviewedAt', now(), 'reviewedBy', (select auth.uid()))
             else '{}'::jsonb end,
        updated_at = now()
     where id = p_order_id and organization_id = p_organization_id;
  end if;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_via is null then 'OrderUnconfirmed' else 'OrderConfirmed' end, 'order', p_order_id,
          jsonb_build_object('via', p_via), (select auth.uid()));
  return private.order_stage(p_organization_id, p_order_id);
end
$$;

create or replace function public.v2_confirm_order(organization_id uuid, order_id uuid, via text default null)
returns jsonb language sql security definer set search_path to ''
as $$ select private.confirm_order(organization_id, order_id, via) $$;

-- 6. La hoja antes de mandar (borrador) ---------------------------------------
-- Mismas columnas que private.query_production_batch_sheet, para que el PDF
-- sea el mismo; sólo pedidos vivos que todavía no se han pedido.
create or replace function private.query_orders_sheet(p_organization_id uuid, p_order_ids jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_items jsonb;
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_order_ids) <> 'array' or jsonb_array_length(p_order_ids) = 0 then raise exception 'At least one order is required'; end if;

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
    'manga', nullif(oi.attributes->>'manga',''),
    'orderNotes', nullif(btrim(coalesce(o.notes,'')),''),
    'kitName', nullif(coalesce(oi.attributes->>'bundleName', oi.attributes->>'esPaquete'),''),
    'kitKey', coalesce(nullif(oi.attributes->>'bundleId',''), nullif(oi.attributes->>'kitInstanceId','')),
    'categoria', nullif(p.category,''),
    'productName', nullif(p.name,''), 'photoPath', coalesce(p.photo_thumb_path, p.photo_path), 'photoBucket', p.photo_bucket
  ) order by o.folio, oi.description), '[]'::jsonb)
  into v_items
  from app.orders o
  join app.order_items oi on oi.order_id = o.id and oi.organization_id = o.organization_id
  left join app.products p on p.id = oi.product_id and p.organization_id = oi.organization_id
  where o.organization_id = p_organization_id
    and o.id in (select value::uuid from jsonb_array_elements_text(p_order_ids))
    and o.status in ('draft', 'pending_payment', 'partial_payment', 'paid');

  return jsonb_build_object(
    'batch', jsonb_build_object('id', null, 'folio', 'BORRADOR', 'supplierName', null, 'submittedOn', current_date,
      'receivedAt', null, 'status', 'draft', 'notes', null),
    'items', v_items);
end
$$;

create or replace function public.v2_orders_sheet(organization_id uuid, order_ids jsonb)
returns jsonb language sql stable security definer set search_path to ''
as $$ select private.query_orders_sheet(organization_id, order_ids) $$;

revoke all on function private.order_huella(uuid, uuid) from public, anon, authenticated;
revoke all on function private.order_confirmada(uuid, uuid) from public, anon, authenticated;
revoke all on function private.confirm_order(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.query_orders_sheet(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.v2_confirm_order(uuid, uuid, text) from public, anon;
revoke all on function public.v2_orders_sheet(uuid, jsonb) from public, anon;
grant execute on function public.v2_confirm_order(uuid, uuid, text) to authenticated;
grant execute on function public.v2_orders_sheet(uuid, jsonb) to authenticated;

-- 2 a 5. Parches a lo que ya existe (sólo las líneas que cambian) -------------
do $$
declare v_def text; v_old text;
begin
  -- 2. order_readiness: confirmado o ya con el proveedor, el pago no detiene.
  v_def := pg_get_functiondef('private.order_readiness(uuid,uuid)'::regprocedure);
  v_old := $a$  if v_paid+0.005<v_required_amount then v_missing:=array_append(v_missing,'pago incompleto'); end if;$a$;
  if position(v_old in v_def) = 0 then raise exception 'h59: no se pudo parchar order_readiness'; end if;
  v_def := replace(v_def, v_old,
    $a$  if v_paid+0.005<v_required_amount
     and v_order.status not in ('in_production','ready')
     and not private.order_confirmada(p_organization_id,p_order_id) then v_missing:=array_append(v_missing,'pago incompleto'); end if;$a$);
  execute v_def;

  -- 3. order_stage: sin confirmar, a Revisar; confirmado, a Por pedir.
  v_def := pg_get_functiondef('private.order_stage(uuid,uuid)'::regprocedure);
  v_old := $a$v_revisar boolean; v_etapa text;$a$;
  if position(v_old in v_def) = 0 then raise exception 'h59: no se pudo parchar order_stage (declare)'; end if;
  v_def := replace(v_def, v_old, $a$v_revisar boolean; v_etapa text; v_conf boolean;$a$);
  v_old := $a$  v_etapa := case
    when v_revisar or cardinality(v_datos) > 0 then 'por_validar'
    when v_o.status not in ('paid', 'partial_payment') or not coalesce((v_ready->>'ok')::boolean, false) then 'por_cobrar'
    else 'para_proveedor' end;
  return jsonb_build_object('stage', v_etapa, 'missing', to_jsonb(v_faltan), 'review', v_revisar);$a$;
  if position(v_old in v_def) = 0 then raise exception 'h59: no se pudo parchar order_stage (etapa)'; end if;
  v_def := replace(v_def, v_old, $a$  v_conf := private.order_confirmada(p_organization_id, p_order_id);
  if not v_conf then
    v_faltan := v_faltan || (case when v_o.metadata ? 'confirmado' then 'Volver a confirmar: el pedido cambió' else 'Confirmar con la familia' end)::text;
  end if;
  v_etapa := case
    when v_revisar or cardinality(v_datos) > 0 or not v_conf then 'por_validar'
    when not coalesce((v_ready->>'ok')::boolean, false) then 'por_cobrar'
    else 'para_proveedor' end;
  return jsonb_build_object('stage', v_etapa, 'missing', to_jsonb(v_faltan), 'review', v_revisar,
    'confirmado', case when v_o.metadata ? 'confirmado' then jsonb_build_object(
      'via', v_o.metadata->'confirmado'->>'via', 'at', v_o.metadata->'confirmado'->>'at', 'vigente', v_conf) end);$a$);
  execute v_def;

  -- 4. El envío al proveedor: pagado o no, pero confirmado.
  v_def := pg_get_functiondef('private.command_create_production_batch(uuid,jsonb,text,text)'::regprocedure);
  v_old := $a$o.status in ('paid','partial_payment')) then raise exception 'Order must be paid (or meet its payment plan) before production batch'; end if;$a$;
  if position(v_old in v_def) = 0 then raise exception 'h59: no se pudo parchar command_create_production_batch'; end if;
  v_def := replace(v_def, v_old, $a$o.status in ('pending_payment','partial_payment','paid')) then
      raise exception 'El pedido % ya no se puede pedir: ya se mandó, se entregó o se canceló', (select folio from app.orders where id=v_order); end if;
    if not private.order_confirmada(p_organization_id,v_order) then
      raise exception 'El pedido % no está confirmado con la familia (o cambió después de confirmarlo). Confírmalo antes de pedirlo.', (select folio from app.orders where id=v_order); end if;$a$);
  execute v_def;

  -- 5. Sin pagar ya puede ir con el proveedor (order_readiness decide).
  v_def := pg_get_functiondef('private.command_update_order_status(uuid,uuid,text)'::regprocedure);
  v_old := $a$when 'pending_payment' then array['partial_payment','paid','cancelled']$a$;
  if position(v_old in v_def) = 0 then raise exception 'h59: no se pudo parchar command_update_order_status'; end if;
  v_def := replace(v_def, v_old, $a$when 'pending_payment' then array['partial_payment','paid','in_production','cancelled']$a$);
  execute v_def;
end $$;

-- La regla del corte, en el catálogo de reglas.
update app.business_rule_catalog
   set title = 'Production cut requires confirmed orders',
       description = 'A normal production batch includes only orders confirmed with the family (in the group or in person) whose items have not changed since. Payment is not required to order (decision 02/11/2026); delivery still requires full payment.',
       metadata = metadata || jsonb_build_object('h59', 'confirmation replaces payment as the gate; delivered still requires full payment'),
       updated_at = now()
 where rule_key = 'CUT-001';
