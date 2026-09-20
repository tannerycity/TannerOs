
-- 1) REVERTIR REGRESIÓN: Taquilla necesita 'cobranza' (billing) RW para que Cobrar siga funcionando.
--    command_post_payment exige has_module_access(org,'billing',true) -> legacy 'cobranza'.
--    v2_billing_players (buscador de Tanner en el modal Cobrar) exige 'billing' read.
--    La migración anterior eliminó esta fila por error, pensando solo en visibilidad de saldos.
--    query_billing_players NO expone saldo/deuda, solo nombre + cuota mensual + info de patrocinio,
--    así que restaurarla no viola "nada de dinero, ni movimientos" (la cuota es un costo, no una deuda).
insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
values ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','Taquilla','cobranza',true,true)
on conflict (organization_id, role, module_code) do update set can_read=true, can_write=true;

-- 2) Arreglar el botón "Pagar": command_post_expense exige 'accounting'(contabilidad) write,
--    pero Taquilla (y de hecho Operaciones también, bug preexistente) no tiene ese módulo.
--    El criterio correcto para esta acción operativa de caja es: quien puede operar Taquilla
--    (taquilla write) puede pagar egresos desde aquí, igual que puede cobrar.
--    Contabilidad sigue teniendo su acceso general vía el módulo 'accounting' para todo lo demás.
create or replace function private.command_post_expense(p_organization_id uuid, p_amount numeric, p_expense_date date, p_category text, p_method text, p_reference text, p_concept text, p_metadata jsonb, p_idempotency_key text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$ declare v_id uuid; v_actor uuid:=(select auth.uid()); begin if not (private.has_module_access(p_organization_id,'accounting',true) or private.has_module_access(p_organization_id,'taquilla',true)) then raise exception 'Not authorized'; end if; if p_amount is null or p_amount<=0 then raise exception 'Expense amount must be greater than zero'; end if; if nullif(trim(coalesce(p_category,'')),'') is null then raise exception 'Expense category required'; end if; if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Expense concept required'; end if; if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if; select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key); if v_id is not null then return v_id; end if; insert into app.expenses(organization_id,amount,expense_date,category,method,reference,concept,status,source,metadata,idempotency_key,created_by_user_id,created_at,updated_at) values(p_organization_id,p_amount,coalesce(p_expense_date,current_date),trim(p_category),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),trim(p_concept),'posted','tanneros_v2',coalesce(p_metadata,'{}'::jsonb),trim(p_idempotency_key),v_actor,now(),now()) returning id into v_id; insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id) values(p_organization_id,'ExpensePosted','expense',v_id,jsonb_build_object('amount',p_amount,'category',trim(p_category),'expenseDate',coalesce(p_expense_date,current_date)),v_actor,trim(p_idempotency_key)); return v_id; exception when unique_violation then select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key); if v_id is null then raise; end if; return v_id; end $function$;

-- 3) query_cashier_snapshot: ocultar totales/método/movimientos a Taquilla (defensa en profundidad,
--    igual que query_order_detail ya hace con costo/utilidad). Presidencia/Contabilidad/Operaciones sin cambio.
create or replace function private.query_cashier_snapshot(p_organization_id uuid, p_business_date date DEFAULT CURRENT_DATE)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare
  v_income numeric := 0;
  v_expense numeric := 0;
  v_expected_cash numeric := 0;
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
      'category',category,'concept',concept,'who',who,'method',method,'amount',amount,
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
    'methods',v_methods,
    'movements',v_movements,
    'canViewLedger',v_can_view_ledger
  );
end;
$function$;
;
