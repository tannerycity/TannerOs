create unique index if not exists ux_academy_enrollments_active on app.academy_enrollments(organization_id,academy_id,player_id) where status='active';

create or replace function private.query_academies(p_organization_id uuid)
returns table(id uuid,slug text,name text,academy_type text,description text,status text,monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text,active_enrollments bigint)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_module_access(p_organization_id,'academies',false) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.slug,a.name,a.academy_type,a.description,a.status,a.monthly_fee,a.hourly_rate,a.schedule,a.location,
         (select count(*) from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active')
  from app.academies a
  where a.organization_id=p_organization_id and a.archived_at is null
  order by a.name,a.id;
end $$;

create or replace function private.command_upsert_academy(p_organization_id uuid,p_academy_id uuid,p_slug text,p_name text,p_academy_type text,p_description text,p_status text,p_monthly_fee numeric,p_hourly_rate numeric,p_schedule jsonb,p_location text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Academy name required'; end if;
  if nullif(trim(coalesce(p_slug,'')),'') is null then raise exception 'Academy slug required'; end if;
  if p_status not in ('active','inactive','archived') then raise exception 'Invalid academy status'; end if;
  if p_academy_id is null then
    insert into app.academies(organization_id,slug,name,academy_type,description,status,monthly_fee,hourly_rate,schedule,location,created_at,updated_at)
    values(p_organization_id,lower(trim(p_slug)),trim(p_name),coalesce(nullif(trim(p_academy_type),''),'general'),nullif(trim(coalesce(p_description,'')),''),p_status,p_monthly_fee,p_hourly_rate,coalesce(p_schedule,'[]'::jsonb),nullif(trim(coalesce(p_location,'')),''),now(),now())
    returning id into v_id;
  else
    update app.academies set slug=lower(trim(p_slug)),name=trim(p_name),academy_type=coalesce(nullif(trim(p_academy_type),''),'general'),description=nullif(trim(coalesce(p_description,'')),''),status=p_status,monthly_fee=p_monthly_fee,hourly_rate=p_hourly_rate,schedule=coalesce(p_schedule,'[]'::jsonb),location=nullif(trim(coalesce(p_location,'')),''),updated_at=now(),archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end where id=p_academy_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Academy not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function private.command_enroll_academy(p_organization_id uuid,p_academy_id uuid,p_player_id uuid,p_starts_on date,p_agreed_fee numeric,p_notes text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.academies where id=p_academy_id and organization_id=p_organization_id and status='active' and archived_at is null) then raise exception 'Academy unavailable'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and status='active' and archived_at is null) then raise exception 'Player unavailable'; end if;
  insert into app.academy_enrollments(organization_id,academy_id,player_id,starts_on,agreed_fee,status,notes,created_at,updated_at)
  values(p_organization_id,p_academy_id,p_player_id,coalesce(p_starts_on,current_date),p_agreed_fee,'active',nullif(trim(coalesce(p_notes,'')),''),now(),now())
  on conflict (organization_id,academy_id,player_id) where status='active'
  do update set agreed_fee=excluded.agreed_fee,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.query_orders(p_organization_id uuid,p_status text default null)
returns table(id uuid,folio text,customer_name text,customer_phone text,customer_email text,subtotal numeric,discount numeric,total numeric,status text,source text,notes text,created_at timestamptz,item_count bigint)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  return query
  select o.id,o.folio,o.customer_name,o.customer_phone,o.customer_email,o.subtotal,o.discount,o.total,o.status,o.source,o.notes,o.created_at,
         (select count(*) from app.order_items i where i.order_id=o.id)
  from app.orders o
  where o.organization_id=p_organization_id and (p_status is null or o.status=p_status)
  order by o.created_at desc,o.id;
end $$;

create or replace function private.query_order_detail(p_organization_id uuid,p_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
declare v_order jsonb;v_items jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  select to_jsonb(o) into v_order from app.orders o where o.id=p_order_id and o.organization_id=p_organization_id;
  if v_order is null then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'description',i.description,'quantity',i.quantity,'unitPrice',i.unit_price,'attributes',i.attributes) order by i.id),'[]'::jsonb) into v_items from app.order_items i where i.order_id=p_order_id and i.organization_id=p_organization_id;
  return jsonb_build_object('order',v_order,'items',v_items);
end $$;

create or replace function private.command_update_order_status(p_organization_id uuid,p_order_id uuid,p_new_status text)
returns void language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
declare v_old text;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  select status into v_old from app.orders where id=p_order_id and organization_id=p_organization_id for update;
  if v_old is null then raise exception 'Order not found'; end if;
  if p_new_status not in ('draft','pending_payment','partial_payment','paid','in_production','ready','delivered','cancelled','refunded') then raise exception 'Invalid order status'; end if;
  if not (
    v_old=p_new_status or
    (v_old='draft' and p_new_status in ('pending_payment','cancelled')) or
    (v_old='pending_payment' and p_new_status in ('partial_payment','paid','cancelled')) or
    (v_old='partial_payment' and p_new_status in ('paid','cancelled','refunded')) or
    (v_old='paid' and p_new_status in ('in_production','ready','refunded')) or
    (v_old='in_production' and p_new_status in ('ready','refunded')) or
    (v_old='ready' and p_new_status in ('delivered','refunded')) or
    (v_old='delivered' and p_new_status='refunded') or
    (v_old='cancelled' and p_new_status='cancelled') or
    (v_old='refunded' and p_new_status='refunded')
  ) then raise exception 'Invalid order transition from % to %',v_old,p_new_status; end if;
  update app.orders set status=p_new_status,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'OrderStatusChanged','order',p_order_id,jsonb_build_object('from',v_old,'to',p_new_status),coalesce((select auth.uid())::text,'system'));
end $$;

revoke all on function private.query_academies(uuid) from public;
revoke all on function private.command_upsert_academy(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text) from public;
revoke all on function private.command_enroll_academy(uuid,uuid,uuid,date,numeric,text) from public;
revoke all on function private.query_orders(uuid,text) from public;
revoke all on function private.query_order_detail(uuid,uuid) from public;
revoke all on function private.command_update_order_status(uuid,uuid,text) from public;
grant execute on function private.query_academies(uuid) to authenticated,service_role;
grant execute on function private.command_upsert_academy(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text) to authenticated,service_role;
grant execute on function private.command_enroll_academy(uuid,uuid,uuid,date,numeric,text) to authenticated,service_role;
grant execute on function private.query_orders(uuid,text) to authenticated,service_role;
grant execute on function private.query_order_detail(uuid,uuid) to authenticated,service_role;
grant execute on function private.command_update_order_status(uuid,uuid,text) to authenticated,service_role;

create or replace function public.v2_academies(organization_id uuid)
returns table(id uuid,slug text,name text,academy_type text,description text,status text,monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text,active_enrollments bigint)
language sql security definer set search_path=pg_catalog,private as $$ select * from private.query_academies(organization_id) $$;
create or replace function public.v2_upsert_academy(organization_id uuid,academy_id uuid,slug text,name text,academy_type text,description text,status text,monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text)
returns uuid language sql security definer set search_path=pg_catalog,private as $$ select private.command_upsert_academy(organization_id,academy_id,slug,name,academy_type,description,status,monthly_fee,hourly_rate,schedule,location) $$;
create or replace function public.v2_enroll_academy(organization_id uuid,academy_id uuid,player_id uuid,starts_on date,agreed_fee numeric,notes text)
returns uuid language sql security definer set search_path=pg_catalog,private as $$ select private.command_enroll_academy(organization_id,academy_id,player_id,starts_on,agreed_fee,notes) $$;
create or replace function public.v2_orders(organization_id uuid,status_filter text default null)
returns table(id uuid,folio text,customer_name text,customer_phone text,customer_email text,subtotal numeric,discount numeric,total numeric,status text,source text,notes text,created_at timestamptz,item_count bigint)
language sql security definer set search_path=pg_catalog,private as $$ select * from private.query_orders(organization_id,status_filter) $$;
create or replace function public.v2_order_detail(organization_id uuid,order_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,private as $$ select private.query_order_detail(organization_id,order_id) $$;
create or replace function public.v2_update_order_status(organization_id uuid,order_id uuid,new_status text)
returns void language sql security definer set search_path=pg_catalog,private as $$ select private.command_update_order_status(organization_id,order_id,new_status) $$;

grant execute on function public.v2_academies(uuid) to authenticated;
grant execute on function public.v2_upsert_academy(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text) to authenticated;
grant execute on function public.v2_enroll_academy(uuid,uuid,uuid,date,numeric,text) to authenticated;
grant execute on function public.v2_orders(uuid,text) to authenticated;
grant execute on function public.v2_order_detail(uuid,uuid) to authenticated;
grant execute on function public.v2_update_order_status(uuid,uuid,text) to authenticated;;
