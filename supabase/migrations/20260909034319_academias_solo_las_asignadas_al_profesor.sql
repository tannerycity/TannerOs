-- Antes esta consulta devolvía TODAS las academias del club, con sus inscritos, su
-- staff y sus cobros, a cualquiera con el módulo. Un profesor de porteros veía la
-- academia de delanteros completa. Ahora:
--   · admin (Presidencia / quien puede escribir academias): todo igual que antes;
--   · profesor: solo las academias donde está asignado, y sin staff, sin candidatos
--     a inscribir, sin cobros y sin registros del link público.
create or replace function private.query_academy_admin(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private','public'
as $function$
declare
  v_can_read boolean; v_can_write boolean; v_can_money boolean; v_admin boolean;
  v_mias uuid[];
  v_academies jsonb; v_enrollments jsonb; v_staff jsonb; v_staff_options jsonb;
  v_pending jsonb; v_receivables jsonb; v_enrollable jsonb;
begin
  v_can_read := private.has_module_access(p_organization_id,'academias',false);
  if not v_can_read then raise exception 'Not authorized'; end if;
  v_can_write := private.has_module_access(p_organization_id,'academias',true);
  v_admin := private.is_academy_admin(p_organization_id);
  -- El dinero pide su propio permiso Y ser admin: un profesor con acceso de lectura
  -- a cobranza por otro rol tampoco debe ver los cobros desde aquí.
  v_can_money := v_admin and private.has_module_access(p_organization_id,'billing',false);

  select coalesce(array_agg(x),'{}') into v_mias from private.my_academy_ids(p_organization_id) x;
  if not v_admin and cardinality(v_mias)=0 then
    -- Tiene el módulo pero no está asignado a ninguna academia: no ve nada.
    return jsonb_build_object('academies','[]'::jsonb,'enrollments','[]'::jsonb,'staff','[]'::jsonb,
      'staffOptions','[]'::jsonb,'pendingRegistrations','[]'::jsonb,'openReceivables','[]'::jsonb,
      'enrollablePlayers','[]'::jsonb,
      'capabilities',jsonb_build_object('canWrite',false,'canMoney',false,'isAdmin',false));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'slug',a.slug,'name',a.name,'academyType',a.academy_type,'description',a.description,
    'status',a.status,'location',a.location,'capacity',a.capacity,
    -- La cuota y el precio por día son datos administrativos: el profesor no los ve.
    'monthlyFee',case when v_admin then a.monthly_fee end,
    'hourlyRate',case when v_admin then a.hourly_rate end,
    'evaluationModel',a.evaluation_model,
    'activeEnrollments',(select count(*) from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active'),
    'availableSpots',case when a.capacity<=0 then null else greatest(0,a.capacity-(select count(*)::int from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active')) end
  ) order by a.name), '[]'::jsonb) into v_academies
  from app.academies a
  where a.organization_id=p_organization_id and a.archived_at is null
    and (v_admin or a.id=any(v_mias));

  -- Inscritos: solo los de las academias que puede ver, y sin la cuota acordada.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'academyId',e.academy_id,'playerId',e.player_id,
    'playerName',trim(concat_ws(' ',p.first_name,p.last_name)),'playerCode',p.code,
    'category',p.category,'position',p.position,'birthDate',p.birth_date,
    'photoPath',p.photo_thumb_path,'photoBucket',p.photo_bucket,
    'status',e.status,'startsOn',e.starts_on,'endsOn',e.ends_on,
    'agreedFee',case when v_admin then e.agreed_fee end,
    'notes',case when v_admin then e.notes end
  ) order by e.starts_on desc), '[]'::jsonb) into v_enrollments
  from app.academy_enrollments e
  join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
  where e.organization_id=p_organization_id
    and (v_admin or e.academy_id=any(v_mias));

  if v_admin then
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

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',trim(concat_ws(' ',p.first_name,p.last_name)),
      'code',p.code,'category',p.category,'position',p.position,
      'inAcademies',(select coalesce(jsonb_agg(e.academy_id),'[]'::jsonb)
                     from app.academy_enrollments e
                     where e.organization_id=p.organization_id and e.player_id=p.id and e.status='active')
    ) order by p.first_name, p.last_name), '[]'::jsonb) into v_enrollable
    from app.players p
    where p.organization_id=p_organization_id and p.archived_at is null and p.status='active';
  else
    -- El profesor no administra staff, no inscribe y no ve el pipeline del link público.
    v_staff := '[]'::jsonb; v_staff_options := '[]'::jsonb;
    v_pending := '[]'::jsonb; v_enrollable := '[]'::jsonb;
  end if;

  if v_can_money then
    select coalesce(jsonb_agg(jsonb_build_object(
      'chargeId',cb.charge_id,'playerId',cb.player_id,'playerName',cb.player_name,
      'concept',cb.concept,'billingPeriod',cb.billing_period,'dueDate',cb.due_date,'balanceDue',cb.balance_due
    ) order by cb.due_date), '[]'::jsonb) into v_receivables
    from private.query_open_receivables(p_organization_id) cb
    where cb.charge_type in ('academy_fee','academy_day');
  else
    v_receivables := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'academies',v_academies,'enrollments',v_enrollments,'staff',v_staff,'staffOptions',v_staff_options,
    'pendingRegistrations',v_pending,'openReceivables',v_receivables,
    'enrollablePlayers',v_enrollable,
    'capabilities',jsonb_build_object('canWrite',v_can_write,'canMoney',v_can_money,'isAdmin',v_admin)
  );
end $function$;

revoke all on function private.query_academy_admin(uuid) from public, anon, authenticated;;
