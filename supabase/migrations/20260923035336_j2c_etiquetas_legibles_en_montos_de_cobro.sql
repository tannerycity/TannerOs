-- La etiqueta que lee quien cobra sale de legacy_label, que trae lo que
-- escribio quien capturo: "Total", "Parcial", "curtibrother", "Hermanos
-- Tanner", "Parcial / viene un día". Leidas solas no dicen nada: en la
-- pantalla de Taquilla, "Total" puede ser total de que.
--
-- Ahora el nombre principal es el canonico ("Beca total", "Beca parcial",
-- "Hermanos Tanners") y lo que escribio el club queda como clubLabel, al
-- lado, porque ahi es donde vive Curtibrother y ese si lo reconocen.
create or replace function private.query_collection_amounts(
  p_organization_id uuid,
  p_billing_period date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_periodo date;
  v_detalle boolean;
  v_rows jsonb;
  v_out jsonb;
begin
  if not (private.has_module_access(p_organization_id,'taquilla',false)
       or private.has_module_access(p_organization_id,'accounting',false)) then
    raise exception 'Not authorized';
  end if;

  v_periodo := coalesce(p_billing_period, date_trunc('month', current_date)::date);

  -- Quien puede ver el desglose del beneficio. Taquilla NO: su permiso dice
  -- que no consulta informacion confidencial de becas. Ve la condicion, el
  -- monto a cobrar y hasta cuando va vigente, que es lo que necesita.
  v_detalle := private.is_presidency(p_organization_id)
            or private.has_module_access(p_organization_id,'accounting',false);

  with activos as (
    select pl.id, pl.first_name, pl.last_name, pl.code,
           pe.category_id, c.name as category_name, c.monthly_fee as ordinaria
    from app.players pl
    join app.player_enrollments pe
      on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status='active'
    left join app.categories c on c.id = pe.category_id
    where pl.organization_id = p_organization_id
      and pl.status = 'active' and pl.archived_at is null
  ),
  familia as (
    select pg.player_id,
           string_agg(distinct trim(concat_ws(' ', g.first_name, g.last_name)), ' · ')
             filter (where nullif(trim(concat_ws(' ', g.first_name, g.last_name)),'') is not null) as nombres
    from app.player_guardians pg
    join app.guardians g on g.id = pg.guardian_id
    where pg.organization_id = p_organization_id
    group by pg.player_id
  ),
  benef as (
    select b.player_id,
           jsonb_agg(jsonb_build_object(
             'benefitId', b.id,
             'type', b.benefit_type,
             'label', private.etiqueta_de_beneficio(b.benefit_type),
             'clubLabel', nullif(trim(b.legacy_label),''),
             'calculation', b.calculation_type,
             'fixedAmount', case when v_detalle then b.fixed_amount end,
             'percentage', case when v_detalle then b.percentage end,
             'fundingSource', case when v_detalle then coalesce(s.name, b.funding_source_name) end,
             'startsOn', b.starts_on,
             'endsOn', b.ends_on,
             'collectionNote', nullif(trim(b.collection_note),''),
             -- 'informational' significa que la etiqueta NO cambia ningun
             -- monto: el descuento ya venia dentro de la cuota del Tanner.
             'affectsAmount', (b.calculation_type <> 'informational')
           ) order by b.priority nulls last, b.starts_on desc) as lista,
           min(b.ends_on) filter (where b.ends_on is not null) as vence,
           bool_or(b.ends_on is null) as alguno_sin_vencimiento,
           count(*) as n
    from app.player_benefits b
    left join app.sponsors s on s.id = b.sponsor_id
    where b.organization_id = p_organization_id
      and b.active
      and b.starts_on <= (v_periodo + interval '1 month - 1 day')::date
      and (b.ends_on is null or b.ends_on >= v_periodo)
    group by b.player_id
  ),
  cargos as (
    select cb.player_id,
           sum(cb.net_amount) filter (where cb.charge_type='monthly_fee')    as mensualidad,
           sum(cb.net_amount) filter (where cb.charge_type='late_fee')       as recargos,
           sum(cb.net_amount) filter (where cb.charge_type not in ('monthly_fee','late_fee')) as otros,
           sum(cb.balance_due)                                                as por_cobrar_periodo
    from app.charge_balances cb
    where cb.organization_id = p_organization_id and cb.billing_period = v_periodo
    group by cb.player_id
  ),
  adeudo as (
    select cb.player_id, sum(cb.balance_due) as saldo
    from app.charge_balances cb
    where cb.organization_id = p_organization_id and cb.balance_due > 0
    group by cb.player_id
  )
  select coalesce(jsonb_agg(x order by x->>'categoryName' nulls last, x->>'name'),'[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'playerId', a.id,
      'name', trim(concat_ws(' ', a.first_name, a.last_name)),
      'code', a.code,
      'categoryId', a.category_id,
      'categoryName', a.category_name,
      'family', f.nombres,
      'ordinaryFee', a.ordinaria,
      'chargedFee', case when coalesce(bp.is_exempt,false) then 0 else bp.base_monthly_fee end,
      'exempt', coalesce(bp.is_exempt,false),
      -- La resta que pidio el club. Solo sale cuando la categoria ya tiene
      -- tarifa capturada; si no, se devuelve null y la pantalla lo dice en vez
      -- de inventar un ordinario.
      'benefitTotal', case
        when a.ordinaria is null then null
        else a.ordinaria - case when coalesce(bp.is_exempt,false) then 0 else coalesce(bp.base_monthly_fee,0) end
      end,
      'benefits', coalesce(b.lista,'[]'::jsonb),
      'conditionLabel', case
        when b.n is null then 'Tarifa ordinaria'
        when b.n = 1 then (b.lista->0->>'label')
          || coalesce(' · ' || (b.lista->0->>'clubLabel'), '')
        else (b.lista->0->>'label') || ' +' || (b.n - 1)
      end,
      'validUntil', b.vence,
      'validityStatus', case
        when b.n is null then 'ordinaria'
        when coalesce(b.alguno_sin_vencimiento,false) then 'sin_vencimiento'
        when b.vence < current_date then 'vencido'
        when b.vence <= current_date + 30 then 'por_vencer'
        else 'vigente'
      end,
      'periodFee', c.mensualidad,
      'periodLateFees', c.recargos,
      'periodOther', c.otros,
      'toCollect', coalesce(c.por_cobrar_periodo, 0),
      'outstanding', coalesce(d.saldo, 0),
      'collectionNote', (
        select string_agg(nullif(trim(e->>'collectionNote'),''), ' · ')
        from jsonb_array_elements(coalesce(b.lista,'[]'::jsonb)) e
      )
    ) x
    from activos a
    left join app.billing_profiles bp on bp.player_id = a.id and bp.organization_id = p_organization_id
    left join familia f on f.player_id = a.id
    left join benef b on b.player_id = a.id
    left join cargos c on c.player_id = a.id
    left join adeudo d on d.player_id = a.id
  ) t;

  select jsonb_build_object(
    'billingPeriod', v_periodo,
    'canSeeBenefitDetail', v_detalle,
    'rows', v_rows,
    'summary', jsonb_build_object(
      'players', jsonb_array_length(v_rows),
      'withBenefit', (select count(*) from jsonb_array_elements(v_rows) r where jsonb_array_length(r->'benefits') > 0),
      'toCollect', (select coalesce(sum((r->>'toCollect')::numeric),0) from jsonb_array_elements(v_rows) r),
      'outstanding', (select coalesce(sum((r->>'outstanding')::numeric),0) from jsonb_array_elements(v_rows) r),
      'expiringSoon', (select count(*) from jsonb_array_elements(v_rows) r where r->>'validityStatus' = 'por_vencer'),
      'expired', (select count(*) from jsonb_array_elements(v_rows) r where r->>'validityStatus' = 'vencido'),
      'categoriesWithoutFee', (
        select count(*) from app.categories c
        where c.organization_id = p_organization_id and c.status='active' and c.monthly_fee is null
      )
    )
  ) into v_out;

  return v_out;
end
$function$;

revoke all on function private.query_collection_amounts(uuid,date) from public, anon, authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='query_collection_amounts';
  if v <> 1 then raise exception 'query_collection_amounts quedo % veces', v; end if;
end $$;
