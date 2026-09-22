-- "¿De dónde viene este dinero?" hoy no se puede contestar desde la pantalla,
-- aunque la base sí lo sabe: cada cargo de academia lleva academy_enrollment_id.
-- Esto lo saca a la superficie: por cada mes, qué se cobró, qué se pagó, con qué
-- método y referencia, y qué falta.
--
-- Un pago puede repartirse entre varios cargos (allocate_payment_oldest_first),
-- así que lo que se muestra es la parte del pago aplicada a ESTE cargo, no el
-- monto total del pago: si no, la suma no cuadraría con lo cobrado.
create or replace function private.query_academy_revenue(p_organization_id uuid, p_academy_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_rows jsonb; v_meses jsonb; v_resumen jsonb; v_nombre text;
begin
  if not private.has_module_access(p_organization_id,'academias',false) then raise exception 'Not authorized'; end if;
  -- El dinero es del módulo de cobranza, no del de academias.
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;

  select name into v_nombre from app.academies
  where id=p_academy_id and organization_id=p_organization_id and archived_at is null;
  if v_nombre is null then raise exception 'Esa academia no existe en el club'; end if;

  select coalesce(jsonb_agg(x order by x->>'period' desc, x->>'player'),'[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'chargeId',c.id,'period',c.billing_period,'concept',c.concept,
      'player',trim(concat_ws(' ',p.first_name,p.last_name)),'playerId',p.id,'code',p.code,
      'playerStatus',p.status,
      'enrollmentId',e.id,'enrollmentStatus',e.status,'startsOn',e.starts_on,'endsOn',e.ends_on,
      'amount',c.amount,'dueDate',c.due_date,
      'paid',coalesce(pg.pagado,0),
      'balance',c.amount-coalesce(pg.pagado,0),
      'payments',coalesce(pg.detalle,'[]'::jsonb)
    ) x
    from app.charges c
    join app.academy_enrollments e on e.id=c.academy_enrollment_id
    join app.players p on p.id=c.player_id
    left join lateral (
      select sum(al.amount) pagado,
             jsonb_agg(jsonb_build_object(
               'date',pay.payment_date,'method',pay.method,'reference',pay.reference,
               'applied',al.amount,'paymentTotal',pay.amount,'payer',pay.payer_name
             ) order by pay.payment_date) detalle
      from app.payment_allocations al
      join app.payments pay on pay.id=al.payment_id
      where al.charge_id=c.id and pay.status='posted'
    ) pg on true
    where c.organization_id=p_organization_id and e.academy_id=p_academy_id
      and c.charge_type='academy_fee' and c.status='posted'
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'period',periodo,'charged',cobrado,'paid',pagado,'balance',cobrado-pagado,'count',n
  ) order by periodo desc),'[]'::jsonb) into v_meses
  from (
    select (r->>'period')::date periodo,
           sum((r->>'amount')::numeric) cobrado,
           sum((r->>'paid')::numeric) pagado,
           count(*) n
    from jsonb_array_elements(v_rows) r group by 1
  ) g;

  select jsonb_build_object(
    'academy',v_nombre,
    'charged',coalesce(sum((r->>'amount')::numeric),0),
    'paid',coalesce(sum((r->>'paid')::numeric),0),
    'balance',coalesce(sum((r->>'amount')::numeric - (r->>'paid')::numeric),0),
    'charges',count(*),
    -- Cargos que salieron de una inscripción ya cancelada: casi siempre son el mes
    -- de la salida cobrado completo, y es lo primero que hay que revisar.
    'fromCancelled',count(*) filter (where r->>'enrollmentStatus'<>'active')
  ) into v_resumen
  from jsonb_array_elements(v_rows) r;

  return jsonb_build_object('summary',coalesce(v_resumen,jsonb_build_object('academy',v_nombre,'charged',0,'paid',0,'balance',0,'charges',0,'fromCancelled',0)),
                            'months',v_meses,'rows',v_rows);
end $function$;
revoke all on function private.query_academy_revenue(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_academy_revenue(organization_id uuid, academy_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_academy_revenue(organization_id,academy_id) $function$;
revoke all on function public.v2_academy_revenue(uuid,uuid) from public, anon;
grant execute on function public.v2_academy_revenue(uuid,uuid) to authenticated;;
