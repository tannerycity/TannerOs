-- h38 · Banco de ideas: guardar una idea nueva (22/10/2026).
--
-- En h37 la posición de la idea nueva salía de una subconsulta con columnas
-- sin calificar y PostgreSQL las confundía con los parámetros
-- (organization_id, status). Mismo cuerpo, con la subconsulta calificada.

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
      coalesce((select min(x.position) - 1 from app.ideas x where x.organization_id = v2_save_idea.organization_id and x.status = v_status), 0),
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
revoke all on function public.v2_save_idea(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_idea(uuid, jsonb) to authenticated;
