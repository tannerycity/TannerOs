-- 1) Nuevo módulo "catalogo", separado de "tienda" (commerce).
insert into public.modules (code, name, category, description, is_core, active, sort_order)
values (
  'catalogo',
  'Catálogo',
  'commercial',
  'Kits y productos: alta, edición y archivado del catálogo — separado del acceso operativo a Pedidos/Captura.',
  false,
  true,
  54
)
on conflict (code) do nothing;

-- 2) Habilitar el módulo en el plan de la organización.
insert into public.plan_modules (plan_id, module_code, enabled)
select id, 'catalogo', true
from public.plans
where name = 'Tannery Internal Full'
on conflict (plan_id, module_code) do update set enabled = true;

-- 3) Otorgar el módulo a los roles que hoy administran comercio (mismo set que commerce_finance).
--    Taquilla queda fuera intencionalmente.
insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
select o.id, r.role, 'catalogo', true, true
from public.organizations o
cross join (values ('Presidencia'), ('Operaciones'), ('Marketing')) as r(role)
on conflict (organization_id, role, module_code)
do update set can_read = true, can_write = true;

-- 4) query_catalog: ocultar costo/margen a quien no tenga commerce_finance (defense in depth,
--    ya que Captura llama este mismo RPC para vender y hoy regresa costo/margen sin filtrar).
CREATE OR REPLACE FUNCTION private.query_catalog(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_products jsonb; v_bundles jsonb; v_has_finance boolean;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  v_has_finance := private.has_module_access(p_organization_id,'commerce_finance',false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'sku',p.sku,'slug',p.slug,'category',p.category,'description',p.description,
    'price',p.price,
    'cost', case when v_has_finance then p.cost else null end,
    'sizes',p.sizes,'active',p.active,'archived',p.archived_at is not null,
    'leadDays',p.lead_days,'legacyId',p.legacy_id,
    'marginPercent',case when v_has_finance and p.price>0 and p.cost is not null then round(((p.price-p.cost)/p.price)*100,2) else null end
  ) order by p.name),'[]'::jsonb) into v_products
  from app.products p where p.organization_id=p_organization_id and p.product_type='product';

  with comp as (
    select b.id as bundle_id,
      coalesce(sum(coalesce(pr.cost,0)*greatest(1,least(20,coalesce((c->>'qty')::int,1)))),0) as cost_total,
      bool_and(pr.cost is not null) as cost_complete,
      bool_and(pr.id is not null) as components_resolved,
      coalesce(jsonb_agg(jsonb_build_object(
        'productId',coalesce(pr.id::text,c->>'productId'),'name',coalesce(pr.name,'(producto no encontrado)'),
        'qty',greatest(1,least(20,coalesce((c->>'qty')::int,1))),
        'unitCost',case when v_has_finance then pr.cost else null end,
        'unitPrice',pr.price,'active',coalesce(pr.active,false)
      ) order by coalesce(pr.name,'')) filter (where c is not null),'[]'::jsonb) as pieces
    from app.product_bundles b
    left join lateral jsonb_array_elements(b.components) c on true
    left join app.products pr on pr.organization_id=b.organization_id and (pr.id::text=c->>'productId' or pr.legacy_id=c->>'productId')
    where b.organization_id=p_organization_id
    group by b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'description',b.description,'priceAdult',b.price_adult,'priceKid',b.price_kid,
    'active',b.active,'archived',b.archived_at is not null,'validUntil',b.valid_until,'notes',b.notes,
    'components',coalesce(comp.pieces,'[]'::jsonb),
    'costTotal',case when v_has_finance then coalesce(comp.cost_total,0) else null end,
    'costComplete',coalesce(comp.cost_complete,false),
    'componentsResolved',coalesce(comp.components_resolved,false),
    'marginAdultPercent',case when v_has_finance and coalesce(b.price_adult,0)>0 and coalesce(comp.cost_complete,false) then round(((b.price_adult-comp.cost_total)/b.price_adult)*100,2) else null end,
    'marginKidPercent',case when v_has_finance and coalesce(b.price_kid,0)>0 and coalesce(comp.cost_complete,false) then round(((b.price_kid-comp.cost_total)/b.price_kid)*100,2) else null end
  ) order by b.name),'[]'::jsonb) into v_bundles
  from app.product_bundles b left join comp on comp.bundle_id=b.id
  where b.organization_id=p_organization_id;

  return jsonb_build_object('products',v_products,'bundles',v_bundles);
end
$function$;
;
