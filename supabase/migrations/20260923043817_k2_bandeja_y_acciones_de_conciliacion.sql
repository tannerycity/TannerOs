-- K2 · La bandeja "Pagos por conciliar" y las tres acciones de Presidencia.
--
-- QUIEN VE QUE
--   Presidencia y Contabilidad ven todos los pagos.
--   Taquilla ve SOLO los que registro esa misma cuenta, que es lo que su
--   permiso permite: puede atender sus aclaraciones, no auditar al club.
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
  v_rows jsonb;
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
  filtradas as (
    select * from visibles v
    where p_status is null or v.reconciliation_status = p_status
  )
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
  ) order by f.payment_date desc, f.created_at desc), '[]'::jsonb) into v_rows
  from filtradas f
  left join app.players pl on pl.id = f.player_id
  left join public.profiles pr on pr.user_id = f.created_by_user_id
  left join public.profiles pc on pc.user_id = f.reconciled_by_user_id
  left join lateral (
    select string_agg(distinct trim(concat_ws(' ', gu.first_name, gu.last_name)), ' · ') nombres
    from app.player_guardians pg
    join app.guardians gu on gu.id = pg.guardian_id
    where pg.player_id = f.player_id and pg.organization_id = p_organization_id
  ) g on true
  left join periodo pe on pe.payment_id = f.id;

  -- Los indicadores se calculan sobre TODO lo visible, no sobre el filtro:
  -- si Presidencia esta viendo "aclaracion", el numero de pendientes tiene
  -- que seguir siendo el real.
  select jsonb_build_object(
    'canApprove', private.is_presidency(p_organization_id),
    'seesEverything', v_todos,
    'rows', v_rows,
    'summary', (
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
                                              and v.expected_amount <> v.amount),0)
      ) from visibles v
    )
  ) into v_out;

  return v_out;
end
$function$;

-- Aprobar, rechazar o pedir aclaracion. Solo Presidencia.
create or replace function private.command_reconcile_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_action text,
  p_reason text default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v app.payments%rowtype;
  v_yo uuid := (select auth.uid());
  v_nombre text;
  v_nuevo text;
  v_propio boolean;
  v_revertidas int := 0;
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Solo Presidencia puede conciliar un pago';
  end if;

  v_nuevo := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'clarify' then 'clarification'
    else null end;
  if v_nuevo is null then
    raise exception 'Accion invalida: usa approve, reject o clarify';
  end if;

  -- Rechazar y pedir aclaracion exigen motivo. Aprobar no: el comentario es
  -- opcional, como pidio el club.
  if v_nuevo in ('rejected','clarification')
     and coalesce(length(trim(coalesce(p_reason,''))),0) < 4 then
    raise exception 'Escribe el motivo';
  end if;

  select * into v from app.payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  if v.status = 'void' then raise exception 'Ese pago esta anulado'; end if;

  -- No se aprueba dos veces el mismo movimiento.
  if v.reconciliation_status = v_nuevo then
    raise exception 'El pago ya esta en ese estado';
  end if;
  if v.reconciliation_status = 'approved' and v.reconciled_at is not null
     and v_nuevo = 'approved' then
    raise exception 'Ese pago ya fue aprobado';
  end if;

  -- Nadie aprueba su propio cobro. Presidencia si puede, porque es el
  -- permiso especial del club, pero queda marcado en el historial.
  v_propio := (v.created_by_user_id is not null and v.created_by_user_id = v_yo);

  select coalesce(nullif(trim(pr.display_name),''), 'Presidencia') into v_nombre
  from public.profiles pr where pr.user_id = v_yo;

  -- Un rechazo no puede dejar la deuda marcada como liquidada. Se revierten
  -- las asignaciones con el comando que ya existia para eso.
  if v_nuevo = 'rejected' then
    begin
      v_revertidas := private.command_reverse_payment_allocations(
        p_organization_id, p_payment_id, 'Pago rechazado en conciliacion: ' || trim(p_reason));
    exception when others then
      raise exception 'No se pudo liberar la deuda de ese pago (%). El rechazo no se aplico.', sqlerrm;
    end;
  end if;

  update app.payments
     set reconciliation_status = v_nuevo,
         reconciled_at = now(),
         reconciled_by_user_id = v_yo,
         reconciliation_note = nullif(trim(coalesce(p_reason,'')),''),
         reconciliation_reference = nullif(trim(coalesce(p_reference,'')),''),
         updated_at = now()
   where id = p_payment_id and organization_id = p_organization_id;

  insert into app.payment_reconciliations(
    organization_id, payment_id, from_status, to_status, reason, reference,
    actor_user_id, actor_name, self_approved)
  values(p_organization_id, p_payment_id, v.reconciliation_status, v_nuevo,
         nullif(trim(coalesce(p_reason,'')),''), nullif(trim(coalesce(p_reference,'')),''),
         v_yo, v_nombre, (v_propio and v_nuevo = 'approved'));

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentReconciled','payment',p_payment_id,
         jsonb_build_object('from',v.reconciliation_status,'to',v_nuevo,
                            'reason',nullif(trim(coalesce(p_reason,'')),''),
                            'selfApproved',(v_propio and v_nuevo='approved'),
                            'allocationsReversed',v_revertidas),
         v_yo);

  return jsonb_build_object('status', v_nuevo, 'allocationsReversed', v_revertidas,
                            'selfApproved', (v_propio and v_nuevo = 'approved'));
end
$function$;

-- Quien registro el cobro responde una aclaracion y lo devuelve a la bandeja.
create or replace function private.command_resubmit_payment(
  p_organization_id uuid, p_payment_id uuid, p_note text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v app.payments%rowtype; v_yo uuid := (select auth.uid()); v_nombre text;
begin
  if not (private.has_module_access(p_organization_id,'taquilla',true)
       or private.has_module_access(p_organization_id,'accounting',true)) then
    raise exception 'Not authorized';
  end if;
  if coalesce(length(trim(coalesce(p_note,''))),0) < 4 then
    raise exception 'Escribe la aclaracion';
  end if;

  select * into v from app.payments
  where id = p_payment_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  if v.reconciliation_status <> 'clarification' then
    raise exception 'Ese pago no tiene una aclaracion pendiente';
  end if;
  -- Solo quien lo registro responde, salvo Presidencia y Contabilidad.
  if not (private.is_presidency(p_organization_id)
       or private.has_module_access(p_organization_id,'accounting',false)
       or v.created_by_user_id = v_yo) then
    raise exception 'Solo quien registro el cobro puede responder la aclaracion';
  end if;

  select coalesce(nullif(trim(pr.display_name),''), 'Sin nombre') into v_nombre
  from public.profiles pr where pr.user_id = v_yo;

  update app.payments
     set reconciliation_status = 'pending',
         observations = trim(both E'\n' from coalesce(observations,'') || E'\n' || trim(p_note)),
         updated_at = now()
   where id = p_payment_id and organization_id = p_organization_id;

  insert into app.payment_reconciliations(
    organization_id, payment_id, from_status, to_status, reason, actor_user_id, actor_name)
  values(p_organization_id, p_payment_id, 'clarification', 'pending', trim(p_note), v_yo, v_nombre);

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentClarified','payment',p_payment_id,
         jsonb_build_object('note',trim(p_note)),v_yo);
  return true;
end
$function$;

create or replace function public.v2_payments_to_reconcile(
  organization_id uuid, status_filter text default null,
  from_date date default null, to_date date default null
) returns jsonb
language sql stable security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_payments_to_reconcile(organization_id, status_filter, from_date, to_date) $function$;

create or replace function public.v2_reconcile_payment(
  organization_id uuid, payment_id uuid, action text,
  reason text default null, reference text default null
) returns jsonb
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_reconcile_payment(organization_id, payment_id, action, reason, reference) $function$;

create or replace function public.v2_resubmit_payment(
  organization_id uuid, payment_id uuid, note text
) returns boolean
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_resubmit_payment(organization_id, payment_id, note) $function$;

revoke all on function private.query_payments_to_reconcile(uuid,text,date,date) from public, anon, authenticated;
revoke all on function private.command_reconcile_payment(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.command_resubmit_payment(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.v2_payments_to_reconcile(uuid,text,date,date) from public, anon;
revoke all on function public.v2_reconcile_payment(uuid,uuid,text,text,text) from public, anon;
revoke all on function public.v2_resubmit_payment(uuid,uuid,text) from public, anon;
grant execute on function public.v2_payments_to_reconcile(uuid,text,date,date) to authenticated;
grant execute on function public.v2_reconcile_payment(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.v2_resubmit_payment(uuid,uuid,text) to authenticated;

do $$
declare v int; f text;
begin
  foreach f in array array['v2_payments_to_reconcile','v2_reconcile_payment','v2_resubmit_payment'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  foreach f in array array['query_payments_to_reconcile','command_reconcile_payment','command_resubmit_payment'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
end $$;
