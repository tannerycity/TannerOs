-- h64 · Premios por puntualidad (08/11/2026)
--
-- Reglas que cerró Presidencia:
--   · A tiempo = la mensualidad del mes pagada COMPLETA a más tardar su
--     fecha límite (día 5, incluido). Parcial al día 5 o pagar el 8: no cuenta.
--   · Enero a mayo a tiempo: 20% en el pedido del kit de agosto. Sólo sin beca.
--   · Enero a noviembre a tiempo: 50% en la mensualidad de diciembre, solo.
--     Entra la beca parcial; la beca completa (100%) no.
--   · "A todos los becados sólo aplica en diciembre, no en el pedido."
--   · Se cuentan los meses desde enero: si no tuvo cargo en enero, participa
--     el año siguiente. El descuento por hermanos no es beca.
--   · Los cargos del sistema empiezan en julio de 2026: arranca en 2027.
--
-- Qué hace:
--   1. private.punctuality_status: mes por mes y si gana cada premio.
--   2. v2_punctuality_status: lo mismo para la pantalla del Tanner.
--   3. private.apply_december_punctuality: en diciembre, el 50% se aplica
--      solo como descuento a la mensualidad (idempotente por cargo).
--   4. run_billing_automation lo llama a diario (sólo actúa en diciembre).
--   5. Centro Tanner: política TC-146 y sus preguntas.

create or replace function private.punctuality_status(p_organization_id uuid, p_player_id uuid, p_year integer)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_meses jsonb := '[]'::jsonb; v_mes integer; c record; v_estado text;
  v_ok5 integer := 0; v_ok11 integer := 0; v_tarde5 boolean := false; v_tarde11 boolean := false;
  v_pend5 boolean := false; v_pend11 boolean := false;
  v_beca_kit boolean; v_beca_total boolean;
begin
  for v_mes in 1..11 loop
    select ch.id, ch.due_date, cb.net_amount as neto,
      coalesce((select sum(pa.amount) from app.payment_allocations pa join app.payments py on py.id = pa.payment_id
                where pa.charge_id = ch.id and pa.status = 'posted' and py.status = 'posted' and py.voided_at is null
                  and py.payment_date <= ch.due_date), 0) as a_tiempo
      into c
    from app.charges ch join app.charge_balances cb on cb.id = ch.id
    where ch.organization_id = p_organization_id and ch.player_id = p_player_id
      and ch.charge_type = 'monthly_fee' and ch.status = 'posted'
      and ch.billing_period = make_date(p_year, v_mes, 1)
    order by ch.created_at limit 1;
    if not found then
      v_estado := case when make_date(p_year, v_mes, 1) > v_hoy then 'pendiente' else 'sin_cargo' end;
    elsif c.neto <= 0.004 or c.a_tiempo >= c.neto - 0.005 then
      v_estado := 'a_tiempo';
    elsif c.due_date >= v_hoy then
      v_estado := 'pendiente';
    else
      v_estado := 'tarde';
    end if;
    v_meses := v_meses || jsonb_build_object('month', v_mes, 'state', v_estado);
    if v_estado = 'a_tiempo' then v_ok11 := v_ok11 + 1; if v_mes <= 5 then v_ok5 := v_ok5 + 1; end if;
    elsif v_estado = 'pendiente' then v_pend11 := true; if v_mes <= 5 then v_pend5 := true; end if;
    else v_tarde11 := true; if v_mes <= 5 then v_tarde5 := true; end if;
    end if;
  end loop;

  -- Beca: completa, parcial o patrocinada. Hermanos no cuenta.
  select exists(select 1 from app.player_benefits b where b.organization_id = p_organization_id and b.player_id = p_player_id
      and b.active and b.benefit_type in ('scholarship_full', 'scholarship_partial', 'sponsor_funded')
      and coalesce(b.starts_on, make_date(p_year, 1, 1)) <= make_date(p_year, 8, 31)
      and coalesce(b.ends_on, make_date(p_year, 12, 31)) >= make_date(p_year, 1, 1))
    into v_beca_kit;
  select exists(select 1 from app.player_benefits b where b.organization_id = p_organization_id and b.player_id = p_player_id
      and b.active and b.benefit_type = 'scholarship_full'
      and coalesce(b.starts_on, make_date(p_year, 12, 1)) <= make_date(p_year, 12, 31)
      and coalesce(b.ends_on, make_date(p_year, 12, 31)) >= make_date(p_year, 12, 1))
    or exists(select 1 from app.billing_profiles bp where bp.organization_id = p_organization_id and bp.player_id = p_player_id and bp.is_exempt)
    into v_beca_total;

  return jsonb_build_object(
    'year', p_year, 'months', v_meses, 'onTime', v_ok11,
    'kit', jsonb_build_object('percent', 20,
      'state', case when p_year < 2027 then 'no_vigente' when v_beca_kit then 'beca'
                    when v_tarde5 then 'perdido' when v_pend5 then 'en_curso' else 'ganado' end,
      'onTime', v_ok5, 'of', 5),
    'december', jsonb_build_object('percent', 50,
      'state', case when p_year < 2027 then 'no_vigente' when v_beca_total then 'beca_completa'
                    when v_tarde11 then 'perdido' when v_pend11 then 'en_curso' else 'ganado' end,
      'onTime', v_ok11, 'of', 11));
end $$;

create or replace function public.v2_punctuality_status(organization_id uuid, player_id uuid, year integer default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
begin
  if not (private.is_presidency(organization_id) or private.has_module_access(organization_id, 'billing', false)
          or private.has_module_access(organization_id, 'accounting', false)) then
    raise exception 'Not authorized';
  end if;
  return private.punctuality_status(organization_id, player_id,
    coalesce(year, extract(year from (now() at time zone 'America/Mexico_City'))::integer));
end $$;

create or replace function private.apply_december_punctuality(p_organization_id uuid, p_local_date date)
returns integer language plpgsql security definer set search_path to ''
as $$
declare r record; v_st jsonb; v_monto numeric; v_n integer := 0; v_anio integer := extract(year from p_local_date)::integer;
begin
  if extract(month from p_local_date) <> 12 or v_anio < 2027 then return 0; end if;
  for r in
    select ch.id, ch.player_id, cb.net_amount, cb.balance_due
    from app.charges ch join app.charge_balances cb on cb.id = ch.id
    where ch.organization_id = p_organization_id and ch.charge_type = 'monthly_fee' and ch.status = 'posted'
      and ch.billing_period = make_date(v_anio, 12, 1) and cb.net_amount > 0.004 and cb.balance_due > 0.004
      and not exists(select 1 from app.charge_adjustments ca where ca.organization_id = p_organization_id
                       and ca.idempotency_key = 'puntualidad-dic:' || ch.id::text)
  loop
    v_st := private.punctuality_status(p_organization_id, r.player_id, v_anio);
    if v_st #>> '{december,state}' <> 'ganado' then continue; end if;
    -- 50% de su mensualidad de diciembre; si ya pagó una parte, lo que quepa.
    v_monto := least(round(r.net_amount * 0.5, 2), r.balance_due);
    insert into app.charge_adjustments(organization_id, charge_id, adjustment_type, amount, reason, status, idempotency_key, direction, posted_at)
    values (p_organization_id, r.id, 'discount', v_monto,
      'Premio por puntualidad: enero a noviembre pagados a tiempo (50% de diciembre).',
      'posted', 'puntualidad-dic:' || r.id::text, 'decrease', now())
    on conflict do nothing;
    if found then
      v_n := v_n + 1;
      insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
      values (p_organization_id, 'PunctualityPrizeApplied', 'charge', r.id,
        jsonb_build_object('playerId', r.player_id, 'year', v_anio, 'prize', 'december_50', 'amount', v_monto));
    end if;
  end loop;
  return v_n;
end $$;

-- La automatización de cobranza lo corre a diario; sólo actúa en diciembre.
do $$
declare d text; v_a text := 'v_credit  := app.apply_available_credit(r.id);';
begin
  d := pg_get_functiondef('private.run_billing_automation()'::regprocedure);
  if position('apply_december_punctuality' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h64: no encontré apply_available_credit en run_billing_automation'; end if;
    execute replace(d, v_a, 'perform private.apply_december_punctuality(r.id, v_local_date);' || chr(10) || '    ' || v_a);
  end if;
end $$;

revoke all on function private.punctuality_status(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.apply_december_punctuality(uuid, date) from public, anon, authenticated;
revoke all on function public.v2_punctuality_status(uuid, uuid, integer) from public, anon;
grant execute on function public.v2_punctuality_status(uuid, uuid, integer) to authenticated;

-- Centro Tanner: la regla, por escrito.
do $$
declare v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'; v_id uuid;
begin
  if not exists(select 1 from public.organizations where id = v_org) then return; end if;
  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-146','premios-por-puntualidad','Premios por puntualidad','mensualidades','tannery_city',
    'Paga la mensualidad completa a más tardar el día 5. Enero a mayo a tiempo: 20% en el kit de agosto. Enero a noviembre a tiempo: 50% en la mensualidad de diciembre.',
    'Premiamos a las familias que pagan a tiempo:
• A tiempo quiere decir: la mensualidad del mes pagada completa a más tardar el día 5 (incluido). Un pago parcial al día 5, o pagar después del día 5, no cuenta.
• Enero a mayo a tiempo: 20% de descuento en el pedido del kit de agosto. No aplica para Tanners con beca.
• Enero a noviembre a tiempo: 50% de descuento en la mensualidad de diciembre. Se aplica solo. Aplica también con beca parcial; no aplica con beca completa (100%).
• Se cuentan los meses desde enero: quien se inscribe después de enero participa a partir del año siguiente.
• El descuento por hermanos no cuenta como beca.
• Vigente desde enero de 2027.',
    array['puntualidad','descuento','premio','pago a tiempo','dia 5','kit','diciembre','mensualidad'],
    'published',1,date '2026-11-08',now())
  on conflict (organization_id, slug) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from app.policies where organization_id=v_org and slug='premios-por-puntualidad'; end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id,'¿Hay descuento por pagar a tiempo?','Sí. Si pagas la mensualidad completa a más tardar el día 5 de enero a noviembre, diciembre te sale a mitad de precio (50%), y se aplica solo. Si pagas a tiempo de enero a mayo, tienes 20% en el kit de agosto.','mensualidades',array['descuento','puntualidad','pago a tiempo'],1,'published'),
  (v_org,v_id,'Si pago el día 8, ¿pierdo el premio por puntualidad?','Sí. Cuenta como a tiempo sólo si la mensualidad queda pagada completa a más tardar el día 5. Un pago parcial al día 5 tampoco cuenta.','mensualidades',array['dia 5','dia 8','tarde','premio'],2,'published'),
  (v_org,v_id,'Mi hijo tiene beca, ¿le toca el premio por puntualidad?','Con beca parcial sí entra al 50% de diciembre, pero no al 20% del kit. Con beca completa (100%) no aplica. El descuento por hermanos no cuenta como beca.','mensualidades',array['beca','becado','puntualidad','hermanos'],3,'published')
  on conflict do nothing;
end $$;
