create or replace function private.query_entity_focus(p_organization_id uuid,p_entity_id uuid)
returns table(entity_type text,entity_id uuid,title text,module_code text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return query
  select * from (
    select 'player'::text,p.id,concat_ws(' ',p.first_name,p.last_name)::text,'jugadores'::text from app.players p where p.id=p_entity_id and p.organization_id=p_organization_id and p.archived_at is null and (private.has_module_access(p_organization_id,'jugadores',false) or private.has_module_access(p_organization_id,'cobranza',false))
    union all
    select 'prospect',p.id,concat_ws(' ',p.first_name,p.last_name),'prospectos' from app.prospects p where p.id=p_entity_id and p.organization_id=p_organization_id and p.archived_at is null and (private.has_module_access(p_organization_id,'prospectos',false) or private.has_module_access(p_organization_id,'scouting',false))
    union all
    select 'order',o.id,'Pedido '||coalesce(o.folio,o.legacy_folio,o.id::text),'tienda' from app.orders o where o.id=p_entity_id and o.organization_id=p_organization_id and (private.has_module_access(p_organization_id,'tienda',false) or private.has_module_access(p_organization_id,'taquilla',false))
    union all
    select 'sponsor',s.id,s.name,'patrocinadores' from app.sponsors s where s.id=p_entity_id and s.organization_id=p_organization_id and s.archived_at is null and private.has_module_access(p_organization_id,'patrocinadores',false)
    union all
    select 'program',p.id,p.name,'cursosVerano' from app.programs p where p.id=p_entity_id and p.organization_id=p_organization_id and p.archived_at is null and private.has_module_access(p_organization_id,'cursosVerano',false)
    union all
    select 'event',e.id,e.title,'calendario' from app.club_events e where e.id=p_entity_id and e.organization_id=p_organization_id and e.archived_at is null and (private.has_module_access(p_organization_id,'calendario',false) or private.has_module_access(p_organization_id,'callups',false) or private.has_module_access(p_organization_id,'convocatoria',false))
    union all
    select 'match',m.id,'vs '||m.opponent,'calendario' from app.matches m where m.id=p_entity_id and m.organization_id=p_organization_id and m.archived_at is null and (private.has_module_access(p_organization_id,'calendario',false) or private.has_module_access(p_organization_id,'callups',false) or private.has_module_access(p_organization_id,'convocatoria',false))
    union all
    select 'academy',a.id,a.name,'academias' from app.academies a where a.id=p_entity_id and a.organization_id=p_organization_id and a.archived_at is null and private.has_module_access(p_organization_id,'academias',false)
  ) x
  limit 1;
end
$$;

create or replace function public.v2_entity_focus(organization_id uuid,entity_id uuid)
returns table(entity_type text,entity_id uuid,title text,module_code text)
language sql
stable
security definer
set search_path to 'pg_catalog','private'
as $$select * from private.query_entity_focus(organization_id,entity_id)$$;

revoke all on function public.v2_entity_focus(uuid,uuid) from public,anon;
grant execute on function public.v2_entity_focus(uuid,uuid) to authenticated;
comment on function public.v2_entity_focus(uuid,uuid) is 'Permission-aware entity label resolver used for safe deep-link focusing in TannerOS V2.';;
