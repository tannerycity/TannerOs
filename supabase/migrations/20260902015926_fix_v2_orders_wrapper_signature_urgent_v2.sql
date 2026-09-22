drop function public.v2_orders(uuid, text);

create function public.v2_orders(organization_id uuid, status_filter text default null::text)
 returns table(id uuid, folio text, customer_name text, customer_phone text, customer_email text, subtotal numeric, discount numeric, total numeric, status text, source text, notes text, created_at timestamp with time zone, delivered_at timestamp with time zone, paid_amount numeric, item_count bigint)
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_orders(organization_id,status_filter) $function$;

revoke execute on function public.v2_orders(uuid, text) from public;
grant execute on function public.v2_orders(uuid, text) to postgres, authenticated, service_role;
;
