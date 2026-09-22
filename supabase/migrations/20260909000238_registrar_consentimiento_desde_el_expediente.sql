-- Los Tanners que vienen del legacy nunca pasaron por el formulario público, así
-- que su consentimiento sigue en papel y el sistema los muestra como pendientes
-- para siempre. Esto deja registrarlo desde el expediente, dejando rastro de quién
-- lo capturó y con qué evidencia: sin bitácora esto sería un checkbox sin valor legal.
create or replace function private.command_set_player_consent(
  p_organization_id uuid,
  p_player_id uuid,
  p_data_consent boolean default null,
  p_image_consent boolean default null,
  p_notice_version text default null,
  p_evidence text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_antes app.players%rowtype;
  v_data boolean; v_image boolean; v_version text; v_evidencia text;
begin
  if not private.has_module_access(p_organization_id,'players',true) then
    raise exception 'Not authorized';
  end if;

  select * into v_antes from app.players
  where id=p_player_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Ese Tanner no existe en el club'; end if;

  v_data  := coalesce(p_data_consent , coalesce(v_antes.data_consent ,false));
  v_image := coalesce(p_image_consent, coalesce(v_antes.image_consent,false));
  v_evidencia := nullif(trim(p_evidence),'');

  -- Registrar una autorización sin decir de dónde salió es lo que después nadie
  -- puede defender; el motivo es obligatorio al marcar, no al revocar.
  if v_evidencia is null
     and ((v_data and not coalesce(v_antes.data_consent,false))
       or (v_image and not coalesce(v_antes.image_consent,false))) then
    raise exception 'Escribe con qué evidencia se autoriza (carta firmada, WhatsApp del tutor, etc.)';
  end if;

  v_version := coalesce(nullif(trim(p_notice_version),''), v_antes.privacy_notice_version);

  update app.players set
    data_consent   = v_data,
    -- La fecha marca cuándo se autorizó: se conserva si ya venía y se limpia al revocar.
    data_consent_at  = case when v_data  then coalesce(v_antes.data_consent_at ,now()) else null end,
    image_consent  = v_image,
    image_consent_at = case when v_image then coalesce(v_antes.image_consent_at,now()) else null end,
    privacy_notice_version = case when v_data or v_image then v_version else v_antes.privacy_notice_version end
  where id=p_player_id and organization_id=p_organization_id;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
    'consentUpdated','players',p_player_id::text,
    jsonb_build_object(
      'antes', jsonb_build_object('data',coalesce(v_antes.data_consent,false),'image',coalesce(v_antes.image_consent,false)),
      'despues', jsonb_build_object('data',v_data,'image',v_image),
      'aviso', v_version,
      'evidencia', v_evidencia),
    now());

  return jsonb_build_object(
    'data_consent',v_data,'image_consent',v_image,
    'privacy_notice_version',(select privacy_notice_version from app.players where id=p_player_id));
end $function$;

revoke all on function private.command_set_player_consent(uuid,uuid,boolean,boolean,text,text) from public, anon, authenticated;

create or replace function public.v2_set_player_consent(
  organization_id uuid,
  player_id uuid,
  data_consent boolean default null,
  image_consent boolean default null,
  notice_version text default null,
  evidence text default null
) returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_set_player_consent(organization_id,player_id,data_consent,image_consent,notice_version,evidence)
$function$;

revoke all on function public.v2_set_player_consent(uuid,uuid,boolean,boolean,text,text) from public, anon;
grant execute on function public.v2_set_player_consent(uuid,uuid,boolean,boolean,text,text) to authenticated;;
