-- h70 · Mi semana para cobranza (09/11/2026)
--
-- Presidencia: "avanza con todo". Zul (Operaciones) y Contabilidad también
-- tienen barra, con datos que ya existen:
--   · Cobros por aclarar: los que registró y Presidencia marcó "Aclarar".
--   · Operaciones: familias atrasadas con seguimiento esta semana (llamada,
--     visita, nota o WhatsApp en app.collection_notes). El botón "Recordar"
--     de Cobranza ahora también lo anota.
-- La cuenta compartida de Taquilla (iPad) no tiene barra: no es una persona.
-- Sólo cambia private.week_status; v2_my_week, v2_team_week y los
-- recordatorios (h69) la usan tal cual.

create or replace function private.week_status(p_organization_id uuid, p_user_id uuid, p_week date)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_ini date := date_trunc('week', p_week)::date; v_fin date;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes date; v_rol text; v_cats uuid[]; v_nombres text[];
  v_profe boolean; v_dir boolean; v_mkt boolean; v_cob boolean;
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
  -- Cobranza (h70): Operaciones y Contabilidad con permiso de cobrar. La
  -- cuenta compartida de Taquilla (iPad) no tiene barra: no es una persona.
  v_cob := v_rol in ('Operaciones', 'Contabilidad') and private.user_module(p_organization_id, p_user_id, 'billing', true);

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

  if v_cob then
    -- Cobros que Presidencia marcó "Aclarar" y que registró esta persona.
    select count(*), coalesce(jsonb_agg(jsonb_build_object('text', 'Aclara el cobro de ' || coalesce(trim(concat_ws(' ', pl.first_name, pl.last_name)), 'un Tanner') || ' (' || to_char(py.amount, 'FM$999,999,990.00') || ')', 'href', '/taquilla/') order by py.payment_date), '[]')
      into v_total, v_items
    from app.payments py left join app.players pl on pl.id = py.player_id
    where py.organization_id = p_organization_id and py.created_by_user_id = p_user_id
      and py.status = 'posted' and py.voided_at is null and py.reconciliation_status = 'clarification';
    if v_total > 0 then
      v_sec := v_sec || jsonb_build_object('key', 'aclarar', 'title', 'Cobros por aclarar', 'done', 0, 'total', v_total, 'href', '/taquilla/', 'items', v_items);
    end if;
    -- Operaciones: cada familia atrasada con seguimiento esta semana
    -- (llamada, visita, nota o WhatsApp; "Recordar" en Cobranza lo anota).
    if v_rol = 'Operaciones' then
      select count(*) filter (where x.con_nota), count(*),
        coalesce(jsonb_agg(jsonb_build_object('text', 'Recuérdale a la familia de ' || x.nombre, 'href', '/taquilla/') order by x.mas_viejo) filter (where not x.con_nota), '[]')
        into v_hecho, v_total, v_items
      from (select pl.id, trim(concat_ws(' ', pl.first_name, pl.last_name)) as nombre, min(ch.due_date) as mas_viejo,
              exists(select 1 from app.collection_notes n where n.organization_id = p_organization_id and n.player_id = pl.id
                       and (n.created_at at time zone 'America/Mexico_City')::date between v_ini and v_fin) as con_nota
            from app.players pl
            join app.charges ch on ch.player_id = pl.id and ch.organization_id = p_organization_id and ch.status = 'posted'
            join app.charge_balances cb on cb.id = ch.id
            where pl.organization_id = p_organization_id and pl.status = 'active' and pl.archived_at is null
              and cb.balance_due > 0.004 and ch.due_date < least(v_fin, v_hoy)
            group by pl.id, pl.first_name, pl.last_name) x;
      if v_total > 0 then
        v_sec := v_sec || jsonb_build_object('key', 'seguimiento_cobranza', 'title', 'Familias atrasadas con seguimiento', 'done', v_hecho, 'total', v_total, 'href', '/taquilla/',
          'items', (select coalesce(jsonb_agg(z.value), '[]') from (select e.value from jsonb_array_elements(v_items) e limit 8) z));
      end if;
    end if;
  end if;

  select coalesce(sum(least((s->>'done')::numeric, (s->>'total')::numeric)), 0), coalesce(sum((s->>'total')::numeric), 0)
    into v_suma, v_peso from jsonb_array_elements(v_sec) s;
  return jsonb_build_object('weekStart', v_ini, 'role', v_rol,
    'roles', jsonb_build_object('profe', v_profe, 'director', v_dir, 'marketing', v_mkt, 'cobranza', v_cob),
    'percent', case when v_peso > 0 then round(100 * v_suma / v_peso) else null end,
    'sections', v_sec);
end $$;
