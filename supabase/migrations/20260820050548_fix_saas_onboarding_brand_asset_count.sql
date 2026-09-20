create or replace function private.query_onboarding_readiness(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app, private
as $$
declare
  v_org public.organizations%rowtype;
  v_plan_status text;
  v_members integer:=0;
  v_roles integer:=0;
  v_players integer:=0;
  v_player_review integer:=0;
  v_billing integer:=0;
  v_billing_review integer:=0;
  v_modules integer:=0;
  v_brand_assets integer:=0;
  v_checks jsonb:='[]'::jsonb;
  v_ready integer:=0;
  v_total integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'admin',false) then raise exception 'Not authorized'; end if;
  select * into v_org from public.organizations where id=p_organization_id;
  if v_org.id is null then raise exception 'Organization not found'; end if;

  select s.status into v_plan_status from public.subscriptions s where s.organization_id=p_organization_id order by s.created_at desc limit 1;
  select count(*),count(distinct role) into v_members,v_roles from public.organization_memberships where organization_id=p_organization_id and active=true;
  select count(*),count(*) filter(where needs_review) into v_players,v_player_review from app.players where organization_id=p_organization_id and archived_at is null and status='active';
  select count(*),count(*) filter(where needs_review or status='review') into v_billing,v_billing_review from app.billing_profiles where organization_id=p_organization_id;
  with canonical(code) as (values ('players'),('billing'),('accounting'),('academies'),('attendance'),('callups'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa'))
  select count(*) into v_modules from canonical where private.module_enabled(p_organization_id,code);
  if jsonb_typeof(coalesce(v_org.branding->'assets','{}'::jsonb))='object' then
    select count(*) into v_brand_assets from jsonb_object_keys(coalesce(v_org.branding->'assets','{}'::jsonb));
  end if;

  v_checks:=jsonb_build_array(
    jsonb_build_object('code','organization','label','Club y región','status',case when length(trim(coalesce(v_org.name,'')))>=2 and coalesce(v_org.timezone,'')<>'' and coalesce(v_org.locale,'')<>'' and coalesce(v_org.currency,'')<>'' then 'ready' else 'blocker' end,'detail',concat_ws(' · ',v_org.timezone,v_org.locale,v_org.currency),'href','/v2/admin/club/'),
    jsonb_build_object('code','subscription','label','Plan SaaS','status',case when v_plan_status in ('active','trialing') then 'ready' else 'blocker' end,'detail',coalesce(v_plan_status,'Sin suscripción'),'href','/v2/modulos/'),
    jsonb_build_object('code','branding','label','Marca e iconos','status',case when coalesce(v_org.branding->'colors'->>'primary','')<>'' and v_brand_assets>0 then 'ready' when coalesce(v_org.branding->'colors'->>'primary','')<>'' then 'warning' else 'blocker' end,'detail',case when v_brand_assets>0 then v_brand_assets||' assets cargados' else 'Colores listos; faltan artes/logos' end,'href','/v2/admin/branding/'),
    jsonb_build_object('code','users','label','Equipo y accesos','status',case when v_members>=2 then 'ready' when v_members=1 then 'warning' else 'blocker' end,'detail',v_members||' usuario(s) · '||v_roles||' rol(es)','href','/v2/usuarios/'),
    jsonb_build_object('code','modules','label','Módulos habilitados','status',case when v_modules>=3 then 'ready' else 'warning' end,'detail',v_modules||' módulo(s) activos','href','/v2/modulos/'),
    jsonb_build_object('code','players','label','Plantilla','status',case when v_players>0 and v_player_review=0 then 'ready' when v_players>0 then 'warning' else 'warning' end,'detail',v_players||' activos · '||v_player_review||' por revisar','href','/v2/jugadores/'),
    jsonb_build_object('code','billing','label','Cobranza','status',case when v_players=0 then 'warning' when v_billing>=v_players and v_billing_review=0 then 'ready' else 'warning' end,'detail',v_billing||' perfiles · '||v_billing_review||' por revisar','href','/v2/finanzas/'),
    jsonb_build_object('code','cutover','label','Corte de sistema anterior','status',case when coalesce(v_org.settings->>'legacyCutoverStatus','')='complete' then 'ready' else 'warning' end,'detail',case when coalesce(v_org.settings->>'legacyCutoverStatus','')='complete' then 'V1 cerrado para escritura' else 'Validar delta final antes de retirar V1' end,'href','/v2/admin/onboarding/')
  );
  select count(*),count(*) filter(where x->>'status'='ready') into v_total,v_ready from jsonb_array_elements(v_checks) x;
  return jsonb_build_object('checks',v_checks,'ready',v_ready,'total',v_total,'percent',case when v_total=0 then 0 else round(v_ready*100.0/v_total) end,'summary',jsonb_build_object('members',v_members,'players',v_players,'billingReview',v_billing_review,'modules',v_modules));
end;
$$;;
