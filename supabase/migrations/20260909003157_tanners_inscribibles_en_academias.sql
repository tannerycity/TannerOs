-- Academias solo dejaba inscribir CONVIRTIENDO un prospecto del formulario público.
-- Un Tanner que ya está en el club no tiene por dónde entrar: no es prospecto.
-- Esto agrega la lista de candidatos, con el dato de en qué academias ya está
-- para no inscribirlo dos veces en la misma.
--
-- La lista sale bajo el permiso de academias, no del de jugadores: quien opera la
-- academia no necesariamente tiene acceso al expediente completo, y aquí solo se
-- exponen nombre, código, categoría y posición.
create or replace function private.query_academy_admin(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private','public'
as $function$
declare
  v_can_read boolean; v_can_write boolean; v_can_money boolean;
  v_academies jsonb; v_enrollments jsonb; v_staff jsonb; v_staff_options jsonb;
  v_pending jsonb; v_receivables jsonb; v_enrollable jsonb;
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

  -- Tanners activos del club, con las academias en las que ya tienen inscripción viva.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',trim(concat_ws(' ',p.first_name,p.last_name)),
    'code',p.code,'category',p.category,'position',p.position,
    'inAcademies',(select coalesce(jsonb_agg(e.academy_id),'[]'::jsonb)
                   from app.academy_enrollments e
                   where e.organization_id=p.organization_id and e.player_id=p.id and e.status='active')
  ) order by p.first_name, p.last_name), '[]'::jsonb) into v_enrollable
  from app.players p
  where p.organization_id=p_organization_id and p.archived_at is null and p.status='active';

  return jsonb_build_object(
    'academies',v_academies,'enrollments',v_enrollments,'staff',v_staff,'staffOptions',v_staff_options,
    'pendingRegistrations',v_pending,'openReceivables',v_receivables,
    'enrollablePlayers',v_enrollable,
    'capabilities',jsonb_build_object('canWrite',v_can_write,'canMoney',v_can_money)
  );
end $function$;

revoke all on function private.query_academy_admin(uuid) from public, anon, authenticated;;
