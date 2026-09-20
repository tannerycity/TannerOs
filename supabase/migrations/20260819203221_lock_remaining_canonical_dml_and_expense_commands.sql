alter table app.expenses add column if not exists idempotency_key text;
alter table app.expenses add column if not exists voided_at timestamptz;
alter table app.expenses add column if not exists void_reason text;
create unique index if not exists app_expenses_org_idempotency_uidx on app.expenses(organization_id,idempotency_key) where idempotency_key is not null;

create or replace function private.query_expenses(p_organization_id uuid,p_period date default null)
returns table(id uuid,amount numeric,expense_date date,category text,method text,reference text,concept text,status text,source text,metadata jsonb,created_at timestamptz,voided_at timestamptz,void_reason text)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'accounting',false) then raise exception 'Not authorized'; end if;
  return query
  select e.id,e.amount,e.expense_date,e.category,e.method,e.reference,e.concept,e.status,e.source,e.metadata,e.created_at,e.voided_at,e.void_reason
  from app.expenses e
  where e.organization_id=p_organization_id
    and (p_period is null or date_trunc('month',e.expense_date)::date=date_trunc('month',p_period)::date)
  order by e.expense_date desc,e.created_at desc;
end
$$;

create or replace function private.command_post_expense(
  p_organization_id uuid,p_amount numeric,p_expense_date date,p_category text,p_method text,p_reference text,p_concept text,p_metadata jsonb,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid; v_actor uuid:=(select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'accounting',true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  if nullif(trim(coalesce(p_category,'')),'') is null then raise exception 'Expense category required'; end if;
  if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Expense concept required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.expenses(organization_id,amount,expense_date,category,method,reference,concept,status,source,metadata,idempotency_key,created_at,updated_at)
  values(p_organization_id,p_amount,coalesce(p_expense_date,current_date),trim(p_category),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),trim(p_concept),'posted','tanneros_v2',coalesce(p_metadata,'{}'::jsonb),trim(p_idempotency_key),now(),now()) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'ExpensePosted','expense',v_id,jsonb_build_object('amount',p_amount,'category',trim(p_category),'expenseDate',coalesce(p_expense_date,current_date)),v_actor,trim(p_idempotency_key));
  return v_id;
exception when unique_violation then
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is null then raise; end if;
  return v_id;
end
$$;

create or replace function private.command_void_expense(p_organization_id uuid,p_expense_id uuid,p_reason text)
returns void
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v app.expenses%rowtype; v_actor uuid:=(select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'accounting',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Void reason required'; end if;
  select * into v from app.expenses where id=p_expense_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v.status<>'posted' then raise exception 'Only posted expenses can be voided'; end if;
  update app.expenses set status='void',voided_at=now(),void_reason=trim(p_reason),updated_at=now() where id=v.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'ExpenseVoided','expense',v.id,jsonb_build_object('reason',trim(p_reason),'amount',v.amount),v_actor);
end
$$;

create or replace function public.v2_expenses(organization_id uuid,period date default null)
returns table(id uuid,amount numeric,expense_date date,category text,method text,reference text,concept text,status text,source text,metadata jsonb,created_at timestamptz,voided_at timestamptz,void_reason text)
language sql stable security definer set search_path='pg_catalog','private' as $$ select * from private.query_expenses(organization_id,period) $$;
create or replace function public.v2_post_expense(organization_id uuid,amount numeric,expense_date date,category text,method text,reference text,concept text,metadata jsonb,idempotency_key text)
returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_post_expense(organization_id,amount,expense_date,category,method,reference,concept,metadata,idempotency_key) $$;
create or replace function public.v2_void_expense(organization_id uuid,expense_id uuid,reason text)
returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_void_expense(organization_id,expense_id,reason) $$;
revoke all on function public.v2_expenses(uuid,date) from public,anon;
revoke all on function public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text) from public,anon;
revoke all on function public.v2_void_expense(uuid,uuid,text) from public,anon;
grant execute on function public.v2_expenses(uuid,date) to authenticated;
grant execute on function public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.v2_void_expense(uuid,uuid,text) to authenticated;

-- Canonical tables are command-driven. Security-definer backend commands retain owner access.
revoke insert,update,delete on
  app.academies,app.academy_enrollments,
  app.attendance_records,app.sessions,
  app.categories,
  app.equipment_items,app.equipment_assignments,
  app.expenses,
  app.files,
  app.goalkeeper_packages,app.goalkeeper_sessions,
  app.guardians,app.player_guardians,app.player_enrollments,
  app.payments,app.payment_allocations,
  app.sponsors,app.sponsor_agreements,app.sponsor_assets
from authenticated;

grant select on
  app.academies,app.academy_enrollments,
  app.attendance_records,app.sessions,
  app.categories,
  app.equipment_items,app.equipment_assignments,
  app.expenses,
  app.files,
  app.goalkeeper_packages,app.goalkeeper_sessions,
  app.guardians,app.player_guardians,app.player_enrollments,
  app.payments,app.payment_allocations,
  app.sponsors,app.sponsor_agreements,app.sponsor_assets
  to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('SEC-003','security','Canonical writes are command-driven','Authenticated clients cannot directly insert/update/delete operational canonical tables; mutations use authorized security-definer commands or remain read-only until an explicit workflow exists.','platform_safety',100,'database','active','pending','authenticated table grants',jsonb_build_object('locked_on','2026-08-19')),
('FIN-001','accounting','Expenses use accounting commands','Expenses require accounting write access, positive amount, category/concept and idempotency; corrections void history rather than delete it.','approved_v2',100,'command','active','pending','private.command_post_expense / private.command_void_expense','{}')
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
