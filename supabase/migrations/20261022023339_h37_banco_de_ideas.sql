-- h37 · Banco de ideas: tablero tipo Notion para darle seguimiento (22/10/2026).
--
-- Presidencia: "una parte de marketing donde venga lo de patrocinadores y
-- también vamos a crear un banco de ideas tipo Notion, estilo kanban, para
-- darle seguimiento a tareas". Cada idea es una tarjeta con su columna
-- (Ideas, Por hacer, En proceso, Hecho), área, responsable, fecha, prioridad,
-- notas y lista de pendientes. La ve y la mueve todo el staff del club (no las
-- cuentas de familia). Archivar la puede quien la creó, su responsable o
-- Presidencia; nada se borra.

create table app.ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  notes text check (notes is null or length(notes) <= 8000),
  status text not null default 'idea' check (status in ('idea', 'todo', 'doing', 'done', 'archived')),
  area text check (area is null or length(area) <= 40),
  priority text not null default 'media' check (priority in ('alta', 'media', 'baja')),
  owner_user_id uuid,
  due_date date,
  checklist jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index ideas_org_status on app.ideas(organization_id, status, position);
alter table app.ideas enable row level security;
revoke all on table app.ideas from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.ideas
  for each row execute function private.guard_club_read_only();

-- Staff activo del club: las cuentas de familia no entran.
create or replace function private.puede_ideas(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_active_member(p_organization_id) and not exists (
    select 1 from public.organization_memberships m where m.organization_id = p_organization_id
       and m.user_id = (select auth.uid()) and m.active and m.role = 'Tanner')
$$;
revoke all on function private.puede_ideas(uuid) from public, anon, authenticated;

create or replace function private.idea_json(i app.ideas)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select jsonb_build_object('id', i.id, 'title', i.title, 'notes', i.notes, 'status', i.status, 'area', i.area,
    'priority', i.priority, 'ownerId', i.owner_user_id, 'ownerName', case when i.owner_user_id is not null then private.chat_name(i.owner_user_id) end,
    'dueDate', i.due_date, 'checklist', i.checklist, 'position', i.position, 'createdBy', i.created_by, 'createdByName', i.created_by_name,
    'createdAt', i.created_at, 'updatedAt', i.updated_at, 'doneAt', i.done_at)
$$;
revoke all on function private.idea_json(app.ideas) from public, anon, authenticated;

create or replace function public.v2_ideas(organization_id uuid, include_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private' as $$
begin
  if not private.puede_ideas(organization_id) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'me', (select auth.uid()),
    'isPresidency', private.is_presidency(organization_id),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', private.chat_name(m.user_id), 'role', m.role) order by private.chat_name(m.user_id))
      from public.organization_memberships m where m.organization_id = v2_ideas.organization_id and m.active and m.role <> 'Tanner'), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(private.idea_json(i) order by i.status, i.position, i.created_at)
      from app.ideas i where i.organization_id = v2_ideas.organization_id and (include_archived or i.status <> 'archived')), '[]'::jsonb));
end $$;

create or replace function public.v2_save_idea(organization_id uuid, idea jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private' as $$
declare v_id uuid := nullif(idea->>'id', '')::uuid; v_row app.ideas; v_status text := coalesce(nullif(idea->>'status', ''), 'idea');
  v_owner uuid := nullif(idea->>'ownerId', '')::uuid; v_check jsonb := coalesce(idea->'checklist', '[]'::jsonb);
begin
  if not private.puede_ideas(organization_id) then raise exception 'Not authorized'; end if;
  if coalesce(length(btrim(idea->>'title')), 0) = 0 then raise exception 'Ponle un título a la idea'; end if;
  if v_status not in ('idea', 'todo', 'doing', 'done') then raise exception 'Columna no válida'; end if;
  if jsonb_typeof(v_check) <> 'array' or jsonb_array_length(v_check) > 50 then raise exception 'La lista de pendientes no es válida'; end if;
  if v_owner is not null and not exists (select 1 from public.organization_memberships m where m.organization_id = v2_save_idea.organization_id
       and m.user_id = v_owner and m.active and m.role <> 'Tanner') then raise exception 'El responsable no es del staff'; end if;
  if v_id is null then
    insert into app.ideas(organization_id, title, notes, status, area, priority, owner_user_id, due_date, checklist, position, created_by, created_by_name, done_at)
    values (v2_save_idea.organization_id, btrim(idea->>'title'), nullif(btrim(idea->>'notes'), ''), v_status, nullif(btrim(idea->>'area'), ''),
      coalesce(nullif(idea->>'priority', ''), 'media'), v_owner, nullif(idea->>'dueDate', '')::date, v_check,
      coalesce((select min(position) - 1 from app.ideas where organization_id = v2_save_idea.organization_id and status = v_status), 0),
      (select auth.uid()), private.nombre_actor(), case when v_status = 'done' then now() end)
    returning * into v_row;
  else
    update app.ideas i set title = btrim(idea->>'title'), notes = nullif(btrim(idea->>'notes'), ''), status = v_status,
      area = nullif(btrim(idea->>'area'), ''), priority = coalesce(nullif(idea->>'priority', ''), 'media'), owner_user_id = v_owner,
      due_date = nullif(idea->>'dueDate', '')::date, checklist = v_check, updated_at = now(),
      done_at = case when v_status = 'done' then coalesce(i.done_at, now()) end
     where i.id = v_id and i.organization_id = v2_save_idea.organization_id and i.status <> 'archived'
    returning * into v_row;
    if v_row.id is null then raise exception 'Esa idea ya no existe'; end if;
  end if;
  return private.idea_json(v_row);
end $$;

create or replace function public.v2_move_idea(organization_id uuid, idea_id uuid, status text, pos double precision)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private' as $$
declare v_row app.ideas;
begin
  if not private.puede_ideas(organization_id) then raise exception 'Not authorized'; end if;
  if v2_move_idea.status not in ('idea', 'todo', 'doing', 'done') then raise exception 'Columna no válida'; end if;
  update app.ideas i set status = v2_move_idea.status, position = coalesce(v2_move_idea.pos, i.position), updated_at = now(),
    done_at = case when v2_move_idea.status = 'done' then coalesce(i.done_at, now()) end
   where i.id = idea_id and i.organization_id = v2_move_idea.organization_id and i.status <> 'archived'
  returning * into v_row;
  if v_row.id is null then raise exception 'Esa idea ya no existe'; end if;
  return private.idea_json(v_row);
end $$;

create or replace function public.v2_archive_idea(organization_id uuid, idea_id uuid, archived boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private' as $$
declare v_row app.ideas;
begin
  if not private.puede_ideas(organization_id) then raise exception 'Not authorized'; end if;
  select * into v_row from app.ideas i where i.id = idea_id and i.organization_id = v2_archive_idea.organization_id;
  if v_row.id is null then raise exception 'Esa idea ya no existe'; end if;
  if not (v_row.created_by = (select auth.uid()) or v_row.owner_user_id = (select auth.uid()) or private.is_presidency(organization_id)) then
    raise exception 'Sólo quien la creó, su responsable o Presidencia la archiva';
  end if;
  update app.ideas i set status = case when archived then 'archived' else 'idea' end, updated_at = now()
   where i.id = v_row.id returning * into v_row;
  return private.idea_json(v_row);
end $$;

revoke all on function public.v2_ideas(uuid, boolean) from public, anon;
grant execute on function public.v2_ideas(uuid, boolean) to authenticated;
revoke all on function public.v2_save_idea(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_idea(uuid, jsonb) to authenticated;
revoke all on function public.v2_move_idea(uuid, uuid, text, double precision) from public, anon;
grant execute on function public.v2_move_idea(uuid, uuid, text, double precision) to authenticated;
revoke all on function public.v2_archive_idea(uuid, uuid, boolean) from public, anon;
grant execute on function public.v2_archive_idea(uuid, uuid, boolean) to authenticated;
