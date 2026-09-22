-- command_post_expense nunca escribía supplier_name: Taquilla guardaba "quién"
-- solo en metadata.who, y el reporte "Pagos por beneficiario" agrupa por la
-- columna supplier_name, así que todo egreso nuevo caía en "(sin beneficiario)"
-- hasta que alguien lo editaba a mano después. Se agrega el parámetro directo
-- (con metadata.who como respaldo) y se rescatan los que ya traían el dato en
-- metadata pero nunca llegó a la columna.
create or replace function private.command_post_expense(
  p_organization_id uuid, p_amount numeric, p_expense_date date, p_category text,
  p_method text, p_reference text, p_concept text, p_metadata jsonb, p_idempotency_key text,
  p_supplier_name text default null
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid; v_actor uuid:=(select auth.uid());
begin
  if not (private.has_module_access(p_organization_id,'accounting',true) or private.has_module_access(p_organization_id,'taquilla',true)) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  if nullif(trim(coalesce(p_category,'')),'') is null then raise exception 'Expense category required'; end if;
  if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Expense concept required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.expenses(organization_id,amount,expense_date,category,method,reference,concept,supplier_name,status,source,metadata,idempotency_key,created_by_user_id,created_at,updated_at)
  values(p_organization_id,p_amount,coalesce(p_expense_date,current_date),trim(p_category),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),trim(p_concept),
    nullif(trim(coalesce(p_supplier_name, p_metadata->>'who','')),''),
    'posted','tanneros_v2',coalesce(p_metadata,'{}'::jsonb),trim(p_idempotency_key),v_actor,now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'ExpensePosted','expense',v_id,jsonb_build_object('amount',p_amount,'category',trim(p_category),'expenseDate',coalesce(p_expense_date,current_date)),v_actor,trim(p_idempotency_key));
  return v_id;
exception when unique_violation then
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is null then raise; end if;
  return v_id;
end
$function$;

create or replace function public.v2_post_expense(
  organization_id uuid, amount numeric, expense_date date, category text,
  method text, reference text, concept text, metadata jsonb, idempotency_key text,
  supplier_name text default null
) returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$ select private.command_post_expense(organization_id,amount,expense_date,category,method,reference,concept,metadata,idempotency_key,supplier_name) $function$;

grant execute on function public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text,text) to authenticated;

-- Rescata egresos que ya traían "quién" en metadata pero nunca llegó a la columna.
update app.expenses
set supplier_name = nullif(trim(metadata->>'who'), ''), updated_at = now()
where supplier_name is null
  and metadata->>'who' is not null
  and nullif(trim(metadata->>'who'), '') is not null;
;
