-- H1 · Que se vea quien del club registro cada movimiento
--
-- APLICADA EN PRODUCCION el 2026-09-22.
-- Migracion: 20260922194540_h1_quien_registro_el_movimiento
--
-- La sustituyo despues H3 (20260922201050), que ademas distingue si
-- "quien registro" es una persona o una cuenta compartida. Ver
-- H3_exponer_quien_cobro_en_movimientos.sql.
--
-- QUE PIDE EL CLUB
-- En los cobros ya se ve "Pago: Lizbeth Moreno", que es el tutor que entrego
-- el dinero. En los egresos la columna "Quien" muestra a quien se le pago
-- (DT Max Ponce). Falta un tercer dato distinto de esos dos: QUIEN DEL CLUB
-- entrego el pago, para saber quien le pago a los profes.
--
-- EL DATO YA SE GUARDA
-- app.expenses.created_by_user_id existe y se llena desde que la pantalla
-- registra el egreso. Medido hoy:
--   24 de 24 egresos hechos desde TannerOS lo tienen  (100%)
--   41 sin el, todos de legacy_import y legacy_v1: nunca pasaron por la app,
--      asi que no hay registrador que mostrar y eso es correcto.
-- No hace falta rellenar nada ni inventar un valor para los viejos.
--
-- QUE CAMBIA
-- query_cashier_snapshot devuelve dos campos mas por movimiento:
--   registeredBy  el nombre de quien lo registro, o null
--   source        de donde salio el movimiento, para distinguir "no se sabe"
--                 de "vino del sistema anterior"
-- Nada mas cambia: mismos totales, mismas filas, mismo orden, mismos permisos.
--
-- RIESGO Y REVERSA
-- Es un CREATE OR REPLACE sobre una funcion de lectura. No toca datos, no
-- borra nada y no cambia permisos. Si algo saliera mal, la reversa es volver a
-- crear la version anterior, que esta guardada completa al final de este
-- archivo.
--
-- La pantalla ya sabe vivir sin estos campos: si no llegan, no muestra la
-- linea. Por eso el cambio de interfaz puede ir a produccion antes que esto.
--
-- ANTES DE APLICAR
--   1. Guardar la salida de
--        select pg_get_functiondef(oid) from pg_proc p
--        join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='private' and p.proname='query_cashier_snapshot';
--   2. Aplicar en una rama de Supabase si el plan lo permite. Hoy el proyecto
--      esta en free y las ramas no estan disponibles, asi que la alternativa
--      es aplicar y comprobar de inmediato que Taquilla sigue cargando.
--   3. Despues: abrir /taquilla/, confirmar que los totales no cambiaron y que
--      los movimientos de septiembre muestran quien los registro.

begin;

create or replace function private.query_cashier_snapshot(
  p_organization_id uuid, p_business_date date default current_date
)
returns jsonb
language plpgsql
-- Sin 'stable' a proposito: la funcion de hoy es volatile (no declara nada) y
-- este cambio solo anade un campo. Cambiar la volatilidad altera el plan de
-- ejecucion y es otra decision, de otro dia.
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
        -- app.payments todavia no guarda quien registro el cobro. Va null a
        -- proposito para no inventarlo; anadir esa columna es otro cambio.
        null::text registered_by
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
        e.amount::numeric,e.status,e.source,e.reference,null::uuid,
        -- Quien del club registro el egreso. Null en los importados del
        -- sistema anterior, que nunca pasaron por la app.
        nullif(trim(pr.display_name),'')
      from app.expenses e
      left join public.profiles pr on pr.user_id = e.created_by_user_id
      where e.organization_id=p_organization_id and e.expense_date<=p_business_date
    ), limited as (
      select * from movement_rows order by movement_date desc,created_at desc limit 60
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'type',movement_type,'date',movement_date,'createdAt',created_at,
      'category',category,'concept',concept,'who',who,'playerName',player_name,'method',method,'amount',amount,
      'status',status,'source',source,'reference',reference,'playerId',player_id,
      'registeredBy',registered_by
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

commit;

-- REVERSA
-- La version anterior es identica a esta salvo por:
--   - el campo registered_by en las dos ramas del union
--   - el left join a public.profiles
--   - 'registeredBy' en el jsonb_build_object
-- Quitar esas tres cosas y volver a aplicar devuelve el estado de hoy.
-- Aun asi, guardar la definicion real antes de aplicar (paso 1 de arriba).
