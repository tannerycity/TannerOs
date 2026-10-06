-- Historial de cambios al saldo y cargo a varios Tanners
--
-- PEDIDO DE PRESIDENCIA (06/10/2026):
--   · ver en el estado de cuenta quién cambió el saldo, cuándo y por qué (no
--     va en el PDF que se le manda a la familia: eso lo decide la pantalla);
--   · cargo masivo "para cuando sean los torneos": un mismo cargo a varios
--     Tanners de una vez, en vez de uno por uno.
--
-- QUÉ HACE
--   1. v2_player_change_history: ajustes aplicados a sus cargos (descuento,
--      condonación, corrección, recargo perdonado), cargos agregados por
--      Presidencia y pagos revertidos, cada uno con monto, motivo, fecha y
--      quién lo hizo. Lo ve quien ve el estado de cuenta (Cobranza o
--      Contabilidad).
--   2. v2_presidency_bulk_charge: el mismo cargo (concepto, monto, fecha,
--      motivo) a una lista de Tanners. Sólo Presidencia. Cada cargo usa la
--      llave del lote + el Tanner, así que reintentar el lote no duplica a
--      nadie. Máximo 300 Tanners por lote. Reusa command_presidency_add_charge.
--
-- REVERSIBLE: drop de las funciones.

create or replace function private.query_player_change_history(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting'], false)
    then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.at desc) from (
      select ca.posted_at as at, jsonb_build_object(
          'kind','adjustment','type',ca.adjustment_type,'amount',ca.amount,'reason',ca.reason,
          'at',ca.posted_at,'concept',c.concept,'chargeType',c.charge_type,'period',c.billing_period,
          'by',private.chat_name(coalesce(ca.posted_by_user_id,ca.authorized_by_user_id)),
          'authorizedBy',private.chat_name(ca.authorized_by_user_id)) j
        from app.charge_adjustments ca join app.charges c on c.id=ca.charge_id
       where ca.organization_id=p_organization_id and c.player_id=p_player_id and ca.status='posted'
      union all
      select c.created_at, jsonb_build_object(
          'kind','charge_added','amount',c.amount,'concept',c.concept,'at',c.created_at,'dueDate',c.due_date,
          'reason',(select de.payload->>'reason' from app.domain_events de where de.organization_id=p_organization_id
                      and de.event_type='ChargeAddedByPresidency' and de.aggregate_id=c.id order by de.occurred_at limit 1),
          'by',(select private.chat_name(de.actor_user_id) from app.domain_events de where de.organization_id=p_organization_id
                      and de.event_type='ChargeAddedByPresidency' and de.aggregate_id=c.id order by de.occurred_at limit 1))
        from app.charges c
       where c.organization_id=p_organization_id and c.player_id=p_player_id and c.source='presidencia'
      union all
      select pm.voided_at, jsonb_build_object(
          'kind','payment_corrected','amount',pm.amount,'reason',pm.void_reason,'at',pm.voided_at,
          'paymentDate',pm.payment_date,'concept',pm.concept,'by',private.chat_name(pm.voided_by_user_id))
        from app.payments pm
       where pm.organization_id=p_organization_id and pm.player_id=p_player_id
         and pm.status in ('refunded','void') and pm.voided_at is not null
    ) x), '[]'::jsonb);
end $$;

create or replace function private.command_presidency_bulk_charge(p_organization_id uuid, p_player_ids uuid[], p_concept text, p_amount numeric, p_due_date date, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_pid uuid; v_n int := 0; v_ids uuid[];
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede agregar un cargo'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  select array_agg(distinct x) into v_ids from unnest(p_player_ids) x where x is not null;
  if coalesce(array_length(v_ids,1),0)=0 then raise exception 'Elige al menos un Tanner'; end if;
  if array_length(v_ids,1)>300 then raise exception 'Máximo 300 Tanners por cargo'; end if;
  foreach v_pid in array v_ids loop
    perform private.command_presidency_add_charge(p_organization_id, v_pid, p_concept, p_amount, p_due_date, p_reason,
                                                  'bulk:'||trim(p_idempotency_key)||':'||v_pid::text);
    v_n := v_n + 1;
  end loop;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'BulkChargeByPresidency','organization',p_organization_id,
         jsonb_build_object('players',v_n,'concept',trim(p_concept),'amount',round(p_amount,2),'dueDate',p_due_date,'reason',trim(p_reason)),
         auth.uid(),'bulk:'||trim(p_idempotency_key));
  return jsonb_build_object('ok', true, 'players', v_n, 'total', round(p_amount,2)*v_n);
end $$;

create or replace function public.v2_player_change_history(organization_id uuid, player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_player_change_history(organization_id, player_id) $$;
create or replace function public.v2_presidency_bulk_charge(organization_id uuid, player_ids uuid[], concept text, amount numeric, due_date date, reason text, idempotency_key text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_presidency_bulk_charge(organization_id, player_ids, concept, amount, due_date, reason, idempotency_key) $$;
revoke all on function public.v2_player_change_history(uuid,uuid), public.v2_presidency_bulk_charge(uuid,uuid[],text,numeric,date,text,text) from public, anon;
grant execute on function public.v2_player_change_history(uuid,uuid), public.v2_presidency_bulk_charge(uuid,uuid[],text,numeric,date,text,text) to authenticated;
