-- h65 · Mi semana: barras por rol y reconocimiento (08/11/2026)
--
-- Presidencia: "estilo gamification... que cada perfil vea una barrita de lo
-- que le falta". Decisiones del 08/11/2026:
--   · Marketing: 3 ideas por semana y 3 patrocinadores por mes; "sólo el
--     contacto vale" (registrar al patrocinador ya cuenta).
--   · Director deportivo: su barra (publicar la semana de cada categoría) y la
--     de sus profes.
--   · Reconocimiento dentro de la app (racha y destacados), nada público fuera.
--
-- Todo sale de datos que ya existen; nadie marca "ya lo hice" a mano:
--   · Profe: listas tomadas (attendance_records), planeación de la semana que
--     viene lista (session_plans.ready_at) y partidos con resultado.
--   · Director: semanas publicadas (training_weeks) por categoría.
--   · Marketing: ideas (ideas.created_by) y patrocinadores (sponsors).
--
-- Funciones:
--   private.user_module(org, user, module, write): has_module_access para
--     cualquier usuario (el tablero calcula a todos).
--   private.week_status(org, user, week_start): secciones con hecho/total.
--   v2_my_week(org): mi semana + racha de semanas al 100%.
--   v2_team_week(org): Presidencia y Director deportivo ven a todos.

create or replace function private.user_module(p_organization_id uuid, p_user_id uuid, p_module text, p_write boolean default false)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'private'
as $$
  select private.module_enabled(p_organization_id, p_module)
    and exists (
      select 1 from public.organization_memberships m
      left join public.role_module_permissions rp on rp.organization_id = m.organization_id and rp.role = m.role
        and rp.module_code = private.legacy_module_code(p_module)
      left join private.membership_module_overrides mo on mo.organization_id = m.organization_id and mo.membership_id = m.id
        and mo.module_code = private.legacy_module_code(p_module)
      where m.organization_id = p_organization_id and m.user_id = p_user_id and m.active
        and coalesce(mo.can_read, rp.can_read, false)
        and (not p_write or coalesce(mo.can_write, rp.can_write, false)))
$$;

create or replace function private.week_status(p_organization_id uuid, p_user_id uuid, p_week date)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_ini date := date_trunc('week', p_week)::date; v_fin date;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes date; v_rol text; v_cats uuid[]; v_nombres text[];
  v_profe boolean; v_dir boolean; v_mkt boolean;
  v_sec jsonb := '[]'::jsonb; v_hecho integer; v_total integer; v_items jsonb; v_suma numeric := 0; v_peso numeric := 0;
begin
  v_fin := v_ini + 6;
  v_mes := date_trunc('month', least(v_fin, v_hoy))::date;
  select m.role into v_rol from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = p_user_id and m.active limit 1;
  if v_rol is null then return null; end if;
  select coalesce(array_agg(a.category_id), '{}'), coalesce(array_agg(c.name), '{}') into v_cats, v_nombres
    from app.category_staff_assignments a join app.categories c on c.id = a.category_id
    where a.organization_id = p_organization_id and a.user_id = p_user_id;
  v_dir := v_rol <> 'Presidencia' and private.user_module(p_organization_id, p_user_id, 'formacion_direccion');
  v_profe := cardinality(v_cats) > 0 or v_rol = 'Formadores';
  v_mkt := v_rol = 'Marketing';

  if v_profe then
    if cardinality(v_cats) = 0 then
      v_sec := v_sec || jsonb_build_object('key', 'categoria', 'title', 'Tu categoría', 'done', 0, 'total', 1, 'href', '/formacion/',
        'items', jsonb_build_array(jsonb_build_object('text', 'Pide a Dirección Deportiva que te asigne categoría', 'href', '/formacion/')));
    end if;
    -- Listas: sesiones de la semana que ya terminaron.
    select count(*) filter (where x.con_lista), count(*),
      coalesce(jsonb_agg(jsonb_build_object('text', 'Toma lista: ' || x.cat || ' · ' || to_char(x.dia, 'DD/MM'), 'href', '/asistencia/')
        order by x.dia) filter (where not x.con_lista), '[]')
      into v_hecho, v_total, v_items
    from (select s.id, c.name as cat, (s.starts_at at time zone 'America/Mexico_City')::date as dia,
            exists(select 1 from app.attendance_records ar where ar.session_id = s.id) as con_lista
          from app.sessions s join app.categories c on c.id = s.category_id
          where s.organization_id = p_organization_id and s.status <> 'cancelled'
            and (s.starts_at at time zone 'America/Mexico_City')::date between v_ini and v_fin
            and coalesce(s.ends_at, s.starts_at) < now()
            and (s.responsible_user_id = p_user_id or s.category_id = any(v_cats))) x;
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'listas', 'title', 'Listas tomadas', 'done', v_hecho, 'total', v_total, 'href', '/asistencia/', 'items', v_items);
    end if;
    -- Planeación de la semana que viene.
    select count(*) filter (where x.lista), count(*),
      coalesce(jsonb_agg(jsonb_build_object('text', 'Planea: ' || x.cat || ' · ' || to_char(x.dia, 'DD/MM'), 'href', '/formacion/')
        order by x.dia) filter (where not x.lista), '[]')
      into v_hecho, v_total, v_items
    from (select s.id, c.name as cat, coalesce(s.planned_date, (s.starts_at at time zone 'America/Mexico_City')::date) as dia,
            exists(select 1 from app.session_plans sp where sp.session_id = s.id and sp.ready_at is not null) as lista
          from app.sessions s join app.categories c on c.id = s.category_id
          where s.organization_id = p_organization_id and s.status <> 'cancelled'
            and coalesce(s.planned_date, (s.starts_at at time zone 'America/Mexico_City')::date) between v_ini + 7 and v_fin + 7
            and (s.responsible_user_id = p_user_id or s.category_id = any(v_cats))) x;
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'planeacion', 'title', 'Planeación de la próxima semana', 'done', v_hecho, 'total', v_total, 'href', '/formacion/', 'items', v_items);
    end if;
    -- Partidos de sus categorías con resultado.
    select count(*) filter (where x.listo), count(*),
      coalesce(jsonb_agg(jsonb_build_object('text', 'Registra el resultado: ' || coalesce(x.category, '') || ' vs ' || coalesce(x.opponent, 'rival'), 'href', '/partidos/')
        order by x.match_date) filter (where not x.listo), '[]')
      into v_hecho, v_total, v_items
    from (select m.category, m.opponent, m.match_date, (m.status = 'completed' and m.goals_for is not null) as listo
          from app.matches m
          where m.organization_id = p_organization_id and m.archived_at is null
            and m.category = any(v_nombres) and m.match_date between v_ini and least(v_fin, v_hoy - 1)) x;
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'partidos', 'title', 'Partidos registrados', 'done', v_hecho, 'total', v_total, 'href', '/partidos/', 'items', v_items);
    end if;
  end if;

  if v_dir then
    -- Publicar la semana (reto y conducta) de cada categoría que entrena la que viene.
    select count(*) filter (where x.publicada), count(*),
      coalesce(jsonb_agg(jsonb_build_object('text', 'Publica la semana de ' || x.name, 'href', '/formacion/') order by x.name) filter (where not x.publicada), '[]')
      into v_hecho, v_total, v_items
    from (select c.id, c.name, exists(select 1 from app.training_weeks w where w.category_id = c.id and w.week_start = v_ini + 7
                   and w.status = 'published' and w.removed_at is null) as publicada
          from app.categories c
          where c.organization_id = p_organization_id
            and exists(select 1 from app.sessions s where s.category_id = c.id and s.status <> 'cancelled'
                        and coalesce(s.planned_date, (s.starts_at at time zone 'America/Mexico_City')::date) between v_ini + 7 and v_fin + 7)) x;
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'semanas', 'title', 'Semanas publicadas', 'done', v_hecho, 'total', v_total, 'href', '/formacion/', 'items', v_items);
    end if;
    -- Categorías sin profe.
    select count(*) into v_total from app.categories c
      where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'
        and not exists(select 1 from app.category_staff_assignments a where a.category_id = c.id);
    if v_total > 0 then
      select jsonb_agg(jsonb_build_object('text', 'Asigna profe a ' || c.name, 'href', '/formacion/') order by c.name) into v_items
        from app.categories c where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'
          and not exists(select 1 from app.category_staff_assignments a where a.category_id = c.id);
      v_sec := v_sec || jsonb_build_object('key', 'sin_profe', 'title', 'Categorías con profe', 'done', 0, 'total', v_total, 'href', '/formacion/', 'items', v_items);
    end if;
  end if;

  if v_mkt then
    select count(*) into v_hecho from app.ideas i
      where i.organization_id = p_organization_id and i.created_by = p_user_id
        and (i.created_at at time zone 'America/Mexico_City')::date between v_ini and v_fin;
    v_sec := v_sec || jsonb_build_object('key', 'ideas', 'title', 'Ideas de la semana', 'done', least(v_hecho, 3), 'total', 3, 'href', '/ideas/',
      'items', case when v_hecho < 3 then jsonb_build_array(jsonb_build_object('text', 'Te faltan ' || (3 - v_hecho) || ' idea' || case when 3 - v_hecho = 1 then '' else 's' end || ' esta semana', 'href', '/ideas/')) else '[]'::jsonb end);
    -- "Sólo el contacto vale": registrar al patrocinador ya cuenta.
    select count(*) into v_hecho from app.sponsors sp
      where sp.organization_id = p_organization_id and sp.removed_at is null
        and (sp.owner_user_id = p_user_id or sp.owner_user_id is null)
        and (sp.created_at at time zone 'America/Mexico_City')::date between v_mes and (v_mes + interval '1 month' - interval '1 day')::date;
    v_sec := v_sec || jsonb_build_object('key', 'patrocinadores', 'title', 'Patrocinadores contactados este mes', 'done', least(v_hecho, 3), 'total', 3, 'href', '/patrocinadores/',
      'items', case when v_hecho < 3 then jsonb_build_array(jsonb_build_object('text', 'Te faltan ' || (3 - v_hecho) || ' contacto' || case when 3 - v_hecho = 1 then '' else 's' end || ' este mes', 'href', '/patrocinadores/')) else '[]'::jsonb end);
    -- Seguimiento: la siguiente acción ya venció.
    select count(*), coalesce(jsonb_agg(jsonb_build_object('text', 'Dale seguimiento a ' || sp.name, 'href', '/patrocinadores/') order by sp.next_action_at), '[]')
      into v_total, v_items
      from app.sponsors sp
      where sp.organization_id = p_organization_id and sp.removed_at is null and sp.archived_at is null
        and sp.next_action_at is not null and sp.next_action_at < now()
        and (sp.owner_user_id = p_user_id or sp.owner_user_id is null);
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'seguimiento', 'title', 'Seguimientos al día', 'done', 0, 'total', v_total, 'href', '/patrocinadores/', 'items', v_items);
    end if;
  end if;

  select coalesce(sum(least((s->>'done')::numeric, (s->>'total')::numeric)), 0), coalesce(sum((s->>'total')::numeric), 0)
    into v_suma, v_peso from jsonb_array_elements(v_sec) s;
  return jsonb_build_object('weekStart', v_ini, 'role', v_rol,
    'roles', jsonb_build_object('profe', v_profe, 'director', v_dir, 'marketing', v_mkt),
    'percent', case when v_peso > 0 then round(100 * v_suma / v_peso) else null end,
    'sections', v_sec);
end $$;

-- Semanas seguidas al 100% antes de esta (hasta 8).
create or replace function private.week_streak(p_organization_id uuid, p_user_id uuid)
returns integer language plpgsql stable security definer set search_path to ''
as $$
declare v_hoy date := (now() at time zone 'America/Mexico_City')::date; v_n integer := 0; v_st jsonb; i integer;
begin
  for i in 1..8 loop
    v_st := private.week_status(p_organization_id, p_user_id, v_hoy - 7 * i);
    exit when v_st is null or (v_st->>'percent') is null or (v_st->>'percent')::numeric < 100;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.v2_my_week(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_uid uuid := (select auth.uid()); v_hoy date := (now() at time zone 'America/Mexico_City')::date; v jsonb;
begin
  if v_uid is null or not private.is_active_member(organization_id) then raise exception 'Not authorized'; end if;
  v := private.week_status(organization_id, v_uid, v_hoy);
  if v is null or jsonb_array_length(v->'sections') = 0 then return v; end if;
  return v || jsonb_build_object('streak', private.week_streak(organization_id, v_uid));
end $$;

create or replace function public.v2_team_week(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_hoy date := (now() at time zone 'America/Mexico_City')::date; r record; v_st jsonb; v_prev jsonb; v_out jsonb := '[]'::jsonb;
begin
  if not (private.is_presidency(organization_id) or private.has_module_access(organization_id, 'formacion_direccion', false)) then
    raise exception 'Not authorized';
  end if;
  for r in select m.user_id, coalesce(p.display_name, 'Sin nombre') as nombre
           from public.organization_memberships m left join public.profiles p on p.user_id = m.user_id
           where m.organization_id = v2_team_week.organization_id and m.active loop
    v_st := private.week_status(organization_id, r.user_id, v_hoy);
    continue when v_st is null or jsonb_array_length(v_st->'sections') = 0;
    v_prev := private.week_status(organization_id, r.user_id, v_hoy - 7);
    v_out := v_out || (v_st || jsonb_build_object('userId', r.user_id, 'name', r.nombre,
      'lastWeekPercent', v_prev->'percent', 'streak', private.week_streak(organization_id, r.user_id)));
  end loop;
  return jsonb_build_object('weekStart', date_trunc('week', v_hoy)::date,
    'people', coalesce((select jsonb_agg(x order by coalesce((x->>'percent')::numeric, 101), x->>'name') from jsonb_array_elements(v_out) x), '[]'));
end $$;

revoke all on function private.user_module(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.week_status(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.week_streak(uuid, uuid) from public, anon, authenticated;
revoke all on function public.v2_my_week(uuid) from public, anon;
revoke all on function public.v2_team_week(uuid) from public, anon;
grant execute on function public.v2_my_week(uuid) to authenticated;
grant execute on function public.v2_team_week(uuid) to authenticated;
