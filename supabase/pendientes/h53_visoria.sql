-- h53 · Visoría con campaña, firma y visores (29/10/2026).
--
-- Presidencia: "voy a hacer una visoría, quiero que todos se me registren en
-- TannerOS... que pueda iniciar mi campaña para saber cuántos se inscribieron,
-- que los visores puedan ver sus datos, muy fácil con sus fotos, que firmen
-- consentimientos". Viernes 13 y sábado 14 de noviembre, sin costo, máximo 30.
--
-- 1. app.visoria_campaigns: la campaña (fechas, lugar, cupo, abierta). La de
--    noviembre nace con cupo 30.
-- 2. v2_public_visoria: lo que ve la familia antes de inscribir (fechas, lugar,
--    lugares que quedan, el texto de los consentimientos). Sin datos de nadie.
-- 3. v2_public_visoria_register: registra al niño como prospecto de la campaña
--    (el mismo registro de siempre, con su folio y su foto), respeta el cupo y
--    no lo inscribe dos veces. Guarda salud, contacto de emergencia y la firma
--    del tutor (trazo, nombre, fecha y versión del documento).
-- 4. v2_visoria_board: el tablero. Quien tiene Fichajes ve todo; quien sólo
--    tiene Scouting (visores) ve foto, edad, categoría, posición y pierna, sin
--    teléfonos ni salud.
-- 5. v2_visoria_arrival: "Llegó" el día de la visoría.
-- 6. Los visores pueden ver la foto de los inscritos a una visoría.

create table if not exists app.visoria_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slug text not null,
  title text not null,
  dates_label text,
  location text,
  starts_on date,
  capacity int check (capacity is null or capacity > 0),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table app.visoria_campaigns enable row level security;
revoke all on table app.visoria_campaigns from public, anon, authenticated;

insert into app.visoria_campaigns(organization_id, slug, title, dates_label, location, starts_on, capacity)
values ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8', 'visoria-noviembre-2026', 'Visoría Tannery City',
        'Viernes 13 y sábado 14 de noviembre', null, '2026-11-13', 30)
on conflict (organization_id, slug) do nothing;

create or replace function private.visoria_inscritos(p_organization_id uuid, p_slug text)
returns int language sql stable security definer set search_path to '' as $$
  select count(*)::int from app.prospects
   where organization_id = p_organization_id and source_campaign = p_slug and archived_at is null
$$;
revoke all on function private.visoria_inscritos(uuid, text) from public, anon, authenticated;

-- Lo que ve la familia antes de inscribir.
create or replace function public.v2_public_visoria(club_key text, slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); v_c app.visoria_campaigns%rowtype; v_n int;
begin
  if v_org is null then raise exception 'Campaign not found'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = v2_public_visoria.slug;
  if v_c.id is null then raise exception 'Campaign not found'; end if;
  v_n := private.visoria_inscritos(v_org, v_c.slug);
  return jsonb_build_object(
    'slug', v_c.slug, 'title', v_c.title, 'datesLabel', v_c.dates_label, 'location', v_c.location, 'startsOn', v_c.starts_on,
    'capacity', v_c.capacity, 'spotsLeft', case when v_c.capacity is null then null else greatest(0, v_c.capacity - v_n) end,
    'open', v_c.is_open and (v_c.capacity is null or v_n < v_c.capacity),
    'closed', not v_c.is_open,
    'documents', coalesce((select jsonb_object_agg(d.code, jsonb_build_object('title', d.title, 'body', d.body, 'version', d.version))
                             from app.consent_documents d
                            where d.organization_id = v_org and d.active and d.code in ('visoria', 'uso_de_imagen')), '{}'::jsonb));
end $$;
revoke all on function public.v2_public_visoria(text, text) from public;
grant execute on function public.v2_public_visoria(text, text) to anon, authenticated;

-- Inscribir. nino: firstName,lastName,birthDate,sex,category,type(player|goalkeeper),position,foot,school.
-- tutor: name,phone,email,channel,referral. salud: alergias,lesiones,medicamentos,seguro.
-- emergencia: nombre,telefono. firma: nombre,imagen(data:image/png),acepta.
create or replace function public.v2_public_visoria_register(club_key text, slug text, nino jsonb, tutor jsonb, salud jsonb,
  emergencia jsonb, firma jsonb, privacy_notice_version text, image_consent boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); v_c app.visoria_campaigns%rowtype; v_r jsonb; v_id uuid;
        v_existe uuid; v_folio text; v_doc app.consent_documents%rowtype; v_birth date;
begin
  if v_org is null then raise exception 'Campaign not found'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = v2_public_visoria_register.slug for update;
  if v_c.id is null then raise exception 'Campaign not found'; end if;
  begin v_birth := (nino->>'birthDate')::date; exception when others then raise exception 'Birth date required'; end;

  -- Ya inscrito: mismo niño en la misma campaña. Se le regresa su folio.
  select p.id, p.folio into v_existe, v_folio from app.prospects p
   where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null and p.birth_date = v_birth
     and private.normaliza_nombre(p.first_name) = private.normaliza_nombre(nino->>'firstName')
     and private.normaliza_nombre(p.last_name) = private.normaliza_nombre(nino->>'lastName')
   limit 1;
  if v_existe is not null then return jsonb_build_object('id', v_existe, 'folio', v_folio, 'existing', true); end if;

  if not v_c.is_open then raise exception 'Campaign closed'; end if;
  if v_c.capacity is not null and private.visoria_inscritos(v_org, v_c.slug) >= v_c.capacity then raise exception 'Campaign full'; end if;

  if coalesce((firma->>'acepta')::boolean, false) is not true then raise exception 'Signature required'; end if;
  if length(btrim(coalesce(firma->>'nombre', ''))) < 5 then raise exception 'Signer name required'; end if;
  if coalesce(firma->>'imagen', '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(firma->>'imagen') > 120000 then raise exception 'Signature required'; end if;
  if length(btrim(coalesce(emergencia->>'nombre', ''))) < 3 or private.normalize_public_phone(emergencia->>'telefono') is null then raise exception 'Emergency contact required'; end if;
  select * into v_doc from app.consent_documents d where d.organization_id = v_org and d.code = 'visoria' and d.active;

  v_r := private.public_register_prospect_enhanced(club_key, nino->>'firstName', nino->>'lastName', v_birth,
    tutor->>'phone', tutor->>'email', tutor->>'name', nino->>'category', v_c.slug, tutor->>'channel',
    case when nino->>'type' = 'goalkeeper' then 'goalkeeper' else 'player' end, 'Visoría', nino->>'foot', nino->>'school',
    tutor->>'referral', null, privacy_notice_version, true, coalesce(v2_public_visoria_register.image_consent, false), nino->>'sex');
  v_id := (v_r->>'id')::uuid;

  update app.prospects
     set trial_date = coalesce(trial_date, v_c.starts_on),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visoria', jsonb_build_object(
           'campaign', v_c.slug,
           'posicion', left(btrim(coalesce(nino->>'position', '')), 40),
           'salud', jsonb_build_object('alergias', left(btrim(coalesce(salud->>'alergias', '')), 300), 'lesiones', left(btrim(coalesce(salud->>'lesiones', '')), 300),
                                        'medicamentos', left(btrim(coalesce(salud->>'medicamentos', '')), 300), 'seguro', left(btrim(coalesce(salud->>'seguro', '')), 80)),
           'emergencia', jsonb_build_object('nombre', left(btrim(emergencia->>'nombre'), 120), 'telefono', private.normalize_public_phone(emergencia->>'telefono')),
           'firma', jsonb_build_object('nombre', left(btrim(firma->>'nombre'), 120), 'imagen', firma->>'imagen', 'at', now(),
                                       'documento', 'visoria', 'version', v_doc.version, 'imagenConsentida', coalesce(v2_public_visoria_register.image_consent, false)))),
         updated_at = now()
   where id = v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'VisoriaRegistered', 'prospect', v_id, jsonb_build_object('campaign', v_c.slug, 'folio', v_r->>'folio', 'consentVersion', v_doc.version));
  return v_r || jsonb_build_object('existing', false);
end $$;
revoke all on function public.v2_public_visoria_register(text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, boolean) from public;
grant execute on function public.v2_public_visoria_register(text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, boolean) to anon, authenticated;

-- El tablero. Fichajes ve todo; Scouting (visores) sin contacto ni salud.
create or replace function public.v2_visoria_board(organization_id uuid, slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_board.organization_id; v_todo boolean; v_c app.visoria_campaigns%rowtype;
begin
  v_todo := private.has_module_access(v_org, 'prospects', false);
  if not (v_todo or private.has_module_access(v_org, 'scouting', false)) then raise exception 'Not authorized'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = coalesce(v2_visoria_board.slug, c.slug)
   order by c.starts_on desc nulls last limit 1;
  if v_c.id is null then return jsonb_build_object('campaign', null, 'items', '[]'::jsonb, 'canSeeContact', v_todo); end if;
  return jsonb_build_object(
    'campaign', jsonb_build_object('slug', v_c.slug, 'title', v_c.title, 'datesLabel', v_c.dates_label, 'location', v_c.location,
                                   'startsOn', v_c.starts_on, 'capacity', v_c.capacity, 'open', v_c.is_open),
    'canSeeContact', v_todo,
    'canWrite', private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true),
    'items', coalesce((select jsonb_agg(x.j order by x.creado) from (
      select p.created_at as creado, jsonb_build_object(
        'id', p.id, 'folio', p.folio, 'firstName', p.first_name, 'lastName', p.last_name, 'birthDate', p.birth_date,
        'sex', p.sex, 'category', p.category_interest, 'type', p.registration_type, 'foot', p.dominant_foot, 'school', p.school_name,
        'position', p.metadata->'visoria'->>'posicion', 'photoPath', p.photo_path, 'photoThumbPath', p.photo_thumb_path,
        'imageConsent', p.image_consent, 'signed', coalesce((p.metadata->'visoria'->'firma') ? 'at', false),
        'arrivedAt', p.metadata->'visoria'->>'llegoAt', 'channel', p.source_channel, 'createdAt', p.created_at,
        'evaluations', (select count(*) from app.scouting_reports r where r.prospect_id = p.id),
        'verdict', (select r.verdict from app.scouting_reports r where r.prospect_id = p.id order by r.created_at desc limit 1))
        || case when v_todo then jsonb_build_object(
             'guardian', p.guardian_name, 'phone', p.phone, 'email', p.email,
             'salud', p.metadata->'visoria'->'salud', 'emergencia', p.metadata->'visoria'->'emergencia',
             'signedBy', p.metadata->'visoria'->'firma'->>'nombre', 'signedAt', p.metadata->'visoria'->'firma'->>'at')
           else '{}'::jsonb end as j
        from app.prospects p
       where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null) x), '[]'::jsonb));
end $$;
revoke all on function public.v2_visoria_board(uuid, text) from public, anon;
grant execute on function public.v2_visoria_board(uuid, text) to authenticated;

-- "Llegó" el día de la visoría (o quitarlo).
create or replace function public.v2_visoria_arrival(organization_id uuid, prospect_id uuid, value boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_arrival.organization_id; v_uid uuid := (select auth.uid()); v_p app.prospects%rowtype;
begin
  if not (private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)) then raise exception 'Not authorized'; end if;
  select * into v_p from app.prospects p where p.id = v2_visoria_arrival.prospect_id and p.organization_id = v_org for update;
  if v_p.id is null or v_p.metadata->'visoria' is null then raise exception 'Prospect not found'; end if;
  update app.prospects
     set metadata = jsonb_set(metadata, '{visoria}', (metadata->'visoria') - 'llegoAt' - 'llegoPor'
                     || case when value then jsonb_build_object('llegoAt', now(), 'llegoPor', v_uid) else '{}'::jsonb end),
         updated_at = now()
   where id = v_p.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, case when value then 'VisoriaArrived' else 'VisoriaArrivalUndone' end, 'prospect', v_p.id, jsonb_build_object('campaign', v_p.source_campaign), v_uid);
  return jsonb_build_object('arrivedAt', case when value then now() else null end);
end $$;
revoke all on function public.v2_visoria_arrival(uuid, uuid, boolean) from public, anon;
grant execute on function public.v2_visoria_arrival(uuid, uuid, boolean) to authenticated;

-- Los visores ven la foto de quien se inscribió a una visoría.
create or replace function private.is_visoria_prospect_object(p_organization_id uuid, p_name text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
begin
  return exists (select 1 from app.prospects p join app.visoria_campaigns c on c.organization_id = p.organization_id and c.slug = p.source_campaign
                  where p.organization_id = p_organization_id and p.id = split_part(p_name, '/', 4)::uuid and p.archived_at is null);
exception when others then return false;
end $$;
revoke all on function private.is_visoria_prospect_object(uuid, text) from public, anon;
grant execute on function private.is_visoria_prospect_object(uuid, text) to authenticated;

drop policy if exists tanneros_prospect_photos_read_as_scout on storage.objects;
create policy tanneros_prospect_photos_read_as_scout on storage.objects for select to authenticated
using (bucket_id = 'tanneros-prospect-photos' and private.storage_org_id(name) is not null
       and private.storage_module_code(name) = 'prospects'
       and private.has_module_access(private.storage_org_id(name), 'scouting', false)
       and private.is_visoria_prospect_object(private.storage_org_id(name), name));
