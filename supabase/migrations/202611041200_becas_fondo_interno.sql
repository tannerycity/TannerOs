-- BECAS: Fondo interno (sección 7 del protocolo maestro).
--
-- "Techo inicial: 10% del ingreso proyectado por mensualidades. Becas
-- financiadas por Curtibrother, patrocinadores o gobierno no cuentan en
-- este tope."
--
-- Ingreso proyectado = la cuota de LISTA de la categoría de cada Tanner
-- activo (app.categories.monthly_fee), no lo que paga ya con descuentos —
-- es "lo que el club cobraría si nadie tuviera beca", la base real para
-- un tope en %.
-- Fondo usado = lo que de verdad se deja de cobrar por becas que paga el
-- club mismo (scholarship_full / scholarship_partial): cuota de lista
-- menos lo que paga (app.billing_profiles.base_monthly_fee), por Tanner
-- con un beneficio interno activo. Curtibrother/patrocinio (sponsor_funded)
-- no entra: es dinero externo, no sale del fondo del club.

create or replace function private.scholarship_internal_fund(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare s app.scholarship_settings; v_proyectado numeric; v_usado numeric; v_cap_pct numeric; v_out jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into s from app.scholarship_settings where organization_id = p_organization_id;
  v_cap_pct := coalesce(s.internal_fund_cap_pct, 10);

  with activos as (
    select distinct on (pe.player_id) pe.player_id, c.monthly_fee as cuota_categoria
    from app.player_enrollments pe
    join app.categories c on c.id = pe.category_id
    join app.players p on p.id = pe.player_id and p.organization_id = p_organization_id
      and p.status = 'active' and p.archived_at is null
    where pe.organization_id = p_organization_id and pe.status = 'active'
    order by pe.player_id, pe.starts_on desc nulls last
  ),
  perfiles as (
    select bp.player_id, bp.base_monthly_fee, bp.is_exempt
    from app.billing_profiles bp
    where bp.organization_id = p_organization_id and bp.status = 'active'
  ),
  base as (
    select a.player_id, a.cuota_categoria, coalesce(pf.base_monthly_fee, a.cuota_categoria) as cuota_pagada
    from activos a
    left join perfiles pf on pf.player_id = a.player_id
    where coalesce(pf.is_exempt, false) = false
  ),
  internos as (
    select b.player_id
    from app.player_benefits b
    where b.organization_id = p_organization_id and b.active
      and b.benefit_type in ('scholarship_full', 'scholarship_partial')
  )
  select
    coalesce(sum(ba.cuota_categoria), 0),
    coalesce(sum(greatest(0, ba.cuota_categoria - ba.cuota_pagada)) filter (where i.player_id is not null), 0)
  into v_proyectado, v_usado
  from base ba
  left join internos i on i.player_id = ba.player_id;

  select jsonb_build_object(
    'projectedIncome', v_proyectado, 'used', v_usado, 'capPct', v_cap_pct,
    'capAmount', round(v_proyectado * v_cap_pct / 100, 2),
    'usedPct', case when v_proyectado > 0 then round(100.0 * v_usado / v_proyectado, 1) else 0 end
  ) into v_out;
  return v_out;
end $$;

create or replace function public.v2_scholarship_internal_fund(organization_id uuid)
returns jsonb language sql set search_path to 'pg_catalog', 'private' as
$$ select private.scholarship_internal_fund(organization_id) $$;
revoke all on function public.v2_scholarship_internal_fund(uuid) from public, anon;
grant execute on function public.v2_scholarship_internal_fund(uuid) to authenticated;
