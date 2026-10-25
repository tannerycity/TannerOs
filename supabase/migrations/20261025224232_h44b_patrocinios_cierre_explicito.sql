-- h44b (25/10/2026): h44 cerró sus funciones a public y anon dentro de un
-- ciclo; aquí queda escrito (barrera funcion-interna-cerrada-a-anon). No
-- cambia permisos: ya estaban cerradas.
revoke all on function public.v2_set_sponsor_archived(uuid, uuid, boolean), public.v2_remove_sponsor(uuid, uuid),
  public.v2_update_sponsor_payment(uuid, uuid, numeric, date, text, text, text), public.v2_update_sponsor_evidence_note(uuid, uuid, text),
  public.v2_update_sponsor_movement(uuid, uuid, text, text, boolean), public.v2_update_social_metric(uuid, uuid, numeric, text, text, date, date, text, text, text, boolean),
  public.v2_clear_sponsor_asset_photo(uuid, uuid), public.v2_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb),
  public.v2_decide_sponsor_quote_discount(uuid, uuid, boolean, text), public.v2_set_sponsor_quote_status(uuid, uuid, text),
  public.v2_archive_sponsor_quote(uuid, uuid), public.v2_sponsor_quotes(uuid) from public, anon;