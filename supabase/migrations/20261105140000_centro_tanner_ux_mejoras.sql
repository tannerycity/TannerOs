-- Centro Tanner (05/11/2026), a petición de Mich: auditoría de UX completa.
-- Único cambio de base de datos: dentro de un tema, las políticas con FAQs
-- publicadas (señal real de qué se pregunta más) salen primero. El resto
-- (tarjetas de Conducta/Privacidad, buscador fijo, subtítulos por tema,
-- botón que no repite el texto corto) es solo frontend — ver
-- centro-tanner/app.js, index.html y styles.css de este mismo commit.

create or replace function private.public_centro_tanner_category(p_public_key text, p_category text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('centro_tanner_category',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',p.slug,'title',p.title,'shortAnswer',p.short_answer,'category',p.category,'faqCount',coalesce(fc.cnt,0)
  ) order by coalesce(fc.cnt,0) desc, p.title), '[]'::jsonb) into v_data
  from app.policies p
  left join (select policy_id, count(*) cnt from app.faqs where status='published' group by policy_id) fc on fc.policy_id = p.id
  where p.organization_id=v_org and p.status='published' and p.category=p_category;
  return v_data;
end $$;
