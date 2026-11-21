-- h97 · Visoría: "firma y juega" (21/11/2026).
-- Presidencia: "si ya todo el procedimiento lo van a hacer cuando se
-- inscriban, ¿por qué no le daríamos permiso de jugar?... firma y que todos
-- jueguen".
--
-- Antes, después de firmar, el niño quedaba "Le falta un paso" hasta que el
-- staff verificara la identidad de quien firmó y hasta que se guardara el
-- PDF. Ahora firmar con su liga personal basta para jugar.
--
-- Qué NO cambia, a propósito:
--   · El expediente dice la verdad: si nadie verificó la identidad, el estado
--     del consentimiento sigue siendo pending_verification y el PDF lo dice.
--     No se inventa una verificación que no ocurrió. El staff puede
--     confirmarla después si quiere; ya no es requisito para jugar.
--   · Siguen frenando: no ha firmado, cambió el evento, el profe dijo "hoy no
--     juega", salud (sólo si los papás declararon algo) y la firma de alguien
--     que no es papá, mamá ni tutor (revisión manual).
--   · Ningún texto legal ni la huella del evento: las firmas que ya existen
--     siguen valiendo. No se toca ningún registro: sólo cambia cómo se lee.
begin;

create or replace function private.visoria_acceso(p_campaign uuid, p_prospect uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare k app.visoria_consents%rowtype; h app.visoria_health%rowtype; p app.prospects%rowtype; v text; motivo text;
begin
  select * into p from app.prospects where id = p_prospect;
  k := private.visoria_vigente(p_campaign, p_prospect);
  if k.id is not null then select * into h from app.visoria_health where consent_id = k.id; end if;
  if k.id is null then v := 'SIN_CONSENTIMIENTO'; motivo := 'Falta firmar el consentimiento.';
  elsif k.event_hash <> private.visoria_event_hash(p_campaign) then v := 'SIN_CONSENTIMIENTO'; motivo := 'Cambió el evento: necesita firmar la versión vigente.';
  elsif coalesce((p.metadata->'visoria'->>'alertaOperativa')::boolean, false) then v := 'NO_APTO'; motivo := coalesce(p.metadata->'visoria'->>'alertaNota', 'Alerta operativa.');
  elsif h.review_status = 'no_apto' then v := 'NO_APTO'; motivo := 'Revisión médica: no apto para este evento.';
  elsif h.review_status = 'pendiente' then v := 'REVISION_MEDICA'; motivo := 'Revisión médica pendiente.';
  elsif k.status = 'requires_review' then v := 'PENDIENTE'; motivo := 'Revisar facultades de quien firmó.';
  -- h97: firmó con su liga personal = puede jugar, aunque el PDF siga
  -- guardándose y aunque nadie haya confirmado todavía quién firmó.
  elsif k.status in ('signed', 'pending_artifact', 'pending_verification') then v := 'AUTORIZADO'; motivo := null;
  else v := 'SIN_CONSENTIMIENTO'; motivo := 'Consentimiento no válido.'; end if;
  return jsonb_build_object('status', v, 'reason', motivo, 'consentId', k.id, 'consentStatus', k.status,
    'healthReview', h.review_status, 'outdated', k.id is not null and k.event_hash <> private.visoria_event_hash(p_campaign));
end $function$;
revoke all on function private.visoria_acceso(uuid, uuid) from public, anon, authenticated;

commit;
