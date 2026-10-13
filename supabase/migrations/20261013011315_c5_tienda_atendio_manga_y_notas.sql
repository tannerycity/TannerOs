-- c5: La Tienda dice quién atendió el pedido, la manga y las notas.
--
-- Pedido de Presidencia (13/10/2026): "que se vea si pedimos manga corta o
-- manga larga en los jerseys... que las notas que pongamos se vean en el
-- programa y en el pdf... que aparezca quien lo pidió... ellos mismos lo
-- compraron, ayudó Zul, ayudó Mich".
--
--   1. El mostrador (command_create_internal_order) guarda la manga del
--      jersey, igual que la tienda y el portal desde a5.
--   2. set_order_item_sleeve: la manga se corrige pieza por pieza (pedidos
--      viejos que la traían sólo en la nota).
--   3. set_order_attendant: quién del club atendió el pedido. Si nadie lo
--      marca, vale quien lo levantó en el mostrador o quien lo confirmó.
--   4. orders_board suma origen, notas, quién atendió y la observación de cada
--      pieza; order_staff lista a quién se puede elegir.
--   5. La hoja de producción trae la manga y la nota del pedido.

do $do$
declare d text; n text;
begin
  -- 1. Mostrador: manga junto al número, en kit y en pieza suelta.
  select pg_get_functiondef('private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'::regprocedure) into d;
  n := regexp_replace(d,
    '(''numero'',case when v_is_jersey then nullif\(trim\(coalesce\(v_line->>''number'',''''\)\),''''\) else null end)',
    E'\\1,\n          ''manga'',case when v_is_jersey then (case lower(btrim(coalesce(v_line->>''sleeve'',''''))) when ''larga'' then ''larga'' when ''corta'' then ''corta'' end) else null end', 'g');
  if (length(n) - length(replace(n, '''manga''', ''))) / 7 <> 2 then raise exception 'c5: el mostrador no tiene la forma esperada'; end if;
  execute n;

  -- 5. Hoja de producción: manga y nota del pedido junto a la observación.
  select pg_get_functiondef('private.query_production_batch_sheet(uuid,uuid)'::regprocedure) into d;
  n := replace(d, $s$'obs', nullif(oi.attributes->>'obs',''),$s$,
    $s$'obs', nullif(oi.attributes->>'obs',''),
    'manga', nullif(oi.attributes->>'manga',''),
    'orderNotes', nullif(btrim(coalesce(o.notes,'')),''),$s$);
  if n = d then raise exception 'c5: la hoja no tiene la forma esperada'; end if;
  execute n;
end $do$;

create or replace function private.set_order_item_sleeve(p_organization_id uuid, p_item_id uuid, p_manga text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_manga text := case lower(btrim(coalesce(p_manga, ''))) when 'larga' then 'larga' when 'corta' then 'corta' else null end;
  v_status text;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select o.status into v_status from app.order_items i join app.orders o on o.id = i.order_id
   where i.id = p_item_id and i.organization_id = p_organization_id;
  if not found then raise exception 'Order item not found'; end if;
  if v_status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then raise exception 'Esta pieza ya no se puede editar'; end if;
  update app.order_items set attributes = case when v_manga is null then coalesce(attributes, '{}'::jsonb) - 'manga'
                                               else coalesce(attributes, '{}'::jsonb) || jsonb_build_object('manga', v_manga) end
   where id = p_item_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'OrderItemSleeveSet', 'order_item', p_item_id, jsonb_build_object('manga', v_manga), (select auth.uid()));
  return jsonb_build_object('itemId', p_item_id, 'manga', v_manga);
end $$;

-- Quién del club puede atender: miembros activos con su nombre.
create or replace function private.order_staff(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', coalesce(nullif(btrim(p.display_name), ''), 'Sin nombre')) order by p.display_name)
    from public.organization_memberships m left join public.profiles p on p.user_id = m.user_id
    where m.organization_id = p_organization_id and m.active), '[]'::jsonb);
end $$;

create or replace function private.set_order_attendant(p_organization_id uuid, p_order_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  if p_user_id is not null and not exists (select 1 from public.organization_memberships
      where organization_id = p_organization_id and user_id = p_user_id and active) then raise exception 'Esa persona no es del club'; end if;
  update app.orders set metadata = case when p_user_id is null then coalesce(metadata, '{}'::jsonb) - 'attendedBy'
                                        else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('attendedBy', p_user_id) end,
         updated_at = now()
   where id = p_order_id and organization_id = p_organization_id returning metadata into v_meta;
  if v_meta is null then raise exception 'Order not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'OrderAttendantSet', 'order', p_order_id, jsonb_build_object('attendedBy', p_user_id), (select auth.uid()));
  return jsonb_build_object('orderId', p_order_id, 'attendedBy', p_user_id);
end $$;

create or replace function private.orders_board(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_object_agg(o.id, jsonb_build_object(
      'playerName', nullif(btrim(concat_ws(' ', pl.first_name, pl.last_name)), ''),
      'playerCategory', pl.category, 'playerJersey', pl.jersey_number,
      'numberConfirmed', o.metadata->'numeroConfirmado',
      'source', o.source,
      'notes', nullif(btrim(coalesce(o.notes, '')), ''),
      -- Quién del club lo atendió: lo que se marcó a mano, o quien lo levantó
      -- en el mostrador, o quien lo confirmó; en lo importado, el responsable.
      'attendedBy', coalesce(o.metadata->>'attendedBy', o.metadata->>'capturedByUserId', o.metadata->>'reviewedBy'),
      'attendedName', coalesce(
        (select nullif(btrim(p.display_name), '') from public.profiles p
          where p.user_id::text = coalesce(o.metadata->>'attendedBy', o.metadata->>'capturedByUserId', o.metadata->>'reviewedBy')),
        case when o.metadata->>'responsible' <> 'Pedido público' then nullif(btrim(o.metadata->>'responsible'), '') end),
      'attendedManual', jsonb_exists(coalesce(o.metadata, '{}'::jsonb), 'attendedBy'),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'description', i.description, 'quantity', i.quantity,
          'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'), ''),
          'manga', nullif(i.attributes->>'manga', ''),
          'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'), ''),
          'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), ''),
          'obs', nullif(i.attributes->>'obs', ''),
          'kit', nullif(i.attributes->>'bundleName', '')) order by i.created_at)
        from app.order_items i where i.order_id = o.id), '[]'::jsonb)))
    from app.orders o left join app.players pl on pl.id = o.player_id and pl.organization_id = o.organization_id
    where o.organization_id = p_organization_id and o.archived_at is null), '{}'::jsonb);
end $$;

revoke all on function private.set_order_item_sleeve(uuid, uuid, text), private.order_staff(uuid),
  private.set_order_attendant(uuid, uuid, uuid), private.orders_board(uuid) from public, anon, authenticated;

create or replace function public.v2_set_order_item_sleeve(organization_id uuid, order_item_id uuid, manga text)
returns jsonb language sql security definer set search_path = '' as $$ select private.set_order_item_sleeve(organization_id, order_item_id, manga) $$;
create or replace function public.v2_order_staff(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.order_staff(organization_id) $$;
create or replace function public.v2_set_order_attendant(organization_id uuid, order_id uuid, user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.set_order_attendant(organization_id, order_id, user_id) $$;
revoke all on function public.v2_set_order_item_sleeve(uuid, uuid, text), public.v2_order_staff(uuid),
  public.v2_set_order_attendant(uuid, uuid, uuid) from public, anon;
grant execute on function public.v2_set_order_item_sleeve(uuid, uuid, text), public.v2_order_staff(uuid),
  public.v2_set_order_attendant(uuid, uuid, uuid) to authenticated;
