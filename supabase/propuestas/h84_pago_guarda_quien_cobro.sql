-- h84 (11/11/2026, Presidencia): "aparece que el pago no está registrado pero
-- su pedido ya está pagado". El abono de $2,700 del pedido PED-2026-00017 sí
-- entró (el pedido sale Pagado), pero en Por conciliar decía "cobró: No se
-- registró": el pago no guardó quién lo cobró.
--
-- Causa: command_post_order_payment(_attributed), command_post_general_income,
-- command_post_program_payment y los de porteros insertan en app.payments sin
-- created_by_user_id. Sólo el cobro de Taquilla (command_post_payment /
-- command_collect_ticket) lo ponía.
--
-- Arreglo de una vez para todos los caminos: si un pago nuevo llega sin quién
-- lo registró, se toma la sesión que lo está guardando. No se inventa nada
-- para los pagos de antes.
create or replace function private.trg_pago_guarda_quien()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by_user_id is null then
    new.created_by_user_id := (select auth.uid());
  end if;
  return new;
end $$;
revoke all on function private.trg_pago_guarda_quien() from public, anon, authenticated;
drop trigger if exists trg_pago_guarda_quien on app.payments;
create trigger trg_pago_guarda_quien before insert on app.payments
  for each row execute function private.trg_pago_guarda_quien();
