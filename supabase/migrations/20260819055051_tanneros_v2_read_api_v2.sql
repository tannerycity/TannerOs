create or replace function private.query_players(p_organization_id uuid,p_status text default null)
returns table(
  id uuid, code text, first_name text, last_name text, birth_date date, status text, category text,
  player_position text, jersey_number text, photo_path text, base_monthly_fee numeric, billing_status text, needs_review boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,app,private
as $fn$
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,p.status,p.category,p.position,p.jersey_number,p.photo_path,
         bp.base_monthly_fee,bp.status,bp.needs_review
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end;
$fn$;

create or replace function private.query_collection_snapshot(p_organization_id uuid,p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,app,private
as $fn$
declare r record;
begin
  if not private.has_any_module_access(p_organization_id,array['billing','accounting'],false) then raise exception 'Not authorized'; end if;
  select * into r from app.collection_snapshot(p_organization_id,p_period);
  return to_jsonb(r);
end;
$fn$;

create or replace function private.query_player_account(p_organization_id uuid,p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,app,private
as $fn$
declare v_player jsonb; v_charges jsonb; v_payments jsonb;
begin
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'status',p.status,
    'baseMonthlyFee',bp.base_monthly_fee,'billingStart',bp.billing_start,'billingStatus',bp.status,'needsReview',bp.needs_review
  ) into v_player
  from app.players p left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.id=p_player_id and p.organization_id=p_organization_id;
  if v_player is null then raise exception 'Player not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cb.id,'type',cb.charge_type,'period',cb.billing_period,'concept',cb.concept,'amount',cb.net_amount,
    'allocated',cb.allocated_amount,'balance',cb.balance_due,'status',cb.computed_status,'dueDate',cb.due_date
  ) order by cb.billing_period,cb.created_at),'[]'::jsonb) into v_charges
  from app.charge_balances cb where cb.organization_id=p_organization_id and cb.player_id=p_player_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pb.id,'date',pb.payment_date,'amount',pb.amount,'allocated',pb.allocated_amount,'credit',pb.available_credit,
    'method',pb.method,'reference',pb.reference,'payerType',pb.payer_type,'payerName',pb.payer_name,'status',pb.status
  ) order by pb.payment_date desc,pb.id),'[]'::jsonb) into v_payments
  from app.payment_balances pb where pb.organization_id=p_organization_id and pb.player_id=p_player_id;
  return jsonb_build_object('player',v_player,'charges',v_charges,'payments',v_payments);
end;
$fn$;

create or replace function private.query_my_modules(p_organization_id uuid)
returns table(module_code text,can_read boolean,can_write boolean,enabled boolean)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $fn$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return query
  with canonical(code) as (values
    ('players'),('billing'),('accounting'),('academies'),('attendance'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa')
  )
  select c.code,
         private.has_module_access(p_organization_id,c.code,false),
         private.has_module_access(p_organization_id,c.code,true),
         private.module_enabled(p_organization_id,c.code)
  from canonical c;
end;
$fn$;

revoke all on function private.query_players(uuid,text) from public,anon,authenticated;
revoke all on function private.query_collection_snapshot(uuid,date) from public,anon,authenticated;
revoke all on function private.query_player_account(uuid,uuid) from public,anon,authenticated;
revoke all on function private.query_my_modules(uuid) from public,anon,authenticated;

create or replace function public.v2_players(organization_id uuid,status_filter text default null)
returns table(id uuid,code text,first_name text,last_name text,birth_date date,status_value text,category text,player_position text,jersey_number text,photo_path text,base_monthly_fee numeric,billing_status text,needs_review boolean)
language sql security invoker set search_path=pg_catalog,private
as $$ select id,code,first_name,last_name,birth_date,status,category,player_position,jersey_number,photo_path,base_monthly_fee,billing_status,needs_review from private.query_players(organization_id,status_filter) $$;

create or replace function public.v2_collection_snapshot(organization_id uuid,billing_period date)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.query_collection_snapshot(organization_id,billing_period) $$;

create or replace function public.v2_player_account(organization_id uuid,player_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.query_player_account(organization_id,player_id) $$;

create or replace function public.v2_my_modules(organization_id uuid)
returns table(module_code text,can_read boolean,can_write boolean,enabled boolean)
language sql security invoker set search_path=pg_catalog,private
as $$ select * from private.query_my_modules(organization_id) $$;

revoke all on function public.v2_players(uuid,text) from public,anon;
revoke all on function public.v2_collection_snapshot(uuid,date) from public,anon;
revoke all on function public.v2_player_account(uuid,uuid) from public,anon;
revoke all on function public.v2_my_modules(uuid) from public,anon;
grant execute on function public.v2_players(uuid,text) to authenticated;
grant execute on function public.v2_collection_snapshot(uuid,date) to authenticated;
grant execute on function public.v2_player_account(uuid,uuid) to authenticated;
grant execute on function public.v2_my_modules(uuid) to authenticated;;
