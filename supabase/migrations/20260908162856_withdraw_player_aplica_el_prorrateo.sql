create or replace function app.withdraw_player(p_player_id uuid, p_withdrawn_at date, p_reason text, p_actor text default null)
returns void
language plpgsql security definer
set search_path to 'app','public'
as $function$
declare
  v_org uuid;
  v_status text;
  v_academy record;
  v_prorrateo numeric;
begin
  if p_withdrawn_at is null then raise exception 'Withdrawal date required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;

  select organization_id,status into v_org,v_status
  from app.players where id=p_player_id for update;

  if v_org is null then raise exception 'Player not found'; end if;
  if v_status not in ('active','inactive') then raise exception 'Only active players can be withdrawn'; end if;

  update app.players
     set status='withdrawn',
         withdrawn_at=p_withdrawn_at,
         withdrawal_reason=trim(p_reason),
         updated_at=now()
   where id=p_player_id;

  update app.billing_profiles
     set status='closed',updated_at=now()
   where player_id=p_player_id;

  update app.player_enrollments
     set status='completed',
         ends_on=greatest(starts_on,p_withdrawn_at),
         notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja del Tanner: '||trim(p_reason)),
         updated_at=now()
   where organization_id=v_org
     and player_id=p_player_id
     and status='active';

  update app.player_withdrawal_requests
     set status='applied',resolved_at=now(),updated_at=now(),
         resolved_by_user_id=coalesce(resolved_by_user_id,(select auth.uid()))
   where organization_id=v_org and player_id=p_player_id and status='pending';

  for v_academy in
    select id,academy_id,starts_on
    from app.academy_enrollments
    where organization_id=v_org and player_id=p_player_id and status='active'
    for update
  loop
    update app.academy_enrollments
       set status='cancelled',
           ends_on=greatest(v_academy.starts_on,p_withdrawn_at),
           notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja del Tanner: '||trim(p_reason)),
           updated_at=now()
     where id=v_academy.id;

    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
    values(v_org,'AcademyEnrollmentWithdrawn','academy_enrollment',v_academy.id,
      jsonb_build_object('academyId',v_academy.academy_id,'playerId',p_player_id,'endsOn',greatest(v_academy.starts_on,p_withdrawn_at),'reason',trim(p_reason),'source','player_withdrawal'),p_actor);
  end loop;

  -- Cobrar solo lo que entrenó: medio mes si se fue el día 15 o antes.
  v_prorrateo := app.prorate_withdrawal_month(v_org, p_player_id, p_withdrawn_at, p_actor);

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerWithdrawn','player',p_player_id,
         jsonb_build_object('withdrawn_at',p_withdrawn_at,'reason',trim(p_reason),'previousStatus',v_status,
                            'activeEnrollmentsClosed',true,'proratedAmount',coalesce(v_prorrateo,0)),p_actor);
end
$function$;;
