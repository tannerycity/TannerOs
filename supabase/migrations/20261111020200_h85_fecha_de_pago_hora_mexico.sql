-- h85 (11/11/2026, Presidencia): "si Zul cobró el uniforme en taquilla, 2,700,
-- en su total no sale que ella lo cobró". Dos causas:
--   1. el pago no guardaba quién lo cobró (resuelto en h84);
--   2. la FECHA: command_post_order_payment(_attributed), command_post_general_income
--      y command_post_program_payment usan current_date, que es la fecha del
--      servidor (UTC). Después de las 6 pm en León ya es "mañana" en UTC: el abono
--      de las 6:27 pm del 10/11 quedó con fecha 11/11 y no salía en "Mi corte de
--      hoy" del 10.
--
-- Arreglo para todos los caminos: un pago o gasto no puede tener fecha futura en
-- hora de México; si llega así, se queda en el día de hoy del club. Y se corrige
-- el abono de $2,700 de PED-2026-00017 al 10/11/2026.
create or replace function private.trg_pago_fecha_mexico()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_date is not null and new.payment_date > private.hoy_mx() then
    new.payment_date := private.hoy_mx();
  end if;
  return new;
end $$;
revoke all on function private.trg_pago_fecha_mexico() from public, anon, authenticated;
drop trigger if exists trg_pago_fecha_mexico on app.payments;
create trigger trg_pago_fecha_mexico before insert on app.payments
  for each row execute function private.trg_pago_fecha_mexico();

create or replace function private.trg_gasto_fecha_mexico()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.expense_date is not null and new.expense_date > private.hoy_mx() then
    new.expense_date := private.hoy_mx();
  end if;
  return new;
end $$;
revoke all on function private.trg_gasto_fecha_mexico() from public, anon, authenticated;
drop trigger if exists trg_gasto_fecha_mexico on app.expenses;
create trigger trg_gasto_fecha_mexico before insert on app.expenses
  for each row execute function private.trg_gasto_fecha_mexico();

-- El abono de $2,700 de PED-2026-00017: se cobró el 10/11 a las 6:27 pm.
do $$
declare v_pago uuid := 'a6792c4b-6779-4d44-b318-f2737c8043a0'; v_org uuid;
begin
  update app.payments set payment_date = '2026-11-10', updated_at = now()
   where id = v_pago and payment_date = '2026-11-11' returning organization_id into v_org;
  if v_org is not null then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_org, 'PaymentEdited', 'payment', v_pago,
            jsonb_build_object('before', jsonb_build_object('date', '2026-11-11'), 'after', jsonb_build_object('date', '2026-11-10'),
                               'reason', 'Fecha en UTC: se cobró el 10/11 a las 6:27 pm hora de México (h85)'), null);
  end if;
end $$;
