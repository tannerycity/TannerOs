-- M2 · El monto dice de donde sale, y deja de inventar la resta
--
-- EL BUG DE PRESENTACION QUE CIERRA ESTO
-- query_collection_amounts calculaba 'benefitTotal' como
-- (tarifa de la categoria - lo que paga el Tanner), SIEMPRE. Con los datos
-- del 23 de septiembre eso producia 33 "beneficios" de los cuales 13 no
-- existen en ninguna tabla: nadie los autorizo. Los 10 Tanners de Baby
-- Tanner que pagan 400 aparecian con una beca de $150 que nunca se dio.
--
-- Aqui la resta deja de salir sola. Sale UNICAMENTE cuando hay un beneficio
-- autorizado que de verdad cambia el monto. En los demas casos la pantalla
-- dice de donde sale la cifra, con estas cinco respuestas y ninguna mas:
--
--   plan        el club tiene un precio de lista con ese nombre (M1)
--   beca        hay un beneficio autorizado y vigente
--   acuerdo     se acordo con esa familia (billing_profiles.fee_note)
--   completo    paga la tarifa de su categoria, sin nada encima
--   sin_motivo  paga menos y NADIE registro por que  <- esto se ve, no se tapa
--
-- El quinto caso es el importante: antes se disfrazaba de beca. Ahora se
-- marca para que Presidencia lo nombre. No se corrige solo ni se adivina.

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
           -- Si TODOS los beneficios son informativos, no hay resta que hacer:
           -- el descuento ya venia dentro de la cuota. Esa distincion es la
           -- que decide si 'benefitTotal' sale o se queda en null.
           bool_or(b.calculation_type <> 'informational') as afecta_monto,
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
      'chargedFee', s.cobra,
      'exempt', coalesce(bp.is_exempt,false),
      'planId', pln.id,
      'planName', pln.name,
      'feeNote', nullif(trim(bp.fee_note),''),
      'feeSource', s.fuente,
      -- La resta SOLO cuando hay beca autorizada que mueve el monto. En plan,
      -- acuerdo o tarifa completa no hay beneficio que restar: son precios
      -- distintos, no descuentos. Devolver null aqui es lo que evita que la
      -- pantalla invente los $150 de Baby Tanner.
      'benefitTotal', case
        when s.fuente <> 'beca' then null
        when a.ordinaria is null then null
        else a.ordinaria - s.cobra
      end,
      'benefits', coalesce(b.lista,'[]'::jsonb),
      'conditionLabel', case s.fuente
        when 'plan'     then pln.name
        when 'acuerdo'  then 'Acuerdo con la familia'
        when 'completo' then 'Tarifa completa'
        when 'sin_tarifa' then 'Sin tarifa capturada'
        when 'sin_motivo' then 'Sin motivo registrado'
        else case
          when b.n = 1 then (b.lista->0->>'label')
            || coalesce(' · ' || (b.lista->0->>'clubLabel'), '')
          when b.n > 1 then (b.lista->0->>'label') || ' +' || (b.n - 1)
          else 'Beca o apoyo'
        end
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
    left join app.category_plans pln on pln.id = bp.plan_id and pln.active
    left join familia f on f.player_id = a.id
    left join benef b on b.player_id = a.id
    left join cargos c on c.player_id = a.id
    left join adeudo d on d.player_id = a.id
    cross join lateral (
      select case when coalesce(bp.is_exempt,false) then 0 else coalesce(bp.base_monthly_fee,0) end as cobra
    ) q
    -- El orden de esta escalera es el orden en que el club responde
    -- "y este por que paga eso": primero la exencion, luego el plan de lista,
    -- luego la beca, luego que pague completo, luego lo que se acordo con la
    -- familia. Lo que no cae en ninguna es lo que nadie registro.
    cross join lateral (
      select q.cobra,
             case
               when coalesce(bp.is_exempt,false)                         then 'beca'
               when pln.id is not null                                   then 'plan'
               when coalesce(b.afecta_monto,false)                       then 'beca'
               when a.ordinaria is not null and q.cobra = a.ordinaria    then 'completo'
               when nullif(trim(bp.fee_note),'') is not null             then 'acuerdo'
               when a.ordinaria is null                                  then 'sin_tarifa'
               when b.n is not null                                      then 'beca'
               else 'sin_motivo'
             end as fuente
    ) s
  ) t;

  select jsonb_build_object(
    'billingPeriod', v_periodo,
    'canSeeBenefitDetail', v_detalle,
    'rows', v_rows,
    'summary', jsonb_build_object(
      'players', jsonb_array_length(v_rows),
      'withBenefit', (select count(*) from jsonb_array_elements(v_rows) r where jsonb_array_length(r->'benefits') > 0),
      'onPlan', (select count(*) from jsonb_array_elements(v_rows) r where r->>'feeSource' = 'plan'),
      'byAgreement', (select count(*) from jsonb_array_elements(v_rows) r where r->>'feeSource' = 'acuerdo'),
      -- El numero que el club no tenia: cuantos Tanners pagan una cantidad
      -- que nadie explico. Si sale 0, el padron cuadra solo.
      'withoutReason', (select count(*) from jsonb_array_elements(v_rows) r where r->>'feeSource' = 'sin_motivo'),
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

-- Los planes de cada categoria, y al lado los montos sueltos: cantidades que
-- varios Tanners ya pagan pero que no son ningun plan. Ese segundo bloque es
-- el que permite arreglar 10 Tanners con un solo toque en vez de diez.
create or replace function private.query_category_plans(p_organization_id uuid)
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

  select coalesce(jsonb_agg(x order by x->>'sortKey', x->>'categoryName'),'[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'categoryId', c.id,
      'categoryName', c.name,
      'sortKey', lpad(coalesce(c.sort_order,9999)::text,5,'0'),
      'ordinaryFee', c.monthly_fee,
      'plans', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'planId', p.id,
                 'name', p.name,
                 'monthlyFee', p.monthly_fee,
                 'isDefault', p.is_default,
                 'players', (select count(*) from app.billing_profiles bp2 where bp2.plan_id = p.id)
               ) order by p.is_default desc, p.sort_order, p.monthly_fee desc),'[]'::jsonb)
        from app.category_plans p
        where p.category_id = c.id and p.active
      ),
      -- Montos que se cobran en esta categoria y no corresponden a ningun
      -- plan ni a una beca. Cada renglon es un candidato a plan del club.
      'unnamedAmounts', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'monthlyFee', u.cuota, 'players', u.cuantos
               ) order by u.cuantos desc, u.cuota desc),'[]'::jsonb)
        from (
          select bp.base_monthly_fee as cuota, count(*) as cuantos
          from app.players pl
          join app.player_enrollments pe
            on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status='active'
          join app.billing_profiles bp
            on bp.player_id = pl.id and bp.organization_id = pl.organization_id
          where pe.category_id = c.id
            and pl.status='active' and pl.archived_at is null
            and bp.plan_id is null
            and coalesce(bp.is_exempt,false) = false
            and nullif(trim(bp.fee_note),'') is null
            and not exists (
              select 1 from app.player_benefits b
              where b.player_id = pl.id and b.active
                and b.calculation_type <> 'informational'
                and (b.ends_on is null or b.ends_on >= current_date)
            )
          group by bp.base_monthly_fee
        ) u
      )
    ) x
    from app.categories c
    where c.organization_id = p_organization_id and c.status = 'active'
  ) t;

  return v_out;
end
$function$;

-- Crear un plan es de Presidencia: es fijar un precio del club.
-- p_assign_matching convierte de golpe a todos los que ya pagan esa cantidad
-- en esa categoria y no tienen plan ni beca. No les cambia un peso: solo les
-- pone el nombre de donde sale lo que ya pagan.
create or replace function private.command_create_category_plan(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_monthly_fee numeric,
  p_assign_matching boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_plan uuid; v_asignados int := 0; v_org uuid;
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'El plan necesita nombre';
  end if;
  if p_monthly_fee is null or p_monthly_fee < 0 then
    raise exception 'El plan necesita un monto valido';
  end if;

  select c.organization_id into v_org from app.categories c
  where c.id = p_category_id and c.organization_id = p_organization_id;
  if not found then raise exception 'Category not found'; end if;

  insert into app.category_plans(organization_id, category_id, name, monthly_fee, sort_order, created_by_user_id)
  values (v_org, p_category_id, trim(p_name), p_monthly_fee,
          coalesce((select max(sort_order)+1 from app.category_plans where category_id=p_category_id and active),1),
          (select auth.uid()))
  returning id into v_plan;

  if coalesce(p_assign_matching,true) then
    with tocados as (
      update app.billing_profiles bp
         set plan_id = v_plan, updated_at = now()
        from app.players pl
        join app.player_enrollments pe
          on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status='active'
       where bp.player_id = pl.id
         and bp.organization_id = p_organization_id
         and pe.category_id = p_category_id
         and bp.plan_id is null
         and coalesce(bp.is_exempt,false) = false
         and bp.base_monthly_fee = p_monthly_fee
         and pl.status='active' and pl.archived_at is null
      returning bp.player_id
    )
    select count(*) into v_asignados from tocados;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'CategoryPlanCreated','category_plan',v_plan,
         jsonb_build_object('categoryId',p_category_id,'name',trim(p_name),
                            'monthlyFee',p_monthly_fee,'assigned',v_asignados),
         (select auth.uid())::text);

  return jsonb_build_object('planId', v_plan, 'assigned', v_asignados);
end
$function$;

-- Poner a un Tanner en un plan SI le cambia la cuota: ese es el punto de que
-- exista el plan. Queda en domain_events con el antes y el despues, porque
-- mueve dinero.
create or replace function private.command_assign_player_plan(
  p_organization_id uuid,
  p_player_id uuid,
  p_plan_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_antes numeric; v_plan_antes uuid; v_cuota numeric; v_cat uuid;
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  select bp.base_monthly_fee, bp.plan_id into v_antes, v_plan_antes
  from app.billing_profiles bp
  where bp.player_id = p_player_id and bp.organization_id = p_organization_id;
  if not found then raise exception 'Billing profile not found'; end if;

  if p_plan_id is null then
    update app.billing_profiles set plan_id = null, updated_at = now()
     where player_id = p_player_id and organization_id = p_organization_id;
  else
    select p.monthly_fee, p.category_id into v_cuota, v_cat
    from app.category_plans p
    where p.id = p_plan_id and p.organization_id = p_organization_id and p.active;
    if not found then raise exception 'Plan not found'; end if;

    -- Un plan de Baby Tanner no se le puede poner a un T12: seria cobrarle el
    -- precio de otra categoria.
    if not exists (
      select 1 from app.player_enrollments pe
      where pe.player_id = p_player_id and pe.organization_id = p_organization_id
        and pe.status='active' and pe.category_id = v_cat
    ) then
      raise exception 'Ese plan es de otra categoria';
    end if;

    update app.billing_profiles
       set plan_id = p_plan_id, base_monthly_fee = v_cuota,
           fee_note = null, updated_at = now()
     where player_id = p_player_id and organization_id = p_organization_id;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'PlayerPlanAssigned','player',p_player_id,
         jsonb_build_object('planBefore',v_plan_antes,'planAfter',p_plan_id,
                            'feeBefore',v_antes,'feeAfter',coalesce(v_cuota,v_antes)),
         (select auth.uid())::text);
  return true;
end
$function$;

-- Lo que se acordo con esa familia, en una linea. Cuando hay acuerdo el
-- Tanner sale del plan: no puede estar en los dos lados a la vez o vuelve el
-- descuadre.
create or replace function private.command_set_player_fee_note(
  p_organization_id uuid,
  p_player_id uuid,
  p_note text,
  p_monthly_fee numeric default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_antes numeric; v_nota text;
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Not authorized';
  end if;
  if p_monthly_fee is not null and p_monthly_fee < 0 then
    raise exception 'El monto no puede ser negativo';
  end if;

  select bp.base_monthly_fee into v_antes from app.billing_profiles bp
  where bp.player_id = p_player_id and bp.organization_id = p_organization_id;
  if not found then raise exception 'Billing profile not found'; end if;

  v_nota := nullif(trim(coalesce(p_note,'')),'');

  update app.billing_profiles
     set fee_note = v_nota,
         plan_id = case when v_nota is null then plan_id else null end,
         base_monthly_fee = coalesce(p_monthly_fee, base_monthly_fee),
         updated_at = now()
   where player_id = p_player_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'PlayerFeeNoteSet','player',p_player_id,
         jsonb_build_object('note',v_nota,'feeBefore',v_antes,
                            'feeAfter',coalesce(p_monthly_fee,v_antes)),
         (select auth.uid())::text);
  return true;
end
$function$;

create or replace function public.v2_category_plans(organization_id uuid)
returns jsonb
language sql stable security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_category_plans(organization_id) $function$;

create or replace function public.v2_create_category_plan(
  organization_id uuid, category_id uuid, name text, monthly_fee numeric,
  assign_matching boolean default true
) returns jsonb
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_create_category_plan(organization_id, category_id, name, monthly_fee, assign_matching) $function$;

create or replace function public.v2_assign_player_plan(
  organization_id uuid, player_id uuid, plan_id uuid
) returns boolean
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_assign_player_plan(organization_id, player_id, plan_id) $function$;

create or replace function public.v2_set_player_fee_note(
  organization_id uuid, player_id uuid, note text, monthly_fee numeric default null
) returns boolean
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_set_player_fee_note(organization_id, player_id, note, monthly_fee) $function$;

-- Crear una funcion en private vuelve a conceder EXECUTE a PUBLIC. Cada vez.
revoke all on function private.query_collection_amounts(uuid,date) from public, anon, authenticated;
revoke all on function private.query_category_plans(uuid) from public, anon, authenticated;
revoke all on function private.command_create_category_plan(uuid,uuid,text,numeric,boolean) from public, anon, authenticated;
revoke all on function private.command_assign_player_plan(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function private.command_set_player_fee_note(uuid,uuid,text,numeric) from public, anon, authenticated;

revoke all on function public.v2_category_plans(uuid) from public, anon;
revoke all on function public.v2_create_category_plan(uuid,uuid,text,numeric,boolean) from public, anon;
revoke all on function public.v2_assign_player_plan(uuid,uuid,uuid) from public, anon;
revoke all on function public.v2_set_player_fee_note(uuid,uuid,text,numeric) from public, anon;

grant execute on function public.v2_category_plans(uuid) to authenticated;
grant execute on function public.v2_create_category_plan(uuid,uuid,text,numeric,boolean) to authenticated;
grant execute on function public.v2_assign_player_plan(uuid,uuid,uuid) to authenticated;
grant execute on function public.v2_set_player_fee_note(uuid,uuid,text,numeric) to authenticated;

-- Agregar un parametro NO reemplaza una funcion: crea una segunda, y con
-- DEFAULT la llamada ya no puede elegir. Se verifica que quedo una de cada.
do $$
declare v int; f text;
begin
  foreach f in array array['v2_collection_amounts','v2_category_plans','v2_create_category_plan',
                           'v2_assign_player_plan','v2_set_player_fee_note'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  foreach f in array array['query_collection_amounts','query_category_plans','command_create_category_plan',
                           'command_assign_player_plan','command_set_player_fee_note'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  -- Solo las cinco de esta migracion. Medido al aplicar: 151 de las 316
  -- funciones de private siguen con EXECUTE a PUBLIC de antes. Es deuda real
  -- y esta anotada, pero no se arregla de contrabando dentro de un cambio de
  -- cobranza: revocar 151 permisos a ciegas es justo el tipo de movimiento
  -- que tumba un modulo sin que nadie sepa cual.
  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='private'
     and routine_name in ('query_collection_amounts','query_category_plans',
                          'command_create_category_plan','command_assign_player_plan',
                          'command_set_player_fee_note')
     and grantee in ('PUBLIC','anon','authenticated');
  if v <> 0 then raise exception 'las funciones de M2 quedaron con % permisos sueltos', v; end if;
end $$;
