-- h74 · El 20% del kit por puntualidad llega como código (09/11/2026)
--
-- Presidencia: "se me hace más fácil un código en la tienda... que tenga
-- vigencia y trazabilidad"; "automático, del 1 de junio al 31 de agosto; si
-- no, se cancela y se pierde".
--
--   · Desde el 1 de junio (al cerrar mayo), cada Tanner que ganó el premio
--     (h64: enero a mayo a tiempo, sin beca) recibe un código propio:
--     PUNTUAL + año + 4 letras al azar (sin el nombre del niño), 20%, UN uso,
--     vigente del 1 de junio al 31 de agosto. La tienda ya valida vigencia y
--     usos (private.valida_codigo): vencido, ya no sirve.
--   · Trazabilidad: store_codes.player_id (de quién es) y origin; el pedido
--     guarda store_code_id; domain_events registra la emisión y el uso.
--   · La familia lo ve en su Portal; el staff, en el pedido de ese Tanner, y
--     lo aplica con v2_apply_order_code.
--   · Corre a diario con la cobranza (sólo actúa de junio a agosto, desde 2027).

alter table app.store_codes add column if not exists player_id uuid references app.players(id);
alter table app.store_codes add column if not exists origin text;
create unique index if not exists store_codes_premio_kit_unico
  on app.store_codes (organization_id, player_id, starts_on) where origin = 'puntualidad_kit';

-- El código del premio de un Tanner en un año, y si ya se usó o venció.
create or replace function private.kit_code_status(p_organization_id uuid, p_player_id uuid, p_year integer)
returns jsonb language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object('code', c.code, 'startsOn', c.starts_on, 'endsOn', c.ends_on,
    'used', o.id is not null, 'orderFolio', o.folio,
    'expired', o.id is null and (now() at time zone 'America/Mexico_City')::date > c.ends_on)
  from app.store_codes c
  left join lateral (select x.id, x.folio from app.orders x where x.store_code_id = c.id and x.status not in ('cancelled', 'refunded')
                     order by x.created_at limit 1) o on true
  where c.organization_id = p_organization_id and c.player_id = p_player_id and c.origin = 'puntualidad_kit'
    and c.starts_on = make_date(p_year, 6, 1) and c.archived_at is null
  limit 1
$$;

create or replace function private.issue_punctuality_kit_codes(p_organization_id uuid, p_local_date date)
returns integer language plpgsql security definer set search_path to ''
as $$
declare r record; v_anio integer := extract(year from p_local_date)::integer; v_n integer := 0; v_code text; v_id uuid;
begin
  if v_anio < 2027 or extract(month from p_local_date) not between 6 and 8 then return 0; end if;
  for r in
    select p.id, trim(concat_ws(' ', p.first_name, p.last_name)) as nombre
    from app.players p
    where p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null
      and not exists (select 1 from app.store_codes c where c.organization_id = p_organization_id and c.player_id = p.id
                        and c.origin = 'puntualidad_kit' and c.starts_on = make_date(v_anio, 6, 1))
  loop
    continue when private.punctuality_status(p_organization_id, r.id, v_anio) #>> '{kit,state}' is distinct from 'ganado';
    loop
      v_code := 'PUNTUAL' || lpad((v_anio % 100)::text, 2, '0') || upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=0O1IL', 'ABCDEFGH'), 1, 4));
      exit when not exists (select 1 from app.store_codes c where c.organization_id = p_organization_id and c.code = v_code);
    end loop;
    insert into app.store_codes(organization_id, code, kind, discount_type, discount_value, starts_on, ends_on, max_uses,
      max_uses_per_customer, active, note, player_id, origin)
    values (p_organization_id, v_code, 'descuento', 'pct', 20, make_date(v_anio, 6, 1), make_date(v_anio, 8, 31), 1,
      1, true, 'Premio por puntualidad (TC-146): 20% en el kit · ' || r.nombre, r.id, 'puntualidad_kit')
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      v_n := v_n + 1;
      insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
      values (p_organization_id, 'PunctualityKitCodeIssued', 'store_code', v_id,
        jsonb_build_object('playerId', r.id, 'year', v_anio, 'code', v_code, 'endsOn', make_date(v_anio, 8, 31)));
    end if;
    v_id := null;
  end loop;
  return v_n;
end $$;

-- El staff aplica un código a un pedido ya capturado (el mismo camino que la
-- tienda en línea: private.aplica_codigo valida vigencia y usos).
create or replace function public.v2_apply_order_code(organization_id uuid, order_id uuid, code text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare o app.orders%rowtype; v_total numeric;
begin
  if not private.has_module_access(v2_apply_order_code.organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select * into o from app.orders x where x.id = v2_apply_order_code.order_id and x.organization_id = v2_apply_order_code.organization_id for update;
  if not found then raise exception 'No encontramos ese pedido.'; end if;
  if o.status not in ('draft', 'pending_payment', 'partial_payment') then raise exception 'Ese pedido ya no se puede cambiar de precio.'; end if;
  if coalesce(o.discount, 0) > 0 or o.store_code_id is not null then raise exception 'Ese pedido ya tiene un descuento.'; end if;
  v_total := private.aplica_codigo(o.id, code);
  return jsonb_build_object('ok', true, 'total', v_total);
end $$;
revoke all on function public.v2_apply_order_code(uuid, uuid, text) from public, anon;
grant execute on function public.v2_apply_order_code(uuid, uuid, text) to authenticated;
revoke all on function private.issue_punctuality_kit_codes(uuid, date) from public, anon, authenticated;
revoke all on function private.kit_code_status(uuid, uuid, integer) from public, anon, authenticated;

-- El staff y la familia ven el código junto con el premio.
create or replace function public.v2_punctuality_status(organization_id uuid, player_id uuid, year integer default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_anio integer := coalesce(year, extract(year from (now() at time zone 'America/Mexico_City'))::integer);
begin
  if not (private.is_presidency(organization_id) or private.has_module_access(organization_id, 'billing', false)
          or private.has_module_access(organization_id, 'accounting', false) or private.has_module_access(organization_id, 'commerce', false)) then
    raise exception 'Not authorized';
  end if;
  return private.punctuality_status(organization_id, player_id, v_anio)
    || jsonb_build_object('kitCode', private.kit_code_status(organization_id, player_id, v_anio));
end $$;

create or replace function public.v2_portal_punctuality(player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_org uuid; v jsonb; v_anio integer := extract(year from (now() at time zone 'America/Mexico_City'))::integer;
begin
  if not private.portal_owns_player(v2_portal_punctuality.player_id) then raise exception 'Not authorized'; end if;
  select p.organization_id into v_org from app.players p where p.id = v2_portal_punctuality.player_id;
  v := private.punctuality_status(v_org, v2_portal_punctuality.player_id, v_anio);
  return jsonb_build_object('year', v->'year', 'months', v->'months', 'kit', v->'kit', 'december', v->'december',
    'kitCode', private.kit_code_status(v_org, v2_portal_punctuality.player_id, v_anio));
end $$;

-- A diario con la cobranza: sólo actúa de junio a agosto.
do $$
declare d text; v_a text := 'v_credit  := app.apply_available_credit(r.id);';
begin
  d := pg_get_functiondef('private.run_billing_automation()'::regprocedure);
  if position('issue_punctuality_kit_codes' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h74: no encontré apply_available_credit en run_billing_automation'; end if;
    execute replace(d, v_a, 'perform private.issue_punctuality_kit_codes(r.id, v_local_date);' || chr(10) || '    ' || v_a);
  end if;
end $$;
