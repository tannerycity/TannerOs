-- 1. command_convert_prospect_to_player: al convertir, enlazar TODAS las visorias de ese
--    prospecto (player_id quedaba huerfano -- nunca se llenaba en ningun lado del sistema,
--    por eso "Fichados" en Scouting siempre mostraba 0). Firma sin cambios -> CREATE OR REPLACE
--    normal, sin drop, sin riesgo de overload duplicado.
create or replace function private.command_convert_prospect_to_player(p_organization_id uuid, p_prospect_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_monthly_fee numeric DEFAULT NULL::numeric, p_joined_at date DEFAULT CURRENT_DATE, p_jersey_number text DEFAULT NULL::text, p_position text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  pr app.prospects%rowtype;
  cat app.categories%rowtype;
  v_player uuid;
  v_guardian uuid;
  v_code text;
  v_fee numeric;
  v_existing uuid;
begin
  if not private.has_module_access(p_organization_id,'players',true)
     or not private.has_module_access(p_organization_id,'prospects',true)
  then raise exception 'Not authorized'; end if;

  select * into pr from app.prospects
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null
   for update;
  if not found then raise exception 'Prospect not found'; end if;
  if pr.converted_player_id is not null then return pr.converted_player_id; end if;
  if coalesce(length(trim(pr.first_name)),0)<2 or coalesce(length(trim(pr.last_name)),0)<2 then raise exception 'Prospect name incomplete'; end if;
  if pr.birth_date is null then raise exception 'Prospect birth date required'; end if;
  if coalesce(length(trim(pr.guardian_name)),0)<2 or coalesce(length(trim(pr.phone)),0)<8 then raise exception 'Guardian contact required'; end if;

  if p_category_id is not null then
    select * into cat from app.categories where id=p_category_id and organization_id=p_organization_id and status='active';
    if not found then raise exception 'Invalid category'; end if;
  end if;

  select p.id into v_existing from app.players p
   where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
     and lower(trim(p.first_name))=lower(trim(pr.first_name))
     and lower(trim(coalesce(p.last_name,'')))=lower(trim(coalesce(pr.last_name,'')))
     and p.birth_date=pr.birth_date
   limit 1;
  if v_existing is not null then raise exception 'Possible duplicate player'; end if;

  v_code:=private.next_player_code(p_organization_id);
  v_fee:=greatest(0,coalesce(p_monthly_fee,0));

  insert into app.players(
    organization_id,code,first_name,last_name,birth_date,status,category,position,dominant_foot,jersey_number,school,
    photo_bucket,photo_path,joined_at,notes,source_prospect_id,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,created_at,updated_at
  ) values(
    p_organization_id,v_code,trim(pr.first_name),nullif(trim(pr.last_name),''),pr.birth_date,'active',
    case when p_category_id is not null then cat.name else nullif(trim(pr.category_interest),'') end,
    nullif(trim(p_position),''),pr.dominant_foot,nullif(trim(p_jersey_number),''),pr.school_name,
    case when pr.photo_path is not null then 'tanneros-prospect-photos' else 'tanneros-private' end,
    pr.photo_path,p_joined_at,nullif(trim(pr.public_message),''),pr.id,
    pr.privacy_notice_version,pr.data_consent,pr.data_consent_at,pr.image_consent,pr.image_consent_at,now(),now()
  ) returning id into v_player;

  select g.id into v_guardian from app.guardians g
   where g.organization_id=p_organization_id and g.status='active' and g.phone=pr.phone
   order by g.created_at limit 1;
  if v_guardian is null then
    insert into app.guardians(organization_id,first_name,last_name,phone,email,relationship_default,status)
    values(p_organization_id,trim(pr.guardian_name),null,pr.phone,pr.email,'Tutor','active') returning id into v_guardian;
  end if;
  insert into app.player_guardians(player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing,organization_id)
  values(v_player,v_guardian,'Tutor',true,true,true,p_organization_id)
  on conflict do nothing;

  if p_category_id is not null then
    insert into app.player_enrollments(organization_id,player_id,category_id,starts_on,status,notes)
    values(p_organization_id,v_player,p_category_id,p_joined_at,'active','Alta desde prospecto')
    on conflict do nothing;
  end if;

  insert into app.billing_profiles(organization_id,player_id,base_monthly_fee,billing_start,billing_day,is_exempt,status,needs_review,review_reason)
  values(p_organization_id,v_player,v_fee,p_joined_at,1,(v_fee=0),'active',(p_monthly_fee is null),case when p_monthly_fee is null then 'Cuota pendiente de configurar al convertir prospecto' else null end);

  update app.prospects set status='converted',converted_player_id=v_player,updated_at=now() where id=pr.id;

  -- FIX: enlazar cualquier visoria de Scouting que apunte a este prospecto, para que
  -- "Fichado como jugador" y el KPI de Fichados dejen de estar permanentemente en cero.
  update app.scouting_reports
     set player_id=v_player, status='closed', updated_at=now()
   where organization_id=p_organization_id and prospect_id=pr.id and player_id is null;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectConvertedToPlayer','player',v_player,
    jsonb_build_object('prospectId',pr.id,'code',v_code,'categoryId',p_category_id,'monthlyFee',v_fee,'photoPreserved',pr.photo_path is not null,'privacyPreserved',pr.data_consent),
    coalesce((select auth.uid())::text,'system'));
  return v_player;
end $function$;

-- 2. Nueva funcion: fichar un jugador directo desde una visoria (con o sin prospecto
--    ligado). Si no hay prospecto, crea uno minimo con los datos ya capturados en la
--    visoria y delega TODA la logica de alta (jugador+tutor+inscripcion+cobranza+
--    deteccion de duplicados) a command_convert_prospect_to_player, para no duplicar
--    esa logica sensible en dos lugares.
create or replace function private.command_sign_scouting_report_to_player(
  p_organization_id uuid, p_report_id uuid, p_category_id uuid default null::uuid,
  p_monthly_fee numeric default null::numeric, p_joined_at date default current_date,
  p_jersey_number text default null::text, p_position text default null::text
) returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_report app.scouting_reports%rowtype;
  v_prospect_id uuid;
  v_player uuid;
  v_first text;
  v_last text;
  v_parts text[];
begin
  if not private.has_module_access(p_organization_id,'scouting',true)
     or not private.has_module_access(p_organization_id,'players',true)
  then raise exception 'Not authorized'; end if;

  select * into v_report from app.scouting_reports where id=p_report_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Scouting report not found'; end if;
  if v_report.player_id is not null then return v_report.player_id; end if;

  if v_report.prospect_id is not null then
    v_prospect_id:=v_report.prospect_id;
  else
    v_parts:=regexp_split_to_array(trim(coalesce(v_report.observed_name,'')),'\s+');
    v_first:=nullif(v_parts[1],'');
    v_last:=case when coalesce(array_length(v_parts,1),0)>1 then array_to_string(v_parts[2:array_length(v_parts,1)],' ') else null end;
    if coalesce(length(v_first),0)<2 then raise exception 'El nombre del jugador es muy corto para fichar'; end if;
    if v_report.birth_date is null then raise exception 'Falta la fecha de nacimiento para fichar'; end if;
    if coalesce(length(trim(coalesce(v_report.guardian_name,''))),0)<2 or coalesce(length(trim(coalesce(v_report.contact_phone,''))),0)<8 then
      raise exception 'Falta el contacto del tutor (nombre y teléfono) para fichar';
    end if;
    insert into app.prospects(organization_id,first_name,last_name,birth_date,phone,guardian_name,category_interest,source,registration_type,status)
    values(p_organization_id,v_first,v_last,v_report.birth_date,v_report.contact_phone,trim(v_report.guardian_name),v_report.category,'scouting',
           case when v_report.position ilike '%porter%' then 'goalkeeper' else 'player' end,'new')
    returning id into v_prospect_id;
    update app.scouting_reports set prospect_id=v_prospect_id, updated_at=now() where id=p_report_id and organization_id=p_organization_id;
  end if;

  v_player:=private.command_convert_prospect_to_player(p_organization_id,v_prospect_id,p_category_id,p_monthly_fee,p_joined_at,p_jersey_number,coalesce(nullif(trim(p_position),''),v_report.position));

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ScoutingReportSignedToPlayer','scouting_report',p_report_id,jsonb_build_object('playerId',v_player,'prospectId',v_prospect_id),coalesce((select auth.uid())::text,'system'));

  return v_player;
end
$function$;

create or replace function public.v2_sign_scouting_report_to_player(organization_id uuid, report_id uuid, category_id uuid default null::uuid, monthly_fee numeric default null::numeric, joined_at date default current_date, jersey_number text default null::text, player_position text default null::text)
 returns uuid
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select private.command_sign_scouting_report_to_player(organization_id,report_id,category_id,monthly_fee,joined_at,jersey_number,player_position) $function$;

revoke execute on function public.v2_sign_scouting_report_to_player(uuid, uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.v2_sign_scouting_report_to_player(uuid, uuid, uuid, numeric, date, text, text) to postgres, authenticated, service_role;

-- 3. query_scouting_reports / v2_scouting_reports: exponer quien detecto al jugador
--    (detected_by_user_id ya existia en la tabla, nunca se exponia) para el reporte de
--    conversion por scout.
drop function private.query_scouting_reports(uuid, uuid);

create function private.query_scouting_reports(p_organization_id uuid, p_prospect_id uuid default null::uuid)
 returns table(id uuid, prospect_id uuid, player_id uuid, observed_name text, observed_at timestamp with time zone, observed_location text, player_position text, category text, technical_score numeric, physical_score numeric, tactical_score numeric, mental_score numeric, star_quality text, verdict text, notes text, status text, created_at timestamp with time zone, contact_phone text, guardian_name text, birth_date date, interest_level text, next_action_at timestamp with time zone, source text, detected_by_user_id uuid, detected_by_name text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'scouting',false) then raise exception 'Not authorized'; end if;
  return query
  select s.id,s.prospect_id,s.player_id,s.observed_name,s.observed_at,s.observed_location,s.position,s.category,
         s.technical_score,s.physical_score,s.tactical_score,s.mental_score,s.star_quality,s.verdict,s.notes,s.status,s.created_at,
         coalesce(s.contact_phone,p.phone),coalesce(s.guardian_name,p.guardian_name),coalesce(s.birth_date,p.birth_date),s.interest_level,s.next_action_at,s.source,
         s.detected_by_user_id,pr.display_name
  from app.scouting_reports s
  left join app.prospects p on p.id=s.prospect_id and p.organization_id=s.organization_id
  left join public.profiles pr on pr.user_id=s.detected_by_user_id
  where s.organization_id=p_organization_id and (p_prospect_id is null or s.prospect_id=p_prospect_id)
  order by s.observed_at desc,s.id;
end
$function$;

grant execute on function private.query_scouting_reports(uuid, uuid) to postgres, authenticated, service_role;

drop function public.v2_scouting_reports(uuid, uuid);

create function public.v2_scouting_reports(organization_id uuid, prospect_id uuid default null::uuid)
 returns table(id uuid, prospect_id uuid, player_id uuid, observed_name text, observed_at timestamp with time zone, observed_location text, player_position text, category text, technical_score numeric, physical_score numeric, tactical_score numeric, mental_score numeric, star_quality text, verdict text, notes text, status text, created_at timestamp with time zone, contact_phone text, guardian_name text, birth_date date, interest_level text, next_action_at timestamp with time zone, source text, detected_by_user_id uuid, detected_by_name text)
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_scouting_reports(organization_id,prospect_id) $function$;

revoke execute on function public.v2_scouting_reports(uuid, uuid) from public, anon;
grant execute on function public.v2_scouting_reports(uuid, uuid) to postgres, authenticated, service_role;
;
