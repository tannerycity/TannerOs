-- h99 · Visoría: lo que se guarda y cuánto (22/11/2026).
-- Presidencia: "dale con 30 días salud y 12 meses".
--
-- El aviso de privacidad firmado dice: "los datos de participantes que no se
-- incorporen al club se conservan hasta 12 meses después de la visoría; los
-- consentimientos firmados y su evidencia, por el tiempo necesario para
-- atender posibles reclamaciones...; y los datos de quienes se incorporen al
-- club pasan a su expediente". Esto lo cumple solo, todos los días:
--
--   1. Salud: 30 días después de la visoría se borran las respuestas (lesión,
--      alergias, restricción, medicamento) y la nota de la revisión médica.
--      Queda sólo que se entregó y cómo quedó la revisión (apto / no apto),
--      sin el detalle. Sólo servían por si pasaba algo ese día.
--   2. 12 meses después de la visoría, a quien NO entró al club se le quitan
--      los datos que lo identifican (nombre, teléfono, tutor, correo, escuela,
--      foto, notas) en Prospectos y en sus evaluaciones. Queda el folio, el
--      año de nacimiento, la categoría y la posición, para contar sin saber
--      quién es.
--   No se tocan:
--     · Quien ya es Tanner (convertido o con el mismo nombre y fecha de
--       nacimiento que un jugador del club): su información vive en su ficha.
--     · Quien pidió "avísame de la próxima" (campaña "<slug>-proxima"): dio su
--       permiso aparte, para eso.
--     · El consentimiento firmado y su evidencia (texto, firma, PDF): el aviso
--       dice que se guardan por si hay una reclamación. Es inmutable.
--   Cada borrado queda en la bitácora de la visoría, con cuántos fueron.
--
-- Se corre diario a las 09:41 UTC con pg_cron. Correrlo de más no hace daño:
-- lo ya borrado no se vuelve a tocar.
begin;

create or replace function private.visoria_conserva(p_hoy date default current_date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record; v_salud int; v_anon int; v_eval int; r jsonb := '[]'::jsonb;
begin
  for c in select * from app.visoria_campaigns where starts_on is not null and starts_on + 30 <= p_hoy loop
    -- 1. Salud a los 30 días.
    update app.visoria_health h
       set answers = '{}'::jsonb, review_note = null
     where h.campaign_id = c.id and (h.answers <> '{}'::jsonb or h.review_note is not null);
    get diagnostics v_salud = row_count;
    v_anon := 0; v_eval := 0;

    -- 2. Identidad a los 12 meses, sólo de quien no entró al club.
    if (c.starts_on + interval '12 months')::date <= p_hoy then
      with fuera as (
        select p.id from app.prospects p
         where p.organization_id = c.organization_id
           and p.source_campaign in (c.slug, c.slug || '-espera', c.slug || '-baja')
           and coalesce((p.metadata->>'anonimizadoAt') is null, true)
           and p.converted_player_id is null and p.status <> 'converted'
           and not exists (select 1 from app.players pl
                            where pl.organization_id = p.organization_id and pl.archived_at is null
                              and pl.birth_date = p.birth_date
                              and private.normaliza_nombre(pl.first_name) = private.normaliza_nombre(p.first_name)
                              and private.normaliza_nombre(pl.last_name) = private.normaliza_nombre(p.last_name))),
      ev as (
        update app.scouting_reports s
           set observed_name = null, contact_phone = null, guardian_name = null, birth_date = null,
               residence = null, notes = null, updated_at = now()
         where s.prospect_id in (select id from fuera)
         returning 1),
      pr as (
        update app.prospects p
           set first_name = 'Anónimo', last_name = coalesce(p.folio, ''), phone = null, email = null, guardian_name = null,
               school_name = null, referral_name = null, public_message = null, notes = null, legacy_phone_raw = null,
               photo_path = null, photo_thumb_path = null,
               birth_date = case when p.birth_date is null then null else make_date(extract(year from p.birth_date)::int, 1, 1) end,
               metadata = jsonb_build_object('visoria', jsonb_build_object('campaign', p.metadata->'visoria'->'campaign',
                            'posicion', p.metadata->'visoria'->'posicion'), 'anonimizadoAt', now()),
               updated_at = now()
         where p.id in (select id from fuera)
         returning 1)
      select (select count(*) from pr), (select count(*) from ev) into v_anon, v_eval;
    end if;

    if v_salud > 0 or v_anon > 0 then
      perform private.visoria_audita(c.organization_id, c.id, null, null, 'sistema', 'conservacion', 'ok', null,
        jsonb_build_object('saludBorrada', v_salud, 'anonimizados', v_anon, 'evaluaciones', v_eval));
    end if;
    r := r || jsonb_build_object('slug', c.slug, 'saludBorrada', v_salud, 'anonimizados', v_anon, 'evaluaciones', v_eval);
  end loop;
  return r;
end $$;
revoke all on function private.visoria_conserva(date) from public, anon, authenticated;

select cron.schedule('tanneros-visoria-conservacion', '41 9 * * *', 'select private.visoria_conserva();');

commit;
