create table if not exists app.goalkeeper_packages(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id) on delete cascade,
  academy_id uuid references app.academies(id) on delete set null,player_id uuid not null references app.players(id) on delete cascade,
  classes_total integer not null check(classes_total>0),price numeric not null check(price>0),purchased_on date not null,
  expires_on date,status text not null default 'active' check(status in ('active','cancelled')),
  payment_id uuid references app.payments(id) on delete set null,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  constraint goalkeeper_packages_dates_check check(expires_on is null or expires_on>=purchased_on),unique(id,organization_id)
);
create table if not exists app.goalkeeper_sessions(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id) on delete cascade,
  academy_id uuid references app.academies(id) on delete set null,player_id uuid not null references app.players(id) on delete cascade,
  package_id uuid references app.goalkeeper_packages(id) on delete set null,session_date date not null,start_time time,
  hours numeric not null default 1 check(hours>0 and hours<=12),rate numeric check(rate is null or rate>=0),amount numeric not null default 0 check(amount>=0),
  status text not null default 'completed' check(status in ('completed','cancelled')),payment_id uuid references app.payments(id) on delete set null,
  notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id),
  constraint goalkeeper_package_session_amount_check check(package_id is null or amount=0)
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='fk_gk_package_player_org') then alter table app.goalkeeper_packages add constraint fk_gk_package_player_org foreign key(player_id,organization_id) references app.players(id,organization_id) on delete cascade; end if;
 if not exists(select 1 from pg_constraint where conname='fk_gk_package_academy_org') then alter table app.goalkeeper_packages add constraint fk_gk_package_academy_org foreign key(academy_id,organization_id) references app.academies(id,organization_id) on delete set null; end if;
 if not exists(select 1 from pg_constraint where conname='fk_gk_session_player_org') then alter table app.goalkeeper_sessions add constraint fk_gk_session_player_org foreign key(player_id,organization_id) references app.players(id,organization_id) on delete cascade; end if;
 if not exists(select 1 from pg_constraint where conname='fk_gk_session_academy_org') then alter table app.goalkeeper_sessions add constraint fk_gk_session_academy_org foreign key(academy_id,organization_id) references app.academies(id,organization_id) on delete set null; end if;
 if not exists(select 1 from pg_constraint where conname='fk_gk_session_package_org') then alter table app.goalkeeper_sessions add constraint fk_gk_session_package_org foreign key(package_id,organization_id) references app.goalkeeper_packages(id,organization_id) on delete set null; end if;
end $$;
alter table app.goalkeeper_packages enable row level security;alter table app.goalkeeper_sessions enable row level security;
revoke all on app.goalkeeper_packages from anon,authenticated;revoke all on app.goalkeeper_sessions from anon,authenticated;
create index if not exists idx_gk_packages_player_active on app.goalkeeper_packages(organization_id,player_id,status,expires_on);
create index if not exists idx_gk_sessions_player_date on app.goalkeeper_sessions(organization_id,player_id,session_date desc);
create index if not exists idx_gk_sessions_package on app.goalkeeper_sessions(package_id,status);

create or replace function private.query_goalkeeper_packages(p_organization_id uuid,p_player_id uuid default null)
returns table(id uuid,academy_id uuid,player_id uuid,player_name text,classes_total integer,classes_used bigint,classes_remaining bigint,price numeric,purchased_on date,expires_on date,status text,is_expired boolean,is_active boolean,price_per_class numeric,notes text)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
 if not private.has_module_access(p_organization_id,'academies',false) then raise exception 'Not authorized'; end if;
 return query
 select gp.id,gp.academy_id,gp.player_id,concat_ws(' ',p.first_name,p.last_name),gp.classes_total,
   (select count(*) from app.goalkeeper_sessions s where s.organization_id=gp.organization_id and s.package_id=gp.id and s.status<>'cancelled') as used,
   greatest(0,gp.classes_total-(select count(*) from app.goalkeeper_sessions s where s.organization_id=gp.organization_id and s.package_id=gp.id and s.status<>'cancelled'))::bigint as remaining,
   gp.price,gp.purchased_on,gp.expires_on,gp.status,(gp.expires_on is not null and gp.expires_on<current_date) as expired,
   (gp.status='active' and (gp.expires_on is null or gp.expires_on>=current_date) and gp.classes_total>(select count(*) from app.goalkeeper_sessions s where s.organization_id=gp.organization_id and s.package_id=gp.id and s.status<>'cancelled')) as active,
   round(gp.price/gp.classes_total,2),gp.notes
 from app.goalkeeper_packages gp join app.players p on p.id=gp.player_id and p.organization_id=gp.organization_id
 where gp.organization_id=p_organization_id and (p_player_id is null or gp.player_id=p_player_id)
 order by gp.purchased_on desc,gp.id;
end $$;

create or replace function private.query_goalkeeper_sessions(p_organization_id uuid,p_player_id uuid default null)
returns table(id uuid,academy_id uuid,player_id uuid,player_name text,package_id uuid,session_date date,start_time time,hours numeric,rate numeric,amount numeric,status text,payment_id uuid,notes text)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
 if not private.has_module_access(p_organization_id,'academies',false) then raise exception 'Not authorized'; end if;
 return query select s.id,s.academy_id,s.player_id,concat_ws(' ',p.first_name,p.last_name),s.package_id,s.session_date,s.start_time,s.hours,s.rate,s.amount,s.status,s.payment_id,s.notes
 from app.goalkeeper_sessions s join app.players p on p.id=s.player_id and p.organization_id=s.organization_id
 where s.organization_id=p_organization_id and (p_player_id is null or s.player_id=p_player_id) order by s.session_date desc,s.created_at desc;
end $$;

create or replace function private.command_purchase_goalkeeper_package(p_organization_id uuid,p_academy_id uuid,p_player_id uuid,p_classes integer,p_price numeric,p_purchased_on date,p_expires_on date,p_method text,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;v_payment uuid;v_name text;
begin
 if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
 if coalesce(p_classes,0)<=0 then raise exception 'Package classes must be greater than zero'; end if;
 if coalesce(p_price,0)<=0 then raise exception 'Package price must be greater than zero'; end if;
 if p_expires_on is not null and p_expires_on<coalesce(p_purchased_on,current_date) then raise exception 'Package expiration cannot precede purchase'; end if;
 select concat_ws(' ',first_name,last_name) into v_name from app.players where id=p_player_id and organization_id=p_organization_id and status='active' and archived_at is null;
 if v_name is null then raise exception 'Player unavailable'; end if;
 if p_academy_id is not null and not exists(select 1 from app.academies where id=p_academy_id and organization_id=p_organization_id and status='active' and archived_at is null) then raise exception 'Academy unavailable'; end if;
 insert into app.goalkeeper_packages(organization_id,academy_id,player_id,classes_total,price,purchased_on,expires_on,status,notes)
 values(p_organization_id,p_academy_id,p_player_id,p_classes,p_price,coalesce(p_purchased_on,current_date),p_expires_on,'active',nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
 insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payer_name,payment_purpose,credit_status,allocation_note,created_at,updated_at)
 values(p_organization_id,p_player_id,p_price,coalesce(p_purchased_on,current_date),coalesce(nullif(trim(p_method),''),'cash'),nullif(trim(p_reference),''),'Paquete de '||p_classes||' clases de portero · '||v_name,'posted','tanneros_v2','Academia Porteros','gk-package:'||v_id,'guardian',null,'other','not_applicable','Ingreso por paquete prepagado de portero',now(),now()) returning id into v_payment;
 update app.goalkeeper_packages set payment_id=v_payment where id=v_id;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor) values(p_organization_id,'GoalkeeperPackagePurchased','goalkeeper_package',v_id,jsonb_build_object('player_id',p_player_id,'classes',p_classes,'price',p_price,'payment_id',v_payment),coalesce((select auth.uid())::text,'system'));
 return v_id;
end $$;

create or replace function private.command_add_goalkeeper_session(p_organization_id uuid,p_academy_id uuid,p_player_id uuid,p_session_date date,p_start_time time,p_hours numeric,p_rate numeric,p_package_id uuid,p_force_loose boolean,p_method text,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_pkg uuid:=p_package_id;v_hours numeric:=coalesce(p_hours,1);v_rate numeric;v_amount numeric:=0;v_id uuid;v_payment uuid;v_name text;v_total int;v_used int;v_exp date;v_pkg_status text;
begin
 if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
 if v_hours<=0 or v_hours>12 then raise exception 'Invalid session duration'; end if;
 select concat_ws(' ',first_name,last_name) into v_name from app.players where id=p_player_id and organization_id=p_organization_id and status='active' and archived_at is null;
 if v_name is null then raise exception 'Player unavailable'; end if;
 if v_pkg is null and not coalesce(p_force_loose,false) then
   select gp.id into v_pkg from app.goalkeeper_packages gp
   where gp.organization_id=p_organization_id and gp.player_id=p_player_id and gp.status='active' and (gp.expires_on is null or gp.expires_on>=coalesce(p_session_date,current_date))
     and gp.classes_total>(select count(*) from app.goalkeeper_sessions s where s.package_id=gp.id and s.status<>'cancelled')
   order by gp.expires_on nulls last,gp.purchased_on,gp.id limit 1 for update;
 end if;
 if v_pkg is not null then
   select classes_total,expires_on,status into v_total,v_exp,v_pkg_status from app.goalkeeper_packages where id=v_pkg and organization_id=p_organization_id and player_id=p_player_id for update;
   if not found or v_pkg_status<>'active' then raise exception 'Package unavailable'; end if;
   if v_exp is not null and v_exp<coalesce(p_session_date,current_date) then raise exception 'Package expired'; end if;
   select count(*) into v_used from app.goalkeeper_sessions where package_id=v_pkg and status<>'cancelled';
   if v_used>=v_total then raise exception 'Package has no remaining classes'; end if;
   v_amount:=0;v_rate:=null;
 else
   v_rate:=p_rate;
   if (v_rate is null or v_rate<=0) and p_academy_id is not null then select hourly_rate into v_rate from app.academies where id=p_academy_id and organization_id=p_organization_id; end if;
   if v_rate is null or v_rate<=0 then raise exception 'Rate required for loose session'; end if;
   v_amount:=round(v_hours*v_rate,2);
 end if;
 insert into app.goalkeeper_sessions(organization_id,academy_id,player_id,package_id,session_date,start_time,hours,rate,amount,status,notes)
 values(p_organization_id,p_academy_id,p_player_id,v_pkg,coalesce(p_session_date,current_date),p_start_time,v_hours,v_rate,v_amount,'completed',nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
 if v_pkg is null and v_amount>0 then
   insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payment_purpose,credit_status,allocation_note,created_at,updated_at)
   values(p_organization_id,p_player_id,v_amount,coalesce(p_session_date,current_date),coalesce(nullif(trim(p_method),''),'cash'),nullif(trim(p_reference),''),'Clase personalizada de portero · '||v_name,'posted','tanneros_v2','Academia Porteros','gk-session:'||v_id,'guardian','other','not_applicable','Ingreso por clase suelta de portero',now(),now()) returning id into v_payment;
   update app.goalkeeper_sessions set payment_id=v_payment where id=v_id;
 end if;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor) values(p_organization_id,'GoalkeeperSessionCompleted','goalkeeper_session',v_id,jsonb_build_object('player_id',p_player_id,'package_id',v_pkg,'amount',v_amount,'payment_id',v_payment),coalesce((select auth.uid())::text,'system'));
 return v_id;
end $$;

create or replace function private.command_cancel_goalkeeper_session(p_organization_id uuid,p_session_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_payment uuid;
begin
 if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
 select payment_id into v_payment from app.goalkeeper_sessions where id=p_session_id and organization_id=p_organization_id and status='completed' for update;
 if not found then raise exception 'Completed session not found'; end if;
 update app.goalkeeper_sessions set status='cancelled',notes=concat_ws(E'\n',notes,'Cancelada: '||coalesce(nullif(trim(p_reason),''),'Sin motivo')),updated_at=now() where id=p_session_id;
 if v_payment is not null then update app.payments set status='void',notes=concat_ws(E'\n',notes,'Anulado por cancelación de clase de portero'),updated_at=now() where id=v_payment and organization_id=p_organization_id and status='posted'; end if;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor) values(p_organization_id,'GoalkeeperSessionCancelled','goalkeeper_session',p_session_id,jsonb_build_object('payment_voided',v_payment,'reason',p_reason),coalesce((select auth.uid())::text,'system'));
end $$;

create or replace function public.v2_goalkeeper_packages(organization_id uuid,player_id uuid default null) returns table(id uuid,academy_id uuid,player_id uuid,player_name text,classes_total integer,classes_used bigint,classes_remaining bigint,price numeric,purchased_on date,expires_on date,status text,is_expired boolean,is_active boolean,price_per_class numeric,notes text) language sql security definer set search_path='pg_catalog','private' as $$select * from private.query_goalkeeper_packages(organization_id,player_id)$$;
create or replace function public.v2_goalkeeper_sessions(organization_id uuid,player_id uuid default null) returns table(id uuid,academy_id uuid,player_id uuid,player_name text,package_id uuid,session_date date,start_time time,hours numeric,rate numeric,amount numeric,status text,payment_id uuid,notes text) language sql security definer set search_path='pg_catalog','private' as $$select * from private.query_goalkeeper_sessions(organization_id,player_id)$$;
create or replace function public.v2_purchase_goalkeeper_package(organization_id uuid,academy_id uuid,player_id uuid,classes integer,price numeric,purchased_on date,expires_on date,method text,reference text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$select private.command_purchase_goalkeeper_package(organization_id,academy_id,player_id,classes,price,purchased_on,expires_on,method,reference,notes)$$;
create or replace function public.v2_add_goalkeeper_session(organization_id uuid,academy_id uuid,player_id uuid,session_date date,start_time time,hours numeric,rate numeric,package_id uuid,force_loose boolean,method text,reference text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$select private.command_add_goalkeeper_session(organization_id,academy_id,player_id,session_date,start_time,hours,rate,package_id,force_loose,method,reference,notes)$$;
create or replace function public.v2_cancel_goalkeeper_session(organization_id uuid,session_id uuid,reason text) returns void language sql security definer set search_path='pg_catalog','private' as $$select private.command_cancel_goalkeeper_session(organization_id,session_id,reason)$$;
revoke all on function public.v2_goalkeeper_packages(uuid,uuid) from public;revoke all on function public.v2_goalkeeper_sessions(uuid,uuid) from public;revoke all on function public.v2_purchase_goalkeeper_package(uuid,uuid,uuid,integer,numeric,date,date,text,text,text) from public;revoke all on function public.v2_add_goalkeeper_session(uuid,uuid,uuid,date,time,numeric,numeric,uuid,boolean,text,text,text) from public;revoke all on function public.v2_cancel_goalkeeper_session(uuid,uuid,text) from public;
grant execute on function public.v2_goalkeeper_packages(uuid,uuid) to authenticated;grant execute on function public.v2_goalkeeper_sessions(uuid,uuid) to authenticated;grant execute on function public.v2_purchase_goalkeeper_package(uuid,uuid,uuid,integer,numeric,date,date,text,text,text) to authenticated;grant execute on function public.v2_add_goalkeeper_session(uuid,uuid,uuid,date,time,numeric,numeric,uuid,boolean,text,text,text) to authenticated;grant execute on function public.v2_cancel_goalkeeper_session(uuid,uuid,text) to authenticated;
update app.business_rule_catalog set enforcement='command',test_status='pending',updated_at=now() where rule_key in ('GK-001','GK-002');
insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata) values
('GK-003','goalkeeper','Loose session income','A completed loose goalkeeper session creates a non-credit income payment equal to hours × rate.','legacy',80,'command','active','pending','TannerOS v1 gkAddSession','{}'),
('GK-004','goalkeeper','Cancelled session reverses consumption/income','Cancelled package sessions no longer consume a class; a loose-session payment is voided so no phantom income remains.','legacy',80,'command','active','pending','TannerOS v1 gkDeleteSession','{}')
on conflict(rule_key) do update set description=excluded.description,enforcement=excluded.enforcement,status=excluded.status,updated_at=now();;
