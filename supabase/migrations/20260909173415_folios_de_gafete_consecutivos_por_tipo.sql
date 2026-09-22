-- Los folios se tecleaban a mano y ya se nota: hay un T101 y un T1012, que ni
-- se ordenan ni se distinguen entre sí. Con 60 familias eso es un padrón que
-- no se puede auditar.
--
-- Ahora los genera el sistema: TC001 para el gafete Tanner, VIP001 para el VIP.
-- Consecutivos POR TEMPORADA, que es como ya estaba pensado el candado de
-- unicidad (organization_id, season, folio): los gafetes se reponen cada año y
-- el año ya va impreso en el pase, así que no tiene sentido arrastrar el número.
--
-- Tres dígitos para los dos, no dos para el VIP: un padrón que se rompe al
-- llegar a 100 no sirve.
create or replace function app.next_parking_folio(
  p_organization_id uuid, p_season int, p_pass_type text)
returns text
language plpgsql volatile
set search_path to 'pg_catalog','app'
as $function$
declare v_prefijo text; v_n int;
begin
  v_prefijo := case when lower(coalesce(p_pass_type,'')) = 'vip' then 'VIP' else 'TC' end;
  -- Dos personas aprobando gafetes al mismo tiempo se formarían aquí en vez de
  -- pelearse por el mismo número.
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text||':'||p_season::text||':'||v_prefijo));
  select coalesce(max(substring(folio from '^'||v_prefijo||'(\d+)$')::int), 0)
    into v_n
  from app.parking_passes
  where organization_id = p_organization_id
    and season = p_season
    and folio ~ ('^'||v_prefijo||'\d+$');
  return v_prefijo || lpad((v_n + 1)::text, 3, '0');
end $function$;

-- Los dos folios existentes se renumeran al esquema nuevo, en el orden en que
-- se crearon. Son de hoy y no hay gafete físico impreso todavía; dejarlos como
-- están sería empezar el padrón ya sucio.
with orden as (
  select id, row_number() over (order by created_at) as n
  from app.parking_passes
  where organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and season=2026
)
update app.parking_passes pp
   set folio='TC'||lpad(orden.n::text,3,'0'), updated_at=now()
  from orden
 where pp.id=orden.id;
;
