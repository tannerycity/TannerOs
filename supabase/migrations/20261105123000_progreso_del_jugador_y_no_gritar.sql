-- Centro Tanner (05/11/2026): Presidencia pidió dejar claro cómo sabe una
-- familia que su hijo está avanzando (TC-042, evaluación trimestral +
-- Portal de familia) y qué política hay sobre el trato a los niños: TC-116
-- ya prohibía groserías y humillar en público, pero no decía "gritar" de
-- forma explícita, y Presidencia lo quiere textual.

do $$
declare v_org uuid; v_id_042 uuid; v_id_116 uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_id_042 from app.policies where organization_id=v_org and policy_code='TC-042';
  select id into v_id_116 from app.policies where organization_id=v_org and policy_code='TC-116';

  -- TC-116: el lenguaje incluye el tono. "No gritar" explícito, no solo groserías.
  update app.policies set
    short_answer='No usar groserías ni gritos dirigidos a jugadores. Prohibido humillar, ridiculizar o degradar públicamente.',
    official_content='No usar groserías ni gritos dirigidos a jugadores. Prohibido humillarlos, ridiculizarlos o degradarlos públicamente.

La corrección y la disciplina son parte de la formación, pero se dan con indicaciones claras y respeto — nunca gritando, humillando ni ridiculizando a un jugador frente a otros.',
    keywords=array(select distinct unnest(keywords || array['gritar','gritos','no gritar','respeto','trato a los niños']))
  where id=v_id_116;

  -- TC-042: cómo ve la familia el avance de su hijo (metodología Tanner TC 1.0 + Portal de familia).
  update app.policies set
    keywords=array(select distinct unnest(keywords || array['como va mi hijo','avanzando','avance','progreso','portal de familia','perfil tanner','metodologia tanner']))
  where id=v_id_042;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id_042,'¿Cómo sé que mi hijo está avanzando?','Cada trimestre el cuerpo técnico evalúa a tu hijo con la metodología Tanner (TC 1.0): técnica, juego, físico, actitud y el eje propio de su categoría. El resultado completo, trimestre a trimestre, lo puedes ver en tu Portal de familia dentro de TannerOS.','jugadores',array['como va mi hijo','avanzando','progreso','evaluacion trimestral'],10,'published'),
  (v_org,v_id_042,'¿Dónde veo la evaluación de mi hijo?','En tu Portal de familia (TannerOS), dentro de la ficha de tu hijo. Si todavía no tienes acceso, pídelo a Administración y te mandamos la liga de entrada por WhatsApp.','jugadores',array['donde veo evaluacion','portal de familia','acceso al portal'],11,'published')
  on conflict do nothing;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id_116,'¿Los entrenadores les pueden gritar a los niños?','No. En Tannery City la corrección se hace con indicaciones claras y respeto; gritarles, humillarlos o ridiculizarlos está prohibido (ver también Castigo físico, TC-115).','conducta',array['gritar','le gritan a mi hijo','trato a los niños'],1,'published')
  on conflict do nothing;
end $$;
