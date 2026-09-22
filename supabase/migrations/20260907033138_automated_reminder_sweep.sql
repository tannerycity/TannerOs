-- 1. Publicación de anuncios generados por el sistema (sin actor humano, sin gate de módulo)
create or replace function private.publish_system_announcement(p_organization_id uuid, p_title text, p_body text, p_audience_type text, p_audience_value text, p_source text, p_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_id uuid;
begin
  insert into app.announcements(organization_id,title,body,source,source_id,audience_type,audience_value,published_by)
  values (p_organization_id, p_title, p_body, p_source, p_source_id, p_audience_type, p_audience_value, null)
  returning id into v_id;
  perform private.notify_push(p_organization_id, p_title, p_body, p_audience_type, p_audience_value, '/');
  return v_id;
end
$function$;
revoke all on function private.publish_system_announcement(uuid,text,text,text,text,text,uuid) from public, anon, authenticated;

-- 2. Barrido de recordatorios: Prospectos (personal, al responsable) y Patrocinadores (rol Marketing)
create or replace function private.run_reminder_sweep()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
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
        where a.source='prospect_reminder' and a.source_id=p.id and a.published_at::date = current_date
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
    select s.id, s.organization_id, s.name, s.next_action
    from app.sponsors s
    where s.next_action_at is not null
      and s.next_action_at <= now()
      and coalesce(s.stage,'') not in ('lost','finished')
      and s.archived_at is null
      and not exists (
        select 1 from app.announcements a
        where a.source='sponsor_reminder' and a.source_id=s.id and a.published_at::date = current_date
      )
  loop
    perform private.publish_system_announcement(
      v_row.organization_id,
      'Seguimiento de patrocinio: ' || v_row.name,
      coalesce(v_row.next_action,'Tienes un siguiente paso programado con esta marca.'),
      'role', 'Marketing', 'sponsor_reminder', v_row.id
    );
  end loop;
end
$function$;
revoke all on function private.run_reminder_sweep() from public, anon, authenticated;

-- 3. Cron: cada 30 minutos
select cron.unschedule('tanneros-reminder-sweep') where exists (select 1 from cron.job where jobname='tanneros-reminder-sweep');
select cron.schedule('tanneros-reminder-sweep', '*/30 * * * *', $$select private.run_reminder_sweep();$$);
;
