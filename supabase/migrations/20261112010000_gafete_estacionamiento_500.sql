-- Corrección de TC-105 (12/11/2026), Mich: "el gafete de estacionamiento
-- tiene un costo de $500 por auto" — no $100 como estaba cargado. Confirmó
-- que el precio es el mismo ($500) para auto y para moto.

do $$
declare v_org uuid; v_id_105 uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_id_105 from app.policies where organization_id=v_org and policy_code='TC-105';
  if v_id_105 is not null then
    update app.policies set
      short_answer='Costo $500 MXN, vigencia 1 año natural. Evita cobro ordinario de estacionamiento Tanner durante vigencia conforme condiciones.',
      official_content='El Gafete de estacionamiento anual cuesta $500 MXN (mismo precio para auto y moto) y tiene vigencia de 1 año natural. Con él no pagas el cobro ordinario de estacionamiento cada vez que asistes, conforme a las condiciones de uso.

Sin gafete, el costo por visita es: auto $20 MXN, moto $10 MXN — ver también la política de Estacionamiento.

Máximo 2 gafetes por familia. La reposición por pérdida o daño cuesta $100 MXN. No se puede prestar a terceros; el uso indebido puede cancelar el beneficio.

Tannery City y Tannery City Park (TCP) no se hacen responsables por daños, robos o pérdidas ocurridos en tu vehículo, ya sea dentro o fuera de las instalaciones.'
    where id=v_id_105;
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id_105,'¿Cuánto cuesta el Gafete de estacionamiento?','$500 MXN, mismo precio para auto y moto. Tiene vigencia de 1 año natural.','estacionamiento',array['cuanto cuesta el gafete','precio gafete','500 pesos'],1,'published')
  on conflict do nothing;
end $$;
