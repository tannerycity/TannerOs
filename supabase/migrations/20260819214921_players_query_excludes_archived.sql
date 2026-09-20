create or replace function private.query_players(p_organization_id uuid, p_status text default null)
returns table(id uuid,code text,first_name text,last_name text,birth_date date,status text,category text,player_position text,jersey_number text,photo_path text,base_monthly_fee numeric,billing_status text,needs_review boolean)
language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,p.status,p.category,p.position,p.jersey_number,p.photo_path,
         bp.base_monthly_fee,bp.status,bp.needs_review
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end $$;;
