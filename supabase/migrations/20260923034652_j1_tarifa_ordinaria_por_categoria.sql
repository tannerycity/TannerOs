-- J1 · La mensualidad ordinaria, que no existia en ninguna tabla
--
-- EL PROBLEMA MEDIDO
-- app.categories no tenia columna de precio. La unica cifra que el sistema
-- usa para cobrar es billing_profiles.base_monthly_fee, POR TANNER, y ahi el
-- descuento ya viene metido a mano: en septiembre 2026, 55 cargos con base
-- 30,750 y apenas 200 de descuento aplicado, con 30 beneficios activos y
-- CERO cargos ligados a un player_benefit_id. 18 de esos 30 beneficios son
-- calculation_type 'informational', o sea, etiquetas que no cambian ningun
-- monto.
--
-- Por eso "ordinario - beneficio = final" no se podia calcular: el sistema
-- nunca guardo el ordinario. Esta migracion le da un lugar.
--
-- NO TOCA NADA DE LO QUE YA COBRA
-- La columna nace nula. Mientras este nula, la pantalla muestra el monto
-- final sin la resta y lo dice. El motor de cobranza no la lee: sigue
-- cobrando exactamente igual que ayer. Es un dato de consulta, no una
-- segunda fuente de verdad que pueda contradecir a la primera.

alter table app.categories
  add column if not exists monthly_fee numeric,
  add column if not exists monthly_fee_set_at timestamptz,
  add column if not exists monthly_fee_set_by_user_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='categories_monthly_fee_no_negativa') then
    alter table app.categories
      add constraint categories_monthly_fee_no_negativa
      check (monthly_fee is null or monthly_fee >= 0);
  end if;
end $$;

comment on column app.categories.monthly_fee is
  'Mensualidad ordinaria de la categoria. Solo para mostrar el desglose "ordinario - beneficio = final" en Montos de cobro. El motor de cobranza NO la lee: sigue usando billing_profiles.base_monthly_fee.';

-- Fijar la tarifa es de Presidencia. Es el numero contra el que se va a
-- medir cada beneficio del club.
create or replace function private.command_set_category_fee(
  p_organization_id uuid, p_category_id uuid, p_monthly_fee numeric
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_antes numeric;
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Not authorized';
  end if;
  if p_monthly_fee is not null and p_monthly_fee < 0 then
    raise exception 'Monthly fee cannot be negative';
  end if;

  select c.monthly_fee into v_antes from app.categories c
  where c.id = p_category_id and c.organization_id = p_organization_id;
  if not found then raise exception 'Category not found'; end if;

  update app.categories
     set monthly_fee = p_monthly_fee,
         monthly_fee_set_at = case when p_monthly_fee is null then null else now() end,
         monthly_fee_set_by_user_id = case when p_monthly_fee is null then null else (select auth.uid()) end,
         updated_at = now()
   where id = p_category_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'CategoryFeeSet','category',p_category_id,
         jsonb_build_object('before',v_antes,'after',p_monthly_fee),(select auth.uid())::text);
  return true;
end
$function$;

-- Lista para la pantalla de Presidencia: la tarifa que hay y la que sugiere
-- el propio padron. La sugerencia es la cuota MAS REPETIDA entre los Tanners
-- activos que no son exentos, que es la definicion practica de "lo que paga
-- el que no trae beneficio". Se propone; Presidencia confirma.
create or replace function private.query_category_fees(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_out jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false)
     and not private.has_module_access(p_organization_id,'accounting',false)
     and not private.has_module_access(p_organization_id,'taquilla',false) then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'sortKey', x->>'name'),'[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'categoryId', c.id,
      'code', c.code,
      'name', c.name,
      'sortKey', lpad(coalesce(c.sort_order,9999)::text,5,'0'),
      'monthlyFee', c.monthly_fee,
      'setAt', c.monthly_fee_set_at,
      'activePlayers', (
        select count(*) from app.player_enrollments pe
        join app.players pl on pl.id=pe.player_id and pl.status='active' and pl.archived_at is null
        where pe.category_id=c.id and pe.status='active'
      ),
      'suggested', (
        select mode() within group (order by bp.base_monthly_fee)
        from app.player_enrollments pe
        join app.players pl on pl.id=pe.player_id and pl.status='active' and pl.archived_at is null
        join app.billing_profiles bp on bp.player_id=pl.id and bp.organization_id=c.organization_id
        where pe.category_id=c.id and pe.status='active'
          and coalesce(bp.is_exempt,false) = false
          and coalesce(bp.base_monthly_fee,0) > 0
      ),
      'feeSpread', (
        select count(distinct bp.base_monthly_fee)
        from app.player_enrollments pe
        join app.players pl on pl.id=pe.player_id and pl.status='active' and pl.archived_at is null
        join app.billing_profiles bp on bp.player_id=pl.id and bp.organization_id=c.organization_id
        where pe.category_id=c.id and pe.status='active'
      )
    ) x
    from app.categories c
    where c.organization_id = p_organization_id and c.status = 'active'
  ) t;

  return v_out;
end
$function$;

create or replace function public.v2_set_category_fee(
  organization_id uuid, category_id uuid, monthly_fee numeric
) returns boolean
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_set_category_fee(organization_id, category_id, monthly_fee) $function$;

create or replace function public.v2_category_fees(organization_id uuid)
returns jsonb
language sql stable security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_category_fees(organization_id) $function$;

revoke all on function private.command_set_category_fee(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function private.query_category_fees(uuid) from public, anon, authenticated;
revoke all on function public.v2_set_category_fee(uuid,uuid,numeric) from public, anon;
revoke all on function public.v2_category_fees(uuid) from public, anon;
grant execute on function public.v2_set_category_fee(uuid,uuid,numeric) to authenticated;
grant execute on function public.v2_category_fees(uuid) to authenticated;

do $$
declare v int; f text;
begin
  foreach f in array array['v2_set_category_fee','v2_category_fees'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  foreach f in array array['command_set_category_fee','query_category_fees'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
end $$;
