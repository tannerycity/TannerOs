-- h87 (11/11/2026, Presidencia: "dale a todos", fase 3 de la tienda).
-- La familia confirma su pedido con un toque. Antes el club confirmaba a mano
-- ("en el grupo" o "en persona") y movía el pedido de Revisar a Por pedir.
--
-- Ahora el mensaje de WhatsApp para confirmar lleva una liga única del pedido
-- (/tienda/#/confirma/<token>). La familia ve lo que pidió (tallas, nombre,
-- número, manga) y toca:
--   · "Sí, todo está bien": el pedido queda confirmado "por la familia" con la
--     misma huella de piezas que usa el club (si después cambia una pieza, se
--     pide confirmar otra vez, como siempre).
--   · "Necesito cambiar algo": escribe qué; el pedido se queda en Revisar con
--     "La familia pidió un cambio: ..." para que el club lo vea.
--
-- La liga no expone datos personales: el folio, el primer nombre de quien
-- pidió y las piezas. El token son 64 caracteres al azar y sólo sirve mientras
-- el pedido no se mande al proveedor.

-- Índice para buscar por token sin recorrer pedidos.
create index if not exists orders_confirm_token_idx on app.orders ((metadata->>'confirmToken'))
  where metadata ? 'confirmToken';

-- 1. La liga (el club la pide al armar el mensaje).
create or replace function private.command_order_confirm_link(p_organization_id uuid, p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_o app.orders%rowtype; v_token text;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then
    raise exception 'El pedido % ya se pidió al proveedor o está cerrado: ya no se confirma', v_o.folio;
  end if;
  v_token := nullif(v_o.metadata->>'confirmToken', '');
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update app.orders set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('confirmToken', v_token)
     where id = p_order_id;
  end if;
  return jsonb_build_object('token', v_token);
end $$;
revoke all on function private.command_order_confirm_link(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_order_confirm_link(organization_id uuid, order_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.command_order_confirm_link(organization_id, order_id) $$;
revoke all on function public.v2_order_confirm_link(uuid, uuid) from public, anon;
grant execute on function public.v2_order_confirm_link(uuid, uuid) to authenticated;

-- 2. Lo que ve la familia al abrir la liga.
create or replace function private.public_order_to_confirm(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_o app.orders%rowtype; v_estado text;
begin
  if p_token is null or length(p_token) < 40 then return null; end if;
  select * into v_o from app.orders where metadata->>'confirmToken' = p_token limit 1;
  if not found or v_o.archived_at is not null then return null; end if;
  v_estado := case
    when v_o.status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then 'cerrado'
    when v_o.metadata ? 'cambioPedido' then 'cambio'
    when private.order_confirmada(v_o.organization_id, v_o.id) then 'confirmado'
    else 'pendiente' end;
  return jsonb_build_object(
    'folio', v_o.folio,
    'cliente', split_part(btrim(coalesce(v_o.customer_name, '')), ' ', 1),
    'club', (select coalesce(nullif(o.branding->>'brand', ''), o.name) from public.organizations o where o.id = v_o.organization_id),
    'total', v_o.total,
    'estado', v_estado,
    'confirmadoAt', v_o.metadata->'confirmado'->>'at',
    'cambio', v_o.metadata->'cambioPedido'->>'nota',
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'descripcion', i.description, 'cantidad', i.quantity,
        'talla', coalesce(i.attributes->>'talla', i.attributes->>'size'),
        'nombre', coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'),
        'numero', coalesce(i.attributes->>'numero', i.attributes->>'number'),
        'manga', i.attributes->>'manga') order by i.created_at)
      from app.order_items i where i.order_id = v_o.id), '[]'::jsonb));
end $$;
revoke all on function private.public_order_to_confirm(text) from public, anon, authenticated;

create or replace function public.v2_public_order_to_confirm(token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.public_order_to_confirm(token) $$;
revoke all on function public.v2_public_order_to_confirm(text) from public;
grant execute on function public.v2_public_order_to_confirm(text) to anon, authenticated;

-- 3. La familia decide.
create or replace function private.public_confirm_order(p_token text, p_decision text, p_nota text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_o app.orders%rowtype; v_numeros jsonb; v_nota text := left(btrim(coalesce(p_nota, '')), 500);
begin
  if p_decision not in ('ok', 'cambio') then raise exception 'Decisión no válida'; end if;
  if p_token is null or length(p_token) < 40 then raise exception 'Liga no válida'; end if;
  select * into v_o from app.orders where metadata->>'confirmToken' = p_token for update;
  if not found or v_o.archived_at is not null then raise exception 'Liga no válida'; end if;
  if v_o.status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then
    raise exception 'Este pedido ya se mandó al proveedor: para cualquier cambio escríbele al club';
  end if;
  if p_decision = 'ok' then
    select coalesce(jsonb_agg(distinct btrim(coalesce(i.attributes->>'numero', i.attributes->>'number'))), '[]'::jsonb) into v_numeros
      from app.order_items i where i.order_id = v_o.id
       and nullif(btrim(coalesce(i.attributes->>'numero', i.attributes->>'number', '')), '') is not null;
    update app.orders set metadata = (coalesce(metadata, '{}'::jsonb) - 'cambioPedido')
        || jsonb_build_object('confirmado', jsonb_build_object('via', 'familia', 'at', now(), 'by', null,
             'huella', private.order_huella(v_o.organization_id, v_o.id)))
        || case when jsonb_array_length(v_numeros) > 0
             then jsonb_build_object('numeroConfirmado', jsonb_build_object('numeros', v_numeros, 'at', now(), 'porFamilia', true))
             else '{}'::jsonb end
        || case when v_o.metadata->>'reviewedAt' is null then jsonb_build_object('reviewedAt', now(), 'reviewedBy', null) else '{}'::jsonb end,
        updated_at = now()
     where id = v_o.id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_o.organization_id, 'OrderConfirmed', 'order', v_o.id, jsonb_build_object('via', 'familia'), null);
  else
    if length(v_nota) < 3 then raise exception 'Escribe qué quieres cambiar'; end if;
    update app.orders set metadata = (coalesce(metadata, '{}'::jsonb) - 'confirmado')
        || jsonb_build_object('cambioPedido', jsonb_build_object('nota', v_nota, 'at', now())), updated_at = now()
     where id = v_o.id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_o.organization_id, 'OrderChangeRequested', 'order', v_o.id, jsonb_build_object('nota', v_nota), null);
  end if;
  return private.public_order_to_confirm(p_token);
end $$;
revoke all on function private.public_confirm_order(text, text, text) from public, anon, authenticated;

create or replace function public.v2_public_confirm_order(token text, decision text, nota text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.public_confirm_order(token, decision, nota) $$;
revoke all on function public.v2_public_confirm_order(text, text, text) from public;
grant execute on function public.v2_public_confirm_order(text, text, text) to anon, authenticated;

-- 4. Cuando el club confirma a mano, el cambio pedido queda atendido.
create or replace function private.confirm_order(p_organization_id uuid, p_order_id uuid, p_via text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
    update app.orders set metadata = (coalesce(metadata, '{}'::jsonb) - 'cambioPedido')
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
$function$;

-- 5. La etapa dice "La familia pidió un cambio: ..." y lo devuelve.
create or replace function private.order_stage(p_organization_id uuid, p_order_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_o app.orders%rowtype; v_ready jsonb; v_faltan text[]; v_datos text[]; v_revisar boolean; v_etapa text; v_conf boolean;
begin
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if not found then return null; end if;
  if v_o.status in ('cancelled', 'refunded') then return jsonb_build_object('stage', 'cerrado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'delivered' then return jsonb_build_object('stage', 'entregado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'ready' then return jsonb_build_object('stage', 'para_entregar', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'in_production' then return jsonb_build_object('stage', 'con_proveedor', 'missing', '[]'::jsonb); end if;
  v_ready := private.order_readiness(p_organization_id, p_order_id);
  select coalesce(array_agg(x), '{}') into v_faltan from jsonb_array_elements_text(coalesce(v_ready->'missing', '[]'::jsonb)) x;
  if v_o.player_id is null and coalesce(v_o.metadata->'tanner'->>'tipo', '') <> 'no_tanner' and v_o.source <> 'legacy_import' then
    v_faltan := v_faltan || 'De qué Tanner es'::text;
  end if;
  select coalesce(array_agg(x), '{}') into v_datos from unnest(v_faltan) x where x !~* '(pago|anticipo|saldo)';
  v_revisar := v_o.source in ('public_form', 'public_form_bundle', 'portal_familias') and v_o.metadata->>'reviewedAt' is null;
  v_conf := private.order_confirmada(p_organization_id, p_order_id);
  if v_o.metadata ? 'cambioPedido' then
    v_faltan := v_faltan || ('La familia pidió un cambio: ' || left(v_o.metadata->'cambioPedido'->>'nota', 120))::text;
  elsif not v_conf then
    v_faltan := v_faltan || (case when v_o.metadata ? 'confirmado' then 'Volver a confirmar: el pedido cambió' else 'Confirmar con la familia' end)::text;
  end if;
  v_etapa := case
    when v_revisar or cardinality(v_datos) > 0 or not v_conf then 'por_validar'
    when not coalesce((v_ready->>'ok')::boolean, false) then 'por_cobrar'
    else 'para_proveedor' end;
  return jsonb_build_object('stage', v_etapa, 'missing', to_jsonb(v_faltan), 'review', v_revisar,
    'confirmado', case when v_o.metadata ? 'confirmado' then jsonb_build_object(
      'via', v_o.metadata->'confirmado'->>'via', 'at', v_o.metadata->'confirmado'->>'at', 'vigente', v_conf) end,
    'cambio', case when v_o.metadata ? 'cambioPedido' then v_o.metadata->'cambioPedido' end);
end $function$;
