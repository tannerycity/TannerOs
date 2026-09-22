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
    'expectedTotal',case when v_can_money_read then
      (case when coalesce(p.fee,0)>0 then p.fee when coalesce(p.fee_weekly,0)>0 and coalesce(p.weeks,0)>0 then p.fee_weekly*p.weeks else 0 end)
      * (select count(*) from app.program_enrollments e where e.organization_id=p.organization_id and e.program_id=p.id and e.status<>'cancelled')
      else null end,
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
;
