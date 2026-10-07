-- Mensajes de seguimiento en Fichajes
--
-- PEDIDO DE PRESIDENCIA (07/10/2026): que a los olvidados "ya se enviara un
-- mensaje de Tannery City" preguntando por la clase muestra e invitándolos a
-- venir. Aprobado: botón que abre el WhatsApp de la familia con el mensaje
-- armado (nombre del tutor, del niño, categoría, "sin costo", firma de quien
-- lo envía) y una cadencia de 3 mensajes.
--
-- QUÉ HACE:
--   v2_log_prospect_message(organization_id, prospect_id, step): quien
--     escribe en Fichajes registra que envió el mensaje 1, 2 o 3.
--       · Un "Nuevo" pasa a "Contactado".
--       · Mensajes 1 y 2 agendan el siguiente paso a 3 días; el 3 lo deja
--         sin siguiente paso (ya se le dejó la puerta abierta).
--       · Queda en metadata.followupMessages y en eventos, así que el
--         prospecto deja de contar como olvidado.
--       · El mismo paso dos veces no se duplica.
--   v2_prospect_messages(organization_id): cuántos mensajes lleva cada
--     prospecto abierto y cuándo fue el último. Lo ve quien ve Fichajes.
--   Recordatorio: el aviso de "siguiente paso" ahora también llega cuando el
--     prospecto está en "Contactado" (antes sólo en "Nuevo"), para que el
--     mensaje 2 no se olvide.
--
-- REVERSIBLE: borrar las dos funciones y regresar run_reminder_sweep a
-- p.status = 'new'.

create or replace function private.command_log_prospect_message(p_organization_id uuid, p_prospect_id uuid, p_step int)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $function$
declare v app.prospects%rowtype; v_msgs jsonb; v_ya boolean;
begin
  if not private.has_module_access(p_organization_id,'prospects',true) then raise exception 'Not authorized'; end if;
  if p_step not in (1,2,3) then raise exception 'El mensaje de seguimiento es el 1, 2 o 3'; end if;
  select * into v from app.prospects where id=p_prospect_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'Prospect not found'; end if;
  if v.status not in ('new','contacted','trial_scheduled','trial_completed') then
    raise exception 'Ese prospecto ya está cerrado (fichado o no continúa)';
  end if;
  v_msgs := coalesce(v.metadata->'followupMessages','[]'::jsonb);
  v_ya := exists(select 1 from jsonb_array_elements(v_msgs) m where (m->>'step')::int = p_step);
  if not v_ya then
    v_msgs := v_msgs || jsonb_build_array(jsonb_build_object('step',p_step,'at',now(),'by',auth.uid()));
    update app.prospects
       set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('followupMessages',v_msgs),
           status = case when status='new' then 'contacted' else status end,
           next_action_at = case when p_step < 3 then now() + interval '3 days' else null end,
           assigned_user_id = auth.uid(),
           updated_at = now()
     where id = p_prospect_id;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
    values(p_organization_id,'ProspectFollowupUpdated','prospect',p_prospect_id,
           jsonb_build_object('status',case when v.status='new' then 'contacted' else v.status end,'message',p_step,'channel','whatsapp'),
           auth.uid(),coalesce(auth.uid()::text,'system'));
  end if;
  return jsonb_build_object('id',p_prospect_id,'sent',jsonb_array_length(v_msgs),'repeated',v_ya);
end $function$;

create or replace function public.v2_log_prospect_message(organization_id uuid, prospect_id uuid, step int)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_log_prospect_message(organization_id, prospect_id, step) $function$;
revoke all on function public.v2_log_prospect_message(uuid,uuid,int) from public, anon;
grant execute on function public.v2_log_prospect_message(uuid,uuid,int) to authenticated;

create or replace function private.query_prospect_messages(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'prospects',false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'sent',jsonb_array_length(p.metadata->'followupMessages'),
             'lastAt',(select max((m->>'at')::timestamptz) from jsonb_array_elements(p.metadata->'followupMessages') m)))
      from app.prospects p
     where p.organization_id=p_organization_id and p.archived_at is null
       and jsonb_typeof(p.metadata->'followupMessages')='array'
       and jsonb_array_length(p.metadata->'followupMessages')>0), '[]'::jsonb);
end $function$;

create or replace function public.v2_prospect_messages(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_prospect_messages(organization_id) $function$;
revoke all on function public.v2_prospect_messages(uuid) from public, anon;
grant execute on function public.v2_prospect_messages(uuid) to authenticated;

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
      and p.status in ('new','contacted')
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
