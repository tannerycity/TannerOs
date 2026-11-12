-- Política de Centro Tanner (12/11/2026), Mich: "para mí es importante tener
-- un apartado de estacionamiento". TC-148 cubre el costo por visita ($20
-- auto, $10 moto, tiempo ilimitado de academia) y el deslinde de
-- responsabilidad de Tannery City y TCP por daños al vehículo. El gafete
-- anual (TC-105) ya existía con el mismo costo por visita sin gafete — se
-- actualiza para que también traiga el deslinde de responsabilidad, "ahí en
-- lo del estacionamiento y lo del gafete".

do $$
declare v_org uuid; v_id_105 uuid; v_policy_id uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_id_105 from app.policies where organization_id=v_org and policy_code='TC-105';
  if v_id_105 is not null then
    update app.policies set
      official_content='El Gafete de estacionamiento anual cuesta $100 MXN y tiene vigencia de 1 año natural. Con él no pagas el cobro ordinario de estacionamiento cada vez que asistes, conforme a las condiciones de uso.

Sin gafete, el costo por visita es: auto $20 MXN, moto $10 MXN — ver también la política de Estacionamiento.

Máximo 2 gafetes por familia. La reposición por pérdida o daño cuesta $100 MXN. No se puede prestar a terceros; el uso indebido puede cancelar el beneficio.

Tannery City y Tannery City Park (TCP) no se hacen responsables por daños, robos o pérdidas ocurridos en tu vehículo, ya sea dentro o fuera de las instalaciones.',
      keywords=array(select distinct unnest(keywords || array['responsabilidad estacionamiento','danos a mi auto','robo de auto','no se hacen responsables']))
    where id=v_id_105;
  end if;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-148','estacionamiento','Estacionamiento','estacionamiento','tannery_city',
    'Estacionamiento: $20 MXN por auto y $10 MXN por moto cada vez que asistas, con tiempo ilimitado mientras dure tu actividad en la academia. Tannery City y Tannery City Park no se hacen responsables por daños a tu vehículo, dentro ni fuera de las instalaciones.',
    'Cada vez que asistas a entrenar, jugar o participar en actividades de la academia, el estacionamiento tiene un costo de:
• $20 MXN por auto.
• $10 MXN por moto.

Este costo cubre tiempo ilimitado mientras dure tu actividad en la academia — no se cobra por hora ni tiene límite de tiempo dentro de ese día.

Si asistes seguido, puedes conseguir tu Gafete de estacionamiento anual: con él no pagas cada vez que entras, tiene vigencia de un año natural y cuesta $100 MXN — ver la política de Gafete de estacionamiento para costo y condiciones completas.

Tannery City y Tannery City Park (TCP) no se hacen responsables por daños, robos o pérdidas ocurridos en tu vehículo, ya sea dentro o fuera de las instalaciones. Estacionarte en nuestras instalaciones o en los alrededores es bajo tu propio riesgo.',
    array['estacionamiento','parking','cuanto cuesta estacionamiento','costo estacionamiento','auto','moto','responsabilidad estacionamiento','danos a mi auto','robo de auto','gafete','tiempo ilimitado'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing
  returning id into v_policy_id;

  if v_policy_id is null then
    select id into v_policy_id from app.policies where organization_id=v_org and slug='estacionamiento';
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_policy_id,'¿Cuánto cuesta el estacionamiento?','$20 MXN por auto y $10 MXN por moto cada vez que asistas, con tiempo ilimitado mientras dure tu actividad en la academia.','estacionamiento',array['cuanto cuesta estacionamiento','costo estacionamiento','precio estacionamiento'],1,'published'),
  (v_org,v_policy_id,'¿Tannery City se hace responsable si le pasa algo a mi auto?','No. Tannery City y Tannery City Park no se hacen responsables por daños, robos o pérdidas en tu vehículo, dentro ni fuera de las instalaciones.','estacionamiento',array['responsabilidad estacionamiento','danos a mi auto','robo de auto'],2,'published'),
  (v_org,v_policy_id,'¿Hay una forma de no pagar cada vez que entro?','Sí, el Gafete de estacionamiento anual. Cuesta $100 MXN, dura un año natural y te evita el cobro por visita.','estacionamiento',array['gafete de estacionamiento','no pagar cada vez'],3,'published')
  on conflict do nothing;
end $$;
