create or replace function private.query_global_search(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table(
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  href text,
  module_code text,
  score integer
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  q text;
  lim integer := least(greatest(coalesce(p_limit,12),1),20);
  can_players boolean;
  can_prospects boolean;
  can_orders boolean;
  can_sponsors boolean;
  can_programs boolean;
  can_calendar boolean;
  can_academies boolean;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  q := lower(translate(trim(coalesce(p_query,'')),'áéíóúüñ','aeiouun'));
  if length(q) < 2 then return; end if;

  can_players := private.has_module_access(p_organization_id,'jugadores',false) or private.has_module_access(p_organization_id,'cobranza',false);
  can_prospects := private.has_module_access(p_organization_id,'prospectos',false) or private.has_module_access(p_organization_id,'scouting',false);
  can_orders := private.has_module_access(p_organization_id,'tienda',false) or private.has_module_access(p_organization_id,'taquilla',false);
  can_sponsors := private.has_module_access(p_organization_id,'patrocinadores',false);
  can_programs := private.has_module_access(p_organization_id,'cursosVerano',false);
  can_calendar := private.has_module_access(p_organization_id,'calendario',false) or private.has_module_access(p_organization_id,'callups',false) or private.has_module_access(p_organization_id,'convocatoria',false);
  can_academies := private.has_module_access(p_organization_id,'academias',false);

  return query
  with candidates(entity_type,entity_id,title,subtitle,href,module_code,score) as (
    select 'player'::text,p.id,concat_ws(' ',p.first_name,p.last_name)::text,
      concat_ws(' · ','Jugador',nullif(p.category,''),nullif(p.position,''),nullif(p.code,''))::text,
      ('/v2/jugadores/?focus='||p.id::text)::text,'jugadores'::text,
      case when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun'))=q then 100 when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun')) like q||'%' then 92 when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun')) like '%'||q||'%' then 82 else 68 end
    from app.players p
    where can_players and p.organization_id=p_organization_id and p.archived_at is null and (
      lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun')) like '%'||q||'%'
      or lower(translate(coalesce(p.code,''),'áéíóúüñ','aeiouun')) like '%'||q||'%'
      or lower(translate(coalesce(p.category,''),'áéíóúüñ','aeiouun')) like '%'||q||'%'
      or lower(translate(coalesce(p.position,''),'áéíóúüñ','aeiouun')) like '%'||q||'%'
      or lower(translate(coalesce(p.school,''),'áéíóúüñ','aeiouun')) like '%'||q||'%'
      or coalesce(p.jersey_number,'') like '%'||q||'%'
      or exists (select 1 from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id and g.organization_id=pg.organization_id where pg.organization_id=p_organization_id and pg.player_id=p.id and lower(translate(concat_ws(' ',g.first_name,g.last_name,g.phone,g.email),'áéíóúüñ','aeiouun')) like '%'||q||'%')
    )
    union all
    select 'prospect'::text,p.id,concat_ws(' ',p.first_name,p.last_name)::text,
      concat_ws(' · ','Prospecto',nullif(p.registration_type,''),nullif(p.category_interest,''),nullif(p.status,''))::text,
      ('/v2/prospectos/?focus='||p.id::text)::text,'prospectos'::text,
      case when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun'))=q then 98 when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun')) like q||'%' then 90 when lower(translate(concat_ws(' ',p.first_name,p.last_name),'áéíóúüñ','aeiouun')) like '%'||q||'%' then 80 else 66 end
    from app.prospects p
    where can_prospects and p.organization_id=p_organization_id and p.archived_at is null and lower(translate(concat_ws(' ',p.first_name,p.last_name,p.phone,p.email,p.guardian_name,p.school_name,p.source,p.source_channel,p.source_campaign,p.registration_type,p.category_interest),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'order'::text,o.id,('Pedido '||coalesce(o.folio,o.legacy_folio,o.id::text))::text,
      concat_ws(' · ',nullif(o.customer_name,''),nullif(o.status,''),case when o.total is not null then '$'||trim(to_char(o.total,'FM999G999G990D00')) end)::text,
      ('/v2/pedidos/?focus='||o.id::text)::text,'tienda'::text,
      case when lower(translate(coalesce(o.folio,o.legacy_folio,''),'áéíóúüñ','aeiouun'))=q then 96 when lower(translate(coalesce(o.folio,o.legacy_folio,''),'áéíóúüñ','aeiouun')) like '%'||q||'%' then 86 else 64 end
    from app.orders o
    where can_orders and o.organization_id=p_organization_id and lower(translate(concat_ws(' ',o.folio,o.legacy_folio,o.customer_name,o.customer_phone,o.customer_email,o.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'sponsor'::text,s.id,s.name::text,concat_ws(' · ','Patrocinador',nullif(s.contact_name,''),nullif(s.stage,''),nullif(s.status,''))::text,
      ('/v2/patrocinadores/?focus='||s.id::text)::text,'patrocinadores'::text,
      case when lower(translate(s.name,'áéíóúüñ','aeiouun'))=q then 95 when lower(translate(s.name,'áéíóúüñ','aeiouun')) like q||'%' then 87 else 65 end
    from app.sponsors s
    where can_sponsors and s.organization_id=p_organization_id and s.archived_at is null and lower(translate(concat_ws(' ',s.name,s.contact_name,s.phone,s.email,s.stage,s.tier,s.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'program'::text,p.id,p.name::text,concat_ws(' · ','Programa',nullif(p.category_label,''),nullif(p.location,''),nullif(p.status,''))::text,
      ('/v2/programas/?focus='||p.id::text)::text,'cursosVerano'::text,
      case when lower(translate(p.name,'áéíóúüñ','aeiouun'))=q then 94 when lower(translate(p.name,'áéíóúüñ','aeiouun')) like q||'%' then 86 else 63 end
    from app.programs p
    where can_programs and p.organization_id=p_organization_id and p.archived_at is null and lower(translate(concat_ws(' ',p.name,p.slug,p.program_type,p.category_label,p.location,p.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'event'::text,e.id,e.title::text,concat_ws(' · ','Evento',nullif(e.event_type,''),nullif(e.location,''),to_char(e.starts_at,'DD/MM/YYYY HH24:MI'))::text,
      ('/v2/calendario/?focus='||e.id::text)::text,'calendario'::text,
      case when lower(translate(e.title,'áéíóúüñ','aeiouun'))=q then 93 when lower(translate(e.title,'áéíóúüñ','aeiouun')) like q||'%' then 85 else 62 end
    from app.club_events e
    where can_calendar and e.organization_id=p_organization_id and e.archived_at is null and lower(translate(concat_ws(' ',e.title,e.event_type,e.location,e.rival,e.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'match'::text,m.id,('vs '||m.opponent)::text,concat_ws(' · ','Partido',nullif(m.category,''),nullif(m.tournament,''),to_char(m.match_date,'DD/MM/YYYY'),nullif(m.result,''))::text,
      ('/v2/deportivo/?focus='||m.id::text)::text,'calendario'::text,
      case when lower(translate(m.opponent,'áéíóúüñ','aeiouun'))=q then 91 when lower(translate(m.opponent,'áéíóúüñ','aeiouun')) like q||'%' then 83 else 61 end
    from app.matches m
    where can_calendar and m.organization_id=p_organization_id and m.archived_at is null and lower(translate(concat_ws(' ',m.opponent,m.category,m.tournament,m.phase,m.location,m.result,m.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
    union all
    select 'academy'::text,a.id,a.name::text,concat_ws(' · ','Academia',nullif(a.academy_type,''),nullif(a.location,''),nullif(a.status,''))::text,
      ('/v2/academias/?focus='||a.id::text)::text,'academias'::text,
      case when lower(translate(a.name,'áéíóúüñ','aeiouun'))=q then 90 when lower(translate(a.name,'áéíóúüñ','aeiouun')) like q||'%' then 82 else 60 end
    from app.academies a
    where can_academies and a.organization_id=p_organization_id and a.archived_at is null and lower(translate(concat_ws(' ',a.name,a.slug,a.academy_type,a.location,a.status),'áéíóúüñ','aeiouun')) like '%'||q||'%'
  )
  select c.entity_type,c.entity_id,c.title,c.subtitle,c.href,c.module_code,c.score from candidates c where nullif(trim(c.title),'') is not null order by c.score desc,c.title limit lim;
end
$$;;
