-- Centro Tanner: pone al día el contenido congelado desde el 13/sep y agrega
-- la señal de "¿te sirvió esto?" por política/FAQ (feedback anónimo, igual
-- patrón que centro_tanner_search_log: solo cuenta, sin PII).
begin;

-- ---------------------------------------------------------------------------
-- app.centro_tanner_feedback: 👍/👎 anónimo por política o FAQ publicada.
-- ---------------------------------------------------------------------------
create table if not exists app.centro_tanner_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  target_type text not null check (target_type in ('policy','faq')),
  target_id uuid not null,
  helpful boolean not null,
  created_at timestamptz not null default now()
);
alter table app.centro_tanner_feedback enable row level security;
create index if not exists idx_ct_feedback_target on app.centro_tanner_feedback(organization_id, target_type, target_id);

create or replace function private.public_centro_tanner_feedback(p_public_key text, p_target_type text, p_target_id uuid, p_helpful boolean)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_org uuid; v_exists boolean;
begin
  perform private.enforce_public_rate_limit('centro_tanner_feedback',600,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Centro Tanner unavailable'; end if;
  if p_target_type not in ('policy','faq') then raise exception 'Tipo inválido'; end if;

  if p_target_type='policy' then
    select exists(select 1 from app.policies where id=p_target_id and organization_id=v_org and status='published') into v_exists;
  else
    select exists(select 1 from app.faqs where id=p_target_id and organization_id=v_org and status='published') into v_exists;
  end if;
  if not v_exists then raise exception 'Contenido no encontrado'; end if;

  insert into app.centro_tanner_feedback(organization_id,target_type,target_id,helpful)
  values (v_org, p_target_type, p_target_id, p_helpful);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.v2_public_centro_tanner_feedback(club_key text, target_type text, target_id uuid, helpful boolean)
returns jsonb language sql set search_path to 'pg_catalog','private' as $$
  select private.public_centro_tanner_feedback(club_key, target_type, target_id, helpful)
$$;
grant execute on function public.v2_public_centro_tanner_feedback(text,text,uuid,boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: agrega agregados de feedback a la carga del panel (sin romper el
-- shape existente — solo se agrega la llave 'feedback').
-- ---------------------------------------------------------------------------
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
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'targetType',target_type,'targetId',target_id,'title',title,
        'helpful',helpful_count,'notHelpful',not_helpful_count
      ) order by not_helpful_count desc, helpful_count asc) from (
        select fb.target_type, fb.target_id,
          coalesce(p.title, f.question) as title,
          count(*) filter (where fb.helpful) as helpful_count,
          count(*) filter (where not fb.helpful) as not_helpful_count
        from app.centro_tanner_feedback fb
        left join app.policies p on fb.target_type='policy' and p.id=fb.target_id
        left join app.faqs f on fb.target_type='faq' and f.id=fb.target_id
        where fb.organization_id=p_organization_id
        group by fb.target_type, fb.target_id, p.title, f.question
      ) t
    ), '[]'::jsonb)
  ) into v_data;
  return v_data;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Contenido nuevo: lo que se agregó en octubre (Tienda/Pedido rediseño) y
-- nunca llegó a Centro Tanner porque el hub quedó congelado desde el 13/sep.
-- Fuente: commit 7747d24 (#322) y 3bab7da (#337), mismas reglas y mismo tono
-- que el resto del padrón (TC-xxx, respuesta corta + contenido oficial).
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid; v_policy_id uuid; v_next_code int;
begin
  select id into v_org from public.organizations limit 1;
  if v_org is null then return; end if;

  select coalesce(max(cast(substring(policy_code from 'TC-(\d+)') as int)),0)+1 into v_next_code from app.policies where organization_id=v_org;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,
    keywords,requires_acceptance,consent_document_code,status,version,effective_date,published_at)
  values (
    v_org, 'TC-'||v_next_code, 'plazo-para-recoger-tu-pedido', 'Plazo para recoger tu pedido de uniforme',
    'uniformes', 'tannery_city',
    'Tienes 30 días para recoger tu pedido desde que te avisemos que llegó. Después de ese plazo el club ya no se hace responsable de la prenda.',
    'Tienes 30 días para recoger tu pedido desde que el club te avise que llegó. Después de ese plazo el club ya no se hace responsable de la prenda. Este plazo se acepta al momento de hacer el pedido en la Tienda y se recuerda de nuevo cuando el pedido llega y te avisamos por WhatsApp. Puedes seguir el estado de tu pedido en todo momento desde tu Portal de familia.',
    array['plazo','recoger','pedido','uniforme','30 dias','entrega'], false, null, 'published', 1, '2026-10-21'::date, now()
  )
  on conflict (organization_id, slug) do nothing
  returning id into v_policy_id;

  if v_policy_id is not null then
    insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status)
    values (v_org, v_policy_id, '¿Cuánto tiempo tengo para recoger mi pedido de uniforme?',
      'Tienes 30 días a partir de que te avisemos que tu pedido llegó. Pasado ese plazo, el club ya no se hace responsable de la prenda. Puedes revisar el estado de tu pedido en tu Portal de familia.',
      'uniformes', array['plazo','recoger','pedido'], 0, 'published');

    insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,published_at,related_policy_id)
    values (v_org, 'v1.1', 'Nuevo: plazo para recoger tu pedido de uniforme',
      'Se agregó la política del plazo de 30 días para recoger un pedido de uniforme desde que el club avisa que llegó.',
      '2026-10-21'::date, 'published', now(), v_policy_id);
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status)
  select v_org, null, '¿Cómo sé qué talla pedir en la Tienda?',
    'Cada producto de la Tienda tiene una guía de tallas con medidas de referencia y cómo medir. Si dudas entre dos tallas, te recomendamos pedir la más grande. Las medidas son aproximadas hasta que el proveedor confirma el corte final.',
    'uniformes', array['talla','tienda','guia de tallas','pedido'], 1, 'published'
  where not exists (
    select 1 from app.faqs where organization_id=v_org and question='¿Cómo sé qué talla pedir en la Tienda?'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Expone el id de la política al público: lo necesita el widget "¿te sirvió
-- esto?" para registrar el feedback contra el contenido correcto.
-- ---------------------------------------------------------------------------
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
    'id', v_policy.id,
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
