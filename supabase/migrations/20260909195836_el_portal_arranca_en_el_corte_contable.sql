-- El estado de cuenta de la familia arranca en el corte. Antes de esa fecha la
-- cobranza no es reconstruible y mostrarla solo genera preguntas que el club no
-- puede contestar.
--
-- La fecha sale de la configuracion del club, no del codigo: cada club del SaaS
-- migra en su propia fecha, y si no hay corte configurado se muestra todo.
create or replace function private.portal_statement(p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v jsonb; v_corte date;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;

  select (o.settings->>'ledgerCutoverOn')::date into v_corte
  from public.organizations o
  join app.players pl on pl.organization_id = o.id
  where pl.id = p_player_id;
  v_corte := coalesce(v_corte, '-infinity'::date);

  with movimientos as (
    select coalesce(cb.due_date, cb.billing_period, cb.created_at::date) as fecha, 1 as orden,
           'charge' as tipo, cb.charge_type as subtipo, cb.concept, cb.net_amount as monto,
           cb.balance_due as saldo_cargo, cb.computed_status as estado, cb.billing_period,
           null::text as metodo, cb.id as ref_id, null::text as folio
    from app.charge_balances cb
    where cb.player_id = p_player_id
      and coalesce(cb.billing_period, cb.due_date) >= v_corte
    union all
    select coalesce(o.created_at::date, o.due_date), 1, 'order', 'order',
           'Pedido de la tienda', o.total, null, o.status, null::date, null::text, o.id, o.folio
    from app.orders o
    where o.player_id = p_player_id and o.archived_at is null
      and coalesce(o.created_at::date, o.due_date) >= v_corte
    union all
    select pm.payment_date, 2, 'payment', pm.payment_purpose, 'Pago recibido', -pm.amount,
           null, pm.status, null::date, pm.method, pm.id, null::text
    from app.payments pm
    where pm.player_id = p_player_id and pm.status = 'posted' and pm.voided_at is null
      and pm.payment_date >= v_corte
  ), con_saldo as (
    select m.*, sum(m.monto) over (order by m.fecha, m.orden, m.ref_id
                                   rows between unbounded preceding and current row) as saldo_corriente
    from movimientos m
  )
  select jsonb_build_object(
    'player', (select jsonb_build_object('id', pl.id, 'first_name', pl.first_name, 'last_name', pl.last_name,
                 'category', pl.category, 'status', pl.status, 'jersey_number', pl.jersey_number,
                 'photo_path', pl.photo_path, 'photo_thumb_path', pl.photo_thumb_path, 'photo_bucket', pl.photo_bucket,
                 'enrolled_on', (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id = pl.id))
               from app.players pl where pl.id = p_player_id),
    'summary', jsonb_build_object(
      'balance', coalesce((select sum(cb.balance_due) from app.charge_balances cb
                           where cb.player_id = p_player_id and cb.balance_due > 0), 0),
      'credit_available', coalesce((select sum(pb.available_credit) from app.payment_balances pb
                           where pb.player_id = p_player_id), 0),
      'oldest_due', (select min(coalesce(cb.due_date, cb.billing_period)) from app.charge_balances cb
                     where cb.player_id = p_player_id and cb.balance_due > 0),
      'by_type', coalesce((select jsonb_agg(jsonb_build_object('type', t.charge_type, 'pending', t.pendiente)
                                            order by t.pendiente desc)
                   from (select cb.charge_type, sum(cb.balance_due) pendiente from app.charge_balances cb
                         where cb.player_id = p_player_id and cb.balance_due > 0 group by 1) t), '[]'::jsonb),
      'since', nullif(v_corte, '-infinity'::date)),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
        'date', s.fecha, 'kind', s.tipo, 'subtype', s.subtipo, 'concept', s.concept,
        'amount', s.monto, 'charge_balance', s.saldo_cargo, 'status', s.estado,
        'period', s.billing_period, 'method', s.metodo, 'running_balance', s.saldo_corriente,
        'folio', s.folio)
        order by s.fecha desc, s.orden desc, s.ref_id) from con_saldo s), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'type', d.document_type, 'received', d.received) order by d.document_type)
      from app.player_document_status d where d.player_id = p_player_id), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

revoke all on function private.portal_statement(uuid) from public, anon, authenticated;;
