-- v2_expenses no traía supplier_name, así que Contabilidad no podía mostrar
-- ni editar el beneficiario desde la lista de movimientos.
drop function if exists public.v2_expenses(uuid, date);
drop function if exists private.query_expenses(uuid, date);

create function private.query_expenses(p_organization_id uuid, p_period date default null::date)
returns table(id uuid, amount numeric, expense_date date, category text, method text, reference text, concept text, supplier_name text, status text, source text, metadata jsonb, created_at timestamptz, voided_at timestamptz, void_reason text)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'accounting',false) then raise exception 'Not authorized'; end if;
  return query
  select e.id,e.amount,e.expense_date,e.category,e.method,e.reference,e.concept,e.supplier_name,e.status,e.source,e.metadata,e.created_at,e.voided_at,e.void_reason
  from app.expenses e
  where e.organization_id=p_organization_id
    and (p_period is null or date_trunc('month',e.expense_date)::date=date_trunc('month',p_period)::date)
  order by e.expense_date desc,e.created_at desc;
end
$function$;

create function public.v2_expenses(organization_id uuid, period date default null::date)
returns table(id uuid, amount numeric, expense_date date, category text, method text, reference text, concept text, supplier_name text, status text, source text, metadata jsonb, created_at timestamptz, voided_at timestamptz, void_reason text)
language sql
stable security definer
set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_expenses(organization_id,period) $function$;

grant execute on function public.v2_expenses(uuid,date) to authenticated;
;
