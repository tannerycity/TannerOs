-- H3 · Que la pantalla sepa quien cobro y si fue una persona o una cuenta
--
-- APLICADA EN PRODUCCION el 2026-09-22.
-- Migracion: 20260922201050_h3_exponer_quien_cobro_en_movimientos
-- Lo que sigue es el SQL tal como se aplico, copiado de
-- supabase_migrations.schema_migrations. Si este archivo y la base no
-- coinciden, la base manda.
--
-- DE DONDE VIENE
-- H1 hizo que query_cashier_snapshot devolviera "registeredBy" sacado del
-- usuario que registro el movimiento. Medido en produccion, eso daba:
--     "Presidencia"  14 movimientos
--     "iPad"          3 movimientos
-- Ninguno es una persona. H2 anadio las columnas de texto
-- (payments.collected_by_name, expenses.paid_by_name) para que quien cobra
-- escriba su nombre. H3 las expone.
--
-- QUE CAMBIA
-- registeredBy ahora sale, en este orden:
--   1. El texto escrito a mano (collected_by_name / paid_by_name).
--   2. Si no hay, el display_name del usuario que registro.
-- Y se anade registeredByIsAccount: true cuando el nombre viene del usuario
-- y no de un texto. La pantalla lo usa para NO fingir que sabe quien fue:
-- con una cuenta compartida muestra "Desde Presidencia · sin nombre" en vez
-- de "Cobro: Presidencia".
--
-- CUIDADO QUE SI TIENE
-- Es un create or replace de una sola funcion con la MISMA firma, asi que no
-- deja versiones duplicadas (el problema que tuvo v2_post_expense). El cuerpo
-- se copio tal cual del que corria y solo se tocaron las dos columnas nuevas
-- del select de movimientos y las dos llaves nuevas del jsonb_build_object.
--
-- PARA REVERTIR: volver a aplicar el cuerpo de H1, que tiene la misma firma.

create or replace function private.query_cashier_snapshot(
  p_organization_id uuid, p_business_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
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
        p.amount::numeric amount,p.status,p.source,p.reference,p.player_id,
        -- Quien del club recibio el dinero. Primero lo escrito a mano, porque
        -- el iPad y Presidencia son cuentas compartidas y no dicen la persona.
        coalesce(nullif(trim(p.collected_by_name),''), nullif(trim(prp.display_name),'')) registered_by,
        (nullif(trim(p.collected_by_name),'') is null
          and nullif(trim(prp.display_name),'') is not null) registered_by_is_account
      from app.payments p
      left join app.players pl on pl.id=p.player_id and pl.organization_id=p.organization_id
      left join public.profiles prp on prp.user_id = p.created_by_user_id
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
        e.amount::numeric,e.status,e.source,e.reference,null::uuid,
        coalesce(nullif(trim(e.paid_by_name),''), nullif(trim(pre.display_name),'')),
        (nullif(trim(e.paid_by_name),'') is null
          and nullif(trim(pre.display_name),'') is not null)
      from app.expenses e
      left join public.profiles pre on pre.user_id = e.created_by_user_id
      where e.organization_id=p_organization_id and e.expense_date<=p_business_date
    ), limited as (
      select * from movement_rows order by movement_date desc,created_at desc limit 60
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'type',movement_type,'date',movement_date,'createdAt',created_at,
      'category',category,'concept',concept,'who',who,'playerName',player_name,'method',method,'amount',amount,
      'status',status,'source',source,'reference',reference,'playerId',player_id,
      'registeredBy',registered_by,
      'registeredByIsAccount',registered_by_is_account
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
