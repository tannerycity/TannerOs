-- Encuesta de comunidad (15/10/2026): "no quiero que diga partido León; que
-- pongan si son Baby Tanner, porque jugamos contra otros... en conjunto,
-- comunidad, para mandárselo a todos". Cada respuesta guarda la categoría (o
-- categorías) del hijo y a qué vino (entrenamientos, partidos, torneos,
-- eventos). Los resultados se pueden ver por categoría.
alter table app.survey_responses add column if not exists categories text[] not null default '{}';
alter table app.survey_responses add column if not exists visit text[] not null default '{}';

create or replace function private.survey_visit_keys()
returns text[] language sql immutable set search_path to '' as $$
  select array['entrenamientos','partidos','torneos','eventos']
$$;

create or replace function private.public_submit_survey(p_public_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_id uuid; v_ratings jsonb := '{}'::jsonb; k text; v jsonb;
  v_resp text := lower(btrim(coalesce(p->>'respondent', '')));
  v_survey text := left(lower(regexp_replace(btrim(coalesce(p->>'survey', 'general')), '[^a-zA-Z0-9-]', '', 'g')), 60);
  v_nps int := nullif(p->>'nps', '')::int;
  v_phone text := nullif(regexp_replace(coalesce(p->>'contactPhone', ''), '[^0-9+]', '', 'g'), '');
  v_cats text[]; v_visit text[];
begin
  perform private.enforce_public_rate_limit('survey', 10, interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  if v_resp not in ('tanner', 'visitante', 'otro') then raise exception 'Dinos si eres papá Tanner o vienes de visita'; end if;
  if v_survey = '' then v_survey := 'general'; end if;
  if exists (select 1 from app.surveys s where s.organization_id = v_org and s.slug = v_survey and not s.open) then raise exception 'Esta encuesta ya cerró. Gracias.'; end if;
  for k, v in select key, value from jsonb_each(coalesce(p->'ratings', '{}'::jsonb)) loop
    if k = any(private.survey_rating_keys()) and jsonb_typeof(v) = 'number' and (v::text)::int between 1 and 5 then
      v_ratings := v_ratings || jsonb_build_object(k, (v::text)::int);
    end if;
  end loop;
  if v_ratings = '{}'::jsonb and v_nps is null then raise exception 'Califica al menos un tema'; end if;
  if v_nps is not null and (v_nps < 0 or v_nps > 10) then raise exception 'La recomendación va de 0 a 10'; end if;
  if v_phone is not null and coalesce((p->'consent'->>'contact')::boolean, false) is not true then v_phone := null; end if;
  -- Categorías: texto corto, sin repetir, máximo 6.
  select coalesce(array_agg(c order by c), '{}') into v_cats from (
    select distinct left(btrim(x), 40) c from jsonb_array_elements_text(case when jsonb_typeof(p->'categories') = 'array' then p->'categories' else '[]'::jsonb end) x
     where btrim(x) <> '' limit 6) z;
  select coalesce(array_agg(x order by x), '{}') into v_visit from (
    select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p->'visit') = 'array' then p->'visit' else '[]'::jsonb end) x
     where x = any(private.survey_visit_keys())) z;
  insert into app.survey_responses(organization_id, survey, respondent, club, categories, visit, ratings, nps, likes, improve, contact_name, contact_phone, consent)
  values (v_org, v_survey, v_resp, nullif(left(btrim(coalesce(p->>'club', '')), 80), ''), v_cats, v_visit, v_ratings, v_nps,
          nullif(left(btrim(coalesce(p->>'likes', '')), 600), ''), nullif(left(btrim(coalesce(p->>'improve', '')), 600), ''),
          case when v_phone is null then null else nullif(left(btrim(coalesce(p->>'contactName', '')), 80), '') end, v_phone,
          coalesce(p->'consent', '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function private.public_submit_survey(text, jsonb) from public;

-- Resultados: además, por categoría (una respuesta con dos hijos cuenta en
-- las dos) y por a qué vino. Los comentarios traen su categoría.
do $do$
declare d text := pg_get_functiondef('private.survey_results(uuid, text)'::regprocedure);
begin
  if position('porCategoria' in d) = 0 then
    d := replace(d, $a$    'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('tipo', respondent, 'club', club,$a$,
      $a$    'porCategoria', (select coalesce(jsonb_agg(jsonb_build_object('categoria', c.cat, 'n', c.n, 'promedio', c.promedio, 'npsN', c.npsn, 'promotores', c.pro, 'detractores', c.det) order by c.n desc, c.cat), '[]'::jsonb)
              from (select x.cat, count(*) n, count(r.nps) npsn, count(*) filter (where r.nps >= 9) pro, count(*) filter (where r.nps <= 6) det,
                           (select round(avg(e.val::numeric), 2) from app.survey_responses r2, unnest(r2.categories) c2, jsonb_each_text(r2.ratings) e(k, val)
                             where r2.organization_id = p_organization_id and r2.survey = p_survey and c2 = x.cat) promedio
                      from app.survey_responses r, unnest(r.categories) x(cat)
                     where r.organization_id = p_organization_id and r.survey = p_survey
                     group by x.cat) c),
    'porVisita', (select coalesce(jsonb_object_agg(v.x, v.n), '{}'::jsonb)
              from (select x, count(*) n from app.survey_responses r, unnest(r.visit) x where r.organization_id = p_organization_id and r.survey = p_survey group by x) v),
    'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('categorias', to_jsonb(categories), 'tipo', respondent, 'club', club,$a$);
    if position('porCategoria' in d) = 0 then raise exception 'h13: no se pudo parchar survey_results'; end if;
    execute d;
  end if;
end $do$;

-- Una sola encuesta para toda la comunidad. La de León (sin respuestas) se cierra.
update app.surveys s set open = false from public.organizations o
 where o.id = s.organization_id and o.slug = 'tannery-city-fc' and s.slug = 'leon-oct26';
insert into app.surveys(organization_id, slug, title, visitor_club)
select id, 'comunidad', 'Experiencia Tannery City', null from public.organizations where slug = 'tannery-city-fc'
on conflict (organization_id, slug) do nothing;
