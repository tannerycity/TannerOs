-- Prueba 10 · INVARIANTE · ESCRIBE Y SE REVIERTE
--
-- El club cobra un kit por DOS caminos distintos:
--
--   Taquilla   public.v2_create_internal_order  -> command_create_internal_order
--   Familias   public.v2_portal_place_order     -> portal_place_order
--
-- Se entra por las cáscaras públicas y no por las privadas a propósito: es por
-- donde entra la app. Llamar directo a la privada con el rol 'authenticated'
-- da "permission denied" —y está bien que lo dé: ése es el candado de w1—.
--
-- Cada uno tiene su propia copia del reparto de precio: el kit vale $3,500 y
-- hay que repartirlo entre sus seis piezas en proporción a lo que vale cada
-- una suelta, con la última llevándose el resto para que la suma dé exacto.
--
-- El duplicado fue una decisión, no un descuido: tocar la función que YA cobra
-- dinero real, para que dos caminos compartieran un helper nuevo, arriesgaba
-- el camino que funciona a cambio de elegancia. Se paga el duplicado y se pone
-- ESTA prueba de peaje: el día que alguien edite un reparto y no el otro, el
-- club cobraría dos totales distintos por el mismo kit y aquí truena.
--
-- CÓMO PRUEBA
--
-- Levanta el mismo kit, para el mismo Tanner, con las mismas tallas, por los
-- dos caminos, y compara renglón por renglón: mismo producto, mismo precio
-- unitario, misma suma. Todo dentro de un bloque que se revierte solo — ni un
-- pedido queda en la base. Las variables de PL/pgSQL sobreviven al rollback,
-- así que la comparación se hace después, con los números ya capturados.
--
-- El control positivo va incluido: si no hubo ningún kit que probar, falla.
-- Una prueba que no probó nada no es una prueba que pasó.

do $$
declare
  v_org uuid; v_kit app.product_bundles%rowtype;
  v_guardian_user uuid; v_admin_user uuid; v_player uuid;
  v_piezas jsonb; v_tier text;
  v_taquilla text; v_familias text; v_id_t uuid; v_id_f uuid;
  v_total_t numeric; v_total_f numeric;
  v_kits_probados int := 0; v_fallas text := '';
  v_precio numeric;
begin
  -- Un papá con cuenta y con hijo: es quien puede usar el portal.
  select g.user_id, pg.player_id, g.organization_id
    into v_guardian_user, v_player, v_org
  from app.guardians g
  join app.player_guardians pg on pg.guardian_id = g.id
  join app.players pl on pl.id = pg.player_id and pl.archived_at is null
  where g.user_id is not null
  limit 1;

  if v_guardian_user is null then
    raise exception 'PRUEBA FALLÓ: no hay ningún tutor con cuenta y con hijo con quien probar el portal';
  end if;

  -- Y alguien que pueda cobrar en Taquilla, para el otro camino.
  select m.user_id into v_admin_user
  from public.organization_memberships m
  where m.active and m.organization_id = v_org
    and m.role in ('Presidencia','Taquilla','Contabilidad')
  limit 1;

  if v_admin_user is null then
    raise exception 'PRUEBA FALLÓ: no hay ningún rol de cobranza en el club con quien probar Taquilla';
  end if;

  for v_kit in
    select b.* from app.product_bundles b
    where b.organization_id = v_org and b.active and b.archived_at is null
      and (b.valid_until is null or b.valid_until >= current_date)
      and coalesce(b.price_adult,0) > 0
      -- Sólo los que se pueden vender: un kit con una pieza archivada revienta
      -- en los dos caminos por igual y no dice nada del reparto.
      and not exists (
        select 1 from jsonb_array_elements(coalesce(b.components,'[]'::jsonb)) c
        where not exists (
          select 1 from app.products pr
          where pr.organization_id = b.organization_id
            and (pr.id::text = c->>'productId' or pr.legacy_id = c->>'productId')
            and pr.active and pr.archived_at is null))
      and jsonb_array_length(coalesce(b.components,'[]'::jsonb)) > 0
    order by b.name
  loop
    foreach v_tier in array array['Adulto','Niño'] loop
      v_precio := case when v_tier='Niño' and coalesce(v_kit.price_kid,0)>0
                       then v_kit.price_kid else v_kit.price_adult end;
      if coalesce(v_precio,0) <= 0 then continue; end if;

      -- Una pieza por unidad, con una talla que el producto de verdad ofrece.
      select jsonb_agg(jsonb_build_object(
               'productId', pr.id::text,
               'talla', coalesce(pr.sizes->>0, 'Universal')))
        into v_piezas
      from jsonb_array_elements(coalesce(v_kit.components,'[]'::jsonb)) c
      join app.products pr
        on pr.organization_id = v_kit.organization_id
       and (pr.id::text = c->>'productId' or pr.legacy_id = c->>'productId')
       and pr.active and pr.archived_at is null
      cross join generate_series(1, greatest(1, least(20, coalesce((c->>'qty')::int,1))));

      -- Los dos pedidos, y a la basura. Lo que sobrevive son los números.
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_admin_user, 'role','authenticated')::text, true);
        perform set_config('role','authenticated', true);
        select (public.v2_create_internal_order(
          v_org, 'QA dos caminos', '4771234567', null, null,
          jsonb_build_array(jsonb_build_object(
            'kind','bundle','bundleId',v_kit.id::text,'tier',v_tier,
            'personalizationName','QA','number','9','pieces',v_piezas)),
          v_player)->>'id')::uuid into v_id_t;

        perform set_config('request.jwt.claims',
          json_build_object('sub', v_guardian_user, 'role','authenticated')::text, true);
        select (public.v2_portal_place_order(
          v_player,
          jsonb_build_array(jsonb_build_object(
            'kind','bundle','bundleId',v_kit.id::text,'tier',v_tier,
            'personalizationName','QA','number','9','pieces',v_piezas)),
          null)->>'order_id')::uuid into v_id_f;

        perform set_config('role','postgres', true);

        -- La firma de cada pedido: qué producto, a qué precio. Se lee por el
        -- id que devolvió cada función y no por un filtro de tiempo: en una
        -- base viva, "del último minuto" puede agarrar un pedido de verdad.
        -- Se compara como conjunto, no por orden de inserción: lo que importa
        -- es que ninguna pieza cueste distinto según por dónde entró la venta.
        select string_agg(oi.product_id::text||'@'||oi.unit_price::text, '|'
                          order by oi.product_id::text, oi.unit_price),
               sum(oi.quantity * oi.unit_price)
          into v_taquilla, v_total_t
        from app.order_items oi where oi.order_id = v_id_t;

        select string_agg(oi.product_id::text||'@'||oi.unit_price::text, '|'
                          order by oi.product_id::text, oi.unit_price),
               sum(oi.quantity * oi.unit_price)
          into v_familias, v_total_f
        from app.order_items oi where oi.order_id = v_id_f;

        raise exception 'REVIERTE';
      exception when others then
        perform set_config('role','postgres', true);
        if sqlerrm <> 'REVIERTE' then
          raise exception 'PRUEBA FALLÓ: el kit "%" (%) reventó al cobrarse: %',
            v_kit.name, v_tier, sqlerrm;
        end if;
      end;

      v_kits_probados := v_kits_probados + 1;

      if v_taquilla is distinct from v_familias then
        v_fallas := v_fallas || format('· "%s" (%s): Taquilla cobró [%s] y el portal [%s] ',
                                       v_kit.name, v_tier, v_taquilla, v_familias);
      elsif v_total_t is distinct from v_precio or v_total_f is distinct from v_precio then
        v_fallas := v_fallas || format('· "%s" (%s): el kit vale %s pero se cobró %s / %s ',
                                       v_kit.name, v_tier, v_precio, v_total_t, v_total_f);
      end if;
    end loop;
  end loop;

  if v_kits_probados = 0 then
    raise exception 'PRUEBA FALLÓ: no hubo un solo kit vendible que probar; el invariante no probó nada';
  end if;
  if v_fallas <> '' then
    raise exception 'PRUEBA FALLÓ: los dos caminos cobran distinto. %', v_fallas;
  end if;

  raise notice 'PRUEBA OK · 10 · % combinaciones kit+tipo cobradas igual por Taquilla y por el portal, y cada una suma exacto el precio del kit',
    v_kits_probados;
end $$;
