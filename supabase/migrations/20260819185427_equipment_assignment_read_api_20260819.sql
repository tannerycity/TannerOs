create or replace function private.query_equipment_assignments(p_organization_id uuid,p_active_only boolean default true)
returns table(id uuid,equipment_item_id uuid,item_name text,assigned_to_user_id uuid,assigned_to_label text,recipient_name text,quantity integer,assigned_at timestamptz,returned_at timestamptz,notes text)
language plpgsql stable security definer set search_path='pg_catalog','public','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.equipment_item_id,i.name,a.assigned_to_user_id,a.assigned_to_label,
         coalesce(pr.display_name,a.assigned_to_label,'Sin responsable') as recipient_name,
         a.quantity,a.assigned_at,a.returned_at,a.notes
  from app.equipment_assignments a
  join app.equipment_items i on i.id=a.equipment_item_id and i.organization_id=a.organization_id
  left join public.profiles pr on pr.user_id=a.assigned_to_user_id
  where a.organization_id=p_organization_id and (not p_active_only or a.returned_at is null)
  order by (a.returned_at is null) desc,a.assigned_at desc,a.id;
end $$;
create or replace function public.v2_equipment_assignments(organization_id uuid,active_only boolean default true)
returns table(id uuid,equipment_item_id uuid,item_name text,assigned_to_user_id uuid,assigned_to_label text,recipient_name text,quantity integer,assigned_at timestamptz,returned_at timestamptz,notes text)
language sql security definer set search_path='pg_catalog','private'
as $$ select * from private.query_equipment_assignments(organization_id,active_only) $$;
revoke all on function public.v2_equipment_assignments(uuid,boolean) from public;
grant execute on function public.v2_equipment_assignments(uuid,boolean) to authenticated;
update app.business_rule_catalog set test_status='tested',updated_at=now() where rule_key in ('PHONE-001','ACA-001','EQUIP-001');;
