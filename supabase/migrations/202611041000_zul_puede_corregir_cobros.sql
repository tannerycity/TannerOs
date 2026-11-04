-- Presidencia (04/11/2026): "quiero que Zul también pueda modificar eso [las
-- correcciones de cobro] y que quede trazabilidad... al papá no tiene que
-- ver qué le quitaron, solamente cómo va su historial".
--
-- Las herramientas de corrección (agregar cargo, ajustar/perdonar saldo,
-- revocar una autorización, y el botón que las muestra en /tanner/) estaban
-- codificadas a "solo Presidencia" (private.is_presidency). Se amplían para
-- aceptar también a quien tenga escritura en Contabilidad — mismo permiso
-- que ya gobierna el resto de esa área — y se le da ese permiso a Zul.
--
-- Nada cambia de lo que ya existía:
--   - La razón/motivo de cada corrección sigue viviendo solo en
--     app.charge_adjustment_authorizations / app.domain_events (el "VAR"),
--     visible para quien tenga lectura de Contabilidad (private.query_
--     adjustment_authorizations) — eso ES la trazabilidad pedida.
--   - El estado de cuenta de la familia (private.portal_statement) nunca
--     expuso esa razón — solo concepto, monto, estatus y saldo corrido.
--     Se revisó y sigue así: el papá ve su historial limpio, no el porqué.

create or replace function private.command_authorize_charge_adjustment(p_organization_id uuid, p_charge_id uuid, p_adjustment_type text, p_amount numeric, p_reason text, p_idempotency_key text)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$ declare v_id uuid; v_balance numeric; v_actor uuid:=(select auth.uid()); v_type text:=lower(trim(coalesce(p_adjustment_type,'waiver'))); begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)) then raise exception 'No tienes permiso para ajustar un saldo'; end if;
  if v_type not in ('waiver','discount','correction') then raise exception 'Invalid adjustment type'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(length(trim(p_reason)),0)<5 then raise exception 'Adjustment reason required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  perform 1 from app.charges where id=p_charge_id and organization_id=p_organization_id and status='posted' for update;
  if not found then raise exception 'Charge not found'; end if;
  select balance_due into v_balance from app.charge_balances where id=p_charge_id;
  if coalesce(v_balance,0)<=0 then raise exception 'Charge has no outstanding balance'; end if;
  if p_amount>v_balance+0.005 then raise exception 'Adjustment exceeds outstanding balance'; end if;
  select id into v_id from app.charge_adjustment_authorizations where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.charge_adjustment_authorizations(organization_id,charge_id,adjustment_type,amount,reason,status,authorized_by_user_id,idempotency_key) values(p_organization_id,p_charge_id,v_type,p_amount,trim(p_reason),'approved',v_actor,trim(p_idempotency_key)) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id) values(p_organization_id,'ChargeAdjustmentAuthorized','charge',p_charge_id,jsonb_build_object('authorizationId',v_id,'type',v_type,'amount',p_amount,'reason',trim(p_reason)),v_actor,trim(p_idempotency_key));
  return v_id;
end $function$;

create or replace function private.command_presidency_adjust_charge(p_organization_id uuid, p_charge_id uuid, p_adjustment_type text, p_amount numeric, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_auth uuid; v_adj uuid;
begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)) then raise exception 'No tienes permiso para ajustar un saldo'; end if;
  v_auth := private.command_authorize_charge_adjustment(p_organization_id, p_charge_id, p_adjustment_type, p_amount, p_reason, p_idempotency_key);
  v_adj := private.command_post_authorized_adjustment(p_organization_id, v_auth);
  return jsonb_build_object('ok', true, 'authorizationId', v_auth, 'adjustmentId', v_adj);
end $function$;

create or replace function private.command_presidency_add_charge(p_organization_id uuid, p_player_id uuid, p_concept text, p_amount numeric, p_due_date date, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_key text := 'pres-charge:'||trim(coalesce(p_idempotency_key,'')); v_id uuid; v_profile uuid; v_due date := coalesce(p_due_date, (now() at time zone 'America/Mexico_City')::date);
begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)) then raise exception 'No tienes permiso para agregar un cargo'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  select id into v_id from app.charges where organization_id=p_organization_id and idempotency_key=v_key;
  if v_id is not null then return jsonb_build_object('ok', true, 'chargeId', v_id); end if;
  if coalesce(length(trim(p_concept)),0)<3 then raise exception 'Escribe el concepto del cargo'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_amount>100000 then raise exception 'Monto fuera de rango'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Escribe el motivo (queda en el VAR)'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'Tanner no encontrado';
  end if;
  select id into v_profile from app.billing_profiles where player_id=p_player_id and organization_id=p_organization_id limit 1;
  insert into app.charges(organization_id,player_id,billing_profile_id,charge_type,billing_period,concept,amount,due_date,
                          status,source,late_fee_eligible,idempotency_key,posted_at,payer_type)
  values(p_organization_id,p_player_id,v_profile,'other',date_trunc('month',v_due)::date,trim(p_concept),round(p_amount,2),v_due,
         'posted','presidencia',false,v_key,now(),'guardian')
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'ChargeAddedByPresidency','charge',v_id,
         jsonb_build_object('playerId',p_player_id,'concept',trim(p_concept),'amount',round(p_amount,2),'dueDate',v_due,'reason',trim(p_reason)),
         auth.uid(),v_key);
  return jsonb_build_object('ok', true, 'chargeId', v_id);
end $function$;

create or replace function private.command_presidency_bulk_charge(p_organization_id uuid, p_player_ids uuid[], p_concept text, p_amount numeric, p_due_date date, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_pid uuid; v_n int := 0; v_ids uuid[];
begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)) then raise exception 'No tienes permiso para agregar un cargo'; end if;
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
end $function$;

create or replace function private.command_revoke_charge_adjustment_authorization(p_organization_id uuid, p_authorization_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$ declare v_actor uuid:=(select auth.uid()); begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)) then raise exception 'No tienes permiso para revocar una autorización'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Revoke reason required'; end if;
  update app.charge_adjustment_authorizations set status='revoked',revoked_by_user_id=v_actor,revoked_at=now(),revoke_reason=trim(p_reason),updated_at=now() where id=p_authorization_id and organization_id=p_organization_id and status='approved';
  if not found then raise exception 'Approved authorization not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id) values(p_organization_id,'ChargeAdjustmentAuthorizationRevoked','charge_adjustment_authorization',p_authorization_id,jsonb_build_object('reason',trim(p_reason)),v_actor);
end $function$;

-- canAdjust (la bandera que /tanner/ usa para mostrar los botones) con la
-- misma regla ampliada.
CREATE OR REPLACE FUNCTION private.query_player_account_statement(p_organization_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'private'
AS $function$
declare v jsonb; v_player jsonb; v_cutover date := app.billing_cutover();
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting'], false)
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
           (select jsonb_agg(jsonb_build_object(
              'name', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
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
    select coalesce(cb.due_date, cb.billing_period, cb.created_at::date) as fecha,
           1 as orden, 'charge' as tipo, cb.charge_type as subtipo, cb.concept,
           cb.net_amount as monto, cb.allocated_amount as abonado, cb.balance_due as saldo_cargo,
           cb.computed_status as estado, cb.billing_period, null::text as metodo, null::text as referencia,
           cb.id as ref_id
    from app.charge_balances cb
    where cb.organization_id=p_organization_id and cb.player_id=p_player_id
    union all
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
    'player', v_player, 'canAdjust', (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id,'accounting',true)),
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
        'id', s.ref_id, 'date', s.fecha, 'kind', s.tipo, 'subtype', s.subtipo, 'concept', s.concept,
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

-- Permiso de Zul específicamente (no todo el rol Operaciones — solo ella,
-- como se pidió).
insert into private.membership_module_overrides(organization_id,membership_id,module_code,can_read,can_write,updated_by_user_id)
select m.organization_id, m.id, 'contabilidad', true, true, 'cb3b6ae5-6608-465a-a3a6-70b19bdb6918'
from public.organization_memberships m
where m.organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and m.user_id='2278fc59-b8c8-482c-9c28-730106910b6c'
on conflict (organization_id,membership_id,module_code) do update set can_read=true, can_write=true, updated_at=now();
