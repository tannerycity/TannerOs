-- BECAS TANNERY CITY — el dictamen. Solo Presidencia decide aprobación,
-- porcentaje, duración y condiciones (protocolo §22). Al aprobar, cierra
-- cualquier beneficio activo previo del Tanner (no acumulación, §3) y crea
-- el nuevo en app.player_benefits — la misma tabla que ya usan Jugadores y
-- Contabilidad, para que todo lo demás (cobros, Taquilla, reportes) siga
-- funcionando sin tocarlo.
create or replace function private.scholarship_application_decide(
  p_organization_id uuid, p_id uuid, p_decision text,
  p_percentage numeric default null, p_duration_months integer default null,
  p_starts_on date default null, p_ends_on date default null,
  p_covers text[] default null, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare
  a app.scholarship_applications; s app.scholarship_settings;
  v_benefit_type text; v_funding text; v_benefit_id uuid; v_cap_exceeded boolean := false;
  v_full_count integer;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_decision not in ('aprobada','no_aprobada') then raise exception 'Decisión inválida'; end if;

  select * into a from app.scholarship_applications where id=p_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if a.status in ('aprobada','no_aprobada','retirada') then raise exception 'Esta solicitud ya se cerró.'; end if;

  if p_decision = 'no_aprobada' then
    update app.scholarship_applications set status='no_aprobada', decision_note=p_note,
      decided_by_user_id=auth.uid(), decided_at=now(), updated_at=now() where id=p_id;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
    values (p_organization_id,'ScholarshipRejected','scholarship_application',p_id,jsonb_build_object('note',p_note), auth.uid());
    return jsonb_build_object('id',p_id,'status','no_aprobada');
  end if;

  select * into s from app.scholarship_settings where organization_id=p_organization_id;
  if p_percentage is null then raise exception 'Indica el porcentaje que Tannery City otorga.'; end if;
  if p_percentage < coalesce(s.min_percentage,10) or p_percentage > 100 then
    raise exception 'El apoyo debe ir de % a 100%%.', coalesce(s.min_percentage,10);
  end if;
  if p_starts_on is null then raise exception 'Indica la fecha de inicio del apoyo.'; end if;

  -- Techo de becas al 100% financiadas por el club (no aplica a Curtibrother,
  -- que paga un tercero). Es de referencia: Presidencia puede excederlo
  -- "extraordinariamente" (protocolo §20) — se registra, no se bloquea.
  if p_percentage = 100 and a.modality <> 'curtibrother' then
    select count(*) into v_full_count from app.player_benefits
     where organization_id=p_organization_id and active=true and percentage=100
       and scholarship_modality is not null and scholarship_modality <> 'curtibrother';
    if v_full_count >= coalesce(s.max_full_scholarships,3) then v_cap_exceeded := true; end if;
  end if;

  v_benefit_type := case when a.modality='curtibrother' then 'sponsor_funded'
                         when p_percentage=100 then 'scholarship_full'
                         else 'scholarship_partial' end;
  v_funding := case when a.modality='curtibrother' then 'Curtibrother' else 'Tannery City' end;

  -- No acumulación: solo un beneficio económico activo por Tanner.
  update app.player_benefits set active=false, updated_at=now()
   where organization_id=p_organization_id and player_id=a.player_id and active=true;

  insert into app.player_benefits(organization_id,player_id,benefit_type,calculation_type,percentage,
    funding_source_name,starts_on,ends_on,active,notes,scholarship_modality,next_review_at,source_application_id)
  values (p_organization_id,a.player_id,v_benefit_type,'percentage',p_percentage,
    v_funding,p_starts_on,p_ends_on,true,p_note,a.modality,(p_starts_on + interval '3 months')::date,p_id)
  returning id into v_benefit_id;

  update app.scholarship_applications set
    status='aprobada', decided_percentage=p_percentage, decided_duration_months=p_duration_months,
    decided_starts_on=p_starts_on, decided_ends_on=p_ends_on, decided_covers=p_covers,
    decision_note=p_note, resulting_benefit_id=v_benefit_id, decided_by_user_id=auth.uid(),
    decided_at=now(), updated_at=now()
  where id=p_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipApproved','scholarship_application',p_id,
    jsonb_build_object('modality',a.modality,'percentage',p_percentage,'benefitId',v_benefit_id,'capExceeded',v_cap_exceeded), auth.uid());

  return jsonb_build_object('id',p_id,'status','aprobada','resultingBenefitId',v_benefit_id,'capExceeded',v_cap_exceeded);
end $$;
create or replace function public.v2_scholarship_application_decide(
  organization_id uuid, id uuid, decision text, percentage numeric default null, duration_months integer default null,
  starts_on date default null, ends_on date default null, covers text[] default null, note text default null
) returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.scholarship_application_decide(organization_id, id, decision, percentage, duration_months, starts_on, ends_on, covers, note)
$$;
revoke all on function public.v2_scholarship_application_decide(uuid,uuid,text,numeric,integer,date,date,text[],text) from public, anon;
grant execute on function public.v2_scholarship_application_decide(uuid,uuid,text,numeric,integer,date,date,text[],text) to authenticated;

-- ---------------------------------------------------------------------------
-- Configuración (Presidencia edita; el resto del módulo solo lee).
-- ---------------------------------------------------------------------------
create or replace function private.scholarship_settings_get(p_organization_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare s app.scholarship_settings; v_data jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into s from app.scholarship_settings where organization_id=p_organization_id;
  select jsonb_build_object(
    'minPercentage',s.min_percentage,'applicationFee',s.application_fee,'internalFundCapPct',s.internal_fund_cap_pct,
    'maxFullScholarships',s.max_full_scholarships,'responseDays',s.response_days,'attendanceTargetPct',s.attendance_target_pct,
    'referralsPerQuarter',s.referrals_per_quarter,'commercialContactsPerQuarter',s.commercial_contacts_per_quarter,
    'maxWarnings',s.max_warnings,'updatedAt',s.updated_at
  ) into v_data;
  return v_data;
end $$;
create or replace function public.v2_scholarship_settings_get(organization_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_settings_get(organization_id) $$;
revoke all on function public.v2_scholarship_settings_get(uuid) from public, anon;
grant execute on function public.v2_scholarship_settings_get(uuid) to authenticated;

create or replace function private.scholarship_settings_update(
  p_organization_id uuid, p_min_percentage numeric, p_application_fee numeric, p_internal_fund_cap_pct numeric,
  p_max_full_scholarships integer, p_response_days integer, p_attendance_target_pct numeric,
  p_referrals_per_quarter integer, p_commercial_contacts_per_quarter integer, p_max_warnings integer
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_min_percentage < 0 or p_min_percentage > 100 then raise exception 'El porcentaje mínimo debe ir de 0 a 100.'; end if;
  if p_application_fee < 0 then raise exception 'La cuota no puede ser negativa.'; end if;

  update app.scholarship_settings set
    min_percentage=p_min_percentage, application_fee=p_application_fee, internal_fund_cap_pct=p_internal_fund_cap_pct,
    max_full_scholarships=p_max_full_scholarships, response_days=p_response_days, attendance_target_pct=p_attendance_target_pct,
    referrals_per_quarter=p_referrals_per_quarter, commercial_contacts_per_quarter=p_commercial_contacts_per_quarter,
    max_warnings=p_max_warnings, updated_at=now(), updated_by=auth.uid()
  where organization_id=p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipSettingsUpdated','scholarship_settings',null,
    jsonb_build_object('applicationFee',p_application_fee,'minPercentage',p_min_percentage), auth.uid());

  return jsonb_build_object('ok',true);
end $$;
create or replace function public.v2_scholarship_settings_update(
  organization_id uuid, min_percentage numeric, application_fee numeric, internal_fund_cap_pct numeric,
  max_full_scholarships integer, response_days integer, attendance_target_pct numeric,
  referrals_per_quarter integer, commercial_contacts_per_quarter integer, max_warnings integer
) returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.scholarship_settings_update(organization_id, min_percentage, application_fee, internal_fund_cap_pct,
    max_full_scholarships, response_days, attendance_target_pct, referrals_per_quarter, commercial_contacts_per_quarter, max_warnings)
$$;
revoke all on function public.v2_scholarship_settings_update(uuid,numeric,numeric,numeric,integer,integer,numeric,integer,integer,integer) from public, anon;
grant execute on function public.v2_scholarship_settings_update(uuid,numeric,numeric,numeric,integer,integer,numeric,integer,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Tanner por Tanner: resumen de cumplimiento del trimestre para el panel.
-- ---------------------------------------------------------------------------
create or replace function private.scholarship_tanner_por_tanner_summary(p_organization_id uuid, p_quarter text default null)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_q text; s app.scholarship_settings; v_data jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  v_q := coalesce(p_quarter, to_char(now(),'YYYY') || '-Q' || to_char(ceil(extract(month from now())/3.0),'FM0'));
  select * into s from app.scholarship_settings where organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',b.player_id,'playerName',p.first_name||' '||p.last_name,'modality',b.scholarship_modality,
    'obligatory', b.scholarship_modality in ('ingreso','apoyo_familiar','curtibrother'),
    'referrals',coalesce(t.referrals,0),'referralsTarget',coalesce(s.referrals_per_quarter,2),
    'commercialContacts',coalesce(t.contacts,0),'commercialContactsTarget',coalesce(s.commercial_contacts_per_quarter,1),
    'compliant', coalesce(t.referrals,0) >= coalesce(s.referrals_per_quarter,2) and coalesce(t.contacts,0) >= coalesce(s.commercial_contacts_per_quarter,1)
  ) order by p.first_name), '[]'::jsonb) into v_data
  from app.player_benefits b
  join app.players p on p.id=b.player_id
  left join (
    select player_id, count(*) filter (where kind='referral') referrals, count(*) filter (where kind='commercial_contact') contacts
    from app.scholarship_tanner_log where organization_id=p_organization_id and quarter_label=v_q group by player_id
  ) t on t.player_id=b.player_id
  where b.organization_id=p_organization_id and b.active=true and b.scholarship_modality is not null;

  return jsonb_build_object('quarter',v_q,'rows',v_data);
end $$;
create or replace function public.v2_scholarship_tanner_por_tanner_summary(organization_id uuid, quarter text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.scholarship_tanner_por_tanner_summary(organization_id, quarter) $$;
revoke all on function public.v2_scholarship_tanner_por_tanner_summary(uuid,text) from public, anon;
grant execute on function public.v2_scholarship_tanner_por_tanner_summary(uuid,text) to authenticated;
