
-- 1) columna de archivado (soft-delete)
alter table app.orders add column if not exists archived_at timestamptz;

-- 2) la lista de pedidos deja de mostrar los archivados (resto idéntico)
CREATE OR REPLACE FUNCTION private.query_orders(p_organization_id uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, folio text, customer_name text, customer_phone text, customer_email text, subtotal numeric, discount numeric, total numeric, status text, source text, notes text, created_at timestamp with time zone, item_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  return query
  select o.id,o.folio,o.customer_name,o.customer_phone,o.customer_email,o.subtotal,o.discount,o.total,o.status,o.source,o.notes,o.created_at,
         (select count(*) from app.order_items i where i.order_id=o.id)
  from app.orders o
  where o.organization_id=p_organization_id and o.archived_at is null and (p_status is null or o.status=p_status)
  order by o.created_at desc,o.id;
end $function$;

-- 3) eliminar (archivar) pedido: SOLO Presidencia, con candado de dinero
create or replace function private.command_delete_order(p_organization_id uuid, p_order_id uuid)
returns void
language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_status text; v_arch timestamptz; v_paid numeric;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede eliminar pedidos'; end if;
  select status, archived_at into v_status, v_arch from app.orders where id=p_order_id and organization_id=p_organization_id for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_arch is not null then return; end if; -- ya archivado (idempotente)
  v_paid := private.order_paid_amount(p_organization_id, p_order_id);
  if v_paid > 0 and v_status not in ('cancelled','refunded') then
    raise exception 'El pedido tiene pagos registrados. Cancélalo o reembólsalo antes de eliminarlo.';
  end if;
  update app.orders set archived_at=now(), updated_at=now() where id=p_order_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrderArchived','order',p_order_id,jsonb_build_object('status',v_status,'paid',v_paid),(select auth.uid()));
end $$;

create or replace function public.v2_delete_order(organization_id uuid, order_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_delete_order(organization_id, order_id) $$;

revoke all on function public.v2_delete_order(uuid,uuid) from public, anon;
grant execute on function public.v2_delete_order(uuid,uuid) to authenticated;
;
