-- Presidencia ajusta saldos desde el estado de cuenta, en un solo paso
--
-- PEDIDO DE PRESIDENCIA (06/10/2026): "cuando nos metamos a los saldos de las
-- personas, poder editarlo en Presidencia, no ir hasta Taquilla o
-- Contabilidad". Decidió: ajuste en un solo paso y poder agregar cargos.
--
-- ANTES: descontar/condonar/corregir un cargo eran dos pasos (Presidencia
-- autoriza en Contabilidad, Contabilidad lo aplica). Corregir un pago vivía
-- en Taquilla. No había forma de agregar un cargo suelto.
--
-- QUÉ HACE (nunca se sobrescribe un saldo: todo es un movimiento con motivo)
--   1. v2_presidency_adjust_charge: autoriza y aplica el ajuste de un cargo
--      (descuento, condonación o corrección) en una sola llamada. Reusa los
--      dos comandos de siempre, así que las reglas no cambian: sólo
--      Presidencia, motivo obligatorio, no más que lo que se debe, llave de
--      idempotencia. La autorización queda "consumida" por la misma persona y
--      Contabilidad la sigue viendo en su lista.
--   2. v2_presidency_add_charge: cargo suelto (torneo, uniforme, etc.) a un
--      Tanner, con concepto, monto, fecha límite y motivo. Sin recargo por
--      atraso. Si el Tanner tiene saldo a favor, el trigger de siempre se lo
--      aplica solo.
--   3. El estado de cuenta devuelve el id de cada renglón y "canAdjust" para
--      que la pantalla ofrezca ajustar sólo a Presidencia.
--
-- REVERSIBLE: drop de las dos funciones nuevas; el estado de cuenta ignora
-- los campos extra.

do $patch$
declare d text; n text;
begin
  d := pg_get_functiondef('private.query_player_account_statement'::regproc);
  n := replace(d, '''player'', v_player,', '''player'', v_player, ''canAdjust'', private.is_presidency(p_organization_id),');
  n := replace(n, '''date'', s.fecha, ''kind'', s.tipo,', '''id'', s.ref_id, ''date'', s.fecha, ''kind'', s.tipo,');
  if n = d or position('''canAdjust''' in n) = 0 or position('''id'', s.ref_id' in n) = 0 then
    raise exception 'query_player_account_statement cambió: no pude agregar id y canAdjust';
  end if;
  execute n;
end $patch$;

create or replace function private.command_presidency_adjust_charge(p_organization_id uuid, p_charge_id uuid, p_adjustment_type text, p_amount numeric, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_auth uuid; v_adj uuid;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede ajustar un saldo'; end if;
  v_auth := private.command_authorize_charge_adjustment(p_organization_id, p_charge_id, p_adjustment_type, p_amount, p_reason, p_idempotency_key);
  v_adj := private.command_post_authorized_adjustment(p_organization_id, v_auth);
  return jsonb_build_object('ok', true, 'authorizationId', v_auth, 'adjustmentId', v_adj);
end $$;

create or replace function private.command_presidency_add_charge(p_organization_id uuid, p_player_id uuid, p_concept text, p_amount numeric, p_due_date date, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_key text := 'pres-charge:'||trim(coalesce(p_idempotency_key,'')); v_id uuid; v_profile uuid; v_due date := coalesce(p_due_date, (now() at time zone 'America/Mexico_City')::date);
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede agregar un cargo'; end if;
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
end $$;

create or replace function public.v2_presidency_adjust_charge(organization_id uuid, charge_id uuid, adjustment_type text, amount numeric, reason text, idempotency_key text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_presidency_adjust_charge(organization_id, charge_id, adjustment_type, amount, reason, idempotency_key) $$;
create or replace function public.v2_presidency_add_charge(organization_id uuid, player_id uuid, concept text, amount numeric, due_date date, reason text, idempotency_key text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_presidency_add_charge(organization_id, player_id, concept, amount, due_date, reason, idempotency_key) $$;
revoke all on function public.v2_presidency_adjust_charge(uuid,uuid,text,numeric,text,text), public.v2_presidency_add_charge(uuid,uuid,text,numeric,date,text,text) from public, anon;
grant execute on function public.v2_presidency_adjust_charge(uuid,uuid,text,numeric,text,text), public.v2_presidency_add_charge(uuid,uuid,text,numeric,date,text,text) to authenticated;
