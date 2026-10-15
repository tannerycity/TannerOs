-- Encuestas por evento (15/10/2026): "después vamos a hacer más encuestas,
-- deja todo listo". Presidencia da de alta cada encuesta (nombre y, si hay,
-- el club que nos visita); de ahí sale su liga y su QR. La página pública lee
-- el nombre y el club de aquí, y una encuesta cerrada ya no recibe respuestas.
create table if not exists app.surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  title text not null check (length(btrim(title)) between 1 and 120),
  visitor_club text,
  open boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table app.surveys enable row level security;
revoke all on app.surveys from anon, authenticated;

-- "Visita del Club León" -> "visita-del-club-leon"; si ya existe, -2, -3...
create or replace function private.survey_slug(p_organization_id uuid, p_title text)
returns text language plpgsql stable set search_path to '' as $$
declare
  base text := left(btrim(regexp_replace(lower(translate(coalesce(p_title, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'aeiouunaeiouun')), '[^a-z0-9]+', '-', 'g'), '-'), 50);
  s text; i int := 1;
begin
  if base = '' then base := 'encuesta'; end if;
  s := base;
  while exists (select 1 from app.surveys where organization_id = p_organization_id and slug = s)
     or exists (select 1 from app.survey_responses where organization_id = p_organization_id and survey = s) loop
    i := i + 1; s := base || '-' || i;
  end loop;
  return s;
end $$;

create or replace function public.v2_create_survey(organization_id uuid, title text, visitor_club text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_slug text; v_id uuid;
begin
  if not private.is_presidency(organization_id) then raise exception 'Sólo Presidencia crea encuestas'; end if;
  if length(btrim(coalesce(title, ''))) = 0 then raise exception 'Ponle nombre a la encuesta'; end if;
  v_slug := private.survey_slug(organization_id, title);
  insert into app.surveys(organization_id, slug, title, visitor_club, created_by)
  values (organization_id, v_slug, left(btrim(title), 120), nullif(left(btrim(coalesce(visitor_club, '')), 80), ''), (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;
revoke all on function public.v2_create_survey(uuid, text, text) from public, anon;
grant execute on function public.v2_create_survey(uuid, text, text) to authenticated;

create or replace function public.v2_set_survey_open(organization_id uuid, survey text, open boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := organization_id;
begin
  if not private.is_presidency(v_org) then raise exception 'Sólo Presidencia cierra encuestas'; end if;
  update app.surveys s set open = v2_set_survey_open.open where s.organization_id = v_org and s.slug = survey;
  if not found then raise exception 'No existe esa encuesta'; end if;
  return jsonb_build_object('slug', survey, 'open', v2_set_survey_open.open);
end $$;
revoke all on function public.v2_set_survey_open(uuid, text, boolean) from public, anon;
grant execute on function public.v2_set_survey_open(uuid, text, boolean) to authenticated;

-- La lista para Presidencia: las dadas de alta y las que sólo tienen respuestas
-- (por ejemplo, la de León, que salió antes de esta pantalla).
create or replace function public.v2_surveys(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := organization_id;
begin
  if not private.is_presidency(v_org) then raise exception 'Sólo Presidencia ve las encuestas'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'ultima' desc nulls last, x->>'creada' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'slug', k.slug, 'title', coalesce(s.title, k.slug), 'visitorClub', s.visitor_club, 'open', coalesce(s.open, true),
      'registrada', s.id is not null, 'creada', s.created_at,
      'total', coalesce(r.total, 0), 'tanner', coalesce(r.tanner, 0), 'visitante', coalesce(r.visitante, 0),
      'nps', r.nps, 'ultima', r.ultima) x
    from (select slug from app.surveys where surveys.organization_id = v_org
          union select survey from app.survey_responses where survey_responses.organization_id = v_org) k
    left join app.surveys s on s.organization_id = v_org and s.slug = k.slug
    left join (select survey, count(*) total, count(*) filter (where respondent = 'tanner') tanner, count(*) filter (where respondent = 'visitante') visitante,
                      case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end nps,
                      max(created_at) ultima
                 from app.survey_responses where survey_responses.organization_id = v_org group by survey) r on r.survey = k.slug) z);
end $$;
revoke all on function public.v2_surveys(uuid) from public, anon;
grant execute on function public.v2_surveys(uuid) to authenticated;

-- Lo que la página pública necesita saber de la encuesta.
create or replace function public.v2_public_survey(club_key text, survey text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); s record;
begin
  if v_org is null then raise exception 'Club unavailable'; end if;
  select title, visitor_club, open into s from app.surveys where organization_id = v_org and slug = survey;
  if not found then return jsonb_build_object('found', false, 'open', true); end if;
  return jsonb_build_object('found', true, 'title', s.title, 'visitorClub', s.visitor_club, 'open', s.open);
end $$;
revoke all on function public.v2_public_survey(text, text) from public;
grant execute on function public.v2_public_survey(text, text) to anon, authenticated;

-- Una encuesta cerrada ya no recibe respuestas.
do $do$
declare d text := pg_get_functiondef('private.public_submit_survey(text, jsonb)'::regprocedure);
begin
  if position('Esta encuesta ya cerró' in d) = 0 then
    d := replace(d, '  if v_survey = '''' then v_survey := ''general''; end if;',
      '  if v_survey = '''' then v_survey := ''general''; end if;
  if exists (select 1 from app.surveys s where s.organization_id = v_org and s.slug = v_survey and not s.open) then raise exception ''Esta encuesta ya cerró. Gracias.''; end if;');
    if position('Esta encuesta ya cerró' in d) = 0 then raise exception 'h12: no se pudo parchar public_submit_survey'; end if;
    execute d;
  end if;
end $do$;

-- Resultados: además, NPS por tipo, la encuesta y quién pidió que lo contacten.
create or replace function private.survey_results(p_organization_id uuid, p_survey text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia ve los resultados'; end if;
  return jsonb_build_object(
    'encuesta', (select jsonb_build_object('slug', slug, 'title', title, 'visitorClub', visitor_club, 'open', open) from app.surveys where organization_id = p_organization_id and slug = p_survey),
    'total', (select count(*) from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'porTipo', (select coalesce(jsonb_object_agg(respondent, n), '{}'::jsonb) from (select respondent, count(*) n from app.survey_responses where organization_id = p_organization_id and survey = p_survey group by 1) x),
    'temas', (select coalesce(jsonb_agg(jsonb_build_object('tema', t.k, 'tipo', t.respondent, 'promedio', t.promedio, 'n', t.n)), '[]'::jsonb)
              from (select e.k, r.respondent, round(avg(e.val::numeric), 2) promedio, count(*) n
                      from app.survey_responses r, jsonb_each_text(r.ratings) e(k, val)
                     where r.organization_id = p_organization_id and r.survey = p_survey
                     group by e.k, r.respondent) t),
    'distribucion', (select coalesce(jsonb_agg(jsonb_build_object('tema', t.k, 'nota', t.nota, 'n', t.n)), '[]'::jsonb)
              from (select e.k, e.val::int nota, count(*) n
                      from app.survey_responses r, jsonb_each_text(r.ratings) e(k, val)
                     where r.organization_id = p_organization_id and r.survey = p_survey
                     group by e.k, e.val::int) t),
    'nps', (select jsonb_build_object('n', count(nps), 'promotores', count(*) filter (where nps >= 9), 'detractores', count(*) filter (where nps <= 6))
            from app.survey_responses where organization_id = p_organization_id and survey = p_survey),
    'npsPorTipo', (select coalesce(jsonb_object_agg(respondent, jsonb_build_object('n', n, 'promotores', p, 'detractores', d)), '{}'::jsonb)
            from (select respondent, count(nps) n, count(*) filter (where nps >= 9) p, count(*) filter (where nps <= 6) d
                    from app.survey_responses where organization_id = p_organization_id and survey = p_survey group by 1) x),
    'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('tipo', respondent, 'club', club, 'gusto', likes, 'mejorar', improve, 'nps', nps, 'fecha', created_at,
                        'contacto', contact_name, 'telefono', contact_phone) order by created_at desc), '[]'::jsonb)
                    from app.survey_responses where organization_id = p_organization_id and survey = p_survey
                     and (likes is not null or improve is not null or contact_phone is not null)));
end $$;
revoke all on function private.survey_results(uuid, text) from public, anon;

-- La del partido contra León ya salió: se registra con su nombre.
insert into app.surveys(organization_id, slug, title, visitor_club)
select id, 'leon-oct26', 'Visita del Club León', 'Club León' from public.organizations where slug = 'tannery-city-fc'
on conflict (organization_id, slug) do nothing;
