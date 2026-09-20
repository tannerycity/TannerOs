create or replace function private.query_action_center(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app,private
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_count integer;
  v_amount numeric;
  v_org_settings jsonb;
  v_sponsor_soon integer;
  v_sponsor_overdue integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active) then
    raise exception 'Membership required';
  end if;

  if private.has_module_access(p_organization_id,'billing',false) then
    select count(*),coalesce(sum(balance_due),0) into v_count,v_amount
    from private.query_open_receivables(p_organization_id)
    where due_date < current_date;
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','billing_overdue','priority','critical','module','billing','title','Cobranza vencida',
        'detail',v_count||' cargo(s) vencido(s)','count',v_count,'amount',v_amount,'href','/v2/finanzas/'
      ));
    end if;

    select count(*) into v_count from app.billing_profiles
    where organization_id=p_organization_id and needs_review;
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','billing_review','priority','attention','module','billing','title','Cobranza por revisar',
        'detail',v_count||' perfil(es) requieren configuración o revisión','count',v_count,'href','/v2/finanzas/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'prospects',false) then
    select count(*) into v_count from app.prospects
    where organization_id=p_organization_id and archived_at is null
      and status not in ('converted','not_continuing','archived')
      and next_action_at is not null and next_action_at < now();
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','prospects_overdue','priority','critical','module','prospects','title','Seguimientos vencidos',
        'detail',v_count||' prospecto(s) tienen una próxima acción vencida','count',v_count,'href','/v2/prospectos/'
      ));
    end if;

    select count(*) into v_count from app.prospects
    where organization_id=p_organization_id and archived_at is null
      and status='new' and next_action_at is null;
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','prospects_unplanned','priority','attention','module','prospects','title','Prospectos sin próxima acción',
        'detail',v_count||' prospecto(s) nuevos aún no tienen seguimiento programado','count',v_count,'href','/v2/prospectos/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'commerce',false) then
    select count(*) into v_count from app.orders
    where organization_id=p_organization_id and status='ready';
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','orders_ready','priority','attention','module','commerce','title','Pedidos listos por entregar',
        'detail',v_count||' pedido(s) están listos','count',v_count,'href','/v2/pedidos/'
      ));
    end if;

    select count(*) into v_count from app.orders
    where organization_id=p_organization_id and status in ('pending_payment','partial_payment');
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','orders_payment_pending','priority','info','module','commerce','title','Pedidos con pago pendiente',
        'detail',v_count||' pedido(s) siguen pendientes de pago','count',v_count,'href','/v2/pedidos/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'sponsors',false) then
    select count(*) filter(where renewal_state='overdue'),count(*) filter(where renewal_state='soon')
      into v_sponsor_overdue,v_sponsor_soon
    from private.query_sponsors(p_organization_id);
    if coalesce(v_sponsor_overdue,0)>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','sponsors_renewal_overdue','priority','critical','module','sponsors','title','Convenios vencidos',
        'detail',v_sponsor_overdue||' patrocinador(es) tienen convenio vencido','count',v_sponsor_overdue,'href','/v2/patrocinadores/'
      ));
    end if;
    if coalesce(v_sponsor_soon,0)>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','sponsors_renewal_soon','priority','attention','module','sponsors','title','Renovaciones próximas',
        'detail',v_sponsor_soon||' patrocinador(es) están en ventana de renovación','count',v_sponsor_soon,'href','/v2/patrocinadores/'
      ));
    end if;

    select count(*) into v_count from app.sponsors
    where organization_id=p_organization_id and archived_at is null
      and next_action_at is not null and next_action_at < now()
      and status not in ('inactive','archived');
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','sponsors_followup_overdue','priority','attention','module','sponsors','title','Seguimientos comerciales vencidos',
        'detail',v_count||' marca(s) tienen próxima acción vencida','count',v_count,'href','/v2/patrocinadores/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'equipment',false) then
    select count(*) into v_count from private.query_equipment_items(p_organization_id) where needs_reorder;
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','equipment_low','priority','attention','module','equipment','title','Utilería debajo del mínimo',
        'detail',v_count||' artículo(s) requieren reposición','count',v_count,'href','/v2/utileria/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'players',false) then
    select count(*) into v_count from app.players
    where organization_id=p_organization_id and archived_at is null and status='active' and needs_review;
    if v_count>0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','players_review','priority','attention','module','players','title','Expedientes Tanner por revisar',
        'detail',v_count||' jugador(es) activos están marcados para revisión','count',v_count,'href','/v2/jugadores/'
      ));
    end if;
  end if;

  if private.has_module_access(p_organization_id,'admin',false) then
    select settings into v_org_settings from public.organizations where id=p_organization_id;
    if coalesce(v_org_settings->>'legacyCutoverStatus','') <> 'complete' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'code','legacy_cutover','priority','attention','module','admin','title','Corte V1 pendiente',
        'detail','El sistema anterior aún no está marcado como retirado','href','/v2/admin/cutover/'
      ));
    end if;
  end if;

  return jsonb_build_object(
    'generatedAt',now(),
    'items',(select coalesce(jsonb_agg(x order by case x->>'priority' when 'critical' then 1 when 'attention' then 2 else 3 end, x->>'title'),'[]'::jsonb) from jsonb_array_elements(v_items) x),
    'summary',jsonb_build_object(
      'critical',(select count(*) from jsonb_array_elements(v_items) x where x->>'priority'='critical'),
      'attention',(select count(*) from jsonb_array_elements(v_items) x where x->>'priority'='attention'),
      'info',(select count(*) from jsonb_array_elements(v_items) x where x->>'priority'='info')
    )
  );
end;
$$;

revoke all on function private.query_action_center(uuid) from public,anon;
grant execute on function private.query_action_center(uuid) to authenticated;

create or replace function public.v2_action_center(organization_id uuid)
returns jsonb
language sql
security invoker
set search_path=pg_catalog,private
as $$ select private.query_action_center(organization_id); $$;
revoke all on function public.v2_action_center(uuid) from public,anon;
grant execute on function public.v2_action_center(uuid) to authenticated;;
