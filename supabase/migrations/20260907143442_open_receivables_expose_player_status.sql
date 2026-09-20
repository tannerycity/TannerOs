-- La cartera no distinguía si el Tanner sigue activo, así que los dados de baja
-- se mezclaban con los cobrables e inflaban el KPI que ven los cobradores.
-- Se agrega player_status para poder separarlos en pantalla sin borrar el dato.
drop function if exists private.query_open_receivables(uuid);
create function private.query_open_receivables(p_organization_id uuid)
returns table(charge_id uuid, player_id uuid, player_name text, player_status text,
              charge_type text, concept text, billing_period date, due_date date,
              payer_type text, payer_name text, net_amount numeric,
              allocated_amount numeric, balance_due numeric)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
  return query
  select cb.id, cb.player_id, trim(concat_ws(' ',p.first_name,p.last_name)),
         coalesce(p.status,'unknown'),
         cb.charge_type, cb.concept, cb.billing_period, cb.due_date,
         cb.payer_type, cb.payer_name, cb.net_amount, cb.allocated_amount, cb.balance_due
  from app.charge_balances cb
  left join app.players p on p.id=cb.player_id and p.organization_id=cb.organization_id
  where cb.organization_id=p_organization_id
    and cb.computed_status in ('pending','partial') and cb.balance_due>0
  order by cb.due_date, cb.billing_period, 3, cb.id;
end $function$;

drop function if exists public.v2_open_receivables(uuid);
create function public.v2_open_receivables(organization_id uuid)
returns table(charge_id uuid, player_id uuid, player_name text, player_status text,
              charge_type text, concept text, billing_period date, due_date date,
              payer_type text, payer_name text, net_amount numeric,
              allocated_amount numeric, balance_due numeric)
language sql stable security definer
set search_path to 'pg_catalog','private'
as $function$ select * from private.query_open_receivables(organization_id) $function$;

revoke all on function private.query_open_receivables(uuid) from public, anon, authenticated;
revoke all on function public.v2_open_receivables(uuid) from public, anon;
grant execute on function public.v2_open_receivables(uuid) to authenticated;;
