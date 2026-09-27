-- Los $7,500 de "saldo a favor" no vinieron de la migración.
--
-- Los 13 pagos tienen source='tanneros_v2' y legacy_id nulo: se capturaron a
-- mano en la app entre el 27 de agosto y el 22 de septiembre de 2026. Son
-- pagos reales de familias reales que el sistema no tenía contra qué aplicar.
--
-- La forense dejó tres huecos, todos en el mismo sitio: el cobro automático.
--
-- H1. El crédito sólo se aplica cuando alguien aprieta el botón.
--     La migración 20260907143310 enganchó app.apply_available_credit al final
--     de private.command_run_billing. Pero quien factura de verdad cada noche
--     es private.run_billing_automation, y ese nunca tuvo el enganche.
--     Medido: Daniel maximiliano López Ramírez lleva desde el 9 de septiembre
--     debiendo $500 de la Academia de porteros Y teniendo $500 a favor, al
--     mismo tiempo. Su pago entró 22 minutos ANTES de que naciera el cargo.
--     Su familia ve hoy en el portal "Tu saldo pendiente · $500.00" por dinero
--     que ya entregó. Eso no es un saldo a favor: es una deuda falsa.
--
-- H2. El cron sólo genera cargos el día 1 del mes.
--     run_billing_automation trae `if extract(day from v_local_date)=1`. Quien
--     se da de alta el día 2 o después no tiene cargo ese mes, aunque pague.
--     Cuatro Tanners de septiembre están así ($2,400), más Dario Montalvo,
--     cuyo perfil de cobro se corrigió el 14 de septiembre: trece días después
--     de la única corrida del mes, y ya no hubo otra.
--
-- H3. app.apply_available_credit puede tumbar la facturación entera.
--     No filtra credit_status, y allocate_payment_oldest_first lanza excepción
--     ante 'legacy_hold' y 'cutover_closed'. Hoy no truena de milagro: no hay
--     ningún pago en esos estados con un cargo abierto enfrente. El día que lo
--     haya se cae la corrida completa, en silencio y de madrugada.
--
-- El arreglo no persigue uno por uno los caminos que crean cargos (hay tres
-- hoy y mañana habrá otro). Se pone donde ocurre el hecho: en cuanto nace un
-- cargo, el dinero que ya estaba esperando se aplica solo.

-- 1. Aplicar el crédito de UN jugador. Es la pieza que faltaba: hasta hoy sólo
--    existía la versión que barre toda la organización, cara de más para
--    colgarla de cada cargo que nace.
--
--    Filtra lo que la versión vieja no filtraba (H3): el crédito retenido por
--    el corte contable y el que no es de colegiaturas no se tocan, y sobre
--    todo no hacen estallar a quien llame a esta función.
create or replace function app.apply_available_credit_for_player(
  p_organization_id uuid, p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app'
as $function$
declare v_payment_id uuid; v_applied integer := 0;
begin
  if p_player_id is null then return 0; end if;

  -- Si no hay nada abierto que cubrir, ni se asoma a los pagos.
  if not exists (
    select 1 from app.charge_balances cb
    where cb.organization_id = p_organization_id
      and cb.player_id = p_player_id
      and cb.computed_status in ('pending','partial')
      and cb.balance_due > 0)
  then
    return 0;
  end if;

  for v_payment_id in
    select pb.id
    from app.payment_balances pb
    join app.payments pay on pay.id = pb.id
    where pb.organization_id = p_organization_id
      and pb.player_id = p_player_id
      and pb.available_credit > 0
      -- Las tres puertas que allocate_payment_oldest_first cierra con
      -- excepción. Se cierran aquí, como filtro, para que un pago retenido
      -- sea un pago que se salta y no una facturación que se cae.
      and pay.status = 'posted'
      and pay.payment_purpose = 'billing'
      and coalesce(pay.credit_status,'available') not in ('legacy_hold','cutover_closed')
    order by pb.payment_date, pb.id
  loop
    perform app.allocate_payment_oldest_first(v_payment_id);
    v_applied := v_applied + 1;
  end loop;
  return v_applied;
end $function$;

revoke all on function app.apply_available_credit_for_player(uuid,uuid) from public, anon, authenticated;

-- 2. La versión que barre la organización, con los mismos filtros (H3) y
--    delegando en la de un jugador para que la regla viva en un solo lugar.
create or replace function app.apply_available_credit(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app'
as $function$
declare v_player_id uuid; v_applied integer := 0;
begin
  for v_player_id in
    select distinct pb.player_id
    from app.payment_balances pb
    join app.payments pay on pay.id = pb.id
    where pb.organization_id = p_organization_id
      and pb.available_credit > 0
      and pb.player_id is not null
      and pay.status = 'posted'
      and pay.payment_purpose = 'billing'
      and coalesce(pay.credit_status,'available') not in ('legacy_hold','cutover_closed')
  loop
    v_applied := v_applied + app.apply_available_credit_for_player(p_organization_id, v_player_id);
  end loop;
  return v_applied;
end $function$;

revoke all on function app.apply_available_credit(uuid) from public, anon, authenticated;

-- 3. El enganche de verdad (H1): cuando nace un cargo, se aplica el dinero que
--    ya estaba esperando. Da igual quién lo creó —la corrida de la noche, el
--    botón de Presidencia, una inscripción a academia, un ajuste a mano o lo
--    que venga después—: el trigger está en la tabla, no en cada camino.
--
--    No hay recursión posible: esto escribe en payment_allocations, nunca en
--    app.charges.
create or replace function app.trg_apply_credit_to_new_charge()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','app'
as $function$
begin
  if new.player_id is not null and new.status = 'posted' and new.voided_at is null then
    perform app.apply_available_credit_for_player(new.organization_id, new.player_id);
  end if;
  return null;
end $function$;

revoke all on function app.trg_apply_credit_to_new_charge() from public, anon, authenticated;

drop trigger if exists trg_apply_credit_to_new_charge on app.charges;
create trigger trg_apply_credit_to_new_charge
  after insert on app.charges
  for each row
  execute function app.trg_apply_credit_to_new_charge();

-- 4. La corrida de la noche (H1 y H2).
--
--    Dos cambios y ninguno más:
--
--    a) Los cargos se generan TODOS los días, no sólo el 1. Es seguro porque
--       ambos generadores son idempotentes por (organización, idempotency_key)
--       con índice único: a quien ya tiene su cargo no le nace otro. Lo único
--       que cambia es que al que se dio de alta el día 14 le nace el suyo el
--       15 de madrugada, en vez de nunca.
--
--       No abre la puerta a recargos injustos: la política del club trae
--       first_month_late_fee_enabled = false, así que el primer mes de un
--       Tanner nuevo nunca es elegible para mora.
--
--    b) Se aplica el crédito al final, igual que ya hacía el botón manual.
create or replace function private.run_billing_automation()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare
  r record; v_local_date date; v_local_hour integer; v_period date;
  v_club integer; v_academy integer; v_late integer; v_credit integer;
  v_results jsonb := '[]'::jsonb;
begin
  for r in
    select o.id, o.slug, o.timezone
    from public.organizations o
    join app.billing_policies bp on bp.organization_id = o.id
    where o.status = 'active'
  loop
    v_local_date := (now() at time zone coalesce(nullif(r.timezone,''),'UTC'))::date;
    v_local_hour := extract(hour from (now() at time zone coalesce(nullif(r.timezone,''),'UTC')))::integer;
    if v_local_hour <> 3 then continue; end if;

    v_period := date_trunc('month', v_local_date)::date;
    -- Todos los días, no sólo el 1: alcanza a quien entró a media quincena.
    v_club    := app.generate_monthly_charges(r.id, v_period);
    v_academy := app.generate_academy_charges(r.id, v_period);
    v_late    := app.assess_late_fees(r.id, v_local_date);
    -- Red de seguridad: el trigger ya aplicó lo de los cargos nuevos, pero
    -- esto recoge lo que haya quedado suelto por cualquier otra razón.
    v_credit  := app.apply_available_credit(r.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'organization', r.slug,
      'local_date', v_local_date,
      'club_charges_created', v_club,
      'academy_charges_created', v_academy,
      'late_fees_created', v_late,
      'credits_applied', v_credit));
  end loop;
  return v_results;
end $function$;

revoke all on function private.run_billing_automation() from public, anon, authenticated;

-- 5. Cuadrar lo que ya está roto hoy.
--
--    Esto no borra ni un peso ni oculta nada: aplica el dinero que las
--    familias ya entregaron contra los cargos que ya existen. Probado antes
--    de escribirlo, en un bloque que se revierte: toca exactamente un pago
--    —el de Daniel— y le quita a su familia una deuda falsa de $500.
--
--    Los otros doce pagos NO se mueven, porque esas familias no deben nada:
--    su dinero se queda como adelanto y se aplicará solo al cargo de octubre,
--    que es justo lo que el portal les promete.
do $do$
declare r record;
begin
  for r in select organization_id from app.billing_policies loop
    perform app.apply_available_credit(r.organization_id);
  end loop;
end $do$;
