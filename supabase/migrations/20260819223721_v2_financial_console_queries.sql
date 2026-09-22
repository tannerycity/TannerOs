create or replace function private.query_production_batches(p_organization_id uuid)
returns table(id uuid,folio text,batch_type text,status text,supplier_name text,submitted_on date,received_at timestamptz,sales_total numeric,cost_total numeric,notes text,order_count bigint,warranty_count bigint)
language sql stable security definer set search_path='pg_catalog','app','private' as $$
 select b.id,b.folio,b.batch_type,b.status,b.supplier_name,b.submitted_on,b.received_at,b.sales_total,b.cost_total,b.notes,
   (select count(*) from app.production_batch_orders bo where bo.batch_id=b.id and bo.organization_id=b.organization_id),
   (select count(*) from app.production_batch_warranties bw where bw.batch_id=b.id and bw.organization_id=b.organization_id)
 from app.production_batches b
 where b.organization_id=p_organization_id
   and (private.has_module_access(p_organization_id,'commerce',false) or private.has_module_access(p_organization_id,'accounting',false))
 order by b.created_at desc
$$;

create or replace function private.query_billing_players(p_organization_id uuid)
returns table(player_id uuid,player_name text,base_monthly_fee numeric,billing_status text,sponsor_benefit_id uuid,sponsor_source text,sponsor_mode text,sponsor_value numeric,sponsor_configured_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
begin
 if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
 return query
 select p.id,trim(concat_ws(' ',p.first_name,p.last_name)),bp.base_monthly_fee,bp.status,
   sb.id,sb.funding_source_name,sb.calculation_type,
   case when sb.calculation_type='percentage' then sb.percentage else sb.fixed_amount end,sb.funding_configured_at
 from app.players p
 join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
 left join lateral(
   select b.* from app.player_benefits b where b.organization_id=p.organization_id and b.player_id=p.id and b.benefit_type='sponsor_funded' and b.active=true
   order by (b.funding_configured_at is not null) desc,b.priority desc,b.starts_on desc,b.created_at desc limit 1
 ) sb on true
 where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
 order by p.first_name,p.last_name,p.id;
end $$;

create or replace function private.query_open_receivables(p_organization_id uuid)
returns table(charge_id uuid,player_id uuid,player_name text,charge_type text,concept text,billing_period date,due_date date,payer_type text,payer_name text,net_amount numeric,allocated_amount numeric,balance_due numeric)
language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
begin
 if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
 return query
 select cb.id,cb.player_id,trim(concat_ws(' ',p.first_name,p.last_name)),cb.charge_type,cb.concept,cb.billing_period,cb.due_date,cb.payer_type,cb.payer_name,cb.net_amount,cb.allocated_amount,cb.balance_due
 from app.charge_balances cb left join app.players p on p.id=cb.player_id and p.organization_id=cb.organization_id
 where cb.organization_id=p_organization_id and cb.computed_status in ('pending','partial') and cb.balance_due>0
 order by cb.due_date,cb.billing_period,player_name,cb.id;
end $$;

create or replace function public.v2_billing_players(organization_id uuid)
returns table(player_id uuid,player_name text,base_monthly_fee numeric,billing_status text,sponsor_benefit_id uuid,sponsor_source text,sponsor_mode text,sponsor_value numeric,sponsor_configured_at timestamptz)
language sql stable security definer set search_path='pg_catalog','private' as $$ select * from private.query_billing_players(organization_id) $$;
create or replace function public.v2_open_receivables(organization_id uuid)
returns table(charge_id uuid,player_id uuid,player_name text,charge_type text,concept text,billing_period date,due_date date,payer_type text,payer_name text,net_amount numeric,allocated_amount numeric,balance_due numeric)
language sql stable security definer set search_path='pg_catalog','private' as $$ select * from private.query_open_receivables(organization_id) $$;
revoke execute on function public.v2_billing_players(uuid),public.v2_open_receivables(uuid) from public,anon;
grant execute on function public.v2_billing_players(uuid),public.v2_open_receivables(uuid) to authenticated;;
