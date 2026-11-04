-- H62 · Paquetes del club (04/11/2026).
--
-- Presidencia: "en enero vamos a tener 6 paquetes... Tanners 4 días o 2 días,
-- Baby Tanners (y T6) 3 días o 2 días, porteros 2 días con Alexis o 4 días,
-- 2 con Alexis y 2 con el club". "Club + porteros cuesta 800". "Los de solo
-- porteros... sólo saldrían en la lista de los porteros". "Las becas duran 3
-- meses y se renuevan trimestralmente; nosotros las tenemos que renovar".
-- "Quiero que las becas informativas ya no sean informativas, que se
-- descuenten solas".
--
-- Cómo queda:
--   · app.club_packages: el catálogo (6 por club). app.club_package_prices:
--     el precio de cada paquete con la fecha desde la que vale. Un precio de
--     enero se captura hoy y el cobro de enero lo toma solo.
--   · billing_profiles.package_id: el paquete del Tanner. Con paquete, la
--     cuota (base_monthly_fee) la calcula el sistema: precio del paquete en
--     ese mes menos sus becas vigentes ese mes. Una beca que vence y no se
--     renueva deja de descontar el mes siguiente.
--   · Sin paquete, todo sigue exactamente como hoy (cuota escrita a mano).
--   · Porteros: el paquete los inscribe a la Academia de porteros con costo
--     $0 (el precio va en el paquete: un solo cargo, "Mensualidad").
--     "Porteros 2 días" no entrena con su categoría: no sale en esas listas.
--   · Cambiar de paquete cuenta desde el primer mes que aún no se cobra. Lo
--     ya cobrado no se toca. Nunca cobra dos veces el mismo mes: si este mes
--     no tiene mensualidad (ej. "solo porteros", que pagaba por la academia),
--     el paquete empieza el mes que entra.
--
-- Funciones nuevas: v2_club_packages, v2_set_package_price, v2_player_package,
-- v2_set_player_package, v2_package_proposal, v2_apply_package_proposal,
-- v2_renew_benefit, v2_goalkeepers. Cambios: app.generate_monthly_charges
-- (antes de cobrar, recalcula la cuota de quien tiene paquete),
-- private.session_roster_ids y private.query_attendance_categories (sin
-- "Porteros 2 días" en las listas de su categoría).

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------
alter table app.categories add column if not exists package_group text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_package_group_check') then
    alter table app.categories add constraint categories_package_group_check
      check (package_group is null or package_group in ('baby','tanner'));
  end if;
end $$;
comment on column app.categories.package_group is
  'Qué paquetes le tocan: baby (Baby Tanner y T6: 3 o 2 días) o tanner (4 o 2 días). Sin valor: se deduce del nombre.';

create table if not exists app.club_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  audience text not null check (audience in ('tanner','baby','porteros')),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  goalkeeper_days smallint not null default 0 check (goalkeeper_days between 0 and 7),
  trains_with_category boolean not null default true,
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);
alter table app.club_packages enable row level security;

create table if not exists app.club_package_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id uuid not null,
  monthly_fee numeric(10,2) not null check (monthly_fee >= 0),
  effective_from date not null check (effective_from = date_trunc('month', effective_from)::date),
  note text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (package_id, effective_from),
  foreign key (package_id, organization_id) references app.club_packages(id, organization_id) on delete cascade
);
alter table app.club_package_prices enable row level security;
create index if not exists idx_club_package_prices_pkg on app.club_package_prices(package_id, effective_from desc);

alter table app.billing_profiles add column if not exists package_id uuid references app.club_packages(id) on delete set null;
create index if not exists idx_billing_profiles_package on app.billing_profiles(package_id) where package_id is not null;
comment on column app.billing_profiles.package_id is
  'Paquete del Tanner (h62). Con paquete, base_monthly_fee = precio del paquete en el mes menos sus becas de ese mes; lo recalcula el sistema.';

drop trigger if exists trg_touch_updated_at on app.club_packages;
create trigger trg_touch_updated_at before update on app.club_packages for each row execute function app.touch_updated_at();
drop trigger if exists zz_club_read_only on app.club_packages;
create trigger zz_club_read_only before insert or delete or update on app.club_packages for each row execute function private.guard_club_read_only();
drop trigger if exists zz_club_read_only on app.club_package_prices;
create trigger zz_club_read_only before insert or delete or update on app.club_package_prices for each row execute function private.guard_club_read_only();

-- Tannery City: Baby Tanner, Mini Baby Tanner y T6 son "baby"; lo demás, "tanner".
update app.categories
   set package_group = case when name ilike '%baby%' or upper(btrim(name)) = 'T6' then 'baby' else 'tanner' end
 where organization_id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and package_group is null;

-- Los 6 paquetes de Tannery City. Precio de hoy donde ya existe (Tanner $800,
-- Baby $550, Porteros 4 días $800, Porteros 2 días $500); los de 2 días de
-- Tanner y Baby quedan sin precio hasta que Presidencia lo ponga.
insert into app.club_packages(organization_id, code, name, audience, days_per_week, goalkeeper_days, trains_with_category, sort_order)
select '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8', x.code, x.name, x.audience, x.d, x.g, x.cat, x.o
from (values
  ('tanner_4',  'Tanner 4 días',   'tanner',   4, 0, true,  10),
  ('tanner_2',  'Tanner 2 días',   'tanner',   2, 0, true,  20),
  ('baby_3',    'Baby 3 días',     'baby',     3, 0, true,  30),
  ('baby_2',    'Baby 2 días',     'baby',     2, 0, true,  40),
  ('porteros_4','Porteros 4 días', 'porteros', 4, 2, true,  50),
  ('porteros_2','Porteros 2 días', 'porteros', 2, 2, false, 60)
) as x(code, name, audience, d, g, cat, o)
where exists (select 1 from public.organizations o where o.id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8')
on conflict (organization_id, code) do nothing;

insert into app.club_package_prices(organization_id, package_id, monthly_fee, effective_from, note)
select k.organization_id, k.id, x.fee, date '2026-11-01', 'Precio vigente al crear los paquetes'
from app.club_packages k
join (values ('tanner_4', 800), ('baby_3', 550), ('porteros_4', 800), ('porteros_2', 500)) as x(code, fee) on x.code = k.code
where k.organization_id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
on conflict (package_id, effective_from) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cálculo: precio del mes, becas del mes y el primer mes sin cobrar
-- ---------------------------------------------------------------------------
create or replace function private.package_price(p_package_id uuid, p_period date)
returns numeric language sql stable security definer set search_path to ''
as $$
  select pp.monthly_fee from app.club_package_prices pp
  where pp.package_id = p_package_id and pp.effective_from <= date_trunc('month', p_period)::date
  order by pp.effective_from desc limit 1
$$;

create or replace function private.category_package_group(p_category_name text, p_group text)
returns text language sql immutable set search_path to ''
as $$
  select coalesce(p_group, case when p_category_name ilike '%baby%' or upper(btrim(coalesce(p_category_name,''))) = 'T6' then 'baby' else 'tanner' end)
$$;

-- Las becas que cuentan ese mes: activas, que no paga un patrocinador (eso lo
-- reparte el motor de cobro aparte) y cuyo periodo toca el mes.
create or replace function private.package_discount(p_organization_id uuid, p_player_id uuid, p_price numeric, p_period date)
returns numeric language plpgsql stable security definer set search_path to ''
as $$
declare v_ini date := date_trunc('month', p_period)::date; v_fin date; v_total boolean; v_override numeric; v_desc numeric;
begin
  if p_price is null or p_price <= 0 then return 0; end if;
  v_fin := (v_ini + interval '1 month - 1 day')::date;
  select bool_or(b.benefit_type = 'scholarship_full' or b.calculation_type = 'full_waiver' or coalesce(b.percentage, 0) >= 100),
         min(b.override_amount) filter (where b.calculation_type = 'override_amount' and b.override_amount is not null),
         coalesce(sum(case when b.calculation_type = 'override_amount' then 0
                           when b.percentage is not null then round(p_price * b.percentage / 100.0, 2)
                           else coalesce(b.fixed_amount, 0) end), 0)
    into v_total, v_override, v_desc
  from app.player_benefits b
  where b.organization_id = p_organization_id and b.player_id = p_player_id
    and b.active and b.ended_at is null and b.benefit_type <> 'sponsor_funded'
    and b.starts_on <= v_fin and (b.ends_on is null or b.ends_on >= v_ini);
  if coalesce(v_total, false) then return p_price; end if;
  if v_override is not null then return greatest(0, p_price - least(p_price, v_override)); end if;
  return least(p_price, greatest(0, v_desc));
end $$;

-- El primer mes que todavía no se le cobra a este Tanner.
create or replace function private.package_target_period(p_organization_id uuid, p_player_id uuid)
returns date language plpgsql stable security definer set search_path to ''
as $$
declare v_hoy date := date_trunc('month', (now() at time zone 'America/Mexico_City')::date)::date; v_ini date; v_p date;
begin
  select greatest(v_hoy, date_trunc('month', bp.billing_start)::date) into v_ini
  from app.billing_profiles bp where bp.organization_id = p_organization_id and bp.player_id = p_player_id;
  v_p := coalesce(v_ini, v_hoy);
  while exists (select 1 from app.charges c
                where c.organization_id = p_organization_id and c.player_id = p_player_id
                  and c.charge_type = 'monthly_fee' and c.billing_period = v_p and c.voided_at is null) loop
    v_p := (v_p + interval '1 month')::date;
  end loop;
  return v_p;
end $$;

-- Pone la cuota de un Tanner con paquete para ese mes. Sin paquete o sin
-- precio, no toca nada.
create or replace function private.sync_package_fee(p_organization_id uuid, p_player_id uuid, p_period date default null)
returns numeric language plpgsql security definer set search_path to ''
as $$
declare v_pkg uuid; v_periodo date; v_precio numeric; v_cuota numeric;
begin
  select bp.package_id into v_pkg from app.billing_profiles bp
  where bp.organization_id = p_organization_id and bp.player_id = p_player_id;
  if v_pkg is null then return null; end if;
  v_periodo := coalesce(p_period, private.package_target_period(p_organization_id, p_player_id));
  v_precio := private.package_price(v_pkg, v_periodo);
  if v_precio is null then return null; end if;
  v_cuota := greatest(0, v_precio - private.package_discount(p_organization_id, p_player_id, v_precio, v_periodo));
  update app.billing_profiles set base_monthly_fee = v_cuota, updated_at = now()
  where organization_id = p_organization_id and player_id = p_player_id and base_monthly_fee is distinct from v_cuota;
  return v_cuota;
end $$;

-- Antes de cobrar un mes: a quien tiene paquete y todavía no tiene ese mes
-- cobrado, se le pone la cuota de ese mes (precio nuevo de enero, beca que
-- venció, beca renovada...).
create or replace function private.sync_package_fees(p_organization_id uuid, p_period date)
returns integer language plpgsql security definer set search_path to ''
as $$
declare r record; v_n integer := 0;
begin
  for r in
    select bp.player_id from app.billing_profiles bp
    where bp.organization_id = p_organization_id and bp.package_id is not null
      and not exists (select 1 from app.charges c
                      where c.organization_id = bp.organization_id and c.player_id = bp.player_id
                        and c.charge_type = 'monthly_fee' and c.billing_period = date_trunc('month', p_period)::date
                        and c.voided_at is null)
  loop
    perform private.sync_package_fee(p_organization_id, r.player_id, date_trunc('month', p_period)::date);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Una beca que se da, cambia, renueva, suspende o termina mueve la cuota de
-- quien tiene paquete sin esperar al cobro.
create or replace function private.trg_benefit_sync_package_fee()
returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  perform private.sync_package_fee(coalesce(new.organization_id, old.organization_id), coalesce(new.player_id, old.player_id), null);
  return null;
end $$;
drop trigger if exists zz_sync_package_fee on app.player_benefits;
create trigger zz_sync_package_fee after insert or update or delete on app.player_benefits
for each row execute function private.trg_benefit_sync_package_fee();

-- El motor de cobro recalcula antes de generar las mensualidades.
do $$
declare d text; v_target text := E'then return 0; end if;\n\n  for r in';
begin
  d := pg_get_functiondef('app.generate_monthly_charges(uuid,date)'::regprocedure);
  if position('sync_package_fees' in d) = 0 then
    if (length(d) - length(replace(d, v_target, ''))) / length(v_target) <> 1 then
      raise exception 'h62: no encontré dónde recalcular en app.generate_monthly_charges';
    end if;
    d := replace(d, v_target, E'then return 0; end if;\n\n  -- h62: cuota de quien tiene paquete (precio del mes menos sus becas).\n  perform private.sync_package_fees(p_organization_id, v_period);\n\n  for r in');
    execute d;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Asistencia: "Porteros 2 días" no sale en la lista de su categoría
-- ---------------------------------------------------------------------------
create or replace function private.session_roster_ids(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid) language sql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
  -- Por categoría: los inscritos activos de esa categoría, menos los de un
  -- paquete que no entrena con su categoría ("Porteros 2 días", h62).
  select pe.player_id
  from app.sessions s
  join app.player_enrollments pe on pe.organization_id=s.organization_id
   and pe.category_id=s.category_id and pe.status='active'
  join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
   and p.status='active' and p.archived_at is null
  where s.id=p_session_id and s.organization_id=p_organization_id and s.academy_id is null
    and not exists (select 1 from app.billing_profiles bpx join app.club_packages k on k.id=bpx.package_id
                    where bpx.organization_id=pe.organization_id and bpx.player_id=pe.player_id and not k.trains_with_category)
  union
  -- Por academia: los inscritos cuya inscripción cubre el día de la sesión, para que
  -- quien se dio de baja la semana pasada no siga apareciendo en la lista.
  select e.player_id
  from app.sessions s
  join app.academy_enrollments e on e.organization_id=s.organization_id
   and e.academy_id=s.academy_id
   and e.starts_on<=s.starts_at::date
   and (e.ends_on is null or e.ends_on>=s.starts_at::date)
   and e.status='active'
  join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
   and p.status='active' and p.archived_at is null
  where s.id=p_session_id and s.organization_id=p_organization_id and s.academy_id is not null
$function$;

create or replace function private.query_attendance_categories(p_organization_id uuid)
returns table(category_id uuid, code text, name text, active_players bigint, mine boolean)
language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_admin boolean;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  -- Quien administra el club no tiene "suyas" y "ajenas": todas son suyas.
  v_admin := private.is_player_admin(p_organization_id);
  return query
  select c.id,c.code,c.name,count(p.id),
         v_admin or c.id in (select private.my_category_ids(p_organization_id))
  from app.categories c
  left join app.player_enrollments pe on pe.organization_id=c.organization_id and pe.category_id=c.id and pe.status='active'
   and not exists (select 1 from app.billing_profiles bpx join app.club_packages k on k.id=bpx.package_id
                   where bpx.organization_id=pe.organization_id and bpx.player_id=pe.player_id and not k.trains_with_category)
  left join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id and p.status='active' and p.archived_at is null
  where c.organization_id=p_organization_id and c.status='active'
  group by c.id,c.code,c.name,c.sort_order
  order by c.sort_order nulls last,c.name;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Poner un paquete (todo junto o nada)
-- ---------------------------------------------------------------------------
create or replace function private.command_set_player_package(p_organization_id uuid, p_player_id uuid, p_package_code text, p_reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  k app.club_packages%rowtype; bp app.billing_profiles%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_reason,'')), '');
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes date; v_sig date; v_grupo text; v_cat text; v_periodo date; v_precio numeric; v_cuota numeric;
  v_gk uuid; v_insc app.academy_enrollments%rowtype; v_antes jsonb; v_inicio_antes date;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'Escribe el motivo (al menos 5 letras): queda en el registro.'; end if;
  v_mes := date_trunc('month', v_hoy)::date;
  v_sig := (v_mes + interval '1 month')::date;

  select * into k from app.club_packages where organization_id = p_organization_id and code = p_package_code and active;
  if not found then raise exception 'Ese paquete no existe en el club.'; end if;

  if not exists (select 1 from app.players p where p.id = p_player_id and p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null) then
    raise exception 'Ese Tanner no está activo en el club.';
  end if;

  select c.name, private.category_package_group(c.name, c.package_group) into v_cat, v_grupo
  from app.player_enrollments pe join app.categories c on c.id = pe.category_id and c.organization_id = pe.organization_id
  where pe.organization_id = p_organization_id and pe.player_id = p_player_id and pe.status = 'active'
  order by pe.starts_on desc nulls last limit 1;
  if v_grupo is null then raise exception 'Primero ponle categoría a este Tanner.'; end if;
  if k.audience in ('tanner','baby') and k.audience <> v_grupo then
    raise exception '% es para %, y este Tanner es de %.', k.name, case k.audience when 'baby' then 'Baby Tanner y T6' else 'Tanners' end, v_cat;
  end if;

  select * into bp from app.billing_profiles where organization_id = p_organization_id and player_id = p_player_id for update;
  if not found then
    insert into app.billing_profiles(organization_id, player_id, base_monthly_fee, billing_start, billing_day, status)
    values (p_organization_id, p_player_id, 0, v_sig, 1, 'active') returning * into bp;
  end if;
  v_antes := jsonb_build_object('package', (select code from app.club_packages where id = bp.package_id),
    'fee', bp.base_monthly_fee, 'planId', bp.plan_id, 'feeNote', bp.fee_note, 'billingStart', bp.billing_start);
  v_inicio_antes := bp.billing_start;

  -- Nunca dos veces el mismo mes: si este mes no tiene mensualidad (porque
  -- pagaba por la academia o no pagaba), el paquete empieza el mes que entra.
  if date_trunc('month', bp.billing_start)::date <= v_mes
     and not exists (select 1 from app.charges c where c.organization_id = p_organization_id and c.player_id = p_player_id
                     and c.charge_type = 'monthly_fee' and c.billing_period = v_mes and c.voided_at is null) then
    update app.billing_profiles set billing_start = v_sig where id = bp.id;
  end if;

  update app.billing_profiles
     set package_id = k.id, plan_id = null,
         fee_note = 'Paquete ' || k.name || ': ' || v_motivo, updated_at = now()
   where id = bp.id;

  v_periodo := private.package_target_period(p_organization_id, p_player_id);
  v_precio := private.package_price(k.id, v_periodo);
  if v_precio is null then raise exception '% todavía no tiene precio. Ponle precio en Paquetes.', k.name; end if;

  -- Becas "informativas" de este Tanner: desde hoy descuentan solas.
  update app.player_benefits b
     set calculation_type = case
           when b.benefit_type = 'scholarship_full' or coalesce(b.percentage, 0) >= 100 then 'full_waiver'
           when b.percentage is not null then 'percentage'
           when b.fixed_amount is not null then 'fixed_amount'
           else b.calculation_type end,
         updated_at = now()
   where b.organization_id = p_organization_id and b.player_id = p_player_id and b.active
     and b.calculation_type = 'informational' and b.benefit_type <> 'sponsor_funded';

  v_cuota := private.sync_package_fee(p_organization_id, p_player_id, v_periodo);

  -- Academia de porteros: el paquete de porteros lo inscribe con costo $0 (el
  -- precio va en el paquete); otro paquete lo saca al cierre del mes.
  select a.id into v_gk from app.academies a
  where a.organization_id = p_organization_id and a.academy_type = 'goalkeeper' and a.status = 'active' and a.archived_at is null
  order by a.created_at limit 1;
  select * into v_insc from app.academy_enrollments e
  where e.organization_id = p_organization_id and e.player_id = p_player_id and e.academy_id = v_gk and e.status = 'active'
  order by e.starts_on desc limit 1;
  if k.audience = 'porteros' then
    if v_gk is null then raise exception 'No hay Academia de porteros activa en el club.'; end if;
    if v_insc.id is null then
      insert into app.academy_enrollments(organization_id, academy_id, player_id, starts_on, agreed_fee, status, notes)
      values (p_organization_id, v_gk, p_player_id, v_hoy, 0, 'active', 'Paquete ' || k.name);
    elsif coalesce(v_insc.agreed_fee, -1) <> 0 then
      update app.academy_enrollments set agreed_fee = 0,
        notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'Paquete ' || k.name || ': la academia va incluida en el paquete'), updated_at = now()
      where id = v_insc.id;
    end if;
  elsif v_insc.id is not null then
    update app.academy_enrollments set status = 'cancelled', ends_on = greatest(starts_on, (v_sig - 1)),
      notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'Baja: cambió a paquete ' || k.name), updated_at = now()
    where id = v_insc.id;
  end if;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PlayerPackageSet', 'player', p_player_id,
    jsonb_build_object('before', v_antes, 'package', k.code, 'packageName', k.name, 'price', v_precio, 'fee', v_cuota,
      'from', v_periodo, 'reason', v_motivo), (select auth.uid()));

  return jsonb_build_object('package', k.code, 'packageName', k.name, 'price', v_precio, 'fee', v_cuota, 'from', v_periodo);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Renovar una beca 3 meses
-- ---------------------------------------------------------------------------
create or replace function private.command_renew_benefit(p_organization_id uuid, p_benefit_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare b app.player_benefits%rowtype; v_hoy date := (now() at time zone 'America/Mexico_City')::date; v_desde date; v_hasta date;
  v_motivo text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if not (private.is_presidency(p_organization_id)
          or (private.has_module_access(p_organization_id,'players',true) and private.has_module_access(p_organization_id,'contabilidad',true))) then
    raise exception 'Not authorized';
  end if;
  select * into b from app.player_benefits where id = p_benefit_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Esa beca no existe.'; end if;
  if b.benefit_type = 'sponsor_funded' then raise exception 'Los apoyos de patrocinador se renuevan en Contabilidad.'; end if;
  if not b.active or b.ended_at is not null then raise exception 'Esa beca está suspendida o terminada: no se puede renovar.'; end if;
  -- Del día siguiente al fin (o de este mes si ya venció), 3 meses completos.
  v_desde := date_trunc('month', greatest(coalesce(b.ends_on, v_hoy) + 1, v_hoy))::date;
  v_hasta := (v_desde + interval '3 months - 1 day')::date;
  update app.player_benefits set ends_on = v_hasta, next_review_at = v_hasta,
    calculation_type = case when calculation_type <> 'informational' then calculation_type
                            when benefit_type = 'scholarship_full' or coalesce(percentage,0) >= 100 then 'full_waiver'
                            when percentage is not null then 'percentage'
                            when fixed_amount is not null then 'fixed_amount' else calculation_type end,
    updated_at = now()
  where id = b.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ScholarshipBenefitRenewed', 'player_benefit', b.id,
    jsonb_build_object('playerId', b.player_id, 'endsBefore', b.ends_on, 'endsAfter', v_hasta, 'reason', v_motivo), (select auth.uid()));
  return jsonb_build_object('benefitId', b.id, 'endsOn', v_hasta);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Lecturas
-- ---------------------------------------------------------------------------
create or replace function private.query_club_packages(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_mes date := date_trunc('month', (now() at time zone 'America/Mexico_City')::date)::date;
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting','players'], false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'canEdit', private.is_presidency(p_organization_id),
    'packages', coalesce((select jsonb_agg(jsonb_build_object(
        'code', k.code, 'name', k.name, 'audience', k.audience, 'days', k.days_per_week,
        'goalkeeperDays', k.goalkeeper_days, 'trainsWithCategory', k.trains_with_category,
        'price', private.package_price(k.id, v_mes),
        'nextPrice', private.package_price(k.id, (v_mes + interval '1 month')::date),
        'upcoming', coalesce((select jsonb_agg(jsonb_build_object('fee', pp.monthly_fee, 'from', pp.effective_from) order by pp.effective_from)
                              from app.club_package_prices pp where pp.package_id = k.id and pp.effective_from > v_mes), '[]'::jsonb),
        'players', (select count(*) from app.billing_profiles bp join app.players p on p.id = bp.player_id
                    where bp.package_id = k.id and p.status = 'active' and p.archived_at is null)
      ) order by k.sort_order, k.name) from app.club_packages k where k.organization_id = p_organization_id and k.active), '[]'::jsonb));
end $$;

create or replace function private.command_set_package_price(p_organization_id uuid, p_package_code text, p_monthly_fee numeric, p_effective_from date, p_note text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare k app.club_packages%rowtype; v_desde date := date_trunc('month', p_effective_from)::date;
  v_sig date := (date_trunc('month', (now() at time zone 'America/Mexico_City')::date) + interval '1 month')::date; r record;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into k from app.club_packages where organization_id = p_organization_id and code = p_package_code;
  if not found then raise exception 'Ese paquete no existe en el club.'; end if;
  if p_monthly_fee is null or p_monthly_fee < 0 then raise exception 'Escribe un precio (puede ser 0).'; end if;
  if v_desde is null or v_desde < v_sig then raise exception 'Un precio nuevo cuenta desde el mes que entra o después: lo ya cobrado no cambia.'; end if;
  insert into app.club_package_prices(organization_id, package_id, monthly_fee, effective_from, note, created_by_user_id)
  values (p_organization_id, k.id, p_monthly_fee, v_desde, nullif(btrim(coalesce(p_note,'')), ''), (select auth.uid()))
  on conflict (package_id, effective_from) do update set monthly_fee = excluded.monthly_fee, note = excluded.note,
    created_by_user_id = excluded.created_by_user_id, created_at = now();
  -- La cuota que se ve en pantalla es la del próximo cobro: si ese es el mes
  -- del precio nuevo, ya lo enseña.
  for r in select bp.player_id from app.billing_profiles bp where bp.organization_id = p_organization_id and bp.package_id = k.id loop
    perform private.sync_package_fee(p_organization_id, r.player_id, null);
  end loop;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PackagePriceSet', 'club_package', k.id,
    jsonb_build_object('package', k.code, 'fee', p_monthly_fee, 'from', v_desde, 'note', nullif(btrim(coalesce(p_note,'')), '')), (select auth.uid()));
  return private.query_club_packages(p_organization_id);
end $$;

-- Lo que la pantalla del Tanner necesita: su paquete, cuánto paga y por qué,
-- sus becas (con cuándo vencen) y a qué paquetes se puede cambiar.
create or replace function private.query_player_package(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare bp app.billing_profiles%rowtype; k app.club_packages%rowtype; v_grupo text; v_cat text; v_periodo date; v_precio numeric; v_desc numeric;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date; v_gk record;
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting','players'], false) then raise exception 'Not authorized'; end if;
  select * into bp from app.billing_profiles where organization_id = p_organization_id and player_id = p_player_id;
  if bp.package_id is not null then select * into k from app.club_packages where id = bp.package_id; end if;
  select c.name, private.category_package_group(c.name, c.package_group) into v_cat, v_grupo
  from app.player_enrollments pe join app.categories c on c.id = pe.category_id and c.organization_id = pe.organization_id
  where pe.organization_id = p_organization_id and pe.player_id = p_player_id and pe.status = 'active'
  order by pe.starts_on desc nulls last limit 1;
  v_periodo := private.package_target_period(p_organization_id, p_player_id);
  if k.id is not null then
    v_precio := private.package_price(k.id, v_periodo);
    v_desc := private.package_discount(p_organization_id, p_player_id, v_precio, v_periodo);
  end if;
  select e.id, e.agreed_fee, a.name into v_gk from app.academy_enrollments e join app.academies a on a.id = e.academy_id
  where e.organization_id = p_organization_id and e.player_id = p_player_id and e.status = 'active' and a.academy_type = 'goalkeeper'
  order by e.starts_on desc limit 1;
  return jsonb_build_object(
    'hasPackages', exists (select 1 from app.club_packages x where x.organization_id = p_organization_id and x.active),
    'canEdit', private.is_presidency(p_organization_id),
    'canRenew', private.is_presidency(p_organization_id)
                or (private.has_module_access(p_organization_id,'players',true) and private.has_module_access(p_organization_id,'contabilidad',true)),
    'category', v_cat, 'group', v_grupo, 'period', v_periodo,
    'package', case when k.id is null then null else jsonb_build_object('code', k.code, 'name', k.name, 'audience', k.audience,
                 'days', k.days_per_week, 'goalkeeperDays', k.goalkeeper_days, 'trainsWithCategory', k.trains_with_category) end,
    'price', v_precio, 'discount', v_desc, 'fee', bp.base_monthly_fee, 'feeNote', bp.fee_note,
    'goalkeeperAcademy', case when v_gk.id is null then null else jsonb_build_object('name', v_gk.name, 'fee', v_gk.agreed_fee) end,
    'upcoming', case when k.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('fee', pp.monthly_fee, 'from', pp.effective_from) order by pp.effective_from)
                  from app.club_package_prices pp where pp.package_id = k.id and pp.effective_from > v_periodo), '[]'::jsonb) end,
    'benefits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'type', b.benefit_type, 'calculation', b.calculation_type, 'percentage', b.percentage, 'fixed', b.fixed_amount,
        'source', b.funding_source_name, 'label', b.legacy_label, 'reason', b.notes, 'startsOn', b.starts_on, 'endsOn', b.ends_on,
        'daysLeft', case when b.ends_on is null then null else b.ends_on - v_hoy end,
        'counts', b.benefit_type <> 'sponsor_funded' and b.starts_on <= (v_periodo + interval '1 month - 1 day')::date and (b.ends_on is null or b.ends_on >= v_periodo)
      ) order by b.ends_on nulls last) from app.player_benefits b
      where b.organization_id = p_organization_id and b.player_id = p_player_id and b.active and b.ended_at is null), '[]'::jsonb),
    'options', coalesce((select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'audience', x.audience, 'days', x.days_per_week,
        'goalkeeperDays', x.goalkeeper_days, 'trainsWithCategory', x.trains_with_category,
        'price', private.package_price(x.id, v_periodo)) order by x.sort_order)
      from app.club_packages x where x.organization_id = p_organization_id and x.active
        and (x.audience = 'porteros' or x.audience = v_grupo)), '[]'::jsonb));
end $$;

-- La propuesta para poner paquete a todos de una vez: qué paquete le toca a
-- cada Tanner con lo que ya paga hoy, y si su monto cambiaría.
create or replace function private.query_package_proposal(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_mes date := date_trunc('month', (now() at time zone 'America/Mexico_City')::date)::date; v_sig date;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Not authorized'; end if;
  v_sig := (v_mes + interval '1 month')::date;
  return coalesce((
    with base as (
      select p.id, p.first_name, p.last_name, c.name as categoria, private.category_package_group(c.name, c.package_group) as grupo,
             bp.base_monthly_fee as cuota, bp.package_id, bp.needs_review, bp.status as perfil,
             (select e.agreed_fee from app.academy_enrollments e join app.academies a on a.id = e.academy_id
              where e.player_id = p.id and e.organization_id = p.organization_id and e.status = 'active' and a.academy_type = 'goalkeeper' limit 1) as porteros_fee,
             exists (select 1 from app.academy_enrollments e join app.academies a on a.id = e.academy_id
              where e.player_id = p.id and e.organization_id = p.organization_id and e.status = 'active' and a.academy_type = 'goalkeeper') as en_porteros,
             exists (select 1 from app.player_benefits b where b.player_id = p.id and b.organization_id = p.organization_id and b.active and b.ended_at is null
                     and b.benefit_type <> 'sponsor_funded' and (b.benefit_type = 'scholarship_full' or b.calculation_type = 'full_waiver' or coalesce(b.percentage,0) >= 100)) as beca_total
      from app.players p
      left join lateral (select pe.category_id from app.player_enrollments pe where pe.player_id = p.id and pe.organization_id = p.organization_id and pe.status = 'active'
                         order by pe.starts_on desc nulls last limit 1) pe on true
      left join app.categories c on c.id = pe.category_id
      left join app.billing_profiles bp on bp.player_id = p.id and bp.organization_id = p.organization_id
      where p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null
    ), sug as (
      select b.*, case
          when b.en_porteros and coalesce(b.cuota,0) = 0 and not b.beca_total then 'porteros_2'
          when b.en_porteros then 'porteros_4'
          when b.grupo = 'baby' then 'baby_3'
          when b.grupo = 'tanner' then 'tanner_4' end as codigo
      from base b
    ), cal as (
      select s.*, k.id as pkg, k.name as paquete, private.package_price(k.id, v_sig) as precio,
             coalesce(s.cuota,0) + case when s.en_porteros then coalesce(s.porteros_fee,0) else 0 end as paga_hoy
      from sug s left join app.club_packages k on k.organization_id = p_organization_id and k.code = s.codigo
    )
    select jsonb_agg(jsonb_build_object(
        'playerId', c.id, 'name', concat_ws(' ', c.first_name, c.last_name), 'category', c.categoria,
        'current', c.paga_hoy, 'package', c.codigo, 'packageName', c.paquete, 'price', c.precio,
        'discount', case when c.precio is null then null else private.package_discount(p_organization_id, c.id, c.precio, v_sig) end,
        'fee', case when c.precio is null then null else greatest(0, c.precio - private.package_discount(p_organization_id, c.id, c.precio, v_sig)) end,
        'alreadySet', c.package_id is not null,
        'blocked', case when c.categoria is null then 'Sin categoría'
                        when c.perfil is not null and c.perfil <> 'active' then 'Cobro en pausa'
                        when c.needs_review then 'Cobro en revisión'
                        when c.precio is null then 'El paquete no tiene precio' end
      ) order by c.categoria nulls last, c.first_name, c.last_name)
    from cal c), '[]'::jsonb);
end $$;

create or replace function private.query_goalkeepers(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
begin
  if not private.has_any_module_access(p_organization_id, array['players','academies','billing'], false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', concat_ws(' ', p.first_name, p.last_name), 'category', c.name, 'position', p.position,
      'photoBucket', p.photo_bucket, 'photoThumbPath', coalesce(p.photo_thumb_path, p.photo_path),
      'package', k.code, 'packageName', k.name, 'fee', bp.base_monthly_fee,
      'inAcademy', gk.id is not null, 'academyFee', gk.agreed_fee,
      'balance', coalesce((select sum(cb.balance_due) from app.charge_balances cb where cb.organization_id = p.organization_id and cb.player_id = p.id and cb.balance_due > 0), 0)
    ) order by (gk.id is null), p.first_name, p.last_name)
    from app.players p
    left join lateral (select pe.category_id from app.player_enrollments pe where pe.player_id = p.id and pe.organization_id = p.organization_id and pe.status = 'active'
                       order by pe.starts_on desc nulls last limit 1) pe on true
    left join app.categories c on c.id = pe.category_id
    left join app.billing_profiles bp on bp.player_id = p.id and bp.organization_id = p.organization_id
    left join app.club_packages k on k.id = bp.package_id
    left join lateral (select e.id, e.agreed_fee from app.academy_enrollments e join app.academies a on a.id = e.academy_id
                       where e.player_id = p.id and e.organization_id = p.organization_id and e.status = 'active' and a.academy_type = 'goalkeeper'
                       order by e.starts_on desc limit 1) gk on true
    where p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null
      and (gk.id is not null or k.audience = 'porteros' or p.position ilike 'porter%')
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Lo que llama la app
-- ---------------------------------------------------------------------------
create or replace function public.v2_club_packages(organization_id uuid)
returns jsonb language sql stable security definer set search_path to ''
as $$ select private.query_club_packages(organization_id) $$;
create or replace function public.v2_set_package_price(organization_id uuid, package_code text, monthly_fee numeric, effective_from date, note text default null)
returns jsonb language sql security definer set search_path to ''
as $$ select private.command_set_package_price(organization_id, package_code, monthly_fee, effective_from, note) $$;
create or replace function public.v2_player_package(organization_id uuid, player_id uuid)
returns jsonb language sql stable security definer set search_path to ''
as $$ select private.query_player_package(organization_id, player_id) $$;
create or replace function public.v2_set_player_package(organization_id uuid, player_id uuid, package_code text, reason text)
returns jsonb language sql security definer set search_path to ''
as $$ select private.command_set_player_package(organization_id, player_id, package_code, reason) $$;
create or replace function public.v2_package_proposal(organization_id uuid)
returns jsonb language sql stable security definer set search_path to ''
as $$ select private.query_package_proposal(organization_id) $$;
-- Aplicar la propuesta aprobada: una lista {playerId, package}; todo o nada.
create or replace function public.v2_apply_package_proposal(organization_id uuid, items jsonb, reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare it jsonb; v_n integer := 0;
begin
  if not private.is_presidency(organization_id) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'No hay Tanners para aplicar.'; end if;
  for it in select * from jsonb_array_elements(items) loop
    perform private.command_set_player_package(organization_id, (it->>'playerId')::uuid, it->>'package', reason);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('applied', v_n);
end $$;
create or replace function public.v2_renew_benefit(organization_id uuid, benefit_id uuid, reason text default null)
returns jsonb language sql security definer set search_path to ''
as $$ select private.command_renew_benefit(organization_id, benefit_id, reason) $$;
create or replace function public.v2_goalkeepers(organization_id uuid)
returns jsonb language sql stable security definer set search_path to ''
as $$ select private.query_goalkeepers(organization_id) $$;

revoke all on function public.v2_club_packages(uuid) from public, anon;
revoke all on function public.v2_set_package_price(uuid, text, numeric, date, text) from public, anon;
revoke all on function public.v2_player_package(uuid, uuid) from public, anon;
revoke all on function public.v2_set_player_package(uuid, uuid, text, text) from public, anon;
revoke all on function public.v2_package_proposal(uuid) from public, anon;
revoke all on function public.v2_apply_package_proposal(uuid, jsonb, text) from public, anon;
revoke all on function public.v2_renew_benefit(uuid, uuid, text) from public, anon;
revoke all on function public.v2_goalkeepers(uuid) from public, anon;
grant execute on function public.v2_club_packages(uuid) to authenticated;
grant execute on function public.v2_set_package_price(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.v2_player_package(uuid, uuid) to authenticated;
grant execute on function public.v2_set_player_package(uuid, uuid, text, text) to authenticated;
grant execute on function public.v2_package_proposal(uuid) to authenticated;
grant execute on function public.v2_apply_package_proposal(uuid, jsonb, text) to authenticated;
grant execute on function public.v2_renew_benefit(uuid, uuid, text) to authenticated;
grant execute on function public.v2_goalkeepers(uuid) to authenticated;

revoke all on function private.package_price(uuid, date) from public, anon, authenticated;
revoke all on function private.package_discount(uuid, uuid, numeric, date) from public, anon, authenticated;
revoke all on function private.package_target_period(uuid, uuid) from public, anon, authenticated;
revoke all on function private.sync_package_fee(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.sync_package_fees(uuid, date) from public, anon, authenticated;
revoke all on function private.command_set_player_package(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.command_renew_benefit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.command_set_package_price(uuid, text, numeric, date, text) from public, anon, authenticated;
revoke all on function private.query_club_packages(uuid) from public, anon, authenticated;
revoke all on function private.query_player_package(uuid, uuid) from public, anon, authenticated;
revoke all on function private.query_package_proposal(uuid) from public, anon, authenticated;
revoke all on function private.query_goalkeepers(uuid) from public, anon, authenticated;
