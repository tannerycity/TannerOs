create table if not exists app.centro_tanner_search_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  query text not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table app.centro_tanner_search_log enable row level security;
create index if not exists idx_ct_search_log_org on app.centro_tanner_search_log(organization_id, created_at desc);
create index if not exists idx_consent_documents_body_trgm on app.consent_documents using gin(body gin_trgm_ops);

create or replace function private.public_centro_tanner_home(p_public_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('centro_tanner_home',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;

  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category',category,'count',cnt) order by category)
      from (select category, count(*) cnt from app.policies
            where organization_id=v_org and status='published' group by category) c
    ), '[]'::jsonb),
    'featuredFaqs', coalesce((
      select jsonb_agg(jsonb_build_object('question',f.question,'answer',f.answer,'policySlug',p.slug) order by f.sort_order, f.created_at)
      from (select * from app.faqs where organization_id=v_org and status='published' order by sort_order, created_at limit 6) f
      left join app.policies p on p.id=f.policy_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('code',d.code,'title',d.title,'version',d.version,'updatedAt',d.published_at) order by d.code)
      from app.consent_documents d where d.organization_id=v_org and d.active
    ), '[]'::jsonb),
    'lastUpdated', (
      select greatest(
        coalesce((select max(published_at) from app.policies where organization_id=v_org and status='published'),'epoch'::timestamptz),
        coalesce((select max(published_at) from app.consent_documents where organization_id=v_org and active),'epoch'::timestamptz)
      )
    )
  ) into v_data;
  return v_data;
end $$;

create or replace function private.public_centro_tanner_search(p_public_key text, p_query text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_q text; v_tsq tsquery; v_data jsonb; v_count integer;
begin
  perform private.enforce_public_rate_limit('centro_tanner_search',600,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  v_q := trim(coalesce(p_query,''));
  if length(v_q) < 2 then return '[]'::jsonb; end if;
  v_tsq := plainto_tsquery('spanish', unaccent(v_q));

  with results as (
    select 'policy'::text as type, p.slug as slug, p.title as title, p.short_answer as snippet, p.category as category,
      (ts_rank(p.search, v_tsq) + similarity(p.title, v_q) + similarity(p.short_answer, v_q)) as rank
    from app.policies p
    where p.organization_id=v_org and p.status='published'
      and (p.search @@ v_tsq or similarity(p.title, v_q) > 0.2 or similarity(p.short_answer, v_q) > 0.2)
    union all
    select 'faq', coalesce(pol.slug,''), f.question, f.answer, coalesce(f.category, pol.category, 'faq'),
      (ts_rank(f.search, v_tsq) + similarity(f.question, v_q))
    from app.faqs f left join app.policies pol on pol.id=f.policy_id
    where f.organization_id=v_org and f.status='published'
      and (f.search @@ v_tsq or similarity(f.question, v_q) > 0.2)
    union all
    select 'document', d.code,
      d.title, left(d.body,220),
      case d.code when 'reglamento' then 'conducta' when 'visoria' then 'jugadores' else 'privacidad' end,
      (similarity(d.title, v_q) + similarity(d.body, v_q) + (case when d.body ilike '%'||v_q||'%' then 0.3 else 0 end))
    from app.consent_documents d
    where d.organization_id=v_org and d.active
      and (similarity(d.title, v_q) > 0.2 or similarity(d.body, v_q) > 0.12 or d.body ilike '%'||v_q||'%' or d.title ilike '%'||v_q||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object('type',type,'slug',slug,'title',title,'snippet',snippet,'category',category) order by rank desc), '[]'::jsonb),
         count(*)
  into v_data, v_count
  from (select * from results order by rank desc limit 20) r;

  insert into app.centro_tanner_search_log(organization_id, query, result_count) values (v_org, v_q, coalesce(v_count,0));
  return v_data;
end $$;

create or replace function private.public_centro_tanner_policy(p_public_key text, p_slug text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_policy app.policies; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('centro_tanner_policy',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  select * into v_policy from app.policies where organization_id=v_org and slug=p_slug and status='published';
  if not found then raise exception 'Política no encontrada'; end if;

  select jsonb_build_object(
    'policyCode', v_policy.policy_code, 'title', v_policy.title, 'slug', v_policy.slug,
    'category', v_policy.category, 'scope', v_policy.scope, 'shortAnswer', v_policy.short_answer,
    'officialContent', v_policy.official_content, 'version', v_policy.version,
    'effectiveDate', v_policy.effective_date, 'publishedAt', v_policy.published_at,
    'requiresAcceptance', v_policy.requires_acceptance, 'consentDocumentCode', v_policy.consent_document_code,
    'relatedFaqs', coalesce((
      select jsonb_agg(jsonb_build_object('question',question,'answer',answer) order by sort_order)
      from app.faqs where policy_id=v_policy.id and status='published'
    ), '[]'::jsonb)
  ) into v_data;
  return v_data;
end $$;

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
    'slug',slug,'title',title,'shortAnswer',short_answer,'category',category
  ) order by title), '[]'::jsonb) into v_data
  from app.policies where organization_id=v_org and status='published' and category=p_category;
  return v_data;
end $$;

create or replace function private.public_centro_tanner_document(p_public_key text, p_code text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_doc app.consent_documents; v_org_row public.organizations; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('centro_tanner_document',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  select * into v_doc from app.consent_documents where organization_id=v_org and code=p_code and active;
  if not found then raise exception 'Documento no encontrado'; end if;
  select * into v_org_row from public.organizations where id=v_org;

  select jsonb_build_object(
    'code', v_doc.code, 'title', v_doc.title, 'body', v_doc.body, 'version', v_doc.version,
    'required', v_doc.required, 'effectiveDate', v_doc.effective_date, 'publishedAt', v_doc.published_at,
    'organizationLegalName', v_org_row.legal_name,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('version',version,'publishedAt',published_at) order by version desc)
      from app.consent_document_versions where document_id=v_doc.id
    ), '[]'::jsonb)
  ) into v_data;
  return v_data;
end $$;

create or replace function private.public_centro_tanner_changelog(p_public_key text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('centro_tanner_changelog',300,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionLabel', c.version_label, 'title', c.title, 'description', c.description,
    'effectiveDate', c.effective_date, 'publishedAt', c.published_at
  ) order by coalesce(c.effective_date, c.published_at::date) desc, c.published_at desc), '[]'::jsonb) into v_data
  from app.centro_tanner_changes c where c.organization_id=v_org and c.status='published';
  return v_data;
end $$;

create or replace function public.v2_public_centro_tanner_home(club_key text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_home(club_key) $$;
create or replace function public.v2_public_centro_tanner_search(club_key text, q text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_search(club_key, q) $$;
create or replace function public.v2_public_centro_tanner_policy(club_key text, policy_slug text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_policy(club_key, policy_slug) $$;
create or replace function public.v2_public_centro_tanner_category(club_key text, category_code text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_category(club_key, category_code) $$;
create or replace function public.v2_public_centro_tanner_document(club_key text, doc_code text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_document(club_key, doc_code) $$;
create or replace function public.v2_public_centro_tanner_changelog(club_key text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.public_centro_tanner_changelog(club_key) $$;

grant execute on function public.v2_public_centro_tanner_home(text) to anon, authenticated;
grant execute on function public.v2_public_centro_tanner_search(text,text) to anon, authenticated;
grant execute on function public.v2_public_centro_tanner_policy(text,text) to anon, authenticated;
grant execute on function public.v2_public_centro_tanner_category(text,text) to anon, authenticated;
grant execute on function public.v2_public_centro_tanner_document(text,text) to anon, authenticated;
grant execute on function public.v2_public_centro_tanner_changelog(text) to anon, authenticated;
;
