-- Postulaciones de staff (Presidencia, 12/10/2026): "es importante que se
-- pida un checkbox: si lo contratamos, tenga una carta de no antecedentes
-- penales". Trabajan con niños. La postulación exige aceptarlo y lo guarda en
-- consent.backgroundCheck; la convocatoria de Tannery lo pone en lo que pide.
create or replace function private.public_apply_staff(p_public_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_id uuid; v_folio text; v_n int; v_cfg jsonb; v_name text := btrim(coalesce(p->>'fullName', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g');
  v_pos text[]; r record;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select coalesce(settings->'convocatoriaStaff', '{}'::jsonb) into v_cfg from public.organizations where id = v_org;
  if not coalesce((v_cfg->>'abierta')::boolean, true) then raise exception 'La convocatoria está cerrada'; end if;
  if length(v_name) < 3 then raise exception 'Escribe tu nombre completo'; end if;
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Escribe un WhatsApp válido'; end if;
  if coalesce((p->'consent'->>'dataAccepted')::boolean, false) is not true then raise exception 'Falta aceptar el aviso de privacidad'; end if;
  -- Trabajan con niños: si lo contratan, presenta su carta de no antecedentes penales.
  if coalesce((p->'consent'->>'backgroundCheck')::boolean, false) is not true then raise exception 'Falta aceptar lo de la carta de no antecedentes penales'; end if;
  select coalesce(array_agg(left(btrim(x), 80)) filter (where btrim(x) <> ''), '{}') into v_pos
    from jsonb_array_elements_text(coalesce(p->'positions', '[]'::jsonb)) x;
  if cardinality(v_pos) = 0 then raise exception 'Elige al menos un puesto'; end if;
  -- Una postulación por teléfono al día: un doble toque no la duplica.
  if exists (select 1 from app.staff_applications a where a.organization_id = v_org and a.phone = v_phone and a.created_at > now() - interval '1 day') then
    select id, folio into v_id, v_folio from app.staff_applications a where a.organization_id = v_org and a.phone = v_phone order by created_at desc limit 1;
    return jsonb_build_object('applicationId', v_id, 'folio', v_folio, 'duplicate', true);
  end if;

  select count(*) + 1 into v_n from app.staff_applications where organization_id = v_org;
  v_folio := 'ST-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  insert into app.staff_applications(organization_id, folio, full_name, phone, email, age, city, positions, experience, studies, availability, about, consent)
  values (v_org, v_folio, v_name, v_phone, nullif(lower(btrim(p->>'email')), ''), nullif(p->>'age', '')::smallint, nullif(btrim(p->>'city'), ''),
          v_pos, nullif(btrim(p->>'experience'), ''), left(nullif(btrim(p->>'studies'), ''), 300),
          coalesce((select array_agg(left(btrim(x), 60)) from jsonb_array_elements_text(coalesce(p->'availability', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
          left(nullif(btrim(p->>'about'), ''), 1200),
          jsonb_build_object('dataAccepted', true, 'backgroundCheck', true, 'privacyNoticeVersion', p->'consent'->>'privacyNoticeVersion', 'acceptedAt', now(), 'source', 'public-web'))
  returning id into v_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'StaffApplicationReceived', 'staff_application', v_id, jsonb_build_object('folio', v_folio, 'positions', to_jsonb(v_pos)));

  -- Aviso a quien contrata: Presidencia y quien tenga Dirección deportiva.
  for r in select distinct m.user_id from public.organization_memberships m
           left join private.membership_module_overrides mo on mo.membership_id = m.id and mo.module_code = 'formacion_direccion' and mo.can_read
           left join public.role_module_permissions rp on rp.organization_id = m.organization_id and rp.role = m.role and rp.module_code = private.legacy_module_code('users') and rp.can_read
           where m.organization_id = v_org and m.active and (m.is_owner or mo.membership_id is not null or rp.role is not null) loop
    insert into app.announcements(organization_id, title, body, source, audience_type, audience_value, expires_at)
    values (v_org, 'Nueva postulación de staff', format('%s · %s', v_name, array_to_string(v_pos, ', ')), 'staff', 'user', r.user_id::text, now() + interval '7 days');
    perform private.notify_push(v_org, 'Nueva postulación de staff', format('%s · %s', v_name, array_to_string(v_pos, ', ')), 'user', r.user_id::text, '/candidatos/');
  end loop;
  return jsonb_build_object('applicationId', v_id, 'folio', v_folio);
end $$;

update public.organizations
   set settings = jsonb_set(settings, '{convocatoriaStaff,requisitos}',
         coalesce(settings->'convocatoriaStaff'->'requisitos', '[]'::jsonb) || '["Carta de no antecedentes penales (al ser contratado)"]'::jsonb)
 where slug = 'tannery-city-fc' and settings ? 'convocatoriaStaff'
   and not (coalesce(settings->'convocatoriaStaff'->'requisitos', '[]'::jsonb) @> '["Carta de no antecedentes penales (al ser contratado)"]'::jsonb);
