
-- Función nueva: crea el evento (reutilizando la existente) y, si notify=on, avisa al club. No toca nada existente.
create or replace function private.command_upsert_club_event_notify(
  p_organization_id uuid, p_event_id uuid, p_title text, p_starts_at timestamptz,
  p_event_type text default 'event', p_location text default null, p_status text default 'scheduled',
  p_rival text default null, p_jersey text default null, p_notes text default null,
  p_notify boolean default false, p_audience_type text default 'club', p_audience_value text default null
) returns uuid
language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v_id uuid;
begin
  -- reutiliza la función original: gate + validación + upsert + domain_event
  v_id := private.command_upsert_club_event(p_organization_id,p_event_id,p_title,p_starts_at,p_event_type,p_location,p_status,p_rival,p_jersey,p_notes);
  -- avisa solo en eventos NUEVOS con el toggle encendido
  if coalesce(p_notify,false) and p_event_id is null then
    perform private.command_publish_announcement(
      p_organization_id, p_title,
      nullif(trim(coalesce(p_location, p_notes, '')),''),
      coalesce(p_audience_type,'club'), p_audience_value, 'event', v_id, p_starts_at, null
    );
  end if;
  return v_id;
end $$;

create or replace function public.v2_upsert_club_event_notify(
  organization_id uuid, event_id uuid, title text, starts_at timestamptz,
  event_type text default 'event', location text default null, status text default 'scheduled',
  rival text default null, jersey text default null, notes text default null,
  notify boolean default false, audience_type text default 'club', audience_value text default null
) returns uuid language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_upsert_club_event_notify(organization_id,event_id,title,starts_at,event_type,location,status,rival,jersey,notes,notify,audience_type,audience_value) $$;

revoke all on function public.v2_upsert_club_event_notify(uuid,uuid,text,timestamptz,text,text,text,text,text,text,boolean,text,text) from public, anon;
grant execute on function public.v2_upsert_club_event_notify(uuid,uuid,text,timestamptz,text,text,text,text,text,text,boolean,text,text) to authenticated;
;
