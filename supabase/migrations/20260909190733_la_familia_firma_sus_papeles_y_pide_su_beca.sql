-- Lo que la familia tiene pendiente de papeleo, en una sola lectura: documentos
-- por firmar, documentos ya entregados, si tiene beca y en que va su solicitud.
create or replace function private.portal_paperwork(p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v jsonb;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();

  select jsonb_build_object(
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', d.code, 'title', d.title, 'body', d.body,
        'version', d.version, 'required', d.required,
        'accepted_at', a.accepted_at,
        -- Firmo una version anterior: cuenta como pendiente, con aviso.
        'accepted_version', a.document_version,
        'outdated', (a.id is not null and a.document_version < d.version))
        order by d.required desc, d.title)
      from app.consent_documents d
      left join app.consent_acceptances a
        on a.document_id = d.id and a.player_id = p_player_id
       and a.document_version = d.version
      where d.organization_id = g.organization_id and d.active), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('type', s.document_type, 'received', s.received)
        order by s.document_type)
      from app.player_document_status s where s.player_id = p_player_id), '[]'::jsonb),
    'benefit', (
      select jsonb_build_object(
        'has', true, 'type', b.benefit_type,
        'percentage', b.percentage, 'amount', coalesce(b.override_amount, b.fixed_amount),
        'since', b.starts_on, 'until', b.ends_on)
      from app.player_benefits b
      where b.player_id = p_player_id and b.active
        and (b.ends_on is null or b.ends_on >= current_date)
      order by b.priority nulls last limit 1),
    'benefit_request', (
      select jsonb_build_object(
        'status', r.status, 'reason', r.reason,
        'requested_at', r.requested_at, 'resolved_at', r.resolved_at,
        'note', r.resolution_note)
      from app.benefit_requests r
      where r.player_id = p_player_id
      order by r.requested_at desc limit 1)
  ) into v;
  return v;
end $function$;

-- Aceptar un documento. Se guarda contra la version vigente EN ESTE MOMENTO: si
-- el club cambia el reglamento manana, esta firma no cubre el texto nuevo.
create or replace function private.portal_accept_consent(p_player_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; d app.consent_documents;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();

  select * into d from app.consent_documents
   where organization_id = g.organization_id and code = p_code and active;
  if d.id is null then raise exception 'Ese documento no existe o ya no está vigente'; end if;

  insert into app.consent_acceptances(organization_id,document_id,document_version,player_id,
    guardian_id,accepted_by_user_id)
  values (g.organization_id, d.id, d.version, p_player_id, g.id, auth.uid())
  on conflict (document_id, document_version, player_id) do nothing;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'ConsentAccepted','player',p_player_id,
          jsonb_build_object('code',d.code,'version',d.version,'title',d.title), auth.uid());

  return jsonb_build_object('ok',true,'code',d.code,'version',d.version);
end $function$;

-- Pedir beca. Una sola solicitud abierta a la vez: si ya hay una en revision no
-- se crea otra, para que Presidencia no acabe con cinco del mismo Tanner.
create or replace function private.portal_request_benefit(p_player_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v_motivo text; v_abierta uuid;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();

  v_motivo := btrim(coalesce(p_reason,''));
  if length(v_motivo) < 20 then
    raise exception 'Cuéntanos un poco más: el motivo necesita al menos 20 caracteres';
  end if;
  if length(v_motivo) > 2000 then
    raise exception 'El motivo es muy largo, resúmelo en 2000 caracteres';
  end if;

  select id into v_abierta from app.benefit_requests
   where player_id = p_player_id and status = 'pending' limit 1;
  if v_abierta is not null then
    raise exception 'Ya tienes una solicitud en revisión. El club te va a contestar.';
  end if;

  insert into app.benefit_requests(organization_id,player_id,guardian_id,requested_by_user_id,reason)
  values (g.organization_id, p_player_id, g.id, auth.uid(), v_motivo);

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'BenefitRequested','player',p_player_id,
          jsonb_build_object('reason',v_motivo), auth.uid());

  return jsonb_build_object('ok',true);
end $function$;

create or replace function public.v2_portal_paperwork(player_id uuid)
returns jsonb language sql security invoker set search_path to 'pg_catalog','private'
as $function$ select private.portal_paperwork(player_id); $function$;

create or replace function public.v2_portal_accept_consent(player_id uuid, code text)
returns jsonb language sql security invoker set search_path to 'pg_catalog','private'
as $function$ select private.portal_accept_consent(player_id, code); $function$;

create or replace function public.v2_portal_request_benefit(player_id uuid, reason text)
returns jsonb language sql security invoker set search_path to 'pg_catalog','private'
as $function$ select private.portal_request_benefit(player_id, reason); $function$;

revoke all on function private.portal_paperwork(uuid) from public, anon, authenticated;
revoke all on function private.portal_accept_consent(uuid,text) from public, anon, authenticated;
revoke all on function private.portal_request_benefit(uuid,text) from public, anon, authenticated;
grant execute on function public.v2_portal_paperwork(uuid) to authenticated;
grant execute on function public.v2_portal_accept_consent(uuid,text) to authenticated;
grant execute on function public.v2_portal_request_benefit(uuid,text) to authenticated;;
