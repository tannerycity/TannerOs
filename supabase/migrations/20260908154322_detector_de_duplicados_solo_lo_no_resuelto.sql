-- La primera versión marcaba cualquier nombre repetido con un expediente vivo, así que
-- seguía gritando después de consolidar. Ahora solo marca lo que todavía requiere una
-- decisión: un gemelo sin cerrar formalmente, o un gemelo cerrado que aún carga datos
-- (tutores, asistencias, cargos o pagos) que deberían haberse movido.
drop function if exists public.v2_player_duplicates(uuid);
drop function if exists private.query_player_duplicates(uuid);

create function private.query_player_duplicates(p_organization_id uuid)
returns table(normalized_name text, player_count bigint, reason text, players jsonb)
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
           lower(regexp_replace(trim(concat_ws(' ',p.first_name,p.last_name)),'\s+',' ','g')) as nombre,
           (p.status='active' and p.archived_at is null) as vivo,
           (select count(*) from app.player_guardians g where g.player_id=p.id) as tutores,
           (select count(*) from app.attendance_records ar where ar.player_id=p.id) as asistencias,
           (select count(*) from app.charges ch where ch.player_id=p.id) as cargos,
           (select count(*) from app.payments pay where pay.player_id=p.id) as pagos
    from app.players p
    where p.organization_id=p_organization_id
      and nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'') is not null
  ), grouped as (
    select nombre,count(*) as n,
           count(*) filter (where vivo) as vivos,
           count(*) filter (where not vivo and status<>'withdrawn') as sin_cerrar,
           count(*) filter (where not vivo and (tutores+asistencias+cargos+pagos)>0) as con_datos_sueltos
    from base group by nombre
  )
  select g.nombre,g.n,
         case
           when g.vivos>1 then 'Dos o más expedientes activos al mismo tiempo'
           when g.sin_cerrar>0 then 'Expediente gemelo sin baja formal: puede reaparecer en listas'
           else 'Expediente gemelo retirado que todavía carga datos por consolidar'
         end,
         (select jsonb_agg(jsonb_build_object(
            'playerId',b.id,'code',b.code,'status',b.status,
            'archived',(b.archived_at is not null),'withdrawnAt',b.withdrawn_at,
            'category',b.category,'birthDate',b.birth_date,'createdAt',b.created_at,
            'activeEnrollments',(select count(*) from app.player_enrollments pe where pe.player_id=b.id and pe.status='active'),
            'attendanceRecords',b.asistencias,
            'lastAttendance',(select max(s.starts_at)::date from app.attendance_records ar join app.sessions s on s.id=ar.session_id where ar.player_id=b.id),
            'charges',b.cargos,'payments',b.pagos,'guardians',b.tutores
          ) order by b.created_at)
          from base b where b.nombre=g.nombre)
  from grouped g
  where g.n>1 and g.vivos>0
    and (g.vivos>1 or g.sin_cerrar>0 or g.con_datos_sueltos>0)
  order by g.n desc,g.nombre;
end $function$;

revoke all on function private.query_player_duplicates(uuid) from public, anon, authenticated;

create function public.v2_player_duplicates(organization_id uuid)
returns table(normalized_name text, player_count bigint, reason text, players jsonb)
language sql security definer
set search_path to 'pg_catalog','private'
as $function$ select * from private.query_player_duplicates(organization_id) $function$;

revoke all on function public.v2_player_duplicates(uuid) from public, anon;
grant execute on function public.v2_player_duplicates(uuid) to authenticated;;
