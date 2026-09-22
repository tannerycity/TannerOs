-- Estado de cuenta por Tanner: identidad, resumen, movimientos con saldo
-- corriente, documentos y pedidos. La pregunta que resuelve es "¿por qué este
-- niño me aparece debiendo?", que hoy no se puede contestar desde la app.
create or replace function private.query_player_account_statement(
  p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','public','private'
as $function$
declare v jsonb; v_player jsonb; v_cutover date := app.billing_cutover();
begin
  if not private.has_any_module_access(p_organization_id, array['billing','players','accounting'], false)
    then raise exception 'Not authorized'; end if;

  select to_jsonb(x) into v_player from (
    select pl.id, pl.first_name, pl.last_name, pl.code, pl.category, pl.status,
           pl.jersey_number, pl.position, pl.birth_date, pl.joined_at, pl.withdrawn_at,
           pl.photo_path, pl.photo_thumb_path, pl.photo_bucket,
           (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id=pl.id) as enrolled_on,
           bp.base_monthly_fee, bp.is_exempt, bp.needs_review, bp.billing_day,
           (select jsonb_agg(jsonb_build_object(
              'type', b.benefit_type, 'source', b.funding_source_name,
              'fixed', b.fixed_amount, 'percentage', b.percentage, 'label', b.legacy_label))
            from app.player_benefits b where b.player_id=pl.id and b.active) as benefits,
           (select jsonb_agg(jsonb_build_object('name', g.first_name||' '||g.last_name,
              'phone', g.phone, 'relationship', pg.relationship, 'primary', pg.is_primary)
              order by pg.is_primary desc)
            from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
            where pg.player_id=pl.id) as guardians
    from app.players pl
    left join app.billing_profiles bp on bp.player_id=pl.id and bp.organization_id=pl.organization_id
    where pl.id=p_player_id and pl.organization_id=p_organization_id
  ) x;
  if v_player is null then raise exception 'Player not found'; end if;

  with movimientos as (
    -- Cargos: suman al saldo
    select coalesce(cb.due_date, cb.billing_period, cb.created_at::date) as fecha,
           1 as orden, 'charge' as tipo, cb.charge_type as subtipo, cb.concept,
           cb.net_amount as monto, cb.allocated_amount as abonado, cb.balance_due as saldo_cargo,
           cb.computed_status as estado, cb.billing_period, null::text as metodo, null::text as referencia,
           cb.id as ref_id
    from app.charge_balances cb
    where cb.organization_id=p_organization_id and cb.player_id=p_player_id
    union all
    -- Pagos de colegiatura: restan
    select pm.payment_date, 2, 'payment', pm.payment_purpose, coalesce(nullif(pm.concept,''),'Pago'),
           -pm.amount, null, null, pm.status, null::date, pm.method, pm.reference, pm.id
    from app.payments pm
    where pm.organization_id=p_organization_id and pm.player_id=p_player_id
      and pm.status='posted' and pm.payment_purpose='billing'
  ), con_saldo as (
    select m.*, sum(m.monto) over (order by m.fecha, m.orden, m.ref_id
                                   rows between unbounded preceding and current row) as saldo_corriente
    from movimientos m
  )
  select jsonb_build_object(
    'player', v_player,
    'cutover', v_cutover,
    'summary', (
      select jsonb_build_object(
        'balance', coalesce((select sum(cb.balance_due) from app.charge_balances cb
                             where cb.player_id=p_player_id and cb.balance_due>0),0),
        'charged_total', coalesce((select sum(cb.net_amount) from app.charge_balances cb
                             where cb.player_id=p_player_id),0),
        'paid_total', coalesce((select sum(pm.amount) from app.payments pm
                             where pm.player_id=p_player_id and pm.status='posted'
                               and pm.payment_purpose='billing'),0),
        'credit_available', coalesce((select sum(pb.available_credit) from app.payment_balances pb
                             where pb.player_id=p_player_id),0),
        'credit_held', coalesce((select sum(pb.held_credit) from app.payment_balances pb
                             where pb.player_id=p_player_id),0),
        'oldest_due', (select min(coalesce(cb.due_date,cb.billing_period)) from app.charge_balances cb
                       where cb.player_id=p_player_id and cb.balance_due>0),
        'by_type', coalesce((select jsonb_agg(jsonb_build_object('type',t.charge_type,'pending',t.pendiente)
                                              order by t.pendiente desc)
                     from (select cb.charge_type, sum(cb.balance_due) pendiente
                           from app.charge_balances cb
                           where cb.player_id=p_player_id and cb.balance_due>0
                           group by 1) t),'[]'::jsonb))),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
        'date', s.fecha, 'kind', s.tipo, 'subtype', s.subtipo, 'concept', s.concept,
        'amount', s.monto, 'allocated', s.abonado, 'charge_balance', s.saldo_cargo,
        'status', s.estado, 'period', s.billing_period, 'method', s.metodo,
        'reference', s.referencia, 'running_balance', s.saldo_corriente)
        order by s.fecha desc, s.orden desc, s.ref_id) from con_saldo s),'[]'::jsonb),
    'other_payments', coalesce((select jsonb_agg(jsonb_build_object(
        'date', pm.payment_date, 'amount', pm.amount, 'concept', pm.concept,
        'method', pm.method, 'status', pm.status) order by pm.payment_date desc)
      from app.payments pm
      where pm.organization_id=p_organization_id and pm.player_id=p_player_id
        and pm.payment_purpose<>'billing' and pm.status='posted'),'[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'type', d.document_type, 'received', d.received, 'received_at', d.received_at)
        order by d.document_type)
      from app.player_document_status d
      where d.organization_id=p_organization_id and d.player_id=p_player_id),'[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'folio', o.folio, 'total', o.total, 'status', o.status, 'created_at', o.created_at,
        'delivered_at', o.delivered_at,
        'paid', coalesce((select sum(op.amount) from app.order_payments op where op.order_id=o.id),0))
        order by o.created_at desc)
      from app.orders o
      where o.organization_id=p_organization_id and o.player_id=p_player_id
        and o.archived_at is null),'[]'::jsonb),
    'academies', coalesce((select jsonb_agg(jsonb_build_object(
        'starts_on', ae.starts_on, 'ends_on', ae.ends_on, 'fee', ae.agreed_fee, 'status', ae.status)
        order by ae.starts_on desc)
      from app.academy_enrollments ae
      where ae.organization_id=p_organization_id and ae.player_id=p_player_id),'[]'::jsonb)
  ) into v;
  return v;
end $function$;

create or replace function public.v2_player_account_statement(organization_id uuid, player_id uuid)
returns jsonb language sql
set search_path to 'pg_catalog','private'
as $function$ select private.query_player_account_statement(organization_id, player_id) $function$;

revoke all on function private.query_player_account_statement(uuid,uuid) from public, anon;
revoke all on function public.v2_player_account_statement(uuid,uuid) from public, anon;
grant execute on function public.v2_player_account_statement(uuid,uuid) to authenticated;;
