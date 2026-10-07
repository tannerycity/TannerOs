-- Fichajes olvidados
--
-- PEDIDO DE PRESIDENCIA (07/10/2026): "el aviso de prospectos olvidados".
-- MEDIDO: 31 prospectos en "Nuevo", 14 de ellos con más de 7 días sin que
-- nadie registrara un seguimiento; ninguno tenía responsable ni siguiente
-- paso, así que el recordatorio que ya existía (por siguiente paso agendado)
-- nunca les llegaba.
--
-- QUÉ HACE:
--   v2_stale_prospects(organization_id): los prospectos abiertos (Nuevo,
--     Contactado, Prueba agendada o realizada) cuyo último movimiento tiene
--     más de 7 días y que no tienen un siguiente paso agendado a futuro.
--     Último movimiento = el seguimiento más reciente o, si nunca hubo, el
--     alta. Devuelve id, último movimiento y días. Lo ve quien ve Fichajes.
--   Aviso diario: el barrido de recordatorios (cada 30 min) publica UNA vez
--     al día, después de las 9:00 de León, "Fichajes sin seguimiento: N" para
--     Operaciones, con el más antiguo. Si no hay olvidados, no avisa.
--
-- REVERSIBLE: drop de las dos funciones nuevas y volver run_reminder_sweep a
-- su versión anterior (sin la última línea).

create or replace function private.stale_prospect_rows(p_organization_id uuid)
returns table(id uuid, name text, last_touch timestamptz, days int)
language sql stable security definer set search_path to 'pg_catalog','app','private'
as $$
  select p.id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
         t.last_touch, (extract(epoch from now()-t.last_touch)/86400)::int
    from app.prospects p
    cross join lateral (
      select greatest(p.created_at, coalesce((select max(e.occurred_at) from app.domain_events e
               where e.organization_id=p.organization_id and e.aggregate_type='prospect'
                 and e.aggregate_id=p.id and e.event_type='ProspectFollowupUpdated'), p.created_at)) last_touch
    ) t
   where p.organization_id=p_organization_id and p.archived_at is null
     and p.status in ('new','contacted','trial_scheduled','trial_completed')
     and t.last_touch < now() - interval '7 days'
     and (p.next_action_at is null or p.next_action_at < now())
$$;

create or replace function private.query_stale_prospects(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'prospects',false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'lastTouch',s.last_touch,'days',s.days) order by s.days desc)
                     from private.stale_prospect_rows(p_organization_id) s), '[]'::jsonb);
end $$;

create or replace function public.v2_stale_prospects(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_stale_prospects(organization_id) $$;
revoke all on function public.v2_stale_prospects(uuid) from public, anon;
grant execute on function public.v2_stale_prospects(uuid) to authenticated;

create or replace function private.sweep_stale_prospects()
returns void language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_org uuid; v_n int; v_viejo record; v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  if extract(hour from now() at time zone 'America/Mexico_City') < 9 then return; end if;
  for v_org in select distinct organization_id from app.prospects where archived_at is null loop
    if exists(select 1 from app.announcements a where a.organization_id=v_org and a.source='prospects_stale'
               and (a.published_at at time zone 'America/Mexico_City')::date = v_hoy) then continue; end if;
    select count(*) into v_n from private.stale_prospect_rows(v_org);
    if v_n = 0 then continue; end if;
    select s.name, s.days into v_viejo from private.stale_prospect_rows(v_org) s order by s.days desc limit 1;
    perform private.publish_system_announcement(v_org,
      'Fichajes sin seguimiento: '||v_n,
      case when v_n=1 then '1 prospecto lleva' else v_n||' prospectos llevan' end
        ||' más de 7 días sin que nadie los contacte. El más antiguo: '||coalesce(nullif(v_viejo.name,''),'sin nombre')
        ||' ('||v_viejo.days||' días). Ábrelos en Fichajes.',
      'role','Operaciones','prospects_stale',null);
  end loop;
end $$;

create or replace function private.run_reminder_sweep()
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_row record;
begin
  for v_row in
    select p.id, p.organization_id, p.first_name, p.last_name, p.assigned_user_id
    from app.prospects p
    where p.next_action_at is not null
      and p.next_action_at <= now()
      and p.status = 'new'
      and p.assigned_user_id is not null
      and p.archived_at is null
      and not exists (
        select 1 from app.announcements a
        where a.source='prospect_reminder' and a.source_id=p.id and a.published_at >= p.next_action_at
      )
  loop
    perform private.publish_system_announcement(
      v_row.organization_id,
      'Seguimiento pendiente: ' || trim(coalesce(v_row.first_name,'') || ' ' || coalesce(v_row.last_name,'')),
      'Tenías programado un siguiente paso con este prospecto.',
      'user', v_row.assigned_user_id::text, 'prospect_reminder', v_row.id
    );
  end loop;

  for v_row in
    select s.id, s.organization_id, s.name, s.next_action, s.owner_user_id
    from app.sponsors s
    where s.next_action_at is not null
      and s.next_action_at <= now()
      and coalesce(s.stage,'') not in ('lost','finished')
      and s.archived_at is null
      and not exists (
        select 1 from app.announcements a
        where a.source='sponsor_reminder' and a.source_id=s.id and a.published_at >= s.next_action_at
      )
  loop
    perform private.publish_system_announcement(
      v_row.organization_id,
      'Seguimiento de patrocinio: ' || v_row.name,
      coalesce(v_row.next_action,'Tienes un siguiente paso programado con esta marca.'),
      case when v_row.owner_user_id is not null then 'user' else 'role' end,
      coalesce(v_row.owner_user_id::text, 'Presidencia'),
      'sponsor_reminder', v_row.id
    );
  end loop;

  -- Fichajes olvidados: un aviso al día para Operaciones (07/10/2026).
  perform private.sweep_stale_prospects();
end
$function$;
