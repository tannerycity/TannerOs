create table if not exists app.production_batches(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio text not null,
  batch_type text not null default 'orders' check(batch_type in ('orders','warranty_replacement')),
  status text not null default 'submitted' check(status in ('submitted','received','closed','cancelled')),
  supplier_name text,
  submitted_on date not null default current_date,
  received_at timestamptz,
  sales_total numeric(12,2) not null default 0 check(sales_total>=0),
  cost_total numeric(12,2) not null default 0 check(cost_total>=0),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,folio),
  unique(id,organization_id)
);
create index if not exists idx_production_batches_org_status on app.production_batches(organization_id,status,submitted_on desc);
alter table app.production_batches enable row level security;
revoke all on app.production_batches from anon,authenticated;
grant all on app.production_batches to service_role;

create table if not exists app.production_batch_orders(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references app.production_batches(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete restrict,
  sale_snapshot numeric(12,2) not null check(sale_snapshot>=0),
  cost_snapshot numeric(12,2) not null check(cost_snapshot>=0),
  created_at timestamptz not null default now(),
  unique(order_id),
  unique(batch_id,order_id),
  foreign key(batch_id,organization_id) references app.production_batches(id,organization_id) on delete cascade,
  foreign key(order_id,organization_id) references app.orders(id,organization_id) on delete restrict
);
create index if not exists idx_production_batch_orders_batch on app.production_batch_orders(organization_id,batch_id);
alter table app.production_batch_orders enable row level security;
revoke all on app.production_batch_orders from anon,authenticated;
grant all on app.production_batch_orders to service_role;

create table if not exists app.warranties(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio text not null,
  order_id uuid not null references app.orders(id) on delete restrict,
  status text not null default 'opened' check(status in ('opened','in_replacement','ready','delivered','cancelled')),
  reason text not null,
  replacement_batch_id uuid references app.production_batches(id) on delete set null,
  opened_at timestamptz not null default now(),
  delivered_at timestamptz,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,folio),
  unique(id,organization_id),
  foreign key(order_id,organization_id) references app.orders(id,organization_id) on delete restrict,
  foreign key(replacement_batch_id,organization_id) references app.production_batches(id,organization_id) on delete set null
);
create index if not exists idx_warranties_org_status on app.warranties(organization_id,status,opened_at desc);
create index if not exists idx_warranties_order on app.warranties(organization_id,order_id);
alter table app.warranties enable row level security;
revoke all on app.warranties from anon,authenticated;
grant all on app.warranties to service_role;

create table if not exists app.warranty_items(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warranty_id uuid not null references app.warranties(id) on delete cascade,
  order_item_id uuid references app.order_items(id) on delete set null,
  description_snapshot text not null,
  quantity integer not null default 1 check(quantity>0),
  unit_cost_snapshot numeric(12,2),
  attributes_snapshot jsonb not null default '{}'::jsonb,
  item_reason text,
  created_at timestamptz not null default now(),
  foreign key(warranty_id,organization_id) references app.warranties(id,organization_id) on delete cascade
);
create index if not exists idx_warranty_items_warranty on app.warranty_items(organization_id,warranty_id);
alter table app.warranty_items enable row level security;
revoke all on app.warranty_items from anon,authenticated;
grant all on app.warranty_items to service_role;

create table if not exists app.production_batch_warranties(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references app.production_batches(id) on delete cascade,
  warranty_id uuid not null references app.warranties(id) on delete restrict,
  cost_snapshot numeric(12,2) not null check(cost_snapshot>=0),
  created_at timestamptz not null default now(),
  unique(warranty_id),
  unique(batch_id,warranty_id),
  foreign key(batch_id,organization_id) references app.production_batches(id,organization_id) on delete cascade,
  foreign key(warranty_id,organization_id) references app.warranties(id,organization_id) on delete restrict
);
alter table app.production_batch_warranties enable row level security;
revoke all on app.production_batch_warranties from anon,authenticated;
grant all on app.production_batch_warranties to service_role;

create or replace function private.next_production_batch_folio(p_organization_id uuid,p_prefix text default 'COR')
returns text language plpgsql security definer set search_path='pg_catalog','app'
as $$
declare v_year text:=to_char(current_date,'YYYY'); v_next int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_prefix||':'||v_year,0));
  select coalesce(max((regexp_match(folio,'^'||p_prefix||'-'||v_year||'-([0-9]+)$'))[1]::int),0)+1 into v_next
  from app.production_batches where organization_id=p_organization_id and folio ~ ('^'||p_prefix||'-'||v_year||'-[0-9]+$');
  return p_prefix||'-'||v_year||'-'||lpad(v_next::text,4,'0');
end
$$;

create or replace function private.next_warranty_folio(p_organization_id uuid)
returns text language plpgsql security definer set search_path='pg_catalog','app'
as $$
declare v_year text:=to_char(current_date,'YYYY'); v_next int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':GAR:'||v_year,0));
  select coalesce(max((regexp_match(folio,'^GAR-'||v_year||'-([0-9]+)$'))[1]::int),0)+1 into v_next
  from app.warranties where organization_id=p_organization_id and folio ~ ('^GAR-'||v_year||'-[0-9]+$');
  return 'GAR-'||v_year||'-'||lpad(v_next::text,4,'0');
end
$$;

create or replace function private.command_create_production_batch(
  p_organization_id uuid,p_order_ids jsonb,p_supplier_name text default null,p_notes text default null
) returns uuid
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare
  v_batch uuid; v_order uuid; v_readiness jsonb; v_sale numeric:=0; v_cost numeric:=0; v_order_cost numeric; v_count int:=0;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_order_ids)<>'array' or jsonb_array_length(p_order_ids)=0 then raise exception 'At least one order is required'; end if;
  if jsonb_array_length(p_order_ids)<>(select count(distinct value) from jsonb_array_elements_text(p_order_ids)) then raise exception 'Duplicate order id'; end if;

  for v_order in select value::uuid from jsonb_array_elements_text(p_order_ids)
  loop
    if not exists(select 1 from app.orders o where o.id=v_order and o.organization_id=p_organization_id and o.status='paid') then raise exception 'Order must be paid before production batch'; end if;
    if exists(select 1 from app.production_batch_orders bo where bo.organization_id=p_organization_id and bo.order_id=v_order) then raise exception 'Order already belongs to a production batch'; end if;
    v_readiness:=private.order_readiness(p_organization_id,v_order);
    if not coalesce((v_readiness->>'ok')::boolean,false) then raise exception 'Order is not production-ready: %',v_readiness->'missing'; end if;
    if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null) then raise exception 'Frozen cost is required before production batch'; end if;
    select coalesce(sum(i.unit_cost*i.quantity),0) into v_order_cost from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order;
    v_sale:=v_sale+(select total from app.orders where id=v_order);
    v_cost:=v_cost+v_order_cost;
    v_count:=v_count+1;
  end loop;

  insert into app.production_batches(organization_id,folio,batch_type,status,supplier_name,submitted_on,sales_total,cost_total,notes,created_by_user_id)
  values(p_organization_id,private.next_production_batch_folio(p_organization_id,'COR'),'orders','submitted',nullif(trim(p_supplier_name),''),current_date,v_sale,v_cost,nullif(trim(p_notes),''),(select auth.uid()))
  returning id into v_batch;

  for v_order in select value::uuid from jsonb_array_elements_text(p_order_ids)
  loop
    select coalesce(sum(i.unit_cost*i.quantity),0) into v_order_cost from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order;
    insert into app.production_batch_orders(organization_id,batch_id,order_id,sale_snapshot,cost_snapshot)
    select p_organization_id,v_batch,o.id,o.total,v_order_cost from app.orders o where o.id=v_order and o.organization_id=p_organization_id;
    perform private.command_update_order_status(p_organization_id,v_order,'in_production');
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProductionBatchCreated','production_batch',v_batch,jsonb_build_object('orders',v_count,'salesTotal',v_sale,'costTotal',v_cost),coalesce((select auth.uid())::text,'system'));
  return v_batch;
end
$$;

create or replace function private.command_open_warranty(
  p_organization_id uuid,p_order_id uuid,p_reason text,p_items jsonb,p_notes text default null
) returns uuid
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_warranty uuid; r jsonb; v_item app.order_items%rowtype; v_qty int; v_count int:=0;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Warranty reason required'; end if;
  if not exists(select 1 from app.orders o where o.id=p_order_id and o.organization_id=p_organization_id and o.status='delivered') then raise exception 'Warranty requires a delivered order'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one warranty item is required'; end if;

  insert into app.warranties(organization_id,folio,order_id,status,reason,notes,created_by_user_id)
  values(p_organization_id,private.next_warranty_folio(p_organization_id),p_order_id,'opened',trim(p_reason),nullif(trim(p_notes),''),(select auth.uid())) returning id into v_warranty;

  for r in select value from jsonb_array_elements(p_items)
  loop
    if nullif(r->>'order_item_id','') is null then raise exception 'order_item_id required'; end if;
    select * into v_item from app.order_items where id=(r->>'order_item_id')::uuid and organization_id=p_organization_id and order_id=p_order_id;
    if not found then raise exception 'Warranty item is not part of order'; end if;
    v_qty:=coalesce((r->>'quantity')::int,1);
    if v_qty<=0 or v_qty>v_item.quantity then raise exception 'Invalid warranty quantity'; end if;
    insert into app.warranty_items(organization_id,warranty_id,order_item_id,description_snapshot,quantity,unit_cost_snapshot,attributes_snapshot,item_reason)
    values(p_organization_id,v_warranty,v_item.id,v_item.description,v_qty,v_item.unit_cost,coalesce(v_item.attributes,'{}'::jsonb),nullif(trim(r->>'reason'),''));
    v_count:=v_count+1;
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'WarrantyOpened','warranty',v_warranty,jsonb_build_object('orderId',p_order_id,'items',v_count,'reason',trim(p_reason)),coalesce((select auth.uid())::text,'system'));
  return v_warranty;
end
$$;

create or replace function private.command_create_warranty_replacement_batch(
  p_organization_id uuid,p_warranty_ids jsonb,p_supplier_name text default null,p_notes text default null
) returns uuid
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_batch uuid; v_warranty uuid; v_cost numeric:=0; v_warranty_cost numeric; v_count int:=0;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_warranty_ids)<>'array' or jsonb_array_length(p_warranty_ids)=0 then raise exception 'At least one warranty is required'; end if;
  if jsonb_array_length(p_warranty_ids)<>(select count(distinct value) from jsonb_array_elements_text(p_warranty_ids)) then raise exception 'Duplicate warranty id'; end if;
  for v_warranty in select value::uuid from jsonb_array_elements_text(p_warranty_ids)
  loop
    if not exists(select 1 from app.warranties w where w.id=v_warranty and w.organization_id=p_organization_id and w.status='opened' and w.replacement_batch_id is null) then raise exception 'Warranty is not available for replacement'; end if;
    if exists(select 1 from app.warranty_items wi where wi.organization_id=p_organization_id and wi.warranty_id=v_warranty and wi.unit_cost_snapshot is null) then raise exception 'Frozen cost is required before replacement batch'; end if;
    select coalesce(sum(wi.unit_cost_snapshot*wi.quantity),0) into v_warranty_cost from app.warranty_items wi where wi.organization_id=p_organization_id and wi.warranty_id=v_warranty;
    v_cost:=v_cost+v_warranty_cost; v_count:=v_count+1;
  end loop;

  insert into app.production_batches(organization_id,folio,batch_type,status,supplier_name,submitted_on,sales_total,cost_total,notes,created_by_user_id)
  values(p_organization_id,private.next_production_batch_folio(p_organization_id,'REP'),'warranty_replacement','submitted',nullif(trim(p_supplier_name),''),current_date,0,v_cost,nullif(trim(p_notes),''),(select auth.uid()))
  returning id into v_batch;

  for v_warranty in select value::uuid from jsonb_array_elements_text(p_warranty_ids)
  loop
    select coalesce(sum(wi.unit_cost_snapshot*wi.quantity),0) into v_warranty_cost from app.warranty_items wi where wi.organization_id=p_organization_id and wi.warranty_id=v_warranty;
    insert into app.production_batch_warranties(organization_id,batch_id,warranty_id,cost_snapshot) values(p_organization_id,v_batch,v_warranty,v_warranty_cost);
    update app.warranties set status='in_replacement',replacement_batch_id=v_batch,updated_at=now() where id=v_warranty and organization_id=p_organization_id;
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'WarrantyReplacementBatchCreated','production_batch',v_batch,jsonb_build_object('warranties',v_count,'costTotal',v_cost),coalesce((select auth.uid())::text,'system'));
  return v_batch;
end
$$;

create or replace function private.command_receive_production_batch(p_organization_id uuid,p_batch_id uuid)
returns void
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v app.production_batches%rowtype; r record;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  select * into v from app.production_batches where id=p_batch_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Production batch not found'; end if;
  if v.status<>'submitted' then raise exception 'Production batch is not awaiting receipt'; end if;

  if v.batch_type='orders' then
    for r in select order_id from app.production_batch_orders where organization_id=p_organization_id and batch_id=p_batch_id loop
      perform private.command_update_order_status(p_organization_id,r.order_id,'ready');
    end loop;
  else
    for r in select warranty_id from app.production_batch_warranties where organization_id=p_organization_id and batch_id=p_batch_id loop
      update app.warranties set status='ready',updated_at=now() where id=r.warranty_id and organization_id=p_organization_id and status='in_replacement';
    end loop;
  end if;

  update app.production_batches set status='received',received_at=now(),updated_at=now() where id=p_batch_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProductionBatchReceived','production_batch',p_batch_id,jsonb_build_object('batchType',v.batch_type),coalesce((select auth.uid())::text,'system'));
end
$$;

create or replace function private.command_deliver_warranty(p_organization_id uuid,p_warranty_id uuid,p_notes text default null)
returns void
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v app.warranties%rowtype;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  select * into v from app.warranties where id=p_warranty_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Warranty not found'; end if;
  if v.status<>'ready' then raise exception 'Warranty is not ready for delivery'; end if;
  update app.warranties set status='delivered',delivered_at=now(),notes=concat_ws(E'\n',nullif(trim(notes),''),nullif(trim(p_notes),'')),updated_at=now() where id=p_warranty_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'WarrantyDelivered','warranty',p_warranty_id,jsonb_build_object('orderId',v.order_id),coalesce((select auth.uid())::text,'system'));
end
$$;

create or replace function private.query_production_batches(p_organization_id uuid)
returns table(id uuid,folio text,batch_type text,status text,supplier_name text,submitted_on date,received_at timestamptz,sales_total numeric,cost_total numeric,notes text,order_count bigint,warranty_count bigint)
language sql stable security definer set search_path='pg_catalog','app','private'
as $$
 select b.id,b.folio,b.batch_type,b.status,b.supplier_name,b.submitted_on,b.received_at,b.sales_total,b.cost_total,b.notes,
   (select count(*) from app.production_batch_orders bo where bo.batch_id=b.id and bo.organization_id=b.organization_id),
   (select count(*) from app.production_batch_warranties bw where bw.batch_id=b.id and bw.organization_id=b.organization_id)
 from app.production_batches b where b.organization_id=p_organization_id and private.has_module_access(p_organization_id,'commerce',false)
 order by b.created_at desc
$$;

create or replace function private.query_warranties(p_organization_id uuid,p_status text default null)
returns table(id uuid,folio text,order_id uuid,status text,reason text,replacement_batch_id uuid,opened_at timestamptz,delivered_at timestamptz,notes text,item_count bigint)
language sql stable security definer set search_path='pg_catalog','app','private'
as $$
 select w.id,w.folio,w.order_id,w.status,w.reason,w.replacement_batch_id,w.opened_at,w.delivered_at,w.notes,
   (select count(*) from app.warranty_items wi where wi.warranty_id=w.id and wi.organization_id=w.organization_id)
 from app.warranties w
 where w.organization_id=p_organization_id and (p_status is null or w.status=p_status) and private.has_module_access(p_organization_id,'commerce',false)
 order by w.opened_at desc
$$;

create or replace function public.v2_create_production_batch(organization_id uuid,order_ids jsonb,supplier_name text default null,notes text default null)
returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_create_production_batch(organization_id,order_ids,supplier_name,notes) $$;
create or replace function public.v2_open_warranty(organization_id uuid,order_id uuid,reason text,items jsonb,notes text default null)
returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_open_warranty(organization_id,order_id,reason,items,notes) $$;
create or replace function public.v2_create_warranty_replacement_batch(organization_id uuid,warranty_ids jsonb,supplier_name text default null,notes text default null)
returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_create_warranty_replacement_batch(organization_id,warranty_ids,supplier_name,notes) $$;
create or replace function public.v2_receive_production_batch(organization_id uuid,batch_id uuid)
returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_receive_production_batch(organization_id,batch_id) $$;
create or replace function public.v2_deliver_warranty(organization_id uuid,warranty_id uuid,notes text default null)
returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_deliver_warranty(organization_id,warranty_id,notes) $$;
create or replace function public.v2_production_batches(organization_id uuid)
returns table(id uuid,folio text,batch_type text,status text,supplier_name text,submitted_on date,received_at timestamptz,sales_total numeric,cost_total numeric,notes text,order_count bigint,warranty_count bigint)
language sql stable security definer set search_path='pg_catalog','private' as $$ select * from private.query_production_batches(organization_id) $$;
create or replace function public.v2_warranties(organization_id uuid,status_filter text default null)
returns table(id uuid,folio text,order_id uuid,status text,reason text,replacement_batch_id uuid,opened_at timestamptz,delivered_at timestamptz,notes text,item_count bigint)
language sql stable security definer set search_path='pg_catalog','private' as $$ select * from private.query_warranties(organization_id,status_filter) $$;

revoke all on function public.v2_create_production_batch(uuid,jsonb,text,text) from public,anon;
revoke all on function public.v2_open_warranty(uuid,uuid,text,jsonb,text) from public,anon;
revoke all on function public.v2_create_warranty_replacement_batch(uuid,jsonb,text,text) from public,anon;
revoke all on function public.v2_receive_production_batch(uuid,uuid) from public,anon;
revoke all on function public.v2_deliver_warranty(uuid,uuid,text) from public,anon;
revoke all on function public.v2_production_batches(uuid) from public,anon;
revoke all on function public.v2_warranties(uuid,text) from public,anon;
grant execute on function public.v2_create_production_batch(uuid,jsonb,text,text) to authenticated;
grant execute on function public.v2_open_warranty(uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function public.v2_create_warranty_replacement_batch(uuid,jsonb,text,text) to authenticated;
grant execute on function public.v2_receive_production_batch(uuid,uuid) to authenticated;
grant execute on function public.v2_deliver_warranty(uuid,uuid,text) to authenticated;
grant execute on function public.v2_production_batches(uuid) to authenticated;
grant execute on function public.v2_warranties(uuid,text) to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('CUT-001','commerce','Production cut requires ready paid orders','A normal production batch can include only fully paid orders that pass backend production readiness. Legacy 50% cutoff is superseded by ORDER-002.','legacy',80,'command','active','pending','private.command_create_production_batch',jsonb_build_object('legacy_payment_threshold_percent',50,'effective_payment_threshold_percent',100,'superseded_by','ORDER-002')),
('CUT-002','commerce','Production cut freezes sale and cost','The batch freezes each order sale and frozen item cost; missing cost blocks procurement instead of inventing profitability.','legacy',80,'command','active','pending','app.production_batch_orders / private.command_create_production_batch','{}'),
('CUT-003','commerce','One production cut per order','An original order can belong to only one normal production batch.','legacy',80,'database','active','pending','production_batch_orders_order_id_key','{}'),
('CUT-004','commerce','Receipt moves work to ready','Receiving an order production batch moves linked in-production orders to ready through the approved order state machine.','approved_v2',100,'command','active','pending','private.command_receive_production_batch','{}'),
('GAR-001','commerce','Warranty starts from delivered order','A warranty can be opened only against an already delivered order and at least one real order item.','legacy',80,'command','active','pending','private.command_open_warranty','{}'),
('GAR-002','commerce','Warranty preserves item snapshot','Warranty pieces keep order-item description, attributes, quantity and frozen cost snapshots for traceability.','legacy',80,'command','active','pending','app.warranty_items','{}'),
('GAR-003','commerce','Replacement is zero-sale production','Warranty replacements use a dedicated production batch with zero sale and frozen replacement cost; no new customer payment is required.','legacy',80,'command','active','pending','private.command_create_warranty_replacement_batch','{}'),
('GAR-004','commerce','Warranty delivery is explicit','Replacement receipt moves warranty to ready; delivery is a separate explicit action with timestamp.','legacy',80,'command','active','pending','private.command_receive_production_batch / private.command_deliver_warranty','{}'),
('CUT-PAY-001','commerce','Provider payment responsibility','Provider payment exists in legacy cuts but v2 actor/finance authority is unresolved because it crosses commerce and accounting permissions.','legacy',80,'pending','pending','pending','public.cortes.pago_proveedor',jsonb_build_object('requires_business_decision',true))
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
