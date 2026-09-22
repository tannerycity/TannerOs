-- query_players ya no devuelve el club entero a quien no lo administra.
--
-- El filtro va por la inscripción viva (player_enrollments.category_id), no por
-- players.category, que es texto denormalizado y puede quedar desfasado. Hoy
-- coinciden los 66, pero el candado no debe depender de que sigan coincidiendo.
--
-- Un profe SIN categorías asignadas no ve a nadie. Es a propósito: el default
-- de un candado es cerrado, y así Presidencia se entera de que falta asignarlo.
create or replace function private.query_players(p_organization_id uuid, p_status text default null::text)
returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text,
  status_value text, category text, player_position text, jersey_number text, photo_path text,
  photo_thumb_path text, photo_bucket text, base_monthly_fee numeric, billing_status text,
  needs_review boolean, review_reason text, sex text, school text, has_guardian_email boolean,
  benefit_active boolean, benefit_source text, docs_missing integer, data_consent boolean,
  image_consent boolean, benefit_type text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_docs_requeridos integer; v_dinero boolean; v_admin boolean;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  v_dinero := private.can_see_player_money(p_organization_id);
  v_admin  := private.is_player_admin(p_organization_id);
  select count(distinct document_type) into v_docs_requeridos
  from app.player_document_status where organization_id=p_organization_id;
  v_docs_requeridos := coalesce(v_docs_requeridos,0);

  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,
         p.status,p.status,p.category,p.position,p.jersey_number,
         p.photo_path,p.photo_thumb_path,p.photo_bucket,
         -- Los seis campos de dinero llegan vacíos a quien no lleva el dinero.
         case when v_dinero then bp.base_monthly_fee end,
         case when v_dinero then bp.status end,
         case when v_dinero then bp.needs_review else false end,
         case when v_dinero then bp.review_reason end,
         p.sex,p.school,
         exists(select 1 from app.player_guardians pg
                join app.guardians g on g.id=pg.guardian_id
                where pg.player_id=p.id and nullif(trim(g.email),'') is not null),
         case when v_dinero then exists(select 1 from app.player_benefits b
                where b.player_id=p.id and b.organization_id=p.organization_id and b.active
                  and (b.ends_on is null or b.ends_on>=current_date)) else false end,
         case when v_dinero then
           (select nullif(trim(b.funding_source_name),'') from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end,
         greatest(0, v_docs_requeridos - (
           select count(*)::int from app.player_document_status d
           where d.player_id=p.id and d.organization_id=p.organization_id and d.received)),
         coalesce(p.data_consent,false),
         coalesce(p.image_consent,false),
         case when v_dinero then
           (select b.benefit_type from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null
    and (p_status is null or p.status=p_status)
    and (v_admin or exists(
          select 1 from app.player_enrollments pe
          where pe.organization_id=p.organization_id and pe.player_id=p.id
            and pe.status='active'
            and pe.category_id in (select private.my_category_ids(p_organization_id))))
  order by p.first_name,p.last_name,p.id;
end $function$;

revoke all on function private.query_players(uuid,text) from public, anon, authenticated;
;
