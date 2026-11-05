-- Política de Centro Tanner (05/11/2026): "Objetos perdidos". Si se reporta
-- algo perdido u olvidado en las instalaciones, el club lo recoge y lo guarda
-- en el área de objetos olvidados durante 30 días naturales. Pasado ese
-- plazo se dona o se desecha según su estado. El club no se hace responsable
-- de lo que se deje sin reportar/resguardar formalmente.

do $$
declare v_org uuid; v_policy_id uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-143','objetos-perdidos','Objetos perdidos','seguridad','tannery_city',
    'Si reportas algo perdido u olvidado, lo recogemos y lo guardamos 30 días en el área de objetos olvidados. Pasado ese plazo, se dona o se desecha según su estado. Tannery City no se hace responsable de lo que se deje.',
    'Si olvidas o pierdes algo en las instalaciones y nos lo reportas, el club lo recoge y lo guarda en el área de objetos olvidados.

Los objetos se conservan durante 30 días naturales a partir de que se recogen.

Pasados los 30 días sin que se reclamen, se donan o se desechan, según el estado en el que se encuentren.

Tannery City no se hace responsable por objetos personales no entregados formalmente a resguardo (celulares, dinero, relojes, chamarras, accesorios u otros artículos dejados en cancha, bancas, vestidores o estacionamiento) — ver también la política de Objetos personales.',
    array['objetos perdidos','objetos olvidados','perdi mi','se me olvido','donde esta mi','lost and found','recoger objeto','objeto encontrado','30 dias','se me quedo'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing
  returning id into v_policy_id;

  if v_policy_id is null then
    select id into v_policy_id from app.policies where organization_id=v_org and slug='objetos-perdidos';
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_policy_id,'Perdí algo en las instalaciones, ¿qué hago?','Repórtalo al club. Si lo encontramos, lo guardamos en el área de objetos olvidados durante 30 días.','seguridad',array['perdi algo','se me quedo','se me olvido'],1,'published'),
  (v_org,v_policy_id,'¿Cuánto tiempo guardan los objetos olvidados?','30 días naturales desde que se recogen. Pasado ese plazo se donan o se desechan según su estado.','seguridad',array['cuanto tiempo guardan objetos','plazo objetos olvidados'],2,'published'),
  (v_org,v_policy_id,'¿Qué pasa si no reclamo mi objeto a tiempo?','Pasados los 30 días, el objeto se dona o se desecha dependiendo de su estado.','seguridad',array['no reclame a tiempo','se dona','se tira'],3,'published'),
  (v_org,v_policy_id,'¿El club se hace responsable si pierdo algo?','No. Tannery City no se hace responsable por objetos personales no entregados formalmente a resguardo.','seguridad',array['responsabilidad objetos perdidos','no se hacen responsables'],4,'published')
  on conflict do nothing;
end $$;
