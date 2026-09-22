revoke insert,update,delete on app.programs,app.program_enrollments from authenticated;
grant select on app.programs,app.program_enrollments to authenticated;

create or replace function private.query_program_admin(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
declare v_programs jsonb; v_enrollments jsonb;
begin
  if not private.has_module_access(p_organization_id,'programs',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'programType',p.program_type,'categoryLabel',p.category_label,'description',p.description,
    'startsOn',p.starts_on,'endsOn',p.ends_on,'schedule',p.schedule,'location',p.location,'capacity',p.capacity,'fee',p.fee,
    'feeWeekly',p.fee_weekly,'weeks',p.weeks,'ageMin',p.age_min,'ageMax',p.age_max,'status',p.status,
    'publicRegistrationEnabled',p.public_registration_enabled,'createdAt',p.created_at,'updatedAt',p.updated_at,
    'registeredCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status in ('registered','confirmed')),
    'waitlistedCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status='waitlisted'),
    'totalEnrollmentCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled')
  ) order by coalesce(p.starts_on,date '9999-12-31'),p.name),'[]'::jsonb)
  into v_programs from app.programs p where p.organization_id=p_organization_id and p.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'programId',e.program_id,'playerId',e.player_id,'firstName',e.participant_first_name,'lastName',e.participant_last_name,
    'phone',e.phone,'email',e.email,'birthDate',e.birth_date,'status',e.status,'paymentStatus',e.payment_status,
    'notes',e.notes,'createdAt',e.created_at,'updatedAt',e.updated_at,'legacyId',e.legacy_id
  ) order by e.created_at desc),'[]'::jsonb)
  into v_enrollments from app.program_enrollments e where e.organization_id=p_organization_id;

  return jsonb_build_object('programs',v_programs,'enrollments',v_enrollments);
end
$$;

create or replace function private.command_upsert_program(
  p_organization_id uuid,p_program_id uuid,p_slug text,p_name text,p_program_type text,p_category_label text,p_description text,
  p_starts_on date,p_ends_on date,p_schedule jsonb,p_location text,p_capacity integer,p_fee numeric,p_fee_weekly numeric,p_weeks smallint,
  p_age_min smallint,p_age_max smallint,p_status text,p_public_registration_enabled boolean
) returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid; v_slug text; v_public boolean;
begin
  if not private.has_module_access(p_organization_id,'programs',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Program name required'; end if;
  v_slug:=lower(regexp_replace(trim(coalesce(p_slug,'')),'[^a-zA-Z0-9]+','-','g'));
  v_slug:=trim(both '-' from v_slug);
  if length(v_slug)<2 then raise exception 'Valid slug required'; end if;
  if p_status not in ('draft','published','active','completed','cancelled','archived') then raise exception 'Invalid program status'; end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on<p_starts_on then raise exception 'Program end cannot precede start'; end if;
  if p_capacity is not null and p_capacity<0 then raise exception 'Capacity cannot be negative'; end if;
  if p_fee is not null and p_fee<0 then raise exception 'Fee cannot be negative'; end if;
  if p_fee_weekly is not null and p_fee_weekly<0 then raise exception 'Weekly fee cannot be negative'; end if;
  if p_weeks is not null and p_weeks<=0 then raise exception 'Weeks must be greater than zero'; end if;
  if p_age_min is not null and p_age_min<0 then raise exception 'Minimum age cannot be negative'; end if;
  if p_age_max is not null and p_age_max<0 then raise exception 'Maximum age cannot be negative'; end if;
  if p_age_min is not null and p_age_max is not null and p_age_max<p_age_min then raise exception 'Maximum age cannot be below minimum age'; end if;
  v_public:=coalesce(p_public_registration_enabled,false) and p_status in ('published','active');

  if p_program_id is null then
    insert into app.programs(organization_id,slug,name,program_type,category_label,description,starts_on,ends_on,schedule,location,capacity,fee,fee_weekly,weeks,age_min,age_max,status,public_registration_enabled,created_at,updated_at)
    values(p_organization_id,v_slug,trim(p_name),coalesce(nullif(trim(p_program_type),''),'program'),nullif(trim(p_category_label),''),nullif(trim(p_description),''),p_starts_on,p_ends_on,coalesce(p_schedule,'[]'::jsonb),nullif(trim(p_location),''),p_capacity,p_fee,p_fee_weekly,p_weeks,p_age_min,p_age_max,p_status,v_public,now(),now()) returning id into v_id;
  else
    update app.programs set slug=v_slug,name=trim(p_name),program_type=coalesce(nullif(trim(p_program_type),''),'program'),category_label=nullif(trim(p_category_label),''),description=nullif(trim(p_description),''),starts_on=p_starts_on,ends_on=p_ends_on,schedule=coalesce(p_schedule,'[]'::jsonb),location=nullif(trim(p_location),''),capacity=p_capacity,fee=p_fee,fee_weekly=p_fee_weekly,weeks=p_weeks,age_min=p_age_min,age_max=p_age_max,status=p_status,public_registration_enabled=v_public,archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end,updated_at=now()
    where id=p_program_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Program not found'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,case when p_program_id is null then 'ProgramCreated' else 'ProgramUpdated' end,'program',v_id,jsonb_build_object('status',p_status,'publicRegistrationEnabled',v_public,'capacity',p_capacity),coalesce((select auth.uid())::text,'system'));
  return v_id;
exception when unique_violation then raise exception 'Program slug already exists';
end
$$;

create or replace function private.command_update_program_enrollment_status(
  p_organization_id uuid,p_enrollment_id uuid,p_status text,p_notes text default null
) returns void
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v app.program_enrollments%rowtype; v_program app.programs%rowtype; v_used integer;
begin
  if not private.has_module_access(p_organization_id,'programs',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('registered','confirmed','waitlisted','cancelled','completed') then raise exception 'Invalid enrollment status'; end if;
  select * into v from app.program_enrollments where id=p_enrollment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Enrollment not found'; end if;
  select * into v_program from app.programs where id=v.program_id and organization_id=p_organization_id for update;
  if p_status in ('registered','confirmed') and v.status not in ('registered','confirmed') and v_program.capacity is not null then
    select count(*) into v_used from app.program_enrollments where organization_id=p_organization_id and program_id=v.program_id and status in ('registered','confirmed') and id<>v.id;
    if v_used>=v_program.capacity then raise exception 'Program capacity reached'; end if;
  end if;
  update app.program_enrollments set status=p_status,notes=case when nullif(trim(coalesce(p_notes,'')),'') is null then notes else concat_ws(E'\n',nullif(trim(notes),''),trim(p_notes)) end,updated_at=now() where id=v.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProgramEnrollmentStatusChanged','program_enrollment',v.id,jsonb_build_object('programId',v.program_id,'from',v.status,'to',p_status),coalesce((select auth.uid())::text,'system'));
end
$$;

create or replace function public.v2_program_admin(organization_id uuid)
returns jsonb language sql stable security definer set search_path='pg_catalog','private'
as $$ select private.query_program_admin(organization_id) $$;

create or replace function public.v2_upsert_program(
  organization_id uuid,program_id uuid,slug text,name text,program_type text,category_label text,description text,
  starts_on date,ends_on date,schedule jsonb,location text,capacity integer,fee numeric,fee_weekly numeric,weeks smallint,
  age_min smallint,age_max smallint,status text,public_registration_enabled boolean
) returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_upsert_program(organization_id,program_id,slug,name,program_type,category_label,description,starts_on,ends_on,schedule,location,capacity,fee,fee_weekly,weeks,age_min,age_max,status,public_registration_enabled) $$;

create or replace function public.v2_update_program_enrollment_status(organization_id uuid,enrollment_id uuid,status text,notes text default null)
returns void language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_update_program_enrollment_status(organization_id,enrollment_id,status,notes) $$;

revoke all on function public.v2_program_admin(uuid) from public,anon;
revoke all on function public.v2_upsert_program(uuid,uuid,text,text,text,text,text,date,date,jsonb,text,integer,numeric,numeric,smallint,smallint,smallint,text,boolean) from public,anon;
revoke all on function public.v2_update_program_enrollment_status(uuid,uuid,text,text) from public,anon;
grant execute on function public.v2_program_admin(uuid) to authenticated;
grant execute on function public.v2_upsert_program(uuid,uuid,text,text,text,text,text,date,date,jsonb,text,integer,numeric,numeric,smallint,smallint,smallint,text,boolean) to authenticated;
grant execute on function public.v2_update_program_enrollment_status(uuid,uuid,text,text) to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('PROG-004','programs','Program writes use commands','Authenticated clients cannot directly mutate programs or enrollments; administrative changes use module-authorized commands.','platform_safety',100,'database','active','pending','table grants + program commands','{}'),
('PROG-005','programs','Capacity protects confirmations','Public registration waitlists when capacity is full and admin cannot promote a waitlisted/cancelled participant into a full program.','approved_v2',100,'command','active','pending','private.public_enroll_program / private.command_update_program_enrollment_status','{}'),
('PROG-006','programs','Public form follows program lifecycle','Public registration can only be enabled for published or active programs; other states force public registration off.','approved_v2',100,'command','active','pending','private.command_upsert_program / private.public_enroll_program','{}')
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
