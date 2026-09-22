
create or replace function public.v2_accounting_overview(p_organization_id uuid, p_period date default (date_trunc('month',current_date))::date)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare
  s date := date_trunc('month', p_period)::date;
  e date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_hi numeric; v_he numeric; v_mi numeric; v_me numeric;
  v_method jsonb; v_trend jsonb; v_inc jsonb; v_exp jsonb; v_qual jsonb; v_pnl jsonb; v_fixed numeric;
  v_payee_m jsonb; v_payee_all jsonb;
  fn_pay text := $q$jsonb_agg(jsonb_build_object('date',expense_date,'category',coalesce(nullif(category,''),'—'),'concept',coalesce(nullif(concept,''),'—'),'amount',amount) order by expense_date desc, amount desc)$q$;
begin
  if not private.has_module_access(p_organization_id,'accounting',false) then raise exception 'Not authorized'; end if;

  select coalesce(sum(amount),0) into v_hi from app.payments where organization_id=p_organization_id and status='posted';
  select coalesce(sum(amount),0) into v_he from app.expenses where organization_id=p_organization_id and status='posted';

  with m as (
    select lower(coalesce(method,'other')) mth, sum(amount) inc, 0::numeric exp from app.payments where organization_id=p_organization_id and status='posted' group by 1
    union all
    select lower(coalesce(method,'other')), 0, sum(amount) from app.expenses where organization_id=p_organization_id and status='posted' group by 1
  ), g as (
    select case mth when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo' when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia' when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta' else 'Otro' end lbl, sum(inc) inc, sum(exp) exp from m group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('method',lbl,'in',inc,'out',exp,'balance',inc-exp) order by lbl),'[]') into v_method from g;

  select coalesce(sum(amount),0) into v_mi from app.payments where organization_id=p_organization_id and status='posted' and payment_date between s and e;
  select coalesce(sum(amount),0) into v_me from app.expenses where organization_id=p_organization_id and status='posted' and expense_date between s and e;

  with months as (select (date_trunc('month', s) - (n||' month')::interval)::date mm from generate_series(0,5) n),
  inc as (select date_trunc('month', payment_date)::date mm, sum(amount) a from app.payments where organization_id=p_organization_id and status='posted' and payment_date >= (s - interval '5 month') group by 1),
  exp as (select date_trunc('month', expense_date)::date mm, sum(amount) a from app.expenses where organization_id=p_organization_id and status='posted' and expense_date >= (s - interval '5 month') group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('month',to_char(months.mm,'YYYY-MM'),'income',coalesce(inc.a,0),'expense',coalesce(exp.a,0)) order by months.mm),'[]') into v_trend
  from months left join inc on inc.mm=months.mm left join exp on exp.mm=months.mm;

  select coalesce(jsonb_agg(jsonb_build_object('category',cat,'amount',amt,'count',cnt,'items',items) order by amt desc),'[]') into v_inc
  from (
    select coalesce(nullif(p.category,''),'Sin categoría') cat, sum(p.amount) amt, count(*) cnt,
      jsonb_agg(jsonb_build_object('date',p.payment_date,'concept',coalesce(nullif(p.concept,''),'—'),
        'who',coalesce(nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''), nullif(p.payer_name,''), '—'),
        'method',case lower(coalesce(p.method,'')) when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo' when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia' when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta' else coalesce(nullif(p.method,''),'Otro') end,
        'amount',p.amount) order by p.payment_date desc, p.amount desc) items
    from app.payments p left join app.players pl on pl.id=p.player_id and pl.organization_id=p.organization_id
    where p.organization_id=p_organization_id and p.status='posted' and p.payment_date between s and e
    group by coalesce(nullif(p.category,''),'Sin categoría')
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('category',cat,'amount',amt,'count',cnt,'items',items) order by amt desc),'[]') into v_exp
  from (
    select coalesce(nullif(category,''),'Sin categoría') cat, sum(amount) amt, count(*) cnt,
      jsonb_agg(jsonb_build_object('date',expense_date,'concept',coalesce(nullif(concept,''),'—'),'who',coalesce(nullif(supplier_name,''),'—'),
        'method',case lower(coalesce(method,'')) when 'cash' then 'Efectivo' when 'efectivo' then 'Efectivo' when 'transfer' then 'Transferencia' when 'transferencia' then 'Transferencia' when 'card' then 'Tarjeta' when 'tarjeta' then 'Tarjeta' else coalesce(nullif(method,''),'Otro') end,
        'amount',amount) order by expense_date desc, amount desc) items
    from app.expenses where organization_id=p_organization_id and status='posted' and expense_date between s and e
    group by coalesce(nullif(category,''),'Sin categoría')
  ) t;

  -- Pagos por beneficiario (a quién le pagué) — MES
  select coalesce(jsonb_agg(jsonb_build_object('payee',payee,'amount',amt,'count',cnt,'items',items) order by amt desc),'[]') into v_payee_m
  from (
    select coalesce(nullif(supplier_name,''),'(sin beneficiario)') payee, sum(amount) amt, count(*) cnt,
      jsonb_agg(jsonb_build_object('date',expense_date,'category',coalesce(nullif(category,''),'—'),'concept',coalesce(nullif(concept,''),'—'),'amount',amount) order by expense_date desc, amount desc) items
    from app.expenses where organization_id=p_organization_id and status='posted' and expense_date between s and e
    group by coalesce(nullif(supplier_name,''),'(sin beneficiario)')
  ) t;

  -- Pagos por beneficiario — HISTÓRICO
  select coalesce(jsonb_agg(jsonb_build_object('payee',payee,'amount',amt,'count',cnt,'items',items) order by amt desc),'[]') into v_payee_all
  from (
    select coalesce(nullif(supplier_name,''),'(sin beneficiario)') payee, sum(amount) amt, count(*) cnt,
      jsonb_agg(jsonb_build_object('date',expense_date,'category',coalesce(nullif(category,''),'—'),'concept',coalesce(nullif(concept,''),'—'),'amount',amount) order by expense_date desc, amount desc) items
    from app.expenses where organization_id=p_organization_id and status='posted'
    group by coalesce(nullif(supplier_name,''),'(sin beneficiario)')
  ) t;

  with cat as (select category, sum(amount) amt from app.payments where organization_id=p_organization_id and status='posted' and payment_date between s and e group by category)
  select jsonb_build_object(
    'recurrent', coalesce(sum(amt) filter (where category ilike 'Mensualidad%' or category ilike 'Academia%'),0),
    'extraordinary', coalesce(sum(amt) filter (where not (category ilike 'Mensualidad%' or category ilike 'Academia%')),0)
  ) into v_qual from cat;

  with cat as (select category, sum(amount) amt from app.payments where organization_id=p_organization_id and status='posted' group by category)
  select coalesce(jsonb_agg(jsonb_build_object('source',src,'amount',amt) order by amt desc),'[]') into v_pnl from (
    select case when category ilike 'Mensualidad%' then 'Mensualidades'
      when category ilike 'Uniforme%' or category ilike 'Tienda%' or category ilike 'Pedido%' then 'Tienda'
      when category ilike 'Curso%' or category ilike 'Academia%' then 'Cursos y programas'
      when category ilike 'Inscripci%' then 'Inscripciones'
      when category ilike 'Ajuste%' then 'Ajustes' else 'Otros' end src, sum(amt) amt from cat group by 1
  ) x;

  select coalesce(sum(amount),0)/3.0 into v_fixed from app.expenses
  where organization_id=p_organization_id and status='posted'
    and (category ilike 'Nómina%' or category ilike 'Renta%' or category ilike 'Servicios%')
    and expense_date >= (s - interval '2 month');

  return jsonb_build_object(
    'period', to_char(s,'YYYY-MM'),
    'clubBalance', jsonb_build_object('total', v_hi - v_he, 'income', v_hi, 'expense', v_he, 'byMethod', v_method),
    'month', jsonb_build_object('income', v_mi, 'expense', v_me, 'result', v_mi - v_me),
    'trend', v_trend, 'incomeByCategory', v_inc, 'expenseByCategory', v_exp,
    'payeesMonth', v_payee_m, 'payeesAll', v_payee_all,
    'quality', v_qual, 'pnlBySource', v_pnl,
    'breakEven', jsonb_build_object('fixedMonthly', round(v_fixed,2), 'recurrentMonth', (v_qual->>'recurrent')::numeric, 'covered', (v_qual->>'recurrent')::numeric >= v_fixed)
  );
end $$;
;
