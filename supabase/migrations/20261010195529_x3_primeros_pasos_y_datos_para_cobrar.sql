-- Primeros pasos del dueño y datos para cobrar.
--
-- 1. Un club nuevo no tenía dónde capturar su banco, CLABE y titular: la
--    tienda y los mensajes de cobro los usan (settings.paymentInstructions) y
--    sólo Tannery los tenía, cargados a mano. v2_update_payment_info los
--    guarda, con la CLABE validada (18 dígitos y dígito verificador).
-- 2. La preparación del club hablaba en sistema ("Plan SaaS", "Módulos
--    habilitados", "Corte de sistema anterior"). Ahora son los pasos de un
--    dueño, en orden y con su botón: escudo, aviso de privacidad, cuotas,
--    datos para cobrar, jugadores y equipo. El corte del sistema anterior
--    sólo aparece en el club que lo tuvo (Tannery).

create or replace function private.clabe_valida(p text)
returns boolean language plpgsql immutable set search_path to 'pg_catalog'
as $function$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int := 0; w int[] := array[3,7,1]; i int;
begin
  if length(d) <> 18 then return false; end if;
  for i in 1..17 loop
    s := s + ((substr(d, i, 1)::int * w[((i - 1) % 3) + 1]) % 10);
  end loop;
  return (10 - (s % 10)) % 10 = substr(d, 18, 1)::int;
end $function$;

create or replace function private.command_update_payment_info(p_organization_id uuid, p_info jsonb)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v_actor uuid := (select auth.uid()); v_actual jsonb; v_bank text; v_clabe text; v_holder text; v_methods jsonb; v_next jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id, 'admin', true) then raise exception 'Not authorized'; end if;
  if p_info is null or jsonb_typeof(p_info) <> 'object' then raise exception 'Datos de cobro inválidos'; end if;

  v_bank := nullif(btrim(coalesce(p_info->>'bank', '')), '');
  v_clabe := nullif(regexp_replace(coalesce(p_info->>'clabe', ''), '\D', '', 'g'), '');
  v_holder := nullif(btrim(coalesce(p_info->>'holder', '')), '');
  if v_clabe is not null and not private.clabe_valida(v_clabe) then
    raise exception 'La CLABE no es válida: son 18 dígitos y el último es de verificación';
  end if;
  if v_clabe is not null and (v_bank is null or v_holder is null) then
    raise exception 'Con la CLABE van el banco y el titular de la cuenta';
  end if;
  if length(coalesce(v_bank, '')) > 60 or length(coalesce(v_holder, '')) > 120 then raise exception 'Banco o titular demasiado largo'; end if;
  select coalesce(jsonb_agg(m), '[]'::jsonb) into v_methods
    from jsonb_array_elements_text(coalesce(p_info->'methods', '[]'::jsonb)) m
   where m in ('Transferencia', 'Efectivo', 'Tarjeta');

  select coalesce(settings->'paymentInstructions', '{}'::jsonb) into v_actual from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  v_next := v_actual
    || jsonb_build_object('methods', v_methods)
    || jsonb_build_object('transfer', case when v_clabe is null then null
                                           else jsonb_build_object('bank', v_bank, 'clabe', v_clabe, 'holder', v_holder) end);
  update public.organizations
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('paymentInstructions', jsonb_strip_nulls(v_next)),
         updated_at = now()
   where id = p_organization_id;

  insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PaymentInfoUpdated', 'organization', p_organization_id,
          jsonb_build_object('bank', v_bank, 'clabeFinal', right(v_clabe, 4), 'methods', v_methods), v_actor);

  return private.query_club_config(p_organization_id);
end $function$;
revoke all on function private.command_update_payment_info(uuid, jsonb) from public, anon, authenticated;

create or replace function public.v2_update_payment_info(organization_id uuid, info jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select private.command_update_payment_info(organization_id, info) $$;
revoke all on function public.v2_update_payment_info(uuid, jsonb) from public, anon;
grant execute on function public.v2_update_payment_info(uuid, jsonb) to authenticated;

create or replace function private.query_onboarding_readiness(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare
  v_org public.organizations%rowtype;
  v_members integer := 0;
  v_players integer := 0;
  v_player_review integer := 0;
  v_billing_review integer := 0;
  v_cats integer := 0;
  v_cats_sin_cuota integer := 0;
  v_docs_pend integer := 0;
  v_tiene_aviso boolean := false;
  v_escudo boolean := false;
  v_clabe boolean := false;
  v_checks jsonb := '[]'::jsonb;
  v_ready integer := 0;
  v_total integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then raise exception 'Organization not found'; end if;

  select count(*) into v_members from public.organization_memberships where organization_id = p_organization_id and active;
  select count(*), count(*) filter (where needs_review) into v_players, v_player_review
    from app.players where organization_id = p_organization_id and archived_at is null and status = 'active';
  select count(*) filter (where needs_review or status = 'review') into v_billing_review from app.billing_profiles where organization_id = p_organization_id;
  select count(*), count(*) filter (where monthly_fee is null) into v_cats, v_cats_sin_cuota
    from app.categories where organization_id = p_organization_id and status = 'active';
  select count(*) filter (where body like '%[PENDIENTE:%'), bool_or(code = 'privacidad')
    into v_docs_pend, v_tiene_aviso
    from app.consent_documents where organization_id = p_organization_id and active;
  v_escudo := coalesce(v_org.branding#>>'{assets,logo}', v_org.branding#>>'{assets,mark}', '') <> '';
  v_clabe := coalesce(v_org.settings#>>'{paymentInstructions,transfer,clabe}', '') <> '';

  v_checks := jsonb_build_array(
    jsonb_build_object('code', 'escudo', 'label', 'Tu escudo y colores',
      'status', case when v_escudo then 'ready' else 'warning' end,
      'detail', case when v_escudo then 'Tu escudo ya sale en la app, el registro y la tienda.' else 'Sube tu escudo: sale en la app, en el registro de familias y en la tienda.' end,
      'href', '/admin/branding/', 'cta', 'Subir escudo'),
    jsonb_build_object('code', 'aviso', 'label', 'Tu aviso de privacidad',
      'status', case when not coalesce(v_tiene_aviso, false) then 'blocker' when v_docs_pend > 0 then 'blocker' else 'ready' end,
      'detail', case when not coalesce(v_tiene_aviso, false) then 'Tu club no tiene aviso de privacidad: lo necesitas para registrar menores.'
                     when v_docs_pend > 0 then 'Falta tu domicilio y tu correo de contacto. Es obligatorio para registrar menores.'
                     else 'Completo y publicado.' end,
      'href', '/admin/centro-tanner/', 'cta', 'Completar aviso'),
    jsonb_build_object('code', 'cuotas', 'label', 'Cuotas por categoría',
      'status', case when v_cats = 0 then 'blocker' when v_cats_sin_cuota > 0 then 'warning' else 'ready' end,
      'detail', case when v_cats = 0 then 'Crea tus categorías y su mensualidad.'
                     when v_cats_sin_cuota > 0 then v_cats_sin_cuota || ' de ' || v_cats || ' categorías sin mensualidad.'
                     else v_cats || ' categorías con su mensualidad.' end,
      'href', '/taquilla/?ver=montos', 'cta', 'Poner cuotas'),
    jsonb_build_object('code', 'cobro', 'label', 'Datos para que te paguen',
      'status', case when v_clabe then 'ready' else 'warning' end,
      'detail', case when v_clabe then 'Las familias ven tu banco y CLABE al pagar.' else 'Pon tu banco y CLABE: salen en los mensajes de cobro y en la tienda.' end,
      'href', '/admin/club/#cobro', 'cta', 'Poner datos de pago'),
    jsonb_build_object('code', 'jugadores', 'label', 'Tus jugadores',
      'status', case when v_players = 0 then 'blocker' when v_player_review > 0 or v_billing_review > 0 then 'warning' else 'ready' end,
      'detail', case when v_players = 0 then 'Trae tu lista de Excel: en 5 minutos tienes a todos.'
                     when v_player_review > 0 or v_billing_review > 0 then v_players || ' jugadores · ' || (v_player_review + v_billing_review) || ' por revisar (fecha, tutor o cuota).'
                     else v_players || ' jugadores activos.' end,
      'href', case when v_players = 0 then '/jugadores/importar/' else '/jugadores/' end,
      'cta', case when v_players = 0 then 'Importar desde Excel' else 'Revisar jugadores' end),
    jsonb_build_object('code', 'equipo', 'label', 'Tu equipo',
      'status', case when v_members >= 2 then 'ready' else 'warning' end,
      'detail', case when v_members >= 2 then v_members || ' personas con acceso.' else 'Invita a tus profes y a quien cobra: cada quien ve sólo lo suyo.' end,
      'href', '/usuarios/', 'cta', 'Invitar')
  );
  if v_org.settings ? 'legacyCutoverStatus' then
    v_checks := v_checks || jsonb_build_object('code', 'cutover', 'label', 'Corte de sistema anterior',
      'status', case when coalesce(v_org.settings->>'legacyCutoverStatus', '') = 'complete' then 'ready' else 'warning' end,
      'detail', case when coalesce(v_org.settings->>'legacyCutoverStatus', '') = 'complete' then 'V1 cerrado para escritura' else 'Validar delta final antes de retirar V1' end,
      'href', '/admin/onboarding/', 'cta', 'Revisar');
  end if;

  select count(*), count(*) filter (where x->>'status' = 'ready') into v_total, v_ready from jsonb_array_elements(v_checks) x;
  return jsonb_build_object('checks', v_checks, 'ready', v_ready, 'total', v_total,
    'percent', case when v_total = 0 then 0 else round(v_ready * 100.0 / v_total) end,
    'summary', jsonb_build_object('members', v_members, 'players', v_players, 'billingReview', v_billing_review, 'docsPending', v_docs_pend));
end;
$function$;