create or replace function private.command_change_player_category(
  p_organization_id uuid,
  p_player_id uuid,
  p_category_id uuid,
  p_effective_date date,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_player app.players%rowtype;
  v_category app.categories%rowtype;
  v_current app.player_enrollments%rowtype;
  v_new uuid;
  v_effective date:=coalesce(p_effective_date,current_date);
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  select * into v_player from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'Player not found'; end if;
  if v_player.status<>'active' then raise exception 'Player must be active'; end if;
  select * into v_category from app.categories where id=p_category_id and organization_id=p_organization_id and status='active';
  if not found then raise exception 'Category not found'; end if;

  select * into v_current from app.player_enrollments
  where organization_id=p_organization_id and player_id=p_player_id and status='active'
  order by starts_on desc,created_at desc limit 1 for update;

  if found and v_current.category_id=p_category_id then return v_current.id; end if;
  if found and v_effective<v_current.starts_on then raise exception 'Effective date cannot precede current enrollment start'; end if;

  if found then
    update app.player_enrollments
    set status='completed',ends_on=greatest(v_current.starts_on,v_effective-1),
        notes=concat_ws(E'\n',nullif(trim(notes),''),case when nullif(trim(p_notes),'') is not null then 'Cambio de categoría: '||trim(p_notes) else 'Cambio de categoría' end),
        updated_at=now()
    where id=v_current.id;
  end if;

  insert into app.player_enrollments(organization_id,player_id,category_id,starts_on,status,notes)
  values(p_organization_id,p_player_id,p_category_id,v_effective,'active',nullif(trim(p_notes),''))
  returning id into v_new;

  -- Compatibility/display column remains synchronized until all legacy reads are retired.
  update app.players set category=v_category.name,updated_at=now() where id=p_player_id and organization_id=p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'PlayerCategoryChanged','player',p_player_id,
    jsonb_build_object('fromEnrollmentId',case when v_current.id is null then null else v_current.id end,'toEnrollmentId',v_new,'categoryId',p_category_id,'effectiveDate',v_effective),
    coalesce((select auth.uid())::text,'system'));
  return v_new;
end
$$;

create or replace function private.command_withdraw_academy_enrollment(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_ends_on date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare v app.academy_enrollments%rowtype; v_end date:=coalesce(p_ends_on,current_date);
begin
  if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;
  select * into v from app.academy_enrollments where id=p_enrollment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Academy enrollment not found'; end if;
  if v.status<>'active' then raise exception 'Academy enrollment is not active'; end if;
  if v_end<v.starts_on then raise exception 'Withdrawal date cannot precede enrollment start'; end if;

  update app.academy_enrollments
  set status='cancelled',ends_on=v_end,
      notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja: '||trim(p_reason)),updated_at=now()
  where id=v.id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademyEnrollmentWithdrawn','academy_enrollment',v.id,
    jsonb_build_object('academyId',v.academy_id,'playerId',v.player_id,'endsOn',v_end,'reason',trim(p_reason)),
    coalesce((select auth.uid())::text,'system'));
end
$$;

create or replace function public.v2_change_player_category(organization_id uuid,player_id uuid,category_id uuid,effective_date date,notes text default null)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_change_player_category(organization_id,player_id,category_id,effective_date,notes) $$;

create or replace function public.v2_withdraw_academy_enrollment(organization_id uuid,enrollment_id uuid,ends_on date,reason text)
returns void language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_withdraw_academy_enrollment(organization_id,enrollment_id,ends_on,reason) $$;

revoke all on function public.v2_change_player_category(uuid,uuid,uuid,date,text) from public,anon;
revoke all on function public.v2_withdraw_academy_enrollment(uuid,uuid,date,text) from public,anon;
grant execute on function public.v2_change_player_category(uuid,uuid,uuid,date,text) to authenticated;
grant execute on function public.v2_withdraw_academy_enrollment(uuid,uuid,date,text) to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('CAT-003','categories','Category history preserved','Changing canonical category closes the previous active enrollment and creates a new one instead of overwriting history.','approved_v2',100,'command','active','pending','private.command_change_player_category','{}'),
('ACA-005','academies','Academy withdrawal preserves history','Academy withdrawal closes the enrollment with date and reason; attendance/payment history is not deleted.','approved_v2',100,'command','active','pending','private.command_withdraw_academy_enrollment','{}')
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,updated_at=now();;
