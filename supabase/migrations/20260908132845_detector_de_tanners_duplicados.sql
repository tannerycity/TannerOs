-- Un Tanner con dos expedientes es la forma en que un "ya lo dimos de baja" se
-- vuelve "sigue apareciendo en la lista": se retira un expediente y el gemelo
-- sigue activo en la plantilla. Esto lo detecta antes de que lo note un profe.
create or replace function private.query_player_duplicates(p_organization_id uuid)
returns table(normalized_name text, player_count bigint, players jsonb)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id,array['players','qa','admin'],false) then
    raise exception 'Not authorized';
  end if;
  return query
  with base as (
    select p.id,p.code,p.status,p.archived_at,p.withdrawn_at,p.category,p.birth_date,p.created_at,
           lower(regexp_replace(trim(concat_ws(' ',p.first_name,p.last_name)),'\s+',' ','g')) as nombre
    from app.players p
    where p.organization_id=p_organization_id
      and nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'') is not null
  ), grouped as (
    select nombre,count(*) as n,
           count(*) filter (where status='active' and archived_at is null) as visibles
    from base group by nombre
  )
  select g.nombre,g.n,
         (select jsonb_agg(jsonb_build_object(
            'playerId',b.id,'code',b.code,'status',b.status,
            'archived',(b.archived_at is not null),'withdrawnAt',b.withdrawn_at,
            'category',b.category,'birthDate',b.birth_date,'createdAt',b.created_at,
            'activeEnrollments',(select count(*) from app.player_enrollments pe where pe.player_id=b.id and pe.status='active'),
            'attendanceRecords',(select count(*) from app.attendance_records ar where ar.player_id=b.id),
            'lastAttendance',(select max(s.starts_at)::date from app.attendance_records ar join app.sessions s on s.id=ar.session_id where ar.player_id=b.id),
            'charges',(select count(*) from app.charges ch where ch.player_id=b.id),
            'guardians',(select count(*) from app.player_guardians pg where pg.player_id=b.id)
          ) order by b.created_at)
          from base b where b.nombre=g.nombre)
  from grouped g
  -- Solo importa si al menos un expediente sigue visible en plantillas y listas.
  where g.n>1 and g.visibles>0
  order by g.n desc,g.nombre;
end $function$;

revoke all on function private.query_player_duplicates(uuid) from public, anon, authenticated;

create or replace function public.v2_player_duplicates(organization_id uuid)
returns table(normalized_name text, player_count bigint, players jsonb)
language sql security definer
set search_path to 'pg_catalog','private'
as $function$ select * from private.query_player_duplicates(organization_id) $function$;

revoke all on function public.v2_player_duplicates(uuid) from public, anon;
grant execute on function public.v2_player_duplicates(uuid) to authenticated;;
