-- h34 · El flujo del pedido en etapas, y regresar un paso (22/10/2026).
--
-- Presidencia: "compran el pedido + nos llega a TannerOS + validamos la info y
-- el número + los viernes todos los pedidos encargados y pagados se envían al
-- proveedor + nos los entrega a la tienda + se entregan al cliente". Y: "le
-- dimos que ya estaba listo porque requerimos el PDF... tampoco pudimos
-- regresar el pedido".
--
-- 1. private.order_stage: en qué etapa va cada pedido, con las mismas reglas
--    que ya usa el corte (order_readiness y la revisión de pedidos en línea):
--    por_validar · por_cobrar · para_proveedor · con_proveedor ·
--    para_entregar · entregado · cerrado.
-- 2. v2_orders_pipeline: la etapa de todos los pedidos vigentes, con lo que
--    les falta y su corte, para pintar la Tienda en una sola llamada.
-- 3. v2_order_step_back: regresa un paso con motivo y queda en la bitácora
--    de Presidencia (h32). Un pedido que ya va en un corte enviado al
--    proveedor no se regresa (descuadraría el corte): se corrige en el corte.

create or replace function private.order_stage(p_organization_id uuid, p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
declare v_o app.orders%rowtype; v_ready jsonb; v_faltan text[]; v_datos text[]; v_revisar boolean; v_etapa text;
begin
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if not found then return null; end if;
  if v_o.status in ('cancelled', 'refunded') then return jsonb_build_object('stage', 'cerrado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'delivered' then return jsonb_build_object('stage', 'entregado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'ready' then return jsonb_build_object('stage', 'para_entregar', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'in_production' then return jsonb_build_object('stage', 'con_proveedor', 'missing', '[]'::jsonb); end if;
  v_ready := private.order_readiness(p_organization_id, p_order_id);
  select coalesce(array_agg(x), '{}') into v_faltan from jsonb_array_elements_text(coalesce(v_ready->'missing', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_datos from unnest(v_faltan) x where x !~* '(pago|anticipo|saldo)';
  v_revisar := v_o.source in ('public_form', 'public_form_bundle', 'portal_familias') and v_o.metadata->>'reviewedAt' is null;
  v_etapa := case
    when v_revisar or cardinality(v_datos) > 0 then 'por_validar'
    when v_o.status not in ('paid', 'partial_payment') or not coalesce((v_ready->>'ok')::boolean, false) then 'por_cobrar'
    else 'para_proveedor' end;
  return jsonb_build_object('stage', v_etapa, 'missing', to_jsonb(v_faltan), 'review', v_revisar);
end $$;
revoke all on function private.order_stage(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_orders_pipeline(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_object_agg(o.id, private.order_stage(o.organization_id, o.id) || jsonb_build_object('batch',
      (select jsonb_build_object('id', b.id, 'folio', b.folio, 'status', b.status, 'submittedOn', b.submitted_on)
         from app.production_batch_orders bo join app.production_batches b on b.id = bo.batch_id
        where bo.order_id = o.id and bo.organization_id = o.organization_id order by b.created_at desc limit 1)))
    from app.orders o
   where o.organization_id = v2_orders_pipeline.organization_id and o.archived_at is null), '{}'::jsonb);
end $$;
revoke all on function public.v2_orders_pipeline(uuid) from public, anon;
grant execute on function public.v2_orders_pipeline(uuid) to authenticated;

create or replace function private.command_order_step_back(p_organization_id uuid, p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private' as $$
declare v_o app.orders%rowtype; v_destino text; v_pagado numeric; v_lote record;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  if private.is_taquilla(p_organization_id) then raise exception 'Taquilla no regresa pedidos'; end if;
  perform private.motivo_obligatorio(p_reason);
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Order not found'; end if;
  v_pagado := private.order_paid_amount(p_organization_id, p_order_id);
  select bo.batch_id, b.status, b.folio into v_lote from app.production_batch_orders bo join app.production_batches b on b.id = bo.batch_id
   where bo.order_id = p_order_id and bo.organization_id = p_organization_id order by b.created_at desc limit 1;
  v_destino := case v_o.status
    when 'delivered' then 'ready'
    when 'ready' then case when v_lote.batch_id is not null then 'in_production'
                           when v_pagado >= v_o.total - 0.004 then 'paid' when v_pagado > 0 then 'partial_payment' else 'pending_payment' end
    when 'in_production' then case when v_pagado >= v_o.total - 0.004 then 'paid' when v_pagado > 0 then 'partial_payment' else 'pending_payment' end
    else null end;
  if v_destino is null then raise exception 'Este pedido no tiene un paso atrás'; end if;
  if v_o.status = 'in_production' and v_lote.batch_id is not null then
    raise exception 'Este pedido ya va en el corte % con el proveedor: no se regresa desde aquí', v_lote.folio;
  end if;
  update app.orders set status = v_destino, delivered_at = case when v_destino = 'ready' then null else delivered_at end, updated_at = now()
   where id = p_order_id and organization_id = p_organization_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'OrderSteppedBack', 'order', p_order_id,
          jsonb_build_object('from', v_o.status, 'to', v_destino, 'reason', btrim(p_reason)),
          (select auth.uid()));
  perform private.log_change(p_organization_id, 'order_step_back', 'Pedido ' || v_o.folio, p_reason,
    jsonb_build_object('status', v_o.status),
    jsonb_build_object('status', v_destino), p_order_id, null, v_o.player_id);
  return jsonb_build_object('orderId', p_order_id, 'from', v_o.status, 'to', v_destino);
end $$;
revoke all on function private.command_order_step_back(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.v2_order_step_back(organization_id uuid, order_id uuid, reason text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_order_step_back(organization_id, order_id, reason)
$$;
revoke all on function public.v2_order_step_back(uuid, uuid, text) from public, anon;
grant execute on function public.v2_order_step_back(uuid, uuid, text) to authenticated;
