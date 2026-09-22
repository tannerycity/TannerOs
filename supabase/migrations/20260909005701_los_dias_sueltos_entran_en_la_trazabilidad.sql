-- Sin esto los días sueltos cobrarían dinero que el panel de "de dónde viene"
-- no vería, y la suma de la academia quedaría corta.
create or replace function private.query_academy_revenue(p_organization_id uuid, p_academy_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_rows jsonb; v_meses jsonb; v_resumen jsonb; v_nombre text;
begin
  if not private.has_module_access(p_organization_id,'academias',false) then raise exception 'Not authorized'; end if;
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;

  select name into v_nombre from app.academies
  where id=p_academy_id and organization_id=p_organization_id and archived_at is null;
  if v_nombre is null then raise exception 'Esa academia no existe en el club'; end if;

  select coalesce(jsonb_agg(x order by x->>'period' desc, x->>'kind', x->>'player'),'[]'::jsonb) into v_rows
  from (
    -- Mensualidades: vienen de una inscripción.
    select jsonb_build_object(
      'kind','mes','chargeId',c.id,'period',c.billing_period,'concept',c.concept,
      'player',trim(concat_ws(' ',p.first_name,p.last_name)),'playerId',p.id,'code',p.code,
      'playerStatus',p.status,
      'enrollmentId',e.id,'enrollmentStatus',e.status,'startsOn',e.starts_on,'endsOn',e.ends_on,
      'day',null,
      'amount',cb.net_amount,'listAmount',c.amount,'dueDate',c.due_date,
      'paid',c.amount-cb.balance_due-(c.amount-cb.net_amount),
      'balance',cb.balance_due,
      'payments',coalesce(pg.detalle,'[]'::jsonb)
    ) x
    from app.charges c
    join app.charge_balances cb on cb.id=c.id
    join app.academy_enrollments e on e.id=c.academy_enrollment_id
    join app.players p on p.id=c.player_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'date',pay.payment_date,'method',pay.method,'reference',pay.reference,
               'applied',al.amount,'paymentTotal',pay.amount,'payer',pay.payer_name
             ) order by pay.payment_date) detalle
      from app.payment_allocations al
      join app.payments pay on pay.id=al.payment_id
      where al.charge_id=c.id and pay.status='posted'
    ) pg on true
    where c.organization_id=p_organization_id and e.academy_id=p_academy_id
      and c.charge_type='academy_fee' and c.status='posted'

    union all

    -- Días sueltos: no hay inscripción, la liga es el pase del día.
    select jsonb_build_object(
      'kind','dia','chargeId',c.id,'period',c.billing_period,'concept',c.concept,
      'player',trim(concat_ws(' ',p.first_name,p.last_name)),'playerId',p.id,'code',p.code,
      'playerStatus',p.status,
      'enrollmentId',null,'enrollmentStatus','active','startsOn',null,'endsOn',null,
      'day',d.day,
      'amount',cb.net_amount,'listAmount',c.amount,'dueDate',c.due_date,
      'paid',c.amount-cb.balance_due-(c.amount-cb.net_amount),
      'balance',cb.balance_due,
      'payments',coalesce(pg.detalle,'[]'::jsonb)
    ) x
    from app.academy_day_passes d
    join app.charges c on c.id=d.charge_id and c.status='posted'
    join app.charge_balances cb on cb.id=c.id
    join app.players p on p.id=d.player_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'date',pay.payment_date,'method',pay.method,'reference',pay.reference,
               'applied',al.amount,'paymentTotal',pay.amount,'payer',pay.payer_name
             ) order by pay.payment_date) detalle
      from app.payment_allocations al
      join app.payments pay on pay.id=al.payment_id
      where al.charge_id=c.id and pay.status='posted'
    ) pg on true
    where d.organization_id=p_organization_id and d.academy_id=p_academy_id
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'period',periodo,'charged',cobrado,'paid',pagado,'balance',cobrado-pagado,
    'count',n,'days',dias
  ) order by periodo desc),'[]'::jsonb) into v_meses
  from (
    select (r->>'period')::date periodo,
           sum((r->>'amount')::numeric) cobrado,
           sum((r->>'paid')::numeric) pagado,
           count(*) n,
           count(*) filter (where r->>'kind'='dia') dias
    from jsonb_array_elements(v_rows) r group by 1
  ) g;

  select jsonb_build_object(
    'academy',v_nombre,
    'charged',coalesce(sum((r->>'amount')::numeric),0),
    'paid',coalesce(sum((r->>'paid')::numeric),0),
    'balance',coalesce(sum((r->>'balance')::numeric),0),
    'charges',count(*),
    'dayPasses',count(*) filter (where r->>'kind'='dia'),
    -- Cargos que salieron de una inscripción ya cancelada: lo primero que hay que revisar.
    'fromCancelled',count(*) filter (where r->>'kind'='mes' and r->>'enrollmentStatus'<>'active')
  ) into v_resumen
  from jsonb_array_elements(v_rows) r;

  return jsonb_build_object(
    'summary',coalesce(v_resumen,jsonb_build_object('academy',v_nombre,'charged',0,'paid',0,
      'balance',0,'charges',0,'dayPasses',0,'fromCancelled',0)),
    'months',v_meses,'rows',v_rows);
end $function$;
revoke all on function private.query_academy_revenue(uuid,uuid) from public, anon, authenticated;;
