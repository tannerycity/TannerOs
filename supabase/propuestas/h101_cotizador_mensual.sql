-- h101 · Cotizador de patrocinios por mes (24/11/2026).
-- Presidencia mandó el diseño del cotizador ("ahí está todo para cotizar
-- patrocinadores... metámoslo en patrocinadores") y decidió:
--   1. Paquetes del diseño: Presencia local $1,000/mes (6 a 12 meses),
--      Patrocinador oficial $3,000/mes (6 a 12) y Aliado integral TC + TCP
--      $5,000/mes (sólo 12).
--   2. Los conceptos repetidos del catálogo se archivan (no se borran).
--   3. El PDF lleva sólo el WhatsApp de la academia, y el folio es TC-AAAA-NNN.
--
-- Se extiende la cotización que ya existe (h44); no hay tablas nuevas:
--   - Plan por mes: paquete, meses, IVA, total mensual y total del contrato,
--     contacto y quién la refirió. Sin meses, la cotización es de pago único
--     como hasta hoy (la COT-2026-001 no cambia).
--   - total sigue siendo lo que entra al club sin IVA (meses x mensual sin
--     IVA): es lo que pasa al acuerdo cuando la marca acepta.
--   - El folio usa el prefijo del club (settings.quotePrefix, COT si no hay) y
--     un candado por club para que dos cotizaciones al mismo tiempo no choquen.
--   - Los paquetes guardan su mínimo y máximo de meses; el servidor no deja
--     guardar meses fuera del rango del paquete.
--   - Catálogo de Tannery: paquetes nuevos, canchas, señalética, tienda,
--     experiencias, medias y cobertura de torneos, con su foto del kit.
-- "Vencida" no se guarda: se calcula en pantalla con la fecha de vigencia.

-- 1. Plan por mes en la cotización.
alter table app.sponsor_quotes
  add column if not exists package_asset_id uuid references app.sponsor_assets(id),
  add column if not exists months int,
  add column if not exists iva_pct numeric not null default 0,
  add column if not exists iva_amount numeric not null default 0,
  add column if not exists monthly_total numeric,
  add column if not exists contract_total numeric,
  add column if not exists contact_name text,
  add column if not exists referred_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_quotes_months_chk') then
    alter table app.sponsor_quotes add constraint sponsor_quotes_months_chk check (months is null or months between 1 and 36);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sponsor_quotes_iva_chk') then
    alter table app.sponsor_quotes add constraint sponsor_quotes_iva_chk check (iva_pct in (0, 16));
  end if;
end $$;

-- 2. Guardar: lo de siempre más el plan.
drop function if exists public.v2_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb);
drop function if exists private.command_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb);

create or replace function private.command_save_sponsor_quote(p_organization_id uuid, p_quote_id uuid, p_sponsor_id uuid, p_prospect_name text,
  p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date, p_items jsonb, p_plan jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private', 'public' as $function$
declare
  v_id uuid := p_quote_id; v_actor uuid := (select auth.uid()); v_old app.sponsor_quotes;
  v_subtotal numeric := 0; v_desc numeric := 0; v_pct numeric := 0; v_cap numeric; v_approval text := 'none';
  v_item jsonb; v_n int := 0; v_folio text; v_year text := to_char(now() at time zone 'America/Mexico_City', 'YYYY');
  v_prefix text; v_plan jsonb := coalesce(p_plan, '{}'::jsonb);
  v_months int := nullif(v_plan->>'months', '')::int; v_iva_pct numeric := coalesce(nullif(v_plan->>'ivaPct', '')::numeric, 0);
  v_package uuid := nullif(v_plan->>'packageAssetId', '')::uuid; v_paq jsonb; v_neto numeric; v_iva numeric; v_total numeric;
  v_mensual numeric; v_contrato numeric;
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if p_sponsor_id is null and coalesce(length(trim(p_prospect_name)), 0) < 2 then raise exception 'Quote needs a brand'; end if;
  if p_sponsor_id is not null and not exists (select 1 from app.sponsors where id = p_sponsor_id and organization_id = p_organization_id and removed_at is null) then
    raise exception 'Sponsor not found';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Quote needs items'; end if;
  if p_discount_type is not null and p_discount_type not in ('pct', 'amount') then raise exception 'Invalid discount type'; end if;
  if coalesce(p_discount_value, 0) < 0 then raise exception 'Invalid discount'; end if;
  if v_iva_pct not in (0, 16) then raise exception 'Invalid IVA'; end if;
  if v_months is not null and (v_months < 1 or v_months > 36) then raise exception 'Invalid months'; end if;
  if v_package is not null then
    select a.metadata->'paquete' into v_paq from app.sponsor_assets a
     where a.id = v_package and a.organization_id = p_organization_id and a.metadata ? 'paquete';
    if v_paq is null then raise exception 'Package not found'; end if;
    if v_months is null then raise exception 'Package needs months'; end if;
    if v_months < coalesce((v_paq->>'min')::int, 1) or v_months > coalesce((v_paq->>'max')::int, 36) then raise exception 'Months out of package range'; end if;
  end if;

  if v_id is not null then
    select * into v_old from app.sponsor_quotes where id = v_id and organization_id = p_organization_id and archived_at is null for update;
    if not found then raise exception 'Quote not found'; end if;
    if v_old.status = 'accepted' then raise exception 'Quote already accepted'; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(length(trim(v_item->>'description')), 0) < 2 then raise exception 'Quote item needs a description'; end if;
    if coalesce((v_item->>'unitPrice')::numeric, 0) < 0 or coalesce((v_item->>'quantity')::numeric, 1) <= 0 then raise exception 'Invalid quote item'; end if;
    if nullif(v_item->>'assetId', '') is not null and not exists (select 1 from app.sponsor_assets a where a.id = (v_item->>'assetId')::uuid and a.organization_id = p_organization_id) then
      raise exception 'Tanner asset not found';
    end if;
    v_subtotal := v_subtotal + coalesce((v_item->>'unitPrice')::numeric, 0) * coalesce((v_item->>'quantity')::numeric, 1);
  end loop;
  if v_subtotal <= 0 then raise exception 'Quote needs a price'; end if;

  v_desc := case p_discount_type when 'pct' then round(v_subtotal * least(coalesce(p_discount_value, 0), 100) / 100, 2)
                                 when 'amount' then least(coalesce(p_discount_value, 0), v_subtotal) else 0 end;
  v_pct := case when v_subtotal > 0 then round(v_desc / v_subtotal * 100, 2) else 0 end;
  v_cap := private.sponsor_quote_discount_cap(p_organization_id);
  if v_pct > v_cap then
    v_approval := case when private.is_presidency(p_organization_id) then 'approved'
                       when v_old.id is not null and v_old.approval_status = 'approved' and v_old.discount_pct >= v_pct then 'approved'
                       else 'pending' end;
  end if;

  -- Con meses, los precios son por mes: el IVA va sobre lo que queda después
  -- del descuento y el contrato es el mensual por los meses.
  v_neto := v_subtotal - v_desc;
  v_iva := round(v_neto * v_iva_pct / 100, 2);
  v_total := case when v_months is null then v_neto else v_neto * v_months end;
  v_mensual := case when v_months is null then null else v_neto + v_iva end;
  v_contrato := case when v_months is null then v_neto + v_iva else (v_neto + v_iva) * v_months end;

  if v_id is null then
    v_prefix := coalesce(nullif(upper(regexp_replace(coalesce((select settings->>'quotePrefix' from public.organizations where id = p_organization_id), ''), '[^A-Za-z]', '', 'g')), ''), 'COT');
    v_prefix := left(v_prefix, 6);
    perform pg_advisory_xact_lock(hashtext('sponsor_quote_folio:' || p_organization_id::text));
    select coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1 into v_n
      from app.sponsor_quotes where organization_id = p_organization_id and folio like v_prefix || '-' || v_year || '-%';
    v_folio := v_prefix || '-' || v_year || '-' || lpad(v_n::text, 3, '0');
    insert into app.sponsor_quotes (organization_id, folio, sponsor_id, prospect_name, subtotal, discount_type, discount_value, discount_amount, discount_pct, total,
      approval_status, approved_by, approved_at, notes, valid_until, created_by,
      package_asset_id, months, iva_pct, iva_amount, monthly_total, contract_total, contact_name, referred_by)
    values (p_organization_id, v_folio, p_sponsor_id, nullif(trim(coalesce(p_prospect_name, '')), ''), v_subtotal, p_discount_type, p_discount_value, v_desc, v_pct,
      v_total, v_approval, case when v_approval = 'approved' then v_actor end, case when v_approval = 'approved' then now() end,
      nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_valid_until, current_date + 15), v_actor,
      v_package, v_months, v_iva_pct, v_iva, v_mensual, v_contrato,
      nullif(trim(coalesce(v_plan->>'contactName', '')), ''), nullif(trim(coalesce(v_plan->>'referredBy', '')), ''))
    returning id into v_id;
  else
    update app.sponsor_quotes set sponsor_id = p_sponsor_id, prospect_name = nullif(trim(coalesce(p_prospect_name, '')), ''), subtotal = v_subtotal,
      discount_type = p_discount_type, discount_value = p_discount_value, discount_amount = v_desc, discount_pct = v_pct, total = v_total,
      approval_status = v_approval,
      approved_by = case when v_approval = 'approved' then coalesce(case when v_old.approval_status = 'approved' then v_old.approved_by end, v_actor) end,
      approved_at = case when v_approval = 'approved' then coalesce(case when v_old.approval_status = 'approved' then v_old.approved_at end, now()) end,
      approval_note = case when v_approval = 'none' then null else approval_note end,
      -- Si cambió algo, una enviada regresa a borrador hasta que se vuelva a enviar.
      status = 'draft', sent_at = null,
      notes = nullif(trim(coalesce(p_notes, '')), ''), valid_until = coalesce(p_valid_until, valid_until),
      package_asset_id = v_package, months = v_months, iva_pct = v_iva_pct, iva_amount = v_iva, monthly_total = v_mensual, contract_total = v_contrato,
      contact_name = nullif(trim(coalesce(v_plan->>'contactName', '')), ''), referred_by = nullif(trim(coalesce(v_plan->>'referredBy', '')), ''),
      updated_at = now()
     where id = v_id;
    update app.sponsor_quote_items set voided_at = now() where quote_id = v_id and voided_at is null;
  end if;

  v_n := 0;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    insert into app.sponsor_quote_items (organization_id, quote_id, asset_id, description, unit_price, quantity, unit, sort_order)
    values (p_organization_id, v_id, nullif(v_item->>'assetId', '')::uuid, trim(v_item->>'description'), coalesce((v_item->>'unitPrice')::numeric, 0),
      coalesce((v_item->>'quantity')::numeric, 1), nullif(trim(coalesce(v_item->>'unit', '')), ''), v_n);
  end loop;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, case when p_quote_id is null then 'SponsorQuoteCreated' else 'SponsorQuoteUpdated' end, 'sponsor_quote', v_id,
    jsonb_build_object('total', v_total, 'discountPct', v_pct, 'approval', v_approval, 'months', v_months, 'contractTotal', v_contrato), v_actor, coalesce(v_actor::text, 'system'));
  return private.sponsor_quote_json(v_id);
end $function$;
revoke all on function private.command_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.v2_save_sponsor_quote(organization_id uuid, quote_id uuid, sponsor_id uuid, prospect_name text, discount_type text,
  discount_value numeric, notes text, valid_until date, items jsonb, plan jsonb default null)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $function$
  select private.command_save_sponsor_quote(organization_id, quote_id, sponsor_id, prospect_name, discount_type, discount_value, notes, valid_until, items, plan) $function$;
revoke all on function public.v2_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.v2_save_sponsor_quote(uuid, uuid, uuid, text, text, numeric, text, date, jsonb, jsonb) to authenticated;

-- 3. Lo que regresa cada cotización, con el plan.
create or replace function private.sponsor_quote_json(p_quote_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
  select jsonb_build_object('id', q.id, 'folio', q.folio, 'sponsorId', q.sponsor_id,
    'sponsorName', coalesce((select s.name from app.sponsors s where s.id = q.sponsor_id), q.prospect_name), 'prospectName', q.prospect_name,
    'status', q.status, 'subtotal', q.subtotal, 'discountType', q.discount_type, 'discountValue', q.discount_value,
    'discountAmount', q.discount_amount, 'discountPct', q.discount_pct, 'total', q.total,
    'approvalStatus', q.approval_status, 'approvalNote', q.approval_note,
    'approvedByName', case when q.approved_by is null then null else private.chat_name(q.approved_by) end, 'approvedAt', q.approved_at,
    'notes', q.notes, 'validUntil', q.valid_until, 'agreementId', q.agreement_id, 'sentAt', q.sent_at, 'decidedAt', q.decided_at,
    'createdByName', case when q.created_by is null then null else private.chat_name(q.created_by) end, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
    'packageAssetId', q.package_asset_id, 'packageName', (select a.name from app.sponsor_assets a where a.id = q.package_asset_id),
    'months', q.months, 'ivaPct', q.iva_pct, 'ivaAmount', q.iva_amount, 'monthlyTotal', q.monthly_total, 'contractTotal', q.contract_total,
    'contactName', q.contact_name, 'referredBy', q.referred_by,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'assetId', i.asset_id, 'description', i.description, 'unitPrice', i.unit_price,
        'quantity', i.quantity, 'unit', i.unit, 'lineTotal', i.unit_price * i.quantity) order by i.sort_order)
      from app.sponsor_quote_items i where i.quote_id = q.id and i.voided_at is null), '[]'::jsonb))
  from app.sponsor_quotes q where q.id = p_quote_id
$function$;

-- 4. La lista trae también el WhatsApp del club para el pie del PDF.
create or replace function private.query_sponsor_quotes(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object('discountCapPct', private.sponsor_quote_discount_cap(p_organization_id), 'isPresidency', private.is_presidency(p_organization_id),
    'whatsapp', (select nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber', ''), '\D', '', 'g'), '') from public.organizations o where o.id = p_organization_id),
    'quotes', coalesce((select jsonb_agg(private.sponsor_quote_json(q.id) order by q.created_at desc)
      from app.sponsor_quotes q where q.organization_id = p_organization_id and q.archived_at is null), '[]'::jsonb));
end $function$;

-- 5. Catálogo de Tannery.
do $$
declare v_org uuid := (select id from public.organizations where slug = 'tannery-city-fc');
begin
  if v_org is null then return; end if;

  update public.organizations set settings = coalesce(settings, '{}'::jsonb) || '{"quotePrefix":"TC"}'::jsonb where id = v_org;

  -- Paquetes de antes (sin usar en cotizaciones ni acuerdos) se archivan.
  update app.sponsor_assets set archived_at = now(), updated_at = now()
   where organization_id = v_org and archived_at is null and name in ('Paquete Tanner Local', 'Paquete Tanner Partner', 'Paquete Tanner Official');

  -- Repetidos: se queda el más usado (cotizaciones + acuerdos), luego el más
  -- reciente. Si había del club y del complejo, el que queda es de los dos.
  with uso as (
    select a.id, a.name, a.entity,
      (select count(*) from app.sponsor_quote_items i where i.asset_id = a.id) + (select count(*) from app.sponsor_agreement_items i where i.sponsor_asset_id = a.id) usos,
      row_number() over (partition by lower(a.name) order by
        (select count(*) from app.sponsor_quote_items i where i.asset_id = a.id) + (select count(*) from app.sponsor_agreement_items i where i.sponsor_asset_id = a.id) desc,
        a.updated_at desc, a.created_at desc, a.entity) n,
      count(*) over (partition by lower(a.name)) cuantos,
      (min(a.entity) over (partition by lower(a.name)) is distinct from max(a.entity) over (partition by lower(a.name))) mezcla
    from app.sponsor_assets a where a.organization_id = v_org and a.archived_at is null
  ), archivados as (
    update app.sponsor_assets a set archived_at = now(), updated_at = now(),
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('archivadoPor', 'h101 repetido')
      from uso where uso.id = a.id and uso.cuantos > 1 and uso.n > 1
    returning a.id
  )
  update app.sponsor_assets a set entity = 'AMBOS', updated_at = now()
    from uso where uso.id = a.id and uso.cuantos > 1 and uso.n = 1 and uso.mezcla;

  -- Paquetes del diseño.
  insert into app.sponsor_assets (organization_id, name, category, family, price, unit, price_status, entity, channel, availability, description, metadata)
  select v_org, x.nombre, 'other', 'Paquete', x.precio, 'por mes', 'aprobado', 'AMBOS', 'Multicanal', 'available', x.descr,
         jsonb_build_object('paquete', jsonb_build_object('clave', x.clave, 'min', x.mn, 'max', x.mx, 'orden', x.orden))
    from (values ('Presencia local', 1000, 'Desde $1,000/mes · mínimo 6 meses', 'local', 6, 12, 1),
                 ('Patrocinador oficial', 3000, 'Desde $3,000/mes · mínimo 6 meses', 'oficial', 6, 12, 2),
                 ('Aliado integral TC + TCP', 5000, '$5,000/mes · sólo contratos de 12 meses', 'integral', 12, 12, 3)) x(nombre, precio, descr, clave, mn, mx, orden)
   where not exists (select 1 from app.sponsor_assets a where a.organization_id = v_org and a.archived_at is null and a.name = x.nombre);

  -- Conceptos nuevos (precio por cotizar; 0 en la cotización = "Incluido").
  insert into app.sponsor_assets (organization_id, name, category, family, price, unit, price_status, entity, channel, availability, description, metadata)
  select v_org, x.nombre, x.cat, x.fam, null, x.unidad, 'por_cotizar', x.ent, x.canal, 'available', x.descr,
         jsonb_strip_nulls(jsonb_build_object('foto', x.foto, 'piezas', x.piezas))
    from (values
      ('Cancha Chavicos', 'park', 'Lonas', 'por mes', 'TCP', 'Presencial', 'Lonas alrededor de la cancha principal', '/brand/patrocinios/chavicos.jpg', 12),
      ('Cancha Españita', 'park', 'Lonas', 'por mes', 'TCP', 'Presencial', 'Lonas en malla, visibles desde estacionamiento y cancha', '/brand/patrocinios/espanita.jpg', 8),
      ('Cancha Lechuguilla', 'park', 'Lonas', 'por mes', 'TCP', 'Presencial', 'Lona de fondo en cancha de fútbol base', '/brand/patrocinios/lechuguilla.jpg', 9),
      ('Señalética del complejo', 'park', 'Señalética', 'por mes', 'TCP', 'Presencial', 'Lonas y señalética sobre calle Españita', '/brand/patrocinios/fachada.jpg', 15),
      ('Tienda · toldos', 'park', 'Tienda', 'por mes', 'TCP', 'Presencial', 'Área de tienda y comedor del complejo', '/brand/patrocinios/tienda.jpg', 4),
      ('Tienda · acceso', 'park', 'Tienda', 'por mes', 'TCP', 'Presencial', 'Acceso vehicular sobre Españita', '/brand/patrocinios/acceso.jpg', 1),
      ('Logo en medias', 'uniforms', 'Uniforme', 'temporada', 'TC', 'Medias oficiales', 'Tu marca en las medias oficiales', null, null),
      ('Naming de torneo / final / cancha', 'sports', 'Experiencia', 'evento', 'AMBOS', 'Presencial', 'Tu marca en el nombre del evento', '/brand/patrocinios/campeones.jpg', null),
      ('Activaciones', 'sports', 'Experiencia', 'evento', 'AMBOS', 'Presencial', 'Activaciones con familias en el complejo', '/brand/patrocinios/grada.jpg', null),
      ('Entrega de premios', 'sports', 'Experiencia', 'evento', 'AMBOS', 'Presencial', 'Tu marca en la premiación', '/brand/patrocinios/trofeos.jpg', null),
      ('Menciones por micrófono', 'sports', 'Experiencia', 'evento', 'AMBOS', 'Presencial', 'Menciones durante partidos y eventos', '/brand/patrocinios/familia.jpg', null),
      ('Cobertura de torneos', 'digital', 'Contenido', 'torneo', 'TCP', 'Instagram / Facebook', 'Fotos y video de los torneos con tu marca', null, null)
    ) x(nombre, cat, fam, unidad, ent, canal, descr, foto, piezas)
   where not exists (select 1 from app.sponsor_assets a where a.organization_id = v_org and a.archived_at is null and a.name = x.nombre);
end $$;
