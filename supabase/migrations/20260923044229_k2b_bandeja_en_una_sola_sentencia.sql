-- Correccion de K2: las filas y los indicadores se calculaban en DOS
-- sentencias distintas, y un CTE solo vive dentro de la suya. La segunda
-- reventaba con 'relation "visibles" does not exist'. Ahora todo sale de una
-- sola sentencia, que ademas recorre la tabla una vez en vez de dos.
create or replace function private.query_payments_to_reconcile(
  p_organization_id uuid,
  p_status text default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_todos boolean;
  v_yo uuid := (select auth.uid());
  v_out jsonb;
begin
  if not (private.has_module_access(p_organization_id,'taquilla',false)
       or private.has_module_access(p_organization_id,'accounting',false)
       or private.has_module_access(p_organization_id,'cobranza',false)) then
    raise exception 'Not authorized';
  end if;

  v_todos := private.is_presidency(p_organization_id)
          or private.has_module_access(p_organization_id,'accounting',false);

  with visibles as (
    select p.*
    from app.payments p
    where p.organization_id = p_organization_id
      and p.status <> 'void'
      and (v_todos or p.created_by_user_id = v_yo)
      and (p_from is null or p.payment_date >= p_from)
      and (p_to is null or p.payment_date <= p_to)
  ),
  -- El periodo al que se aplico el pago sale de los adeudos que liquido. Si
  -- no liquido ninguno, se cae al mes de la fecha de pago.
  periodo as (
    select pa.payment_id,
           min(ch.billing_period) as desde,
           max(ch.billing_period) as hasta,
           count(distinct ch.billing_period) as n
    from app.payment_allocations pa
    join app.charges ch on ch.id = pa.charge_id
    where pa.organization_id = p_organization_id and pa.status = 'posted'
    group by pa.payment_id
  ),
  filas as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'paymentId', f.id,
      'date', f.payment_date,
      'createdAt', f.created_at,
      'playerId', f.player_id,
      'playerName', nullif(trim(concat_ws(' ', pl.first_name, pl.last_name)),''),
      'family', coalesce(nullif(trim(f.payer_name),''), nullif(trim(g.nombres),'')),
      'concept', coalesce(nullif(f.concept,''), nullif(f.category,''), 'Cobro'),
      'period', case
        when pe.n is null then to_char(date_trunc('month', f.payment_date), 'YYYY-MM')
        when pe.n = 1 then to_char(pe.desde, 'YYYY-MM')
        else to_char(pe.desde,'YYYY-MM') || ' a ' || to_char(pe.hasta,'YYYY-MM')
      end,
      'amount', f.amount,
      'expectedAmount', f.expected_amount,
      'difference', case when f.expected_amount is null then null
                         else round(f.amount - f.expected_amount, 2) end,
      'method', f.method,
      -- Un pago en efectivo NO se concilia contra el banco. La pantalla usa
      -- esto para no llamarle "conciliacion bancaria" a un billete.
      'validationKind', case
        when lower(trim(coalesce(f.method,''))) in ('efectivo','cash') then 'corte_de_caja'
        when lower(trim(coalesce(f.method,''))) in ('transferencia','transfer','deposito','depósito') then 'banco'
        when lower(trim(coalesce(f.method,''))) in ('tarjeta','card') then 'banco'
        else 'otro'
      end,
      'reference', nullif(trim(f.reference),''),
      'receiptPath', nullif(trim(f.receipt_path),''),
      'observations', nullif(trim(f.observations),''),
      'registeredBy', coalesce(nullif(trim(f.collected_by_name),''), nullif(trim(pr.display_name),'')),
      'registeredByIsAccount', (nullif(trim(f.collected_by_name),'') is null
                                and nullif(trim(pr.display_name),'') is not null),
      'registeredByUserId', f.created_by_user_id,
      'status', f.reconciliation_status,
      'reconciledAt', f.reconciled_at,
      'reconciledBy', nullif(trim(pc.display_name),''),
      'reconciliationNote', nullif(trim(f.reconciliation_note),''),
      'reconciliationReference', nullif(trim(f.reconciliation_reference),''),
      -- reconciled_at nulo con estado approved = es de antes de que existiera
      -- la conciliacion. No se presenta como si alguien lo hubiera revisado.
      'legacyApproved', (f.reconciliation_status = 'approved' and f.reconciled_at is null),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'at', h.created_at, 'from', h.from_status, 'to', h.to_status,
          'reason', h.reason, 'reference', h.reference,
          'by', h.actor_name, 'selfApproved', h.self_approved
        ) order by h.created_at desc)
        from app.payment_reconciliations h where h.payment_id = f.id
      ), '[]'::jsonb)
    ) order by f.payment_date desc, f.created_at desc), '[]'::jsonb) as j
    from visibles f
    left join app.players pl on pl.id = f.player_id
    left join public.profiles pr on pr.user_id = f.created_by_user_id
    left join public.profiles pc on pc.user_id = f.reconciled_by_user_id
    left join lateral (
      select string_agg(distinct trim(concat_ws(' ', gu.first_name, gu.last_name)), ' · ') nombres
      from app.player_guardians pg
      join app.guardians gu on gu.id = pg.guardian_id
      where pg.player_id = f.player_id and pg.organization_id = p_organization_id
    ) g on true
    left join periodo pe on pe.payment_id = f.id
    where p_status is null or f.reconciliation_status = p_status
  ),
  -- Los indicadores se calculan sobre TODO lo visible, no sobre el filtro:
  -- si Presidencia esta viendo "aclaracion", el numero de pendientes tiene
  -- que seguir siendo el real.
  resumen as (
    select jsonb_build_object(
      'pending',        count(*) filter (where v.reconciliation_status='pending'),
      'pendingAmount',  coalesce(sum(v.amount) filter (where v.reconciliation_status='pending'),0),
      'clarification',  count(*) filter (where v.reconciliation_status='clarification'),
      'rejected',       count(*) filter (where v.reconciliation_status='rejected'),
      'approvedToday',  count(*) filter (where v.reconciliation_status='approved'
                                           and v.reconciled_at::date = current_date),
      'withDifference', count(*) filter (where v.expected_amount is not null
                                           and v.expected_amount <> v.amount),
      'differenceTotal', coalesce(sum(v.amount - v.expected_amount)
                                  filter (where v.expected_amount is not null
                                            and v.expected_amount <> v.amount),0),
      'total',          count(*)
    ) as j
    from visibles v
  )
  select jsonb_build_object(
    'canApprove', private.is_presidency(p_organization_id),
    'seesEverything', v_todos,
    'statusFilter', p_status,
    'rows', (select j from filas),
    'summary', (select j from resumen)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end
$function$;

revoke all on function private.query_payments_to_reconcile(uuid,text,date,date) from public, anon, authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='query_payments_to_reconcile';
  if v <> 1 then raise exception 'query_payments_to_reconcile quedo % veces', v; end if;
end $$;
