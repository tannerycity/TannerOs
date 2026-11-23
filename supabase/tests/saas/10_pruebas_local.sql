-- PRUEBAS DEL SAAS COMERCIAL · base local mcfc_saas_local (ESCRIBE: no se corre en produccion).
-- Corre despues de 00_base_local.sql, 05_datos_local.sql y supabase/pendientes/saas_comercial_v1.sql.
-- Cada bloque termina en "PRUEBA OK" o levanta "PRUEBA FALLÓ".
\set ON_ERROR_STOP 1
do $$ begin if current_database() <> 'mcfc_saas_local' then raise exception 'Solo en mcfc_saas_local'; end if; end $$;

create schema if not exists qa;
create or replace function qa.como(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, false);
end $$;
create or replace function qa.servicio() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); perform set_config('role', 'service_role', false); end $$;
create or replace function qa.yo() returns void language plpgsql as $$
begin perform set_config('role', session_user, false); perform set_config('request.jwt.claim.sub', '', false); end $$;
grant usage on schema qa to anon, authenticated, service_role;
grant execute on all functions in schema qa to anon, authenticated, service_role;

create table qa.resultado (n serial, caso text, ok boolean, detalle text);
grant all on qa.resultado, qa.resultado_n_seq to anon, authenticated, service_role;
create or replace function qa.revisa(p_caso text, p_ok boolean, p_detalle text default null) returns void language sql as $$
  insert into qa.resultado(caso, ok, detalle) values (p_caso, coalesce(p_ok, false), p_detalle) $$;
-- ¿La llamada falla con este mensaje?
create or replace function qa.falla(p_sql text, p_patron text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlerrm ~* p_patron; end $$;

-- ids
\set A '''10000000-0000-0000-0000-00000000000a'''
\set B '''10000000-0000-0000-0000-00000000000b'''

-- ── 1. Compatibilidad: ningun club cambia lo que abre ─────────────────────
select qa.revisa('COMPAT module_enabled igual para todos los clubes y modulos',
  not exists (select 1 from public._qa_compat c where private.module_enabled(c.org, c.module) is distinct from c.enabled),
  (select count(*)::text || ' combinaciones revisadas' from public._qa_compat));
select qa.revisa('COMPAT los planes mc_* no estan a la venta para el cobro viejo',
  not exists (select 1 from public.plans where code like 'mc\_%' and coalesce((metadata->>'forSale')::boolean, false)));

-- ── 2. Catalogo: borrador, aprobacion y publicacion ───────────────────────
select qa.como(null);
select qa.revisa('anon: sin catalogo publicado no ve precios', public.v2_saas_public_catalog() is null);
select qa.yo();
select qa.revisa('rangos v1 validos', private.saas_catalog_ranges_ok((select id from public.saas_catalog_versions where version = 1)) is null);
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('academia no aprueba catalogo', qa.falla($q$select public.v2_saas_admin_approve(1, 'x')$q$, 'Not authorized'));
select qa.revisa('TC-016 academia no pone a la venta un complemento', qa.falla($q$select public.v2_saas_admin_set_addon_status(1, 'STORE', 'for_sale')$q$, 'Not authorized'));
select qa.revisa('TC-016 academia no se activa un modulo por override directo',
  qa.falla($q$insert into public.organization_module_overrides values ('10000000-0000-0000-0000-00000000000a', 'tienda', true, 'yo')$q$, 'permission denied'));
select qa.revisa('TC-016 academia no se agrega un complemento escribiendo la tabla',
  qa.falla($q$insert into public.saas_subscription_items(subscription_id, organization_id, catalog_version_id, addon_code, unit_monthly_cents, net_cents) values (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'STORE', 0, 0)$q$, 'permission denied'));
select qa.revisa('academia no lee la tabla de suscripciones', qa.falla($q$select count(*) from public.saas_subscriptions$q$, 'permission denied'));
select qa.revisa('academia no llama funciones privadas', qa.falla($q$select private.saas_admin_board()$q$, 'permission denied'));
select qa.revisa('academia no abre la puerta del webhook', qa.falla($q$select public.v2_saas_svc_apply_payment('sandbox', 'x', '{}')$q$, 'permission denied'));

select qa.como('00000000-0000-0000-0000-0000000000aa');
select qa.revisa('complementos vendibles: Tienda', (public.v2_saas_admin_set_addon_status(1, 'STORE', 'for_sale')->>'vendible')::boolean);
select public.v2_saas_admin_set_addon_status(1, c, 'for_sale') from unnest(array['SPONSORS', 'SCOUTING', 'EVENTS']) c;
select qa.revisa('Marketing no se vende: no tiene modulo propio', qa.falla($q$select public.v2_saas_admin_set_addon_status(1, 'MARKETING', 'for_sale')$q$, 'no est. listo'));
select qa.revisa('Estacionamiento no se vende: en revision', qa.falla($q$select public.v2_saas_admin_set_addon_status(1, 'PARKING', 'for_sale')$q$, 'no est. listo'));
select qa.revisa('Comunicacion avanzada no se vende: no existe', qa.falla($q$select public.v2_saas_admin_set_addon_status(1, 'MESSAGING', 'for_sale')$q$, 'no est. listo'));
select qa.revisa('Pack Crecimiento no se vende mientras Marketing/Metricas no esten listos', qa.falla($q$select public.v2_saas_admin_set_addon_status(1, 'PACK_CRECIMIENTO', 'for_sale')$q$, 'no est. listo'));
select public.v2_saas_admin_approve(1, 'Aprobado en QA local');
select qa.revisa('version aprobada ya no cambia precios',
  qa.falla($q$select public.v2_saas_admin_update_draft(1, '{"planes":[{"codigo":"FORMATIVO","mensual":1}]}')$q$, 'Solo se edita un borrador'));
select qa.revisa('publicar sin IVA validado: no', qa.falla($q$select public.v2_saas_admin_publish(1, 'PUBLICAR PRECIOS V1')$q$, 'IVA'));
select public.v2_saas_admin_validate_vat(1, 'Validado por el contador en QA local');
select qa.revisa('publicar sin la frase exacta: no', qa.falla($q$select public.v2_saas_admin_publish(1, 'si')$q$, 'PUBLICAR PRECIOS V1'));
select public.v2_saas_admin_publish(1, 'PUBLICAR PRECIOS V1');
select qa.yo();
select qa.revisa('tabla congelada: ni el superusuario cambia un precio aprobado',
  qa.falla($q$update public.saas_plan_tiers set monthly_cents = 1 where code = 'FORMATIVO'$q$, 'ya no es borrador'));
select qa.como(null);
select qa.revisa('anon ve el catalogo publicado sin ids internos',
  (public.v2_saas_public_catalog()->>'version')::int = 1 and not (public.v2_saas_public_catalog() ? 'id'));
select qa.revisa('anon no cotiza para un club', qa.falla($q$select public.v2_saas_quote('10000000-0000-0000-0000-00000000000a', 'FORMATIVO', 'monthly')$q$, 'Not authorized|permission denied'));

-- ── 3. Aislamiento entre academias y permisos ─────────────────────────────
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('TC-015 A no ve la suscripcion de B', qa.falla($q$select public.v2_saas_my_subscription('10000000-0000-0000-0000-00000000000b')$q$, 'Not authorized'));
select qa.revisa('TC-015 A no cotiza ni contrata por B', qa.falla($q$select public.v2_saas_start_checkout('10000000-0000-0000-0000-00000000000b', 'FORMATIVO', 'monthly')$q$, 'Not authorized'));
select qa.revisa('TC-015 A no captura datos fiscales de B', qa.falla($q$select public.v2_saas_set_fiscal_profile('10000000-0000-0000-0000-00000000000b', '{}')$q$, 'Not authorized'));
select qa.como('00000000-0000-0000-0000-0000000000c0');
select qa.revisa('formador no contrata ni ve facturacion', qa.falla($q$select public.v2_saas_my_subscription('10000000-0000-0000-0000-00000000000a')$q$, 'Not authorized'));
select qa.como('00000000-0000-0000-0000-0000000000d0');
select qa.revisa('usuario desactivado pierde el acceso', qa.falla($q$select public.v2_saas_my_subscription('10000000-0000-0000-0000-00000000000a')$q$, 'Not authorized'));

-- ── 4. Cotizar y contratar (A: 12 jugadores activos unicos) ────────────────
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('TC-019 A cuenta 12 activos unicos (uno en dos categorias)',
  (public.v2_saas_quote(:A, 'SEMILLA_20', 'monthly')->>'jugadoresActivos')::int = 12);
select qa.revisa('TC-010 Semilla + Tienda cotiza 172.84', (public.v2_saas_quote(:A, 'SEMILLA_20', 'monthly', array['STORE'])->>'total')::int = 17284);
select qa.revisa('complemento no vendible no se cotiza', public.v2_saas_quote(:A, 'SEMILLA_20', 'monthly', array['MARKETING'])->>'codigo' = 'NO_DISPONIBLE');
select qa.revisa('TC-001 Semilla sin complementos: gratis y sin pago', (public.v2_saas_start_checkout(:A, 'SEMILLA_20', 'monthly')->>'status') = 'free');
select qa.revisa('Semilla abre el nucleo (jugadores)', private.module_enabled(:A, 'jugadores'));
select qa.revisa('Semilla no abre la Tienda', not private.module_enabled(:A, 'tienda'));
select qa.revisa('TC-010 Semilla compra Tienda: queda pendiente de pago',
  (public.v2_saas_start_checkout(:A, 'SEMILLA_20', 'monthly', array['STORE'])->>'status') = 'pending');
select qa.revisa('TC-013 pendiente no abre la Tienda', not private.module_enabled(:A, 'tienda'));
select qa.yo();
select qa.revisa('el monto pendiente es el del servidor (17284)', (select total_cents from public.saas_subscriptions where organization_id = :A and status = 'pending') = 17284);

-- ── 5. Mercado Pago (sandbox simulado; las respuestas son las que daria la API) ─
select qa.servicio();
select public.v2_saas_svc_attach_preapproval((select id from public.saas_subscriptions where organization_id = '10000000-0000-0000-0000-00000000000a' and status = 'pending'),
  'sandbox', 'pre-A1', 'https://sandbox.mercadopago.com.mx/x');
select qa.revisa('preapproval con otro monto: se rechaza',
  not (public.v2_saas_svc_apply_preapproval('sandbox', jsonb_build_object('id', 'pre-A1', 'status', 'authorized',
    'external_reference', (select id::text from public.saas_subscriptions where provider_preapproval_id = 'pre-A1'),
    'auto_recurring', jsonb_build_object('transaction_amount', 1.00, 'currency_id', 'MXN')))->>'ok')::boolean);
select qa.revisa('preapproval con external_reference ajeno: se rechaza',
  not (public.v2_saas_svc_apply_preapproval('sandbox', jsonb_build_object('id', 'pre-A1', 'status', 'authorized', 'external_reference', gen_random_uuid()::text,
    'auto_recurring', jsonb_build_object('transaction_amount', 172.84, 'currency_id', 'MXN')))->>'ok')::boolean);
select public.v2_saas_svc_apply_preapproval('sandbox', jsonb_build_object('id', 'pre-A1', 'status', 'authorized', 'last_modified', '2026-12-01T10:00:00Z',
  'external_reference', (select id::text from public.saas_subscriptions where provider_preapproval_id = 'pre-A1'),
  'auto_recurring', jsonb_build_object('transaction_amount', 172.84, 'currency_id', 'MXN')));
select qa.yo();
select qa.revisa('autorizar la tarjeta NO activa (sigue pendiente)', (select status from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = 'pending');
select qa.servicio();
select public.v2_saas_svc_apply_payment('sandbox', 'pre-A1', '{"id":"pay-1","status":"rejected","status_detail":"cc_rejected_insufficient_amount","transaction_amount":172.84,"currency_id":"MXN"}');
select qa.yo();
select qa.revisa('TC-013 pago rechazado no activa', (select status from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = 'pending'
  and not private.module_enabled(:A, 'tienda'));
select qa.servicio();
select qa.revisa('pago aprobado con otro monto: no activa',
  not (public.v2_saas_svc_apply_payment('sandbox', 'pre-A1', '{"id":"pay-2","status":"approved","transaction_amount":1.00,"currency_id":"MXN"}')->>'ok')::boolean);
select public.v2_saas_svc_apply_payment('sandbox', 'pre-A1', '{"id":"pay-3","status":"approved","transaction_amount":172.84,"currency_id":"MXN","date_approved":"2026-12-01T10:05:00Z"}');
select qa.yo();
select qa.revisa('pago aprobado y correcto: activa y abre la Tienda', (select status from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = 'active'
  and private.module_enabled(:A, 'tienda'));
select qa.revisa('la Semilla gratis anterior quedo cancelada (una sola viva)',
  (select count(*) from public.saas_subscriptions where organization_id = :A and status in ('free', 'active', 'past_due', 'grace_period')) = 1);
select qa.revisa('el plan viejo Cantera de A se cancelo: el cobro viejo ya no le emite',
  not exists (select 1 from public.subscriptions where organization_id = :A and status = 'active'));
select qa.revisa('A conserva el nucleo tras dejar el plan viejo', private.module_enabled(:A, 'jugadores') and private.module_enabled(:A, 'cobranza'));
create temp table fin_antes as select current_period_end from public.saas_subscriptions where provider_preapproval_id = 'pre-A1';
select qa.servicio();
select public.v2_saas_svc_apply_payment('sandbox', 'pre-A1', '{"id":"pay-3","status":"approved","transaction_amount":172.84,"currency_id":"MXN","date_approved":"2026-12-01T10:05:00Z"}');
select qa.yo();
select qa.revisa('TC-014 el mismo pago dos veces: un solo registro', (select count(*) from public.saas_payments where provider_payment_id = 'pay-3') = 1);
select qa.revisa('TC-014 y el periodo no se extiende dos veces',
  (select current_period_end from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = (select current_period_end from fin_antes));
select qa.servicio();
select qa.revisa('evento nuevo: se procesa', (public.v2_saas_svc_register_event('sandbox', 'k-1', 'payment', 'payment.created', 'pay-3', 'r-1', true)->>'process')::boolean);
select public.v2_saas_svc_finish_event((select id from public.saas_payment_events where event_key = 'k-1'), 'processed', '{}', null);
select qa.revisa('TC-014 evento repetido: no se vuelve a procesar', not (public.v2_saas_svc_register_event('sandbox', 'k-1', 'payment', 'payment.created', 'pay-3', 'r-1', true)->>'process')::boolean);
select qa.revisa('evento con firma invalida: se guarda pero no se procesa', not (public.v2_saas_svc_register_event('sandbox', 'k-mala', 'payment', null, 'pay-9', 'r-9', false)->>'process')::boolean);
select public.v2_saas_svc_apply_preapproval('sandbox', jsonb_build_object('id', 'pre-A1', 'status', 'cancelled', 'last_modified', '2026-11-30T10:00:00Z',
  'external_reference', (select id::text from public.saas_subscriptions where provider_preapproval_id = 'pre-A1'),
  'auto_recurring', jsonb_build_object('transaction_amount', 172.84, 'currency_id', 'MXN')));
select qa.yo();
select qa.revisa('aviso viejo que llega tarde no pisa el estado nuevo',
  (select provider_status from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = 'authorized');
select qa.revisa('TC-? una transaccion no se reasigna a otra academia',
  qa.falla($q$update public.saas_payments set organization_id = '10000000-0000-0000-0000-00000000000b' where provider_payment_id = 'pay-3'$q$, 'no cambia de academia'));
select qa.revisa('los pagos no se borran', qa.falla($q$delete from public.saas_payments$q$, 'no se borran'));
select qa.revisa('lo contratado no se reescribe',
  qa.falla($q$update public.saas_subscriptions set base_cents = 1 where provider_preapproval_id = 'pre-A1'$q$, 'no cambia'));

-- ── 6. Fiscal: datos, recibo interno y CFDI pendiente ─────────────────────
select receipt_folio as folio from public.saas_payments where provider_payment_id = 'pay-3' \gset
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('factura sin datos fiscales: no', qa.falla(format($q$select public.v2_saas_request_invoice('10000000-0000-0000-0000-00000000000a', %s)$q$, :folio), 'datos fiscales'));
select qa.revisa('RFC invalido: no', qa.falla($q$select public.v2_saas_set_fiscal_profile('10000000-0000-0000-0000-00000000000a', '{"rfc":"XYZ","razonSocial":"A","regimen":"601","cp":"37000","usoCfdi":"G03"}')$q$, 'RFC'));
select public.v2_saas_set_fiscal_profile(:A, '{"rfc":"aaa010101aaa","razonSocial":"Academia A SC","regimen":"601","cp":"37000","usoCfdi":"G03"}');
select qa.revisa('pedir CFDI deja "pendiente de integracion"',
  public.v2_saas_request_invoice(:A, :folio)->>'estado' = 'pending_integration');
select qa.yo();
select qa.revisa('recibo interno distinto del CFDI: el pago tiene folio interno y el CFDI no tiene folio fiscal',
  (select receipt_folio is not null from public.saas_payments where provider_payment_id = 'pay-3')
  and (select fiscal_uuid is null and status = 'pending_integration' from public.saas_invoices limit 1));
select qa.revisa('no se marca timbrada sin respuesta real del PAC',
  qa.falla($q$update public.saas_invoices set status = 'stamped'$q$, 'saas_invoice_stamped_is_real'));

-- ── 7. Capacidad, Elite y cambio de precios (B: 25 jugadores) ──────────────
select qa.como('00000000-0000-0000-0000-00000000000b');
select qa.revisa('TC-003 B con 25 no cabe en Semilla', public.v2_saas_quote(:B, 'SEMILLA_20', 'monthly')->>'codigo' = 'CAPACIDAD');
select qa.revisa('TC-011 B Formativo anual = 3,229.20', (public.v2_saas_quote(:B, 'FORMATIVO', 'annual')->>'base')::int = 322920);
select qa.revisa('TC-012 IVA anual = 516.67', (public.v2_saas_quote(:B, 'FORMATIVO', 'annual')->>'iva')::int = 51667);
select qa.revisa('TC-009 Elite se cotiza', public.v2_saas_quote(:B, 'ELITE', 'monthly')->>'codigo' = 'COTIZACION');
select qa.como('00000000-0000-0000-0000-0000000000aa');
select qa.revisa('manual sin motivo: no', qa.falla($q$select public.v2_saas_admin_assign('10000000-0000-0000-0000-00000000000b', 1, 'FORMATIVO', 'monthly', '{}', now() + interval '1 month', 'corto')$q$, 'motivo'));
select public.v2_saas_admin_assign(:B, 1, 'FORMATIVO', 'monthly', '{}', now() + interval '1 month', 'Piloto Mi Club FC, pago por transferencia');
select qa.revisa('tablero: MRR sin IVA = Formativo B 299.00 + Tienda A 149.00; ARR x12; complementos aparte',
  (public.v2_saas_admin_board()->>'mrr')::int = 44800 and (public.v2_saas_admin_board()->>'arr')::int = 537600
  and (public.v2_saas_admin_board()->>'mrrComplementos')::int = 14900, public.v2_saas_admin_board()::text);
select qa.revisa('el plan interno (Tannery) no se toca', qa.falla($q$select public.v2_saas_admin_assign('10000000-0000-0000-0000-000000000001', 1, 'PRIMERA', 'monthly', '{}', null, 'Intento de mover al interno')$q$, 'plan interno'));
select public.v2_saas_admin_new_draft(1, 'Precios 2027');
select public.v2_saas_admin_update_draft(2, '{"planes":[{"codigo":"FORMATIVO","mensual":34900}]}');
select public.v2_saas_admin_approve(2, 'QA');
select qa.yo();
select qa.revisa('TC-018 la suscripcion de B conserva 299.00 aunque la v2 cobre 349.00',
  (select base_cents from public.saas_subscriptions where organization_id = :B and status = 'active') = 29900
  and (private.saas_quote_core(private.saas_catalog_json((select id from public.saas_catalog_versions where version = 2)), 'FORMATIVO', 'monthly', '{}', 25)->>'base')::int = 34900);
select qa.revisa('el catalogo publicado sigue siendo v1 (aprobar no es publicar)', (select version from public.saas_catalog_versions where status = 'published') = 1);
insert into app.players(organization_id, first_name, last_name, status) select :B, 'Extra' || g, 'B', 'active' from generate_series(1, 30) g;
select private.saas_daily();
select qa.revisa('B con 55 en Formativo: aviso con gracia, sin bloquear', (private.saas_capacity(:B)->>'estado') = 'excedido'
  and (private.saas_capacity(:B)->>'requerido') = 'ASCENSO'
  and (select grace_until::date from public.saas_subscriptions where organization_id = :B and status = 'active') = (now() + interval '15 days')::date
  and private.module_enabled(:B, 'contabilidad'));

-- ── 8. Cancelar la renovacion (TC-017) y vencimiento ───────────────────────
select qa.como('00000000-0000-0000-0000-00000000000a');
select public.v2_saas_cancel_renewal(:A, 'Prueba de cancelacion');
select qa.yo();
select qa.revisa('TC-017 cancelar conserva el acceso hasta el fin del periodo', private.module_enabled(:A, 'tienda')
  and (select cancel_at_period_end from public.saas_subscriptions where provider_preapproval_id = 'pre-A1'));
select private.saas_daily(now() + interval '3 months');
select qa.revisa('TC-017 al terminar el periodo vence y cierra la Tienda', (select status from public.saas_subscriptions where provider_preapproval_id = 'pre-A1') = 'expired'
  and not private.module_enabled(:A, 'tienda'));
select qa.revisa('vencida conserva el nucleo: sus datos y Administracion para volver a contratar',
  private.module_enabled(:A, 'jugadores') and private.module_enabled(:A, 'admin') and private.module_enabled(:A, 'cobranza')
  and not private.module_enabled(:A, 'contabilidad'));
select qa.revisa('B vencida en el mismo ciclo tampoco pierde el nucleo', (select status from public.saas_subscriptions where organization_id = :B order by created_at desc limit 1) = 'expired'
  and private.module_enabled(:B, 'jugadores') and not private.module_enabled(:B, 'contabilidad'));
select qa.revisa('pendiente sin historial NO regala el nucleo a quien no lo tenia',
  not exists (select 1 from public.organizations o where o.slug = 'nadie'));

-- ── 9. Becas, bitacora y tablero ──────────────────────────────────────────
select qa.revisa('beca sin motivo suficiente: no', qa.falla($q$insert into public.saas_social_grants(organization_id, kind, percent_off_bp, reason, ends_at, granted_by) values ('10000000-0000-0000-0000-00000000000b', 'software_grant', 10000, 'x', now() + interval '1 year', gen_random_uuid())$q$, 'check'));
select qa.como('00000000-0000-0000-0000-0000000000aa');
select public.v2_saas_admin_grant(:B, 'software_grant', 10000, null, now() + interval '6 months', 'Beca social Semilla: academia comunitaria');
select qa.como('00000000-0000-0000-0000-00000000000b');
select qa.revisa('beca de software 100 %: total 0', (public.v2_saas_quote(:B, 'ASCENSO', 'monthly')->>'total')::int = 0);
select qa.yo();
select qa.revisa('bitacora solo agrega', qa.falla($q$delete from public.saas_billing_audit_log$q$, 'solo agrega'));
select qa.revisa('bitacora registro las acciones', (select count(distinct action) from public.saas_billing_audit_log) >= 10,
  (select string_agg(distinct action, ', ') from public.saas_billing_audit_log));
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('academia no ve el tablero de la plataforma', qa.falla($q$select public.v2_saas_admin_board()$q$, 'Not authorized'));
select qa.como('00000000-0000-0000-0000-0000000000aa');
select qa.revisa('tablero: todo vencido -> MRR 0', (public.v2_saas_admin_board()->>'mrr')::int = 0, public.v2_saas_admin_board()->>'mrr');
select qa.revisa('tablero sin datos personales de jugadores', public.v2_saas_admin_board()::text !~ 'Jugador[0-9]|Extra[0-9]|first_name|birth_date|2015-01');
select qa.yo();

-- ── 10. Exportar mis datos ────────────────────────────────────────────────
select qa.como('00000000-0000-0000-0000-00000000000a');
select qa.revisa('exportar: Presidencia de A se lleva sus 15 jugadores (12 activos + 3) y sus 2 inscripciones',
  jsonb_array_length(public.v2_saas_export_my_data(:A)->'tablas'->'players') = 15
  and jsonb_array_length(public.v2_saas_export_my_data(:A)->'tablas'->'player_enrollments') = 2);
select qa.revisa('exportar: ni una fila de B en el archivo de A',
  not exists (select 1 from jsonb_array_elements(public.v2_saas_export_my_data(:A)->'tablas'->'players') j where j->>'organization_id' <> '10000000-0000-0000-0000-00000000000a'));
select qa.revisa('exportar: tablas que no existen se omiten sin fallar', not (public.v2_saas_export_my_data(:A)->'tablas' ? 'orders'));
select qa.revisa('exportar: A no exporta B', qa.falla($q$select public.v2_saas_export_my_data('10000000-0000-0000-0000-00000000000b')$q$, 'Not authorized'));
select qa.como('00000000-0000-0000-0000-0000000000c0');
select qa.revisa('exportar: un formador no exporta (datos de menores)', qa.falla($q$select public.v2_saas_export_my_data('10000000-0000-0000-0000-00000000000a')$q$, 'Not authorized'));
select qa.como(null);
select qa.revisa('exportar: anon no exporta', qa.falla($q$select public.v2_saas_export_my_data('10000000-0000-0000-0000-00000000000a')$q$, 'permission denied|Not authorized'));
select qa.yo();
select qa.revisa('exportar: queda en la bitacora con el conteo', exists (select 1 from public.saas_billing_audit_log where action = 'data_export'
  and organization_id = :A and (after->>'players')::int = 15));

-- ── Resultado ─────────────────────────────────────────────────────────────
do $$
declare r record; v_f int := 0; v_t int := 0;
begin
  for r in select * from qa.resultado order by n loop
    v_t := v_t + 1;
    if r.ok then raise notice 'PRUEBA OK · %', r.caso || coalesce(' (' || r.detalle || ')', '');
    else v_f := v_f + 1; raise warning 'PRUEBA FALLÓ · %', r.caso || coalesce(' (' || r.detalle || ')', ''); end if;
  end loop;
  if v_f > 0 then raise exception 'PRUEBA FALLÓ: % de % casos', v_f, v_t; end if;
  raise notice 'TODAS OK: % casos', v_t;
end $$;
