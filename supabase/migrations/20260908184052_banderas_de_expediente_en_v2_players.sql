-- Filtros de Presidencia para cerrar expedientes. Se AGREGAN columnas al final;
-- las existentes conservan nombre y orden (renombrar status a status_value ya
-- rompió la pantalla una vez).
--   has_guardian_email: sin correo de tutor no hay portal de familias.
--   benefit_active / benefit_source: quiénes son becados y quién los apoya.
--   docs_missing: cuántos documentos del checklist faltan; sin filas cuenta como
--   todos faltantes, que es justo el caso de quien nunca se capturó.
drop function if exists public.v2_players(uuid, text);
drop function if exists private.query_players(uuid, text);

create function private.query_players(p_organization_id uuid, p_status text default null)
returns table(id uuid, code text, first_name text, last_name text, birth_date date,
  status text, status_value text, category text, player_position text, jersey_number text,
  photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text,
  sex text, school text,
  has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_docs_requeridos integer;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select count(distinct document_type) into v_docs_requeridos
  from app.player_document_status where organization_id=p_organization_id;
  v_docs_requeridos := coalesce(v_docs_requeridos,0);

  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,
         p.status,p.status,p.category,p.position,p.jersey_number,
         p.photo_path,p.photo_thumb_path,p.photo_bucket,
         bp.base_monthly_fee,bp.status,bp.needs_review,bp.review_reason,p.sex,p.school,
         exists(select 1 from app.player_guardians pg
                join app.guardians g on g.id=pg.guardian_id
                where pg.player_id=p.id and nullif(trim(g.email),'') is not null),
         exists(select 1 from app.player_benefits b
                where b.player_id=p.id and b.organization_id=p.organization_id and b.active
                  and (b.ends_on is null or b.ends_on>=current_date)),
         (select nullif(trim(b.funding_source_name),'') from app.player_benefits b
           where b.player_id=p.id and b.organization_id=p.organization_id and b.active
             and (b.ends_on is null or b.ends_on>=current_date)
           order by b.priority nulls last, b.starts_on desc limit 1),
         greatest(0, v_docs_requeridos - (
           select count(*)::int from app.player_document_status d
           where d.player_id=p.id and d.organization_id=p.organization_id and d.received))
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end $function$;

revoke all on function private.query_players(uuid,text) from public, anon, authenticated;

create function public.v2_players(organization_id uuid, status_filter text default null)
returns table(id uuid, code text, first_name text, last_name text, birth_date date,
  status text, status_value text, category text, player_position text, jersey_number text,
  photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text,
  sex text, school text,
  has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer)
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select * from private.query_players(organization_id,status_filter) $function$;

revoke all on function public.v2_players(uuid,text) from public, anon;
grant execute on function public.v2_players(uuid,text) to authenticated;;
