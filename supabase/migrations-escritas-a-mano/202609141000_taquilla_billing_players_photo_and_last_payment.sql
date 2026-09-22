-- Amplía v2_billing_players con foto y última fecha de pago para poder
-- construir una pestaña "Cobranza" en Taquilla (estado por jugador, con
-- foto y un botón de cobro directo), sin abrir el módulo de Jugadores.
drop function if exists public.v2_billing_players(uuid);
drop function if exists private.query_billing_players(uuid);

create function private.query_billing_players(p_organization_id uuid)
returns table(
  player_id uuid, player_name text, base_monthly_fee numeric, billing_status text,
  sponsor_benefit_id uuid, sponsor_source text, sponsor_mode text, sponsor_value numeric,
  sponsor_configured_at timestamptz,
  photo_bucket text, photo_thumb_path text, last_payment_date date
)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,trim(concat_ws(' ',p.first_name,p.last_name)),bp.base_monthly_fee,bp.status,
    sb.id,sb.funding_source_name,sb.calculation_type,
    case when sb.calculation_type='percentage' then sb.percentage else sb.fixed_amount end,sb.funding_configured_at,
    p.photo_bucket,p.photo_thumb_path,
    (select max(pay.payment_date) from app.payments pay
      where pay.organization_id=p.organization_id and pay.player_id=p.id
        and pay.status='posted' and pay.voided_at is null)
  from app.players p
  join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  left join lateral(
    select b.* from app.player_benefits b where b.organization_id=p.organization_id and b.player_id=p.id and b.benefit_type='sponsor_funded' and b.active=true
    order by (b.funding_configured_at is not null) desc,b.priority desc,b.starts_on desc,b.created_at desc limit 1
  ) sb on true
  where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
  order by p.first_name,p.last_name,p.id;
end
$function$;

create function public.v2_billing_players(organization_id uuid)
returns table(
  player_id uuid, player_name text, base_monthly_fee numeric, billing_status text,
  sponsor_benefit_id uuid, sponsor_source text, sponsor_mode text, sponsor_value numeric,
  sponsor_configured_at timestamptz,
  photo_bucket text, photo_thumb_path text, last_payment_date date
)
language sql
stable security definer
set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_billing_players(organization_id) $function$;

grant execute on function public.v2_billing_players(uuid) to authenticated;
