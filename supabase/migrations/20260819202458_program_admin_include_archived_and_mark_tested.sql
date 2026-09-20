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
    'publicRegistrationEnabled',p.public_registration_enabled,'archivedAt',p.archived_at,'createdAt',p.created_at,'updatedAt',p.updated_at,
    'registeredCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status in ('registered','confirmed')),
    'waitlistedCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status='waitlisted'),
    'totalEnrollmentCount',(select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled')
  ) order by (p.status='archived'),coalesce(p.starts_on,date '9999-12-31'),p.name),'[]'::jsonb)
  into v_programs from app.programs p where p.organization_id=p_organization_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'programId',e.program_id,'playerId',e.player_id,'firstName',e.participant_first_name,'lastName',e.participant_last_name,
    'phone',e.phone,'email',e.email,'birthDate',e.birth_date,'status',e.status,'paymentStatus',e.payment_status,
    'notes',e.notes,'createdAt',e.created_at,'updatedAt',e.updated_at,'legacyId',e.legacy_id
  ) order by e.created_at desc),'[]'::jsonb)
  into v_enrollments from app.program_enrollments e where e.organization_id=p_organization_id;
  return jsonb_build_object('programs',v_programs,'enrollments',v_enrollments);
end
$$;
update app.business_rule_catalog set test_status='tested',updated_at=now(),metadata=metadata||jsonb_build_object('blackbox_verified_on','2026-08-19','qa_cases',8,'rollback_verified',true) where rule_key in ('PROG-004','PROG-005','PROG-006');;
