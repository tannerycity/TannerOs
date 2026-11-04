-- BECAS TANNERY CITY — administración (Comité/Dirección/Presidencia).
-- Reutiliza private.puede_ver_becas (ya la usa /v2/becas/) como puerta de
-- lectura/seguimiento; private.is_presidency como puerta del dictamen final.

create or replace function private.scholarship_applications_list(p_organization_id uuid, p_status_filter text default null)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_data jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'playerId',a.player_id,'playerName',p.first_name||' '||p.last_name,'category',p.category,
    'modality',a.modality,'origin',a.origin,'status',a.status,'feeRequired',a.fee_required,'feeAmount',a.fee_amount,
    'feeStatus',a.fee_status,'reason',a.reason,'createdAt',a.created_at,'updatedAt',a.updated_at
  ) order by a.created_at desc), '[]'::jsonb) into v_data
  from app.scholarship_applications a join app.players p on p.id=a.player_id
  where a.organization_id=p_organization_id and (p_status_filter is null or a.status=p_status_filter);
  return v_data;
end $$;
create or replace function public.v2_scholarship_applications(organization_id uuid, status_filter text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_applications_list(organization_id, status_filter) $$;
revoke all on function public.v2_scholarship_applications(uuid,text) from public, anon;
grant execute on function public.v2_scholarship_applications(uuid,text) to authenticated;

create or replace function private.scholarship_application_detail(p_organization_id uuid, p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare a app.scholarship_applications; p app.players; g app.guardians; v_data jsonb; v_events jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into a from app.scholarship_applications where id=p_id and organization_id=p_organization_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  select * into p from app.players where id=a.player_id;
  if a.guardian_id is not null then select * into g from app.guardians where id=a.guardian_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('type',event_type,'payload',payload,'occurredAt',occurred_at) order by occurred_at), '[]'::jsonb)
    into v_events from app.domain_events where aggregate_type='scholarship_application' and aggregate_id=p_id;
  select jsonb_build_object(
    'id',a.id,'playerId',a.player_id,'playerName',p.first_name||' '||p.last_name,'category',p.category,
    'guardianName', case when g.id is not null then g.first_name||' '||g.last_name else null end,
    'guardianPhone', g.phone,
    'modality',a.modality,'origin',a.origin,'status',a.status,'reason',a.reason,'evidenceNote',a.evidence_note,
    'feeRequired',a.fee_required,'feeAmount',a.fee_amount,'feeStatus',a.fee_status,'feeWaivedReason',a.fee_waived_reason,
    'committeeNote',a.committee_note,'infoRequestedNote',a.info_requested_note,
    'decidedPercentage',a.decided_percentage,'decidedDurationMonths',a.decided_duration_months,
    'decidedStartsOn',a.decided_starts_on,'decidedEndsOn',a.decided_ends_on,'decidedCovers',a.decided_covers,
    'decisionNote',a.decision_note,'resultingBenefitId',a.resulting_benefit_id,
    'createdAt',a.created_at,'updatedAt',a.updated_at,'events',v_events
  ) into v_data;
  return v_data;
end $$;
create or replace function public.v2_scholarship_application_detail(organization_id uuid, id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_application_detail(organization_id, id) $$;
revoke all on function public.v2_scholarship_application_detail(uuid,uuid) from public, anon;
grant execute on function public.v2_scholarship_application_detail(uuid,uuid) to authenticated;

-- Nominación interna (Beca Deportiva / Beca Tanner): entrenador, Dirección o Presidencia.
create or replace function private.scholarship_nominate(p_organization_id uuid, p_player_id uuid, p_modality text, p_note text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_puede boolean; v_abierta uuid; v_id uuid;
begin
  select private.puede_ver_becas(p_organization_id)
      or exists(select 1 from public.organization_memberships where organization_id=p_organization_id
                and user_id=auth.uid() and role in ('Formadores','Academia') and active=true)
    into v_puede;
  if not v_puede then raise exception 'Not authorized'; end if;
  if p_modality not in ('deportiva','tanner') then raise exception 'Esta modalidad no es por nominación.'; end if;

  select id into v_abierta from app.scholarship_applications
   where player_id=p_player_id and status not in ('aprobada','no_aprobada','retirada') limit 1;
  if v_abierta is not null then raise exception 'Este Tanner ya tiene una solicitud en curso.'; end if;

  insert into app.scholarship_applications(organization_id,player_id,modality,origin,status,reason,
    fee_required,fee_status,nominated_by_user_id,created_by_user_id)
  values (p_organization_id,p_player_id,p_modality,'staff_nomination','en_evaluacion',p_note,
    false,'not_required',auth.uid(),auth.uid())
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipNominated','scholarship_application',v_id,
    jsonb_build_object('modality',p_modality,'playerId',p_player_id), auth.uid());

  return jsonb_build_object('id',v_id,'status','en_evaluacion');
end $$;
create or replace function public.v2_scholarship_nominate(organization_id uuid, player_id uuid, modality text, note text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_nominate(organization_id, player_id, modality, note) $$;
revoke all on function public.v2_scholarship_nominate(uuid,uuid,text,text) from public, anon;
grant execute on function public.v2_scholarship_nominate(uuid,uuid,text,text) to authenticated;

-- Avanza la solicitud por las etapas administrativas (sin decidir: eso es scholarship_application_decide).
create or replace function private.scholarship_application_advance(p_organization_id uuid, p_id uuid, p_new_status text, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare a app.scholarship_applications; v_ok boolean := false;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into a from app.scholarship_applications where id=p_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;

  if p_new_status = 'retirada' then
    v_ok := a.status not in ('aprobada','no_aprobada','retirada');
  else
    v_ok := (a.status='enviada' and p_new_status in ('en_revision_administrativa'))
         or (a.status='en_revision_administrativa' and p_new_status in ('info_pendiente','en_evaluacion'))
         or (a.status='info_pendiente' and p_new_status in ('en_revision_administrativa'))
         or (a.status='en_evaluacion' and p_new_status in ('comite'))
         or (a.status='comite' and p_new_status in ('presidencia'));
  end if;
  if not v_ok then raise exception 'No se puede mover de "%" a "%".', a.status, p_new_status; end if;

  update app.scholarship_applications set
    status=p_new_status,
    info_requested_note = case when p_new_status='info_pendiente' then p_note else info_requested_note end,
    committee_note = case when p_new_status in ('comite','presidencia') then coalesce(p_note,committee_note) else committee_note end,
    updated_at=now()
  where id=p_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipApplicationAdvanced','scholarship_application',p_id,
    jsonb_build_object('from',a.status,'to',p_new_status,'note',p_note), auth.uid());

  return jsonb_build_object('id',p_id,'status',p_new_status);
end $$;
create or replace function public.v2_scholarship_application_advance(organization_id uuid, id uuid, new_status text, note text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_application_advance(organization_id, id, new_status, note) $$;
revoke all on function public.v2_scholarship_application_advance(uuid,uuid,text,text) from public, anon;
grant execute on function public.v2_scholarship_application_advance(uuid,uuid,text,text) to authenticated;

-- Confirmar pago de la cuota de $200 (Taquilla/Contabilidad/Dirección/Presidencia).
create or replace function private.scholarship_fee_mark_paid(p_organization_id uuid, p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare a app.scholarship_applications; v_puede boolean;
begin
  select private.puede_ver_becas(p_organization_id)
      or private.has_module_access(p_organization_id,'taquilla',true)
      or private.has_module_access(p_organization_id,'contabilidad',true)
    into v_puede;
  if not v_puede then raise exception 'Not authorized'; end if;
  select * into a from app.scholarship_applications where id=p_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if a.status<>'pendiente_pago' then raise exception 'Esta solicitud no está pendiente de pago.'; end if;

  update app.scholarship_applications set fee_status='paid', status='enviada', updated_at=now() where id=p_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipFeePaid','scholarship_application',p_id,jsonb_build_object('amount',a.fee_amount), auth.uid());

  return jsonb_build_object('id',p_id,'status','enviada');
end $$;
create or replace function public.v2_scholarship_fee_mark_paid(organization_id uuid, id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_fee_mark_paid(organization_id, id) $$;
revoke all on function public.v2_scholarship_fee_mark_paid(uuid,uuid) from public, anon;
grant execute on function public.v2_scholarship_fee_mark_paid(uuid,uuid) to authenticated;

-- Exentar la cuota por necesidad extraordinaria: solo Presidencia.
create or replace function private.scholarship_fee_waive(p_organization_id uuid, p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare a app.scholarship_applications;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into a from app.scholarship_applications where id=p_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if a.status<>'pendiente_pago' then raise exception 'Esta solicitud no está pendiente de pago.'; end if;
  if length(btrim(coalesce(p_reason,''))) < 10 then raise exception 'Explica brevemente el motivo de la excepción.'; end if;

  update app.scholarship_applications set fee_status='waived', fee_waived_reason=p_reason, status='enviada', updated_at=now() where id=p_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipFeeWaived','scholarship_application',p_id,jsonb_build_object('reason',p_reason), auth.uid());

  return jsonb_build_object('id',p_id,'status','enviada');
end $$;
create or replace function public.v2_scholarship_fee_waive(organization_id uuid, id uuid, reason text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_fee_waive(organization_id, id, reason) $$;
revoke all on function public.v2_scholarship_fee_waive(uuid,uuid,text) from public, anon;
grant execute on function public.v2_scholarship_fee_waive(uuid,uuid,text) to authenticated;
