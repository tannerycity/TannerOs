create or replace function private.query_sponsor_admin(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
declare v_sponsors jsonb; v_agreements jsonb; v_assets jsonb;
begin
  if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'sponsorType',s.sponsor_type,'contactName',s.contact_name,'phone',s.phone,'email',s.email,
    'status',s.status,'tier',s.tier,'relationshipType',s.relationship_type,'stage',s.stage,'potentialValue',s.potential_value,
    'nextAction',s.next_action,'nextActionAt',s.next_action_at,'notes',s.notes,'archivedAt',s.archived_at,'legacyId',s.legacy_id,
    'createdAt',s.created_at,'updatedAt',s.updated_at,
    'activeAgreementCount',(select count(*) from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id and a.status='active'),
    'agreementCount',(select count(*) from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id)
  ) order by (s.status='archived'),coalesce(s.next_action_at,'9999-12-31'::timestamptz),s.name),'[]'::jsonb)
  into v_sponsors from app.sponsors s where s.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'sponsorId',a.sponsor_id,'startsOn',a.starts_on,'endsOn',a.ends_on,'monetaryValue',a.monetary_value,
    'benefitsReceived',a.benefits_received,'deliverables',a.deliverables,'status',a.status,'notes',a.notes,
    'legacyId',a.legacy_id,'createdAt',a.created_at,'updatedAt',a.updated_at
  ) order by a.created_at desc),'[]'::jsonb)
  into v_agreements from app.sponsor_agreements a where a.organization_id=p_organization_id;

  select coalesce(jsonb_agg(to_jsonb(sa) order by sa.created_at desc),'[]'::jsonb)
  into v_assets from app.sponsor_assets sa where sa.organization_id=p_organization_id;
  return jsonb_build_object('sponsors',v_sponsors,'agreements',v_agreements,'assets',v_assets);
end
$$;

create or replace function private.command_upsert_sponsor_admin(
  p_organization_id uuid,p_sponsor_id uuid,p_name text,p_sponsor_type text,p_contact_name text,p_phone text,p_email text,
  p_status text,p_tier text,p_relationship_type text,p_stage text,p_potential_value numeric,p_next_action text,p_next_action_at timestamptz,p_notes text
) returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid; v_phone text;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Sponsor name required'; end if;
  if p_status not in ('prospect','negotiation','active','archived') then raise exception 'Invalid sponsor status'; end if;
  if p_potential_value is not null and p_potential_value<0 then raise exception 'Potential value cannot be negative'; end if;
  v_phone:=case when nullif(trim(coalesce(p_phone,'')),'') is null then null else private.normalize_legacy_phone_safe(p_phone) end;
  if nullif(trim(coalesce(p_phone,'')),'') is not null and v_phone is null then raise exception 'Invalid sponsor phone'; end if;

  if p_sponsor_id is null then
    insert into app.sponsors(organization_id,name,sponsor_type,contact_name,phone,email,status,tier,relationship_type,stage,potential_value,next_action,next_action_at,notes,created_at,updated_at,archived_at,metadata)
    values(p_organization_id,trim(p_name),nullif(trim(p_sponsor_type),''),nullif(trim(p_contact_name),''),v_phone,nullif(lower(trim(p_email)),''),p_status,nullif(trim(p_tier),''),nullif(trim(p_relationship_type),''),nullif(trim(p_stage),''),p_potential_value,nullif(trim(p_next_action),''),p_next_action_at,nullif(trim(p_notes),''),now(),now(),case when p_status='archived' then now() else null end,'{}'::jsonb)
    returning id into v_id;
  else
    update app.sponsors set name=trim(p_name),sponsor_type=nullif(trim(p_sponsor_type),''),contact_name=nullif(trim(p_contact_name),''),phone=v_phone,email=nullif(lower(trim(p_email)),''),status=p_status,tier=nullif(trim(p_tier),''),relationship_type=nullif(trim(p_relationship_type),''),stage=nullif(trim(p_stage),''),potential_value=p_potential_value,next_action=nullif(trim(p_next_action),''),next_action_at=p_next_action_at,notes=nullif(trim(p_notes),''),archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end,updated_at=now()
    where id=p_sponsor_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Sponsor not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,case when p_sponsor_id is null then 'SponsorCreated' else 'SponsorUpdated' end,'sponsor',v_id,jsonb_build_object('status',p_status,'stage',nullif(trim(p_stage),''),'potentialValue',p_potential_value),coalesce((select auth.uid())::text,'system'));
  return v_id;
end
$$;

create or replace function private.command_upsert_sponsor_agreement_admin(
  p_organization_id uuid,p_agreement_id uuid,p_sponsor_id uuid,p_starts_on date,p_ends_on date,p_monetary_value numeric,
  p_benefits_received jsonb,p_deliverables jsonb,p_status text,p_notes text
) returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.sponsors s where s.id=p_sponsor_id and s.organization_id=p_organization_id) then raise exception 'Sponsor not found'; end if;
  if p_status not in ('draft','active','completed') then raise exception 'Invalid agreement status'; end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on<p_starts_on then raise exception 'Agreement end cannot precede start'; end if;
  if p_monetary_value is not null and p_monetary_value<0 then raise exception 'Agreement value cannot be negative'; end if;
  if p_agreement_id is null then
    insert into app.sponsor_agreements(organization_id,sponsor_id,starts_on,ends_on,monetary_value,benefits_received,deliverables,status,notes,created_at,updated_at,metadata)
    values(p_organization_id,p_sponsor_id,p_starts_on,p_ends_on,p_monetary_value,coalesce(p_benefits_received,'[]'::jsonb),coalesce(p_deliverables,'[]'::jsonb),p_status,nullif(trim(p_notes),''),now(),now(),'{}'::jsonb)
    returning id into v_id;
  else
    update app.sponsor_agreements set sponsor_id=p_sponsor_id,starts_on=p_starts_on,ends_on=p_ends_on,monetary_value=p_monetary_value,benefits_received=coalesce(p_benefits_received,'[]'::jsonb),deliverables=coalesce(p_deliverables,'[]'::jsonb),status=p_status,notes=nullif(trim(p_notes),''),updated_at=now()
    where id=p_agreement_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Agreement not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,case when p_agreement_id is null then 'SponsorAgreementCreated' else 'SponsorAgreementUpdated' end,'sponsor_agreement',v_id,jsonb_build_object('sponsorId',p_sponsor_id,'status',p_status,'monetaryValue',p_monetary_value),coalesce((select auth.uid())::text,'system'));
  return v_id;
end
$$;

create or replace function public.v2_sponsor_admin(organization_id uuid)
returns jsonb language sql stable security definer set search_path='pg_catalog','private'
as $$ select private.query_sponsor_admin(organization_id) $$;
create or replace function public.v2_upsert_sponsor_admin(organization_id uuid,sponsor_id uuid,name text,sponsor_type text,contact_name text,phone text,email text,status text,tier text,relationship_type text,stage text,potential_value numeric,next_action text,next_action_at timestamptz,notes text)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_upsert_sponsor_admin(organization_id,sponsor_id,name,sponsor_type,contact_name,phone,email,status,tier,relationship_type,stage,potential_value,next_action,next_action_at,notes) $$;
create or replace function public.v2_upsert_sponsor_agreement_admin(organization_id uuid,agreement_id uuid,sponsor_id uuid,starts_on date,ends_on date,monetary_value numeric,benefits_received jsonb,deliverables jsonb,status text,notes text)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_upsert_sponsor_agreement_admin(organization_id,agreement_id,sponsor_id,starts_on,ends_on,monetary_value,benefits_received,deliverables,status,notes) $$;

revoke all on function public.v2_sponsor_admin(uuid) from public,anon;
revoke all on function public.v2_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text) from public,anon;
revoke all on function public.v2_upsert_sponsor_agreement_admin(uuid,uuid,uuid,date,date,numeric,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.v2_sponsor_admin(uuid) to authenticated;
grant execute on function public.v2_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text) to authenticated;
grant execute on function public.v2_upsert_sponsor_agreement_admin(uuid,uuid,uuid,date,date,numeric,jsonb,jsonb,text,text) to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('SPONSOR-004','sponsors','Sponsor pipeline writes use commands','Authenticated clients cannot mutate canonical sponsor pipeline records directly; create/update uses sponsors-module commands with canonical phone and nonnegative values.','platform_safety',100,'command','active','pending','private.command_upsert_sponsor_admin','{}'),
('SPONSOR-005','sponsors','Agreement chronology and value','Sponsor agreements preserve start/end chronology, nonnegative monetary value, benefits and deliverables.','legacy',80,'command','active','pending','private.command_upsert_sponsor_agreement_admin','{}')
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
