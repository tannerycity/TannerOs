create or replace function private.command_post_payment(
  p_organization_id uuid,
  p_player_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_concept text,
  p_payer_type text,
  p_payer_name text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'billing',true) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;

  select id into v_id from app.payments where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;

  insert into app.payments(
    organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,
    idempotency_key,payer_type,payer_name,payment_purpose,credit_status,created_at,updated_at
  ) values(
    p_organization_id,p_player_id,p_amount,p_payment_date,coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),
    coalesce(nullif(trim(p_concept),''),'Monthly payment'),'posted','tanneros_v2','Mensualidad',
    p_idempotency_key,coalesce(nullif(trim(p_payer_type),''),'guardian'),nullif(trim(p_payer_name),''),'billing','available',now(),now()
  ) returning id into v_id;

  perform app.allocate_payment_oldest_first(v_id);
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'PaymentPosted','payment',v_id,jsonb_build_object('player_id',p_player_id,'amount',p_amount,'payment_date',p_payment_date),v_actor,p_idempotency_key);
  return v_id;
end;
$fn$;

create or replace function private.command_reverse_payment_allocations(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
declare
  v_count integer;
  v_actor uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'billing',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Reason required'; end if;
  if not exists(select 1 from app.payments where id=p_payment_id and organization_id=p_organization_id) then raise exception 'Payment not found'; end if;
  update app.payment_allocations
  set status='reversed',reversed_at=now(),reversal_reason=p_reason,reversed_by=v_actor
  where organization_id=p_organization_id and payment_id=p_payment_id and status='posted';
  get diagnostics v_count=row_count;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentAllocationsReversed','payment',p_payment_id,jsonb_build_object('reason',p_reason,'count',v_count),v_actor);
  return v_count;
end;
$fn$;

create or replace function private.command_refund_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_refund_date date,
  p_method text,
  p_reference text,
  p_reason text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'billing',true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Reason required'; end if;
  select id into v_id from app.refunds where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;
  insert into app.refunds(organization_id,payment_id,amount,refund_date,method,reference,reason,status,idempotency_key,created_at,updated_at)
  values(p_organization_id,p_payment_id,p_amount,p_refund_date,p_method,p_reference,p_reason,'posted',p_idempotency_key,now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'PaymentRefunded','refund',v_id,jsonb_build_object('payment_id',p_payment_id,'amount',p_amount,'reason',p_reason),v_actor,p_idempotency_key);
  return v_id;
end;
$fn$;

create or replace function private.command_withdraw_player(p_organization_id uuid,p_player_id uuid,p_date date,p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  perform app.withdraw_player(p_player_id,p_date,p_reason,(select auth.uid())::text);
end;
$fn$;

create or replace function private.command_reactivate_player(p_organization_id uuid,p_player_id uuid,p_date date)
returns void
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  perform app.reactivate_player(p_player_id,p_date,(select auth.uid())::text);
end;
$fn$;

create or replace function private.command_run_billing(p_organization_id uuid,p_period date,p_as_of date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
declare v_charges integer; v_late integer;
begin
  if not private.has_module_access(p_organization_id,'admin',true) then raise exception 'Not authorized'; end if;
  v_charges := app.generate_monthly_charges(p_organization_id,p_period);
  v_late := app.assess_late_fees(p_organization_id,p_as_of);
  return jsonb_build_object('charges_created',v_charges,'late_fees_created',v_late);
end;
$fn$;

revoke all on function private.command_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function private.command_reverse_payment_allocations(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.command_refund_payment(uuid,uuid,numeric,date,text,text,text,text) from public,anon,authenticated;
revoke all on function private.command_withdraw_player(uuid,uuid,date,text) from public,anon,authenticated;
revoke all on function private.command_reactivate_player(uuid,uuid,date) from public,anon,authenticated;
revoke all on function private.command_run_billing(uuid,date,date) from public,anon,authenticated;

create or replace function public.v2_post_payment(
  organization_id uuid, player_id uuid, amount numeric, payment_date date, method text,
  reference text default null, concept text default null, payer_type text default 'guardian', payer_name text default null,
  idempotency_key text default null
) returns uuid
language sql
security invoker
set search_path = pg_catalog,private
as $$ select private.command_post_payment(organization_id,player_id,amount,payment_date,method,reference,concept,payer_type,payer_name,idempotency_key) $$;

create or replace function public.v2_reverse_payment_allocations(organization_id uuid,payment_id uuid,reason text)
returns integer language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_reverse_payment_allocations(organization_id,payment_id,reason) $$;

create or replace function public.v2_refund_payment(
  organization_id uuid,payment_id uuid,amount numeric,refund_date date,method text,reference text,reason text,idempotency_key text
) returns uuid language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_refund_payment(organization_id,payment_id,amount,refund_date,method,reference,reason,idempotency_key) $$;

create or replace function public.v2_withdraw_player(organization_id uuid,player_id uuid,withdrawn_at date,reason text)
returns void language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_withdraw_player(organization_id,player_id,withdrawn_at,reason) $$;

create or replace function public.v2_reactivate_player(organization_id uuid,player_id uuid,reactivated_at date)
returns void language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_reactivate_player(organization_id,player_id,reactivated_at) $$;

create or replace function public.v2_run_billing(organization_id uuid,billing_period date,as_of date)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_run_billing(organization_id,billing_period,as_of) $$;

revoke all on function public.v2_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text) from public,anon;
revoke all on function public.v2_reverse_payment_allocations(uuid,uuid,text) from public,anon;
revoke all on function public.v2_refund_payment(uuid,uuid,numeric,date,text,text,text,text) from public,anon;
revoke all on function public.v2_withdraw_player(uuid,uuid,date,text) from public,anon;
revoke all on function public.v2_reactivate_player(uuid,uuid,date) from public,anon;
revoke all on function public.v2_run_billing(uuid,date,date) from public,anon;
grant execute on function public.v2_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.v2_reverse_payment_allocations(uuid,uuid,text) to authenticated;
grant execute on function public.v2_refund_payment(uuid,uuid,numeric,date,text,text,text,text) to authenticated;
grant execute on function public.v2_withdraw_player(uuid,uuid,date,text) to authenticated;
grant execute on function public.v2_reactivate_player(uuid,uuid,date) to authenticated;
grant execute on function public.v2_run_billing(uuid,date,date) to authenticated;;
