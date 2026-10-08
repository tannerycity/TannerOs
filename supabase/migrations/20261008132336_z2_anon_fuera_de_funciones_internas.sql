-- Segunda capa: el visitante sin sesión no toca funciones internas
--
-- HALLAZGO DE QA S-01 (08/10/2026): 33 funciones internas de public (guardar
-- el expediente, registrar gastos, configurar el club, catálogo…) las podía
-- llamar el rol anon, el de alguien sin sesión. Se probaron las 33 como
-- anónimo y todas rechazaban por dentro: no había fuga, pero era una sola
-- capa. Si una función nueva olvidaba su revisión, quedaba expuesta.
--
-- CAUSA: el valor por defecto de la base le da EXECUTE a anon sobre toda
-- función nueva en public, y estas migraciones nunca se lo quitaron.
--
-- QUÉ HACE:
--   1. A las 33 les quita EXECUTE a public y anon, y deja a authenticated
--      (el staff y las familias con sesión no notan nada).
--   2. Cambia el valor por defecto: las funciones nuevas que cree postgres en
--      public ya no nacen ejecutables por anon. Un formulario público
--      (v2_public_*) tiene que darle permiso a anon a propósito, como ya
--      hacen todos los que existen.
--
-- NO TOCA: las v2_public_* (formularios públicos, registro, tienda por link),
-- que sí son para visitantes sin sesión.
--
-- REVERSIBLE: grant execute ... to anon en cada una, y
-- alter default privileges ... grant execute on functions to anon.

revoke execute on function public.v2_academy_admin(organization_id uuid) from public, anon;
grant execute on function public.v2_academy_admin(organization_id uuid) to authenticated;
revoke execute on function public.v2_assign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid) from public, anon;
grant execute on function public.v2_assign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid) to authenticated;
revoke execute on function public.v2_assign_equipment(organization_id uuid, item_id uuid, assigned_to_user_id uuid, assigned_to_label text, quantity integer, notes text, equipment_unit_id uuid) from public, anon;
grant execute on function public.v2_assign_equipment(organization_id uuid, item_id uuid, assigned_to_user_id uuid, assigned_to_label text, quantity integer, notes text, equipment_unit_id uuid) to authenticated;
revoke execute on function public.v2_benefit_requests(organization_id uuid, player_id uuid) from public, anon;
grant execute on function public.v2_benefit_requests(organization_id uuid, player_id uuid) to authenticated;
revoke execute on function public.v2_billing_players(organization_id uuid) from public, anon;
grant execute on function public.v2_billing_players(organization_id uuid) to authenticated;
revoke execute on function public.v2_can_set_joined_at(organization_id uuid) from public, anon;
grant execute on function public.v2_can_set_joined_at(organization_id uuid) to authenticated;
revoke execute on function public.v2_catalog(organization_id uuid) from public, anon;
grant execute on function public.v2_catalog(organization_id uuid) to authenticated;
revoke execute on function public.v2_convert_and_enroll_academy_prospect(organization_id uuid, prospect_id uuid, academy_id uuid, starts_on date, agreed_fee numeric) from public, anon;
grant execute on function public.v2_convert_and_enroll_academy_prospect(organization_id uuid, prospect_id uuid, academy_id uuid, starts_on date, agreed_fee numeric) to authenticated;
revoke execute on function public.v2_correct_order_payment(organization_id uuid, payment_id uuid, reason text) from public, anon;
grant execute on function public.v2_correct_order_payment(organization_id uuid, payment_id uuid, reason text) to authenticated;
revoke execute on function public.v2_equipment_assignments(organization_id uuid, active_only boolean) from public, anon;
grant execute on function public.v2_equipment_assignments(organization_id uuid, active_only boolean) to authenticated;
revoke execute on function public.v2_equipment_coaches(organization_id uuid) from public, anon;
grant execute on function public.v2_equipment_coaches(organization_id uuid) to authenticated;
revoke execute on function public.v2_equipment_history(organization_id uuid, item_id uuid, unit_id uuid) from public, anon;
grant execute on function public.v2_equipment_history(organization_id uuid, item_id uuid, unit_id uuid) to authenticated;
revoke execute on function public.v2_equipment_inventory_value(organization_id uuid) from public, anon;
grant execute on function public.v2_equipment_inventory_value(organization_id uuid) to authenticated;
revoke execute on function public.v2_expenses(organization_id uuid, period date) from public, anon;
grant execute on function public.v2_expenses(organization_id uuid, period date) to authenticated;
revoke execute on function public.v2_my_equipment_reports(organization_id uuid) from public, anon;
grant execute on function public.v2_my_equipment_reports(organization_id uuid) to authenticated;
revoke execute on function public.v2_portal_accept_consent(player_id uuid, code text) from public, anon;
grant execute on function public.v2_portal_accept_consent(player_id uuid, code text) to authenticated;
revoke execute on function public.v2_portal_paperwork(player_id uuid) from public, anon;
grant execute on function public.v2_portal_paperwork(player_id uuid) to authenticated;
revoke execute on function public.v2_portal_progress(player_id uuid) from public, anon;
grant execute on function public.v2_portal_progress(player_id uuid) to authenticated;
revoke execute on function public.v2_portal_request_benefit(player_id uuid, reason text) from public, anon;
grant execute on function public.v2_portal_request_benefit(player_id uuid, reason text) to authenticated;
revoke execute on function public.v2_post_expense(organization_id uuid, amount numeric, expense_date date, category text, method text, reference text, concept text, metadata jsonb, idempotency_key text, supplier_name text, paid_by_name text) from public, anon;
grant execute on function public.v2_post_expense(organization_id uuid, amount numeric, expense_date date, category text, method text, reference text, concept text, metadata jsonb, idempotency_key text, supplier_name text, paid_by_name text) to authenticated;
revoke execute on function public.v2_production_batch_sheet(organization_id uuid, batch_id uuid) from public, anon;
grant execute on function public.v2_production_batch_sheet(organization_id uuid, batch_id uuid) to authenticated;
revoke execute on function public.v2_resolve_benefit_request(organization_id uuid, request_id uuid, status text, note text) from public, anon;
grant execute on function public.v2_resolve_benefit_request(organization_id uuid, request_id uuid, status text, note text) to authenticated;
revoke execute on function public.v2_resolve_equipment_report(organization_id uuid, report_id uuid, status text, resolution_note text) from public, anon;
grant execute on function public.v2_resolve_equipment_report(organization_id uuid, report_id uuid, status text, resolution_note text) to authenticated;
revoke execute on function public.v2_save_player_profile(organization_id uuid, player_id uuid, first_name text, last_name text, birth_date date, player_position text, dominant_foot text, jersey_number text, school text, blood_type text, allergies text, address text, emergency_contact_name text, emergency_contact_phone text, notes text, guardian_name text, guardian_phone text, guardian_email text, guardian_relationship text, can_pickup boolean, receives_billing boolean, category_id uuid, category_effective_date date, category_notes text, sex text, joined_at date, registered_at date) from public, anon;
grant execute on function public.v2_save_player_profile(organization_id uuid, player_id uuid, first_name text, last_name text, birth_date date, player_position text, dominant_foot text, jersey_number text, school text, blood_type text, allergies text, address text, emergency_contact_name text, emergency_contact_phone text, notes text, guardian_name text, guardian_phone text, guardian_email text, guardian_relationship text, can_pickup boolean, receives_billing boolean, category_id uuid, category_effective_date date, category_notes text, sex text, joined_at date, registered_at date) to authenticated;
revoke execute on function public.v2_set_bundle_archived(organization_id uuid, id uuid, archived boolean) from public, anon;
grant execute on function public.v2_set_bundle_archived(organization_id uuid, id uuid, archived boolean) to authenticated;
revoke execute on function public.v2_set_order_payment_plan(organization_id uuid, order_id uuid, required_percent numeric, note text) from public, anon;
grant execute on function public.v2_set_order_payment_plan(organization_id uuid, order_id uuid, required_percent numeric, note text) to authenticated;
revoke execute on function public.v2_set_player_photo(organization_id uuid, player_id uuid, photo_path text, photo_thumb_path text) from public, anon;
grant execute on function public.v2_set_player_photo(organization_id uuid, player_id uuid, photo_path text, photo_thumb_path text) to authenticated;
revoke execute on function public.v2_set_product_archived(organization_id uuid, id uuid, archived boolean) from public, anon;
grant execute on function public.v2_set_product_archived(organization_id uuid, id uuid, archived boolean) to authenticated;
revoke execute on function public.v2_set_product_photo(organization_id uuid, product_id uuid, photo_path text, photo_thumb_path text, photo_bucket text) from public, anon;
grant execute on function public.v2_set_product_photo(organization_id uuid, product_id uuid, photo_path text, photo_thumb_path text, photo_bucket text) to authenticated;
revoke execute on function public.v2_unassign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid) from public, anon;
grant execute on function public.v2_unassign_academy_staff(organization_id uuid, academy_id uuid, user_id uuid) to authenticated;
revoke execute on function public.v2_update_club_config(organization_id uuid, whatsapp text, password_prefix text, store_url text) from public, anon;
grant execute on function public.v2_update_club_config(organization_id uuid, whatsapp text, password_prefix text, store_url text) to authenticated;
revoke execute on function public.v2_upsert_bundle(organization_id uuid, id uuid, name text, description text, price_adult numeric, price_kid numeric, components jsonb, active boolean, valid_until date, notes text) from public, anon;
grant execute on function public.v2_upsert_bundle(organization_id uuid, id uuid, name text, description text, price_adult numeric, price_kid numeric, components jsonb, active boolean, valid_until date, notes text) to authenticated;
revoke execute on function public.v2_upsert_product(organization_id uuid, id uuid, name text, sku text, category text, price numeric, cost numeric, sizes jsonb, active boolean, description text, lead_days integer) from public, anon;
grant execute on function public.v2_upsert_product(organization_id uuid, id uuid, name text, sku text, category text, price numeric, cost numeric, sizes jsonb, active boolean, description text, lead_days integer) to authenticated;

-- 2. Las funciones nuevas de public ya no nacen abiertas a anon.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
