insert into app.products(
  organization_id,sku,slug,name,description,product_type,category,price,cost,stock,sizes,attributes,active,lead_days,created_at,updated_at
)
select
  p.organization_id,
  case p.id
    when 'pro_mrr0dhui_j47u4s' then 'TC-HOODIE'
    when 'pro_mrr0dht0_7mbpbk' then 'TC-JER-BLACK'
    when 'pro_mrr0dhtd_9demku' then 'TC-JER-LECHUGUILLA'
    when 'pro_mr5fp07y_izpj43' then 'TC-JER-PINK-AWAY'
    when 'prod_mqjiv4gq_blvgdn' then 'TC-JER-WETBLUE-HOME'
    when 'pro_mrr0dhuv_c218cm' then 'TC-PANTS'
    when 'pro_mrr0dhu7_qvh0ex' then 'TC-SOCKS'
    when 'pro_mrr0dhtr_a6w6yr' then 'TC-SHORT'
  end,
  case p.id
    when 'pro_mrr0dhui_j47u4s' then 'hoodie-chamarra'
    when 'pro_mrr0dht0_7mbpbk' then 'jersey-black-edition'
    when 'pro_mrr0dhtd_9demku' then 'jersey-lechuguilla-edition'
    when 'pro_mr5fp07y_izpj43' then 'jersey-pink-cantera-away'
    when 'prod_mqjiv4gq_blvgdn' then 'jersey-wet-blue-home'
    when 'pro_mrr0dhuv_c218cm' then 'pants'
    when 'pro_mrr0dhu7_qvh0ex' then 'par-de-calcetas'
    when 'pro_mrr0dhtr_a6w6yr' then 'short'
  end,
  coalesce(nullif(p.name,''),p.title),p.description,'product',
  case
    when lower(coalesce(p.category,'')) like '%calceta%' then 'socks'
    when lower(coalesce(nullif(p.name,''),p.title,'')) like '%jersey%' then 'jersey'
    when lower(coalesce(nullif(p.name,''),p.title,'')) like '%hoodie%' then 'outerwear'
    when lower(coalesce(nullif(p.name,''),p.title,''))='pants' then 'pants'
    when lower(coalesce(nullif(p.name,''),p.title,''))='short' then 'shorts'
    else 'apparel'
  end,
  coalesce(p.price,0),p.cost,p.stock,coalesce(p.sizes,'[]'::jsonb),
  jsonb_build_object('availability','on_demand','source','v1_clean_seed'),true,p.lead_days,now(),now()
from public.products p
where p.id in (
  'pro_mrr0dhui_j47u4s','pro_mrr0dht0_7mbpbk','pro_mrr0dhtd_9demku','pro_mr5fp07y_izpj43',
  'prod_mqjiv4gq_blvgdn','pro_mrr0dhuv_c218cm','pro_mrr0dhu7_qvh0ex','pro_mrr0dhtr_a6w6yr'
)
  and p.deleted=false and coalesce(p.active,true)=true
on conflict(organization_id,sku) do update set
  slug=excluded.slug,name=excluded.name,description=excluded.description,product_type=excluded.product_type,
  category=excluded.category,price=excluded.price,cost=excluded.cost,stock=excluded.stock,sizes=excluded.sizes,
  attributes=excluded.attributes,active=true,lead_days=excluded.lead_days,archived_at=null,updated_at=now();;
