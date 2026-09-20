alter table app.products add column if not exists legacy_id text;
create unique index if not exists app_products_org_legacy_uidx on app.products(organization_id,legacy_id) where legacy_id is not null;

with map(legacy_id,sku) as (values
 ('pro_mrr0dhui_j47u4s','TC-HOODIE'),
 ('pro_mrr0dht0_7mbpbk','TC-JER-BLACK'),
 ('pro_mrr0dhtd_9demku','TC-JER-LECHUGUILLA'),
 ('pro_mr5fp07y_izpj43','TC-JER-PINK-AWAY'),
 ('prod_mqjiv4gq_blvgdn','TC-JER-WETBLUE-HOME'),
 ('pro_mrr0dhuv_c218cm','TC-PANTS'),
 ('pro_mrr0dhu7_qvh0ex','TC-SOCKS'),
 ('pro_mrr0dhtr_a6w6yr','TC-SHORT')
)
update app.products ap
set legacy_id=m.legacy_id,
    attributes=ap.attributes||jsonb_build_object('legacyId',m.legacy_id,'catalogDecision','v2_clean_seed'),
    updated_at=now()
from map m
where ap.sku=m.sku and ap.legacy_id is null;

insert into app.products(
 organization_id,legacy_id,sku,slug,name,description,product_type,category,price,cost,stock,sizes,attributes,active,lead_days,created_at,updated_at,archived_at
)
select
 p.organization_id,p.id,null,null,coalesce(nullif(trim(p.name),''),nullif(trim(p.title),''),'Producto legacy'),nullif(trim(p.description),''),'product',nullif(trim(p.category),''),
 coalesce(p.price,p.price_adult,p.price_kid,0),p.cost,p.stock,coalesce(p.sizes,'[]'::jsonb),
 jsonb_strip_nulls(jsonb_build_object(
  'source','v1_historical_archive','legacySku',nullif(trim(p.sku),''),'legacyTitle',nullif(trim(p.title),''),'edition',nullif(trim(p.edicion),''),'editionColor',nullif(trim(p.edicion_color),''),'printing',nullif(trim(p.estampado),''),'priceAdult',p.price_adult,'priceKid',p.price_kid,'priceSpecial',p.price_special,'provider',nullif(trim(p.provider),''),'costHistory',p.cost_history,'extras',p.extras,'legacyStatus',nullif(trim(p.status),''),'legacyActive',p.active,'legacyDeleted',coalesce(p.deleted,false),'legacyPhotoPresent',nullif(trim(coalesce(p.photo_data,'')),'') is not null
 )),
 false,p.lead_days,coalesce(p.created_at,p.updated_at,now()),coalesce(p.updated_at,p.legacy_updated_at,p.created_at,now()),coalesce(p.updated_at,p.legacy_updated_at,p.created_at,now())
from public.products p
where not exists(select 1 from app.products ap where ap.organization_id=p.organization_id and ap.legacy_id=p.id)
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.orders add column if not exists legacy_id text;
alter table app.orders add column if not exists legacy_folio text;
alter table app.orders add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_orders_org_legacy_uidx on app.orders(organization_id,legacy_id) where legacy_id is not null;

insert into app.orders(
 organization_id,legacy_id,legacy_folio,folio,player_id,customer_name,customer_phone,subtotal,discount,total,status,source,notes,due_date,estimated_delivery,created_at,updated_at,metadata
)
select
 o.organization_id,o.id,nullif(trim(o.folio),''),
 case when not coalesce(o.deleted,false) then o.folio else 'HIST-'||coalesce(nullif(regexp_replace(o.folio,'[^A-Za-z0-9-]','','g'),''),'ORDER')||'-'||substr(md5(o.id),1,8) end,
 p.id,coalesce(nullif(trim(o.client_name),''),nullif(trim(o.player_name),''),nullif(trim(o.tutor),''),'Cliente legacy'),private.normalize_legacy_phone_safe(o.client_phone),
 coalesce(o.subtotal,o.total,0),coalesce(o.discount,0),coalesce(o.total,o.subtotal,0),
 case
  when coalesce(o.deleted,false) or o.status='Cancelado' then 'cancelled'
  when o.status='Pago parcial' then 'partial_payment'
  when o.status='Confirmado' then 'in_production'
  when o.status='Activo' then 'pending_payment'
  else 'pending_payment'
 end,
 'legacy_import',nullif(trim(o.notes),''),o.due_date,o.estimated_delivery,coalesce(o.created_at,o.updated_at,now()),coalesce(o.updated_at,o.legacy_updated_at,o.created_at,now()),
 jsonb_strip_nulls(jsonb_build_object(
   'legacyStatus',nullif(trim(o.status),''),'legacyDeleted',coalesce(o.deleted,false),'legacySource',nullif(trim(o.source),''),'legacyClientType',nullif(trim(o.client_type),''),'legacyPlayerId',nullif(trim(o.player_id),''),'legacyPlayerName',nullif(trim(o.player_name),''),'legacyPhoneRaw',nullif(trim(o.client_phone),''),'tutor',nullif(trim(o.tutor),''),'category',nullif(trim(o.category),''),'responsible',nullif(trim(o.responsable),''),'discountReason',nullif(trim(o.discount_reason),''),'discountAuthorizedBy',nullif(trim(o.discount_auth_by),''),'legacyCorteId',nullif(trim(o.corte_id),''),'timeline',o.timeline,'numeroPendiente',nullif(trim(o.numero_pendiente),''),'consentInternal',nullif(trim(o.consent_interno),''),'consentTutor',nullif(trim(o.consent_tutor),''),'consentAt',o.consent_fecha,'consentOrigin',nullif(trim(o.consent_origen),'')
 ))
from public.orders o
left join app.players p on p.organization_id=o.organization_id and p.legacy_id=o.player_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.order_items add column if not exists legacy_line_id text;
create unique index if not exists app_order_items_order_legacy_line_uidx on app.order_items(order_id,legacy_line_id) where legacy_line_id is not null;

with raw_items as (
 select o.organization_id,o.id legacy_order_id,o.subtotal,o.items,elem,
        nullif(elem->>'lineId','') legacy_line_id,nullif(elem->>'productId','') legacy_product_id,
        case when (elem->>'priceSnapshot') ~ '^-?[0-9]+([.][0-9]+)?$' then (elem->>'priceSnapshot')::numeric end price_snapshot,
        case when (elem->>'costSnapshot') ~ '^-?[0-9]+([.][0-9]+)?$' then (elem->>'costSnapshot')::numeric end cost_snapshot
 from public.orders o
 cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) elem
), enriched as (
 select r.*,lp.price current_legacy_price,lp.id resolved_legacy_product_id
 from raw_items r left join public.products lp on lp.organization_id=r.organization_id and lp.id=r.legacy_product_id
), order_quality as (
 select organization_id,legacy_order_id,count(*) item_count,count(resolved_legacy_product_id) resolved_count,
        sum(coalesce(current_legacy_price,0)) current_price_sum,max(subtotal) subtotal
 from enriched group by organization_id,legacy_order_id
), final_items as (
 select e.*,q.item_count,q.resolved_count,q.current_price_sum,q.subtotal as order_subtotal,
        (q.item_count=q.resolved_count and abs(coalesce(q.current_price_sum,0)-coalesce(q.subtotal,0))<0.01) as catalog_matches_subtotal
 from enriched e join order_quality q using(organization_id,legacy_order_id)
)
insert into app.order_items(organization_id,order_id,product_id,legacy_line_id,description,quantity,unit_price,unit_cost,attributes,created_at)
select
 f.organization_id,ao.id,ap.id,f.legacy_line_id,coalesce(nullif(trim(f.elem->>'name'),''),ap.name,'Pieza legacy'),1,
 case when f.price_snapshot is not null then f.price_snapshot when f.catalog_matches_subtotal then coalesce(f.current_legacy_price,0) else 0 end,
 f.cost_snapshot,
 f.elem||jsonb_build_object('_migration',jsonb_strip_nulls(jsonb_build_object(
   'legacyProductId',f.legacy_product_id,
   'productReferenceResolved',f.resolved_legacy_product_id is not null,
   'priceSource',case when f.price_snapshot is not null then 'frozen_snapshot' when f.catalog_matches_subtotal then 'legacy_catalog_exact_subtotal_match' else 'unknown' end,
   'costSource',case when f.cost_snapshot is not null then 'frozen_snapshot' else 'unknown' end
 ))),
 ao.created_at
from final_items f
join app.orders ao on ao.organization_id=f.organization_id and ao.legacy_id=f.legacy_order_id
left join app.products ap on ap.organization_id=f.organization_id and ap.legacy_id=f.legacy_product_id
on conflict (order_id,legacy_line_id) where legacy_line_id is not null do nothing;

insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select o.organization_id,'commerce','public.orders',o.id,'missing_order_items',jsonb_build_object('legacyFolio',o.folio,'reason','Legacy order has no item array; totals and header preserved, line detail unavailable')
from public.orders o
where not (jsonb_typeof(o.items)='array' and jsonb_array_length(o.items)>0)
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;

with raw_items as (
 select o.organization_id,o.id legacy_order_id,o.folio,o.subtotal,elem,nullif(elem->>'productId','') legacy_product_id,
        case when (elem->>'priceSnapshot') ~ '^-?[0-9]+([.][0-9]+)?$' then (elem->>'priceSnapshot')::numeric end price_snapshot
 from public.orders o cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) elem
), per_order as (
 select r.organization_id,r.legacy_order_id,max(r.folio) folio,max(r.subtotal) subtotal,count(*) items,count(*) filter(where r.price_snapshot is not null) snap_count,count(lp.id) resolved_count,sum(coalesce(lp.price,0)) current_sum
 from raw_items r left join public.products lp on lp.organization_id=r.organization_id and lp.id=r.legacy_product_id
 group by r.organization_id,r.legacy_order_id
)
insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select organization_id,'commerce','public.orders',legacy_order_id,'historical_price_snapshot_unreconstructable',jsonb_build_object('legacyFolio',folio,'items',items,'resolvedProducts',resolved_count,'legacySubtotal',subtotal,'currentCatalogSum',current_sum,'reason','No frozen price snapshot and current legacy catalog does not reconcile to saved subtotal')
from per_order
where snap_count=0 and not (items=resolved_count and abs(coalesce(current_sum,0)-coalesce(subtotal,0))<0.01)
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;

insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select distinct o.organization_id,'commerce','public.orders',o.id,'missing_product_reference',jsonb_build_object('legacyFolio',o.folio,'reason','One or more legacy item productIds no longer exist in public.products; item description preserved and canonical product_id left null')
from public.orders o cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) elem
left join public.products p on p.organization_id=o.organization_id and p.id=nullif(elem->>'productId','')
where nullif(elem->>'productId','') is not null and p.id is null
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;

create table if not exists app.order_payments(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 order_id uuid not null references app.orders(id) on delete cascade,
 payment_id uuid not null references app.payments(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),
 created_at timestamptz not null default now(),
 unique(order_id,payment_id)
);
create index if not exists idx_app_order_payments_order on app.order_payments(organization_id,order_id);
alter table app.order_payments enable row level security;
revoke all on app.order_payments from anon,authenticated;
grant all on app.order_payments to service_role;

insert into app.order_payments(organization_id,order_id,payment_id,amount,created_at)
select p.organization_id,o.id,ap.id,least(ap.amount,p.amount),coalesce(p.created_at,ap.created_at,now())
from public.payments p
join app.orders o on o.organization_id=p.organization_id and o.legacy_id=p.order_id
join app.payments ap on ap.organization_id=p.organization_id and ap.legacy_id=p.id
where nullif(trim(coalesce(p.order_id,'')),'') is not null and ap.status='posted' and p.amount>0
on conflict(order_id,payment_id) do nothing;;
