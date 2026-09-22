-- Registrar y documentar el apoyo de un Tanner. Tres candados a propósito:
--
-- 1. sponsor_funded no se crea ni se asigna desde aquí. Es el único tipo que el
--    motor de cobro mira, y mientras no tenga funding_configured_at BLOQUEA la
--    generación del cargo del Tanner. Ese alta pasa por Contabilidad.
-- 2. Un apoyo que ya mueve dinero (sponsor_funded configurado) no se edita aquí.
-- 3. El motivo es obligatorio: una beca sin razón escrita es justo lo que hoy no
--    se puede auditar.
create or replace function private.command_save_player_benefit(
  p_organization_id uuid,
  p_player_id uuid,
  p_benefit_id uuid default null,
  p_benefit_type text default null,
  p_fixed_amount numeric default null,
  p_percentage numeric default null,
  p_funding_source text default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_antes app.player_benefits%rowtype;
  v_tipo text; v_motivo text; v_id uuid; v_calc text;
  v_tipos constant text[] := array['scholarship_full','scholarship_partial','sibling_discount'];
begin
  if not private.has_module_access(p_organization_id,'players',true)
     or not (private.is_presidency(p_organization_id)
             or private.has_module_access(p_organization_id,'contabilidad',true)) then
    raise exception 'Not authorized';
  end if;

  if not exists(select 1 from app.players
                where id=p_player_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'Ese Tanner no existe en el club';
  end if;

  v_motivo := nullif(trim(p_notes),'');
  if v_motivo is null then
    raise exception 'Escribe por qué se le da el apoyo: sin motivo la beca no se puede auditar después';
  end if;

  if p_fixed_amount is not null and p_percentage is not null then
    raise exception 'Define el apoyo como monto o como porcentaje, no como los dos';
  end if;
  if p_percentage is not null and (p_percentage<=0 or p_percentage>100) then
    raise exception 'El porcentaje tiene que estar entre 1 y 100';
  end if;
  if p_fixed_amount is not null and p_fixed_amount<=0 then
    raise exception 'El monto del apoyo tiene que ser mayor a cero';
  end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on<p_starts_on then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio';
  end if;

  if p_benefit_id is not null then
    select * into v_antes from app.player_benefits
    where id=p_benefit_id and organization_id=p_organization_id and player_id=p_player_id;
    if not found then raise exception 'Ese apoyo no existe para este Tanner'; end if;
    if v_antes.benefit_type='sponsor_funded' then
      raise exception 'Los apoyos que paga un patrocinador se editan en Contabilidad: ahí es donde se autoriza el dinero';
    end if;
  end if;

  v_tipo := coalesce(nullif(trim(p_benefit_type),''), v_antes.benefit_type, 'scholarship_partial');
  if not (v_tipo = any(v_tipos)) then
    raise exception 'Desde el expediente solo se registran beca total, beca parcial y descuento por hermanos';
  end if;

  -- El cálculo se conserva tal cual venía: cambiar cómo se aplica un descuento
  -- mueve lo que se le cobra a la familia y esa decisión es de Contabilidad.
  v_calc := coalesce(v_antes.calculation_type, 'informational');

  if p_benefit_id is null then
    insert into app.player_benefits(organization_id,player_id,benefit_type,calculation_type,
      fixed_amount,percentage,funding_source_name,starts_on,ends_on,active,notes)
    values(p_organization_id,p_player_id,v_tipo,v_calc,
      p_fixed_amount,p_percentage,nullif(trim(p_funding_source),''),
      coalesce(p_starts_on,current_date),p_ends_on,true,v_motivo)
    returning id into v_id;
  else
    update app.player_benefits set
      benefit_type=v_tipo,
      fixed_amount=p_fixed_amount,
      percentage=p_percentage,
      funding_source_name=nullif(trim(p_funding_source),''),
      starts_on=coalesce(p_starts_on,starts_on),
      ends_on=p_ends_on,
      notes=v_motivo,
      updated_at=now()
    where id=p_benefit_id and organization_id=p_organization_id
    returning id into v_id;
  end if;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
    case when p_benefit_id is null then 'benefitCreated' else 'benefitUpdated' end,
    'players', p_player_id::text,
    jsonb_build_object('benefitId',v_id,'tipo',v_tipo,'calculo',v_calc,
      'monto',p_fixed_amount,'porcentaje',p_percentage,
      'fuente',nullif(trim(p_funding_source),''),
      'desde',coalesce(p_starts_on,current_date),'hasta',p_ends_on,'motivo',v_motivo,
      'antes',case when v_antes.id is null then null else jsonb_build_object(
        'tipo',v_antes.benefit_type,'monto',v_antes.fixed_amount,
        'porcentaje',v_antes.percentage,'motivo',v_antes.notes) end),
    now());

  return private.query_player_benefits(p_organization_id,p_player_id);
end $function$;
revoke all on function private.command_save_player_benefit(uuid,uuid,uuid,text,numeric,numeric,text,date,date,text) from public, anon, authenticated;

create or replace function public.v2_save_player_benefit(
  organization_id uuid, player_id uuid, benefit_id uuid default null,
  benefit_type text default null, fixed_amount numeric default null, percentage numeric default null,
  funding_source text default null, starts_on date default null, ends_on date default null,
  notes text default null
) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_save_player_benefit(organization_id,player_id,benefit_id,benefit_type,fixed_amount,percentage,funding_source,starts_on,ends_on,notes) $function$;
revoke all on function public.v2_save_player_benefit(uuid,uuid,uuid,text,numeric,numeric,text,date,date,text) from public, anon;
grant execute on function public.v2_save_player_benefit(uuid,uuid,uuid,text,numeric,numeric,text,date,date,text) to authenticated;


-- Terminar un apoyo nunca lo borra: se cierra con fecha y motivo para que el
-- histórico siga contando por qué en su momento sí lo tuvo.
create or replace function private.command_end_player_benefit(
  p_organization_id uuid, p_player_id uuid, p_benefit_id uuid, p_reason text
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_antes app.player_benefits%rowtype; v_motivo text;
begin
  if not private.has_module_access(p_organization_id,'players',true)
     or not (private.is_presidency(p_organization_id)
             or private.has_module_access(p_organization_id,'contabilidad',true)) then
    raise exception 'Not authorized';
  end if;
  v_motivo := nullif(trim(p_reason),'');
  if v_motivo is null then raise exception 'Escribe por qué termina el apoyo'; end if;

  select * into v_antes from app.player_benefits
  where id=p_benefit_id and organization_id=p_organization_id and player_id=p_player_id;
  if not found then raise exception 'Ese apoyo no existe para este Tanner'; end if;
  if v_antes.benefit_type='sponsor_funded' then
    raise exception 'Los apoyos que paga un patrocinador se cierran en Contabilidad: ahí es donde se autoriza el dinero';
  end if;

  update app.player_benefits
  set active=false, ends_on=coalesce(ends_on,current_date),
      notes=coalesce(notes,'')||' · Terminado: '||v_motivo, updated_at=now()
  where id=p_benefit_id and organization_id=p_organization_id;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
    'benefitEnded','players',p_player_id::text,
    jsonb_build_object('benefitId',p_benefit_id,'tipo',v_antes.benefit_type,'motivo',v_motivo),now());

  return private.query_player_benefits(p_organization_id,p_player_id);
end $function$;
revoke all on function private.command_end_player_benefit(uuid,uuid,uuid,text) from public, anon, authenticated;

create or replace function public.v2_end_player_benefit(
  organization_id uuid, player_id uuid, benefit_id uuid, reason text
) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_end_player_benefit(organization_id,player_id,benefit_id,reason) $function$;
revoke all on function public.v2_end_player_benefit(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.v2_end_player_benefit(uuid,uuid,uuid,text) to authenticated;;
