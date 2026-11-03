-- h61 · Visoría: eliminar un registro de prueba o hecho por error (03/11/2026).
--
-- Presidencia: "quiero poder eliminar a alguien o darlo de baja, alguien que
-- vaya a la visoría". Dar de baja (h60) libera el lugar y conserva el lead.
-- Eliminar es para lo que nunca debió existir (pruebas, duplicados): borra el
-- prospecto y sus ligas para firmar.
--
-- Candados:
--   - Sólo quien administra (admin con escritura).
--   - Motivo obligatorio; queda en la bitácora de la visoría y en domain_events
--     (sin datos de salud).
--   - No se elimina si hay consentimiento firmado, ficha de salud, incidente,
--     evaluación o si ya es jugador: eso es evidencia y se da de baja.
-- No toca a nadie más.

create or replace function public.v2_visoria_delete(organization_id uuid, prospect_id uuid, reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_org uuid := v2_visoria_delete.organization_id; p app.prospects%rowtype; c app.visoria_campaigns%rowtype; v_por text;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Sólo quien administra puede eliminar'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Escribe por qué se elimina'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_delete.prospect_id and pp.organization_id = v_org for update;
  if p.id is null then raise exception 'No se encontró el registro'; end if;
  select * into c from app.visoria_campaigns cc where cc.organization_id = v_org
     and p.source_campaign in (cc.slug, cc.slug || '-espera', cc.slug || '-baja');
  if c.id is null then raise exception 'No es un registro de la visoría'; end if;

  v_por := case
    when exists (select 1 from app.visoria_consents k where k.prospect_id = p.id) then 'tiene consentimiento firmado'
    when exists (select 1 from app.visoria_health h where h.prospect_id = p.id) then 'tiene ficha de salud'
    when exists (select 1 from app.visoria_incidents i where i.prospect_id = p.id) then 'tiene un incidente registrado'
    when exists (select 1 from app.scouting_reports r where r.prospect_id = p.id) then 'ya tiene evaluaciones'
    when p.converted_player_id is not null or exists (select 1 from app.players pl where pl.source_prospect_id = p.id) then 'ya es jugador'
  end;
  if v_por is not null then raise exception 'No se puede eliminar: %. Dalo de baja.', v_por; end if;

  perform private.visoria_audita(v_org, c.id, null, null, 'staff', 'registro_eliminado', 'ok', left(btrim(reason), 300),
    jsonb_build_object('folio', p.folio, 'nombre', p.first_name || ' ' || p.last_name));
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'VisoriaRegistrationDeleted', 'prospect', p.id,
          jsonb_build_object('folio', p.folio, 'campaign', c.slug, 'reason', left(btrim(reason), 300), 'photoPath', p.photo_path), (select auth.uid()));
  delete from app.visoria_sign_links l where l.prospect_id = p.id;
  delete from app.prospects pp where pp.id = p.id;
  return jsonb_build_object('deleted', true, 'folio', p.folio, 'photoPath', p.photo_path, 'photoThumbPath', p.photo_thumb_path);
end
$$;

revoke all on function public.v2_visoria_delete(uuid, uuid, text) from public, anon;
grant execute on function public.v2_visoria_delete(uuid, uuid, text) to authenticated;
