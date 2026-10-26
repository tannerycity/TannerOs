-- h45 (26/10/2026): Nombre y número con cargo. Presidencia: "yo sería de sí
-- cobrarlo... pero que tenga un botón que lo puedas quitar".
--  * Ajuste del club en organizations.settings.tienda:
--      cobraPersonalizacion (true/false) y recargoPersonalizacion (monto).
--    El cargo efectivo es el monto sólo con el interruptor encendido.
--  * Se cobra por cada jersey que lleva nombre o número, suelto o dentro de
--    un kit, en tienda, portal y mostrador; se ve en la pieza (unit_price) y
--    en el total. Igual que la manga larga (h10).
--  * Arranca APAGADO con $100: se enciende desde Catálogo cuando la tienda ya
--    enseña el cargo, para que lo que ve la familia y lo que cobra el
--    servidor nunca sean distintos.
create or replace function private.recargo_personalizacion(p_organization_id uuid)
returns numeric language sql stable security definer set search_path to '' as $$
  select case when coalesce((o.settings->'tienda'->>'cobraPersonalizacion')::boolean, false)
              then greatest(0, coalesce(nullif(o.settings->'tienda'->>'recargoPersonalizacion', '')::numeric, 0)) else 0 end
  from public.organizations o where o.id = p_organization_id
$$;
revoke all on function private.recargo_personalizacion(uuid) from public, anon;

-- Suma el cargo a cada pieza con nombre o número y devuelve cuánto sumó.
create or replace function private.aplica_recargo_personalizacion(p_order_id uuid)
returns numeric language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_r numeric; v_total numeric;
begin
  select organization_id into v_org from app.orders where id = p_order_id;
  v_r := coalesce(private.recargo_personalizacion(v_org), 0);
  if v_r <= 0 then return 0; end if;
  select coalesce(sum(quantity * v_r), 0) into v_total from app.order_items
   where order_id = p_order_id and (nullif(attributes->>'nombrePers', '') is not null or nullif(attributes->>'numero', '') is not null);
  update app.order_items set unit_price = unit_price + v_r,
         attributes = attributes || jsonb_build_object('recargoPersonalizacion', v_r)
   where order_id = p_order_id and (nullif(attributes->>'nombrePers', '') is not null or nullif(attributes->>'numero', '') is not null);
  return v_total;
end $$;
revoke all on function private.aplica_recargo_personalizacion(uuid) from public, anon;

create or replace function private.set_recargo_personalizacion(p_organization_id uuid, p_activo boolean, p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes jsonb;
begin
  if not private.can_edit_catalog(p_organization_id) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if p_monto is null or p_monto < 0 or p_monto > 5000 then raise exception 'El cargo va de $0 a $5,000'; end if;
  select jsonb_build_object('activo', settings->'tienda'->'cobraPersonalizacion', 'monto', settings->'tienda'->'recargoPersonalizacion')
    into v_antes from public.organizations where id = p_organization_id;
  update public.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{tienda}', coalesce(settings->'tienda', '{}'::jsonb)
           || jsonb_build_object('cobraPersonalizacion', coalesce(p_activo, false), 'recargoPersonalizacion', p_monto))
   where id = p_organization_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PersonalizationSurchargeChanged', 'organization', p_organization_id,
          jsonb_build_object('before', v_antes, 'after', jsonb_build_object('activo', coalesce(p_activo, false), 'monto', p_monto)), (select auth.uid()));
  return jsonb_build_object('activo', coalesce(p_activo, false), 'monto', p_monto);
end $$;
revoke all on function private.set_recargo_personalizacion(uuid, boolean, numeric) from public, anon;

create or replace function public.v2_set_recargo_personalizacion(organization_id uuid, activo boolean, monto numeric)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.set_recargo_personalizacion(organization_id, activo, monto)
$$;
revoke all on function public.v2_set_recargo_personalizacion(uuid, boolean, numeric) from public, anon;
grant execute on function public.v2_set_recargo_personalizacion(uuid, boolean, numeric) to authenticated;

-- Tannery City: $100, apagado hasta que la tienda lo enseñe.
update public.organizations
   set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{tienda}', coalesce(settings->'tienda', '{}'::jsonb)
         || jsonb_build_object('cobraPersonalizacion', false, 'recargoPersonalizacion', 100))
 where id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and coalesce(settings->'tienda'->>'recargoPersonalizacion', '') = '';

do $$
declare d text;
begin
  -- Tienda pública y portal: después del cargo de manga.
  d := pg_get_functiondef('private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)'::regprocedure);
  if position('aplica_recargo_personalizacion' in d) = 0 then
    d := replace(d, 'v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);',
      'v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);
  v_subtotal := v_subtotal + private.aplica_recargo_personalizacion(v_order_id);');
    if position('aplica_recargo_personalizacion' in d) = 0 then raise exception 'No se pudo parchar public_create_cart_order'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_place_order(uuid,jsonb,text)'::regprocedure);
  if position('aplica_recargo_personalizacion' in d) = 0 then
    d := replace(d, 'v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);',
      'v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);
  v_subtotal := v_subtotal + private.aplica_recargo_personalizacion(v_order_id);');
    if position('aplica_recargo_personalizacion' in d) = 0 then raise exception 'No se pudo parchar portal_place_order'; end if;
    execute d;
  end if;
  -- Mostrador: el total se recalcula de las piezas.
  d := pg_get_functiondef('private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'::regprocedure);
  if position('aplica_recargo_personalizacion' in d) = 0 then
    d := replace(d, 'perform private.aplica_recargo_manga(v_order);',
      'perform private.aplica_recargo_manga(v_order);
  perform private.aplica_recargo_personalizacion(v_order);');
    if position('aplica_recargo_personalizacion' in d) = 0 then raise exception 'No se pudo parchar command_create_internal_order'; end if;
    execute d;
  end if;

  -- Leer: el cargo viaja con el catálogo (0 si está apagado).
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('recargoPersonalizacion' in d) = 0 then
    d := replace(d, '''recargoMangaLarga'',private.recargo_manga(v_org)', '''recargoMangaLarga'',private.recargo_manga(v_org),''recargoPersonalizacion'',private.recargo_personalizacion(v_org)');
    if position('recargoPersonalizacion' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_catalog()'::regprocedure);
  if position('recargoPersonalizacion' in d) = 0 then
    d := replace(d, '''recargoMangaLarga'', private.recargo_manga(g.organization_id)', '''recargoMangaLarga'', private.recargo_manga(g.organization_id), ''recargoPersonalizacion'', private.recargo_personalizacion(g.organization_id)');
    if position('recargoPersonalizacion' in d) = 0 then raise exception 'No se pudo parchar portal_catalog'; end if;
    execute d;
  end if;
  -- Catálogo del staff: además el interruptor y el monto aunque esté apagado.
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('recargoPersonalizacion' in d) = 0 then
    d := replace(d, '''recargoMangaLarga'',private.recargo_manga(p_organization_id)', '''recargoMangaLarga'',private.recargo_manga(p_organization_id),''recargoPersonalizacion'',private.recargo_personalizacion(p_organization_id),''personalizacion'',(select jsonb_build_object(''activo'',coalesce((o.settings->''tienda''->>''cobraPersonalizacion'')::boolean,false),''monto'',coalesce(nullif(o.settings->''tienda''->>''recargoPersonalizacion'','''')::numeric,0)) from public.organizations o where o.id=p_organization_id)');
    if position('recargoPersonalizacion' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
end $$;
