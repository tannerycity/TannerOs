-- Centro Tanner (08/11/2026): Mich compartió la campaña real "#WeAreTanners —
-- La recompensa: Crédito Tanner en tu mensualidad" ($500 MXN por cada niño
-- que se inscriba por recomendación) y confirmó que faltaba en el catálogo.
-- Es un programa distinto de Tanner por Tanner (TC-141, requisito ligado a
-- ciertas becas) — este es abierto a cualquier familia nueva que refiera.
-- Vigencia corregida por Mich: hasta junio 2027 (no diciembre 2026 como
-- decía el material de la campaña original).

do $$
declare v_org uuid; v_id uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-147','programa-de-referidos','Programa de referidos: Crédito Tanner','becas','tannery_city',
    '$500 MXN de crédito en tu mensualidad por cada niño que se inscriba gracias a tu recomendación. Aplica para Tanners y Baby Tanners, solo familias nuevas, no se entrega en efectivo. Vigente hasta junio 2027.',
    'Tannery City premia a las familias que comparten la experiencia Tanner.

LA RECOMPENSA
$500 MXN de crédito en tu mensualidad por cada niño que se inscriba. Aplica para Tanners y Baby Tanners. El crédito no se entrega en efectivo. Vigente hasta junio 2027.

CÓMO FUNCIONA
1. Invita a un amigo — compártele la experiencia Tanner.
2. Semana muestra — el nuevo jugador prueba y conoce el club.
3. Inscripción + primer pago — se registra oficialmente en la academia.
4. Recibe tu crédito — se libera cuando el nuevo jugador queda activo y validado.

REGLAS CLAVE
• Aplica solo para familias nuevas.
• Al inscribirse en Tanner OS, el referido debe mencionar quién lo recomendó.
• La recompensa no se entrega en efectivo.
• El crédito aplica solo a mensualidad.

Este programa es independiente de Tanner por Tanner (TC-141), que es el requisito de referidos y contactos ligado a ciertas becas.

¿Tienes a quién referir? Mándanos el contacto por WhatsApp al 479 265 1338, o que se registre directo en Tanner OS: app.tannerycity.com/registro.',
    array['referidos','crédito tanner','recomendar','invitar un amigo','$500','programa de referidos'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from app.policies where organization_id=v_org and slug='programa-de-referidos';
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id,'¿Cómo funciona el programa de referidos?','Invitas a un amigo, prueba la semana muestra, se inscribe con su primer pago y cuando queda activo y validado recibes $500 MXN de crédito en tu mensualidad.','becas',array['como funciona referidos','credito tanner'],1,'published'),
  (v_org,v_id,'¿El crédito se entrega en efectivo?','No. Es crédito aplicado directamente a tu mensualidad, no se entrega en efectivo.','becas',array['credito en efectivo','como se paga el referido'],2,'published'),
  (v_org,v_id,'¿Cuál es la diferencia con Tanner por Tanner?','Tanner por Tanner (TC-141) es un requisito de referidos ligado a ciertas becas. El programa de referidos es abierto a cualquier familia y da $500 de crédito por cada inscripción.','becas',array['diferencia tanner por tanner','que programa aplica'],3,'published')
  on conflict do nothing;
end $$;
