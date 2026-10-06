-- Terminar un patrocinio de jugador
--
-- MEDIDO (06/10/2026, revisión de becas): los apoyos que paga un
-- patrocinador (sponsor_funded) no se podían terminar. v2_end_player_benefit
-- los rechaza ("se cierran en Contabilidad") y en Contabilidad no había cómo:
-- v2_configure_sponsor_funding siempre los deja activos. Caso real: Luis André
-- Murillo, dado de baja, con su patrocinio de Curtibrother activo; y el de
-- Dario Montalvo vence el 31 de octubre.
--
-- QUÉ HACE: v2_end_sponsor_funding(organization_id, player_id, benefit_id,
-- reason). Lo puede hacer quien configura dinero (Presidencia o
-- Contabilidad, la misma regla que configurar el patrocinio). Motivo
-- obligatorio. Lo deja inactivo con fecha de fin de hoy (o la que ya tenía si
-- era antes), conserva el histórico, anota el motivo y deja rastro en la
-- bitácora y en los eventos. Desde ese momento la familia paga la mensualidad
-- completa: el cobro ya no descuenta lo del patrocinador.
--
-- REVERSIBLE: drop de la función; un patrocinio terminado se reactiva
-- configurándolo de nuevo (v2_configure_sponsor_funding lo deja activo).

create or replace function private.command_end_sponsor_funding(p_organization_id uuid, p_player_id uuid, p_benefit_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_antes app.player_benefits%rowtype; v_motivo text := nullif(trim(p_reason),''); v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  if not private.has_financial_config_access(p_organization_id) then raise exception 'Sólo Presidencia o Contabilidad pueden terminar un patrocinio'; end if;
  if v_motivo is null or length(v_motivo)<3 then raise exception 'Escribe por qué termina el patrocinio'; end if;
  select * into v_antes from app.player_benefits
   where id=p_benefit_id and organization_id=p_organization_id and player_id=p_player_id for update;
  if not found then raise exception 'Ese patrocinio no existe para este Tanner'; end if;
  if v_antes.benefit_type<>'sponsor_funded' then raise exception 'Esto no es un patrocinio: termínalo como beca o apoyo'; end if;
  if not v_antes.active then return private.query_player_benefits(p_organization_id, p_player_id); end if;

  update app.player_benefits
     set active=false,
         ends_on=case when ends_on is not null and ends_on<v_hoy then ends_on else v_hoy end,
         notes=coalesce(notes||' · ','')||'Patrocinio terminado: '||v_motivo,
         updated_at=now()
   where id=p_benefit_id;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
         'sponsorFundingEnded','players',p_player_id::text,
         jsonb_build_object('benefitId',p_benefit_id,'patrocinador',v_antes.funding_source_name,'motivo',v_motivo),now());
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'SponsorFundingEnded','player_benefit',p_benefit_id,
         jsonb_build_object('playerId',p_player_id,'sponsorId',v_antes.sponsor_id,'fundingSource',v_antes.funding_source_name,'reason',v_motivo),auth.uid());

  return private.query_player_benefits(p_organization_id, p_player_id);
end $$;

create or replace function public.v2_end_sponsor_funding(organization_id uuid, player_id uuid, benefit_id uuid, reason text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_end_sponsor_funding(organization_id, player_id, benefit_id, reason) $$;
revoke all on function public.v2_end_sponsor_funding(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.v2_end_sponsor_funding(uuid,uuid,uuid,text) to authenticated;
