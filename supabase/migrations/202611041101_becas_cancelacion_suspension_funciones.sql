-- BECAS: funciones de advertencia y suspensión/cancelación de un beneficio
-- ya activo (sección 8 del protocolo maestro).
--   - scholarship_warning_add: Presidencia o Dirección (escritura) registra
--     una advertencia contra el beneficio activo.
--   - scholarship_benefit_suspend: solo Presidencia, da de baja el beneficio
--     (active=false) con causa y motivo — el padrón de becados deja de
--     mostrarlo de inmediato porque ya no cumple b.active.
--   - scholarship_benefit_warnings: la bitácora completa de advertencias de
--     un beneficio, para el expediente del becado.

create or replace function private.scholarship_warning_add(p_organization_id uuid, p_benefit_id uuid, p_cause text, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare b app.player_benefits; v_count integer;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_cause not in ('falsedad_informacion','ausentismo','indisciplina_grave','incumplimiento_reiterado','baja_club','otro') then
    raise exception 'Causa inválida';
  end if;
  select * into b from app.player_benefits where id=p_benefit_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Beneficio no encontrado'; end if;
  if not b.active then raise exception 'Este beneficio ya no está activo.'; end if;

  insert into app.scholarship_warnings(organization_id,benefit_id,player_id,cause,note,created_by_user_id)
  values (p_organization_id,p_benefit_id,b.player_id,p_cause,nullif(btrim(coalesce(p_note,'')),''),auth.uid());

  select count(*) into v_count from app.scholarship_warnings where benefit_id=p_benefit_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipWarningAdded','player_benefit',p_benefit_id,
    jsonb_build_object('cause',p_cause,'note',p_note,'count',v_count), auth.uid());

  return jsonb_build_object('ok',true,'count',v_count);
end $$;

create or replace function public.v2_scholarship_warning_add(organization_id uuid, benefit_id uuid, cause text, note text default null)
returns jsonb language sql set search_path to 'pg_catalog','private' as
$$ select private.scholarship_warning_add(organization_id, benefit_id, cause, note) $$;
revoke all on function public.v2_scholarship_warning_add(uuid, uuid, text, text) from public, anon;
grant execute on function public.v2_scholarship_warning_add(uuid, uuid, text, text) to authenticated;

create or replace function private.scholarship_benefit_suspend(p_organization_id uuid, p_benefit_id uuid, p_cause text, p_reason text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare b app.player_benefits;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_cause not in ('falsedad_informacion','ausentismo','indisciplina_grave','incumplimiento_reiterado','baja_club','otro') then
    raise exception 'Causa inválida';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 10 then raise exception 'Explica brevemente el motivo (mínimo 10 caracteres).'; end if;
  select * into b from app.player_benefits where id=p_benefit_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Beneficio no encontrado'; end if;
  if not b.active then raise exception 'Este beneficio ya no está activo.'; end if;

  update app.player_benefits set active=false, ended_at=now(), ended_cause=p_cause, ended_reason=p_reason, ended_by_user_id=auth.uid(), updated_at=now()
  where id=p_benefit_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'ScholarshipBenefitSuspended','player_benefit',p_benefit_id,
    jsonb_build_object('cause',p_cause,'reason',p_reason), auth.uid());

  -- Si el beneficio venía de una solicitud de Becas Tannery City, se anota
  -- también en su bitácora para que el expediente no quede en "aprobada" sin más.
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  select p_organization_id,'ScholarshipBenefitSuspended','scholarship_application',sa.id,
    jsonb_build_object('cause',p_cause,'reason',p_reason), auth.uid()
  from app.scholarship_applications sa where sa.resulting_benefit_id=p_benefit_id;

  return jsonb_build_object('ok',true);
end $$;

create or replace function public.v2_scholarship_benefit_suspend(organization_id uuid, benefit_id uuid, cause text, reason text)
returns jsonb language sql set search_path to 'pg_catalog','private' as
$$ select private.scholarship_benefit_suspend(organization_id, benefit_id, cause, reason) $$;
revoke all on function public.v2_scholarship_benefit_suspend(uuid, uuid, text, text) from public, anon;
grant execute on function public.v2_scholarship_benefit_suspend(uuid, uuid, text, text) to authenticated;

create or replace function private.scholarship_benefit_warnings(p_organization_id uuid, p_benefit_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','public','private'
as $$
declare v_data jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'cause',w.cause,'note',w.note,'createdAt',w.created_at) order by w.created_at desc), '[]'::jsonb)
  into v_data
  from app.scholarship_warnings w
  where w.organization_id=p_organization_id and w.benefit_id=p_benefit_id;
  return v_data;
end $$;

create or replace function public.v2_scholarship_benefit_warnings(organization_id uuid, benefit_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private' as
$$ select private.scholarship_benefit_warnings(organization_id, benefit_id) $$;
revoke all on function public.v2_scholarship_benefit_warnings(uuid, uuid) from public, anon;
grant execute on function public.v2_scholarship_benefit_warnings(uuid, uuid) to authenticated;
