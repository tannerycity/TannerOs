-- Centro Tanner: funciones públicas (anon) y de administración (staff).
-- Mismo patrón que v2_public_* / v2_* existentes: wrappers delgados en `public`
-- que llaman lógica SECURITY DEFINER en `private`. Nada de RLS directo.

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

-- =====================================================================
-- PÚBLICO (anon + authenticated) — solo contenido publicado/activo
-- =====================================================================

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

-- =====================================================================
-- ADMINISTRACIÓN (staff, requiere módulo centro_tanner)
-- =====================================================================

create or replace function private.centro_tanner_admin_list(p_organization_id uuid, p_status text default null)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_data jsonb;
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'policyCode',policy_code,'slug',slug,'title',title,'category',category,'scope',scope,
        'shortAnswer',short_answer,'officialContent',official_content,'keywords',keywords,'status',status,
        'requiresAcceptance',requires_acceptance,'consentDocumentCode',consent_document_code,
        'version',version,'effectiveDate',effective_date,'updatedAt',updated_at,'publishedAt',published_at
      ) order by updated_at desc)
      from app.policies where organization_id=p_organization_id and (p_status is null or status=p_status)
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',f.id,'policyId',f.policy_id,'policySlug',p.slug,'question',f.question,'answer',f.answer,
        'category',f.category,'sortOrder',f.sort_order,'status',f.status,'updatedAt',f.updated_at
      ) order by f.sort_order, f.updated_at desc)
      from app.faqs f left join app.policies p on p.id=f.policy_id
      where f.organization_id=p_organization_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',code,'title',title,'version',version,'required',required,'active',active,
        'effectiveDate',effective_date,'publishedAt',published_at
      ) order by code)
      from app.consent_documents where organization_id=p_organization_id
    ), '[]'::jsonb),
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'versionLabel',version_label,'title',title,'description',description,
        'effectiveDate',effective_date,'status',status,'publishedAt',published_at
      ) order by created_at desc)
      from app.centro_tanner_changes where organization_id=p_organization_id
    ), '[]'::jsonb),
    'searchMisses', coalesce((
      select jsonb_agg(jsonb_build_object('query',query,'count',cnt) order by cnt desc) from (
        select query, count(*) cnt from app.centro_tanner_search_log
        where organization_id=p_organization_id and result_count=0 and created_at > now()-interval '30 days'
        group by query order by count(*) desc limit 20
      ) s
    ), '[]'::jsonb)
  ) into v_data;
  return v_data;
end $$;

create or replace function private.centro_tanner_policy_upsert(
  p_organization_id uuid, p_id uuid, p_policy_code text, p_slug text, p_title text,
  p_category text, p_scope text, p_short_answer text, p_official_content text,
  p_keywords text[], p_requires_acceptance boolean, p_consent_document_code text, p_effective_date date
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_id uuid; v_uid uuid := auth.uid(); v_existing app.policies; v_next_version integer;
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;

  if p_id is null then
    insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,
      keywords,requires_acceptance,consent_document_code,effective_date,created_by,updated_by)
    values (p_organization_id,p_policy_code,p_slug,p_title,p_category,coalesce(p_scope,'tannery_city'),p_short_answer,
      p_official_content,coalesce(p_keywords,'{}'),coalesce(p_requires_acceptance,false),p_consent_document_code,
      p_effective_date, v_uid, v_uid)
    returning id into v_id;
  else
    select * into v_existing from app.policies where id=p_id and organization_id=p_organization_id;
    if not found then raise exception 'Política no encontrada'; end if;

    v_next_version := v_existing.version;
    if v_existing.status='published' and (
         v_existing.title is distinct from p_title or
         v_existing.short_answer is distinct from p_short_answer or
         v_existing.official_content is distinct from p_official_content) then
      insert into app.policy_versions(policy_id,version,title,short_answer,official_content,status,effective_date,published_at,created_by)
      values (v_existing.id, v_existing.version, v_existing.title, v_existing.short_answer, v_existing.official_content,
              v_existing.status, v_existing.effective_date, v_existing.published_at, v_existing.updated_by)
      on conflict (policy_id,version) do nothing;
      v_next_version := v_existing.version + 1;
    end if;

    update app.policies set
      policy_code=p_policy_code, slug=p_slug, title=p_title, category=p_category, scope=coalesce(p_scope,scope),
      short_answer=p_short_answer, official_content=p_official_content, keywords=coalesce(p_keywords,keywords),
      requires_acceptance=coalesce(p_requires_acceptance,requires_acceptance), consent_document_code=p_consent_document_code,
      effective_date=p_effective_date, version=v_next_version,
      published_at=case when v_existing.status='published' then now() else published_at end,
      updated_by=v_uid
    where id=p_id
    returning id into v_id;
  end if;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values (p_organization_id, v_uid, private.current_actor_label(p_organization_id), 'centroTannerPolicySaved','policy',v_id::text,
    jsonb_build_object('title',p_title,'category',p_category), now());

  return jsonb_build_object('id', v_id);
end $$;

create or replace function private.centro_tanner_policy_publish(p_organization_id uuid, p_policy_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); v_p app.policies;
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;
  select * into v_p from app.policies where id=p_policy_id and organization_id=p_organization_id;
  if not found then raise exception 'Política no encontrada'; end if;

  update app.policies set status='published', published_at=now(), updated_by=v_uid where id=p_policy_id;

  insert into app.policy_versions(policy_id,version,title,short_answer,official_content,status,effective_date,published_at,created_by)
  values (v_p.id, v_p.version, v_p.title, v_p.short_answer, v_p.official_content, 'published', v_p.effective_date, now(), v_uid)
  on conflict (policy_id,version) do nothing;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values (p_organization_id, v_uid, private.current_actor_label(p_organization_id), 'centroTannerPolicyPublished','policy',v_p.id::text,
    jsonb_build_object('title',v_p.title,'version',v_p.version), now());

  return jsonb_build_object('id', v_p.id, 'status', 'published', 'version', v_p.version);
end $$;

create or replace function private.centro_tanner_policy_archive(p_organization_id uuid, p_policy_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid();
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;
  update app.policies set status='archived', updated_by=v_uid where id=p_policy_id and organization_id=p_organization_id;
  if not found then raise exception 'Política no encontrada'; end if;
  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values (p_organization_id, v_uid, private.current_actor_label(p_organization_id), 'centroTannerPolicyArchived','policy',p_policy_id::text,'{}'::jsonb, now());
  return jsonb_build_object('id', p_policy_id, 'status','archived');
end $$;

create or replace function private.centro_tanner_faq_upsert(
  p_organization_id uuid, p_id uuid, p_policy_id uuid, p_question text, p_answer text,
  p_category text, p_keywords text[], p_sort_order integer, p_status text
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;
  if p_id is null then
    insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status,created_by,updated_by)
    values (p_organization_id,p_policy_id,p_question,p_answer,p_category,coalesce(p_keywords,'{}'),coalesce(p_sort_order,0),
      coalesce(p_status,'published'), v_uid, v_uid)
    returning id into v_id;
  else
    update app.faqs set policy_id=p_policy_id, question=p_question, answer=p_answer, category=p_category,
      keywords=coalesce(p_keywords,keywords), sort_order=coalesce(p_sort_order,sort_order),
      status=coalesce(p_status,status), updated_by=v_uid
    where id=p_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'FAQ no encontrada'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

-- p_bump_version es una decisión editorial explícita: un cambio cosmético no
-- debe forzar nueva aceptación de las familias; una regla nueva sí.
create or replace function private.centro_tanner_document_upsert(
  p_organization_id uuid, p_code text, p_title text, p_body text, p_required boolean,
  p_effective_date date, p_bump_version boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_uid uuid := auth.uid(); v_existing app.consent_documents; v_next_version integer;
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;
  select * into v_existing from app.consent_documents where organization_id=p_organization_id and code=p_code;

  if not found then
    insert into app.consent_documents(organization_id,code,title,body,version,required,active,effective_date,published_at,created_by,updated_by)
    values (p_organization_id,p_code,p_title,p_body,1,coalesce(p_required,true),true,p_effective_date,now(),v_uid,v_uid)
    returning version into v_next_version;
    return jsonb_build_object('code', p_code, 'version', v_next_version, 'versionBumped', false);
  end if;

  v_next_version := v_existing.version + (case when p_bump_version then 1 else 0 end);
  update app.consent_documents set
    title=p_title, body=p_body, required=coalesce(p_required,required), effective_date=p_effective_date,
    version=v_next_version, published_at=now(), updated_by=v_uid
  where id=v_existing.id;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values (p_organization_id, v_uid, private.current_actor_label(p_organization_id), 'centroTannerDocumentSaved','consent_document',v_existing.id::text,
    jsonb_build_object('code',p_code,'version',v_next_version,'versionBumped',p_bump_version), now());

  return jsonb_build_object('code', p_code, 'version', v_next_version, 'versionBumped', p_bump_version);
end $$;

create or replace function private.centro_tanner_change_upsert(
  p_organization_id uuid, p_id uuid, p_version_label text, p_title text, p_description text,
  p_effective_date date, p_status text, p_related_policy_id uuid, p_related_document_code text
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',true) then raise exception 'Not authorized'; end if;
  if p_id is null then
    insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,
      published_at,related_policy_id,related_document_code,created_by)
    values (p_organization_id,p_version_label,p_title,p_description,p_effective_date,coalesce(p_status,'published'),
      case when coalesce(p_status,'published')='published' then now() else null end,
      p_related_policy_id,p_related_document_code, v_uid)
    returning id into v_id;
  else
    update app.centro_tanner_changes set version_label=p_version_label,title=p_title,description=p_description,
      effective_date=p_effective_date, status=coalesce(p_status,status),
      published_at=case when coalesce(p_status,status)='published' and published_at is null then now() else published_at end,
      related_policy_id=p_related_policy_id, related_document_code=p_related_document_code
    where id=p_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Cambio no encontrado'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function private.centro_tanner_acceptance_stats(p_organization_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_data jsonb; v_eligible integer;
begin
  if not private.has_module_access(p_organization_id,'centro_tanner',false) then raise exception 'Not authorized'; end if;
  select count(*) into v_eligible from app.players where organization_id=p_organization_id and archived_at is null;
  select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) into v_data from (
    select d.code, d.title, d.version, v_eligible as eligible,
      count(a.id) filter (where a.document_version=d.version) as accepted
    from app.consent_documents d
    left join app.consent_acceptances a on a.document_id=d.id and a.organization_id=p_organization_id
    where d.organization_id=p_organization_id and d.active
    group by d.code, d.title, d.version
    order by d.code
  ) t;
  return v_data;
end $$;

create or replace function public.v2_centro_tanner_admin_list(organization_id uuid, status_filter text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.centro_tanner_admin_list(organization_id, status_filter) $$;
create or replace function public.v2_centro_tanner_policy_upsert(organization_id uuid, id uuid, policy_code text, slug text, title text,
  category text, scope text, short_answer text, official_content text, keywords text[], requires_acceptance boolean,
  consent_document_code text, effective_date date)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.centro_tanner_policy_upsert(organization_id, id, policy_code, slug, title, category, scope,
    short_answer, official_content, keywords, requires_acceptance, consent_document_code, effective_date)
$$;
create or replace function public.v2_centro_tanner_policy_publish(organization_id uuid, policy_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.centro_tanner_policy_publish(organization_id, policy_id) $$;
create or replace function public.v2_centro_tanner_policy_archive(organization_id uuid, policy_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.centro_tanner_policy_archive(organization_id, policy_id) $$;
create or replace function public.v2_centro_tanner_faq_upsert(organization_id uuid, id uuid, policy_id uuid, question text,
  answer text, category text, keywords text[], sort_order integer, status text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.centro_tanner_faq_upsert(organization_id, id, policy_id, question, answer, category, keywords, sort_order, status)
$$;
create or replace function public.v2_centro_tanner_document_upsert(organization_id uuid, code text, title text, body text,
  required boolean, effective_date date, bump_version boolean default false)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.centro_tanner_document_upsert(organization_id, code, title, body, required, effective_date, bump_version)
$$;
create or replace function public.v2_centro_tanner_change_upsert(organization_id uuid, id uuid, version_label text, title text,
  description text, effective_date date, status text, related_policy_id uuid, related_document_code text)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.centro_tanner_change_upsert(organization_id, id, version_label, title, description, effective_date,
    status, related_policy_id, related_document_code)
$$;
create or replace function public.v2_centro_tanner_acceptance_stats(organization_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$ select private.centro_tanner_acceptance_stats(organization_id) $$;

grant execute on function public.v2_centro_tanner_admin_list(uuid,text) to authenticated;
grant execute on function public.v2_centro_tanner_policy_upsert(uuid,uuid,text,text,text,text,text,text,text,text[],boolean,text,date) to authenticated;
grant execute on function public.v2_centro_tanner_policy_publish(uuid,uuid) to authenticated;
grant execute on function public.v2_centro_tanner_policy_archive(uuid,uuid) to authenticated;
grant execute on function public.v2_centro_tanner_faq_upsert(uuid,uuid,uuid,text,text,text,text[],integer,text) to authenticated;
grant execute on function public.v2_centro_tanner_document_upsert(uuid,text,text,text,boolean,date,boolean) to authenticated;
grant execute on function public.v2_centro_tanner_change_upsert(uuid,uuid,text,text,text,date,text,uuid,text) to authenticated;
grant execute on function public.v2_centro_tanner_acceptance_stats(uuid) to authenticated;
