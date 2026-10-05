-- Responsable por patrocinador: el recordatorio le llega a esa persona
--
-- MEDIDO (05/10/2026): el barrido mandaba los seguimientos de patrocinio al
-- rol "Marketing", y nadie tiene ese rol (Zul pasó a Operaciones con permiso
-- especial de Patrocinadores). El de Don Trapo —"Cobro de la segunda parte /
-- pago $7,500", vencido desde el 11/08— no le llegaba a nadie. De 5
-- patrocinadores, ninguno tenía responsable; el campo era texto libre.
--
-- PEDIDO DE PRESIDENCIA: poder elegir a quién le llega, y Zul responsable de
-- Don Trapo.
--
-- QUÉ HACE
--   1. app.sponsors.owner_user_id: el responsable es una PERSONA del club, no
--      un texto. owner_name se sigue llenando con su nombre para lo que ya lo
--      lee.
--   2. v2_set_sponsor_owner: asignar o quitar responsable (permiso de
--      escribir en Patrocinadores; tiene que ser alguien activo del club).
--   3. v2_club_people: la lista de personas activas para elegir (cualquier
--      miembro activo; sólo nombre y rol).
--   4. query_sponsor_admin devuelve ownerUserId para preseleccionarlo.
--   5. Barrido: el seguimiento le llega al responsable; si no hay, a
--      Presidencia. Nunca más a un rol vacío.
--   6. Don Trapo: responsable Zul, y se le manda el recordatorio hoy una vez.
--   7. ERROR LATENTE QUE SE CORRIGE: app.announcements sólo aceptaba
--      audience 'club' o 'role', pero el recordatorio de prospectos (y el
--      publicador de avisos) ya mandaban 'user'. El día que un prospecto con
--      responsable se venciera, el barrido completo truena y nadie recibe
--      ningún recordatorio. No había pasado (1,347 corridas, 0 fallas) porque
--      ningún prospecto había caído en ese caso. Ahora 'user' es válido.
--
-- REVERSIBLE: drop column owner_user_id y funciones nuevas; el barrido vuelve
-- a la versión de k2.

alter table app.sponsors add column if not exists owner_user_id uuid;

-- 7. Avisos a una persona.
alter table app.announcements drop constraint if exists announcements_audience_type_check;
alter table app.announcements add constraint announcements_audience_type_check
  check (audience_type = any (array['club','role','user']));

-- 4. ownerUserId en la consulta de Patrocinadores (se parcha la definición
-- vigente en vez de copiarla completa; si cambió, la migración se detiene).
do $patch$
declare d text; n text;
begin
  d := pg_get_functiondef('private.query_sponsor_admin'::regproc);
  n := replace(d, '''ownerName'',s.owner_name,', '''ownerName'',s.owner_name,''ownerUserId'',s.owner_user_id,');
  if n = d then raise exception 'query_sponsor_admin cambió: no encontré ownerName para agregar ownerUserId'; end if;
  execute n;
end $patch$;

create or replace function private.query_club_people(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','private'
as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', private.chat_name(m.user_id), 'role', m.role)
            order by private.chat_name(m.user_id)), '[]'::jsonb)
          from public.organization_memberships m
          where m.organization_id=p_organization_id and m.active);
end $$;

create or replace function private.command_set_sponsor_owner(p_organization_id uuid, p_sponsor_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_name text; v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if p_user_id is not null then
    if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active)
      then raise exception 'Esa persona no está activa en el club'; end if;
    v_name := private.chat_name(p_user_id);
  end if;
  update app.sponsors set owner_user_id=p_user_id, owner_name=v_name, updated_at=now()
   where id=p_sponsor_id and organization_id=p_organization_id returning id into v_id;
  if v_id is null then raise exception 'Sponsor not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'SponsorOwnerSet','sponsor',v_id,jsonb_build_object('ownerUserId',p_user_id,'ownerName',v_name),auth.uid(),null);
  return jsonb_build_object('ok', true, 'ownerUserId', p_user_id, 'ownerName', v_name);
end $$;

create or replace function public.v2_club_people(organization_id uuid) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_club_people(organization_id) $$;
create or replace function public.v2_set_sponsor_owner(organization_id uuid, sponsor_id uuid, user_id uuid) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_set_sponsor_owner(organization_id, sponsor_id, user_id) $$;
revoke all on function public.v2_club_people(uuid), public.v2_set_sponsor_owner(uuid,uuid,uuid) from public, anon;
grant execute on function public.v2_club_people(uuid), public.v2_set_sponsor_owner(uuid,uuid,uuid) to authenticated;

-- 5. Barrido: al responsable; si no hay, a Presidencia.
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
end
$function$;

-- 6. Don Trapo → Zul, y su recordatorio hoy.
do $dato$
declare v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'; v_zul uuid := '2278fc59-b8c8-482c-9c28-730106910b6c'; s record;
begin
  if not exists(select 1 from public.organization_memberships where organization_id=v_org and user_id=v_zul and active) then
    raise notice 'Zul no está activa: Don Trapo se queda sin responsable'; return;
  end if;
  for s in select id, name, next_action, next_action_at from app.sponsors where organization_id=v_org and name='Don Trapo' and archived_at is null loop
    update app.sponsors set owner_user_id=v_zul, owner_name=private.chat_name(v_zul), updated_at=now() where id=s.id;
    perform private.publish_system_announcement(v_org, 'Seguimiento de patrocinio: ' || s.name,
      coalesce(s.next_action,'Tienes un siguiente paso programado con esta marca.') || case when s.next_action_at < now() then ' · vencido desde el ' || to_char(s.next_action_at at time zone 'America/Mexico_City','DD/MM') else '' end,
      'user', v_zul::text, 'sponsor_reminder', s.id);
  end loop;
end $dato$;
