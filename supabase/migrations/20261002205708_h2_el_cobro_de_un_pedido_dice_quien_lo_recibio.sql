-- El cobro de un pedido en Taquilla dice quién de Tannery lo recibió
--
-- Taquilla cobra ahora los pedidos de la tienda (g2). El cobro ligado ya
-- existía —v2_post_order_payment_attributed, el que usa Pedidos— pero no
-- guarda quién recibió el dinero ni con qué usuario se registró. En el iPad,
-- que es una cuenta compartida, eso es justo lo que Taquilla pide en cada
-- cobro de mensualidad: "sin esto no se sabe quién recibió el dinero".
--
-- Esta función llama al MISMO comando (mismas reglas: no pasar del saldo,
-- idempotencia, estado del pedido, evento OrderPaymentPosted) y después le
-- pone al pago el nombre de quien cobró y el usuario. No duplica ninguna
-- regla de dinero.
--
-- Exige escribir en Tienda ('commerce'), igual que el comando original.
-- REVERSIBLE: drop de las dos funciones.

create or replace function private.command_post_order_payment_at_cashier(
  p_organization_id uuid, p_order_id uuid, p_amount numeric, p_payment_date date,
  p_method text, p_reference text, p_payer_type text, p_payer_name text,
  p_collected_by_name text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_payment uuid;
begin
  v_payment:=private.command_post_order_payment_attributed(
    p_organization_id,p_order_id,p_amount,p_payment_date,p_method,p_reference,
    p_payer_type,p_payer_name,p_idempotency_key);
  update app.payments
     set collected_by_name=coalesce(nullif(trim(p_collected_by_name),''),collected_by_name),
         created_by_user_id=coalesce(created_by_user_id,(select auth.uid())),
         updated_at=now()
   where id=v_payment and organization_id=p_organization_id;
  return v_payment;
end $function$;

revoke all on function private.command_post_order_payment_at_cashier(uuid,uuid,numeric,date,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function public.v2_post_order_payment_at_cashier(
  organization_id uuid, order_id uuid, amount numeric, payment_date date,
  method text, reference text, payer_type text, payer_name text,
  collected_by_name text, idempotency_key text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.command_post_order_payment_at_cashier(organization_id, order_id, amount, payment_date,
  method, reference, payer_type, payer_name, collected_by_name, idempotency_key); $$;

revoke all on function public.v2_post_order_payment_at_cashier(uuid,uuid,numeric,date,text,text,text,text,text,text) from public, anon;
grant execute on function public.v2_post_order_payment_at_cashier(uuid,uuid,numeric,date,text,text,text,text,text,text) to authenticated;
