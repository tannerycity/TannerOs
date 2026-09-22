alter table app.payments add column if not exists program_id uuid;
alter table app.payments add column if not exists program_enrollment_id uuid;
create unique index if not exists uq_app_program_enrollments_id_org on app.program_enrollments(id,organization_id);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='fk_app_payments_program_org') then
    alter table app.payments add constraint fk_app_payments_program_org
      foreign key(program_id) references app.programs(id) on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='fk_app_payments_program_enrollment_org') then
    alter table app.payments add constraint fk_app_payments_program_enrollment_org
      foreign key(program_enrollment_id) references app.program_enrollments(id) on delete set null;
  end if;
end $$;

create index if not exists idx_app_payments_program on app.payments(organization_id,program_id,payment_date);
create index if not exists idx_app_payments_program_enrollment on app.payments(organization_id,program_enrollment_id,payment_date);

create table if not exists app.program_attendance(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null,
  enrollment_id uuid not null,
  attendance_date date not null,
  status text not null check(status in ('present','late','absent')),
  checked_in_at timestamptz,
  bib_number text,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_program_attendance_program_org foreign key(program_id,organization_id) references app.programs(id,organization_id) on delete cascade,
  constraint fk_program_attendance_enrollment_org foreign key(enrollment_id,organization_id) references app.program_enrollments(id,organization_id) on delete cascade,
  constraint uq_program_attendance_enrollment_date unique(organization_id,enrollment_id,attendance_date)
);

create index if not exists idx_program_attendance_program_date on app.program_attendance(organization_id,program_id,attendance_date);
alter table app.program_attendance enable row level security;
drop policy if exists v2_program_attendance_read on app.program_attendance;
drop policy if exists v2_program_attendance_insert on app.program_attendance;
drop policy if exists v2_program_attendance_update on app.program_attendance;
drop policy if exists v2_program_attendance_delete on app.program_attendance;
create policy v2_program_attendance_read on app.program_attendance for select to authenticated
  using((select private.has_module_access(organization_id,'programs',false)));
create policy v2_program_attendance_insert on app.program_attendance for insert to authenticated
  with check((select private.has_module_access(organization_id,'programs',true)));
create policy v2_program_attendance_update on app.program_attendance for update to authenticated
  using((select private.has_module_access(organization_id,'programs',true)))
  with check((select private.has_module_access(organization_id,'programs',true)));
create policy v2_program_attendance_delete on app.program_attendance for delete to authenticated
  using((select private.has_module_access(organization_id,'programs',true)));
grant select,insert,update,delete on app.program_attendance to authenticated,service_role;

create or replace function private.public_program_photo_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer
set search_path='pg_catalog','app'
as $$
declare v_org uuid;v_program uuid;v_enrollment uuid;
begin
  if p_name !~* '^organizations/[0-9a-f-]{36}/programs/[0-9a-f-]{36}/[0-9a-f-]{36}/profile\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_org:=split_part(p_name,'/',2)::uuid;v_program:=split_part(p_name,'/',4)::uuid;v_enrollment:=split_part(p_name,'/',5)::uuid;
  return exists(
    select 1 from app.program_enrollments e
    where e.organization_id=v_org and e.program_id=v_program and e.id=v_enrollment
      and e.created_at>=now()-interval '1 hour' and nullif(e.metadata->>'photoPath','') is null
  );
exception when others then return false;
end $$;
revoke all on function private.public_program_photo_upload_allowed(text) from public;
grant execute on function private.public_program_photo_upload_allowed(text) to anon,service_role;

drop policy if exists tanneros_public_program_photo_insert on storage.objects;
create policy tanneros_public_program_photo_insert on storage.objects for insert to anon
  with check(bucket_id='tanneros-prospect-photos' and private.public_program_photo_upload_allowed(name));
drop policy if exists tanneros_program_photos_read on storage.objects;
create policy tanneros_program_photos_read on storage.objects for select to authenticated
  using(bucket_id='tanneros-prospect-photos' and private.storage_org_id(name) is not null
    and private.storage_module_code(name)='programs'
    and private.has_module_access(private.storage_org_id(name),'programs',false));
drop policy if exists tanneros_program_photos_write on storage.objects;
create policy tanneros_program_photos_write on storage.objects for all to authenticated
  using(bucket_id='tanneros-prospect-photos' and private.storage_org_id(name) is not null
    and private.storage_module_code(name)='programs'
    and private.has_module_access(private.storage_org_id(name),'programs',true))
  with check(bucket_id='tanneros-prospect-photos' and private.storage_org_id(name) is not null
    and private.storage_module_code(name)='programs'
    and private.has_module_access(private.storage_org_id(name),'programs',true));

create or replace function private.public_enroll_program_enhanced(
  p_public_key text,p_program_slug text,p_first_name text,p_last_name text,p_phone text,p_email text,p_birth_date date,p_consent jsonb,p_metadata jsonb
) returns jsonb language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_org uuid;v_program app.programs%rowtype;v_id uuid;v_current integer;v_status text:='registered';v_age integer;v_phone text;v_payment_status text;v_metadata jsonb;v_photo_required boolean;
begin
  perform private.enforce_public_rate_limit('program_enrollment',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'programs') then raise exception 'Enrollment unavailable'; end if;
  select * into v_program from app.programs where organization_id=v_org and slug=p_program_slug and public_registration_enabled=true and status in ('published','active') and archived_at is null for update;
  if not found then raise exception 'Program unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if length(coalesce(p_last_name,''))>100 then raise exception 'Last name too long'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  if coalesce((p_consent->>'dataAccepted')::boolean,false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce((p_consent->>'participationAccepted')::boolean,false) is distinct from true then raise exception 'Participation consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')),0)<4 then raise exception 'Privacy notice version required'; end if;
  v_phone:=private.normalize_public_phone(p_phone);if v_phone is null then raise exception 'Phone required';end if;
  v_age:=date_part('year',age(current_date,p_birth_date))::integer;
  if v_program.age_min is not null and v_age<v_program.age_min then raise exception 'Participant is below minimum age'; end if;
  if v_program.age_max is not null and v_age>v_program.age_max then raise exception 'Participant is above maximum age'; end if;
  if coalesce(length(trim(p_metadata->>'guardianName')),0)<2 then raise exception 'Guardian name required'; end if;
  if length(coalesce(p_metadata::text,''))>20000 then raise exception 'Enrollment information too long'; end if;
  select count(*) into v_current from app.program_enrollments where program_id=v_program.id and status in ('registered','confirmed');
  if v_program.capacity is not null and v_current>=v_program.capacity then v_status:='waitlisted';end if;
  v_payment_status:=case when coalesce(v_program.fee,0)<=0 and not(coalesce(v_program.fee_weekly,0)>0 and coalesce(v_program.weeks,0)>0) then 'waived' else 'pending' end;
  v_photo_required:=lower(v_program.program_type) like '%visor%';
  v_metadata:=jsonb_strip_nulls(jsonb_build_object(
    'guardianName',nullif(trim(p_metadata->>'guardianName'),''),'residence',nullif(trim(p_metadata->>'residence'),''),
    'position',nullif(trim(p_metadata->>'position'),''),'dominantFoot',nullif(trim(p_metadata->>'dominantFoot'),''),
    'currentTeam',nullif(trim(p_metadata->>'currentTeam'),''),'experience',nullif(trim(p_metadata->>'experience'),''),
    'emergencyContact',nullif(trim(p_metadata->>'emergencyContact'),''),'emergencyPhone',nullif(trim(p_metadata->>'emergencyPhone'),''),
    'emergencyRelation',nullif(trim(p_metadata->>'emergencyRelation'),''),'medicalSummary',nullif(trim(p_metadata->>'medicalSummary'),''),
    'sourceChannel',nullif(trim(p_metadata->>'sourceChannel'),''),'source','public_form','photoRequired',v_photo_required
  ));
  insert into app.program_enrollments(organization_id,program_id,participant_first_name,participant_last_name,phone,email,birth_date,status,payment_status,consent,metadata,created_at,updated_at)
  values(v_org,v_program.id,trim(p_first_name),nullif(trim(p_last_name),''),v_phone,nullif(lower(trim(p_email)),''),p_birth_date,v_status,v_payment_status,coalesce(p_consent,'{}'::jsonb),v_metadata,now(),now()) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProgramEnrollmentCreated','program_enrollment',v_id,jsonb_build_object('program_id',v_program.id,'status',v_status,'source','public_form','age',v_age,'photoRequired',v_photo_required));
  return jsonb_build_object('id',v_id,'status',v_status,'program',v_program.name,'programId',v_program.id,'photoRequired',v_photo_required);
end $$;

create or replace function public.v2_public_program_enroll_enhanced(
  club_key text,program_slug text,first_name text,last_name text,phone text,email text,birth_date date,consent jsonb,metadata jsonb
) returns jsonb language sql security definer set search_path='pg_catalog','private'
as $$select private.public_enroll_program_enhanced($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
revoke all on function public.v2_public_program_enroll_enhanced(text,text,text,text,text,text,date,jsonb,jsonb) from public;
grant execute on function public.v2_public_program_enroll_enhanced(text,text,text,text,text,text,date,jsonb,jsonb) to anon,authenticated,service_role;

create or replace function private.public_attach_program_photo(p_public_key text,p_enrollment_id uuid,p_photo_path text)
returns boolean language plpgsql security definer
set search_path='pg_catalog','app','private','storage'
as $$
declare v_org uuid;v_enrollment app.program_enrollments%rowtype;v_expected text;
begin
  v_org:=private.public_organization(p_public_key);if v_org is null then raise exception 'Registration unavailable';end if;
  select * into v_enrollment from app.program_enrollments where id=p_enrollment_id and organization_id=v_org for update;
  if not found or v_enrollment.created_at<now()-interval '1 hour' then raise exception 'Enrollment not available for photo';end if;
  v_expected:=format('organizations/%s/programs/%s/%s/profile.',v_org,v_enrollment.program_id,v_enrollment.id);
  if position(v_expected in p_photo_path)<>1 or p_photo_path !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'Invalid photo path';end if;
  if not exists(select 1 from storage.objects where bucket_id='tanneros-prospect-photos' and name=p_photo_path) then raise exception 'Photo upload not found';end if;
  update app.program_enrollments set metadata=jsonb_set(metadata,'{photoPath}',to_jsonb(p_photo_path),true),updated_at=now()
    where id=v_enrollment.id and organization_id=v_org and nullif(metadata->>'photoPath','') is null;
  if not found then raise exception 'Photo already attached';end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProgramEnrollmentPhotoAttached','program_enrollment',v_enrollment.id,jsonb_build_object('photoPath',p_photo_path));
  return true;
end $$;

create or replace function public.v2_public_attach_program_photo(club_key text,enrollment_id uuid,photo_path text)
returns boolean language sql security definer set search_path='pg_catalog','private'
as $$select private.public_attach_program_photo($1,$2,$3)$$;
revoke all on function public.v2_public_attach_program_photo(text,uuid,text) from public;
grant execute on function public.v2_public_attach_program_photo(text,uuid,text) to anon,authenticated,service_role;

create or replace function private.command_create_program_enrollment(
  p_organization_id uuid,p_program_id uuid,p_first_name text,p_last_name text,p_phone text,p_birth_date date,p_metadata jsonb
) returns uuid language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_program app.programs%rowtype;v_id uuid;v_count integer;v_status text:='registered';v_payment_status text;v_metadata jsonb;
begin
  if not private.has_module_access(p_organization_id,'programs',true) then raise exception 'Not authorized';end if;
  select * into v_program from app.programs where id=p_program_id and organization_id=p_organization_id for update;if not found then raise exception 'Program not found';end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required';end if;
  if p_birth_date is not null and p_birth_date>current_date then raise exception 'Invalid birth date';end if;
  select count(*) into v_count from app.program_enrollments where program_id=v_program.id and status in ('registered','confirmed');
  if v_program.capacity is not null and v_count>=v_program.capacity then v_status:='waitlisted';end if;
  v_payment_status:=case when coalesce(v_program.fee,0)<=0 and not(coalesce(v_program.fee_weekly,0)>0 and coalesce(v_program.weeks,0)>0) then 'waived' else 'pending' end;
  v_metadata:=jsonb_strip_nulls(jsonb_build_object('position',nullif(trim(p_metadata->>'position'),''),'bibNumber',nullif(trim(p_metadata->>'bibNumber'),''),'source','staff_walk_in'));
  insert into app.program_enrollments(organization_id,program_id,participant_first_name,participant_last_name,phone,birth_date,status,payment_status,metadata,consent)
  values(p_organization_id,p_program_id,trim(p_first_name),nullif(trim(p_last_name),''),nullif(trim(p_phone),''),p_birth_date,v_status,v_payment_status,v_metadata,jsonb_build_object('source','staff_walk_in','acceptedBy',(select auth.uid()),'acceptedAt',now())) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProgramEnrollmentCreated','program_enrollment',v_id,jsonb_build_object('program_id',p_program_id,'status',v_status,'source','staff_walk_in'),(select auth.uid())::text);
  return v_id;
end $$;

create or replace function public.v2_create_program_enrollment(organization_id uuid,program_id uuid,first_name text,last_name text,phone text,birth_date date,metadata jsonb)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$select private.command_create_program_enrollment($1,$2,$3,$4,$5,$6,$7)$$;
revoke all on function public.v2_create_program_enrollment(uuid,uuid,text,text,text,date,jsonb) from public;
grant execute on function public.v2_create_program_enrollment(uuid,uuid,text,text,text,date,jsonb) to authenticated,service_role;

create or replace function private.command_mark_program_attendance(
  p_organization_id uuid,p_enrollment_id uuid,p_attendance_date date,p_status text,p_bib_number text,p_notes text
) returns void language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_enrollment app.program_enrollments%rowtype;
begin
  if not private.has_module_access(p_organization_id,'programs',true) then raise exception 'Not authorized';end if;
  select * into v_enrollment from app.program_enrollments where id=p_enrollment_id and organization_id=p_organization_id;if not found then raise exception 'Enrollment not found';end if;
  if p_attendance_date is null then raise exception 'Attendance date required';end if;
  if p_status is null then
    delete from app.program_attendance where organization_id=p_organization_id and enrollment_id=p_enrollment_id and attendance_date=p_attendance_date;
  else
    if p_status not in ('present','late','absent') then raise exception 'Invalid attendance status';end if;
    insert into app.program_attendance(organization_id,program_id,enrollment_id,attendance_date,status,checked_in_at,bib_number,notes,created_by_user_id)
    values(p_organization_id,v_enrollment.program_id,v_enrollment.id,p_attendance_date,p_status,case when p_status in ('present','late') then now() else null end,nullif(trim(p_bib_number),''),nullif(trim(p_notes),''),(select auth.uid()))
    on conflict(organization_id,enrollment_id,attendance_date) do update set status=excluded.status,checked_in_at=excluded.checked_in_at,bib_number=coalesce(excluded.bib_number,app.program_attendance.bib_number),notes=coalesce(excluded.notes,app.program_attendance.notes),updated_at=now();
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProgramAttendanceMarked','program_enrollment',v_enrollment.id,jsonb_build_object('programId',v_enrollment.program_id,'date',p_attendance_date,'status',p_status),(select auth.uid())::text);
end $$;

create or replace function public.v2_mark_program_attendance(organization_id uuid,enrollment_id uuid,attendance_date date,status text,bib_number text,notes text)
returns void language sql security definer set search_path='pg_catalog','private'
as $$select private.command_mark_program_attendance($1,$2,$3,$4,$5,$6)$$;
revoke all on function public.v2_mark_program_attendance(uuid,uuid,date,text,text,text) from public;
grant execute on function public.v2_mark_program_attendance(uuid,uuid,date,text,text,text) to authenticated,service_role;

create or replace function private.command_post_program_payment(
  p_organization_id uuid,p_enrollment_id uuid,p_amount numeric,p_payment_date date,p_method text,p_reference text,p_idempotency_key text
) returns uuid language plpgsql security definer
set search_path='pg_catalog','public','app','private'
as $$
declare v_enrollment app.program_enrollments%rowtype;v_program app.programs%rowtype;v_id uuid;v_expected numeric;v_paid numeric;v_remaining numeric;v_actor uuid:=(select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'billing',true) then raise exception 'Not authorized';end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero';end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required';end if;
  select * into v_enrollment from app.program_enrollments where id=p_enrollment_id and organization_id=p_organization_id for update;if not found then raise exception 'Enrollment not found';end if;
  select * into v_program from app.programs where id=v_enrollment.program_id and organization_id=p_organization_id;if not found then raise exception 'Program not found';end if;
  v_expected:=case when coalesce(v_program.fee,0)>0 then v_program.fee when coalesce(v_program.fee_weekly,0)>0 and coalesce(v_program.weeks,0)>0 then v_program.fee_weekly*v_program.weeks else 0 end;
  if v_expected<=0 then raise exception 'This program has no fee';end if;
  select id into v_id from app.payments where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);if v_id is not null then return v_id;end if;
  select coalesce(sum(amount),0) into v_paid from app.payments where organization_id=p_organization_id and program_enrollment_id=v_enrollment.id and status='posted';
  if v_enrollment.legacy_id is not null then
    select v_paid+coalesce(sum(amount),0) into v_paid from public.payments where organization_id=p_organization_id and enroll_id=v_enrollment.legacy_id and coalesce(deleted,false)=false and lower(coalesce(type,'')) in ('income','ingreso');
  end if;
  v_remaining:=greatest(0,v_expected-v_paid);if p_amount>v_remaining+0.01 then raise exception 'Amount exceeds outstanding balance';end if;
  insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payer_name,payment_purpose,credit_status,program_id,program_enrollment_id,created_at,updated_at)
  values(p_organization_id,v_enrollment.player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),concat('Programa: ',v_program.name,' — ',trim(concat_ws(' ',v_enrollment.participant_first_name,v_enrollment.participant_last_name))),'posted','tanneros_v2',v_program.program_type,trim(p_idempotency_key),'guardian',coalesce(nullif(v_enrollment.metadata->>'guardianName',''),trim(concat_ws(' ',v_enrollment.participant_first_name,v_enrollment.participant_last_name))),'program','not_applicable',v_program.id,v_enrollment.id,now(),now()) returning id into v_id;
  v_paid:=v_paid+p_amount;
  update app.program_enrollments set payment_status=case when v_paid+0.01>=v_expected then 'paid' else 'partial' end,updated_at=now() where id=v_enrollment.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'ProgramPaymentPosted','payment',v_id,jsonb_build_object('programId',v_program.id,'enrollmentId',v_enrollment.id,'amount',p_amount,'paymentDate',coalesce(p_payment_date,current_date)),v_actor,trim(p_idempotency_key));
  return v_id;
end $$;

create or replace function public.v2_post_program_payment(organization_id uuid,enrollment_id uuid,amount numeric,payment_date date,method text,reference text,idempotency_key text)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$select private.command_post_program_payment($1,$2,$3,$4,$5,$6,$7)$$;
revoke all on function public.v2_post_program_payment(uuid,uuid,numeric,date,text,text,text) from public;
grant execute on function public.v2_post_program_payment(uuid,uuid,numeric,date,text,text,text) to authenticated,service_role;

create or replace function private.query_program_admin(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path='pg_catalog','app','public','private'
as $$
declare v_programs jsonb;v_enrollments jsonb;v_attendance jsonb;v_payments jsonb;v_can_money_read boolean;v_can_collect boolean;v_can_sensitive boolean;
begin
  if not private.has_module_access(p_organization_id,'programs',false) then raise exception 'Not authorized';end if;
  v_can_money_read:=private.has_module_access(p_organization_id,'billing',false) or private.has_module_access(p_organization_id,'accounting',false);
  v_can_collect:=private.has_module_access(p_organization_id,'billing',true);
  v_can_sensitive:=private.has_module_access(p_organization_id,'programs',true) or private.has_module_access(p_organization_id,'scouting',false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'programType',p.program_type,'categoryLabel',p.category_label,'description',p.description,
    'startsOn',p.starts_on,'endsOn',p.ends_on,'schedule',p.schedule,'location',p.location,'capacity',p.capacity,'fee',p.fee,
    'feeWeekly',p.fee_weekly,'weeks',p.weeks,'ageMin',p.age_min,'ageMax',p.age_max,'status',p.status,
    'publicRegistrationEnabled',p.public_registration_enabled,'archivedAt',p.archived_at,'createdAt',p.created_at,'updatedAt',p.updated_at,
    'registeredCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status in ('registered','confirmed')),
    'confirmedCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status='confirmed'),
    'waitlistedCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status='waitlisted'),
    'totalEnrollmentCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled'),
    'paidEnrollmentCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled' and (e.payment_status in ('paid','waived') or (coalesce(p.fee,0)<=0 and not(coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0)))),
    'pendingPaymentCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled' and e.payment_status not in ('paid','waived','refunded') and (coalesce(p.fee,0)>0 or (coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0))),
    'attendedCount',(select count(distinct a.enrollment_id) from app.program_attendance a where a.organization_id=p.organization_id and a.program_id=p.id and a.status in ('present','late')),
    'paidTotal',case when v_can_money_read then
      coalesce((select sum(ap.amount) from app.payments ap where ap.organization_id=p.organization_id and ap.program_id=p.id and ap.status='posted'),0)+
      coalesce((select sum(lp.amount) from public.payments lp where lp.organization_id=p.organization_id and lp.program_id=p.legacy_id and coalesce(lp.deleted,false)=false and lower(coalesce(lp.type,'')) in ('income','ingreso')),0)
      else null end,
    'expectedTotal',case when v_can_money_read then (select coalesce(sum(case when coalesce(p.fee,0)>0 then p.fee when coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0 then p.fee_weekly*p.weeks else 0 end),0) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled') else null end,
    'pendingTotal',case when v_can_money_read then (select coalesce(sum(case when e.payment_status in ('paid','waived','refunded') then 0 else greatest(0,(case when coalesce(p.fee,0)>0 then p.fee when coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0 then p.fee_weekly*p.weeks else 0 end)-coalesce((select sum(ap.amount) from app.payments ap where ap.organization_id=e.organization_id and ap.program_enrollment_id=e.id and ap.status='posted'),0)-coalesce((select sum(lp.amount) from public.payments lp where lp.organization_id=e.organization_id and lp.enroll_id=e.legacy_id and coalesce(lp.deleted,false)=false and lower(coalesce(lp.type,'')) in ('income','ingreso')),0)) end),0) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled') else null end
  ) order by (p.status='archived'),coalesce(p.starts_on,date '9999-12-31'),p.name),'[]'::jsonb)
  into v_programs from app.programs p where p.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'programId',e.program_id,'playerId',e.player_id,'firstName',e.participant_first_name,'lastName',e.participant_last_name,
    'phone',e.phone,'email',e.email,'birthDate',e.birth_date,'status',e.status,
    'paymentStatus',case when coalesce(p.fee,0)<=0 and not(coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0) then 'waived' else e.payment_status end,
    'notes',e.notes,'createdAt',e.created_at,'updatedAt',e.updated_at,'legacyId',e.legacy_id,
    'metadata',case when v_can_sensitive then e.metadata else jsonb_strip_nulls(jsonb_build_object('position',e.metadata->>'position','bibNumber',e.metadata->>'bibNumber','photoPath',e.metadata->>'photoPath','guardianName',e.metadata->>'guardianName')) end,
    'expectedAmount',case when v_can_money_read then case when coalesce(p.fee,0)>0 then p.fee when coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0 then p.fee_weekly*p.weeks else 0 end else null end,
    'paidAmount',case when v_can_money_read then coalesce((select sum(ap.amount) from app.payments ap where ap.organization_id=e.organization_id and ap.program_enrollment_id=e.id and ap.status='posted'),0)+coalesce((select sum(lp.amount) from public.payments lp where lp.organization_id=e.organization_id and lp.enroll_id=e.legacy_id and coalesce(lp.deleted,false)=false and lower(coalesce(lp.type,'')) in ('income','ingreso')),0) else null end,
    'balance',case when v_can_money_read then case when e.payment_status in ('paid','waived','refunded') or (coalesce(p.fee,0)<=0 and not(coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0)) then 0 else greatest(0,(case when coalesce(p.fee,0)>0 then p.fee when coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0 then p.fee_weekly*p.weeks else 0 end)-coalesce((select sum(ap.amount) from app.payments ap where ap.organization_id=e.organization_id and ap.program_enrollment_id=e.id and ap.status='posted'),0)-coalesce((select sum(lp.amount) from public.payments lp where lp.organization_id=e.organization_id and lp.enroll_id=e.legacy_id and coalesce(lp.deleted,false)=false and lower(coalesce(lp.type,'')) in ('income','ingreso')),0)) end else null end
  ) order by e.created_at desc),'[]'::jsonb)
  into v_enrollments from app.program_enrollments e join app.programs p on p.id=e.program_id and p.organization_id=e.organization_id where e.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'programId',a.program_id,'enrollmentId',a.enrollment_id,'attendanceDate',a.attendance_date,'status',a.status,'checkedInAt',a.checked_in_at,'bibNumber',a.bib_number,'notes',a.notes) order by a.attendance_date desc,a.updated_at desc),'[]'::jsonb)
  into v_attendance from app.program_attendance a where a.organization_id=p_organization_id;

  if v_can_money_read then
    select coalesce(jsonb_agg(jsonb_build_object('id',ap.id,'programId',ap.program_id,'enrollmentId',ap.program_enrollment_id,'amount',ap.amount,'paymentDate',ap.payment_date,'method',ap.method,'reference',ap.reference,'status',ap.status,'payerName',ap.payer_name,'createdAt',ap.created_at) order by ap.payment_date desc,ap.created_at desc),'[]'::jsonb)
    into v_payments from app.payments ap where ap.organization_id=p_organization_id and ap.program_id is not null;
  else v_payments:='[]'::jsonb;end if;
  return jsonb_build_object('programs',v_programs,'enrollments',v_enrollments,'attendance',v_attendance,'payments',v_payments,'capabilities',jsonb_build_object('canMoneyRead',v_can_money_read,'canCollect',v_can_collect,'canSensitive',v_can_sensitive));
end $$;

revoke all on function private.query_program_admin(uuid) from public;
grant execute on function private.query_program_admin(uuid) to postgres;
revoke all on function public.v2_program_admin(uuid) from public;
grant execute on function public.v2_program_admin(uuid) to authenticated,service_role;
;
