-- h98 · Terminar la visoría sin perder a nadie (21/11/2026).
-- Presidencia: "ya hicimos nuestra visoría... quiero cerrarla, pero que
-- todavía siga teniendo los datos... de todos los niños que se registraron...
-- para decir, ah, ahora le quiero escribir a esta persona".
--
--   1. v2_visoria_close: Presidencia (admin) termina o reabre la visoría. No
--      borra nada: inscritos, firmas, evaluaciones y lista de espera se quedan.
--   2. v2_visoria_campaigns: las visorías, la más nueva primero, para ver las
--      pasadas (sólo lectura en la pantalla).
--   3. v2_public_visoria_next: con la visoría terminada, la liga pública deja
--      el WhatsApp para la próxima. Queda en Prospectos > Visorías con la
--      campaña "<slug>-proxima". Mismo límite de intentos que apartar lugar.
--   4. v2_visoria_followup: para Prospectos > Visorías: qué dijo el visor, si
--      llegó y si ya es Tanner (mismo nombre y fecha de nacimiento que un
--      jugador del club), para no escribirle como si fuera nuevo.
begin;

-- 1. Terminar / reabrir.
create or replace function public.v2_visoria_close(organization_id uuid, campaign_id uuid, open boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_close.organization_id; c app.visoria_campaigns%rowtype;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Not authorized'; end if;
  select * into c from app.visoria_campaigns cc where cc.id = v2_visoria_close.campaign_id and cc.organization_id = v_org for update;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if c.is_open is distinct from v2_visoria_close.open then
    update app.visoria_campaigns set is_open = v2_visoria_close.open, updated_at = now() where id = c.id;
    perform private.visoria_audita(v_org, c.id, null, null, 'staff', case when v2_visoria_close.open then 'visoria_reabierta' else 'visoria_terminada' end, 'ok', null, '{}'::jsonb);
  end if;
  return jsonb_build_object('open', v2_visoria_close.open,
    'registered', (select count(*) from app.prospects p where p.organization_id = v_org and p.source_campaign = c.slug and p.archived_at is null));
end $$;
revoke all on function public.v2_visoria_close(uuid, uuid, boolean) from public, anon;
grant execute on function public.v2_visoria_close(uuid, uuid, boolean) to authenticated;

-- 2. Las visorías, para escoger una pasada.
create or replace function public.v2_visoria_campaigns(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_campaigns.organization_id;
begin
  if not (private.has_module_access(v_org, 'prospects', false) or private.has_module_access(v_org, 'scouting', false)) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'datesLabel', c.dates_label,
      'startsOn', c.starts_on, 'open', c.is_open,
      'registered', (select count(*) from app.prospects p where p.organization_id = v_org and p.source_campaign = c.slug and p.archived_at is null))
      order by c.starts_on desc nulls last, c.created_at desc)
    from app.visoria_campaigns c where c.organization_id = v_org), '[]'::jsonb);
end $$;
revoke all on function public.v2_visoria_campaigns(uuid) from public, anon;
grant execute on function public.v2_visoria_campaigns(uuid) to authenticated;

-- 3. "Avísame de la próxima" (sólo con la visoría terminada).
create or replace function public.v2_public_visoria_next(club_key text, slug text, nino jsonb, tutor jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); v_c app.visoria_campaigns%rowtype; v_birth date; v_r jsonb;
        v_existe uuid; v_dest text;
begin
  perform private.enforce_public_rate_limit('visoria_aparta', 20, interval '1 hour');
  if v_org is null then raise exception 'Campaign not found'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = v2_public_visoria_next.slug;
  if v_c.id is null then raise exception 'Campaign not found'; end if;
  if v_c.is_open then raise exception 'Campaign still open'; end if;
  begin v_birth := (nino->>'birthDate')::date; exception when others then raise exception 'Birth date required'; end;
  if v_birth is null then raise exception 'Birth date required'; end if;
  if private.normalize_public_phone(tutor->>'phone') is null then raise exception 'Phone required'; end if;
  v_dest := v_c.slug || '-proxima';
  -- Ya lo había dejado: no se duplica.
  select p.id into v_existe from app.prospects p
   where p.organization_id = v_org and p.source_campaign = v_dest and p.archived_at is null and p.birth_date = v_birth
     and private.normaliza_nombre(p.first_name) = private.normaliza_nombre(nino->>'firstName')
     and private.normaliza_nombre(p.last_name) = private.normaliza_nombre(nino->>'lastName')
   limit 1;
  if v_existe is not null then return jsonb_build_object('ok', true, 'existing', true); end if;
  if length(btrim(coalesce(nino->>'firstName', ''))) < 2 or length(btrim(coalesce(nino->>'lastName', ''))) < 2 then raise exception 'First name required'; end if;
  if length(btrim(coalesce(tutor->>'name', ''))) < 2 then raise exception 'Guardian required'; end if;
  if v_birth > current_date then raise exception 'Invalid birth date'; end if;
  insert into app.prospects(organization_id, first_name, last_name, birth_date, phone, guardian_name, source, source_campaign,
    source_channel, interest_type, registration_type, purpose, status, photo_required, privacy_notice_version,
    data_consent, data_consent_at, image_consent, folio, metadata, created_at, updated_at)
  values (v_org, left(btrim(nino->>'firstName'), 80), left(btrim(nino->>'lastName'), 80), v_birth,
    private.normalize_public_phone(tutor->>'phone'), left(btrim(tutor->>'name'), 120), 'public_form', v_dest,
    'Visoría terminada', 'player', 'player', 'Visoría', 'new', false, 'visoria-proxima', true, now(), false,
    private.next_prospect_folio(v_org),
    jsonb_build_object('visoria', jsonb_build_object('campaign', v_c.slug, 'proxima', true, 'pidioAt', now())), now(), now())
  returning jsonb_build_object('id', id) into v_r;
  perform private.visoria_audita(v_org, v_c.id, (v_r->>'id')::uuid, null, 'familia', 'avisame_proxima', 'ok', null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'existing', false);
end $$;
revoke all on function public.v2_public_visoria_next(text, text, jsonb, jsonb) from public;
grant execute on function public.v2_public_visoria_next(text, text, jsonb, jsonb) to anon, authenticated;

-- 4. Seguimiento en Prospectos > Visorías.
create or replace function public.v2_visoria_followup(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_followup.organization_id;
begin
  if not private.has_module_access(v_org, 'prospects', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_object_agg(p.id::text, jsonb_build_object(
      'verdict', (select r.verdict from app.scouting_reports r where r.prospect_id = p.id order by r.created_at desc limit 1),
      'arrived', (p.metadata->'visoria'->>'llegoAt') is not null,
      'next', coalesce((p.metadata->'visoria'->>'proxima')::boolean, false),
      'tanner', (select jsonb_build_object('id', pl.id, 'category', pl.category) from app.players pl
                  where pl.organization_id = v_org and pl.archived_at is null and pl.birth_date = p.birth_date
                    and private.normaliza_nombre(pl.first_name) = private.normaliza_nombre(p.first_name)
                    and private.normaliza_nombre(pl.last_name) = private.normaliza_nombre(p.last_name)
                  limit 1)))
    from app.prospects p
   where p.organization_id = v_org and p.archived_at is null and p.purpose ~* 'visor'), '{}'::jsonb);
end $$;
revoke all on function public.v2_visoria_followup(uuid) from public, anon;
grant execute on function public.v2_visoria_followup(uuid) to authenticated;

commit;
