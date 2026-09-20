
CREATE OR REPLACE FUNCTION private.query_cashier_snapshot(p_organization_id uuid, p_business_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'private'
AS $function$
declare
  v_income numeric := 0;
  v_expense numeric := 0;
  v_expected_cash numeric := 0;
  v_cash_today numeric := 0;
  v_methods jsonb := '[]'::jsonb;
  v_movements jsonb := '[]'::jsonb;
  v_role text;
  v_can_view_ledger boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not private.has_module_access(p_organization_id,'taquilla',false) then
    raise exception 'cashier access denied';
  end if;

  select m.role into v_role
  from public.organization_memberships m
  where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active=true
  limit 1;

  v_can_view_ledger := coalesce(v_role,'') <> 'Taquilla';

  select
    coalesce((select sum(amount) from app.payments
      where organization_id=p_organization_id and payment_date=p_business_date and status='posted'
        and lower(trim(coalesce(method,''))) in ('efectivo','cash')),0)
    -
    coalesce((select sum(amount) from app.expenses
      where organization_id=p_organization_id and expense_date=p_business_date and status='posted'
        and lower(trim(coalesce(method,''))) in ('efectivo','cash')),0)
    into v_cash_today;

  if v_can_view_ledger then
    select coalesce(sum(amount),0) into v_income
    from app.payments
    where organization_id=p_organization_id and payment_date=p_business_date and status='posted';

    select coalesce(sum(amount),0) into v_expense
    from app.expenses
    where organization_id=p_organization_id and expense_date=p_business_date and status='posted';

    select
      coalesce((select sum(amount) from app.payments
        where organization_id=p_organization_id and payment_date<=p_business_date and status='posted'
          and lower(trim(coalesce(method,''))) in ('efectivo','cash')),0)
      -
      coalesce((select sum(amount) from app.expenses
        where organization_id=p_organization_id and expense_date<=p_business_date and status='posted'
          and lower(trim(coalesce(method,''))) in ('efectivo','cash')),0)
      into v_expected_cash;

    with movement_methods as (
      select case lower(trim(coalesce(method,'')))
        when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo'
        when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia'
        when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta'
        else coalesce(nullif(trim(method),''),'Otro') end as method_label,
        amount::numeric as income, 0::numeric as expense
      from app.payments
      where organization_id=p_organization_id and payment_date=p_business_date and status='posted'
      union all
      select case lower(trim(coalesce(method,'')))
        when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo'
        when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia'
        when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta'
        else coalesce(nullif(trim(method),''),'Otro') end,
        0::numeric, amount::numeric
      from app.expenses
      where organization_id=p_organization_id and expense_date=p_business_date and status='posted'
    ), grouped as (
      select method_label, sum(income) income, sum(expense) expense
      from movement_methods group by method_label
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'method',method_label,'income',income,'expense',expense,'net',income-expense
    ) order by case method_label when 'Efectivo' then 1 when 'Transferencia' then 2 when 'Tarjeta' then 3 else 4 end, method_label),'[]'::jsonb)
    into v_methods from grouped;

    with movement_rows as (
      select p.id,'income'::text movement_type,p.payment_date movement_date,p.created_at,
        coalesce(nullif(p.category,''),'Ingreso') category,
        coalesce(nullif(p.concept,''),'Ingreso') concept,
        coalesce(nullif(p.payer_name,''),nullif(concat_ws(' ',pl.first_name,pl.last_name),''),'—') who,
        nullif(concat_ws(' ',pl.first_name,pl.last_name),'') player_name,
        case lower(trim(coalesce(p.method,'')))
          when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo'
          when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia'
          when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta'
          else coalesce(nullif(trim(p.method),''),'Otro') end method,
        p.amount::numeric amount,p.status,p.source,p.reference,p.player_id
      from app.payments p
      left join app.players pl on pl.id=p.player_id and pl.organization_id=p.organization_id
      where p.organization_id=p_organization_id and p.payment_date<=p_business_date
      union all
      select e.id,'expense',e.expense_date,e.created_at,
        coalesce(nullif(e.category,''),'Egreso'),coalesce(nullif(e.concept,''),'Egreso'),
        coalesce(nullif(e.supplier_name,''),nullif(e.metadata->>'who',''),'—'),
        null::text,
        case lower(trim(coalesce(e.method,'')))
          when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo'
          when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia'
          when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta'
          else coalesce(nullif(trim(e.method),''),'Otro') end,
        e.amount::numeric,e.status,e.source,e.reference,null::uuid
      from app.expenses e
      where e.organization_id=p_organization_id and e.expense_date<=p_business_date
    ), limited as (
      select * from movement_rows order by movement_date desc,created_at desc limit 60
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'type',movement_type,'date',movement_date,'createdAt',created_at,
      'category',category,'concept',concept,'who',who,'playerName',player_name,'method',method,'amount',amount,
      'status',status,'source',source,'reference',reference,'playerId',player_id
    ) order by movement_date desc,created_at desc),'[]'::jsonb)
    into v_movements from limited;
  end if;

  return jsonb_build_object(
    'businessDate',p_business_date,
    'incomeTotal',v_income,
    'expenseTotal',v_expense,
    'netTotal',v_income-v_expense,
    'expectedCash',v_expected_cash,
    'cashTodayNet',v_cash_today,
    'methods',v_methods,
    'movements',v_movements,
    'canViewLedger',v_can_view_ledger
  );
end;
$function$;
;
