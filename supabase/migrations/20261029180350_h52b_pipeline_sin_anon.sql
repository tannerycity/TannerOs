-- h52b · v2_orders_pipeline cerrada a public y anon, escrito explícito
-- (29/10/2026). h52 la recreó con create or replace (los permisos se
-- conservaron: anon ya no podía), pero la barrera de seguridad pide el revoke
-- en la migración que la crea. No cambia nada en la base.
revoke all on function public.v2_orders_pipeline(uuid) from public, anon;
grant execute on function public.v2_orders_pipeline(uuid) to authenticated;
