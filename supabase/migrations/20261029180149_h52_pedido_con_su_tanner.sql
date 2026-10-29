-- h52 · Cada pedido con su Tanner (29/10/2026).
--
-- Presidencia: "¿cómo hacemos que tenga trazabilidad la tienda y
-- contabilidad... cuando alguien compra, cómo lo enlazamos al niño para saber
-- si ya compró sus uniformes? Si no, le voy a andar cobrando doble o voy a
-- cagarle su historial de pagos". Y: "obligatorio, con la opción... que
-- pongan el nombre del niño con nombre y apellido por si no tienen acceso o
-- son nuevos", "una recomendación para ligarlo".
--
-- El 29/10 había 4 de 7 pedidos vigentes sin niño, todos de la tienda en
-- línea: la tienda nunca preguntaba para quién era.
--
-- 1. La tienda en línea manda "tanner": {tipo:'tanner', nombre, categoria} o
--    {tipo:'no_tanner'}. Se guarda en orders.metadata.tanner.
-- 2. Se liga solo cuando no hay duda: el teléfono del tutor tiene un solo
--    Tanner (y el nombre escrito no contradice), o entre sus hermanos sólo uno
--    coincide con el nombre, o sin teléfono conocido un solo Tanner del club
--    tiene ese nombre y apellido. Queda en la bitácora (OrderPlayerAutoLinked).
-- 3. Las sugerencias para ligar (v2_order_player) suben primero lo que
--    escribió la familia y lo devuelven ("declared").
-- 4. Un pedido sin Tanner y sin "No es para un Tanner" se queda en Revisar:
--    nunca se manda a producir un uniforme sin dueño. Staff puede marcar
--    "No es para un Tanner" (v2_order_not_tanner).
-- 5. v2_orders_pipeline trae lo que escribió la familia, si está ligado y el
--    proveedor del envío.

create or replace function private.normaliza_nombre(p text)
returns text language sql stable set search_path to '' as $$
  select btrim(regexp_replace(lower(public.unaccent(coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;
revoke all on function private.normaliza_nombre(text) from public, anon;

-- Lo que manda la tienda, limpio. null si no viene.
create or replace function private.limpia_tanner(p jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $$
declare v_tipo text := p->>'tipo'; v_nombre text; v_cat text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  if v_tipo = 'no_tanner' then return jsonb_build_object('tipo', 'no_tanner'); end if;
  if v_tipo <> 'tanner' then raise exception 'Invalid tanner'; end if;
  v_nombre := left(btrim(regexp_replace(coalesce(p->>'nombre', ''), '\s+', ' ', 'g')), 120);
  v_cat := nullif(left(btrim(coalesce(p->>'categoria', '')), 20), '');
  if v_nombre !~ '\S{2,}\s+\S{2,}' then raise exception 'Tanner name required'; end if;
  return jsonb_build_object('tipo', 'tanner', 'nombre', v_nombre, 'categoria', v_cat);
end $$;
revoke all on function private.limpia_tanner(jsonb) from public, anon;

-- ¿El nombre escrito es de este Tanner? Primer nombre y primer apellido.
create or replace function private.nombre_coincide(p_escrito text, p_first text, p_last text)
returns boolean language sql stable set search_path to '' as $$
  select coalesce(private.normaliza_nombre(p_escrito), '') <> ''
     and (' ' || private.normaliza_nombre(p_escrito) || ' ') like ('% ' || split_part(private.normaliza_nombre(p_first), ' ', 1) || ' %')
     and (split_part(private.normaliza_nombre(p_last), ' ', 1) = ''
          or (' ' || private.normaliza_nombre(p_escrito) || ' ') like ('% ' || split_part(private.normaliza_nombre(p_last), ' ', 1) || ' %'))
$$;
revoke all on function private.nombre_coincide(text, text, text) from public, anon;

-- Liga sola cuando no hay duda. Devuelve el player_id o null.
create or replace function private.auto_liga_pedido(p_order_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_o app.orders%rowtype; v_tel text; v_nombre text; v_player uuid; v_razon text; v_guardian uuid;
        v_por_tel uuid[]; v_tel_nom uuid[]; v_por_nom uuid[];
begin
  select * into v_o from app.orders where id = p_order_id for update;
  if v_o.id is null or v_o.player_id is not null or v_o.metadata->'tanner'->>'tipo' = 'no_tanner' then return null; end if;
  v_tel := private.digitos10(v_o.customer_phone);
  v_nombre := v_o.metadata->'tanner'->>'nombre';
  if coalesce(v_nombre, '') like '%,%' then return null; end if;   -- hermanos: se liga a mano

  select coalesce(array_agg(c.id) filter (where c.tel), '{}'), coalesce(array_agg(c.id) filter (where c.tel and c.nom), '{}'),
         coalesce(array_agg(c.id) filter (where c.nom), '{}')
    into v_por_tel, v_tel_nom, v_por_nom
    from (select p.id,
                 v_tel is not null and exists (select 1 from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
                                               where pg.player_id = p.id and private.digitos10(g.phone) = v_tel) as tel,
                 v_nombre is not null and private.nombre_coincide(v_nombre, p.first_name, p.last_name) as nom
            from app.players p
           where p.organization_id = v_o.organization_id and p.archived_at is null and p.status in ('active', 'inactive')) c;

  if cardinality(v_por_tel) = 1 and (v_nombre is null or cardinality(v_tel_nom) = 1) then
    v_player := v_por_tel[1]; v_razon := case when v_nombre is null then 'teléfono del tutor' else 'teléfono del tutor y nombre' end;
  elsif cardinality(v_por_tel) > 1 and cardinality(v_tel_nom) = 1 then
    v_player := v_tel_nom[1]; v_razon := 'teléfono del tutor y nombre';
  elsif cardinality(v_por_tel) = 0 and cardinality(v_por_nom) = 1 then
    v_player := v_por_nom[1]; v_razon := 'nombre y apellido';
  end if;
  if v_player is null then return null; end if;

  select g.id into v_guardian from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
   where pg.player_id = v_player and private.digitos10(g.phone) = v_tel order by pg.is_primary desc nulls last limit 1;
  update app.orders set player_id = v_player, guardian_id = coalesce(v_guardian, guardian_id),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('playerLinkedAt', now(), 'playerLinkedAuto', v_razon),
         updated_at = now()
   where id = p_order_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_o.organization_id, 'OrderPlayerAutoLinked', 'order', p_order_id,
          jsonb_build_object('playerId', v_player, 'guardianId', v_guardian, 'reason', v_razon, 'declared', v_o.metadata->'tanner'));
  return v_player;
end $$;
revoke all on function private.auto_liga_pedido(uuid) from public, anon, authenticated;

-- La tienda en línea con "para qué Tanner es". La versión de antes (sin
-- tanner) sigue para teléfonos con la página vieja, y también intenta ligar.
create or replace function public.v2_public_cart_order(club_key text, customer_name text, customer_phone text, customer_email text, items jsonb, notes text, consent jsonb, tanner jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_t jsonb := private.limpia_tanner(tanner); v_id uuid;
begin
  r := private.public_create_cart_order(club_key, customer_name, customer_phone, customer_email, items, notes, consent);
  v_id := (r->>'id')::uuid;
  if v_t is not null then
    update app.orders set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tanner', v_t) where id = v_id;
  end if;
  perform private.auto_liga_pedido(v_id);
  return r;
end $$;
revoke all on function public.v2_public_cart_order(text, text, text, text, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.v2_public_cart_order(text, text, text, text, jsonb, text, jsonb, jsonb) to anon, authenticated;

create or replace function public.v2_public_cart_order(club_key text, customer_name text, customer_phone text, customer_email text, items jsonb, notes text, consent jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  r := private.public_create_cart_order(club_key, customer_name, customer_phone, customer_email, items, notes, consent);
  perform private.auto_liga_pedido((r->>'id')::uuid);
  return r;
end $$;

-- Staff: "No es para un Tanner" (o quitarlo).
create or replace function private.command_order_not_tanner(p_organization_id uuid, p_order_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare v_o app.orders%rowtype; v_uid uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id for update;
  if v_o.id is null then raise exception 'Order not found'; end if;
  if p_value and v_o.player_id is not null then raise exception 'Order already linked to a player'; end if;
  update app.orders
     set metadata = case when p_value
                         then coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tanner', jsonb_build_object('tipo', 'no_tanner', 'marcadoPor', v_uid, 'marcadoEn', now()))
                         else coalesce(metadata, '{}'::jsonb) - 'tanner' end,
         updated_at = now()
   where id = p_order_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_value then 'OrderMarkedNotTanner' else 'OrderUnmarkedNotTanner' end, 'order', p_order_id,
          jsonb_build_object('previous', v_o.metadata->'tanner'), v_uid);
end $$;
revoke all on function private.command_order_not_tanner(uuid, uuid, boolean) from public, anon;

create or replace function public.v2_order_not_tanner(organization_id uuid, order_id uuid, value boolean)
returns void language sql security definer set search_path to '' as $$
  select private.command_order_not_tanner(organization_id, order_id, value)
$$;
revoke all on function public.v2_order_not_tanner(uuid, uuid, boolean) from public, anon;
grant execute on function public.v2_order_not_tanner(uuid, uuid, boolean) to authenticated;

-- La etapa: sin Tanner (y sin "No es para un Tanner") se queda en Revisar.
-- Los pedidos importados del sistema anterior no se detienen por esto.
CREATE OR REPLACE FUNCTION private.order_stage(p_organization_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_o app.orders%rowtype; v_ready jsonb; v_faltan text[]; v_datos text[]; v_revisar boolean; v_etapa text;
begin
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if not found then return null; end if;
  if v_o.status in ('cancelled', 'refunded') then return jsonb_build_object('stage', 'cerrado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'delivered' then return jsonb_build_object('stage', 'entregado', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'ready' then return jsonb_build_object('stage', 'para_entregar', 'missing', '[]'::jsonb); end if;
  if v_o.status = 'in_production' then return jsonb_build_object('stage', 'con_proveedor', 'missing', '[]'::jsonb); end if;
  v_ready := private.order_readiness(p_organization_id, p_order_id);
  select coalesce(array_agg(x), '{}') into v_faltan from jsonb_array_elements_text(coalesce(v_ready->'missing', '[]'::jsonb)) x;
  if v_o.player_id is null and coalesce(v_o.metadata->'tanner'->>'tipo', '') <> 'no_tanner' and v_o.source <> 'legacy_import' then
    v_faltan := v_faltan || 'De qué Tanner es'::text;
  end if;
  select coalesce(array_agg(x), '{}') into v_datos from unnest(v_faltan) x where x !~* '(pago|anticipo|saldo)';
  v_revisar := v_o.source in ('public_form', 'public_form_bundle', 'portal_familias') and v_o.metadata->>'reviewedAt' is null;
  v_etapa := case
    when v_revisar or cardinality(v_datos) > 0 then 'por_validar'
    when v_o.status not in ('paid', 'partial_payment') or not coalesce((v_ready->>'ok')::boolean, false) then 'por_cobrar'
    else 'para_proveedor' end;
  return jsonb_build_object('stage', v_etapa, 'missing', to_jsonb(v_faltan), 'review', v_revisar);
end $function$;

-- Sugerencias: primero lo que escribió la familia.
CREATE OR REPLACE FUNCTION private.query_order_player(p_organization_id uuid, p_order_id uuid, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o app.orders%rowtype; v_tel text; v_q text := nullif(btrim(p_query), ''); v_nombres text[]; v_escrito text;
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if v_o.id is null then raise exception 'Order not found'; end if;
  v_tel := private.digitos10(v_o.customer_phone);
  v_escrito := v_o.metadata->'tanner'->>'nombre';
  select coalesce(array_agg(distinct lower(btrim(i.attributes->>'nombrePers'))) filter (where nullif(btrim(i.attributes->>'nombrePers'), '') is not null), '{}')
    into v_nombres from app.order_items i where i.order_id = v_o.id;

  return jsonb_build_object(
    'linked', (select jsonb_build_object('id', p.id, 'name', btrim(concat_ws(' ', p.first_name, p.last_name)), 'category', p.category)
               from app.players p where p.id = v_o.player_id),
    'declared', v_o.metadata->'tanner',
    'canWrite', private.has_module_access(p_organization_id, 'commerce', true),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'reason', s.reason)
                                order by s.score desc, s.name)
      from (
        select p.id, btrim(concat_ws(' ', p.first_name, p.last_name)) as name, p.category,
          (case when esc.ok then 4 else 0 end) + (case when tel.ok then 3 else 0 end) + (case when jer.ok then 2 else 0 end) + (case when ape.ok then 1 else 0 end) as score,
          concat_ws(' · ', case when esc.ok then 'el nombre que escribió la familia' end,
                           case when tel.ok then 'mismo teléfono que su tutor' end,
                           case when jer.ok then 'nombre del jersey' end,
                           case when ape.ok then 'mismo apellido' end) as reason
        from app.players p
        cross join lateral (select v_escrito is not null and exists (
                              select 1 from unnest(string_to_array(v_escrito, ',')) e(nom) where private.nombre_coincide(e.nom, p.first_name, p.last_name))) esc(ok)
        cross join lateral (select v_tel is not null and exists (select 1 from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
                              where pg.player_id = p.id and private.digitos10(g.phone) = v_tel)) tel(ok)
        cross join lateral (select lower(p.first_name) = any(v_nombres)
                               or lower(split_part(p.first_name, ' ', 1)) = any(v_nombres)) jer(ok)
        cross join lateral (select length(split_part(btrim(coalesce(p.last_name, '')), ' ', 1)) >= 3   -- "De" o "La" no cuentan como apellido
                               and lower(coalesce(v_o.customer_name, '')) like '%' || lower(split_part(btrim(p.last_name), ' ', 1)) || '%') ape(ok)
        where p.organization_id = p_organization_id and p.archived_at is null and p.status in ('active', 'inactive')
          and p.id is distinct from v_o.player_id
          and (case when v_q is not null
                    then lower(concat_ws(' ', p.first_name, p.last_name, p.code)) like '%' || lower(v_q) || '%'
                    else esc.ok or tel.ok or jer.ok or ape.ok end)
        order by 4 desc, 2
        limit 6) s), '[]'::jsonb));
end $function$;

-- El tablero de etapas: lo que escribió la familia, si está ligado y el
-- proveedor del envío.
CREATE OR REPLACE FUNCTION public.v2_orders_pipeline(organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_object_agg(o.id, private.order_stage(o.organization_id, o.id) || jsonb_build_object(
      'tanner', o.metadata->'tanner', 'linked', o.player_id is not null,
      'batch', (select jsonb_build_object('id', b.id, 'folio', b.folio, 'status', b.status, 'submittedOn', b.submitted_on, 'supplierName', b.supplier_name)
         from app.production_batch_orders bo join app.production_batches b on b.id = bo.batch_id
        where bo.order_id = o.id and bo.organization_id = o.organization_id order by b.created_at desc limit 1)))
    from app.orders o
   where o.organization_id = v2_orders_pipeline.organization_id and o.archived_at is null), '{}'::jsonb);
end $function$;
