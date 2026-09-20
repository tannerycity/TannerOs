-- Fase 1 de Academias: motor de asignación de staff + flujo de 3 pasos
-- No se toca app.academies / app.academy_enrollments / app.generate_academy_charges / el cron de cobro.
-- Se añade: tabla de asignación profesor<->academia, panel admin unificado (query_academy_admin),
-- captación de prospectos por academia + conversión a inscripción, y se ajustan permisos de escritura.

-- 1) Endurecer permisos de escritura en 'academias' (solo Presidencia/Operaciones crean/editan/asignan/cobran)
update public.role_module_permissions
   set can_write = false, updated_at = now()
 where module_code = 'academias'
   and role in ('Academia','Contabilidad','Formadores');

-- 2) Tabla de asignación de staff (muchos a muchos, profesor puede estar en varias academias)
create table if not exists app.academy_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  academy_id uuid not null references app.academies(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(academy_id, user_id)
);
create index if not exists academy_staff_assignments_org_idx on app.academy_staff_assignments(organization_id);
create index if not exists academy_staff_assignments_user_idx on app.academy_staff_assignments(user_id);
alter table app.academy_staff_assignments enable row level security;
grant select on app.academy_staff_assignments to authenticated;

-- 3) Asignar / desasignar staff
create or replace function private.command_assign_academy_staff(
  p_organization_id uuid, p_academy_id uuid, p_user_id uuid
) returns void
language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'academias',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.academies where id=p_academy_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'Academy not found';
  end if;
  if not exists(
    select 1 from public.organization_memberships m
     where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
       and m.role in ('Formadores','Academia','Operaciones','Presidencia')
  ) then
    raise exception 'User is not eligible staff for this organization';
  end if;
  insert into app.academy_staff_assignments(organization_id,academy_id,user_id,assigned_by)
  values(p_organization_id,p_academy_id,p_user_id,auth.uid())
  on conflict (academy_id,user_id) do nothing;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademyStaffAssigned','academy',p_academy_id,jsonb_build_object('userId',p_user_id),coalesce((select auth.uid())::text,'system'));
end;
$$;

create or replace function private.command_unassign_academy_staff(
  p_organization_id uuid, p_academy_id uuid, p_user_id uuid
) returns void
language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'academias',true) then raise exception 'Not authorized'; end if;
  delete from app.academy_staff_assignments
   where organization_id=p_organization_id and academy_id=p_academy_id and user_id=p_user_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademyStaffUnassigned','academy',p_academy_id,jsonb_build_object('userId',p_user_id),coalesce((select auth.uid())::text,'system'));
end;
$$;

-- 4) Panel admin unificado: academias + inscritos + staff + prospectos pendientes + cobros abiertos + capacidades
create or replace function private.query_academy_admin(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
declare
  v_can_read boolean;
  v_can_write boolean;
  v_can_money boolean;
  v_academies jsonb;
  v_enrollments jsonb;
  v_staff jsonb;
  v_staff_options jsonb;
  v_pending jsonb;
  v_receivables jsonb;
begin
  v_can_read := private.has_module_access(p_organization_id,'academias',false);
  if not v_can_read then raise exception 'Not authorized'; end if;
  v_can_write := private.has_module_access(p_organization_id,'academias',true);
  v_can_money := private.has_module_access(p_organization_id,'billing',false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'slug',a.slug,'name',a.name,'academyType',a.academy_type,'description',a.description,
    'status',a.status,'monthlyFee',a.monthly_fee,'hourlyRate',a.hourly_rate,'location',a.location,
    'capacity',a.capacity,
    'activeEnrollments',(select count(*) from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active'),
    'availableSpots',case when a.capacity<=0 then null else greatest(0,a.capacity-(select count(*)::int from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active')) end
  ) order by a.name), '[]'::jsonb) into v_academies
  from app.academies a where a.organization_id=p_organization_id and a.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'academyId',e.academy_id,'playerId',e.player_id,
    'playerName',trim(concat_ws(' ',p.first_name,p.last_name)),'playerCode',p.code,
    'status',e.status,'startsOn',e.starts_on,'endsOn',e.ends_on,'agreedFee',e.agreed_fee,'notes',e.notes
  ) order by e.starts_on desc), '[]'::jsonb) into v_enrollments
  from app.academy_enrollments e
  join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
  where e.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'academyId',s.academy_id,'userId',s.user_id,'displayName',coalesce(pr.display_name,'Sin nombre'),'assignedAt',s.assigned_at
  ) order by s.assigned_at), '[]'::jsonb) into v_staff
  from app.academy_staff_assignments s
  left join public.profiles pr on pr.user_id=s.user_id
  where s.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId',m.user_id,'role',m.role,'displayName',coalesce(pr.display_name,'Sin nombre')
  ) order by pr.display_name), '[]'::jsonb) into v_staff_options
  from public.organization_memberships m
  left join public.profiles pr on pr.user_id=m.user_id
  where m.organization_id=p_organization_id and m.active
    and m.role in ('Formadores','Academia','Operaciones','Presidencia');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pp.id,'firstName',pp.first_name,'lastName',pp.last_name,'phone',pp.phone,'email',pp.email,
    'guardianName',pp.guardian_name,'birthDate',pp.birth_date,'status',pp.status,
    'sourceCampaign',pp.source_campaign,'createdAt',pp.created_at
  ) order by pp.created_at desc), '[]'::jsonb) into v_pending
  from app.prospects pp
  where pp.organization_id=p_organization_id and pp.archived_at is null
    and pp.status not in ('converted','archived','not_continuing')
    and pp.source_campaign like 'academia:%';

  if v_can_money then
    select coalesce(jsonb_agg(jsonb_build_object(
      'chargeId',cb.charge_id,'playerId',cb.player_id,'playerName',cb.player_name,
      'concept',cb.concept,'billingPeriod',cb.billing_period,'dueDate',cb.due_date,'balanceDue',cb.balance_due
    ) order by cb.due_date), '[]'::jsonb) into v_receivables
    from private.query_open_receivables(p_organization_id) cb
    where cb.charge_type='academy_fee';
  else
    v_receivables := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'academies',v_academies,'enrollments',v_enrollments,'staff',v_staff,'staffOptions',v_staff_options,
    'pendingRegistrations',v_pending,'openReceivables',v_receivables,
    'capabilities',jsonb_build_object('canWrite',v_can_write,'canMoney',v_can_money)
  );
end;
$$;

-- 5) Convertir un prospecto (registrado por el link público) e inscribirlo en la academia, en un solo paso
create or replace function private.command_convert_and_enroll_academy_prospect(
  p_organization_id uuid, p_prospect_id uuid, p_academy_id uuid,
  p_starts_on date default current_date, p_agreed_fee numeric default null
) returns uuid
language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_player uuid; v_enrollment uuid;
begin
  if not private.has_module_access(p_organization_id,'academias',true) then raise exception 'Not authorized'; end if;
  v_player := private.command_convert_prospect_to_player(p_organization_id,p_prospect_id,null,0,coalesce(p_starts_on,current_date),null,null);
  v_enrollment := private.command_enroll_academy(p_organization_id,p_academy_id,v_player,coalesce(p_starts_on,current_date),p_agreed_fee,'Inscrito desde link público de la academia');
  return v_enrollment;
end;
$$;

-- 6) Envoltorios públicos (mismo patrón v2_*)
create or replace function public.v2_academy_admin(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_academy_admin(organization_id) $$;

create or replace function public.v2_assign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_assign_academy_staff(organization_id,academy_id,user_id) $$;

create or replace function public.v2_unassign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_unassign_academy_staff(organization_id,academy_id,user_id) $$;

create or replace function public.v2_convert_and_enroll_academy_prospect(
  organization_id uuid, prospect_id uuid, academy_id uuid, starts_on date default current_date, agreed_fee numeric default null
) returns uuid language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_convert_and_enroll_academy_prospect(organization_id,prospect_id,academy_id,starts_on,agreed_fee) $$;

grant execute on function public.v2_academy_admin(uuid) to authenticated;
grant execute on function public.v2_assign_academy_staff(uuid,uuid,uuid) to authenticated;
grant execute on function public.v2_unassign_academy_staff(uuid,uuid,uuid) to authenticated;
grant execute on function public.v2_convert_and_enroll_academy_prospect(uuid,uuid,uuid,date,numeric) to authenticated;
;
