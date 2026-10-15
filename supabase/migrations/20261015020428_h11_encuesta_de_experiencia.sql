-- Encuesta de experiencia (15/10/2026): "que los papás Tanners y los que
-- vinieron del Club León contesten cómo se la pasaron: ambiente,
-- instalaciones, estacionamiento, tienda, baños, partido, actitud de los
-- papás... y luego hacer gráficas y analizarlo".
-- Pública y anónima (el nombre y WhatsApp son opcionales). Cada respuesta
-- guarda a qué evento pertenece (survey) y quién contesta (Tanner o visitante).
create table if not exists app.survey_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  survey text not null,
  respondent text not null check (respondent in ('tanner', 'visitante', 'otro')),
  club text,
  ratings jsonb not null default '{}'::jsonb check (jsonb_typeof(ratings) = 'object'),
  nps int check (nps between 0 and 10),
  likes text,
  improve text,
  contact_name text,
  contact_phone text,
  consent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists survey_responses_org_survey on app.survey_responses (organization_id, survey, created_at);
alter table app.survey_responses enable row level security;
revoke all on app.survey_responses from anon, authenticated;

-- Los temas que se califican (1 a 5). "No lo usé" se manda como null.
create or replace function private.survey_rating_keys()
returns text[] language sql immutable set search_path to '' as $$
  select array['ambiente','instalaciones','estacionamiento','banos','tienda','partido','papas','staff','seguridad']
$$;

create or replace function private.public_submit_survey(p_public_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_id uuid; v_ratings jsonb := '{}'::jsonb; k text; v jsonb;
  v_resp text := lower(btrim(coalesce(p->>'respondent', '')));
  v_survey text := left(lower(regexp_replace(btrim(coalesce(p->>'survey', 'general')), '[^a-zA-Z0-9-]', '', 'g')), 60);
  v_nps int := nullif(p->>'nps', '')::int;
  v_phone text := nullif(regexp_replace(coalesce(p->>'contactPhone', ''), '[^0-9+]', '', 'g'), '');
begin
  perform private.enforce_public_rate_limit('survey', 10, interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  if v_resp not in ('tanner', 'visitante', 'otro') then raise exception 'Dinos si eres papá Tanner o vienes de visita'; end if;
  if v_survey = '' then v_survey := 'general'; end if;
  for k, v in select key, value from jsonb_each(coalesce(p->'ratings', '{}'::jsonb)) loop
    if k = any(private.survey_rating_keys()) and jsonb_typeof(v) = 'number' and (v::text)::int between 1 and 5 then
      v_ratings := v_ratings || jsonb_build_object(k, (v::text)::int);
    end if;
  end loop;
  if v_ratings = '{}'::jsonb and v_nps is null then raise exception 'Califica al menos un tema'; end if;
  if v_nps is not null and (v_nps < 0 or v_nps > 10) then raise exception 'La recomendación va de 0 a 10'; end if;
  if v_phone is not null and coalesce((p->'consent'->>'contact')::boolean, false) is not true then v_phone := null; end if;
  insert into app.survey_responses(organization_id, survey, respondent, club, ratings, nps, likes, improve, contact_name, contact_phone, consent)
  values (v_org, v_survey, v_resp, nullif(left(btrim(coalesce(p->>'club', '')), 80), ''), v_ratings, v_nps,
          nullif(left(btrim(coalesce(p->>'likes', '')), 600), ''), nullif(left(btrim(coalesce(p->>'improve', '')), 600), ''),
          case when v_phone is null then null else nullif(left(btrim(coalesce(p->>'contactName', '')), 80), '') end, v_phone,
          coalesce(p->'consent', '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function private.public_submit_survey(text, jsonb) from public;

create or replace function public.v2_public_submit_survey(club_key text, response jsonb)
returns jsonb language sql security definer set search_path to '' as $$
  select private.public_submit_survey(club_key, response)
$$;
revoke all on function public.v2_public_submit_survey(text, jsonb) from public;
grant execute on function public.v2_public_submit_survey(text, jsonb) to anon, authenticated;

-- Resultados para Presidencia: promedio por tema y por tipo de persona, NPS y comentarios.
create or replace function private.survey_results(p_organization_id uuid, p_survey text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia ve los resultados'; end if;
  return jsonb_build_object(
    'total', (select count(*) from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'porTipo', (select coalesce(jsonb_object_agg(respondent, n), '{}'::jsonb) from (select respondent, count(*) n from app.survey_responses where organization_id = p_organization_id and survey = p_survey group by 1) x),
    'temas', (select coalesce(jsonb_agg(jsonb_build_object('tema', k, 'tipo', respondent, 'promedio', round(avg(val), 2), 'n', count(*))), '[]'::jsonb)
              from app.survey_responses r, jsonb_each_text(r.ratings) e(k, val0), lateral (select val0::numeric val) z
              where r.organization_id = p_organization_id and r.survey = p_survey group by k, respondent),
    'nps', (select jsonb_build_object('n', count(nps), 'promotores', count(*) filter (where nps >= 9), 'detractores', count(*) filter (where nps <= 6))
            from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('tipo', respondent, 'club', club, 'gusto', likes, 'mejorar', improve, 'nps', nps, 'fecha', created_at) order by created_at desc), '[]'::jsonb)
                    from app.survey_responses where organization_id = p_organization_id and survey = p_survey and (likes is not null or improve is not null)));
end $$;
revoke all on function private.survey_results(uuid, text) from public, anon;
create or replace function public.v2_survey_results(organization_id uuid, survey text)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.survey_results(organization_id, survey)
$$;
revoke all on function public.v2_survey_results(uuid, text) from public, anon;
grant execute on function public.v2_survey_results(uuid, text) to authenticated;
