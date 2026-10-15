-- h11 juntaba avg() dentro de jsonb_agg(): Postgres no deja anidar agregados.
-- Los promedios por tema se calculan primero y luego se arman.
create or replace function private.survey_results(p_organization_id uuid, p_survey text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia ve los resultados'; end if;
  return jsonb_build_object(
    'total', (select count(*) from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'porTipo', (select coalesce(jsonb_object_agg(respondent, n), '{}'::jsonb) from (select respondent, count(*) n from app.survey_responses where organization_id = p_organization_id and survey = p_survey group by 1) x),
    'temas', (select coalesce(jsonb_agg(jsonb_build_object('tema', t.k, 'tipo', t.respondent, 'promedio', t.promedio, 'n', t.n)), '[]'::jsonb)
              from (select e.k, r.respondent, round(avg(e.val::numeric), 2) promedio, count(*) n
                      from app.survey_responses r, jsonb_each_text(r.ratings) e(k, val)
                     where r.organization_id = p_organization_id and r.survey = p_survey
                     group by e.k, r.respondent) t),
    'nps', (select jsonb_build_object('n', count(nps), 'promotores', count(*) filter (where nps >= 9), 'detractores', count(*) filter (where nps <= 6))
            from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('tipo', respondent, 'club', club, 'gusto', likes, 'mejorar', improve, 'nps', nps, 'fecha', created_at) order by created_at desc), '[]'::jsonb)
                    from app.survey_responses where organization_id = p_organization_id and survey = p_survey and (likes is not null or improve is not null)));
end $$;
revoke all on function private.survey_results(uuid, text) from public, anon;
