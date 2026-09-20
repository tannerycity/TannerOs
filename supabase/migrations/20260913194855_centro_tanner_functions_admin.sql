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
;
