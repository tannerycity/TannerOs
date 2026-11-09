-- h69 · Recordatorios automáticos de "Mi semana" (09/11/2026)
--
-- Presidencia: "recordatorios... centro de notificaciones"; "dale con todo".
-- Sin avisos la barra se olvida. Push al celular (private.notify_push) de lo
-- que falta, una sola vez por cosa (private.mi_semana_avisos):
--   · Lista sin tomar: el día de la sesión, desde las 21:00.
--   · Partido sin resultado: al día siguiente, desde las 18:00.
--   · Marketing: el jueves desde las 18:00 si faltan ideas de la semana; el
--     día 25 desde las 10:00 si faltan patrocinadores del mes.
--   · Presidencia: el lunes desde las 9:00, resumen de la semana pasada.
-- La planeación ya la avisa run_formation_cycle (desde el 30/11/2026): aquí
-- no se repite. Corre cada 15 minutos (pg_cron).

create table if not exists private.mi_semana_avisos (
  organization_id uuid not null,
  user_id uuid not null,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (organization_id, user_id, kind, ref)
);
revoke all on table private.mi_semana_avisos from public, anon, authenticated;

-- Manda una vez: si ya se mandó esa cosa a esa persona, no hace nada.
create or replace function private.mi_semana_avisa(p_org uuid, p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_url text)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  insert into private.mi_semana_avisos(organization_id, user_id, kind, ref) values (p_org, p_user, p_kind, p_ref)
  on conflict do nothing;
  if not found then return false; end if;
  perform private.notify_push(p_org, p_title, p_body, 'user', p_user::text, p_url);
  return true;
end $$;

create or replace function private.run_mi_semana_reminders()
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  o record; r record; v_now timestamp; v_hoy date; v_hora int; v_dow int; v_n int := 0; v_out jsonb := '[]'::jsonb;
  v_ini date; v_hecho int; v_total int; v_100 int; v_pend int; v_st jsonb; m record;
begin
  for o in select org.id, org.slug, coalesce(nullif(org.timezone, ''), 'America/Mexico_City') as tz
           from public.organizations org where org.status = 'active' loop
    v_now := now() at time zone o.tz; v_hoy := v_now::date; v_hora := extract(hour from v_now)::int;
    v_dow := extract(isodow from v_hoy)::int; v_ini := date_trunc('week', v_hoy)::date; v_n := 0;

    -- 1. Listas de hoy sin tomar (desde las 21:00).
    if v_hora >= 21 then
      for r in
        select u.user_id, string_agg(distinct c.name, ', ') as cats
        from app.sessions s join app.categories c on c.id = s.category_id
        cross join lateral (
          select s.responsible_user_id as user_id where s.responsible_user_id is not null
          union select a.user_id from app.category_staff_assignments a where a.category_id = s.category_id) u
        join public.organization_memberships mm on mm.user_id = u.user_id and mm.organization_id = o.id and mm.active
        where s.organization_id = o.id and s.status <> 'cancelled'
          and (s.starts_at at time zone o.tz)::date = v_hoy and coalesce(s.ends_at, s.starts_at) < now()
          and not exists (select 1 from app.attendance_records ar where ar.session_id = s.id)
        group by u.user_id
      loop
        if private.mi_semana_avisa(o.id, r.user_id, 'lista', v_hoy::text, 'Te falta tomar lista',
             'Hoy: ' || r.cats || '. Tómala antes de dormir: cuenta para tu semana.', '/asistencia/') then v_n := v_n + 1; end if;
      end loop;
    end if;

    -- 2. Partidos de ayer sin resultado (desde las 18:00).
    if v_hora >= 18 then
      for r in
        select a.user_id, mt.id as match_id, mt.category, mt.opponent
        from app.matches mt
        join app.categories c on c.organization_id = o.id and c.name = mt.category
        join app.category_staff_assignments a on a.category_id = c.id
        join public.organization_memberships mm on mm.user_id = a.user_id and mm.organization_id = o.id and mm.active
        where mt.organization_id = o.id and mt.archived_at is null and mt.match_date = v_hoy - 1
          and not (mt.status = 'completed' and mt.goals_for is not null)
      loop
        if private.mi_semana_avisa(o.id, r.user_id, 'partido', r.match_id::text, 'Registra el partido de ayer',
             r.category || ' vs ' || coalesce(r.opponent, 'rival') || ': resultado y goles.', '/partidos/') then v_n := v_n + 1; end if;
      end loop;
    end if;

    -- 3. Marketing: ideas de la semana (jueves 18:00) y patrocinadores del mes (día 25, 10:00).
    for m in select mm.user_id from public.organization_memberships mm where mm.organization_id = o.id and mm.active and mm.role = 'Marketing' loop
      if v_dow = 4 and v_hora >= 18 then
        select count(*) into v_hecho from app.ideas i where i.organization_id = o.id and i.created_by = m.user_id
          and (i.created_at at time zone o.tz)::date between v_ini and v_ini + 6;
        if v_hecho < 3 and private.mi_semana_avisa(o.id, m.user_id, 'ideas', v_ini::text, 'Ideas de la semana',
             'Llevas ' || v_hecho || ' de 3. Te quedan el viernes y el fin.', '/ideas/') then v_n := v_n + 1; end if;
      end if;
      if extract(day from v_hoy) >= 25 and v_hora >= 10 then
        select count(*) into v_hecho from app.sponsors sp where sp.organization_id = o.id and sp.removed_at is null
          and (sp.owner_user_id = m.user_id or sp.owner_user_id is null)
          and (sp.created_at at time zone o.tz)::date >= date_trunc('month', v_hoy)::date;
        if v_hecho < 3 and private.mi_semana_avisa(o.id, m.user_id, 'patrocinadores', to_char(v_hoy, 'YYYY-MM'), 'Patrocinadores del mes',
             'Llevas ' || v_hecho || ' de 3 contactos este mes. Con registrar el contacto ya cuenta.', '/patrocinadores/') then v_n := v_n + 1; end if;
      end if;
    end loop;

    -- 4. Presidencia: el resumen del lunes (desde las 9:00).
    if v_dow = 1 and v_hora >= 9 then
      v_100 := 0; v_pend := 0; v_total := 0;
      for m in select mm.user_id from public.organization_memberships mm where mm.organization_id = o.id and mm.active loop
        v_st := private.week_status(o.id, m.user_id, v_hoy - 7);
        continue when v_st is null or jsonb_array_length(v_st->'sections') = 0;
        v_total := v_total + 1;
        if (v_st->>'percent')::numeric >= 100 then v_100 := v_100 + 1; else v_pend := v_pend + 1; end if;
      end loop;
      if v_total > 0 then
        for m in select mm.user_id from public.organization_memberships mm where mm.organization_id = o.id and mm.active
                   and (mm.role = 'Presidencia' or mm.is_owner) loop
          if private.mi_semana_avisa(o.id, m.user_id, 'resumen', v_ini::text, 'Así cerró la semana pasada',
               v_100 || ' de ' || v_total || ' al 100%' || case when v_pend > 0 then '; ' || v_pend || ' con pendientes. Toca para ver quién.' else '. Todo el equipo cumplió.' end,
               '/?vestidor#equipoSemana') then v_n := v_n + 1; end if;
        end loop;
      end if;
    end if;

    if v_n > 0 then v_out := v_out || jsonb_build_object('organization', o.slug, 'sent', v_n); end if;
  end loop;
  return v_out;
end $$;

revoke all on function private.mi_semana_avisa(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.run_mi_semana_reminders() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'tanneros-mi-semana-avisos') then
    perform cron.schedule('tanneros-mi-semana-avisos', '*/15 * * * *', 'select private.run_mi_semana_reminders();');
  end if;
end $$;
