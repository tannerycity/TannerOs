-- g5: Promociones de la Tienda.
--
-- Pedido de Presidencia (13/10/2026): "que sea bien fácil crear kits, subir
-- productos, ponerles promociones... aplica a todos". Una promoción es un
-- precio especial o un % de descuento, para un producto, un kit, una
-- categoría o toda la tienda, con fecha de fin. Al vencer regresa el precio
-- normal solo. Tienda pública, portal de familias y mostrador cobran el
-- precio de oferta (lo decide la base, no la pantalla).

create table app.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('precio', 'porcentaje')),
  target_type text not null check (target_type in ('product', 'bundle', 'category', 'todo')),
  target_id uuid,
  category text,
  value numeric(12,2) not null check (value > 0),
  value_kid numeric(12,2) check (value_kid is null or value_kid > 0),
  starts_on date not null default (now() at time zone 'America/Mexico_City')::date,
  ends_on date not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (kind <> 'porcentaje' or value < 100),
  check ((target_type in ('product', 'bundle')) = (target_id is not null)),
  check ((target_type = 'category') = (category is not null))
);
create index promotions_vigentes on app.promotions(organization_id, ends_on) where active;
alter table app.promotions enable row level security;

create or replace function private.hoy_mx() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

-- La mejor oferta vigente de una pieza: la que deja el precio más bajo.
create or replace function private.oferta_producto(p_product uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('price', o.precio, 'before', o.base, 'endsOn', o.ends_on, 'name', o.name)
  from (
    select p.price as base, pr.ends_on, pr.name,
           round(case pr.kind when 'precio' then pr.value else p.price * (1 - pr.value / 100) end, 2) as precio
    from app.products p
    join app.promotions pr on pr.organization_id = p.organization_id and pr.active
      and private.hoy_mx() between pr.starts_on and pr.ends_on
      and ((pr.target_type = 'product' and pr.target_id = p.id)
        or (pr.target_type = 'category' and lower(btrim(pr.category)) = lower(btrim(coalesce(p.category, ''))))
        or (pr.target_type = 'todo' and pr.kind = 'porcentaje'))
    where p.id = p_product and coalesce(p.price, 0) > 0
    order by 4 asc, pr.ends_on asc limit 1
  ) o where o.precio < o.base
$$;

create or replace function private.oferta_kit(p_bundle uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('priceAdult', o.adulto, 'priceKid', o.nino, 'beforeAdult', o.price_adult, 'beforeKid', o.price_kid, 'endsOn', o.ends_on, 'name', o.name)
  from (
    select b.price_adult, b.price_kid, pr.ends_on, pr.name,
           round(case pr.kind when 'precio' then pr.value else b.price_adult * (1 - pr.value / 100) end, 2) as adulto,
           case when coalesce(b.price_kid, 0) > 0 then round(case pr.kind
             when 'precio' then coalesce(pr.value_kid, b.price_kid * pr.value / nullif(b.price_adult, 0))
             else b.price_kid * (1 - pr.value / 100) end, 2) end as nino
    from app.product_bundles b
    join app.promotions pr on pr.organization_id = b.organization_id and pr.active
      and private.hoy_mx() between pr.starts_on and pr.ends_on
      and ((pr.target_type = 'bundle' and pr.target_id = b.id) or (pr.target_type = 'todo' and pr.kind = 'porcentaje'))
    where b.id = p_bundle and coalesce(b.price_adult, 0) > 0
    order by 5 asc, pr.ends_on asc limit 1
  ) o where o.adulto < o.price_adult
$$;

-- Lo que se cobra: el precio de oferta si hay, si no el de lista.
create or replace function private.precio_vigente_producto(p_product uuid, p_base numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((private.oferta_producto(p_product)->>'price')::numeric, p_base)
$$;
create or replace function private.precio_vigente_kit(p_bundle uuid, p_tier text, p_base numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((private.oferta_kit(p_bundle)->>case when p_tier = 'Niño' then 'priceKid' else 'priceAdult' end)::numeric, p_base)
$$;

do $do$
declare f text; d text; n text;
begin
  -- Los tres caminos de compra cobran el precio vigente.
  foreach f in array array['private.public_create_cart_order', 'private.portal_place_order', 'private.command_create_internal_order'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (select oid from pg_proc where oid::regprocedure::text like f || '(%' limit 1);
    n := regexp_replace(d, '(v_price\s*:=\s*)(case when v_tier\s*=\s*''Niño'' and coalesce\(v_bundle\.price_kid,\s*0\)\s*>\s*0 then v_bundle\.price_kid else v_bundle\.price_adult end)',
                        '\1private.precio_vigente_kit(v_bundle.id, v_tier, \2)', 'g');
    n := regexp_replace(n, 'v_product\.price(,\s*v_product\.cost)', 'private.precio_vigente_producto(v_product.id, v_product.price)\1', 'g');
    n := regexp_replace(n, '\(v_product\.price \* v_qty\)', '(private.precio_vigente_producto(v_product.id, v_product.price) * v_qty)', 'g');
    if position('precio_vigente_kit' in n) = 0 or position('precio_vigente_producto' in n) = 0 then
      raise exception 'g5: % no tiene la forma esperada', f;
    end if;
    execute n;
  end loop;

  -- Lo que se ve: el catálogo, la tienda pública y el portal traen la oferta.
  foreach f in array array['private.public_offerings', 'private.portal_catalog', 'private.query_catalog'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (select oid from pg_proc where oid::regprocedure::text like f || '(%' limit 1);
    n := regexp_replace(d, '(''price'',\s*p\.price,)', '\1''oferta'',private.oferta_producto(p.id),', 'g');
    n := regexp_replace(n, '(''(priceKid|price_kid)'',\s*b\.price_kid,)', '\1''oferta'',private.oferta_kit(b.id),', 'g');
    if (length(n) - length(replace(n, 'private.oferta_', ''))) / 15 < 2 then
      raise exception 'g5: % no tiene la forma esperada', f;
    end if;
    execute n;
  end loop;
end $do$;

-- Administrar promociones: sólo Presidencia, igual que el catálogo.
create or replace function private.promotions_list(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia ve las promociones'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'kind', pr.kind, 'targetType', pr.target_type,
      'targetId', pr.target_id, 'category', pr.category, 'value', pr.value, 'valueKid', pr.value_kid, 'startsOn', pr.starts_on,
      'endsOn', pr.ends_on, 'active', pr.active,
      'estado', case when not pr.active then 'terminada' when private.hoy_mx() > pr.ends_on then 'vencida'
                     when private.hoy_mx() < pr.starts_on then 'programada' else 'activa' end,
      'targetName', case pr.target_type when 'product' then (select name from app.products where id = pr.target_id)
                     when 'bundle' then (select name from app.product_bundles where id = pr.target_id)
                     when 'category' then pr.category else 'Toda la tienda' end)
    order by pr.active desc, pr.ends_on desc) from app.promotions pr where pr.organization_id = p_organization_id), '[]'::jsonb);
end $$;

create or replace function private.save_promotion(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_tipo text := p->>'targetType'; v_target uuid := nullif(p->>'targetId', '')::uuid;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia crea promociones'; end if;
  if v_tipo = 'product' and not exists (select 1 from app.products where id = v_target and organization_id = p_organization_id) then raise exception 'Ese producto no es de este club'; end if;
  if v_tipo = 'bundle' and not exists (select 1 from app.product_bundles where id = v_target and organization_id = p_organization_id) then raise exception 'Ese kit no es de este club'; end if;
  if v_tipo = 'todo' and p->>'kind' <> 'porcentaje' then raise exception 'Para toda la tienda la promoción es un porcentaje'; end if;
  if v_id is null then
    insert into app.promotions(organization_id, name, kind, target_type, target_id, category, value, value_kid, starts_on, ends_on, created_by)
    values (p_organization_id, btrim(p->>'name'), p->>'kind', v_tipo, case when v_tipo in ('product', 'bundle') then v_target end,
            case when v_tipo = 'category' then nullif(btrim(p->>'category'), '') end, (p->>'value')::numeric, nullif(p->>'valueKid', '')::numeric,
            coalesce(nullif(p->>'startsOn', '')::date, private.hoy_mx()), (p->>'endsOn')::date, (select auth.uid()))
    returning id into v_id;
  else
    update app.promotions set name = btrim(p->>'name'), kind = p->>'kind', target_type = v_tipo,
      target_id = case when v_tipo in ('product', 'bundle') then v_target end,
      category = case when v_tipo = 'category' then nullif(btrim(p->>'category'), '') end,
      value = (p->>'value')::numeric, value_kid = nullif(p->>'valueKid', '')::numeric,
      starts_on = coalesce(nullif(p->>'startsOn', '')::date, starts_on), ends_on = (p->>'endsOn')::date, active = true, updated_at = now()
    where id = v_id and organization_id = p_organization_id;
    if not found then raise exception 'Promoción no encontrada'; end if;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PromotionSaved', 'promotion', v_id, p, (select auth.uid()));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function private.end_promotion(p_organization_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia termina promociones'; end if;
  update app.promotions set active = false, updated_at = now() where id = p_id and organization_id = p_organization_id;
  if not found then raise exception 'Promoción no encontrada'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PromotionEnded', 'promotion', p_id, '{}'::jsonb, (select auth.uid()));
  return jsonb_build_object('id', p_id);
end $$;

revoke all on function private.oferta_producto(uuid), private.oferta_kit(uuid), private.precio_vigente_producto(uuid, numeric),
  private.precio_vigente_kit(uuid, text, numeric), private.promotions_list(uuid), private.save_promotion(uuid, jsonb),
  private.end_promotion(uuid, uuid), private.hoy_mx() from public, anon, authenticated;

create or replace function public.v2_promotions(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.promotions_list(organization_id) $$;
create or replace function public.v2_save_promotion(organization_id uuid, promotion jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.save_promotion(organization_id, promotion) $$;
create or replace function public.v2_end_promotion(organization_id uuid, promotion_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.end_promotion(organization_id, promotion_id) $$;
revoke all on function public.v2_promotions(uuid), public.v2_save_promotion(uuid, jsonb), public.v2_end_promotion(uuid, uuid) from public, anon;
grant execute on function public.v2_promotions(uuid), public.v2_save_promotion(uuid, jsonb), public.v2_end_promotion(uuid, uuid) to authenticated;
