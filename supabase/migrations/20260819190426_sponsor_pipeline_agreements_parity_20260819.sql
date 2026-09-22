alter table app.sponsors add column if not exists tier text;
alter table app.sponsors add column if not exists relationship_type text;
alter table app.sponsors add column if not exists stage text;
alter table app.sponsors add column if not exists potential_value numeric;
alter table app.sponsors add column if not exists next_action text;
alter table app.sponsors add column if not exists next_action_at timestamptz;
do $$ begin if not exists(select 1 from pg_constraint where conname='sponsors_potential_value_check') then alter table app.sponsors add constraint sponsors_potential_value_check check(potential_value is null or potential_value>=0); end if; end $$;

create or replace function private.query_sponsors(p_organization_id uuid)
returns table(id uuid,name text,sponsor_type text,tier text,contact_name text,phone text,email text,status text,relationship_type text,stage text,potential_value numeric,next_action text,next_action_at timestamptz,notes text,active_agreements bigint,nearest_end date,renewal_state text,renewal_days integer)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
 if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;
 return query
 select s.id,s.name,s.sponsor_type,s.tier,s.contact_name,s.phone,s.email,s.status,s.relationship_type,s.stage,s.potential_value,s.next_action,s.next_action_at,s.notes,
   (select count(*) from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id and a.status='active') as active_agreements,
   x.nearest_end,
   case when x.nearest_end is null then 'none' when x.nearest_end<current_date then 'overdue' when x.nearest_end<=current_date+90 then 'soon' else 'ok' end as renewal_state,
   case when x.nearest_end is null then null else (x.nearest_end-current_date)::integer end as renewal_days
 from app.sponsors s
 left join lateral (select min(a.ends_on) nearest_end from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id and a.status='active' and a.ends_on is not null) x on true
 where s.organization_id=p_organization_id and s.archived_at is null order by case s.status when 'active' then 0 when 'negotiation' then 1 when 'prospect' then 2 else 3 end,s.name;
end $$;

create or replace function private.command_upsert_sponsor(p_organization_id uuid,p_sponsor_id uuid,p_name text,p_sponsor_type text,p_tier text,p_contact_name text,p_phone text,p_email text,p_status text,p_relationship_type text,p_stage text,p_potential_value numeric,p_next_action text,p_next_action_at timestamptz,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;v_phone text;
begin
 if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
 if coalesce(length(trim(p_name)),0)<2 then raise exception 'Sponsor name required'; end if;
 if p_status not in ('prospect','negotiation','active','inactive','lost','archived') then raise exception 'Invalid sponsor status'; end if;
 if p_potential_value is not null and p_potential_value<0 then raise exception 'Potential value cannot be negative'; end if;
 if p_phone is not null and trim(p_phone)<>'' then v_phone:=private.normalize_public_phone(p_phone); end if;
 if p_sponsor_id is null then
  insert into app.sponsors(organization_id,name,sponsor_type,tier,contact_name,phone,email,status,relationship_type,stage,potential_value,next_action,next_action_at,notes,created_at,updated_at)
  values(p_organization_id,trim(p_name),nullif(trim(p_sponsor_type),''),nullif(trim(p_tier),''),nullif(trim(p_contact_name),''),v_phone,nullif(lower(trim(p_email)),''),p_status,nullif(trim(p_relationship_type),''),nullif(trim(p_stage),''),p_potential_value,nullif(trim(p_next_action),''),p_next_action_at,nullif(trim(p_notes),''),now(),now()) returning id into v_id;
 else
  update app.sponsors set name=trim(p_name),sponsor_type=nullif(trim(p_sponsor_type),''),tier=nullif(trim(p_tier),''),contact_name=nullif(trim(p_contact_name),''),phone=v_phone,email=nullif(lower(trim(p_email)),''),status=p_status,relationship_type=nullif(trim(p_relationship_type),''),stage=nullif(trim(p_stage),''),potential_value=p_potential_value,next_action=nullif(trim(p_next_action),''),next_action_at=p_next_action_at,notes=nullif(trim(p_notes),''),updated_at=now(),archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end
  where id=p_sponsor_id and organization_id=p_organization_id returning id into v_id;
  if v_id is null then raise exception 'Sponsor not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function private.query_sponsor_agreements(p_organization_id uuid,p_sponsor_id uuid default null)
returns table(id uuid,sponsor_id uuid,sponsor_name text,starts_on date,ends_on date,monetary_value numeric,benefits_received jsonb,deliverables jsonb,status text,notes text)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
 if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;
 return query select a.id,a.sponsor_id,s.name,a.starts_on,a.ends_on,a.monetary_value,a.benefits_received,a.deliverables,a.status,a.notes
 from app.sponsor_agreements a join app.sponsors s on s.id=a.sponsor_id and s.organization_id=a.organization_id
 where a.organization_id=p_organization_id and (p_sponsor_id is null or a.sponsor_id=p_sponsor_id) order by a.starts_on desc nulls last,a.created_at desc;
end $$;

create or replace function private.command_upsert_sponsor_agreement(p_organization_id uuid,p_agreement_id uuid,p_sponsor_id uuid,p_starts_on date,p_ends_on date,p_monetary_value numeric,p_benefits_received jsonb,p_deliverables jsonb,p_status text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
 if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from app.sponsors where id=p_sponsor_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Sponsor not found'; end if;
 if p_starts_on is not null and p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'Agreement end cannot precede start'; end if;
 if p_monetary_value is not null and p_monetary_value<0 then raise exception 'Agreement value cannot be negative'; end if;
 if p_status not in ('draft','active','completed','cancelled') then raise exception 'Invalid agreement status'; end if;
 if p_agreement_id is null then
  insert into app.sponsor_agreements(organization_id,sponsor_id,starts_on,ends_on,monetary_value,benefits_received,deliverables,status,notes,created_at,updated_at)
  values(p_organization_id,p_sponsor_id,p_starts_on,p_ends_on,p_monetary_value,coalesce(p_benefits_received,'[]'::jsonb),coalesce(p_deliverables,'[]'::jsonb),p_status,nullif(trim(p_notes),''),now(),now()) returning id into v_id;
 else
  update app.sponsor_agreements set sponsor_id=p_sponsor_id,starts_on=p_starts_on,ends_on=p_ends_on,monetary_value=p_monetary_value,benefits_received=coalesce(p_benefits_received,'[]'::jsonb),deliverables=coalesce(p_deliverables,'[]'::jsonb),status=p_status,notes=nullif(trim(p_notes),''),updated_at=now()
  where id=p_agreement_id and organization_id=p_organization_id returning id into v_id;
  if v_id is null then raise exception 'Agreement not found'; end if;
 end if;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor) values(p_organization_id,'SponsorAgreementUpserted','sponsor_agreement',v_id,jsonb_build_object('sponsor_id',p_sponsor_id,'status',p_status,'starts_on',p_starts_on,'ends_on',p_ends_on,'monetary_value',p_monetary_value),coalesce((select auth.uid())::text,'system'));
 return v_id;
end $$;

create or replace function public.v2_sponsors(organization_id uuid) returns table(id uuid,name text,sponsor_type text,tier text,contact_name text,phone text,email text,status text,relationship_type text,stage text,potential_value numeric,next_action text,next_action_at timestamptz,notes text,active_agreements bigint,nearest_end date,renewal_state text,renewal_days integer) language sql security definer set search_path='pg_catalog','private' as $$select * from private.query_sponsors(organization_id)$$;
create or replace function public.v2_upsert_sponsor(organization_id uuid,sponsor_id uuid,name text,sponsor_type text,tier text,contact_name text,phone text,email text,status text,relationship_type text,stage text,potential_value numeric,next_action text,next_action_at timestamptz,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$select private.command_upsert_sponsor(organization_id,sponsor_id,name,sponsor_type,tier,contact_name,phone,email,status,relationship_type,stage,potential_value,next_action,next_action_at,notes)$$;
create or replace function public.v2_sponsor_agreements(organization_id uuid,sponsor_id uuid default null) returns table(id uuid,sponsor_id uuid,sponsor_name text,starts_on date,ends_on date,monetary_value numeric,benefits_received jsonb,deliverables jsonb,status text,notes text) language sql security definer set search_path='pg_catalog','private' as $$select * from private.query_sponsor_agreements(organization_id,sponsor_id)$$;
create or replace function public.v2_upsert_sponsor_agreement(organization_id uuid,agreement_id uuid,sponsor_id uuid,starts_on date,ends_on date,monetary_value numeric,benefits_received jsonb,deliverables jsonb,status text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$select private.command_upsert_sponsor_agreement(organization_id,agreement_id,sponsor_id,starts_on,ends_on,monetary_value,benefits_received,deliverables,status,notes)$$;
revoke all on function public.v2_sponsors(uuid) from public;revoke all on function public.v2_upsert_sponsor(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text) from public;revoke all on function public.v2_sponsor_agreements(uuid,uuid) from public;revoke all on function public.v2_upsert_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,jsonb,jsonb,text,text) from public;
grant execute on function public.v2_sponsors(uuid) to authenticated;grant execute on function public.v2_upsert_sponsor(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text) to authenticated;grant execute on function public.v2_sponsor_agreements(uuid,uuid) to authenticated;grant execute on function public.v2_upsert_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,jsonb,jsonb,text,text) to authenticated;
insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata) values
('SPONSOR-002','sponsors','Renewal watch','Active sponsor agreements ending in 90 days or less are flagged; expired agreements are overdue.','legacy',80,'command','active','pending','TannerOS v1 sponsorRenew','{}'),
('SPONSOR-003','sponsors','Agreement history','Renewals create separate agreements so prior rights, value and dates remain historical instead of being overwritten.','platform_safety',90,'database','active','pending','v2 normalized agreements','{}')
on conflict(rule_key) do update set description=excluded.description,enforcement=excluded.enforcement,status=excluded.status,updated_at=now();;
