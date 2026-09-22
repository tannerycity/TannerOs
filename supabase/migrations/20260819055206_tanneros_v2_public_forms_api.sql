create table if not exists private.public_request_log (
  id bigint generated always as identity primary key,
  action text not null,
  fingerprint text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_public_request_log_rate on private.public_request_log(action,fingerprint,occurred_at desc);
revoke all on private.public_request_log from public,anon,authenticated;

create table if not exists app.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null,
  year smallint not null,
  next_number integer not null default 1 check (next_number>0),
  primary key(organization_id,document_type,year)
);
alter table app.document_counters enable row level security;
revoke all on app.document_counters from anon,authenticated;
grant all on app.document_counters to service_role;

create or replace function private.request_fingerprint()
returns text
language sql
stable
security definer
set search_path=pg_catalog,extensions
as $$
  select encode(digest(
    coalesce(split_part(current_setting('request.headers',true)::json->>'x-forwarded-for',',',1),'unknown')||'|'||
    coalesce(current_setting('request.headers',true)::json->>'user-agent','unknown'),
    'sha256'),'hex')
$$;

create or replace function private.enforce_public_rate_limit(p_action text,p_max integer default 30,p_window interval default interval '1 hour')
returns void
language plpgsql
security definer
set search_path=pg_catalog,private
as $fn$
declare v_fp text; v_n integer;
begin
  v_fp:=private.request_fingerprint();
  select count(*) into v_n from private.public_request_log
  where action=p_action and fingerprint=v_fp and occurred_at>=now()-p_window;
  if v_n>=p_max then raise exception 'Too many requests. Try again later.'; end if;
  insert into private.public_request_log(action,fingerprint) values(p_action,v_fp);
end;
$fn$;

create or replace function private.public_organization(p_public_key text)
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select id from public.organizations where public_key=p_public_key and status='active' limit 1
$$;

create or replace function private.next_order_folio(p_org uuid)
returns text
language plpgsql
security definer
set search_path=pg_catalog,app
as $fn$
declare v_year smallint:=extract(year from current_date)::smallint; v_n integer;
begin
  insert into app.document_counters(organization_id,document_type,year,next_number)
  values(p_org,'order',v_year,2)
  on conflict(organization_id,document_type,year)
  do update set next_number=app.document_counters.next_number+1
  returning next_number-1 into v_n;
  return 'PED-'||v_year::text||'-'||lpad(v_n::text,5,'0');
end;
$fn$;

create or replace function private.public_products(p_public_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('catalog',120,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Catalog unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'sku',sku,'slug',slug,'name',name,'description',description,'type',product_type,'category',category,
    'price',price,'stock',stock,'sizes',sizes,'attributes',attributes,'leadDays',lead_days
  ) order by name),'[]'::jsonb) into v_data
  from app.products where organization_id=v_org and active=true and archived_at is null;
  return v_data;
end;
$fn$;

create or replace function private.public_programs(p_public_key text,p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('programs',120,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'programs') then raise exception 'Programs unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'slug',slug,'name',name,'type',program_type,'category',category_label,'description',description,
    'startsOn',starts_on,'endsOn',ends_on,'schedule',schedule,'location',location,'capacity',capacity,'fee',fee,'status',status
  ) order by coalesce(starts_on,current_date),name),'[]'::jsonb) into v_data
  from app.programs
  where organization_id=v_org and public_registration_enabled=true and status in ('published','active') and archived_at is null
    and (p_slug is null or slug=p_slug);
  return v_data;
end;
$fn$;

create or replace function private.public_register_prospect(
  p_public_key text,p_first_name text,p_last_name text,p_birth_date date,p_phone text,p_email text,
  p_guardian_name text,p_category_interest text,p_source_campaign text,p_consent jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_org uuid; v_id uuid;
begin
  perform private.enforce_public_rate_limit('register',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'prospects') then raise exception 'Registration unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if coalesce(length(trim(p_phone)),0)<7 and coalesce(length(trim(p_email)),0)<5 then raise exception 'Phone or email required'; end if;
  insert into app.prospects(organization_id,first_name,last_name,birth_date,phone,email,guardian_name,source,source_campaign,interest_type,category_interest,status,notes,created_at,updated_at)
  values(v_org,trim(p_first_name),nullif(trim(p_last_name),''),p_birth_date,nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),nullif(trim(p_guardian_name),''),'public_form',nullif(trim(p_source_campaign),''),'academy',nullif(trim(p_category_interest),''),'new',case when p_consent='{}'::jsonb then null else 'Consent captured in public form' end,now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object('source','public_form','campaign',p_source_campaign,'consent',p_consent));
  return v_id;
end;
$fn$;

create or replace function private.public_create_order(
  p_public_key text,p_customer_name text,p_customer_phone text,p_customer_email text,p_items jsonb,p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_org uuid; v_order uuid; v_folio text; v_subtotal numeric:=0; r record; v_qty integer; v_attrs jsonb;
begin
  perform private.enforce_public_rate_limit('order',15,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Ordering unavailable'; end if;
  if coalesce(length(trim(p_customer_name)),0)<2 then raise exception 'Customer name required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>20 then raise exception 'Invalid items'; end if;
  v_folio:=private.next_order_folio(v_org);
  insert into app.orders(organization_id,folio,customer_name,customer_phone,customer_email,subtotal,discount,total,status,source,notes,created_at,updated_at)
  values(v_org,v_folio,trim(p_customer_name),nullif(trim(p_customer_phone),''),nullif(lower(trim(p_customer_email)),''),0,0,0,'pending_payment','public_form',p_notes,now(),now())
  returning id into v_order;
  for r in select value as item from jsonb_array_elements(p_items)
  loop
    v_qty:=greatest(1,least(99,coalesce((r.item->>'quantity')::integer,1)));
    v_attrs:=coalesce(r.item->'attributes','{}'::jsonb);
    insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
    select v_org,v_order,p.id,p.name,v_qty,p.price,p.cost,v_attrs
    from app.products p
    where p.id=(r.item->>'productId')::uuid and p.organization_id=v_org and p.active=true and p.archived_at is null;
    if not found then raise exception 'Invalid product'; end if;
  end loop;
  select coalesce(sum(quantity*unit_price),0) into v_subtotal from app.order_items where order_id=v_order;
  update app.orders set subtotal=v_subtotal,total=v_subtotal,updated_at=now() where id=v_order;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'OrderCreated','order',v_order,jsonb_build_object('folio',v_folio,'total',v_subtotal,'source','public_form'));
  return jsonb_build_object('id',v_order,'folio',v_folio,'total',v_subtotal);
end;
$fn$;

create or replace function private.public_enroll_program(
  p_public_key text,p_program_slug text,p_first_name text,p_last_name text,p_phone text,p_email text,p_birth_date date,p_consent jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_org uuid; v_program app.programs%rowtype; v_id uuid; v_current integer; v_status text:='registered';
begin
  perform private.enforce_public_rate_limit('program_enrollment',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'programs') then raise exception 'Enrollment unavailable'; end if;
  select * into v_program from app.programs
  where organization_id=v_org and slug=p_program_slug and public_registration_enabled=true and status in ('published','active') and archived_at is null
  for update;
  if not found then raise exception 'Program unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  select count(*) into v_current from app.program_enrollments where program_id=v_program.id and status in ('registered','confirmed');
  if v_program.capacity is not null and v_current>=v_program.capacity then v_status:='waitlisted'; end if;
  insert into app.program_enrollments(organization_id,program_id,participant_first_name,participant_last_name,phone,email,birth_date,status,payment_status,consent,created_at,updated_at)
  values(v_org,v_program.id,trim(p_first_name),nullif(trim(p_last_name),''),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),p_birth_date,v_status,'pending',coalesce(p_consent,'{}'::jsonb),now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProgramEnrollmentCreated','program_enrollment',v_id,jsonb_build_object('program_id',v_program.id,'status',v_status,'source','public_form'));
  return jsonb_build_object('id',v_id,'status',v_status,'program',v_program.name);
end;
$fn$;

revoke all on function private.request_fingerprint() from public,anon,authenticated;
revoke all on function private.enforce_public_rate_limit(text,integer,interval) from public,anon,authenticated;
revoke all on function private.public_organization(text) from public,anon,authenticated;
revoke all on function private.next_order_folio(uuid) from public,anon,authenticated;
revoke all on function private.public_products(text) from public,anon,authenticated;
revoke all on function private.public_programs(text,text) from public,anon,authenticated;
revoke all on function private.public_register_prospect(text,text,text,date,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.public_create_order(text,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.public_enroll_program(text,text,text,text,text,text,date,jsonb) from public,anon,authenticated;

create or replace function public.v2_public_products(club_key text)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.public_products(club_key) $$;
create or replace function public.v2_public_programs(club_key text,program_slug text default null)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.public_programs(club_key,program_slug) $$;
create or replace function public.v2_public_register(club_key text,first_name text,last_name text default null,birth_date date default null,phone text default null,email text default null,guardian_name text default null,category_interest text default null,source_campaign text default null,consent jsonb default '{}'::jsonb)
returns uuid language sql security invoker set search_path=pg_catalog,private
as $$ select private.public_register_prospect(club_key,first_name,last_name,birth_date,phone,email,guardian_name,category_interest,source_campaign,consent) $$;
create or replace function public.v2_public_order(club_key text,customer_name text,customer_phone text,customer_email text,items jsonb,notes text default null)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.public_create_order(club_key,customer_name,customer_phone,customer_email,items,notes) $$;
create or replace function public.v2_public_program_enroll(club_key text,program_slug text,first_name text,last_name text,phone text,email text,birth_date date,consent jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.public_enroll_program(club_key,program_slug,first_name,last_name,phone,email,birth_date,consent) $$;

revoke all on function public.v2_public_products(text) from public;
revoke all on function public.v2_public_programs(text,text) from public;
revoke all on function public.v2_public_register(text,text,text,date,text,text,text,text,text,jsonb) from public;
revoke all on function public.v2_public_order(text,text,text,text,jsonb,text) from public;
revoke all on function public.v2_public_program_enroll(text,text,text,text,text,text,date,jsonb) from public;
grant execute on function public.v2_public_products(text) to anon,authenticated;
grant execute on function public.v2_public_programs(text,text) to anon,authenticated;
grant execute on function public.v2_public_register(text,text,text,date,text,text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.v2_public_order(text,text,text,text,jsonb,text) to anon,authenticated;
grant execute on function public.v2_public_program_enroll(text,text,text,text,text,text,date,jsonb) to anon,authenticated;;
