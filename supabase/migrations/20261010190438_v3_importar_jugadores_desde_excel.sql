-- Importar jugadores desde Excel.
-- Todo club llega con su lista en una hoja de cálculo; capturar 80 niños a
-- mano es la primera razón para abandonar un sistema. Esta función recibe
-- las filas ya leídas del archivo y da de alta a cada jugador como lo hace
-- Captación al convertir un prospecto: jugador, tutor (si su teléfono ya
-- existe se reutiliza), categoría y perfil de cobro.
-- Con p_dry_run sólo revisa y dice qué haría con cada fila: es la vista
-- previa. Nada se guarda.
-- Cada fila: firstName, lastName, birthDate (AAAA-MM-DD), category,
-- guardianName, phone, email, jerseyNumber, position, monthlyFee, sex (M/F),
-- school.

create or replace function private.norm_texto(p text)
returns text language sql immutable set search_path to 'pg_catalog'
as $function$
  select lower(regexp_replace(translate(trim(coalesce(p, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '\s+', ' ', 'g'))
$function$;

create or replace function private.import_players(p_organization_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
  v_first text; v_last text; v_birth date; v_cat app.categories%rowtype; v_cat_name text;
  v_phone text; v_guardian_name text; v_email text; v_fee numeric; v_sex text;
  v_key text; v_estado text; v_motivo text; v_avisos jsonb;
  v_player uuid; v_guardian uuid; v_code text;
  v_nuevos int := 0; v_dup int := 0; v_err int := 0; v_avisados int := 0;
  v_hoy date := current_date;
begin
  if not private.has_module_access(p_organization_id, 'players', true) then raise exception 'Not authorized'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Las filas deben venir en una lista'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Máximo 500 jugadores por archivo'; end if;

  for r in select value as f, ordinality as n from jsonb_array_elements(p_rows) with ordinality loop
    v_estado := 'nuevo'; v_motivo := null; v_avisos := '[]'::jsonb; v_code := null; v_cat := null; v_cat_name := null;
    v_first := regexp_replace(trim(coalesce(r.f->>'firstName', '')), '\s+', ' ', 'g');
    v_last := nullif(regexp_replace(trim(coalesce(r.f->>'lastName', '')), '\s+', ' ', 'g'), '');
    v_guardian_name := nullif(regexp_replace(trim(coalesce(r.f->>'guardianName', '')), '\s+', ' ', 'g'), '');
    v_phone := nullif(regexp_replace(coalesce(r.f->>'phone', ''), '\D', '', 'g'), '');
    v_email := nullif(lower(trim(coalesce(r.f->>'email', ''))), '');
    v_sex := case upper(left(trim(coalesce(r.f->>'sex', '')), 1)) when 'M' then 'M' when 'H' then 'M' when 'F' then 'F' else null end;
    v_birth := null;
    begin
      v_birth := nullif(r.f->>'birthDate', '')::date;
    exception when others then
      v_avisos := v_avisos || to_jsonb('Fecha de nacimiento no válida: se deja vacía'::text);
    end;

    if length(v_first) < 2 then
      v_estado := 'error'; v_motivo := 'Falta el nombre';
    elsif v_birth is not null and (v_birth > v_hoy or v_birth < date '1950-01-01') then
      v_estado := 'error'; v_motivo := 'La fecha de nacimiento no es posible';
    end if;

    if v_estado = 'nuevo' then
      if v_last is null then v_avisos := v_avisos || to_jsonb('Sin apellidos'::text); end if;
      if v_birth is null and nullif(r.f->>'birthDate', '') is null then v_avisos := v_avisos || to_jsonb('Sin fecha de nacimiento'::text); end if;
      if v_phone is null then v_avisos := v_avisos || to_jsonb('Sin teléfono del tutor'::text);
      elsif length(v_phone) < 10 then v_avisos := v_avisos || to_jsonb('El teléfono tiene menos de 10 dígitos'::text); end if;

      if nullif(trim(coalesce(r.f->>'category', '')), '') is not null then
        select * into v_cat from app.categories c
         where c.organization_id = p_organization_id and c.status = 'active'
           and private.norm_texto(c.name) = private.norm_texto(r.f->>'category')
         limit 1;
        if v_cat.id is null then
          v_avisos := v_avisos || to_jsonb(('La categoría "' || trim(r.f->>'category') || '" no existe en el club: queda sin categoría')::text);
        else v_cat_name := v_cat.name; end if;
      else
        v_avisos := v_avisos || to_jsonb('Sin categoría'::text);
      end if;

      v_fee := null;
      begin v_fee := nullif(regexp_replace(coalesce(r.f->>'monthlyFee', ''), '[^0-9.]', '', 'g'), '')::numeric;
      exception when others then v_fee := null; end;
      if v_fee is null then v_fee := v_cat.monthly_fee; end if;
      if v_fee is null then v_avisos := v_avisos || to_jsonb('Sin cuota: queda por revisar en Cobranza'::text); end if;

      -- Duplicados: en el club o repetido dentro del mismo archivo.
      v_key := private.norm_texto(v_first) || '|' || private.norm_texto(v_last) || '|' || coalesce(v_birth::text, '');
      if v_key = any(v_vistos) then
        v_estado := 'duplicado'; v_motivo := 'Repetido en el archivo';
      elsif exists (select 1 from app.players p where p.organization_id = p_organization_id and p.archived_at is null
                     and private.norm_texto(p.first_name) = private.norm_texto(v_first)
                     and private.norm_texto(p.last_name) = private.norm_texto(v_last)
                     and (v_birth is null or p.birth_date is null or p.birth_date = v_birth)) then
        v_estado := 'duplicado'; v_motivo := 'Ya está en el club';
      end if;
      v_vistos := v_vistos || v_key;
    end if;

    if v_estado = 'nuevo' and not p_dry_run then
      v_code := private.next_player_code(p_organization_id);
      insert into app.players (organization_id, code, first_name, last_name, birth_date, status, category, position, jersey_number,
                               school, sex, joined_at, registered_at, notes, created_at, updated_at)
      values (p_organization_id, v_code, v_first, v_last, v_birth, 'active', v_cat_name,
              nullif(trim(coalesce(r.f->>'position', '')), ''), nullif(trim(coalesce(r.f->>'jerseyNumber', '')), ''),
              nullif(trim(coalesce(r.f->>'school', '')), ''), v_sex, v_hoy, v_hoy, 'Importado desde Excel', now(), now())
      returning id into v_player;

      if v_guardian_name is not null or v_phone is not null then
        v_guardian := null;
        if v_phone is not null then
          select g.id into v_guardian from app.guardians g
           where g.organization_id = p_organization_id and g.status = 'active' and g.phone = v_phone
           order by g.created_at limit 1;
        end if;
        if v_guardian is null then
          insert into app.guardians (organization_id, first_name, last_name, phone, email, relationship_default, status)
          values (p_organization_id, coalesce(v_guardian_name, 'Tutor de ' || v_first), null, v_phone, v_email, 'Tutor', 'active')
          returning id into v_guardian;
        end if;
        insert into app.player_guardians (player_id, guardian_id, relationship, is_primary, can_pickup, receives_billing, organization_id)
        values (v_player, v_guardian, 'Tutor', true, true, true, p_organization_id)
        on conflict do nothing;
      end if;

      if v_cat.id is not null then
        insert into app.player_enrollments (organization_id, player_id, category_id, starts_on, status, notes)
        values (p_organization_id, v_player, v_cat.id, v_hoy, 'active', 'Importado desde Excel')
        on conflict do nothing;
      end if;

      insert into app.billing_profiles (organization_id, player_id, base_monthly_fee, billing_start, billing_day, is_exempt, status, needs_review, review_reason)
      values (p_organization_id, v_player, greatest(0, coalesce(v_fee, 0)), v_hoy, 1, coalesce(v_fee, 0) = 0, 'active',
              v_fee is null, case when v_fee is null then 'Cuota pendiente: el jugador se importó sin cuota' end);
    end if;

    if v_estado = 'nuevo' then v_nuevos := v_nuevos + 1; if jsonb_array_length(v_avisos) > 0 then v_avisados := v_avisados + 1; end if;
    elsif v_estado = 'duplicado' then v_dup := v_dup + 1;
    else v_err := v_err + 1; end if;

    v_out := v_out || jsonb_build_object('fila', r.n, 'estado', v_estado, 'motivo', v_motivo, 'avisos', v_avisos,
                                         'nombre', trim(v_first || ' ' || coalesce(v_last, '')), 'categoria', v_cat_name, 'codigo', v_code);
  end loop;

  if not p_dry_run and v_nuevos > 0 then
    insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor)
    values (p_organization_id, 'PlayersImported', 'organization', p_organization_id,
            jsonb_build_object('nuevos', v_nuevos, 'duplicados', v_dup, 'errores', v_err),
            coalesce((select auth.uid())::text, 'system'));
  end if;

  return jsonb_build_object('guardado', not p_dry_run,
    'resumen', jsonb_build_object('nuevos', v_nuevos, 'duplicados', v_dup, 'errores', v_err, 'conAvisos', v_avisados),
    'filas', v_out);
end $function$;
revoke all on function private.import_players(uuid, jsonb, boolean) from public, anon, authenticated;

create or replace function public.v2_import_players(organization_id uuid, rows jsonb, dry_run boolean default true)
returns jsonb language sql security definer set search_path = ''
as $$ select private.import_players(organization_id, rows, dry_run) $$;
revoke all on function public.v2_import_players(uuid, jsonb, boolean) from public, anon;
grant execute on function public.v2_import_players(uuid, jsonb, boolean) to authenticated;