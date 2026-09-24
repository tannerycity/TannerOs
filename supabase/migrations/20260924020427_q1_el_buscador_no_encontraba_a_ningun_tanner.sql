-- Q1 · El buscador no encontraba a NINGUN Tanner
--
-- SINTOMA REPORTADO
-- Buscar "damian" devolvia "Damián armando Ortega oliva · Prospecto · Ya
-- inscrito" y mandaba a Prospectos, aunque Damian es Tanner activo de T10 con
-- dorsal 2. Lo mismo con "Gil" y Gilberto Munoz Barrera.
--
-- LA CAUSA NO ERA LA DEDUPLICACION
-- v2_search_index lleva semanas devolviendo un error en vez de datos:
--
--   42702 column reference "organization_id" is ambiguous
--
-- El parametro se llama `organization_id` y la tabla app.players tiene una
-- columna con ese mismo nombre, asi que en
--
--   where p.organization_id = organization_id
--
-- plpgsql no sabe si el lado derecho es el parametro o la columna, y el default
-- de #variable_conflict es 'error'. La funcion truena SIEMPRE, para todos los
-- roles, desde que se escribio asi.
--
-- Es decir: el buscador nunca ha encontrado Tanners NI tutores. Lo que si salia
-- eran prospectos, utileria, patrocinadores y modulos, que vienen de otras
-- funciones. Por eso el prospecto ganaba: no competia con nadie.
--
-- POR QUE NADIE LO NOTO
-- En v2/shell.js, la carga de cada fuente tiene un catch que devuelve [] con el
-- comentario "una fuente caida no deja sin buscador a las demas". La intencion
-- es buena y se conserva, pero era MUDA: la fuente mas importante estaba
-- muerta y el buscador seguia viendose completo. Eso se arregla en el mismo
-- cambio, del lado de la pantalla.
--
-- EL ARREGLO
-- El parametro NO se puede renombrar: PostgREST llama por nombre y el front
-- manda {organization_id}. Se califica con el nombre de la funcion, que es la
-- forma explicita de decir "el parametro, no la columna".

create or replace function public.v2_search_index(organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v jsonb;
begin
  if not private.is_active_member(v2_search_index.organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'),'[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', p.id,
      'name', trim(concat_ws(' ', p.first_name, p.last_name)),
      'jersey', p.jersey_number,
      'pos', p.position,
      'guardians', (select string_agg(trim(concat_ws(' ', g.first_name, g.last_name)), ', ')
                    from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                    where pg.player_id=p.id),
      'phones', (select string_agg(g.phone, ' ')
                 from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                 where pg.player_id=p.id and nullif(trim(g.phone),'') is not null)
    ) as x
    from app.players p
    -- `v2_search_index.organization_id` es el PARAMETRO. Sin calificar, esto
    -- era ambiguo contra p.organization_id y tumbaba la funcion entera.
    where p.organization_id = v2_search_index.organization_id
      and p.archived_at is null and p.status='active'
  ) t;
  return v;
end $function$;

revoke all on function public.v2_search_index(uuid) from public, anon;
grant execute on function public.v2_search_index(uuid) to authenticated;

-- No basta con que compile: compilaba antes y no servia. Esta guarda LLAMA a la
-- funcion como un usuario real y exige que devuelva Tanners. Si alguien vuelve
-- a romperla, la migracion no pasa.
do $$
declare v_org uuid; v_uid uuid; r jsonb; n int; hay_damian boolean;
begin
  select m.organization_id, m.user_id into v_org, v_uid
    from public.organization_memberships m
    join public.profiles pr on pr.user_id=m.user_id and pr.active
   where m.active and m.role='Presidencia' limit 1;
  if v_uid is null then raise notice 'Q1 · sin usuario para verificar, se omite la prueba'; return; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',v_uid::text,'role','authenticated')::text, true);
  r := public.v2_search_index(v_org);
  n := jsonb_array_length(r);
  select exists(select 1 from jsonb_array_elements(r) x
                where lower(x->>'name') like '%ortega oliva%') into hay_damian;

  if n = 0 then raise exception 'Q1 · el indice sigue vacio'; end if;
  if not hay_damian then raise exception 'Q1 · el indice no trae a Damian, que es Tanner activo'; end if;
  raise notice 'Q1 · el buscador ya indexa % Tanners', n;
end $$;
