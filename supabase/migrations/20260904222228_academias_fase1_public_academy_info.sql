create or replace function private.public_academy_info(p_public_key text, p_slug text)
returns jsonb
language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_org uuid; r app.academies%rowtype;
begin
  perform private.enforce_public_rate_limit('academy_info',60,interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'academias') then raise exception 'Not available'; end if;
  select * into r from app.academies
   where organization_id=v_org and slug=p_slug and status='active' and archived_at is null;
  if not found then raise exception 'Academy not found'; end if;
  return jsonb_build_object(
    'slug',r.slug,'name',r.name,'academyType',r.academy_type,'description',r.description,
    'monthlyFee',r.monthly_fee,'location',r.location,
    'availableSpots',case when r.capacity<=0 then null else greatest(0,r.capacity-(select count(*)::int from app.academy_enrollments e where e.organization_id=r.organization_id and e.academy_id=r.id and e.status='active')) end
  );
end;
$$;

create or replace function public.v2_public_academy_info(club_key text, slug text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.public_academy_info(club_key,slug) $$;

grant execute on function public.v2_public_academy_info(text,text) to anon, authenticated;
;
