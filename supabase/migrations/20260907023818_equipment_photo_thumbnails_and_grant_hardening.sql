-- 1. Thumbnail columns
alter table app.equipment_items add column if not exists photo_thumb_path text;
alter table app.equipment_units add column if not exists photo_thumb_path text;
alter table app.equipment_reports add column if not exists photo_thumb_path text;

-- 2. command_upsert_equipment_item (adds optional thumb path)
drop function if exists private.command_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text);
drop function if exists public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text);

create function private.command_upsert_equipment_item(p_organization_id uuid, p_item_id uuid, p_sku text, p_name text, p_category text, p_quantity integer, p_min_stock integer, p_unit_cost numeric, p_location text, p_status text, p_notes text, p_control_type text default 'cantidad'::text, p_photo_path text default null::text, p_photo_bucket text default null::text, p_photo_thumb_path text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid; v_is_new boolean; v_prev_quantity integer;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Item name required'; end if;
  if coalesce(p_quantity,0)<0 or coalesce(p_min_stock,0)<0 then raise exception 'Inventory quantities cannot be negative'; end if;
  if p_unit_cost is not null and p_unit_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
  if p_status not in ('active','maintenance','retired') then raise exception 'Invalid equipment status'; end if;
  if coalesce(p_control_type,'cantidad') not in ('cantidad','individual') then raise exception 'Invalid control type'; end if;

  v_is_new := p_item_id is null;
  if v_is_new then
    insert into app.equipment_items(organization_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,control_type,photo_path,photo_bucket,photo_thumb_path,created_at,updated_at)
    values(p_organization_id,nullif(trim(p_sku),''),trim(p_name),nullif(trim(p_category),''),coalesce(p_quantity,0),coalesce(p_min_stock,0),p_unit_cost,nullif(trim(p_location),''),p_status,nullif(trim(p_notes),''),coalesce(p_control_type,'cantidad'),p_photo_path,p_photo_bucket,p_photo_thumb_path,now(),now())
    returning id into v_id;
  else
    select quantity into v_prev_quantity from app.equipment_items where id=p_item_id and organization_id=p_organization_id and archived_at is null;
    update app.equipment_items set sku=nullif(trim(p_sku),''),name=trim(p_name),category=nullif(trim(p_category),''),quantity=coalesce(p_quantity,0),min_stock=coalesce(p_min_stock,0),unit_cost=p_unit_cost,location=nullif(trim(p_location),''),status=p_status,notes=nullif(trim(p_notes),''),control_type=coalesce(p_control_type,control_type),photo_path=coalesce(p_photo_path,photo_path),photo_bucket=coalesce(p_photo_bucket,photo_bucket),photo_thumb_path=coalesce(p_photo_thumb_path,photo_thumb_path),updated_at=now()
    where id=p_item_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Equipment item not found'; end if;
    if (select coalesce(sum(quantity),0) from app.equipment_assignments where organization_id=p_organization_id and equipment_item_id=v_id and returned_at is null)>coalesce(p_quantity,0) then raise exception 'Quantity cannot be lower than currently assigned quantity'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id, case when v_is_new then 'EquipmentItemCreated' else 'EquipmentItemUpdated' end,'equipment_item',v_id,
    jsonb_build_object('item_id',v_id,'name',trim(p_name),'quantity',coalesce(p_quantity,0),'previous_quantity',v_prev_quantity),
    coalesce((select auth.uid())::text,'system'),(select auth.uid()));
  return v_id;
end $function$;

create function public.v2_upsert_equipment_item(organization_id uuid, item_id uuid, sku text, name text, category text, quantity integer, min_stock integer, unit_cost numeric, location text, status text, notes text, control_type text default 'cantidad'::text, photo_path text default null::text, photo_bucket text default null::text, photo_thumb_path text default null::text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_upsert_equipment_item(organization_id,item_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,control_type,photo_path,photo_bucket,photo_thumb_path);
$function$;

-- 3. command_upsert_equipment_unit (adds optional thumb path)
drop function if exists private.command_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text);
drop function if exists public.v2_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text);

create function private.command_upsert_equipment_unit(p_organization_id uuid, p_unit_id uuid, p_item_id uuid, p_code text, p_status text, p_condition text, p_notes text, p_photo_path text default null::text, p_photo_bucket text default null::text, p_photo_thumb_path text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid; v_control_type text; v_is_new boolean;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_code)),0)<1 then raise exception 'Unit code required'; end if;
  if coalesce(p_status,'bodega') not in ('bodega','asignado','mantenimiento','baja') then raise exception 'Invalid unit status'; end if;

  select control_type into v_control_type from app.equipment_items where id=p_item_id and organization_id=p_organization_id and archived_at is null;
  if v_control_type is null then raise exception 'Equipment item not found'; end if;
  if v_control_type <> 'individual' then raise exception 'Item is not tracked as individual units'; end if;

  v_is_new := p_unit_id is null;
  if v_is_new then
    if coalesce(p_status,'bodega') = 'asignado' then raise exception 'Use the assignment flow to assign a unit'; end if;
    insert into app.equipment_units(organization_id,equipment_item_id,code,status,condition,notes,photo_path,photo_bucket,photo_thumb_path,created_at,updated_at)
    values(p_organization_id,p_item_id,trim(p_code),coalesce(p_status,'bodega'),nullif(trim(p_condition),''),nullif(trim(p_notes),''),p_photo_path,p_photo_bucket,p_photo_thumb_path,now(),now())
    returning id into v_id;
  else
    update app.equipment_units set code=trim(p_code),
      status=case when status='asignado' then status else coalesce(p_status,status) end,
      condition=nullif(trim(p_condition),''), notes=nullif(trim(p_notes),''),
      photo_path=coalesce(p_photo_path,photo_path), photo_bucket=coalesce(p_photo_bucket,photo_bucket),
      photo_thumb_path=coalesce(p_photo_thumb_path,photo_thumb_path),
      updated_at=now()
    where id=p_unit_id and organization_id=p_organization_id and equipment_item_id=p_item_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Equipment unit not found' ; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id, case when v_is_new then 'EquipmentUnitCreated' else 'EquipmentUnitUpdated' end,'equipment_unit',v_id,
    jsonb_build_object('item_id',p_item_id,'unit_id',v_id,'code',trim(p_code),'status',coalesce(p_status,'bodega')),
    coalesce((select auth.uid())::text,'system'),(select auth.uid()));
  return v_id;
end $function$;

create function public.v2_upsert_equipment_unit(organization_id uuid, unit_id uuid, item_id uuid, code text, status text, condition text, notes text, photo_path text default null::text, photo_bucket text default null::text, photo_thumb_path text default null::text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_upsert_equipment_unit(organization_id,unit_id,item_id,code,status,condition,notes,photo_path,photo_bucket,photo_thumb_path);
$function$;

-- 4. command_report_equipment_issue (adds optional thumb path)
drop function if exists private.command_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text);
drop function if exists public.v2_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text);

create function private.command_report_equipment_issue(p_organization_id uuid, p_item_id uuid, p_unit_id uuid, p_report_type text, p_quantity integer, p_reason text, p_photo_path text, p_photo_bucket text, p_comment text, p_photo_thumb_path text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  if p_report_type not in ('perdido','danado','roto','faltante','reposicion','material_adicional') then raise exception 'Invalid report type'; end if;
  if p_item_id is null and p_unit_id is null then raise exception 'Item or unit required'; end if;

  insert into app.equipment_reports(organization_id,equipment_item_id,equipment_unit_id,report_type,quantity,reason,photo_path,photo_bucket,photo_thumb_path,comment,reported_by_user_id,created_at)
  values(p_organization_id,p_item_id,p_unit_id,p_report_type,p_quantity,nullif(trim(p_reason),''),p_photo_path,p_photo_bucket,p_photo_thumb_path,nullif(trim(p_comment),''),auth.uid(),now())
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id,'EquipmentIssueReported','equipment_report',v_id,
    jsonb_build_object('item_id',p_item_id,'unit_id',p_unit_id,'report_type',p_report_type,'quantity',p_quantity),
    coalesce((select auth.uid())::text,'system'),(select auth.uid()));
  return v_id;
end $function$;

create function public.v2_report_equipment_issue(organization_id uuid, item_id uuid, unit_id uuid, report_type text, quantity integer, reason text, photo_path text, photo_bucket text, comment text, photo_thumb_path text default null::text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_report_equipment_issue(organization_id,item_id,unit_id,report_type,quantity,reason,photo_path,photo_bucket,comment,photo_thumb_path);
$function$;

-- 5. query_equipment_items / v2_equipment_items (adds photo_thumb_path column)
drop function if exists private.query_equipment_items(uuid);
drop function if exists public.v2_equipment_items(uuid);

create function private.query_equipment_items(p_organization_id uuid)
returns table(id uuid, sku text, name text, category text, quantity integer, min_stock integer, unit_cost numeric, location text, status text, control_type text, photo_path text, photo_bucket text, photo_thumb_path text, assigned_quantity bigint, available_quantity bigint, needs_reorder boolean, units_total bigint, units_bodega bigint, units_asignado bigint, units_mantenimiento bigint, units_baja bigint)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select i.id,i.sku,i.name,i.category,i.quantity,i.min_stock,i.unit_cost,i.location,i.status,
         i.control_type,i.photo_path,i.photo_bucket,i.photo_thumb_path,
         coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0)::bigint as assigned_quantity,
         greatest(0,i.quantity-coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0))::bigint as available_quantity,
         (i.min_stock>0 and greatest(0,i.quantity-coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0))<i.min_stock) as needs_reorder,
         coalesce((select count(*) from app.equipment_units u where u.equipment_item_id=i.id and u.archived_at is null),0)::bigint as units_total,
         coalesce((select count(*) from app.equipment_units u where u.equipment_item_id=i.id and u.archived_at is null and u.status='bodega'),0)::bigint as units_bodega,
         coalesce((select count(*) from app.equipment_units u where u.equipment_item_id=i.id and u.archived_at is null and u.status='asignado'),0)::bigint as units_asignado,
         coalesce((select count(*) from app.equipment_units u where u.equipment_item_id=i.id and u.archived_at is null and u.status='mantenimiento'),0)::bigint as units_mantenimiento,
         coalesce((select count(*) from app.equipment_units u where u.equipment_item_id=i.id and u.archived_at is null and u.status='baja'),0)::bigint as units_baja
  from app.equipment_items i where i.organization_id=p_organization_id and i.archived_at is null order by i.category nulls last,i.name;
end $function$;

create function public.v2_equipment_items(organization_id uuid)
returns table(id uuid, sku text, name text, category text, quantity integer, min_stock integer, unit_cost numeric, location text, status text, control_type text, photo_path text, photo_bucket text, photo_thumb_path text, assigned_quantity bigint, available_quantity bigint, needs_reorder boolean, units_total bigint, units_bodega bigint, units_asignado bigint, units_mantenimiento bigint, units_baja bigint)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select * from private.query_equipment_items(organization_id);
$function$;

-- 6. query_equipment_units / v2_equipment_units (adds photo_thumb_path column)
drop function if exists private.query_equipment_units(uuid,uuid);
drop function if exists public.v2_equipment_units(uuid,uuid);

create function private.query_equipment_units(p_organization_id uuid, p_item_id uuid)
returns table(id uuid, equipment_item_id uuid, code text, status text, condition text, current_holder_user_id uuid, holder_name text, photo_path text, photo_bucket text, photo_thumb_path text, notes text, updated_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select u.id,u.equipment_item_id,u.code,u.status,u.condition,u.current_holder_user_id,
         pr.display_name, u.photo_path,u.photo_bucket,u.photo_thumb_path,u.notes,u.updated_at
  from app.equipment_units u
  left join public.profiles pr on pr.user_id=u.current_holder_user_id
  where u.organization_id=p_organization_id and u.equipment_item_id=p_item_id and u.archived_at is null
  order by u.code;
end $function$;

create function public.v2_equipment_units(organization_id uuid, item_id uuid)
returns table(id uuid, equipment_item_id uuid, code text, status text, condition text, current_holder_user_id uuid, holder_name text, photo_path text, photo_bucket text, photo_thumb_path text, notes text, updated_at timestamp with time zone)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select * from private.query_equipment_units(organization_id,item_id);
$function$;

-- 7. query_equipment_reports / v2_equipment_reports (adds photo_thumb_path column)
drop function if exists private.query_equipment_reports(uuid);
drop function if exists public.v2_equipment_reports(uuid);

create function private.query_equipment_reports(p_organization_id uuid)
returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text, report_type text, quantity integer, reason text, photo_path text, photo_bucket text, photo_thumb_path text, comment text, status text, reported_by_user_id uuid, reporter_name text, resolved_by_user_id uuid, resolver_name text, resolution_note text, created_at timestamp with time zone, resolved_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select r.id,r.equipment_item_id,i.name,r.equipment_unit_id,u.code,r.report_type,r.quantity,r.reason,r.photo_path,r.photo_bucket,r.photo_thumb_path,r.comment,r.status,
         r.reported_by_user_id,rp.display_name,r.resolved_by_user_id,sp.display_name,r.resolution_note,r.created_at,r.resolved_at
  from app.equipment_reports r
  left join app.equipment_items i on i.id=r.equipment_item_id
  left join app.equipment_units u on u.id=r.equipment_unit_id
  left join public.profiles rp on rp.user_id=r.reported_by_user_id
  left join public.profiles sp on sp.user_id=r.resolved_by_user_id
  where r.organization_id=p_organization_id
  order by (r.status in ('pendiente','en_reparacion')) desc, r.created_at desc;
end $function$;

create function public.v2_equipment_reports(organization_id uuid)
returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text, report_type text, quantity integer, reason text, photo_path text, photo_bucket text, photo_thumb_path text, comment text, status text, reported_by_user_id uuid, reporter_name text, resolved_by_user_id uuid, resolver_name text, resolution_note text, created_at timestamp with time zone, resolved_at timestamp with time zone)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select * from private.query_equipment_reports(organization_id);
$function$;

-- 8. query_my_equipment_kit / v2_my_equipment_kit (adds item/unit photo_thumb_path)
drop function if exists private.query_my_equipment_kit(uuid);
drop function if exists public.v2_my_equipment_kit(uuid);

create function private.query_my_equipment_kit(p_organization_id uuid)
returns table(id uuid, equipment_item_id uuid, item_name text, category text, equipment_unit_id uuid, unit_code text, quantity integer, assigned_at timestamp with time zone, notes text, item_photo_path text, item_photo_bucket text, item_photo_thumb_path text, unit_photo_path text, unit_photo_bucket text, unit_photo_thumb_path text)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.equipment_item_id,i.name,i.category,a.equipment_unit_id,u.code,a.quantity,a.assigned_at,a.notes,
         i.photo_path,i.photo_bucket,i.photo_thumb_path,u.photo_path,u.photo_bucket,u.photo_thumb_path
  from app.equipment_assignments a
  join app.equipment_items i on i.id=a.equipment_item_id and i.organization_id=a.organization_id
  left join app.equipment_units u on u.id=a.equipment_unit_id
  where a.organization_id=p_organization_id and a.returned_at is null and a.assigned_to_user_id=(select auth.uid())
  order by a.assigned_at desc;
end $function$;

create function public.v2_my_equipment_kit(organization_id uuid)
returns table(id uuid, equipment_item_id uuid, item_name text, category text, equipment_unit_id uuid, unit_code text, quantity integer, assigned_at timestamp with time zone, notes text, item_photo_path text, item_photo_bucket text, item_photo_thumb_path text, unit_photo_path text, unit_photo_bucket text, unit_photo_thumb_path text)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select * from private.query_my_equipment_kit(organization_id);
$function$;

-- 9. Grants: harden to match the rest of the app (authenticated only).
revoke all on function private.command_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function private.command_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function private.command_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text,text) from public, anon, authenticated;
revoke all on function private.query_equipment_items(uuid) from public, anon, authenticated;
revoke all on function private.query_equipment_units(uuid,uuid) from public, anon, authenticated;
revoke all on function private.query_equipment_reports(uuid) from public, anon, authenticated;
revoke all on function private.query_my_equipment_kit(uuid) from public, anon, authenticated;

revoke all on function public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.v2_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.v2_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text,text) from public, anon;
revoke all on function public.v2_equipment_items(uuid) from public, anon;
revoke all on function public.v2_equipment_units(uuid,uuid) from public, anon;
revoke all on function public.v2_equipment_reports(uuid) from public, anon;
revoke all on function public.v2_my_equipment_kit(uuid) from public, anon;

grant execute on function public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.v2_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.v2_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text,text) to authenticated;
grant execute on function public.v2_equipment_items(uuid) to authenticated;
grant execute on function public.v2_equipment_units(uuid,uuid) to authenticated;
grant execute on function public.v2_equipment_reports(uuid) to authenticated;
grant execute on function public.v2_my_equipment_kit(uuid) to authenticated;
;
