create or replace function private.query_executive_insights(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app, private
as $$
declare
  v_result jsonb := jsonb_build_object('generatedAt', now());
  v_section jsonb;
  v_total integer;
  v_converted integer;
  v_top_source text;
  v_top_source_count integer;
  v_attended integer;
  v_att_total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active
  ) then raise exception 'Membership required'; end if;

  if private.has_module_access(p_organization_id,'players',false) then
    select jsonb_build_object(
      'active', count(*) filter(where status='active' and archived_at is null),
      'joined30d', count(*) filter(where status='active' and archived_at is null and joined_at >= current_date-30),
      'withdrawn90d', count(*) filter(where status='withdrawn' and withdrawn_at >= current_date-90),
      'needsReview', count(*) filter(where status='active' and archived_at is null and coalesce(needs_review,false)),
      'withoutCategory', count(*) filter(where status='active' and archived_at is null and nullif(btrim(category),'') is null),
      'byCategory', coalesce((
        select jsonb_agg(jsonb_build_object('label',x.category,'count',x.c) order by x.c desc, x.category)
        from (
          select coalesce(nullif(btrim(category),''),'Sin categoría') category,count(*) c
          from app.players
          where organization_id=p_organization_id and status='active' and archived_at is null
          group by 1 order by 2 desc,1 limit 12
        ) x
      ),'[]'::jsonb)
    ) into v_section
    from app.players where organization_id=p_organization_id;
    v_result := v_result || jsonb_build_object('players',v_section);
  end if;

  if private.has_module_access(p_organization_id,'billing',false) then
    v_result := v_result || jsonb_build_object('billing', private.query_collection_snapshot(p_organization_id,date_trunc('month',current_date)::date));
  end if;

  if private.has_module_access(p_organization_id,'prospects',false) then
    select count(*), count(*) filter(where status='converted')
      into v_total,v_converted
    from app.prospects
    where organization_id=p_organization_id and archived_at is null;

    select coalesce(nullif(btrim(source_campaign),''),nullif(btrim(source_channel),''),nullif(btrim(source),''),'Sin atribución'),count(*)
      into v_top_source,v_top_source_count
    from app.prospects
    where organization_id=p_organization_id and archived_at is null
    group by 1 order by 2 desc,1 limit 1;

    v_section := jsonb_build_object(
      'total',v_total,
      'new', (select count(*) from app.prospects where organization_id=p_organization_id and archived_at is null and status='new'),
      'active', (select count(*) from app.prospects where organization_id=p_organization_id and archived_at is null and status not in ('converted','not_continuing','archived','lost')),
      'converted',v_converted,
      'conversionRate',case when v_total=0 then 0 else round(v_converted::numeric*100/v_total,1) end,
      'new30d',(select count(*) from app.prospects where organization_id=p_organization_id and archived_at is null and created_at>=now()-interval '30 days'),
      'unplanned',(select count(*) from app.prospects where organization_id=p_organization_id and archived_at is null and status='new' and next_action_at is null),
      'overdueFollowup',(select count(*) from app.prospects where organization_id=p_organization_id and archived_at is null and status not in ('converted','not_continuing','archived','lost') and next_action_at<now()),
      'topSource',jsonb_build_object('label',coalesce(v_top_source,'Sin atribución'),'count',coalesce(v_top_source_count,0)),
      'bySource',coalesce((
        select jsonb_agg(jsonb_build_object('label',x.source,'total',x.total,'converted',x.converted,'conversionRate',case when x.total=0 then 0 else round(x.converted::numeric*100/x.total,1) end) order by x.total desc,x.source)
        from (
          select coalesce(nullif(btrim(source_campaign),''),nullif(btrim(source_channel),''),nullif(btrim(source),''),'Sin atribución') source,
                 count(*) total,count(*) filter(where status='converted') converted
          from app.prospects where organization_id=p_organization_id and archived_at is null
          group by 1 order by 2 desc,1 limit 10
        ) x
      ),'[]'::jsonb),
      'byType',coalesce((
        select jsonb_agg(jsonb_build_object('label',x.kind,'count',x.c) order by x.c desc,x.kind)
        from (
          select coalesce(nullif(btrim(registration_type),''),nullif(btrim(interest_type),''),'Sin tipo') kind,count(*) c
          from app.prospects where organization_id=p_organization_id and archived_at is null
          group by 1 order by 2 desc,1 limit 10
        ) x
      ),'[]'::jsonb)
    );
    v_result := v_result || jsonb_build_object('acquisition',v_section);
  end if;

  if private.has_module_access(p_organization_id,'attendance',false) then
    select count(*) filter(where ar.status in ('present','late')),count(*)
      into v_attended,v_att_total
    from app.attendance_records ar
    join app.sessions s on s.id=ar.session_id and s.organization_id=ar.organization_id
    where ar.organization_id=p_organization_id and s.starts_at>=now()-interval '30 days' and s.starts_at<=now();
    v_result := v_result || jsonb_build_object('attendance',jsonb_build_object(
      'sessions30d',(select count(*) from app.sessions where organization_id=p_organization_id and starts_at>=now()-interval '30 days' and starts_at<=now() and status<>'cancelled'),
      'records30d',v_att_total,
      'attended30d',v_attended,
      'rate30d',case when v_att_total=0 then null else round(v_attended::numeric*100/v_att_total,1) end
    ));
  end if;

  if private.has_module_access(p_organization_id,'commerce',false) then
    v_result := v_result || jsonb_build_object('commerce',jsonb_build_object(
      'orders30d',(select count(*) from app.orders where organization_id=p_organization_id and created_at>=now()-interval '30 days'),
      'sales30d',(select coalesce(sum(total),0) from app.orders where organization_id=p_organization_id and created_at>=now()-interval '30 days' and status not in ('cancelled','refunded')),
      'collected30d',(select coalesce(sum(op.amount),0) from app.order_payments op where op.organization_id=p_organization_id and op.created_at>=now()-interval '30 days'),
      'pendingPayment',(select count(*) from app.orders where organization_id=p_organization_id and status in ('pending_payment','partial_payment')),
      'readyToDeliver',(select count(*) from app.orders where organization_id=p_organization_id and status='ready'),
      'averageTicket30d',(select coalesce(round(avg(total),2),0) from app.orders where organization_id=p_organization_id and created_at>=now()-interval '30 days' and status not in ('cancelled','refunded'))
    ));
  end if;

  if private.has_module_access(p_organization_id,'sponsors',false) then
    v_result := v_result || jsonb_build_object('sponsors',jsonb_build_object(
      'active',(select count(*) from app.sponsors where organization_id=p_organization_id and archived_at is null and status not in ('inactive','archived')),
      'activeAgreementValue',(select coalesce(sum(monetary_value),0) from app.sponsor_agreements where organization_id=p_organization_id and status='active' and (ends_on is null or ends_on>=current_date)),
      'pipelinePotential',(select coalesce(sum(potential_value),0) from app.sponsors where organization_id=p_organization_id and archived_at is null and coalesce(stage,'') not in ('won','lost','inactive','archived')),
      'followupsOverdue',(select count(*) from app.sponsors where organization_id=p_organization_id and archived_at is null and next_action_at<now() and status not in ('inactive','archived'))
    ));
  end if;

  return v_result;
end;
$$;

revoke all on function private.query_executive_insights(uuid) from public, anon;
grant execute on function private.query_executive_insights(uuid) to authenticated;

create or replace function public.v2_executive_insights(organization_id uuid)
returns jsonb
language sql
set search_path = pg_catalog, private
as $$ select private.query_executive_insights(organization_id); $$;

revoke all on function public.v2_executive_insights(uuid) from public, anon;
grant execute on function public.v2_executive_insights(uuid) to authenticated;;
