-- h90 · Formación: piloto automático de la Semana Tanner y respaldo en el portal
--
-- Presidencia (12/11/2026): "si no hace Brandon eso, los profes no podrían
-- avanzar... ¿qué solución podríamos hacer?". Los profes ya avanzan (escriben
-- su objetivo), pero esa semana el club trabaja sin Reto común y el papá ve el
-- portal vacío. Se decidió A + B + D:
--   A. Plan del mes: Dirección publica 4 semanas de una vez. Es sólo pantalla
--      (v2_save_training_weeks ya recibe varias semanas); no va en este SQL.
--   B. Piloto automático (aquí): pasado el límite de publicación (viernes
--      22:00), cada categoría que entrena la semana siguiente y no tiene Semana
--      publicada se publica sola:
--        · si Dirección dejó un borrador, se publica ese borrador;
--        · si no, el Reto (o mundo Baby) que sigue al último publicado de esa
--          categoría, en el orden del catálogo; después del último, vuelve al
--          primero. Sin historia, empieza por el primero.
--      Lo que Dirección QUITÓ a mano no se vuelve a publicar: fue su decisión.
--      Se avisa a Dirección qué se publicó, sin nombres de Tanners.
--   D. Respaldo en el portal (aquí): si la semana no tiene Reto publicado, la
--      familia ve el objetivo que escribió el Formador en su sesión.
--
-- No cambia: cortes, cumplimiento, bono, ni lo que ya esté publicado.

create or replace function private.formation_autopilot(p_organization_id uuid, p_week_start date)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare c record; v_kind text; v_ult text; v_sig text; v_n integer := 0; v_txt text := ''; v_new app.training_weeks%rowtype; u uuid;
begin
  for c in
    select cat.id, cat.name, cat.sort_order,
           coalesce((et.attrs->>'usesChallenges')::boolean, true) as uses,
           tw.id as week_id, tw.status as week_status, tw.removed_at, tw.primary_challenge
    from app.categories cat
    left join app.formation_concepts et on et.organization_id = cat.organization_id and et.kind = 'etapa' and et.code = cat.stage
    left join app.training_weeks tw on tw.organization_id = cat.organization_id and tw.category_id = cat.id and tw.week_start = p_week_start
    where cat.organization_id = p_organization_id and cat.status = 'active'
      and private.category_schedule_at(p_organization_id, cat.id, p_week_start) is not null
      and (tw.id is null or (tw.status <> 'published' and tw.removed_at is null))
    order by cat.sort_order
  loop
    v_kind := case when c.uses then 'reto' else 'mundo_baby' end;
    if c.week_id is not null and c.primary_challenge is not null then
      -- Borrador de Dirección: se publica tal cual.
      update app.training_weeks t set status = 'published', published_at = coalesce(t.published_at, now()), updated_at = now()
       where t.id = c.week_id returning * into v_new;
    else
      select t.primary_challenge into v_ult from app.training_weeks t
       where t.organization_id = p_organization_id and t.category_id = c.id and t.status = 'published'
         and t.removed_at is null and t.week_start < p_week_start
       order by t.week_start desc limit 1;
      select x.code into v_sig from app.formation_concepts x
       where x.organization_id = p_organization_id and x.kind = v_kind and coalesce(x.active, true)
         and x.sort_order > coalesce((select y.sort_order from app.formation_concepts y
               where y.organization_id = p_organization_id and y.kind = v_kind and y.code = v_ult), -1)
       order by x.sort_order limit 1;
      if v_sig is null then
        select x.code into v_sig from app.formation_concepts x
         where x.organization_id = p_organization_id and x.kind = v_kind and coalesce(x.active, true)
         order by x.sort_order limit 1;
      end if;
      continue when v_sig is null;
      insert into app.training_weeks(organization_id, category_id, week_start, primary_challenge, status, published_at)
      values (p_organization_id, c.id, p_week_start, v_sig, 'published', now())
      on conflict (organization_id, category_id, week_start) do nothing
      returning * into v_new;
      continue when v_new.id is null;
    end if;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'TrainingWeekChanged', 'training_week', v_new.id, jsonb_build_object(
      'action', 'automatica', 'categoryId', c.id, 'category', c.name, 'weekStart', v_new.week_start, 'before', null,
      'after', jsonb_build_object('primary', v_new.primary_challenge, 'secondary', v_new.secondary_challenge,
        'behavior', v_new.behavior, 'status', v_new.status)), null);
    v_n := v_n + 1;
    v_txt := v_txt || case when v_txt = '' then '' else ', ' end || c.name || ': '
      || coalesce((select x.name from app.formation_concepts x where x.organization_id = p_organization_id
                    and x.kind = v_kind and x.code = v_new.primary_challenge), v_new.primary_challenge);
  end loop;
  if v_n > 0 then
    for u in select * from private.formation_directors(p_organization_id) loop
      perform private.formation_notify(p_organization_id, 'publicar_auto', p_week_start, u, 'Semana Tanner publicada en automático',
        'No se publicó a tiempo y TannerOS puso el Reto que sigue. ' || v_txt || '. Puedes cambiarlo en Formación.', '/formacion/');
    end loop;
  end if;
  return v_n;
end $$;

revoke all on function private.formation_autopilot(uuid, date) from public, anon, authenticated;

create or replace function private.run_formation_cycle()
returns void language plpgsql security definer set search_path = '' as $$
declare
  o record; s jsonb; v_now timestamptz := now(); v_next date; v_pub timestamptz; v_cut timestamptz;
  v_horas int; v_faltan text; v_hoy date; u uuid; r record;
begin
  for o in select org.id from public.organizations org where coalesce(org.settings->'formacion'->>'inicio', '') <> '' loop
    begin
      s := private.formation_settings(o.id);
      v_hoy := (v_now at time zone (s->>'tz'))::date;
      v_horas := coalesce((s->>'avisoHorasAntes')::int, 4);
      -- La semana que se está planeando: el próximo lunes.
      v_next := v_hoy + (8 - extract(isodow from v_hoy)::int);
      perform private.sync_sessions_from_schedule(o.id, v_hoy, v_hoy + 14);

      if v_next >= (s->>'inicio')::date then
        -- Dirección: Semana sin publicar.
        v_pub := private.formation_deadline(o.id, v_next, 'publicacion');
        -- h90 · Piloto automático: pasado el límite, lo que Dirección no publicó
        -- se publica solo con el Reto que sigue. Lo que quede en v_faltan abajo
        -- es sólo lo que el piloto no pudo resolver.
        if v_now >= v_pub then perform private.formation_autopilot(o.id, v_next); end if;
        select string_agg(c.name, ', ' order by c.sort_order) into v_faltan
        from app.categories c
        where c.organization_id = o.id and c.status = 'active'
          and private.category_schedule_at(o.id, c.id, v_next) is not null
          and not exists (select 1 from app.training_weeks w where w.category_id = c.id and w.week_start = v_next and w.status = 'published');
        if v_faltan is not null then
          for u in select * from private.formation_directors(o.id) loop
            if v_now >= v_pub - make_interval(hours => v_horas) and v_now < v_pub then
              perform private.formation_notify(o.id, 'publicar_pronto', v_next, u, 'Semana Tanner por publicar',
                'Falta publicar: ' || v_faltan || '. Límite: viernes ' || to_char(v_pub at time zone (s->>'tz'), 'HH24:MI') || '.', '/formacion/');
            elsif v_now >= v_pub then
              perform private.formation_notify(o.id, 'publicar_vencido', v_next, u, 'No has publicado la Semana Tanner',
                'Siguen sin publicar: ' || v_faltan || '. Los Formadores planean con su propio objetivo.', '/formacion/');
            end if;
          end loop;
        end if;

        -- Formadores: sesiones pendientes antes del corte.
        v_cut := private.formation_deadline(o.id, v_next, 'corte');
        if v_now >= v_cut - make_interval(hours => v_horas) and v_now < v_cut then
          for r in select ss.responsible_user_id uid, count(*) pendientes
                   from app.sessions ss left join app.session_plans sp on sp.session_id = ss.id
                   where ss.organization_id = o.id and ss.origin in ('horario','sesion_extra') and ss.status = 'scheduled'
                     and ss.planned_date between v_next and v_next + 6 and ss.responsible_user_id is not null
                     and coalesce(sp.status, 'draft') <> 'ready'
                   group by 1 loop
            perform private.formation_notify(o.id, 'planear_pronto', v_next, r.uid, 'Próxima semana sin terminar',
              r.pendientes || case when r.pendientes = 1 then ' sesión pendiente' else ' sesiones pendientes' end
              || '. El corte es hoy a las ' || to_char(v_cut at time zone (s->>'tz'), 'HH24:MI') || '.', '/formacion/');
          end loop;
        end if;
      end if;

      -- Cortes vencidos que aún no tienen foto (incluye el de esta semana si ya pasó).
      for r in select w::date wk from generate_series(v_next - 14, v_next, interval '7 days') w loop
        if v_now >= private.formation_deadline(o.id, r.wk, 'corte')
           and not exists (select 1 from app.planning_cutoffs c where c.organization_id = o.id and c.week_start = r.wk) then
          perform private.take_planning_cutoff(o.id, r.wk);
        end if;
      end loop;
    exception when others then
      raise warning 'run_formation_cycle %: %', o.id, sqlerrm;
    end;
  end loop;
end $$;

-- D · El portal: sin Reto publicado, la familia ve el objetivo del Formador.
create or replace function public.v2_portal_week(player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_cat app.categories%rowtype; v_hoy date := private.hoy_mx(); v_lunes date; w record; v_obj text;
begin
  if not private.portal_owns_player(v2_portal_week.player_id) then raise exception 'Not authorized'; end if;
  select p.organization_id into v_org from app.players p where p.id = v2_portal_week.player_id;
  select c.* into v_cat from app.player_enrollments e join app.categories c on c.id = e.category_id
   where e.player_id = v2_portal_week.player_id and e.status = 'active' and e.starts_on <= v_hoy and (e.ends_on is null or e.ends_on >= v_hoy)
   order by e.starts_on desc limit 1;
  if v_cat.id is null then return null; end if;
  v_lunes := v_hoy - (extract(isodow from v_hoy)::int - 1);
  select tw.primary_challenge, tw.secondary_challenge, tw.behavior into w from app.training_weeks tw
   where tw.organization_id = v_org and tw.category_id = v_cat.id and tw.week_start = v_lunes and tw.status = 'published' and tw.removed_at is null;
  if w.primary_challenge is null then
    -- h90 · D: el objetivo que el Formador confirmó en una sesión de esta semana.
    select nullif(btrim(sp.objective), '') into v_obj
      from app.sessions s join app.session_plans sp on sp.session_id = s.id
     where s.organization_id = v_org and s.category_id = v_cat.id and s.status <> 'cancelled'
       and s.planned_date between v_lunes and v_lunes + 6
       and sp.status = 'ready' and nullif(btrim(sp.objective), '') is not null
     order by s.planned_date, s.starts_at limit 1;
    if v_obj is null then return null; end if;
    return jsonb_build_object('category', v_cat.name, 'baby', coalesce(v_cat.stage, '') like 'baby%', 'weekStart', v_lunes,
      'primary', null, 'behavior', null, 'objective', v_obj);
  end if;
  return jsonb_build_object('category', v_cat.name, 'baby', coalesce(v_cat.stage, '') like 'baby%', 'weekStart', v_lunes,
    'primary', (select jsonb_build_object('code', fc.code, 'name', fc.name, 'question', fc.question, 'phrase', fc.phrase) from app.formation_concepts fc
                 where fc.organization_id = v_org and fc.code = w.primary_challenge and fc.kind in ('reto', 'mundo_baby')
                 order by (fc.kind = case when coalesce(v_cat.stage, '') like 'baby%' then 'mundo_baby' else 'reto' end) desc limit 1),
    'behavior', w.behavior);
end $$;
