-- ============================================================
-- Utilería — control por artículo (cantidad/individual), fotos,
-- kit ligado a usuario real, incidencias, trazabilidad, valor de
-- inventario. No se toca nada de lo que ya funciona.
-- ============================================================

-- 1) equipment_items: tipo de control + foto
alter table app.equipment_items
  add column if not exists control_type text not null default 'cantidad',
  add column if not exists photo_path text,
  add column if not exists photo_bucket text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'equipment_items_control_type_check'
  ) then
    alter table app.equipment_items
      add constraint equipment_items_control_type_check
      check (control_type in ('cantidad','individual'));
  end if;
end $$;

-- 2) equipment_units: activos individuales (balón #025, etc.)
create table if not exists app.equipment_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  equipment_item_id uuid not null references app.equipment_items(id),
  code text not null,
  status text not null default 'bodega' check (status in ('bodega','asignado','mantenimiento','baja')),
  condition text,
  current_holder_user_id uuid,
  photo_path text,
  photo_bucket text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists equipment_units_org_item_code_uk
  on app.equipment_units(organization_id, equipment_item_id, lower(code))
  where archived_at is null;
create index if not exists equipment_units_item_idx on app.equipment_units(equipment_item_id);
create index if not exists equipment_units_holder_idx on app.equipment_units(current_holder_user_id);

alter table app.equipment_units enable row level security;
drop policy if exists v2_equipment_units_read on app.equipment_units;
create policy v2_equipment_units_read on app.equipment_units for select
  using (private.has_module_access(organization_id,'equipment',false));
drop policy if exists v2_equipment_units_insert on app.equipment_units;
create policy v2_equipment_units_insert on app.equipment_units for insert
  with check (private.has_module_access(organization_id,'equipment',true));
drop policy if exists v2_equipment_units_update on app.equipment_units;
create policy v2_equipment_units_update on app.equipment_units for update
  using (private.has_module_access(organization_id,'equipment',true))
  with check (private.has_module_access(organization_id,'equipment',true));
grant select on app.equipment_units to authenticated;

-- 3) equipment_assignments: liga a una unidad individual (opcional)
alter table app.equipment_assignments
  add column if not exists equipment_unit_id uuid references app.equipment_units(id);

-- 4) equipment_reports: incidencias
create table if not exists app.equipment_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  equipment_item_id uuid references app.equipment_items(id),
  equipment_unit_id uuid references app.equipment_units(id),
  report_type text not null check (report_type in ('perdido','danado','roto','faltante','reposicion','material_adicional')),
  quantity integer,
  reason text,
  photo_path text,
  photo_bucket text,
  comment text,
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado','en_reparacion','resuelto','cerrado')),
  reported_by_user_id uuid not null,
  resolved_by_user_id uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists equipment_reports_org_idx on app.equipment_reports(organization_id, status);
create index if not exists equipment_reports_reporter_idx on app.equipment_reports(reported_by_user_id);

alter table app.equipment_reports enable row level security;
drop policy if exists v2_equipment_reports_read on app.equipment_reports;
create policy v2_equipment_reports_read on app.equipment_reports for select
  using (
    private.has_module_access(organization_id,'equipment',true)
    or reported_by_user_id = (select auth.uid())
  );
drop policy if exists v2_equipment_reports_insert on app.equipment_reports;
create policy v2_equipment_reports_insert on app.equipment_reports for insert
  with check (private.has_module_access(organization_id,'equipment',false));
drop policy if exists v2_equipment_reports_update on app.equipment_reports;
create policy v2_equipment_reports_update on app.equipment_reports for update
  using (private.has_module_access(organization_id,'equipment',true))
  with check (private.has_module_access(organization_id,'equipment',true));
grant select, insert on app.equipment_reports to authenticated;

-- 5) Cerrar hueco de permisos: Formadores deja de tener escritura
--    general sobre Utilería (solo Presidencia/Operaciones la conservan).
update public.role_module_permissions
set can_write = false, updated_at = now()
where module_code = 'utileria' and role = 'Formadores' and can_write = true;

-- 6) Endurecer lectura directa de tabla (defensa en profundidad)
drop policy if exists v2_equipment_items_read on app.equipment_items;
create policy v2_equipment_items_read on app.equipment_items for select
  using (private.has_module_access(organization_id,'equipment',true));

drop policy if exists v2_equipment_assignments_read on app.equipment_assignments;
create policy v2_equipment_assignments_read on app.equipment_assignments for select
  using (
    private.has_module_access(organization_id,'equipment',true)
    or assigned_to_user_id = (select auth.uid())
  );

-- ============================================================
-- RPCs
-- ============================================================

create or replace function private.command_upsert_equipment_item(
  p_organization_id uuid, p_item_id uuid, p_sku text, p_name text, p_category text,
  p_quantity integer, p_min_stock integer, p_unit_cost numeric, p_location text,
  p_status text, p_notes text,
  p_control_type text default 'cantidad', p_photo_path text default null, p_photo_bucket text default null
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
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
    insert into app.equipment_items(organization_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,control_type,photo_path,photo_bucket,created_at,updated_at)
    values(p_organization_id,nullif(trim(p_sku),''),trim(p_name),nullif(trim(p_category),''),coalesce(p_quantity,0),coalesce(p_min_stock,0),p_unit_cost,nullif(trim(p_location),''),p_status,nullif(trim(p_notes),''),coalesce(p_control_type,'cantidad'),p_photo_path,p_photo_bucket,now(),now())
    returning id into v_id;
  else
    select quantity into v_prev_quantity from app.equipment_items where id=p_item_id and organization_id=p_organization_id and archived_at is null;
    update app.equipment_items set sku=nullif(trim(p_sku),''),name=trim(p_name),category=nullif(trim(p_category),''),quantity=coalesce(p_quantity,0),min_stock=coalesce(p_min_stock,0),unit_cost=p_unit_cost,location=nullif(trim(p_location),''),status=p_status,notes=nullif(trim(p_notes),''),control_type=coalesce(p_control_type,control_type),photo_path=coalesce(p_photo_path,photo_path),photo_bucket=coalesce(p_photo_bucket,photo_bucket),updated_at=now()
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

create or replace function public.v2_upsert_equipment_item(
  organization_id uuid, item_id uuid, sku text, name text, category text,
  quantity integer, min_stock integer, unit_cost numeric, location text, status text, notes text,
  control_type text default 'cantidad', photo_path text default null, photo_bucket text default null
) returns uuid language sql security definer set search_path to 'pg_catalog','private' as $function$
  select private.command_upsert_equipment_item(organization_id,item_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,control_type,photo_path,photo_bucket);
$function$;
grant execute on function public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text,text,text,text) to authenticated;

create or replace function private.command_upsert_equipment_unit(
  p_organization_id uuid, p_unit_id uuid, p_item_id uuid, p_code text,
  p_status text, p_condition text, p_notes text, p_photo_path text default null, p_photo_bucket text default null
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
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
    insert into app.equipment_units(organization_id,equipment_item_id,code,status,condition,notes,photo_path,photo_bucket,created_at,updated_at)
    values(p_organization_id,p_item_id,trim(p_code),coalesce(p_status,'bodega'),nullif(trim(p_condition),''),nullif(trim(p_notes),''),p_photo_path,p_photo_bucket,now(),now())
    returning id into v_id;
  else
    update app.equipment_units set code=trim(p_code),
      status=case when status='asignado' then status else coalesce(p_status,status) end,
      condition=nullif(trim(p_condition),''), notes=nullif(trim(p_notes),''),
      photo_path=coalesce(p_photo_path,photo_path), photo_bucket=coalesce(p_photo_bucket,photo_bucket),
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

create or replace function public.v2_upsert_equipment_unit(
  organization_id uuid, unit_id uuid, item_id uuid, code text, status text, condition text, notes text,
  photo_path text default null, photo_bucket text default null
) returns uuid language sql security definer set search_path to 'pg_catalog','private' as $function$
  select private.command_upsert_equipment_unit(organization_id,unit_id,item_id,code,status,condition,notes,photo_path,photo_bucket);
$function$;
grant execute on function public.v2_upsert_equipment_unit(uuid,uuid,uuid,text,text,text,text,text,text) to authenticated;

create or replace function private.command_assign_equipment(
  p_organization_id uuid, p_item_id uuid, p_assigned_to_user_id uuid, p_assigned_to_label text,
  p_quantity integer, p_notes text, p_equipment_unit_id uuid default null
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
declare v_id uuid; v_total integer; v_assigned integer; v_control_type text; v_unit_status text; v_unit_item uuid; v_quantity integer;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if p_assigned_to_user_id is null and nullif(trim(coalesce(p_assigned_to_label,'')),'') is null then raise exception 'Assignment recipient required'; end if;

  select quantity, control_type into v_total, v_control_type from app.equipment_items where id=p_item_id and organization_id=p_organization_id and status='active' and archived_at is null for update;
  if not found then raise exception 'Equipment item unavailable'; end if;

  if p_equipment_unit_id is not null then
    if v_control_type <> 'individual' then raise exception 'Item is not tracked as individual units'; end if;
    select status, equipment_item_id into v_unit_status, v_unit_item from app.equipment_units where id=p_equipment_unit_id and organization_id=p_organization_id and archived_at is null for update;
    if not found or v_unit_item <> p_item_id then raise exception 'Equipment unit not found'; end if;
    if v_unit_status <> 'bodega' then raise exception 'Equipment unit not available'; end if;
    v_quantity := 1;
  else
    v_quantity := coalesce(p_quantity,0);
    if v_quantity<=0 then raise exception 'Assignment quantity must be greater than zero'; end if;
    select coalesce(sum(quantity),0) into v_assigned from app.equipment_assignments where organization_id=p_organization_id and equipment_item_id=p_item_id and returned_at is null;
    if v_assigned+v_quantity>v_total then raise exception 'Not enough equipment available'; end if;
  end if;

  insert into app.equipment_assignments(organization_id,equipment_item_id,equipment_unit_id,assigned_to_user_id,assigned_to_label,quantity,assigned_at,notes)
  values(p_organization_id,p_item_id,p_equipment_unit_id,p_assigned_to_user_id,nullif(trim(p_assigned_to_label),''),v_quantity,now(),nullif(trim(p_notes),'')) returning id into v_id;

  if p_equipment_unit_id is not null then
    update app.equipment_units set status='asignado', current_holder_user_id=p_assigned_to_user_id, updated_at=now() where id=p_equipment_unit_id;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id,'EquipmentAssigned','equipment_assignment',v_id,
    jsonb_build_object('item_id',p_item_id,'unit_id',p_equipment_unit_id,'quantity',v_quantity,'recipient_user_id',p_assigned_to_user_id,'recipient',p_assigned_to_label),
    coalesce((select auth.uid())::text,'system'),(select auth.uid()));
  return v_id;
end $function$;

create or replace function public.v2_assign_equipment(
  organization_id uuid, item_id uuid, assigned_to_user_id uuid, assigned_to_label text,
  quantity integer, notes text, equipment_unit_id uuid default null
) returns uuid language sql security definer set search_path to 'pg_catalog','private' as $function$
  select private.command_assign_equipment(organization_id,item_id,assigned_to_user_id,assigned_to_label,quantity,notes,equipment_unit_id);
$function$;
grant execute on function public.v2_assign_equipment(uuid,uuid,uuid,text,integer,text,uuid) to authenticated;

create or replace function private.command_return_equipment(p_organization_id uuid, p_assignment_id uuid, p_notes text)
 returns void language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
declare v_unit_id uuid;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  update app.equipment_assignments set returned_at=now(),notes=case when nullif(trim(coalesce(p_notes,'')),'') is null then notes else concat_ws(E'\n',notes,trim(p_notes)) end
  where id=p_assignment_id and organization_id=p_organization_id and returned_at is null
  returning equipment_unit_id into v_unit_id;
  if not found then raise exception 'Active assignment not found'; end if;

  if v_unit_id is not null then
    update app.equipment_units set status='bodega', current_holder_user_id=null, updated_at=now() where id=v_unit_id;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id,'EquipmentReturned','equipment_assignment',p_assignment_id,jsonb_build_object('notes',nullif(trim(coalesce(p_notes,'')),''),'unit_id',v_unit_id),coalesce((select auth.uid())::text,'system'),(select auth.uid()));
end $function$;

create or replace function private.command_report_equipment_issue(
  p_organization_id uuid, p_item_id uuid, p_unit_id uuid, p_report_type text,
  p_quantity integer, p_reason text, p_photo_path text, p_photo_bucket text, p_comment text
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  if p_report_type not in ('perdido','danado','roto','faltante','reposicion','material_adicional') then raise exception 'Invalid report type'; end if;
  if p_item_id is null and p_unit_id is null then raise exception 'Item or unit required'; end if;

  insert into app.equipment_reports(organization_id,equipment_item_id,equipment_unit_id,report_type,quantity,reason,photo_path,photo_bucket,comment,reported_by_user_id,created_at)
  values(p_organization_id,p_item_id,p_unit_id,p_report_type,p_quantity,nullif(trim(p_reason),''),p_photo_path,p_photo_bucket,nullif(trim(p_comment),''),auth.uid(),now())
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id,'EquipmentIssueReported','equipment_report',v_id,
    jsonb_build_object('item_id',p_item_id,'unit_id',p_unit_id,'report_type',p_report_type,'quantity',p_quantity),
    coalesce((select auth.uid())::text,'system'),(select auth.uid()));
  return v_id;
end $function$;

create or replace function public.v2_report_equipment_issue(
  organization_id uuid, item_id uuid, unit_id uuid, report_type text,
  quantity integer, reason text, photo_path text, photo_bucket text, comment text
) returns uuid language sql security definer set search_path to 'pg_catalog','private' as $function$
  select private.command_report_equipment_issue(organization_id,item_id,unit_id,report_type,quantity,reason,photo_path,photo_bucket,comment);
$function$;
grant execute on function public.v2_report_equipment_issue(uuid,uuid,uuid,text,integer,text,text,text,text) to authenticated;

create or replace function private.command_resolve_equipment_report(p_organization_id uuid, p_report_id uuid, p_status text, p_resolution_note text)
 returns void language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('pendiente','aprobado','rechazado','en_reparacion','resuelto','cerrado') then raise exception 'Invalid report status'; end if;

  update app.equipment_reports set status=p_status, resolution_note=coalesce(nullif(trim(p_resolution_note),''),resolution_note),
    resolved_by_user_id=(select auth.uid()), resolved_at=case when p_status in ('aprobado','rechazado','resuelto','cerrado') then now() else resolved_at end
  where id=p_report_id and organization_id=p_organization_id;
  if not found then raise exception 'Report not found'; end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor,actor_user_id)
  values(p_organization_id,'EquipmentReportResolved','equipment_report',p_report_id,jsonb_build_object('status',p_status,'note',p_resolution_note),coalesce((select auth.uid())::text,'system'),(select auth.uid()));
end $function$;

create or replace function public.v2_resolve_equipment_report(organization_id uuid, report_id uuid, status text, resolution_note text)
 returns void language sql security definer set search_path to 'pg_catalog','private' as $function$
  select private.command_resolve_equipment_report(organization_id,report_id,status,resolution_note);
$function$;
grant execute on function public.v2_resolve_equipment_report(uuid,uuid,text,text) to authenticated;

drop function if exists private.query_equipment_items(uuid);
drop function if exists public.v2_equipment_items(uuid);
create function private.query_equipment_items(p_organization_id uuid)
 returns table(id uuid, sku text, name text, category text, quantity integer, min_stock integer, unit_cost numeric, location text, status text,
   control_type text, photo_path text, photo_bucket text,
   assigned_quantity bigint, available_quantity bigint, needs_reorder boolean,
   units_total bigint, units_bodega bigint, units_asignado bigint, units_mantenimiento bigint, units_baja bigint)
 language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select i.id,i.sku,i.name,i.category,i.quantity,i.min_stock,i.unit_cost,i.location,i.status,
         i.control_type,i.photo_path,i.photo_bucket,
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
 returns table(id uuid, sku text, name text, category text, quantity integer, min_stock integer, unit_cost numeric, location text, status text,
   control_type text, photo_path text, photo_bucket text,
   assigned_quantity bigint, available_quantity bigint, needs_reorder boolean,
   units_total bigint, units_bodega bigint, units_asignado bigint, units_mantenimiento bigint, units_baja bigint)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_items(organization_id);
$function$;
grant execute on function public.v2_equipment_items(uuid) to authenticated;

drop function if exists private.query_equipment_assignments(uuid, boolean);
drop function if exists public.v2_equipment_assignments(uuid, boolean);
create function private.query_equipment_assignments(p_organization_id uuid, p_active_only boolean default true)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   assigned_to_user_id uuid, assigned_to_label text, recipient_name text, quantity integer,
   assigned_at timestamptz, returned_at timestamptz, notes text)
 language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.equipment_item_id,i.name,a.equipment_unit_id,u.code,
         a.assigned_to_user_id,a.assigned_to_label,
         coalesce(pr.display_name,a.assigned_to_label,'Sin responsable') as recipient_name,
         a.quantity,a.assigned_at,a.returned_at,a.notes
  from app.equipment_assignments a
  join app.equipment_items i on i.id=a.equipment_item_id and i.organization_id=a.organization_id
  left join app.equipment_units u on u.id=a.equipment_unit_id
  left join public.profiles pr on pr.user_id=a.assigned_to_user_id
  where a.organization_id=p_organization_id and (not p_active_only or a.returned_at is null)
  order by (a.returned_at is null) desc,a.assigned_at desc,a.id;
end $function$;

create function public.v2_equipment_assignments(organization_id uuid, active_only boolean default true)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   assigned_to_user_id uuid, assigned_to_label text, recipient_name text, quantity integer,
   assigned_at timestamptz, returned_at timestamptz, notes text)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_assignments(organization_id,active_only);
$function$;
grant execute on function public.v2_equipment_assignments(uuid, boolean) to authenticated;

create or replace function private.query_equipment_units(p_organization_id uuid, p_item_id uuid)
 returns table(id uuid, equipment_item_id uuid, code text, status text, condition text,
   current_holder_user_id uuid, holder_name text, photo_path text, photo_bucket text, notes text, updated_at timestamptz)
 language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select u.id,u.equipment_item_id,u.code,u.status,u.condition,u.current_holder_user_id,
         pr.display_name, u.photo_path,u.photo_bucket,u.notes,u.updated_at
  from app.equipment_units u
  left join public.profiles pr on pr.user_id=u.current_holder_user_id
  where u.organization_id=p_organization_id and u.equipment_item_id=p_item_id and u.archived_at is null
  order by u.code;
end $function$;

create or replace function public.v2_equipment_units(organization_id uuid, item_id uuid)
 returns table(id uuid, equipment_item_id uuid, code text, status text, condition text,
   current_holder_user_id uuid, holder_name text, photo_path text, photo_bucket text, notes text, updated_at timestamptz)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_units(organization_id,item_id);
$function$;
grant execute on function public.v2_equipment_units(uuid,uuid) to authenticated;

create or replace function private.query_my_equipment_kit(p_organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, category text, equipment_unit_id uuid, unit_code text,
   quantity integer, assigned_at timestamptz, notes text, item_photo_path text, item_photo_bucket text,
   unit_photo_path text, unit_photo_bucket text)
 language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.equipment_item_id,i.name,i.category,a.equipment_unit_id,u.code,a.quantity,a.assigned_at,a.notes,
         i.photo_path,i.photo_bucket,u.photo_path,u.photo_bucket
  from app.equipment_assignments a
  join app.equipment_items i on i.id=a.equipment_item_id and i.organization_id=a.organization_id
  left join app.equipment_units u on u.id=a.equipment_unit_id
  where a.organization_id=p_organization_id and a.returned_at is null and a.assigned_to_user_id=(select auth.uid())
  order by a.assigned_at desc;
end $function$;

create or replace function public.v2_my_equipment_kit(organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, category text, equipment_unit_id uuid, unit_code text,
   quantity integer, assigned_at timestamptz, notes text, item_photo_path text, item_photo_bucket text,
   unit_photo_path text, unit_photo_bucket text)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_my_equipment_kit(organization_id);
$function$;
grant execute on function public.v2_my_equipment_kit(uuid) to authenticated;

create or replace function private.query_equipment_reports(p_organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   report_type text, quantity integer, reason text, photo_path text, photo_bucket text, comment text, status text,
   reported_by_user_id uuid, reporter_name text, resolved_by_user_id uuid, resolver_name text, resolution_note text,
   created_at timestamptz, resolved_at timestamptz)
 language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select r.id,r.equipment_item_id,i.name,r.equipment_unit_id,u.code,r.report_type,r.quantity,r.reason,r.photo_path,r.photo_bucket,r.comment,r.status,
         r.reported_by_user_id,rp.display_name,r.resolved_by_user_id,sp.display_name,r.resolution_note,r.created_at,r.resolved_at
  from app.equipment_reports r
  left join app.equipment_items i on i.id=r.equipment_item_id
  left join app.equipment_units u on u.id=r.equipment_unit_id
  left join public.profiles rp on rp.user_id=r.reported_by_user_id
  left join public.profiles sp on sp.user_id=r.resolved_by_user_id
  where r.organization_id=p_organization_id
  order by (r.status in ('pendiente','en_reparacion')) desc, r.created_at desc;
end $function$;

create or replace function public.v2_equipment_reports(organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   report_type text, quantity integer, reason text, photo_path text, photo_bucket text, comment text, status text,
   reported_by_user_id uuid, reporter_name text, resolved_by_user_id uuid, resolver_name text, resolution_note text,
   created_at timestamptz, resolved_at timestamptz)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_reports(organization_id);
$function$;
grant execute on function public.v2_equipment_reports(uuid) to authenticated;

create or replace function private.query_my_equipment_reports(p_organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   report_type text, quantity integer, reason text, comment text, status text, resolution_note text,
   created_at timestamptz, resolved_at timestamptz)
 language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  return query
  select r.id,r.equipment_item_id,i.name,r.equipment_unit_id,u.code,r.report_type,r.quantity,r.reason,r.comment,r.status,r.resolution_note,r.created_at,r.resolved_at
  from app.equipment_reports r
  left join app.equipment_items i on i.id=r.equipment_item_id
  left join app.equipment_units u on u.id=r.equipment_unit_id
  where r.organization_id=p_organization_id and r.reported_by_user_id=(select auth.uid())
  order by r.created_at desc;
end $function$;

create or replace function public.v2_my_equipment_reports(organization_id uuid)
 returns table(id uuid, equipment_item_id uuid, item_name text, equipment_unit_id uuid, unit_code text,
   report_type text, quantity integer, reason text, comment text, status text, resolution_note text,
   created_at timestamptz, resolved_at timestamptz)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_my_equipment_reports(organization_id);
$function$;
grant execute on function public.v2_my_equipment_reports(uuid) to authenticated;

create or replace function private.query_equipment_history(p_organization_id uuid, p_item_id uuid default null, p_unit_id uuid default null)
 returns table(event_type text, occurred_at timestamptz, actor_name text, payload jsonb)
 language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if p_item_id is null and p_unit_id is null then raise exception 'Item or unit required'; end if;
  return query
  select e.event_type, e.occurred_at, coalesce(pr.display_name,e.actor), e.payload
  from app.domain_events e
  left join public.profiles pr on pr.user_id=e.actor_user_id
  where e.organization_id=p_organization_id
    and e.event_type like 'Equipment%'
    and (
      (p_item_id is not null and ((e.aggregate_type='equipment_item' and e.aggregate_id=p_item_id) or (e.payload->>'item_id')::uuid=p_item_id))
      or (p_unit_id is not null and ((e.aggregate_type='equipment_unit' and e.aggregate_id=p_unit_id) or (e.payload->>'unit_id')::uuid=p_unit_id))
    )
  order by e.occurred_at desc limit 200;
end $function$;

create or replace function public.v2_equipment_history(organization_id uuid, item_id uuid default null, unit_id uuid default null)
 returns table(event_type text, occurred_at timestamptz, actor_name text, payload jsonb)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_history(organization_id,item_id,unit_id);
$function$;
grant execute on function public.v2_equipment_history(uuid,uuid,uuid) to authenticated;

create or replace function private.query_equipment_inventory_value(p_organization_id uuid)
 returns table(category text, units bigint, estimated_value numeric)
 language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select coalesce(i.category,'Sin categoría'), sum(i.quantity)::bigint, sum(i.quantity*coalesce(i.unit_cost,0))
  from app.equipment_items i where i.organization_id=p_organization_id and i.archived_at is null
  group by coalesce(i.category,'Sin categoría') order by 3 desc;
end $function$;

create or replace function public.v2_equipment_inventory_value(organization_id uuid)
 returns table(category text, units bigint, estimated_value numeric)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_inventory_value(organization_id);
$function$;
grant execute on function public.v2_equipment_inventory_value(uuid) to authenticated;

create or replace function private.query_equipment_coaches(p_organization_id uuid)
 returns table(user_id uuid, display_name text)
 language plpgsql stable security definer set search_path to 'pg_catalog','public','private' as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select m.user_id, coalesce(pr.display_name,'Sin nombre')
  from public.organization_memberships m
  left join public.profiles pr on pr.user_id=m.user_id
  where m.organization_id=p_organization_id and m.role='coach' and m.active=true
  order by coalesce(pr.display_name,'');
end $function$;

create or replace function public.v2_equipment_coaches(organization_id uuid)
 returns table(user_id uuid, display_name text)
 language sql security definer set search_path to 'pg_catalog','private' as $function$
  select * from private.query_equipment_coaches(organization_id);
$function$;
grant execute on function public.v2_equipment_coaches(uuid) to authenticated;
;
