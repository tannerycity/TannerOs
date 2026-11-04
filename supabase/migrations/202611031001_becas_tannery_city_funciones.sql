-- BECAS TANNERY CITY — funciones. Mismo patrón que el resto de la app:
-- private.query_*/command_* (SECURITY DEFINER, search_path fijo) + envoltura
-- delgada public.v2_* + RLS deny-all en las tablas (acceso solo por función).

-- Qué modalidad pide cuota y cuál la puede solicitar la familia directamente
-- (deportiva y tanner son por nominación — ver protocolo).
create or replace function private.scholarship_modality_meta(p_modality text)
returns jsonb
language sql immutable
as $$
  select case p_modality
    when 'ingreso' then jsonb_build_object('feeRequired', false, 'familyCanApply', true)
    when 'apoyo_familiar' then jsonb_build_object('feeRequired', true, 'familyCanApply', true)
    when 'academica' then jsonb_build_object('feeRequired', true, 'familyCanApply', true)
    when 'lealtad' then jsonb_build_object('feeRequired', true, 'familyCanApply', true)
    when 'curtibrother' then jsonb_build_object('feeRequired', false, 'familyCanApply', true)
    when 'deportiva' then jsonb_build_object('feeRequired', false, 'familyCanApply', false)
    when 'tanner' then jsonb_build_object('feeRequired', false, 'familyCanApply', false)
    else jsonb_build_object('feeRequired', false, 'familyCanApply', false)
  end
$$;

-- =====================================================================
-- PÚBLICO (anon + authenticated) — configuración vigente para wizard/páginas.
-- =====================================================================
create or replace function private.public_scholarship_config(p_public_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; s app.scholarship_settings; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('scholarship_config',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Becas Tannery City unavailable'; end if;
  select * into s from app.scholarship_settings where organization_id=v_org;
  if not found then
    select jsonb_build_object('minPercentage',10,'applicationFee',200,'responseDays',7,'attendanceTarget',90,
      'referralsPerQuarter',2,'commercialContactsPerQuarter',1) into v_data;
    return v_data;
  end if;
  select jsonb_build_object(
    'minPercentage', s.min_percentage, 'applicationFee', s.application_fee, 'responseDays', s.response_days,
    'attendanceTarget', s.attendance_target_pct, 'referralsPerQuarter', s.referrals_per_quarter,
    'commercialContactsPerQuarter', s.commercial_contacts_per_quarter
  ) into v_data;
  return v_data;
end $$;

create or replace function public.v2_public_scholarship_config(club_key text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_scholarship_config(club_key) $$;
grant execute on function public.v2_public_scholarship_config(text) to anon, authenticated;

-- =====================================================================
-- PORTAL (familia autenticada)
-- =====================================================================
create or replace function private.portal_scholarship_apply(p_player_id uuid, p_modality text, p_reason text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare g app.guardians; v_meta jsonb; v_motivo text; v_abierta uuid; v_fee numeric; v_id uuid; v_status text; v_fee_status text;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();

  v_meta := private.scholarship_modality_meta(p_modality);
  if not coalesce((v_meta->>'familyCanApply')::boolean, false) then
    raise exception 'Esta modalidad es por nominación interna, no se solicita directamente.';
  end if;

  v_motivo := btrim(coalesce(p_reason,''));
  if length(v_motivo) < 20 then raise exception 'Cuéntanos un poco más: el motivo necesita al menos 20 caracteres'; end if;
  if length(v_motivo) > 2000 then raise exception 'El motivo es muy largo, resúmelo en 2000 caracteres'; end if;

  select id into v_abierta from app.scholarship_applications
   where player_id=p_player_id and status not in ('aprobada','no_aprobada','retirada') limit 1;
  if v_abierta is not null then raise exception 'Ya tienes una solicitud en curso. El club te va a contestar.'; end if;

  if coalesce((v_meta->>'feeRequired')::boolean, false) then
    select coalesce(application_fee,200) into v_fee from app.scholarship_settings where organization_id=g.organization_id;
    v_status := 'pendiente_pago'; v_fee_status := 'pending';
  else
    v_fee := null; v_status := 'enviada'; v_fee_status := 'not_required';
  end if;

  insert into app.scholarship_applications(organization_id,player_id,guardian_id,modality,origin,status,reason,
    fee_required,fee_amount,fee_status,created_by_user_id)
  values (g.organization_id,p_player_id,g.id,p_modality,'family_request',v_status,v_motivo,
    coalesce((v_meta->>'feeRequired')::boolean,false),v_fee,v_fee_status, auth.uid())
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'ScholarshipApplicationCreated','scholarship_application',v_id,
    jsonb_build_object('modality',p_modality,'playerId',p_player_id,'status',v_status), auth.uid());

  return jsonb_build_object('id',v_id,'status',v_status,'feeRequired',coalesce((v_meta->>'feeRequired')::boolean,false),'feeAmount',v_fee);
end $$;

create or replace function public.v2_portal_scholarship_apply(player_id uuid, modality text, reason text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.portal_scholarship_apply(player_id, modality, reason) $$;
revoke all on function public.v2_portal_scholarship_apply(uuid,text,text) from public, anon;
grant execute on function public.v2_portal_scholarship_apply(uuid,text,text) to authenticated;

create or replace function private.portal_scholarship_my_applications()
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare g app.guardians; v_data jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'playerId',a.player_id,'playerName',p.first_name||' '||p.last_name,'modality',a.modality,
    'status',a.status,'feeRequired',a.fee_required,'feeAmount',a.fee_amount,'feeStatus',a.fee_status,
    'reason',a.reason,'infoRequestedNote',a.info_requested_note,'decidedPercentage',a.decided_percentage,
    'decidedStartsOn',a.decided_starts_on,'decidedEndsOn',a.decided_ends_on,'decisionNote',a.decision_note,
    'createdAt',a.created_at,'updatedAt',a.updated_at
  ) order by a.created_at desc), '[]'::jsonb) into v_data
  from app.scholarship_applications a
  join app.players p on p.id=a.player_id
  where a.player_id in (select player_id from app.player_guardians where guardian_id=g.id);
  return v_data;
end $$;

create or replace function public.v2_portal_scholarship_my_applications()
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.portal_scholarship_my_applications() $$;
revoke all on function public.v2_portal_scholarship_my_applications() from public, anon;
grant execute on function public.v2_portal_scholarship_my_applications() to authenticated;

create or replace function private.portal_scholarship_log_tanner(p_player_id uuid, p_kind text, p_details jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare g app.guardians; v_q text; v_id uuid;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  if p_kind not in ('referral','commercial_contact') then raise exception 'Tipo inválido'; end if;
  select * into g from private.portal_guardian();
  v_q := to_char(now(),'YYYY') || '-Q' || to_char(ceil(extract(month from now())/3.0),'FM0');

  if p_kind='referral' then
    if length(btrim(coalesce(p_details->>'childName',''))) < 2 then raise exception 'Escribe el nombre del niño o niña que presentaste.'; end if;
    insert into app.scholarship_tanner_log(organization_id,player_id,quarter_label,kind,child_name,notes,created_by_user_id)
    values (g.organization_id,p_player_id,v_q,'referral',btrim(p_details->>'childName'),p_details->>'notes',auth.uid())
    returning id into v_id;
  else
    if length(btrim(coalesce(p_details->>'contactName',''))) < 2 then raise exception 'Escribe el nombre del contacto.'; end if;
    insert into app.scholarship_tanner_log(organization_id,player_id,quarter_label,kind,contact_name,contact_phone,contact_company,contact_relationship,notes,created_by_user_id)
    values (g.organization_id,p_player_id,v_q,'commercial_contact',btrim(p_details->>'contactName'),p_details->>'contactPhone',
      p_details->>'contactCompany',p_details->>'contactRelationship',p_details->>'notes',auth.uid())
    returning id into v_id;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'ScholarshipTannerLogAdded','player',p_player_id,jsonb_build_object('kind',p_kind,'quarter',v_q),auth.uid());

  return jsonb_build_object('id',v_id,'quarter',v_q);
end $$;

create or replace function public.v2_portal_scholarship_log_tanner(player_id uuid, kind text, details jsonb)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.portal_scholarship_log_tanner(player_id, kind, details) $$;
revoke all on function public.v2_portal_scholarship_log_tanner(uuid,text,jsonb) from public, anon;
grant execute on function public.v2_portal_scholarship_log_tanner(uuid,text,jsonb) to authenticated;

create or replace function private.portal_scholarship_tanner_status(p_player_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_q text; v_ref int; v_con int; s app.scholarship_settings;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select organization_id into v_org from app.players where id=p_player_id;
  select * into s from app.scholarship_settings where organization_id=v_org;
  v_q := to_char(now(),'YYYY') || '-Q' || to_char(ceil(extract(month from now())/3.0),'FM0');
  select count(*) filter (where kind='referral'), count(*) filter (where kind='commercial_contact')
    into v_ref, v_con from app.scholarship_tanner_log where player_id=p_player_id and quarter_label=v_q;
  return jsonb_build_object('quarter',v_q,'referrals',coalesce(v_ref,0),'referralsTarget',coalesce(s.referrals_per_quarter,2),
    'commercialContacts',coalesce(v_con,0),'commercialContactsTarget',coalesce(s.commercial_contacts_per_quarter,1));
end $$;

create or replace function public.v2_portal_scholarship_tanner_status(player_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.portal_scholarship_tanner_status(player_id) $$;
revoke all on function public.v2_portal_scholarship_tanner_status(uuid) from public, anon;
grant execute on function public.v2_portal_scholarship_tanner_status(uuid) to authenticated;
