-- h33 · Los permisos de h32, escritos uno por uno (22/10/2026).
--
-- h32 los quitó a public y anon dentro de un ciclo; la barrera de seguridad
-- los quiere ver explícitos. No cambia nada: deja escrito lo que ya está.

revoke all on function public.v2_correct_order_payment(uuid, uuid, text) from public, anon;
grant execute on function public.v2_correct_order_payment(uuid, uuid, text) to authenticated;
revoke all on function public.v2_correct_tanner_payment(uuid, uuid, text) from public, anon;
grant execute on function public.v2_correct_tanner_payment(uuid, uuid, text) to authenticated;
revoke all on function public.v2_void_income(uuid, uuid, text) from public, anon;
grant execute on function public.v2_void_income(uuid, uuid, text) to authenticated;
revoke all on function public.v2_update_payment(uuid, uuid, numeric, text, text, text, text, date, text, uuid, text) from public, anon;
grant execute on function public.v2_update_payment(uuid, uuid, numeric, text, text, text, text, date, text, uuid, text) to authenticated;
revoke all on function public.v2_update_payment(uuid, uuid, numeric, text, text, text, text, date, text, uuid) from public, anon;
grant execute on function public.v2_update_payment(uuid, uuid, numeric, text, text, text, text, date, text, uuid) to authenticated;
revoke all on function public.v2_delete_order(uuid, uuid, text) from public, anon;
grant execute on function public.v2_delete_order(uuid, uuid, text) to authenticated;
revoke all on function public.v2_delete_order(uuid, uuid) from public, anon;
grant execute on function public.v2_delete_order(uuid, uuid) to authenticated;
revoke all on function public.v2_edit_order_item(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.v2_edit_order_item(uuid, uuid, text, text, text, text, text, text) to authenticated;
revoke all on function public.v2_can_correct(uuid) from public, anon;
grant execute on function public.v2_can_correct(uuid) to authenticated;
revoke all on function public.v2_change_log(uuid, boolean) from public, anon;
grant execute on function public.v2_change_log(uuid, boolean) to authenticated;
revoke all on function public.v2_mark_changes_reviewed(uuid, uuid[]) from public, anon;
grant execute on function public.v2_mark_changes_reviewed(uuid, uuid[]) to authenticated;
