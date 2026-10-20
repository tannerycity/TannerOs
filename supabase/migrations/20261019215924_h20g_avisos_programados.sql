/* ---------- Avisos: cuándo "salió" uno ----------
   Un aviso programado sale en starts_at; uno normal, en published_at. Todo lo
   que cuenta "nuevo" o "visto" compara contra esa hora, no contra la de captura. */
-- Los avisos personales iguales llegan juntos (d5): son varias filas, un aviso.
create or replace function private.aviso_hermanos(p_id uuid)
returns setof uuid language sql stable security definer set search_path to 'pg_catalog', 'app'
as $$
  select a.id from app.announcements a where a.id = p_id and a.audience_type <> 'user'
  union all
  select b.id from app.announcements a join app.announcements b
    on b.organization_id = a.organization_id and b.audience_type = 'user' and b.title = a.title
   and b.body is not distinct from a.body and b.source is not distinct from a.source
   and b.published_by is not distinct from a.published_by
   and b.starts_at is not distinct from a.starts_at
   and date_trunc('minute', b.published_at) = date_trunc('minute', a.published_at)
  where a.id = p_id and a.audience_type = 'user'
$$;

create or replace function private.aviso_puede_manejar(p_organization_id uuid, p_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
  select exists (select 1 from app.announcements a where a.id = p_id and a.organization_id = p_organization_id
                   and (a.published_by = auth.uid() or private.is_presidency(p_organization_id)))
$$;

create or replace function private.command_publish_announcement(p_organization_id uuid, p_title text, p_body text default null,
  p_audience_type text default 'club', p_audience_value text default null, p_source text default 'manual', p_source_id uuid default null,
  p_starts_at timestamptz default null, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_actor uuid; v_id uuid; v_programado boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['calendar','admin'], true) then raise exception 'Not authorized'; end if;
  if coalesce(nullif(trim(p_title),''),'') = '' then raise exception 'Title required'; end if;
  if p_audience_type not in ('club','role','user','familias','categoria') then raise exception 'Invalid audience'; end if;
  if p_audience_type = 'categoria' and coalesce(nullif(trim(p_audience_value),''),'') = '' then raise exception 'Elige la categoría'; end if;
  -- Programado (h20): sale a su hora y el push lo manda el reloj del club.
  v_programado := p_starts_at is not null and p_starts_at > now() + interval '1 minute';
  if v_programado and p_starts_at > now() + interval '60 days' then raise exception 'Se puede programar hasta 60 días antes'; end if;
  insert into app.announcements(organization_id,title,body,source,source_id,audience_type,audience_value,starts_at,expires_at,published_by,push_pending)
  values (p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), coalesce(p_source,'manual'), p_source_id, p_audience_type,
          case when p_audience_type = 'familias' then null else p_audience_value end,
          case when v_programado then p_starts_at end, p_expires_at, v_actor, v_programado)
  returning id into v_id;
  if not v_programado then
    perform private.notify_push(p_organization_id, trim(p_title), nullif(trim(coalesce(p_body,'')),''), p_audience_type, p_audience_value,
            case when p_audience_type in ('familias','categoria') then '/familias/' else '/' end);
  end if;
  return v_id;
end $$;

-- Cada 5 minutos: los avisos programados que ya salieron mandan su push.
create or replace function private.avisos_programados_push()
returns integer language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
declare r record; n integer := 0;
begin
  for r in
    update app.announcements set push_pending = false
    where push_pending and starts_at <= now() and archived_at is null
    returning organization_id, title, body, audience_type, audience_value
  loop
    perform private.notify_push(r.organization_id, r.title, r.body, r.audience_type, r.audience_value,
            case when r.audience_type in ('familias','categoria') then '/familias/' else '/' end);
    n := n + 1;
  end loop;
  return n;
end $$;
